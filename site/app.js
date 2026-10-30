const CATALOG_VERSION = "20261030-editorial-taxonomy-v1";
const DEPLOY_ASSET_VERSION = document.querySelector('meta[name="deploy-version"]')?.content;
const DATA_VERSION = DEPLOY_ASSET_VERSION && !DEPLOY_ASSET_VERSION.startsWith("__")
  ? DEPLOY_ASSET_VERSION
  : CATALOG_VERSION;
const DATA_URL = `./data/papers.csv?v=${DATA_VERSION}`;
const ENGLISH_SUMMARIES_URL = `./data/summaries_en.json?v=${DATA_VERSION}`;
const ABSTRACTS_URL = `./data/abstracts.json?v=${DATA_VERSION}`;
const PAPER_DETAILS_URL = `./data/paper_details.json?v=${DATA_VERSION}`;
const TAXONOMY_URL = `./data/taxonomy.json?v=${DATA_VERSION}`;
const PAPER_TAXONOMY_URL = `./data/paper_taxonomy.json?v=${DATA_VERSION}`;
const PRECOMPUTED_LANDSCAPE_URL = `./data/landscape.json?v=${DATA_VERSION}`;
const DEPLOY_VERSION_URL = "./version.json";
const DEPLOY_CHECK_INTERVAL_MS = 15000;
const EXPORT_COUNTER_URL = "https://api.counterapi.dev/v1/jasonchen9-dit-paper-landscape/paper-exports";
const EXPORT_COUNT_CACHE_KEY = "dit-paper-export-count-cache";
let activeDeployVersion = null;
let deployCheckTimer = null;
let deployRefreshStarted = false;
let personalLibraryReady = false;
let selectedLibraryPaperId = null;
try {
  if (sessionStorage.getItem("dit-library-restore") === "1") history.scrollRestoration = "manual";
} catch { /* The catalog remains usable when session storage is blocked. */ }

async function restoreLibraryScroll(value) {
  if (!value) return;
  if (document.readyState !== "complete") await new Promise(resolve => window.addEventListener("load", resolve, {once:true}));
  if (document.fonts?.ready) await document.fonts.ready;
  requestAnimationFrame(() => window.scrollTo({top:Math.max(0, Number(value.scrollY) || 0), behavior:"instant"}));
}

function saveLibraryReturnState() {
  try {
    sessionStorage.setItem("dit-library-return", JSON.stringify({
      url:location.pathname + location.search + location.hash, scrollY:window.scrollY,
      topicIds:state.topicIds ? [...state.topicIds] : null, topicLabel:state.topicLabel,
      topicSource:state.topicSource, mapSearchQuery:state.mapSearchQuery,
      expandedAbstracts:[...state.expandedAbstracts],
      topicView:window.DiTLandscape?.getViewState(), authorView:window.DiTAuthors?.getViewState(),
    }));
  } catch (error) { console.warn("Could not remember map position", error); }
}

function readLibraryReturnState() {
  try {
    if (sessionStorage.getItem("dit-library-restore") !== "1") return null;
    sessionStorage.removeItem("dit-library-restore");
    const value = JSON.parse(sessionStorage.getItem("dit-library-return") || "null");
    if (!value || new URL(value.url, location.href).origin !== location.origin) return null;
    return value;
  } catch { return null; }
}

function applyLibraryReturnState(value) {
  if (!value) return;
  const valid = new Set(state.papers.map(paper => paper.arxiv_id));
  if (["tag", "author", "institution"].includes(value.topicSource) && Array.isArray(value.topicIds)) {
    state.topicIds = new Set(value.topicIds.filter(id => valid.has(id)));
    state.topicSource = value.topicSource;
    state.topicLabel = String(value.topicLabel || "");
  }
  state.expandedAbstracts = new Set((value.expandedAbstracts || []).filter(id => valid.has(id)));
  state.mapSearchQuery = String(value.mapSearchQuery || "");
  elements.mapSearchInput.value = state.mapSearchQuery;
}

function mountMapSaveButton() {
  if (!personalLibraryReady || !selectedLibraryPaperId) return;
  const paper = state.papers.find(paper => paper.arxiv_id === selectedLibraryPaperId);
  const links = document.querySelector("#landscape-selection .selection-links");
  if (!paper || !links || links.querySelector("[data-library-map-save]")) return;
  const button = window.DiTLibraryUI.createSaveButton(paper, {store:window.DiTLibraryStore});
  button.dataset.libraryMapSave = "true";
  links.append(button);
}

function onPaperSelection(event) {
  selectedLibraryPaperId = event.detail?.paperId;
  mountMapSaveButton();
}

async function initializePersonalLibrary(aliases, returnState) {
  const sidebar = document.querySelector("#library-sidebar");
  try {
    await window.DiTLibraryStore.init(aliases);
    personalLibraryReady = true;
    await window.DiTLibraryUI.initSidebar(sidebar, {
      store:window.DiTLibraryStore, papers:state.papers, onNavigate:saveLibraryReturnState,
    });
    render();
    mountMapSaveButton();
    restoreLibraryScroll(returnState);
  } catch (error) {
    const show = () => { sidebar.textContent = window.DiTI18n.language === "zh"
      ? "收藏存储暂时不可用。请检查浏览器的站点存储设置后刷新。"
      : "Library storage is unavailable. Check browser site-storage settings and reload."; };
    show();
    window.addEventListener("dit:language-change", show);
    console.error("Library unavailable", error);
    restoreLibraryScroll(returnState);
  }
}

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
  mapSearchQuery: "",
  mapSearchOpen: false,
  page: 1,
  pageSize: 12,
  initialized: false,
  similarityModel: "tag-tfidf",
  taxonomy: null,
  facets: { domains: new Set(), layers: new Set(), collections: new Set() },
};

const elements = {
  search: document.querySelector("#search-input"),
  relation: document.querySelector("#relation-select"),
  window: document.querySelector("#window-select"),
  sort: document.querySelector("#sort-select"),
  categories: document.querySelector("#category-filters"),
  facets: document.querySelector("#facet-filters"),
  filterReset: document.querySelector("#filter-reset"),
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
  mapSearch: document.querySelector("#map-search"),
  mapSearchInput: document.querySelector("#map-search-input"),
  mapSearchClear: document.querySelector("#map-search-clear"),
  mapSearchStatus: document.querySelector("#map-search-status"),
  mapSearchResults: document.querySelector("#map-search-results"),
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

function taxonomySignature(papers) {
  const value = papers.map((paper) => [paper.arxiv_id, paper.primary_topic || paper.taxonomy?.primary_topic || ""].join("\t")).join("\n");
  let hash = 2166136261;
  for (const char of value) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function localizedLabel(option) {
  return option.label[window.DiTI18n.language] || option.label.en;
}

function facetValues(paper, dimension) {
  const field = state.taxonomy.facets[dimension].field;
  return dimension === "collections" ? paper.collection_tags.split(";").filter(Boolean) : paper.taxonomy[field];
}

function facetLabels(paper, dimension) {
  const values = new Set(facetValues(paper, dimension));
  return state.taxonomy.facets[dimension].options.filter((option) => values.has(option.id)).map(localizedLabel);
}

function clusterLabelForPaper(paper) {
  return t(`cluster.${paper.primary_topic}`);
}

function paperSummary(paper) {
  return window.DiTI18n.language === "zh" ? paper.summary_zh : paper.summary_en || paper.summary_zh;
}

const CARD_FIELDS = ["background", "challenge", "method", "result"];

function paperDetails(paper) {
  const language = window.DiTI18n.language;
  return CARD_FIELDS.map((key) => ({ key, text: paper.details?.[key]?.[language] || "" }))
    .filter(({ text }) => text);
}

function paperSource(paper) {
  return { url: paper.venue_url || paper.arxiv_url, label: paper.venue_url ? paperVenue(paper) : paper.source_label || t("paper.source") };
}

function paperVenue(paper) {
  if (paper.venue === "Publication venue unverified") return t("paper.venueUnknown");
  if (paper.venue === "arXiv preprint") return t("paper.arxivPreprint");
  return paper.venue;
}

function publicationBounds(value) {
  if (/^\d{4}$/.test(value)) return [`${value}-01-01`, `${value}-12-31`];
  if (/^\d{4}-\d{2}$/.test(value)) return [`${value}-01`, `${value}-31`];
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? [value, value] : null;
}

function matchesPaper(paper, { includeTopic = true, includePrimary = true, includeTime = true, excludeFacet = null } = {}) {
  if (includePrimary && state.cluster !== "all" && paper.primary_topic !== state.taxonomy.topics[Number(state.cluster)]?.id) return false;
  for (const [dimension, selected] of Object.entries(state.facets)) {
    if (dimension !== excludeFacet && selected.size && !facetValues(paper, dimension).some((value) => selected.has(value))) return false;
  }
  if (state.relation !== "all" && paper.dit_relation !== state.relation) return false;
  if (includeTime && state.window === "custom") {
    if (!state.customStart || !state.customEnd) return false;
    const bounds = publicationBounds(paper.published);
    if (!bounds || bounds[1] < state.customStart || bounds[0] > state.customEnd) return false;
  } else if (includeTime && state.window !== "all" && paper.window !== state.window) {
    return false;
  }
  if (includeTopic && state.topicIds && !state.topicIds.has(paper.arxiv_id)) return false;
  if (!state.query) return true;

  const haystack = normalize(
    [
      paper.arxiv_id,
      paper.short_title,
      paper.title,
      paper.title_zh,
      paper.alternate_titles,
      paper.authors,
      paper.alternate_titles,
      paper.venue,
      paper.topic_tags,
      paper.summary_en,
      paper.summary_zh,
      paper.abstract_en,
      paper.abstract_zh,
      ...Object.keys(state.facets).flatMap((dimension) => facetLabels(paper, dimension)),
      ...CARD_FIELDS.flatMap((key) => [paper.details?.[key]?.en, paper.details?.[key]?.zh]),
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
  renderMapSearch();
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
  state.mapSearchQuery = "";
  state.mapSearchOpen = false;
  elements.mapSearchInput.value = "";
  window.DiTLandscape?.setMapSearch?.("");
  window.DiTAuthors?.setMapSearch?.("");
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
  Object.values(state.facets).forEach((selected) => selected.clear());
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
  const changed = state.mapMode !== (mode === "authors" ? "authors" : "topics");
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
  const tagMap = state.similarityModel === "tag-tfidf";
  elements.landscapeDescription.textContent = t(authors
    ? (tagMap ? "authors.descriptionTags" : "authors.description")
    : (tagMap ? "landscape.descriptionTags" : "landscape.description"));
  if (authors && changed) window.DiTAuthors?.fitView();
  renderMapSearch();
  if (updateHistory) updateURL();
}

function mapSearchController() {
  return state.mapMode === "authors" ? window.DiTAuthors : window.DiTLandscape;
}

function renderMapSearch() {
  const query = state.mapSearchQuery.trim();
  const matches = mapSearchController()?.setMapSearch?.(query) || [];
  elements.mapSearchInput.placeholder = t(state.mapMode === "authors" ? "mapSearch.authors" : "mapSearch.papers");
  elements.mapSearchClear.hidden = !query;
  elements.mapSearchStatus.textContent = !query ? t("mapSearch.hint")
    : matches.length ? t("mapSearch.matches", { count: matches.length }) : t("mapSearch.empty");
  elements.mapSearchResults.replaceChildren();
  elements.mapSearchResults.hidden = !query || !state.mapSearchOpen || !matches.length;
  if (elements.mapSearchResults.hidden) return;
  matches.slice(0, 8).forEach((match) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "map-search-result";
    button.append(createElement("strong", "", match.title));
    if (match.subtitle) button.append(createElement("small", "", match.subtitle));
    button.addEventListener("click", () => {
      mapSearchController()?.locateSearchResult?.(match.id);
      state.mapSearchOpen = false;
      renderMapSearch();
      elements.mapSearchInput.focus({ preventScroll: true });
      // Focus can reopen suggestions; keep them closed after choosing a result.
      state.mapSearchOpen = false;
      elements.mapSearchResults.hidden = true;
    });
    elements.mapSearchResults.append(button);
  });
  if (matches.length > 8) {
    elements.mapSearchResults.append(createElement("p", "map-search-more", t("mapSearch.more", { count: matches.length })));
  }
}

function createElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function createLink(label, url, className = "") {
  if (!/^https?:\/\//i.test(url || "")) return createElement("span", className, label.replace(/ ↗$/, ""));
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
    createElement("span", "", paper.published || t("paper.dateUnknown")),
    createElement("span", "", `· ${paperVenue(paper)}`),
  );
  if (paper.venue_status?.startsWith("author-reported")) meta.append(createElement("span", "", `· ${t("paper.authorReported")}`));

  const heading = createElement("h3");
  const source = paperSource(paper);
  const titleLink = createLink(paper.short_title, source.url);
  heading.append(titleLink);

  const fullTitle = createElement("p", "full-title", window.DiTI18n.language === "zh" && paper.title_zh
    ? `${paper.title_zh} · ${paper.title}` : paper.title);
  const authors = createElement("p", "paper-authors", paper.authors);
  const classification = createElement("div", "paper-classification");
  const primary = createElement("span", "primary-topic-badge", clusterLabelForPaper(paper));
  primary.title = paper.taxonomy.primary_reason[window.DiTI18n.language];
  classification.append(primary);
  const domains = facetLabels(paper, "domains");
  const layers = facetLabels(paper, "layers");
  if (domains.length) classification.append(createElement("span", "", `${t("facet.domains")}: ${domains.join(" / ")}`));
  if (layers.length) classification.append(createElement("span", "", `${t("facet.layers")}: ${layers.join(" / ")}`));
  const details = paperDetails(paper);
  const summary = createElement(details.length ? "dl" : "p", details.length ? "paper-details" : "summary");
  if (details.length) {
    for (const { key, text } of details) {
      summary.append(createElement("dt", "", t(`paper.${key}`)), createElement("dd", "", text));
    }
  } else summary.textContent = paperSummary(paper);

  const tags = createElement("ul", "tag-list");
  for (const tag of paper.topic_tags.split(";").filter(Boolean)) {
    tags.append(createElement("li", "", tag));
  }

  const links = createElement("div", "card-links");
  links.append(createLink(`${source.label} ↗`, source.url));
  if (paper.arxiv_url && paper.arxiv_url !== source.url) links.append(createLink(`${paper.source_label || t("paper.preprint")} ↗`, paper.arxiv_url));
  if (paper.pdf_url) links.append(createLink(t("paper.pdf"), paper.pdf_url));
  if (personalLibraryReady) links.append(window.DiTLibraryUI.createSaveButton(paper, {store:window.DiTLibraryStore}));

  const abstractRecord = state.abstracts.get(paper.arxiv_id);
  const abstractLanguage = window.DiTI18n.language === "zh" && abstractRecord?.zh_kind === "translation" ? "zh" : "en";
  const abstractText = abstractRecord?.en_kind === "source-abstract" ? abstractRecord[abstractLanguage] : "";
  const expanded = state.expandedAbstracts.has(paper.arxiv_id);
  if (abstractText) {
    const panelId = `abstract-${paper.arxiv_id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
    const toggle = createElement("button", "abstract-toggle", t("paper.abstract"));
    toggle.type = "button";
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.setAttribute("aria-controls", panelId);
    toggle.classList.toggle("active", expanded);

    const panel = createElement("div", "paper-abstract");
    panel.id = panelId;
    panel.classList.toggle("is-open", expanded);
    panel.setAttribute("aria-hidden", String(!expanded));
    panel.inert = !expanded;
    const panelInner = createElement("div", "paper-abstract-inner");
    panelInner.append(createElement("p", "paper-abstract-text", abstractText));
    const provenance = createLink(
      t(abstractLanguage === "zh" ? "paper.abstractTranslation" : "paper.abstractSource", {
        source: abstractRecord.source,
      }),
      abstractRecord.source_url,
      "paper-abstract-source",
    );
    panelInner.append(provenance);
    panel.append(panelInner);

    let closeTimer = null;
    const canHover = () => window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const setExpanded = (nextExpanded, persist = false) => {
      if (closeTimer !== null) {
        clearTimeout(closeTimer);
        closeTimer = null;
      }
      if (persist) {
        if (nextExpanded) state.expandedAbstracts.add(paper.arxiv_id);
        else state.expandedAbstracts.delete(paper.arxiv_id);
      }
      panel.classList.toggle("is-open", nextExpanded);
      panel.setAttribute("aria-hidden", String(!nextExpanded));
      panel.inert = !nextExpanded;
      toggle.classList.toggle("active", nextExpanded);
      toggle.setAttribute("aria-expanded", String(nextExpanded));
    };
    const scheduleClose = (preserveFocusedContent = false) => {
      if (!canHover()) return;
      if (closeTimer !== null) clearTimeout(closeTimer);
      closeTimer = window.setTimeout(() => {
        if (state.expandedAbstracts.has(paper.arxiv_id)) return;
        const focusWithin = preserveFocusedContent
          && (toggle === document.activeElement || panel.contains(document.activeElement));
        if (!toggle.matches(":hover") && !panel.matches(":hover") && !focusWithin) setExpanded(false);
      }, 110);
    };

    toggle.addEventListener("pointerenter", () => {
      if (canHover()) setExpanded(true);
    });
    toggle.addEventListener("pointerleave", () => scheduleClose(false));
    panel.addEventListener("pointerenter", () => {
      if (canHover()) setExpanded(true);
    });
    panel.addEventListener("pointerleave", () => scheduleClose(false));
    toggle.addEventListener("focus", () => setExpanded(true));
    toggle.addEventListener("blur", () => scheduleClose(true));
    panel.addEventListener("focusin", () => setExpanded(true));
    panel.addEventListener("focusout", () => scheduleClose(true));
    toggle.addEventListener("click", () => {
      setExpanded(!state.expandedAbstracts.has(paper.arxiv_id), true);
    });
    links.append(toggle);
    card.append(meta, heading, fullTitle, authors, classification, summary, tags, links, panel);
    return card;
  }

  card.append(meta, heading, fullTitle, authors, classification, summary, tags, links);
  return card;
}

function updateURL() {
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  if (state.cluster !== "all") params.set("topic", state.taxonomy.topics[Number(state.cluster)].id);
  for (const [dimension, selected] of Object.entries(state.facets)) {
    if (selected.size) params.set(dimension, [...selected].sort().join(","));
  }
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
    t("filterDesc.cluster", { value: state.cluster === "all" ? t("filterDesc.allClusters") : localizedLabel(state.taxonomy.topics[Number(state.cluster)]) }),
    t("filterDesc.relation", { value: relationLabel(state.relation) }),
    t("filterDesc.time", { value: timeLabel }),
    t("filterDesc.sort", { value: sortLabel(state.sort) }),
  ];
  if (state.topicSource === "tag") parts.push(t("filterDesc.tag", { value: state.topicLabel }));
  if (state.topicSource === "author") parts.push(t("filterDesc.author", { value: state.topicLabel }));
  if (state.topicSource === "institution") parts.push(t("filterDesc.institution", { value: state.topicLabel }));
  if (state.query) parts.push(t("filterDesc.search", { value: state.query }));
  for (const [dimension, selected] of Object.entries(state.facets)) {
    if (selected.size) parts.push(`${t(`facet.${dimension}`)}: ${state.taxonomy.facets[dimension].options.filter((option) => selected.has(option.id)).map(localizedLabel).join(" / ")}`);
  }
  return parts.join(window.DiTI18n.language === "zh" ? "；" : "; ");
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
  const result = window.DiTExport.download(papers, format, {taxonomy:state.taxonomy, description:filterDescription()});
  elements.exportStatus.textContent = t(papers.length === 1 ? "export.successOne" : "export.success", {count:papers.length, format:result.format});
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
  renderFacetFilters();
  updateURL();
  syncLandscapeListFilter();
}

function renderFacetFilters() {
  if (!state.taxonomy) return;
  const groups = Object.entries(state.taxonomy.facets).map(([dimension, definition]) => {
    const fieldset = createElement("fieldset", "facet-group");
    fieldset.append(createElement("legend", "", t(`facet.${dimension}`)));
    if (dimension === "layers") fieldset.append(createElement("p", "facet-note", t("taxonomy.layerHelp")));
    const choices = createElement("div", "facet-options");
    const available = state.papers.filter((paper) => matchesPaper(paper, { excludeFacet: dimension }));
    for (const option of definition.options) {
      const count = available.filter((paper) => facetValues(paper, dimension).includes(option.id)).length;
      const selected = state.facets[dimension].has(option.id);
      const button = createElement("button", "facet-option");
      button.type = "button";
      button.dataset.facet = dimension;
      button.dataset.value = option.id;
      button.setAttribute("aria-pressed", String(selected));
      button.classList.toggle("active", selected);
      button.append(document.createTextNode(localizedLabel(option)), createElement("span", "facet-count", String(count)));
      button.addEventListener("click", () => {
        if (selected) state.facets[dimension].delete(option.id);
        else state.facets[dimension].add(option.id);
        state.page = 1;
        render();
        elements.facets.querySelector(`[data-facet="${dimension}"][data-value="${option.id}"]`)?.focus({ preventScroll: true });
      });
      choices.append(button);
    }
    fieldset.append(choices);
    return fieldset;
  });
  elements.facets.replaceChildren(...groups);
}

function renderClusterFilters() {
  if (!state.clusters.length) {
    elements.categories.textContent = t("cluster.computing");
    return;
  }
  const availableIds = new Set(
    state.papers
      .filter((paper) => matchesPaper(paper, { includePrimary: false }))
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
      state.page = 1;
      window.DiTLandscape?.setClusterFilter(cluster.id === "all" ? null : Number(cluster.id));
      render();
    });
    return button;
  });
  elements.categories.replaceChildren(...buttons);
}

function readURLState() {
  const params = new URLSearchParams(location.search);
  const topicIndex = state.taxonomy.topics.findIndex((topic) => topic.id === params.get("topic"));
  const oldCluster = Number.parseInt(params.get("cluster"), 10);
  state.cluster = topicIndex >= 0 ? String(topicIndex) : Number.isInteger(oldCluster) && oldCluster >= 0 && oldCluster < state.taxonomy.topics.length ? String(oldCluster) : "all";
  for (const [dimension, definition] of Object.entries(state.taxonomy.facets)) {
    const allowed = new Set(definition.options.map((option) => option.id));
    state.facets[dimension] = new Set((params.get(dimension) || "").split(",").filter((value) => allowed.has(value)));
  }
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
    window.DiTLandscape?.setClusterFilter(Number(selected.id));
  } else {
    state.cluster = "all";
    window.DiTLandscape?.setClusterFilter(null);
  }
  render();
  window.DiTAuthors?.setClusters(clusters);
}

function bindEvents() {
  window.addEventListener("dit:paper-selection", onPaperSelection);
  elements.mapSearchInput.addEventListener("input", () => {
    state.mapSearchQuery = elements.mapSearchInput.value;
    state.mapSearchOpen = true;
    renderMapSearch();
  });
  elements.mapSearchInput.addEventListener("focus", () => {
    state.mapSearchOpen = true;
    renderMapSearch();
  });
  elements.mapSearchClear.addEventListener("click", () => {
    elements.mapSearchInput.value = "";
    state.mapSearchQuery = "";
    state.mapSearchOpen = false;
    renderMapSearch();
    elements.mapSearchInput.focus({ preventScroll: true });
  });
  elements.mapSearch.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      state.mapSearchOpen = false;
      elements.mapSearchResults.hidden = true;
      elements.mapSearchInput.focus({ preventScroll: true });
      state.mapSearchOpen = false;
      elements.mapSearchResults.hidden = true;
      event.stopPropagation();
    } else if (event.key === "ArrowDown" && event.target === elements.mapSearchInput) {
      elements.mapSearchResults.querySelector("button")?.focus();
      event.preventDefault();
    } else if (event.key === "Enter" && event.target === elements.mapSearchInput && !elements.mapSearchResults.hidden) {
      elements.mapSearchResults.querySelector("button")?.click();
      event.preventDefault();
    }
  });
  document.addEventListener("click", (event) => {
    if (!elements.mapSearch.contains(event.target)) {
      state.mapSearchOpen = false;
      elements.mapSearchResults.hidden = true;
    }
  });
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
    const { ids, label, source } = event.detail ?? {};
    if (Object.prototype.hasOwnProperty.call(event.detail ?? {}, "tag")) {
      state.cluster = Number.isInteger(event.detail.cluster) ? String(event.detail.cluster) : "all";
    }
    const secondary = ["tag", "author", "institution"].includes(source);
    state.topicIds = secondary && Array.isArray(ids) ? new Set(ids) : null;
    state.topicLabel = secondary ? label ?? "" : "";
    state.topicSource = secondary ? source : null;
    if (source === "author" || source === "institution") {
      window.DiTLandscape?.clearTopicFilter();
      window.DiTLandscape?.setClusterFilter(state.cluster === "all" ? null : Number(state.cluster));
    }
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
  elements.filterReset.addEventListener("click", resetAllFilters);
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
    const [catalog, precomputedLandscape] = await Promise.all([
      window.DiTCatalog.load(),
      fetch(PRECOMPUTED_LANDSCAPE_URL, {cache:"force-cache"})
        .then(response => response.ok ? response.json() : null).catch(() => null),
    ]);
    state.abstracts = new Map(Object.entries(catalog.abstracts));
    state.taxonomy = catalog.taxonomy;
    state.papers = catalog.papers;
    const usablePrecomputedLandscape = precomputedLandscape?.catalogSignature === catalogSignature(state.papers)
      && precomputedLandscape?.taxonomySignature === taxonomySignature(state.papers)
      ? precomputedLandscape
      : null;
    state.similarityModel = usablePrecomputedLandscape?.similarityModel || "tag-tfidf";
    readURLState();
    const returnState = readLibraryReturnState();
    applyLibraryReturnState(returnState);
    bindEvents();
    elements.total.textContent = state.papers.length;
    document.querySelector("#topic-count").textContent = state.taxonomy.topics.length;
    elements.windowCount.textContent = state.papers.filter((paper) => paper.window === "in-window").length;
    render();
    window.DiTLandscape?.init(state.papers, usablePrecomputedLandscape);
    window.DiTAuthors?.init(state.papers, usablePrecomputedLandscape);
    syncLandscapeTimeFilter();
    syncLandscapeListFilter();
    setLandscapeMode(state.mapMode, { updateHistory: false });
    state.initialized = true;
    if (returnState) {
      window.DiTLandscape?.restoreViewState(returnState.topicView);
      window.DiTAuthors?.restoreViewState(returnState.authorView);
      requestAnimationFrame(() => {
        window.DiTLandscape?.restoreViewState(returnState.topicView);
        window.DiTAuthors?.restoreViewState(returnState.authorView);
        window.scrollTo({top:Math.max(0, Number(returnState.scrollY) || 0), behavior:"instant"});
      });
    }
    initializePersonalLibrary(catalog.aliases, returnState);
  } catch (error) {
    elements.resultCount.textContent = t("error.catalog");
    elements.empty.hidden = false;
    elements.empty.querySelector("p").textContent = t("error.empty");
    elements.reset.hidden = true;
    console.error(error);
  }
}

initialize();
