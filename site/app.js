const DATA_URL = "./data/papers.csv";

const CATEGORIES = {
  all: "全部主题",
  "00_background": "背景锚点",
  "01_foundation_architecture": "基础架构",
  "02_video_long_context": "视频与长上下文",
  "03_efficiency_systems": "效率与系统",
  "04_rl_alignment": "RL 与对齐",
  "05_agent_world_robotics": "Agent 与世界模型",
  "06_omni_unified": "Omni 统一模型",
};

const RELATIONS = {
  direct: "核心 DiT",
  adaptation: "后训练 / 适配",
  system: "系统优化",
  adjacent: "相邻方向",
};

const state = {
  papers: [],
  query: "",
  category: "all",
  relation: "all",
  window: "all",
  sort: "newest",
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

function matchesPaper(paper) {
  if (state.category !== "all" && paper.category !== state.category) return false;
  if (state.relation !== "all" && paper.dit_relation !== state.relation) return false;
  if (state.window !== "all" && paper.window !== state.window) return false;
  if (!state.query) return true;

  const haystack = normalize(
    [
      paper.short_title,
      paper.title,
      paper.venue,
      paper.topic_tags,
      paper.summary_zh,
      CATEGORIES[paper.category],
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
  if (state.category !== "all") params.set("category", state.category);
  if (state.relation !== "all") params.set("relation", state.relation);
  if (state.window !== "all") params.set("window", state.window);
  if (state.sort !== "newest") params.set("sort", state.sort);
  const query = params.toString();
  history.replaceState(null, "", `${location.pathname}${query ? `?${query}` : ""}${location.hash}`);
}

function render() {
  const filtered = sortPapers(state.papers.filter(matchesPaper));
  elements.paperList.replaceChildren(...filtered.map(createPaperCard));
  elements.resultCount.textContent = `显示 ${filtered.length} / ${state.papers.length} 篇论文`;
  elements.empty.hidden = filtered.length > 0;
  elements.paperList.hidden = filtered.length === 0;

  for (const button of elements.categories.querySelectorAll("button")) {
    const selected = button.dataset.category === state.category;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
  updateURL();
}

function renderCategoryFilters() {
  const counts = state.papers.reduce((result, paper) => {
    result[paper.category] = (result[paper.category] ?? 0) + 1;
    return result;
  }, {});

  const buttons = Object.entries(CATEGORIES).map(([category, label]) => {
    const count = category === "all" ? state.papers.length : counts[category] ?? 0;
    const button = createElement("button", "category-filter");
    button.type = "button";
    button.dataset.category = category;
    button.setAttribute("aria-pressed", "false");
    button.append(document.createTextNode(label), createElement("span", "", String(count).padStart(2, "0")));
    button.addEventListener("click", () => {
      state.category = category;
      render();
    });
    return button;
  });
  elements.categories.replaceChildren(...buttons);
}

function readURLState() {
  const params = new URLSearchParams(location.search);
  const category = params.get("category");
  const relation = params.get("relation");
  const windowValue = params.get("window");
  const sort = params.get("sort");
  state.query = params.get("q") ?? "";
  if (category in CATEGORIES) state.category = category;
  if (relation === "all" || relation in RELATIONS) state.relation = relation;
  if (["all", "in-window", "background"].includes(windowValue)) state.window = windowValue;
  if (["newest", "oldest", "title"].includes(sort)) state.sort = sort;

  elements.search.value = state.query;
  elements.relation.value = state.relation;
  elements.window.value = state.window;
  elements.sort.value = state.sort;
}

function bindEvents() {
  elements.theme.addEventListener("click", () => {
    const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("dit-paper-theme", theme);
    document.querySelector('meta[name="theme-color"]').content = theme === "dark" ? "#1c1c1d" : "#ffffff";
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
    render();
  });
  elements.sort.addEventListener("change", (event) => {
    state.sort = event.target.value;
    render();
  });
  elements.reset.addEventListener("click", () => {
    state.query = "";
    state.category = "all";
    state.relation = "all";
    state.window = "all";
    state.sort = "newest";
    elements.search.value = "";
    elements.relation.value = "all";
    elements.window.value = "all";
    elements.sort.value = "newest";
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
    renderCategoryFilters();
    bindEvents();
    elements.total.textContent = state.papers.length;
    elements.windowCount.textContent = state.papers.filter((paper) => paper.window === "in-window").length;
    render();
  } catch (error) {
    elements.resultCount.textContent = "论文数据加载失败，请稍后刷新。";
    elements.empty.hidden = false;
    elements.empty.querySelector("p").textContent = "无法读取论文目录。";
    elements.reset.hidden = true;
    console.error(error);
  }
}

initialize();
