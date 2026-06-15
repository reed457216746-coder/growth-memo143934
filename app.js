const storeKey = "growthMemo.v1";
const defaultGoals = ["身体", "学习", "工作", "情绪", "关系", "副业"];
const starterEntries = [
  {
    id: makeId(),
    content: "#复盘 今天先从一条很小的记录开始。能写下来，就已经是在整理自己。",
    tags: ["复盘"],
    mood: "清醒",
    goal: "学习",
    starred: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

let state = loadState();
let activeView = "write";
let activeTag = "";
let randomEntryId = "";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const nodes = {
  todayLine: $("#todayLine"),
  form: $("#memoForm"),
  input: $("#memoInput"),
  draftState: $("#draftState"),
  mood: $("#moodSelect"),
  goal: $("#goalSelect"),
  todayList: $("#todayList"),
  todayCount: $("#todayCount"),
  search: $("#searchInput"),
  tagStrip: $("#tagStrip"),
  timeline: $("#timeline"),
  randomCard: $("#randomCard"),
  randomButton: $("#randomButton"),
  starList: $("#starList"),
  starCount: $("#starCount"),
  totalStat: $("#totalStat"),
  streakStat: $("#streakStat"),
  weekStat: $("#weekStat"),
  heatmap: $("#heatmap"),
  weekRange: $("#weekRange"),
  weeklyReview: $("#weeklyReview"),
  goalForm: $("#goalForm"),
  goalInput: $("#goalInput"),
  goalSelect: $("#goalSelect"),
  goalList: $("#goalList"),
  goalCount: $("#goalCount"),
  exportButton: $("#exportButton"),
  importInput: $("#importInput"),
  themeToggle: $("#themeToggle"),
  toast: $("#toast")
};

init();

function init() {
  applyTheme();
  nodes.todayLine.textContent = formatDate(new Date(), "full");
  bindEvents();
  render();

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(storeKey));
    if (stored?.entries && stored?.goals) return normalizeState(stored);
  } catch (error) {
    console.warn(error);
  }
  return {
    entries: starterEntries,
    goals: defaultGoals,
    settings: { theme: "system" }
  };
}

function saveState() {
  localStorage.setItem(storeKey, JSON.stringify(state));
}

function bindEvents() {
  nodes.form.addEventListener("submit", saveMemo);

  nodes.input.addEventListener("input", () => {
    nodes.draftState.textContent = nodes.input.value.trim() ? "正在写" : "已准备";
  });

  $$(".chip[data-insert]").forEach((button) => {
    button.addEventListener("click", () => insertAtCursor(`${button.dataset.insert} `));
  });

  $$("[data-template]").forEach((button) => {
    button.addEventListener("click", () => insertAtCursor(button.dataset.template));
  });

  $$(".bottom-nav button").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

  nodes.search.addEventListener("input", renderReview);
  nodes.randomButton.addEventListener("click", pickRandomEntry);
  nodes.goalForm.addEventListener("submit", addGoal);
  nodes.exportButton.addEventListener("click", exportData);
  nodes.importInput.addEventListener("change", importData);
  nodes.themeToggle.addEventListener("click", cycleTheme);
}

function switchView(view) {
  activeView = view;
  $$(".view").forEach((section) => section.classList.toggle("active", section.id === `view-${view}`));
  $$(".bottom-nav button").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  if (view === "wander" && !randomEntryId) pickRandomEntry();
  if (view === "review") nodes.search.focus({ preventScroll: true });
}

function saveMemo(event) {
  event.preventDefault();
  const content = nodes.input.value.trim();
  if (!content) {
    showToast("先写一点内容");
    return;
  }

  const now = new Date().toISOString();
  const entry = {
    id: makeId(),
    content,
    tags: parseTags(content),
    mood: nodes.mood.value,
    goal: nodes.goal.value,
    starred: false,
    createdAt: now,
    updatedAt: now
  };

  state.entries.unshift(entry);
  saveState();
  nodes.input.value = "";
  nodes.draftState.textContent = "已保存";
  showToast("保存好了");
  render();
}

function parseTags(text) {
  const tags = [...text.matchAll(/(?:^|\s)#([\p{L}\p{N}_-]+)/gu)].map((match) => match[1]);
  return [...new Set(tags)];
}

function insertAtCursor(text) {
  const input = nodes.input;
  const start = input.selectionStart;
  const end = input.selectionEnd;
  const before = input.value.slice(0, start);
  const after = input.value.slice(end);
  const prefix = before && !before.endsWith("\n") && !before.endsWith(" ") ? " " : "";
  input.value = `${before}${prefix}${text}${after}`;
  input.focus();
  const nextPos = before.length + prefix.length + text.length;
  input.setSelectionRange(nextPos, nextPos);
  nodes.draftState.textContent = "正在写";
}

function render() {
  renderGoals();
  renderToday();
  renderReview();
  renderWander();
  renderData();
}

function renderGoals() {
  nodes.goalSelect.innerHTML = state.goals.map((goal) => `<option value="${escapeHtml(goal)}">${escapeHtml(goal)}</option>`).join("");
  nodes.goalList.innerHTML = state.goals
    .map((goal) => `
      <span class="goal-item">
        ${escapeHtml(goal)}
        <button type="button" aria-label="删除 ${escapeHtml(goal)}" data-delete-goal="${escapeHtml(goal)}">×</button>
      </span>
    `)
    .join("");
  nodes.goalCount.textContent = `${state.goals.length} 个`;

  $$("[data-delete-goal]").forEach((button) => {
    button.addEventListener("click", () => deleteGoal(button.dataset.deleteGoal));
  });
}

function renderToday() {
  const today = dateKey(new Date());
  const entries = state.entries.filter((entry) => dateKey(entry.createdAt) === today);
  nodes.todayCount.textContent = `${entries.length} 条`;
  nodes.todayList.innerHTML = entries.length ? entries.slice(0, 5).map(renderMemoCard).join("") : emptyState("今天还没有记录");
  bindCardActions(nodes.todayList);
}

function renderReview() {
  const query = nodes.search.value.trim().toLowerCase();
  const tags = getAllTags();

  nodes.tagStrip.innerHTML = [
    `<button class="chip ${activeTag ? "" : "active"}" type="button" data-filter-tag="">全部</button>`,
    ...tags.map((tag) => `<button class="chip ${activeTag === tag ? "active" : ""}" type="button" data-filter-tag="${escapeHtml(tag)}">#${escapeHtml(tag)}</button>`)
  ].join("");

  $$("[data-filter-tag]").forEach((button) => {
    button.addEventListener("click", () => {
      activeTag = button.dataset.filterTag;
      renderReview();
    });
  });

  const entries = state.entries.filter((entry) => {
    const haystack = `${entry.content} ${entry.tags.join(" ")} ${entry.goal} ${entry.mood}`.toLowerCase();
    return (!activeTag || entry.tags.includes(activeTag)) && (!query || haystack.includes(query));
  });

  nodes.timeline.innerHTML = entries.length ? entries.map(renderMemoCard).join("") : emptyState("没有找到对应记录");
  bindCardActions(nodes.timeline);
}

function renderWander() {
  if (!state.entries.length) {
    nodes.randomCard.innerHTML = emptyState("保存几条之后再来随机漫步");
  } else if (!randomEntryId || !state.entries.some((entry) => entry.id === randomEntryId)) {
    pickRandomEntry(false);
  } else {
    const entry = state.entries.find((item) => item.id === randomEntryId);
    nodes.randomCard.innerHTML = renderMemoInner(entry);
  }

  const starred = state.entries.filter((entry) => entry.starred);
  nodes.starCount.textContent = `${starred.length} 条`;
  nodes.starList.innerHTML = starred.length ? starred.map(renderMemoCard).join("") : emptyState("把重要记录点亮，它们会出现在这里");
  bindCardActions(nodes.starList);
}

function renderData() {
  const now = new Date();
  const weekStart = startOfWeek(now);
  const weekEnd = endOfWeek(now);
  const weekEntries = state.entries.filter((entry) => {
    const created = new Date(entry.createdAt);
    return created >= weekStart && created <= weekEnd;
  });

  nodes.totalStat.textContent = state.entries.length;
  nodes.weekStat.textContent = weekEntries.length;
  nodes.streakStat.textContent = getStreak();
  nodes.weekRange.textContent = `${formatDate(weekStart, "short")} - ${formatDate(weekEnd, "short")}`;
  renderHeatmap();
  renderWeeklyReview(weekEntries);
}

function renderHeatmap() {
  const counts = countByDate();
  const days = [];
  for (let i = 83; i >= 0; i -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const key = dateKey(date);
    const count = counts[key] || 0;
    days.push({ key, count, level: Math.min(4, count) });
  }
  nodes.heatmap.innerHTML = days
    .map((day) => `<span class="heat-cell" data-level="${day.level}" title="${day.key}: ${day.count} 条"></span>`)
    .join("");
}

function renderWeeklyReview(entries) {
  if (!entries.length) {
    nodes.weeklyReview.innerHTML = "<p>本周还没有记录。先写一条，复盘就会开始长出来。</p>";
    return;
  }

  const tagTop = topItems(entries.flatMap((entry) => entry.tags), 5);
  const moodTop = topItems(entries.map((entry) => entry.mood), 3);
  const goalTop = topItems(entries.map((entry) => entry.goal), 3);

  nodes.weeklyReview.innerHTML = `
    <p>本周写了 ${entries.length} 条，最常出现的标签是 ${tagTop.length ? tagTop.map((item) => `#${escapeHtml(item.name)}`).join("、") : "暂无标签"}。</p>
    <ul>
      <li>本周主要状态：${moodTop.map((item) => `${escapeHtml(item.name)} ${item.count}`).join("、")}</li>
      <li>投入最多目标：${goalTop.map((item) => `${escapeHtml(item.name)} ${item.count}`).join("、")}</li>
      <li>下周只选一个最小行动写下来，越小越容易坚持。</li>
    </ul>
  `;
}

function renderMemoCard(entry) {
  return `
    <article class="memo-card ${entry.starred ? "starred" : ""}" data-entry-id="${entry.id}">
      ${renderMemoInner(entry)}
      <div class="card-actions">
        <button type="button" data-action="star" title="精华">${entry.starred ? "★" : "☆"}</button>
        <button type="button" data-action="edit" title="编辑">编</button>
        <button type="button" data-action="delete" title="删除">删</button>
      </div>
    </article>
  `;
}

function renderMemoInner(entry) {
  const tags = entry.tags.map((tag) => `<span class="tag">#${escapeHtml(tag)}</span>`).join("");
  return `
    <div class="memo-text">${linkTags(escapeHtml(entry.content))}</div>
    <div class="memo-meta">
      <span>${formatDate(entry.createdAt, "minute")}</span>
      <span class="mood-pill">${escapeHtml(entry.mood)}</span>
      <span class="goal-pill">${escapeHtml(entry.goal)}</span>
      ${tags}
    </div>
  `;
}

function bindCardActions(root) {
  root.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.closest("[data-entry-id]").dataset.entryId;
      const action = button.dataset.action;
      if (action === "star") toggleStar(id);
      if (action === "edit") editEntry(id);
      if (action === "delete") deleteEntry(id);
    });
  });
}

function toggleStar(id) {
  const entry = state.entries.find((item) => item.id === id);
  if (!entry) return;
  entry.starred = !entry.starred;
  entry.updatedAt = new Date().toISOString();
  saveState();
  render();
}

function editEntry(id) {
  const entry = state.entries.find((item) => item.id === id);
  if (!entry) return;
  const next = prompt("编辑这条记录", entry.content);
  if (next === null) return;
  const content = next.trim();
  if (!content) {
    showToast("内容不能为空");
    return;
  }
  entry.content = content;
  entry.tags = parseTags(content);
  entry.updatedAt = new Date().toISOString();
  saveState();
  render();
  showToast("已更新");
}

function deleteEntry(id) {
  if (!confirm("删除这条记录？")) return;
  state.entries = state.entries.filter((entry) => entry.id !== id);
  if (randomEntryId === id) randomEntryId = "";
  saveState();
  render();
  showToast("已删除");
}

function pickRandomEntry(showMessage = true) {
  if (!state.entries.length) return;
  const pool = state.entries.length === 1 ? state.entries : state.entries.filter((entry) => entry.id !== randomEntryId);
  const entry = pool[Math.floor(Math.random() * pool.length)];
  randomEntryId = entry.id;
  nodes.randomCard.innerHTML = renderMemoInner(entry);
  if (showMessage) showToast("给你翻到这一条");
}

function addGoal(event) {
  event.preventDefault();
  const goal = nodes.goalInput.value.trim();
  if (!goal) return;
  if (state.goals.includes(goal)) {
    showToast("这个目标已经有了");
    return;
  }
  state.goals.push(goal);
  nodes.goalInput.value = "";
  saveState();
  renderGoals();
}

function deleteGoal(goal) {
  if (state.goals.length <= 1) {
    showToast("至少保留一个目标");
    return;
  }
  state.goals = state.goals.filter((item) => item !== goal);
  state.entries.forEach((entry) => {
    if (entry.goal === goal) entry.goal = state.goals[0];
  });
  saveState();
  render();
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `growth-memo-${dateKey(new Date())}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function importData(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const next = JSON.parse(reader.result);
      if (!Array.isArray(next.entries) || !Array.isArray(next.goals)) throw new Error("invalid");
      state = normalizeState(next);
      saveState();
      render();
      showToast("导入成功");
    } catch {
      showToast("这个文件格式不对");
    }
  };
  reader.readAsText(file);
  event.target.value = "";
}

function cycleTheme() {
  const current = state.settings.theme || "system";
  state.settings.theme = current === "system" ? "dark" : current === "dark" ? "light" : "system";
  saveState();
  applyTheme();
  showToast(`主题：${state.settings.theme === "system" ? "跟随系统" : state.settings.theme === "dark" ? "深色" : "浅色"}`);
}

function applyTheme() {
  const theme = state.settings.theme || "system";
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark", theme === "dark" || (theme === "system" && prefersDark));
}

function normalizeState(next) {
  return {
    entries: next.entries,
    goals: next.goals.length ? next.goals : defaultGoals,
    settings: next.settings || { theme: "system" }
  };
}

function makeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getAllTags() {
  return [...new Set(state.entries.flatMap((entry) => entry.tags))].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function countByDate() {
  return state.entries.reduce((acc, entry) => {
    const key = dateKey(entry.createdAt);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function getStreak() {
  const counts = countByDate();
  let streak = 0;
  const cursor = new Date();
  while (counts[dateKey(cursor)]) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function topItems(items, limit) {
  const counts = items.filter(Boolean).reduce((acc, item) => {
    acc[item] = (acc[item] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN"))
    .slice(0, limit);
}

function startOfWeek(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  const day = next.getDay() || 7;
  next.setDate(next.getDate() - day + 1);
  return next;
}

function endOfWeek(date) {
  const next = startOfWeek(date);
  next.setDate(next.getDate() + 6);
  next.setHours(23, 59, 59, 999);
  return next;
}

function dateKey(value) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value, type) {
  const date = new Date(value);
  if (type === "full") {
    return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(date);
  }
  if (type === "short") {
    return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(date);
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function linkTags(text) {
  return text.replace(/(^|\s)#([\p{L}\p{N}_-]+)/gu, "$1<span class=\"tag\">#$2</span>");
}

function emptyState(text) {
  return `<div class="empty">${escapeHtml(text)}</div>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

let toastTimer;
function showToast(text) {
  clearTimeout(toastTimer);
  nodes.toast.textContent = text;
  nodes.toast.classList.add("show");
  toastTimer = setTimeout(() => nodes.toast.classList.remove("show"), 1800);
}
