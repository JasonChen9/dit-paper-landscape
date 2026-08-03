const CATALOG_VERSION = "20260803-bilingual-abstracts-v1";
const DEPLOY_ASSET_VERSION = document.querySelector('meta[name="deploy-version"]')?.content;
const DATA_VERSION = DEPLOY_ASSET_VERSION && !DEPLOY_ASSET_VERSION.startsWith("__")
  ? DEPLOY_ASSET_VERSION
  : CATALOG_VERSION;
const DATA_URL = `./data/papers.csv?v=${DATA_VERSION}`;
const ENGLISH_SUMMARIES_URL = `./data/summaries_en.json?v=${DATA_VERSION}`;
const ABSTRACTS_URL = `./data/abstracts.json?v=${DATA_VERSION}`;
const PRECOMPUTED_LANDSCAPE_URL = `./data/landscape.json?v=${DATA_VERSION}`;
const DEPLOY_VERSION_URL = "./version.json";
const DEPLOY_CHECK_INTERVAL_MS = 15000;
const EXPORT_COUNTER_URL = "https://api.counterapi.dev/v1/jasonchen9-dit-paper-landscape/paper-exports";
const EXPORT_COUNT_CACHE_KEY = "dit-paper-export-count-cache";
let activeDeployVersion = null;
let deployCheckTimer = null;
let deployRefreshStarted = false;

const RELATION_KEYS = {
  direct: "relation.direct",
  adaptation: "relation.adaptation",
  system: "relation.system",
  adjacent: "relation.adjacent",
};

const WINDOW_KEYS = {
  all: "window.all",
  "in-window": "window.in-window",
  background: "window.background",
  custom: "window.custom",
};

const SORT_KEYS = {
  newest: "sort.newest",
  oldest: "sort.oldest",
  title: "sort.title",
};

const t = (key, values) => window.DiTI18n.t(key, values);
const relationLabel = (value) => value === "all" ? t("relation.all") : t(RELATION_KEYS[value] ?? value);
const windowLabel = (value) => t(WINDOW_KEYS[value] ?? value);
const sortLabel = (value) => t(SORT_KEYS[value] ?? value);

const state = {
  papers: [],
  abstracts: new Map(),
  expandedAbstracts: new Set(),
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
  mapMode: "topics",
  page: 1,
  pageSize: 12,
  initialized: false,
};

const elements = {
  search: document.querySelector("#search-input"),
  relation: document.querySelector("#relation-select"),
  window: document.querySelector("#window-select"),
  sort: document.querySelector("#sort-select"),
  categories: document.querySelector("#category-filters"),
  resultCount: document.querySelector("#result-count"),
  paperList: document.querySelector("#paper-list"),
  pagination: document.querySelector("#pagination"),
  paginationSummary: document.querySelector("#pagination-summary"),
  pageSize: document.querySelector("#page-size-select"),
  pageButtons: document.querySelector("#page-buttons"),
  empty: document.querySelector("#empty-state"),
  reset: document.querySelector("#reset-button"),
  landscapeReset: document.querySelector("#landscape-reset"),
  exportMenu: document.querySelector("#export-menu"),
  exportMenuToggle: document.querySelector("#export-menu-toggle"),
  exportMenuOptions: document.querySelector("#export-menu-options"),
  exportMarkdown: document.querySelector("#export-markdown"),
  exportHTML: document.querySelector("#export-html"),
  exportStatus: document.querySelector("#export-status"),
  theme: document.querySelector("#theme-toggle"),
  total: document.querySelector("#total-count"),
  exportCount: document.querySelector("#export-count"),
  exportCountLabel: document.querySelector("#export-count-label"),
  windowCount: document.querySelector("#window-count"),
  modeTopics: document.querySelector("#landscape-mode-topics"),
  modeAuthors: document.querySelector("#landscape-mode-authors"),
  landscapeDescription: document.querySelector("#landscape-description"),
  topicCanvas: document.querySelector("#landscape-canvas"),
  authorCanvas: document.querySelector("#author-landscape-canvas"),
  topicZoom: document.querySelector(".landscape-zoom-controls:not(#author-zoom-controls)"),
  authorZoom: document.querySelector("#author-zoom-controls"),
  topicSidebar: document.querySelector("#topic-landscape-sidebar"),
  authorSidebar: document.querySelector("#author-landscape-sidebar"),
  topicCloudSection: document.querySelector("#topic-cloud-section"),
  bridgeSection: document.querySelector("#bridge-section"),
  authorIndexSection: document.querySelector("#author-index-section"),
};

async function readDeployVersion() {
  try {
    const response = await fetch(`${DEPLOY_VERSION_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return null;
    const payload = await response.json();
    return typeof payload.version === "string" && payload.version ? payload.version : null;
  } catch {
    return null;
  }
}

async function checkForDeployUpdate() {
  const version = await readDeployVersion();
  if (!version) return;
  if (!activeDeployVersion) {
    activeDeployVersion = version;
    return;
  }
  if (version === activeDeployVersion || deployRefreshStarted) return;
  deployRefreshStarted = true;
  const url = new URL(window.location.href);
  url.searchParams.set("deploy", version.slice(0, 12));
  window.location.replace(url.toString());
}

async function startDeployVersionMonitor() {
  await checkForDeployUpdate();
  deployCheckTimer = window.setInterval(checkForDeployUpdate, DEPLOY_CHECK_INTERVAL_MS);
}

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

function catalogSignature(papers) {
  const value = papers.map((paper) => [paper.arxiv_id, paper.topic_tags, paper.key_authors].join("\t")).join("\n");
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function normalize(value) {
  return value.toLocaleLowerCase("zh-CN").replace(/[-_/]/g, " ");
}

function clusterLabelForPaper(paper) {
  return state.paperClusterLabels.get(paper.arxiv_id) ?? t("cluster.computing");
}

function paperSummary(paper) {
  return window.DiTI18n.language === "zh" ? paper.summary_zh : paper.summary_en || paper.summary_zh;
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
      paper.alternate_titles,
      paper.authors,
      paper.venue,
      paper.topic_tags,
      paper.summary_en,
      paper.summary_zh,
      paper.abstract_en,
      paper.abstract_zh,
      clusterLabelForPaper(paper),
      relationLabel(paper.dit_relation),
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
    .filter((paper) => matchesPaper(paper, { includeTime: false }))
    .map((paper) => paper.arxiv_id);
}

function syncLandscapeListFilter() {
  const ids = listControlledPaperIds();
  window.DiTLandscape?.setExternalFilter(ids);
  window.DiTAuthors?.setExternalFilter(ids);
}

function clearTopicFilter() {
  state.cluster = "all";
  state.topicIds = null;
  state.topicLabel = "";
  state.topicSource = null;
  window.DiTLandscape?.clearTopicFilter();
  window.DiTAuthors?.clearAuthorFilter?.();
  window.DiTAuthors?.clearInstitutionFilter?.();
}

function resetAllFilters() {
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
  state.page = 1;
  elements.search.value = "";
  elements.relation.value = "all";
  elements.window.value = "all";
  elements.sort.value = "newest";
  const allIds = state.papers.map((paper) => paper.arxiv_id);
  window.DiTLandscape?.setExternalFilter(allIds);
  window.DiTAuthors?.setExternalFilter(allIds);
  window.DiTLandscape?.resetFilters();
  window.DiTAuthors?.resetFilters();
  render();
}

function syncLandscapeTimeFilter() {
  if (state.window === "custom" && state.customStart && state.customEnd) {
    window.DiTLandscape?.setTimeRange(state.customStart, state.customEnd);
    window.DiTAuthors?.setTimeRange(state.customStart, state.customEnd);
  } else {
    window.DiTLandscape?.setTimePreset(state.window);
    window.DiTAuthors?.setTimePreset(state.window);
  }
}

function setLandscapeMode(mode, { updateHistory = true } = {}) {
  state.mapMode = mode === "authors" ? "authors" : "topics";
  const authors = state.mapMode === "authors";
  elements.modeTopics.classList.toggle("active", !authors);
  elements.modeAuthors.classList.toggle("active", authors);
  elements.modeTopics.setAttribute("aria-pressed", String(!authors));
  elements.modeAuthors.setAttribute("aria-pressed", String(authors));
  elements.topicCanvas.classList.toggle("landscape-view-hidden", authors);
  elements.authorCanvas.classList.toggle("landscape-view-hidden", !authors);
  elements.topicZoom.hidden = authors;
  elements.authorZoom.hidden = !authors;
  elements.topicSidebar.hidden = authors;
  elements.authorSidebar.hidden = !authors;
  elements.topicCloudSection.hidden = authors;
  elements.bridgeSection.hidden = authors;
  elements.authorIndexSection.hidden = !authors;
  elements.landscapeDescription.textContent = t(authors ? "authors.description" : "landscape.description");
  if (authors) window.DiTAuthors?.fitView();
  if (updateHistory) updateURL();
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
    createElement("span", "relation-badge", relationLabel(paper.dit_relation)),
    createElement("span", "", paper.published),
    createElement("span", "", `· ${paper.venue}`),
  );

  const heading = createElement("h3");
  const titleLink = createLink(paper.short_title, paper.arxiv_url);
  heading.append(titleLink);

  const fullTitle = createElement("p", "full-title", paper.title);
  const authors = createElement("p", "paper-authors", paper.authors);
  const summary = createElement("p", "summary", paperSummary(paper));

  const tags = createElement("ul", "tag-list");
  for (const tag of paper.topic_tags.split(";").filter(Boolean)) {
    tags.append(createElement("li", "", tag));
  }

  const links = createElement("div", "card-links");
  links.append(createLink(`${paper.source_label || "arXiv"} ↗`, paper.arxiv_url), createLink(t("paper.pdf"), paper.pdf_url));

  const abstractRecord = state.abstracts.get(paper.arxiv_id);
  const abstractText = window.DiTI18n.language === "zh"
    ? abstractRecord?.zh || abstractRecord?.en
    : abstractRecord?.en;
  const expanded = state.expandedAbstracts.has(paper.arxiv_id);
  if (abstractText) {
    const panelId = `abstract-${paper.arxiv_id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
    const toggle = createElement("button", "abstract-toggle", t(expanded ? "paper.abstractHide" : "paper.abstract"));
    toggle.type = "button";
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.setAttribute("aria-controls", panelId);
    toggle.classList.toggle("active", expanded);

    const panel = createElement("div", "paper-abstract");
    panel.id = panelId;
    panel.hidden = !expanded;
    panel.append(createElement("p", "paper-abstract-text", abstractText));
    const provenance = createLink(
      t(window.DiTI18n.language === "zh" ? "paper.abstractTranslation" : "paper.abstractSource", {
        source: abstractRecord.source,
      }),
      abstractRecord.source_url,
      "paper-abstract-source",
    );
    panel.append(provenance);

    toggle.addEventListener("click", () => {
      const nextExpanded = !state.expandedAbstracts.has(paper.arxiv_id);
      if (nextExpanded) state.expandedAbstracts.add(paper.arxiv_id);
      else state.expandedAbstracts.delete(paper.arxiv_id);
      panel.hidden = !nextExpanded;
      toggle.classList.toggle("active", nextExpanded);
      toggle.setAttribute("aria-expanded", String(nextExpanded));
      toggle.textContent = t(nextExpanded ? "paper.abstractHide" : "paper.abstract");
    });
    links.append(toggle);
    card.append(meta, heading, fullTitle, authors, summary, tags, links, panel);
    return card;
  }

  card.append(meta, heading, fullTitle, authors, summary, tags, links);
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
  if (state.page !== 1) params.set("page", state.page);
  if (state.pageSize !== 12) params.set("perPage", state.pageSize);
  if (state.mapMode === "authors") params.set("view", "authors");
  const query = params.toString();
  history.replaceState(null, "", `${location.pathname}${query ? `?${query}` : ""}${location.hash}`);
}

function filterDescription() {
  const timeLabel = state.window === "custom" && state.customStart && state.customEnd
    ? `${state.customStart} — ${state.customEnd}`
    : windowLabel(state.window);
  const parts = [
    t("filterDesc.cluster", { value: state.topicSource === "cluster" ? state.topicLabel : t("filterDesc.allClusters") }),
    t("filterDesc.relation", { value: relationLabel(state.relation) }),
    t("filterDesc.time", { value: timeLabel }),
    t("filterDesc.sort", { value: sortLabel(state.sort) }),
  ];
  if (state.topicSource === "tag") parts.push(t("filterDesc.tag", { value: state.topicLabel }));
  if (state.topicSource === "author") parts.push(t("filterDesc.author", { value: state.topicLabel }));
  if (state.topicSource === "institution") parts.push(t("filterDesc.institution", { value: state.topicLabel }));
  if (state.query) parts.push(t("filterDesc.search", { value: state.query }));
  return parts.join(window.DiTI18n.language === "zh" ? "；" : "; ");
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
  return `diffusion-intelligence-papers-${date}-${count}.${extension}`;
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
  const separator = window.DiTI18n.language === "zh" ? "：" : ": ";
  const sections = papers.map((paper, index) => {
    const tags = paper.topic_tags.split(";").filter(Boolean).map((tag) => `\`${escapeMarkdown(tag)}\``).join(" · ");
    return [
      `## ${index + 1}. [${escapeMarkdown(paper.title)}](${paper.arxiv_url})`,
      "",
      `- ${t("export.shortTitle")}${separator}${escapeMarkdown(paper.short_title)}`,
      `- ${t("export.authors")}${separator}${escapeMarkdown(paper.authors)}`,
      `- ${t("export.keyAuthors")}${separator}${escapeMarkdown(paper.key_authors || "-")}`,
      `- ${t("export.published")}${separator}${paper.published}`,
      `- ${t("export.cluster")}${separator}${escapeMarkdown(clusterLabelForPaper(paper))}`,
      `- ${t("export.relation")}${separator}${escapeMarkdown(relationLabel(paper.dit_relation))}`,
      `- ${t("export.source")}${separator}${escapeMarkdown(paper.venue)}`,
      `- ${t("export.tags")}${separator}${tags || "-"}`,
      `- ${escapeMarkdown(paper.source_label || "arXiv")}${separator}[${paper.arxiv_url}](${paper.arxiv_url})`,
      `- PDF${separator}[${paper.pdf_url}](${paper.pdf_url})`,
      "",
      escapeMarkdown(paperSummary(paper)),
    ].join("\n");
  });
  return [
    `# ${t("export.title")}`,
    "",
    `- ${t("export.paperCount", { count: papers.length })}`,
    `- ${t("export.conditions", { value: escapeMarkdown(filterDescription()) })}`,
    `- ${t("export.generated", { value: generated })}`,
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
        <p class="meta">${index + 1} · ${escapeHTML(paper.published)} · ${escapeHTML(paper.venue)} · ${escapeHTML(relationLabel(paper.dit_relation))}</p>
        <h2><a href="${escapeHTML(paper.arxiv_url)}">${escapeHTML(paper.title)}</a></h2>
        <p class="short-title">${escapeHTML(paper.short_title)} · ${escapeHTML(clusterLabelForPaper(paper))}</p>
        <p class="authors">${escapeHTML(paper.authors)}</p>
        <p>${escapeHTML(paperSummary(paper))}</p>
        <ul class="tags">${tags}</ul>
        <p class="links"><a href="${escapeHTML(paper.arxiv_url)}">${escapeHTML(paper.source_label || "arXiv")}</a><a href="${escapeHTML(paper.pdf_url)}">PDF</a></p>
      </article>`;
  }).join("");

  return `<!doctype html>
<html lang="${window.DiTI18n.language === "zh" ? "zh-CN" : "en"}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHTML(t("export.title"))}</title>
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
    .meta, .short-title, .authors, header p { margin: 0; color: var(--muted); font-size: .85rem; }
    article > p { margin: 9px 0; }
    .tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0; padding: 0; list-style: none; }
    .tags li { padding: 2px 7px; border: 1px solid var(--border); border-radius: 3px; background: var(--tag); font-size: .75rem; }
    .links { display: flex; gap: 12px; }
    @media print { body { max-width: none; padding: 0; } article { break-inside: avoid; } }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHTML(t("export.title"))}</h1>
    <p>${escapeHTML(t("export.paperCount", { count: papers.length }))}</p>
    <p>${escapeHTML(filterDescription())}</p>
    <p>${escapeHTML(t("export.generated", { value: generated }))}</p>
  </header>
  <main>${cards}</main>
</body>
</html>`;
}

function updateExportCount(value) {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) return;
  elements.exportCount.textContent = count.toLocaleString(window.DiTI18n.language === "zh" ? "zh-CN" : "en-US");
  elements.exportCountLabel.textContent = t(count === 1 ? "stats.export" : "stats.exports");
  localStorage.setItem(EXPORT_COUNT_CACHE_KEY, String(count));
}

async function requestExportCount({ increment = false } = {}) {
  const url = increment ? `${EXPORT_COUNTER_URL}/up` : `${EXPORT_COUNTER_URL}/`;
  const response = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!increment && response.status === 400) {
    updateExportCount(0);
    return;
  }
  if (!response.ok) throw new Error(`Export counter HTTP ${response.status}`);
  const payload = await response.json();
  updateExportCount(payload.count);
}

function loadExportCount() {
  const cached = Number(localStorage.getItem(EXPORT_COUNT_CACHE_KEY));
  if (Number.isSafeInteger(cached) && cached >= 0) updateExportCount(cached);
  requestExportCount().catch((error) => console.warn("Export count unavailable", error));
}

function recordExport() {
  requestExportCount({ increment: true }).catch((error) => console.warn("Export count could not be updated", error));
}

function exportCurrent(format) {
  const papers = filteredPapers();
  if (!papers.length) return;
  if (format === "markdown") {
    downloadText(markdownExport(papers), exportFilename("md", papers.length), "text/markdown");
    elements.exportStatus.textContent = t(papers.length === 1 ? "export.successOne" : "export.success", { count: papers.length, format: "Markdown" });
  } else {
    downloadText(htmlExport(papers), exportFilename("html", papers.length), "text/html");
    elements.exportStatus.textContent = t(papers.length === 1 ? "export.successOne" : "export.success", { count: papers.length, format: "HTML" });
  }
  recordExport();
}

function setExportMenuOpen(open) {
  const shouldOpen = Boolean(open) && !elements.exportMenuToggle.disabled;
  elements.exportMenuOptions.hidden = !shouldOpen;
  elements.exportMenuToggle.setAttribute("aria-expanded", String(shouldOpen));
}

function pageSequence(totalPages, currentPage) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const ordered = [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
  const sequence = [];
  ordered.forEach((page, index) => {
    if (index && page - ordered[index - 1] > 1) sequence.push("ellipsis");
    sequence.push(page);
  });
  return sequence;
}

function goToPage(page) {
  state.page = page;
  render();
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  elements.resultCount.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
}

function renderPagination(total) {
  if (!total) {
    elements.pagination.hidden = true;
    return;
  }
  const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
  state.page = Math.min(Math.max(1, state.page), totalPages);
  const start = (state.page - 1) * state.pageSize + 1;
  const end = Math.min(total, state.page * state.pageSize);
  elements.pagination.hidden = false;
  elements.paginationSummary.textContent = t("pagination.summary", { start, end, total });
  elements.pageSize.value = String(state.pageSize);

  const previous = createElement("button", "page-direction", t("pagination.previous"));
  previous.type = "button";
  previous.disabled = state.page === 1;
  previous.addEventListener("click", () => goToPage(state.page - 1));

  const next = createElement("button", "page-direction", t("pagination.next"));
  next.type = "button";
  next.disabled = state.page === totalPages;
  next.addEventListener("click", () => goToPage(state.page + 1));

  const controls = [previous];
  pageSequence(totalPages, state.page).forEach((item) => {
    if (item === "ellipsis") {
      const ellipsis = createElement("span", "page-ellipsis", "…");
      ellipsis.setAttribute("aria-hidden", "true");
      controls.push(ellipsis);
      return;
    }
    const button = createElement("button", "page-number", String(item));
    button.type = "button";
    button.classList.toggle("active", item === state.page);
    button.setAttribute("aria-label", t(item === state.page ? "pagination.current" : "pagination.page", { page: item }));
    if (item === state.page) button.setAttribute("aria-current", "page");
    button.addEventListener("click", () => goToPage(item));
    controls.push(button);
  });
  controls.push(next);
  elements.pageButtons.replaceChildren(...controls);
}

function render() {
  const filtered = filteredPapers();
  const totalPages = Math.max(1, Math.ceil(filtered.length / state.pageSize));
  state.page = Math.min(Math.max(1, state.page), totalPages);
  const pageStart = (state.page - 1) * state.pageSize;
  const visiblePapers = filtered.slice(pageStart, pageStart + state.pageSize);
  elements.paperList.replaceChildren(...visiblePapers.map(createPaperCard));
  const activeContext = [];
  if (state.topicSource === "tag" && state.topicLabel) activeContext.push(t("results.tag", { value: state.topicLabel }));
  if (state.topicSource === "author" && state.topicLabel) activeContext.push(t("results.author", { value: state.topicLabel }));
  if (state.topicSource === "institution" && state.topicLabel) activeContext.push(t("results.institution", { value: state.topicLabel }));
  if (state.window === "custom" && state.customStart && state.customEnd) {
    activeContext.push(t("results.date", { start: state.customStart, end: state.customEnd }));
  }
  elements.resultCount.textContent = `${t("results.count", { count: filtered.length, total: state.papers.length })}${activeContext.length ? ` · ${activeContext.join(" · ")}` : ""}`;
  elements.exportMenuToggle.textContent = t(filtered.length === 1 ? "export.selectionCountOne" : "export.selectionCount", { count: filtered.length });
  elements.exportMenuToggle.title = t("export.chooseFormat", { count: filtered.length });
  elements.exportMenuToggle.disabled = filtered.length === 0;
  elements.exportMarkdown.disabled = filtered.length === 0;
  elements.exportHTML.disabled = filtered.length === 0;
  if (filtered.length === 0) setExportMenuOpen(false);
  elements.exportStatus.textContent = "";
  elements.empty.hidden = filtered.length > 0;
  elements.paperList.hidden = filtered.length === 0;
  renderPagination(filtered.length);

  renderClusterFilters();
  updateURL();
  syncLandscapeListFilter();
}

function renderClusterFilters() {
  if (!state.clusters.length) {
    elements.categories.textContent = t("cluster.computing");
    return;
  }
  const availableIds = new Set(
    state.papers
      .filter((paper) => matchesPaper(paper, { includeTopic: false }))
      .map((paper) => paper.arxiv_id),
  );
  const choices = [
    { id: "all", name: t("cluster.all"), ids: state.papers.map((paper) => paper.arxiv_id) },
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
      state.page = 1;
      window.DiTAuthors?.clearAuthorFilter?.();
      window.DiTAuthors?.clearInstitutionFilter?.();
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
  const page = Number.parseInt(params.get("page") ?? "1", 10);
  const pageSize = Number.parseInt(params.get("perPage") ?? "12", 10);
  state.mapMode = params.get("view") === "authors" ? "authors" : "topics";
  state.query = params.get("q") ?? "";
  if (relation === "all" || relation in RELATION_KEYS) state.relation = relation;
  if (["all", "in-window", "background"].includes(windowValue)) state.window = windowValue;
  if (windowValue === "custom" && /^\d{4}-\d{2}-\d{2}$/.test(customStart ?? "") && /^\d{4}-\d{2}-\d{2}$/.test(customEnd ?? "")) {
    state.window = "custom";
    state.customStart = customStart;
    state.customEnd = customEnd;
  }
  if (["newest", "oldest", "title"].includes(sort)) state.sort = sort;
  if (Number.isInteger(page) && page > 0) state.page = page;
  if ([12, 24, 48].includes(pageSize)) state.pageSize = pageSize;

  elements.search.value = state.query;
  elements.relation.value = state.relation;
  elements.window.value = state.window;
  elements.sort.value = state.sort;
  elements.pageSize.value = String(state.pageSize);
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
  } else if (state.topicSource !== "tag") {
    clearTopicFilter();
  }
  render();
  window.DiTAuthors?.setClusters(clusters);
}

function bindEvents() {
  elements.theme.addEventListener("click", () => {
    const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("dit-paper-theme", theme);
    document.querySelector('meta[name="theme-color"]').content = theme === "dark" ? "#1c1c1d" : "#ffffff";
    window.DiTLandscape?.themeChanged();
    window.DiTAuthors?.themeChanged();
  });
  elements.modeTopics.addEventListener("click", () => setLandscapeMode("topics"));
  elements.modeAuthors.addEventListener("click", () => setLandscapeMode("authors"));
  elements.search.addEventListener("input", (event) => {
    state.query = event.target.value.trim();
    if (state.initialized) state.page = 1;
    render();
  });
  elements.relation.addEventListener("change", (event) => {
    state.relation = event.target.value;
    if (state.initialized) state.page = 1;
    render();
  });
  elements.window.addEventListener("change", (event) => {
    state.window = event.target.value;
    state.customStart = null;
    state.customEnd = null;
    state.page = 1;
    syncLandscapeTimeFilter();
    render();
  });
  elements.sort.addEventListener("change", (event) => {
    state.sort = event.target.value;
    state.page = 1;
    render();
  });
  elements.pageSize.addEventListener("change", (event) => {
    state.pageSize = Number(event.target.value);
    state.page = 1;
    render();
  });
  elements.exportMenuToggle.addEventListener("click", () => {
    setExportMenuOpen(elements.exportMenuOptions.hidden);
  });
  elements.exportMarkdown.addEventListener("click", () => {
    exportCurrent("markdown");
    setExportMenuOpen(false);
  });
  elements.exportHTML.addEventListener("click", () => {
    exportCurrent("html");
    setExportMenuOpen(false);
  });
  document.addEventListener("click", (event) => {
    if (!elements.exportMenu.contains(event.target)) setExportMenuOpen(false);
  });
  window.addEventListener("dit:landscape-clusters-ready", (event) => {
    if (Array.isArray(event.detail?.clusters)) applyClusterCatalog(event.detail.clusters);
  });
  window.addEventListener("dit:landscape-topic-filter", (event) => {
    const ids = event.detail?.ids;
    state.topicIds = Array.isArray(ids) ? new Set(ids) : null;
    state.topicLabel = event.detail?.label ?? "";
    state.topicSource = event.detail?.source ?? null;
    state.cluster = state.topicSource === "cluster" ? String(event.detail.cluster) : "all";
    if (state.topicSource !== "author") window.DiTAuthors?.clearAuthorFilter?.();
    if (state.topicSource !== "institution") window.DiTAuthors?.clearInstitutionFilter?.();
    if (state.initialized) state.page = 1;
    render();
  });
  window.addEventListener("dit:landscape-time-filter", (event) => {
    const { start, end, fullRange } = event.detail ?? {};
    if (fullRange) {
      state.window = "all";
      state.customStart = null;
      state.customEnd = null;
      window.DiTAuthors?.setTimePreset("all");
    } else if (start && end) {
      state.window = "custom";
      state.customStart = start;
      state.customEnd = end;
      window.DiTAuthors?.setTimeRange(start, end);
    }
    if (state.initialized) state.page = 1;
    elements.window.value = state.window;
    render();
  });
  window.addEventListener("dit:language-change", () => {
    const cached = Number(localStorage.getItem(EXPORT_COUNT_CACHE_KEY));
    if (Number.isSafeInteger(cached) && cached >= 0) updateExportCount(cached);
    render();
    setLandscapeMode(state.mapMode, { updateHistory: false });
  });
  elements.reset.addEventListener("click", resetAllFilters);
  elements.landscapeReset.addEventListener("click", resetAllFilters);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.exportMenuOptions.hidden) {
      setExportMenuOpen(false);
      elements.exportMenuToggle.focus();
      return;
    }
    if (event.key === "/" && document.activeElement?.tagName !== "INPUT") {
      event.preventDefault();
      elements.search.focus();
    }
  });
}

async function initialize() {
  loadExportCount();
  startDeployVersionMonitor();
  try {
    const [response, englishSummaries, abstractsPayload, precomputedLandscape] = await Promise.all([
      fetch(DATA_URL, { cache: "no-store" }),
      fetch(ENGLISH_SUMMARIES_URL, { cache: "no-store" })
        .then((summariesResponse) => summariesResponse.ok ? summariesResponse.json() : {})
        .catch(() => ({})),
      fetch(ABSTRACTS_URL, { cache: "force-cache" })
        .then((abstractsResponse) => abstractsResponse.ok ? abstractsResponse.json() : { papers: {} })
        .catch(() => ({ papers: {} })),
      fetch(PRECOMPUTED_LANDSCAPE_URL, { cache: "force-cache" })
        .then((landscapeResponse) => landscapeResponse.ok ? landscapeResponse.json() : null)
        .catch(() => null),
    ]);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.abstracts = new Map(Object.entries(abstractsPayload.papers ?? {}));
    state.papers = parseCSV(await response.text()).map((paper) => {
      const abstract = state.abstracts.get(paper.arxiv_id) ?? {};
      return {
        ...paper,
        summary_en: englishSummaries[paper.arxiv_id] ?? "",
        abstract_en: abstract.en ?? "",
        abstract_zh: abstract.zh ?? "",
      };
    });
    const usablePrecomputedLandscape = precomputedLandscape?.catalogSignature === catalogSignature(state.papers)
      ? precomputedLandscape
      : null;
    readURLState();
    bindEvents();
    elements.total.textContent = state.papers.length;
    elements.windowCount.textContent = state.papers.filter((paper) => paper.window === "in-window").length;
    render();
    window.DiTLandscape?.init(state.papers, usablePrecomputedLandscape);
    window.DiTAuthors?.init(state.papers, usablePrecomputedLandscape);
    syncLandscapeTimeFilter();
    syncLandscapeListFilter();
    setLandscapeMode(state.mapMode, { updateHistory: false });
    state.initialized = true;
  } catch (error) {
    elements.resultCount.textContent = t("error.catalog");
    elements.empty.hidden = false;
    elements.empty.querySelector("p").textContent = t("error.empty");
    elements.reset.hidden = true;
    console.error(error);
  }
}

initialize();
