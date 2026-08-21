(function (global) {
  const TABLE = "vocab_snapshots";
  const PUSH_DEBOUNCE_MS = 600;

  let client = null;
  let user = null;
  let pushTimer = null;
  let pushing = false;
  let pendingPush = null;
  let listeners = [];

  function emit(event, payload) {
    listeners.forEach((fn) => {
      try {
        fn(event, payload);
      } catch (err) {
        console.error(err);
      }
    });
  }

  function onChange(fn) {
    listeners.push(fn);
    return () => {
      listeners = listeners.filter((x) => x !== fn);
    };
  }

  function isConfigured() {
    const cfg = global.VocabConfig || {};
    return Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey);
  }

  function getClient() {
    if (client) return client;
    if (!isConfigured()) return null;
    if (!global.supabase || typeof global.supabase.createClient !== "function") {
      console.error("Supabase SDK 未加载");
      return null;
    }
    const cfg = global.VocabConfig;
    client = global.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    return client;
  }

  function getUser() {
    return user;
  }

  function isSignedIn() {
    return Boolean(user);
  }

  function redirectTo() {
    return window.location.origin + window.location.pathname;
  }

  async function init() {
    const sb = getClient();
    if (!sb) {
      emit("status", { signedIn: false, reason: "unconfigured" });
      return { user: null };
    }

    const {
      data: { session },
    } = await sb.auth.getSession();
    user = session && session.user ? session.user : null;

    sb.auth.onAuthStateChange((event, nextSession) => {
      user = nextSession && nextSession.user ? nextSession.user : null;
      // INITIAL_SESSION 由 boot 主动 reconcile，避免重复
      if (event === "INITIAL_SESSION") return;
      emit("auth", { user });
    });

    return { user };
  }

  async function signInWithEmail(email) {
    const sb = getClient();
    if (!sb) throw new Error("未配置 Supabase");
    const trimmed = String(email || "").trim();
    if (!trimmed) throw new Error("请输入邮箱");

    const { error } = await sb.auth.signInWithOtp({
      email: trimmed,
      options: {
        emailRedirectTo: redirectTo(),
      },
    });
    if (error) throw error;
  }

  async function signOut() {
    const sb = getClient();
    if (!sb) return;
    const { error } = await sb.auth.signOut();
    if (error) throw error;
    user = null;
  }

  async function fetchRemote() {
    const sb = getClient();
    if (!sb || !user) return null;

    const { data, error } = await sb
      .from(TABLE)
      .select("items, settings, updated_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  async function pushSnapshot(items, settings) {
    const sb = getClient();
    if (!sb || !user) return null;

    const payload = {
      user_id: user.id,
      items: items || [],
      settings: settings || {},
      updated_at: global.VocabStorage.nowIso(),
    };

    const { data, error } = await sb
      .from(TABLE)
      .upsert(payload, { onConflict: "user_id" })
      .select("updated_at")
      .single();

    if (error) throw error;
    return data;
  }

  function schedulePush(items, settings) {
    if (!isSignedIn()) return;
    pendingPush = { items, settings };
    clearTimeout(pushTimer);
    pushTimer = setTimeout(flushPush, PUSH_DEBOUNCE_MS);
  }

  async function flushPush() {
    if (!pendingPush || !isSignedIn() || pushing) return;
    const snapshot = pendingPush;
    pendingPush = null;
    pushing = true;
    emit("sync", { state: "saving" });
    try {
      await pushSnapshot(snapshot.items, snapshot.settings);
      emit("sync", { state: "saved", at: global.VocabStorage.nowIso() });
    } catch (err) {
      console.error(err);
      emit("sync", { state: "error", error: err });
      pendingPush = snapshot;
      clearTimeout(pushTimer);
      pushTimer = setTimeout(flushPush, 2500);
    } finally {
      pushing = false;
      if (pendingPush) {
        clearTimeout(pushTimer);
        pushTimer = setTimeout(flushPush, PUSH_DEBOUNCE_MS);
      }
    }
  }

  function countUsages(items) {
    return (items || []).reduce(
      (sum, item) => sum + (Array.isArray(item.usages) ? item.usages.length : 0),
      0
    );
  }

  function hasOnlySeedLocal(localItems, remoteItems) {
    const remoteById = new Map((remoteItems || []).map((i) => [i.id, i]));
    return (localItems || []).every((item) => {
      const remote = remoteById.get(item.id);
      if (!remote) return false;
      return !item.usages || item.usages.length === 0;
    });
  }

  /**
   * 登录后对齐本地与云端：
   * - 仅本地有 → 上传
   * - 仅云端有 / 本地几乎无学习痕迹 → 拉下
   * - 两边都有真实数据 → 合并后写回
   */
  async function reconcile(localItems, localSettings) {
    if (!isSignedIn()) {
      return { items: localItems, settings: localSettings, action: "local-only" };
    }

    const remote = await fetchRemote();
    const hasLocal = (localItems || []).length > 0;
    const hasRemote =
      remote && Array.isArray(remote.items) && remote.items.length > 0;
    const remoteCount = hasRemote ? countUsages(remote.items) : 0;

    if (!hasRemote) {
      await pushSnapshot(localItems, localSettings);
      return {
        items: localItems,
        settings: localSettings,
        action: "uploaded",
      };
    }

    const preferRemote =
      !hasLocal ||
      (remoteCount > 0 && hasOnlySeedLocal(localItems, remote.items));

    if (preferRemote) {
      const items = remote.items.map(global.VocabStorage.normalizeItem);
      const settings = global.VocabStorage.mergeSettings(
        global.VocabStorage.defaultSettings(),
        remote.settings || {}
      );
      global.VocabStorage.mergeSeed(items);
      global.VocabStorage.saveItems(items);
      global.VocabStorage.saveSettings(settings);
      await pushSnapshot(items, settings);
      return { items, settings, action: "downloaded" };
    }

    const mergedItems = global.VocabStorage.mergeItems(localItems, remote.items);
    const mergedSettings = global.VocabStorage.mergeSettings(
      localSettings,
      remote.settings || {}
    );
    global.VocabStorage.mergeSeed(mergedItems);
    global.VocabStorage.saveItems(mergedItems);
    global.VocabStorage.saveSettings(mergedSettings);
    await pushSnapshot(mergedItems, mergedSettings);
    return {
      items: mergedItems,
      settings: mergedSettings,
      action: "merged",
    };
  }

  global.VocabSync = {
    isConfigured,
    init,
    getUser,
    isSignedIn,
    signInWithEmail,
    signOut,
    schedulePush,
    flushPush,
    reconcile,
    fetchRemote,
    pushSnapshot,
    onChange,
    countUsages,
  };
})(window);
