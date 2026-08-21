(function (global) {
  const STORAGE_KEY = "vocab-tracker:v1";
  const SETTINGS_KEY = "vocab-tracker:settings:v1";

  function nowIso() {
    return new Date().toISOString();
  }

  function uid() {
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function defaultSettings() {
    return {
      recommendMode: "least",
      learnFilter: "recommend",
      manageFilter: "all",
      seedVersion: 0,
      storySize: 8,
      storySession: {
        itemIds: [],
        selectedIds: [],
        mode: "least",
        size: 8,
      },
    };
  }

  /**
   * 将种子库合并进本地数据：
   * - 缺失的种子条目：追加
   * - 已有同 id：更新 title/type/content/prompt，保留 usages / archived / createdAt
   */
  function mergeSeed(items) {
    const seed = (global.VOCAB_SEED || []).map(normalizeItem);
    const byId = new Map(items.map((item) => [item.id, item]));
    let changed = false;

    seed.forEach((seedItem) => {
      const existing = byId.get(seedItem.id);
      if (!existing) {
        items.push(seedItem);
        byId.set(seedItem.id, seedItem);
        changed = true;
        return;
      }
      const next = {
        ...existing,
        type: seedItem.type,
        title: seedItem.title,
        content: seedItem.content,
        prompt: seedItem.prompt,
      };
      if (
        existing.type !== next.type ||
        existing.title !== next.title ||
        existing.content !== next.content ||
        existing.prompt !== next.prompt
      ) {
        next.updatedAt = nowIso();
        Object.assign(existing, next);
        changed = true;
      }
    });

    return changed;
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return defaultSettings();
      return { ...defaultSettings(), ...JSON.parse(raw) };
    } catch {
      return defaultSettings();
    }
  }

  function saveSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function normalizeItem(item) {
    return {
      id: item.id || uid(),
      type: item.type || "word",
      title: (item.title || "").trim(),
      content: item.content || "",
      prompt: item.prompt || "",
      createdAt: item.createdAt || nowIso(),
      updatedAt: item.updatedAt || item.createdAt || nowIso(),
      usages: Array.isArray(item.usages)
        ? item.usages
            .map((u) => (typeof u === "string" ? { at: u } : { at: u.at }))
            .filter((u) => u.at)
        : [],
      archived: Boolean(item.archived),
    };
  }

  function loadItems() {
    const targetSeedVersion = global.VOCAB_SEED_VERSION || 1;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const seeded = (global.VOCAB_SEED || []).map(normalizeItem);
        saveItems(seeded);
        const settings = loadSettings();
        settings.seedVersion = targetSeedVersion;
        saveSettings(settings);
        return seeded;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      const items = parsed.map(normalizeItem);
      const settings = loadSettings();
      const needMerge = (settings.seedVersion || 0) < targetSeedVersion;
      if (needMerge || items.length === 0) {
        const changed = mergeSeed(items) || items.length === 0;
        if (changed || needMerge) {
          saveItems(items);
          settings.seedVersion = targetSeedVersion;
          saveSettings(settings);
        }
      }
      return items;
    } catch {
      return (global.VOCAB_SEED || []).map(normalizeItem);
    }
  }

  function saveItems(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  function exportPayload(items, settings) {
    return {
      version: 1,
      exportedAt: nowIso(),
      settings,
      items,
    };
  }

  function importPayload(payload) {
    if (!payload || !Array.isArray(payload.items)) {
      throw new Error("无效的导入文件：缺少 items 数组");
    }
    const items = payload.items.map(normalizeItem);
    saveItems(items);
    if (payload.settings && typeof payload.settings === "object") {
      saveSettings({ ...defaultSettings(), ...payload.settings });
    }
    return items;
  }

  function mergeUsages(a, b) {
    const set = new Set();
    (a || []).forEach((u) => {
      if (u && u.at) set.add(u.at);
    });
    (b || []).forEach((u) => {
      if (u && u.at) set.add(u.at);
    });
    return Array.from(set)
      .sort()
      .map((at) => ({ at }));
  }

  /** 按 id 合并词条：文案取较新 updatedAt，usages 按时间戳去重并集 */
  function mergeItems(localItems, remoteItems) {
    const byId = new Map();

    function ingest(raw) {
      const item = normalizeItem(raw);
      const existing = byId.get(item.id);
      if (!existing) {
        byId.set(item.id, item);
        return;
      }
      const existingTime = new Date(existing.updatedAt).getTime() || 0;
      const nextTime = new Date(item.updatedAt).getTime() || 0;
      const newer = nextTime >= existingTime ? item : existing;
      const older = newer === item ? existing : item;
      byId.set(item.id, normalizeItem({
        ...older,
        ...newer,
        createdAt:
          new Date(older.createdAt) <= new Date(newer.createdAt)
            ? older.createdAt
            : newer.createdAt,
        usages: mergeUsages(existing.usages, item.usages),
        archived: newer.archived,
      }));
    }

    (localItems || []).forEach(ingest);
    (remoteItems || []).forEach(ingest);
    return Array.from(byId.values());
  }

  function mergeSettings(localSettings, remoteSettings) {
    return {
      ...defaultSettings(),
      ...(remoteSettings && typeof remoteSettings === "object" ? remoteSettings : {}),
      ...(localSettings && typeof localSettings === "object" ? localSettings : {}),
    };
  }

  global.VocabStorage = {
    STORAGE_KEY,
    nowIso,
    uid,
    defaultSettings,
    loadSettings,
    saveSettings,
    loadItems,
    saveItems,
    normalizeItem,
    mergeSeed,
    mergeItems,
    mergeSettings,
    exportPayload,
    importPayload,
  };
})(window);
