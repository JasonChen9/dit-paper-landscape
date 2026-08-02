const DATA_URL = "./data/papers.csv";

const RELATIONS = {
  direct: "核心 DiT",
  adaptation: "后训练 / 适配",
  system: "系统优化",
  adjacent: "相邻方向",
};

const WINDOW_LABELS = {
  all: "全部论文",
  "in-window": "最近三年",
  background: "历史锚点",
  custom: "自定义日期区间",
};

const SORT_LABELS = {
  newest: "最新优先",
  oldest: "最早优先",
  title: "标题 A-Z",
};

const state = {
  papers: [],
  clusters: [],
  paperClusterLabels: new Map(),
  query: "",
  cluster: "all",
  relation: "all",
  window: "all",
  sort: "newest",
  customStart: null,
  customEnd: null,
  topicIds: null,
  topicLabel: "",
  topicSource: null,
};

const elements = {
  search: document.querySelector("#search-input"),
  relation: document.querySelector("#relation-select"),
  window: document.querySelector("#window-select"),
  sort: document.querySelector("#sort-select"),
  categories: document.querySelector("#category-filters"),
  resultCount: document.querySelector("#result-count"),
  paperList: document.querySelector("#paper-list"),
  empty: document.querySelector("#empty-state"),
  reset: document.querySelector("#reset-button"),
  exportMarkdown: document.querySelector("#export-markdown"),
  exportHTML: document.querySelector("#export-html"),
  exportStatus: document.querySelector("#export-status"),
  theme: document.querySelector("#theme-toggle"),
  total: document.querySelector("#total-count"),
  windowCount: document.querySelector("#window-count"),
};

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  const headers = rows.shift();
  return rows
    .filter((values) => values.some(Boolean))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function normalize(value) {
  return value.toLocaleLowerCase("zh-CN").replace(/[-_/]/g, " ");
}

function clusterLabelForPaper(paper) {
  return state.paperClusterLabels.get(paper.arxiv_id) ?? "自动聚类待计算";
}

function matchesPaper(paper, { includeTopic = true, includeTime = true } = {}) {
  if (state.relation !== "all" && paper.dit_relation !== state.relation) return false;
  if (includeTime && state.window === "custom") {
    if (!state.customStart || !state.customEnd) return false;
    if (paper.published < state.customStart || paper.published > state.customEnd) return false;
  } else if (includeTime && state.window !== "all" && paper.window !== state.window) {
    return false;
  }
  if (includeTopic && state.topicIds && !state.topicIds.has(paper.arxiv_id)) return false;
  if (!state.query) return true;

  const haystack = normalize(
    [
      paper.short_title,
      paper.title,
      paper.venue,
      paper.topic_tags,
      paper.summary_zh,
      clusterLabelForPaper(paper),
      RELATIONS[paper.dit_relation],
    ].join(" "),
  );
  return state.query
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(normalize(term)));
}

function sortPapers(papers) {
  return [...papers].sort((left, right) => {
    if (state.sort === "oldest") return left.published.localeCompare(right.published);
    if (state.sort === "title") return left.title.localeCompare(right.title, "en");
    return right.published.localeCompare(left.published);
  });
}

function filteredPapers() {
  return sortPapers(state.papers.filter(matchesPaper));
}

function listControlledPaperIds() {
  return state.papers
    .filter((paper) => matchesPaper(paper, { includeTopic: false, includeTime: false }))
    .map((paper) => paper.arxiv_id);
}

function syncLandscapeListFilter() {
  window.DiTLandscape?.setExternalFilter(listControlledPaperIds());
}

function clearTopicFilter() {
  state.cluster = "all";
  state.topicIds = null;
  state.topicLabel = "";
  state.topicSource = null;
  window.DiTLandscape?.clearTopicFilter();
}

function syncLandscapeTimeFilter() {
  if (state.window === "custom" && state.customStart && state.customEnd) {
    window.DiTLandscape?.setTimeRange(state.customStart, state.customEnd);
  } else {
    window.DiTLandscape?.setTimePreset(state.window);
  }
}

function createElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function createLink(label, url, className = "") {
  const link = createElement("a", className, label);
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

function createPaperCard(paper) {
  const card = createElement("article", "paper-card");

  const meta = createElement("div", "paper-meta");
  meta.append(
    createElement("span", "relation-badge", RELATIONS[paper.dit_relation] ?? paper.dit_relation),
    createElement("span", "", paper.published),
    createElement("span", "", `· ${paper.venue}`),
  );

  const heading = createElement("h3");
  const titleLink = createLink(paper.short_title, paper.arxiv_url);
  heading.append(titleLink);

  const fullTitle = createElement("p", "full-title", paper.title);
  const summary = createElement("p", "summary", paper.summary_zh);

  const tags = createElement("ul", "tag-list");
  for (const tag of paper.topic_tags.split(";").filter(Boolean)) {
    tags.append(createElement("li", "", tag));
  }

  const links = createElement("div", "card-links");
  links.append(createLink("摘要 ↗", paper.arxiv_url), createLink("PDF ↗", paper.pdf_url));

  card.append(meta, heading, fullTitle, summary, tags, links);
  return card;
}

function updateURL() {
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  if (state.cluster !== "all") params.set("cluster", state.cluster);
  if (state.relation !== "all") params.set("relation", state.relation);
  if (state.window !== "all") params.set("window", state.window);
  if (state.window === "custom" && state.customStart && state.customEnd) {
    params.set("from", state.customStart);
    params.set("to", state.customEnd);
  }
  if (state.sort !== "newest") params.set("sort", state.sort);
  const query = params.toString();
  history.replaceState(null, "", `${location.pathname}${query ? `?${query}` : ""}${location.hash}`);
}

function filterDescription() {
  const timeLabel = state.window === "custom" && state.customStart && state.customEnd
    ? `${state.customStart} — ${state.customEnd}`
    : WINDOW_LABELS[state.window] ?? state.window;
  const parts = [
    `主题聚类：${state.topicSource === "cluster" ? state.topicLabel : "全部聚类"}`,
    `DiT 关系：${state.relation === "all" ? "全部关系" : RELATIONS[state.relation]}`,
    `时间：${timeLabel}`,
    `排序：${SORT_LABELS[state.sort] ?? state.sort}`,
  ];
  if (state.topicSource === "tag") parts.push(`词云筛选：${state.topicLabel}`);
  if (state.query) parts.push(`搜索：${state.query}`);
  return parts.join("；");
}

function escapeMarkdown(value) {
  return String(value ?? "").replace(/([\\[\]*_`])/g, "\\$1");
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function exportFilename(extension, count) {
  const date = new Date().toISOString().slice(0, 10);
  return `dit-papers-${date}-${count}.${extension}`;
}

function downloadText(content, filename, mimeType) {
  const blob = new Blob(["\ufeff", content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function markdownExport(papers) {
  const generated = new Date().toISOString();
  const sections = papers.map((paper, index) => {
    const tags = paper.topic_tags.split(";").filter(Boolean).map((tag) => `\`${escapeMarkdown(tag)}\``).join(" · ");
    return [
      `## ${index + 1}. [${escapeMarkdown(paper.title)}](${paper.arxiv_url})`,
      "",
      `- 简称：${escapeMarkdown(paper.short_title)}`,
      `- 发表日期：${paper.published}`,
      `- 主题聚类：${escapeMarkdown(clusterLabelForPaper(paper))}`,
      `- DiT 关系：${escapeMarkdown(RELATIONS[paper.dit_relation] ?? paper.dit_relation)}`,
      `- 来源：${escapeMarkdown(paper.venue)}`,
      `- 标签：${tags || "-"}`,
      `- arXiv：[${paper.arxiv_url}](${paper.arxiv_url})`,
      `- PDF：[${paper.pdf_url}](${paper.pdf_url})`,
      "",
      escapeMarkdown(paper.summary_zh),
    ].join("\n");
  });
  return [
    "# DiT Paper Atlas 导出",
    "",
    `- 论文数量：${papers.length}`,
    `- 导出条件：${escapeMarkdown(filterDescription())}`,
    `- 生成时间：${generated}`,
    "",
    ...sections,
    "",
  ].join("\n");
}

function htmlExport(papers) {
  const generated = new Date().toISOString();
  const cards = papers.map((paper, index) => {
    const tags = paper.topic_tags.split(";").filter(Boolean).map((tag) => `<li>${escapeHTML(tag)}</li>`).join("");
    return `
      <article>
        <p class="meta">${index + 1} · ${escapeHTML(paper.published)} · ${escapeHTML(paper.venue)} · ${escapeHTML(RELATIONS[paper.dit_relation] ?? paper.dit_relation)}</p>
        <h2><a href="${escapeHTML(paper.arxiv_url)}">${escapeHTML(paper.title)}</a></h2>
        <p class="short-title">${escapeHTML(paper.short_title)} · ${escapeHTML(clusterLabelForPaper(paper))}</p>
        <p>${escapeHTML(paper.summary_zh)}</p>
        <ul class="tags">${tags}</ul>
        <p class="links"><a href="${escapeHTML(paper.arxiv_url)}">arXiv</a><a href="${escapeHTML(paper.pdf_url)}">PDF</a></p>
      </article>`;
  }).join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DiT Paper Atlas 导出</title>
  <style>
    :root { color-scheme: light dark; --bg: #fff; --text: #242424; --muted: #6c757d; --border: #d9d9d9; --accent: #2698ba; --tag: #f3f5f6; }
    @media (prefers-color-scheme: dark) { :root { --bg: #191919; --text: #e8e8e8; --muted: #a8a8a8; --border: #3b3b3b; --accent: #58b7d3; --tag: #25292b; } }
    * { box-sizing: border-box; }
    body { max-width: 900px; margin: 0 auto; padding: 48px 24px 80px; background: var(--bg); color: var(--text); font: 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    header { padding-bottom: 24px; border-bottom: 1px solid var(--border); }
    h1 { margin: 0 0 8px; font-size: 2rem; }
    h2 { margin: 4px 0 5px; font-size: 1.2rem; line-height: 1.4; }
    a { color: var(--accent); }
    article { padding: 25px 0; border-bottom: 1px solid var(--border); }
    .meta, .short-title, header p { margin: 0; color: var(--muted); font-size: .85rem; }
    article > p { margin: 9px 0; }
    .tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0; padding: 0; list-style: none; }
    .tags li { padding: 2px 7px; border: 1px solid var(--border); border-radius: 3px; background: var(--tag); font-size: .75rem; }
    .links { display: flex; gap: 12px; }
    @media print { body { max-width: none; padding: 0; } article { break-inside: avoid; } }
  </style>
</head>
<body>
  <header>
    <h1>DiT Paper Atlas 导出</h1>
    <p>${papers.length} 篇论文</p>
    <p>${escapeHTML(filterDescription())}</p>
    <p>生成时间：${escapeHTML(generated)}</p>
  </header>
  <main>${cards}</main>
</body>
</html>`;
}

function exportCurrent(format) {
  const papers = filteredPapers();
  if (!papers.length) return;
  if (format === "markdown") {
    downloadText(markdownExport(papers), exportFilename("md", papers.length), "text/markdown");
    elements.exportStatus.textContent = `已导出 ${papers.length} 篇 · Markdown`;
  } else {
    downloadText(htmlExport(papers), exportFilename("html", papers.length), "text/html");
    elements.exportStatus.textContent = `已导出 ${papers.length} 篇 · HTML`;
  }
}

function render() {
  const filtered = filteredPapers();
  elements.paperList.replaceChildren(...filtered.map(createPaperCard));
  const activeContext = [];
  if (state.topicSource === "tag" && state.topicLabel) activeContext.push(`标签：${state.topicLabel}`);
  if (state.window === "custom" && state.customStart && state.customEnd) {
    activeContext.push(`${state.customStart} — ${state.customEnd}`);
  }
  elements.resultCount.textContent = `显示 ${filtered.length} / ${state.papers.length} 篇论文${activeContext.length ? ` · ${activeContext.join(" · ")}` : ""}`;
  elements.exportMarkdown.disabled = filtered.length === 0;
  elements.exportHTML.disabled = filtered.length === 0;
  elements.exportStatus.textContent = "";
  elements.empty.hidden = filtered.length > 0;
  elements.paperList.hidden = filtered.length === 0;

  renderClusterFilters();
  updateURL();
  syncLandscapeListFilter();
}

function renderClusterFilters() {
  if (!state.clusters.length) {
    elements.categories.textContent = "正在计算统一主题聚类…";
    return;
  }
  const availableIds = new Set(
    state.papers
      .filter((paper) => matchesPaper(paper, { includeTopic: false }))
      .map((paper) => paper.arxiv_id),
  );
  const choices = [
    { id: "all", name: "全部主题", ids: state.papers.map((paper) => paper.arxiv_id) },
    ...state.clusters,
  ];
  const buttons = choices.map((cluster) => {
    const count = cluster.ids.filter((id) => availableIds.has(id)).length;
    const button = createElement("button", "category-filter");
    button.type = "button";
    button.dataset.cluster = cluster.id;
    const selected = cluster.id === state.cluster;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
    button.append(document.createTextNode(cluster.name), createElement("span", "", String(count).padStart(2, "0")));
    button.addEventListener("click", () => {
      state.cluster = cluster.id;
      state.topicIds = cluster.id === "all" ? null : new Set(cluster.ids);
      state.topicLabel = cluster.id === "all" ? "" : cluster.name;
      state.topicSource = cluster.id === "all" ? null : "cluster";
      window.DiTLandscape?.setClusterFilter(cluster.id === "all" ? null : Number(cluster.id));
      render();
    });
    return button;
  });
  elements.categories.replaceChildren(...buttons);
}

function readURLState() {
  const params = new URLSearchParams(location.search);
  state.cluster = params.get("cluster") ?? "all";
  const relation = params.get("relation");
  const windowValue = params.get("window");
  const customStart = params.get("from");
  const customEnd = params.get("to");
  const sort = params.get("sort");
  state.query = params.get("q") ?? "";
  if (relation === "all" || relation in RELATIONS) state.relation = relation;
  if (["all", "in-window", "background"].includes(windowValue)) state.window = windowValue;
  if (windowValue === "custom" && /^\d{4}-\d{2}-\d{2}$/.test(customStart ?? "") && /^\d{4}-\d{2}-\d{2}$/.test(customEnd ?? "")) {
    state.window = "custom";
    state.customStart = customStart;
    state.customEnd = customEnd;
  }
  if (["newest", "oldest", "title"].includes(sort)) state.sort = sort;

  elements.search.value = state.query;
  elements.relation.value = state.relation;
  elements.window.value = state.window;
  elements.sort.value = state.sort;
}

function applyClusterCatalog(clusters) {
  state.clusters = clusters;
  state.paperClusterLabels = new Map();
  clusters.forEach((cluster) => {
    cluster.ids.forEach((id) => state.paperClusterLabels.set(id, cluster.name));
  });
  const selected = clusters.find((cluster) => cluster.id === state.cluster);
  if (selected) {
    state.topicIds = new Set(selected.ids);
    state.topicLabel = selected.name;
    state.topicSource = "cluster";
    window.DiTLandscape?.setClusterFilter(Number(selected.id));
  } else {
    clearTopicFilter();
  }
  render();
}

function bindEvents() {
  elements.theme.addEventListener("click", () => {
    const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("dit-paper-theme", theme);
    document.querySelector('meta[name="theme-color"]').content = theme === "dark" ? "#1c1c1d" : "#ffffff";
    window.DiTLandscape?.themeChanged();
  });
  elements.search.addEventListener("input", (event) => {
    state.query = event.target.value.trim();
    render();
  });
  elements.relation.addEventListener("change", (event) => {
    state.relation = event.target.value;
    render();
  });
  elements.window.addEventListener("change", (event) => {
    state.window = event.target.value;
    state.customStart = null;
    state.customEnd = null;
    syncLandscapeTimeFilter();
    render();
  });
  elements.sort.addEventListener("change", (event) => {
    state.sort = event.target.value;
    render();
  });
  elements.exportMarkdown.addEventListener("click", () => exportCurrent("markdown"));
  elements.exportHTML.addEventListener("click", () => exportCurrent("html"));
  window.addEventListener("dit:landscape-clusters-ready", (event) => {
    if (Array.isArray(event.detail?.clusters)) applyClusterCatalog(event.detail.clusters);
  });
  window.addEventListener("dit:landscape-topic-filter", (event) => {
    const ids = event.detail?.ids;
    state.topicIds = Array.isArray(ids) ? new Set(ids) : null;
    state.topicLabel = event.detail?.label ?? "";
    state.topicSource = event.detail?.source ?? null;
    state.cluster = state.topicSource === "cluster" ? String(event.detail.cluster) : "all";
    render();
  });
  window.addEventListener("dit:landscape-time-filter", (event) => {
    const { start, end, fullRange } = event.detail ?? {};
    if (fullRange) {
      state.window = "all";
      state.customStart = null;
      state.customEnd = null;
    } else if (start && end) {
      state.window = "custom";
      state.customStart = start;
      state.customEnd = end;
    }
    elements.window.value = state.window;
    render();
  });
  elements.reset.addEventListener("click", () => {
    state.query = "";
    state.cluster = "all";
    state.relation = "all";
    state.window = "all";
    state.sort = "newest";
    state.customStart = null;
    state.customEnd = null;
    state.topicIds = null;
    state.topicLabel = "";
    state.topicSource = null;
    elements.search.value = "";
    elements.relation.value = "all";
    elements.window.value = "all";
    elements.sort.value = "newest";
    window.DiTLandscape?.resetFilters();
    render();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && document.activeElement?.tagName !== "INPUT") {
      event.preventDefault();
      elements.search.focus();
    }
  });
}

async function initialize() {
  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.papers = parseCSV(await response.text());
    readURLState();
    bindEvents();
    elements.total.textContent = state.papers.length;
    elements.windowCount.textContent = state.papers.filter((paper) => paper.window === "in-window").length;
    render();
    window.DiTLandscape?.init(state.papers);
    syncLandscapeTimeFilter();
    syncLandscapeListFilter();
  } catch (error) {
    elements.resultCount.textContent = "论文数据加载失败，请稍后刷新。";
    elements.empty.hidden = false;
    elements.empty.querySelector("p").textContent = "无法读取论文目录。";
    elements.reset.hidden = true;
    console.error(error);
  }
}

initialize();
