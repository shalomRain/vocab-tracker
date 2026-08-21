(function () {
  const TYPE_LABEL = {
    word: "单词",
    phrase: "短语",
    conjunction: "连词",
    grammar: "语法",
  };

  const DEFAULT_PROMPTS = {
    word: (t) => `用「${t}」造一个包含情境的句子。`,
    phrase: (t) => `用「${t}」写 1～2 句相关表达。`,
    conjunction: (t) => `用「${t}」串联一小段叙述。`,
    grammar: (t) => `围绕「${t}」造句或讲一个短故事，刻意用到该语法点。`,
  };

  function normalizeStorySession(session, fallback) {
    const base = fallback || { itemIds: [], selectedIds: [], mode: "least", size: 8 };
    if (!session || typeof session !== "object") return { ...base };
    return {
      itemIds: Array.isArray(session.itemIds) ? session.itemIds.slice() : [],
      selectedIds: Array.isArray(session.selectedIds) ? session.selectedIds.slice() : [],
      mode: session.mode || base.mode,
      size: Number(session.size) > 0 ? Number(session.size) : base.size,
    };
  }

  const state = {
    items: VocabStorage.loadItems(),
    settings: VocabStorage.loadSettings(),
    timelineItemId: null,
  };

  state.settings.storySize = Math.min(
    50,
    Math.max(1, Number(state.settings.storySize) || 8)
  );
  state.settings.storySession = normalizeStorySession(state.settings.storySession, {
    itemIds: [],
    selectedIds: [],
    mode: state.settings.recommendMode,
    size: state.settings.storySize,
  });

  const el = {
    viewBtns: document.querySelectorAll(".view-btn"),
    viewLearn: document.getElementById("view-learn"),
    viewManage: document.getElementById("view-manage"),
    learnTabs: document.getElementById("learn-tabs"),
    learnList: document.getElementById("learn-list"),
    storyDeck: document.getElementById("story-deck"),
    learnHint: document.getElementById("learn-hint"),
    recommendModeWrap: document.getElementById("recommend-mode-wrap"),
    recommendMode: document.getElementById("recommend-mode"),
    storyControls: document.getElementById("story-controls"),
    storySize: document.getElementById("story-size"),
    btnStoryRedraw: document.getElementById("btn-story-redraw"),
    btnStoryClear: document.getElementById("btn-story-clear"),
    btnStoryConfirm: document.getElementById("btn-story-confirm"),
    manageTabs: document.getElementById("manage-tabs"),
    manageTbody: document.getElementById("manage-tbody"),
    form: document.getElementById("item-form"),
    formTitle: document.getElementById("form-title"),
    formId: document.getElementById("form-id"),
    formType: document.getElementById("form-type"),
    formTitleInput: document.getElementById("form-title-input"),
    formContent: document.getElementById("form-content"),
    formPrompt: document.getElementById("form-prompt"),
    formMeta: document.getElementById("form-meta"),
    formReset: document.getElementById("form-reset"),
    btnExport: document.getElementById("btn-export"),
    inputImport: document.getElementById("input-import"),
    timelineDialog: document.getElementById("timeline-dialog"),
    timelineTitle: document.getElementById("timeline-title"),
    timelineSummary: document.getElementById("timeline-summary"),
    timelineList: document.getElementById("timeline-list"),
    btnUndoUsage: document.getElementById("btn-undo-usage"),
    toast: document.getElementById("toast"),
  };

  let toastTimer = null;

  function persist() {
    VocabStorage.saveItems(state.items);
    VocabStorage.saveSettings(state.settings);
  }

  function toast(message) {
    el.toast.textContent = message;
    el.toast.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove("is-show"), 2200);
  }

  function formatDateTime(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${day} ${hh}:${mm}`;
  }

  function usageCount(item) {
    return item.usages.length;
  }

  function lastUsedAt(item) {
    if (!item.usages.length) return null;
    return item.usages[item.usages.length - 1].at;
  }

  function daysSince(iso) {
    if (!iso) return Number.POSITIVE_INFINITY;
    const ms = Date.now() - new Date(iso).getTime();
    return ms / (1000 * 60 * 60 * 24);
  }

  function activeItems() {
    return state.items.filter((i) => !i.archived);
  }

  function findById(id) {
    return state.items.find((i) => i.id === id);
  }

  function modeLabel(mode) {
    if (mode === "stale") return "久未复习优先";
    if (mode === "frequent") return "高频巩固";
    return "少用优先";
  }

  function sortRecommend(items, mode) {
    const list = items.slice();
    if (mode === "frequent") {
      list.sort((a, b) => {
        const diff = usageCount(b) - usageCount(a);
        if (diff !== 0) return diff;
        return new Date(a.createdAt) - new Date(b.createdAt);
      });
      return list;
    }
    if (mode === "stale") {
      list.sort((a, b) => {
        const aLast = lastUsedAt(a);
        const bLast = lastUsedAt(b);
        const aNever = !aLast;
        const bNever = !bLast;
        if (aNever && !bNever) return -1;
        if (!aNever && bNever) return 1;
        if (aNever && bNever) {
          return new Date(a.createdAt) - new Date(b.createdAt);
        }
        return daysSince(bLast) - daysSince(aLast);
      });
      return list;
    }
    list.sort((a, b) => {
      const diff = usageCount(a) - usageCount(b);
      if (diff !== 0) return diff;
      return new Date(a.createdAt) - new Date(b.createdAt);
    });
    return list;
  }

  function clampStorySize(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 8;
    return Math.min(50, Math.max(1, Math.round(n)));
  }

  function readStorySizeFromInput() {
    const size = clampStorySize(el.storySize.value);
    el.storySize.value = String(size);
    state.settings.storySize = size;
    return size;
  }

  function drawStoryDeck(options) {
    const opts = options || {};
    const keepSelection = Boolean(opts.keepSelection);
    const size = readStorySizeFromInput();
    const mode = state.settings.recommendMode;
    const ranked = sortRecommend(activeItems(), mode);
    const itemIds = ranked.slice(0, size).map((item) => item.id);
    const prevSelected = new Set(state.settings.storySession.selectedIds || []);
    state.settings.storySession = {
      itemIds,
      selectedIds: keepSelection
        ? itemIds.filter((id) => prevSelected.has(id))
        : [],
      mode,
      size,
    };
    persist();
  }

  function ensureStoryDeck() {
    const session = state.settings.storySession;
    const size = clampStorySize(state.settings.storySize);
    const needsDraw =
      !session.itemIds.length ||
      session.mode !== state.settings.recommendMode ||
      session.size !== size ||
      session.itemIds.some((id) => !findById(id) || findById(id).archived);

    if (needsDraw) {
      drawStoryDeck({ keepSelection: false });
    }
  }

  function getLearnItems() {
    const filter = state.settings.learnFilter;
    const base = activeItems();
    if (filter === "recommend") {
      return sortRecommend(base, state.settings.recommendMode).slice(0, 10);
    }
    if (filter === "story") return [];
    return base
      .filter((i) => i.type === filter)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  function getStoryItems() {
    return state.settings.storySession.itemIds
      .map((id) => findById(id))
      .filter((item) => item && !item.archived);
  }

  function promptText(item) {
    if (item.prompt && item.prompt.trim()) return item.prompt.trim();
    const factory = DEFAULT_PROMPTS[item.type];
    return factory ? factory(item.title) : `练习使用「${item.title}」。`;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderStory() {
    ensureStoryDeck();
    const items = getStoryItems();
    const selected = new Set(state.settings.storySession.selectedIds);
    const selectedCount = items.filter((item) => selected.has(item.id)).length;

    el.learnHint.textContent = `故事模式 · 策略：${modeLabel(
      state.settings.recommendMode
    )} · 本局 ${items.length} 词 · 已高亮 ${selectedCount} · 点选高亮，讲完再点「确认使用」`;

    if (!items.length) {
      el.storyDeck.innerHTML =
        '<div class="empty">暂无可用词条。去「管理」添加，或确认未全部归档。</div>';
      return;
    }

    el.storyDeck.innerHTML = items
      .map((item) => {
        const isSelected = selected.has(item.id);
        return `
          <button
            type="button"
            class="story-tile${isSelected ? " is-selected" : ""}"
            data-id="${escapeHtml(item.id)}"
            aria-pressed="${isSelected ? "true" : "false"}"
          >
            <span class="story-tile-check" aria-hidden="true">✓</span>
            <span class="story-tile-title">${escapeHtml(item.title)}</span>
            <span class="story-tile-type">${TYPE_LABEL[item.type] || item.type}</span>
          </button>
        `;
      })
      .join("");
  }

  function renderDetailCards(items, isRecommend) {
    if (isRecommend) {
      el.learnHint.textContent = `推荐策略：${modeLabel(
        state.settings.recommendMode
      )} · 展示前 ${items.length} 条，便于针对单卡造句。`;
    } else {
      el.learnHint.textContent = `当前分类：${
        TYPE_LABEL[state.settings.learnFilter] || ""
      } · 共 ${items.length} 条`;
    }

    if (!items.length) {
      el.learnList.innerHTML =
        '<div class="empty">暂无词条。去「管理」添加，或确认未全部归档。</div>';
      return;
    }

    el.learnList.innerHTML = items
      .map((item) => {
        const count = usageCount(item);
        const last = lastUsedAt(item);
        const content = item.content
          ? `<p class="item-content">${escapeHtml(item.content)}</p>`
          : "";
        return `
          <article class="item-card" data-id="${escapeHtml(item.id)}">
            <div class="item-card-head">
              <h3 class="item-title">${escapeHtml(item.title)}</h3>
              <span class="item-type">${TYPE_LABEL[item.type] || item.type}</span>
            </div>
            ${content}
            <p class="item-prompt">${escapeHtml(promptText(item))}</p>
            <div class="item-meta">
              <span>使用 ${count} 次</span>
              <span>最近 ${last ? formatDateTime(last) : "从未使用"}</span>
              <span>创建 ${formatDateTime(item.createdAt)}</span>
            </div>
            <div class="item-actions">
              <button type="button" class="mark-btn" data-action="mark">本次已使用</button>
              <button type="button" class="ghost-btn" data-action="timeline">查看时间线</button>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function renderLearn() {
    const filter = state.settings.learnFilter;
    const isRecommend = filter === "recommend";
    const isStory = filter === "story";

    el.recommendModeWrap.hidden = !(isRecommend || isStory);
    el.storyControls.hidden = !isStory;
    el.recommendMode.value = state.settings.recommendMode;
    el.storySize.value = String(clampStorySize(state.settings.storySize));

    el.learnTabs.querySelectorAll(".tab").forEach((tab) => {
      tab.classList.toggle("is-active", tab.dataset.filter === filter);
    });

    el.learnList.hidden = isStory;
    el.storyDeck.hidden = !isStory;

    if (isStory) {
      el.learnList.innerHTML = "";
      renderStory();
      return;
    }

    el.storyDeck.innerHTML = "";
    renderDetailCards(getLearnItems(), isRecommend);
  }

  function getManageItems() {
    const filter = state.settings.manageFilter;
    if (filter === "archived") {
      return state.items.filter((i) => i.archived);
    }
    if (filter === "all") {
      return state.items.filter((i) => !i.archived);
    }
    return state.items.filter((i) => !i.archived && i.type === filter);
  }

  function renderManage() {
    el.manageTabs.querySelectorAll(".tab").forEach((tab) => {
      tab.classList.toggle(
        "is-active",
        tab.dataset.manageFilter === state.settings.manageFilter
      );
    });

    const items = getManageItems().sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    if (!items.length) {
      el.manageTbody.innerHTML =
        '<tr><td colspan="5" style="color:var(--muted);padding:24px 8px;">暂无数据</td></tr>';
      return;
    }

    el.manageTbody.innerHTML = items
      .map((item) => {
        const archivedBadge = item.archived
          ? '<span class="badge-archived">已归档</span>'
          : "";
        const actions = item.archived
          ? `
            <button type="button" class="link-btn" data-action="restore" data-id="${escapeHtml(item.id)}">恢复</button>
            <button type="button" class="link-btn" data-action="edit" data-id="${escapeHtml(item.id)}">编辑</button>
          `
          : `
            <button type="button" class="link-btn" data-action="edit" data-id="${escapeHtml(item.id)}">编辑</button>
            <button type="button" class="link-btn warn" data-action="archive" data-id="${escapeHtml(item.id)}">归档</button>
          `;
        return `
          <tr>
            <td>${escapeHtml(item.title)}${archivedBadge}</td>
            <td>${TYPE_LABEL[item.type] || item.type}</td>
            <td>${usageCount(item)}</td>
            <td>${formatDateTime(item.createdAt)}</td>
            <td><div class="row-actions">${actions}</div></td>
          </tr>
        `;
      })
      .join("");
  }

  function renderAll() {
    renderLearn();
    renderManage();
  }

  function setView(view) {
    const isLearn = view === "learn";
    el.viewLearn.classList.toggle("is-active", isLearn);
    el.viewManage.classList.toggle("is-active", !isLearn);
    el.viewBtns.forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.view === view);
    });
  }

  function resetForm() {
    el.form.reset();
    el.formId.value = "";
    el.formTitle.textContent = "新增词条";
    el.formMeta.textContent = "";
    el.formType.value = "word";
  }

  function fillForm(item) {
    el.formId.value = item.id;
    el.formType.value = item.type;
    el.formTitleInput.value = item.title;
    el.formContent.value = item.content;
    el.formPrompt.value = item.prompt;
    el.formTitle.textContent = "编辑词条";
    el.formMeta.textContent = `创建于 ${formatDateTime(item.createdAt)} · 已使用 ${usageCount(item)} 次${
      item.archived ? " · 已归档" : ""
    }`;
  }

  function markUsed(id) {
    const item = findById(id);
    if (!item || item.archived) return;
    item.usages.push({ at: VocabStorage.nowIso() });
    item.updatedAt = VocabStorage.nowIso();
    persist();
    renderAll();
    toast(`已记录「${item.title}」的一次使用`);
  }

  function toggleStorySelect(id) {
    const session = state.settings.storySession;
    if (!session.itemIds.includes(id)) return;
    const set = new Set(session.selectedIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    session.selectedIds = Array.from(set);
    persist();
    renderStory();
  }

  function clearStorySelection() {
    state.settings.storySession.selectedIds = [];
    persist();
    renderStory();
    toast("已清空高亮");
  }

  function confirmStoryUsage() {
    const selectedIds = state.settings.storySession.selectedIds.slice();
    if (!selectedIds.length) {
      toast("请先点选用过的词牌");
      return;
    }
    const now = VocabStorage.nowIso();
    let count = 0;
    selectedIds.forEach((id) => {
      const item = findById(id);
      if (!item || item.archived) return;
      item.usages.push({ at: now });
      item.updatedAt = now;
      count += 1;
    });
    state.settings.storySession.selectedIds = [];
    persist();
    renderAll();
    toast(`已确认 ${count} 个词的使用记录`);
  }

  function openTimeline(id) {
    const item = findById(id);
    if (!item) return;
    state.timelineItemId = id;
    el.timelineTitle.textContent = item.title;
    const count = usageCount(item);
    el.timelineSummary.textContent =
      count === 0
        ? "尚未记录使用。点击「本次已使用」或故事模式「确认使用」后，时间会累计在这里。"
        : `共使用 ${count} 次（真实频率，同一天多次也会分别记录）。`;
    if (!count) {
      el.timelineList.innerHTML = "<li>暂无记录</li>";
    } else {
      el.timelineList.innerHTML = item.usages
        .slice()
        .reverse()
        .map((u, idx) => {
          const n = count - idx;
          return `<li>#${n} · ${formatDateTime(u.at)}</li>`;
        })
        .join("");
    }
    el.timelineDialog.showModal();
  }

  function undoLastUsage() {
    const item = findById(state.timelineItemId);
    if (!item || !item.usages.length) {
      toast("没有可撤销的记录");
      return;
    }
    item.usages.pop();
    item.updatedAt = VocabStorage.nowIso();
    persist();
    openTimeline(item.id);
    renderAll();
    toast("已撤销最近一次使用");
  }

  function archiveItem(id) {
    const item = findById(id);
    if (!item) return;
    if (!confirm(`归档「${item.title}」？使用记录会保留，学习端不再展示。`)) return;
    item.archived = true;
    item.updatedAt = VocabStorage.nowIso();
    if (el.formId.value === id) resetForm();
    persist();
    renderAll();
    toast("已归档");
  }

  function restoreItem(id) {
    const item = findById(id);
    if (!item) return;
    item.archived = false;
    item.updatedAt = VocabStorage.nowIso();
    persist();
    renderAll();
    toast("已恢复");
  }

  // —— 事件绑定 ——
  el.viewBtns.forEach((btn) => {
    btn.addEventListener("click", () => setView(btn.dataset.view));
  });

  el.learnTabs.addEventListener("click", (e) => {
    const tab = e.target.closest(".tab");
    if (!tab) return;
    state.settings.learnFilter = tab.dataset.filter;
    persist();
    renderLearn();
  });

  el.recommendMode.addEventListener("change", () => {
    state.settings.recommendMode = el.recommendMode.value;
    if (state.settings.learnFilter === "story") {
      drawStoryDeck({ keepSelection: false });
    }
    persist();
    renderLearn();
  });

  el.storySize.addEventListener("change", () => {
    readStorySizeFromInput();
    if (state.settings.learnFilter === "story") {
      drawStoryDeck({ keepSelection: false });
    }
    persist();
    renderLearn();
  });

  el.btnStoryRedraw.addEventListener("click", () => {
    drawStoryDeck({ keepSelection: false });
    renderStory();
    toast("已换一批词牌");
  });

  el.btnStoryClear.addEventListener("click", clearStorySelection);

  el.btnStoryConfirm.addEventListener("click", confirmStoryUsage);

  el.learnList.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const card = btn.closest(".item-card");
    if (!card) return;
    const id = card.dataset.id;
    if (btn.dataset.action === "mark") markUsed(id);
    if (btn.dataset.action === "timeline") openTimeline(id);
  });

  el.storyDeck.addEventListener("click", (e) => {
    const tile = e.target.closest(".story-tile");
    if (!tile) return;
    toggleStorySelect(tile.dataset.id);
  });

  el.manageTabs.addEventListener("click", (e) => {
    const tab = e.target.closest(".tab");
    if (!tab) return;
    state.settings.manageFilter = tab.dataset.manageFilter;
    persist();
    renderManage();
  });

  el.manageTbody.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === "edit") {
      const item = findById(id);
      if (item) {
        fillForm(item);
        setView("manage");
        el.form.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
    if (btn.dataset.action === "archive") archiveItem(id);
    if (btn.dataset.action === "restore") restoreItem(id);
  });

  el.form.addEventListener("submit", (e) => {
    e.preventDefault();
    const title = el.formTitleInput.value.trim();
    if (!title) return;

    const id = el.formId.value;
    const now = VocabStorage.nowIso();
    if (id) {
      const item = findById(id);
      if (!item) return;
      item.type = el.formType.value;
      item.title = title;
      item.content = el.formContent.value;
      item.prompt = el.formPrompt.value;
      item.updatedAt = now;
      toast("已更新");
    } else {
      const item = VocabStorage.normalizeItem({
        id: VocabStorage.uid(),
        type: el.formType.value,
        title,
        content: el.formContent.value,
        prompt: el.formPrompt.value,
        createdAt: now,
        updatedAt: now,
        usages: [],
        archived: false,
      });
      state.items.unshift(item);
      toast("已添加");
    }
    persist();
    resetForm();
    renderAll();
  });

  el.formReset.addEventListener("click", resetForm);

  el.btnUndoUsage.addEventListener("click", undoLastUsage);

  el.btnExport.addEventListener("click", () => {
    const payload = VocabStorage.exportPayload(state.items, state.settings);
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = URL.createObjectURL(blob);
    a.download = `vocab-tracker-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("已导出 JSON");
  });

  el.inputImport.addEventListener("change", async () => {
    const file = el.inputImport.files && el.inputImport.files[0];
    el.inputImport.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      if (
        !confirm(
          "导入将覆盖当前本地数据（含使用记录）。建议先导出备份。是否继续？"
        )
      ) {
        return;
      }
      state.items = VocabStorage.importPayload(payload);
      state.settings = VocabStorage.loadSettings();
      state.settings.storySize = clampStorySize(state.settings.storySize);
      state.settings.storySession = normalizeStorySession(
        state.settings.storySession,
        {
          itemIds: [],
          selectedIds: [],
          mode: state.settings.recommendMode,
          size: state.settings.storySize,
        }
      );
      resetForm();
      renderAll();
      toast("导入成功");
    } catch (err) {
      console.error(err);
      toast("导入失败：文件格式不正确");
    }
  });

  // 初始化
  el.recommendMode.value = state.settings.recommendMode;
  el.storySize.value = String(state.settings.storySize);
  renderAll();
})();
