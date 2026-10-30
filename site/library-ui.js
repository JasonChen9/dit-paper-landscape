(() => {
  const t = (key, args) => window.DiTLibraryI18n.t(key, args);
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function errorText(error) {
    if (["DUPLICATE", "DUPLICATE_NAME", "DUPLICATE_COLLECTION", "NAME_EXISTS"].includes(error?.code)) return t("collectionExists");
    if (["INVALID", "INVALID_NAME", "INVALID_COLLECTION_NAME"].includes(error?.code)) return t("invalidName");
    return t("error");
  }
  const buttonRegistry = new Set();
  let buttonStore = null, buttonData = null, unsubscribeButtons = null;
  function refreshSaveButtons() {
    for (const item of buttonRegistry) {
      if (item.connected && !item.button.isConnected) { buttonRegistry.delete(item); continue; }
      if (item.button.isConnected) item.connected = true;
      const saved = Boolean(buttonData?.entries?.[item.store.canonicalId(item.paper.arxiv_id)]?.saved);
      item.button.textContent = `${saved ? "★" : "☆"} ${t(saved ? "saved" : "savePaper")}`;
      item.button.setAttribute("aria-label", `${t(saved ? "unsavePaper" : "savePaper")} · ${item.paper.short_title || item.paper.title}`);
      item.button.setAttribute("aria-pressed", String(saved));
    }
  }
  function createSaveButton(paper, { store = window.DiTLibraryStore } = {}) {
    if (buttonStore !== store) {
      unsubscribeButtons?.(); buttonStore = store;
      unsubscribeButtons = store.subscribe((data) => { buttonData = data; refreshSaveButtons(); });
      store.getState().then((data) => { buttonData = data; refreshSaveButtons(); }).catch(() => {});
    }
    const button = element("button", "library-save-button");
    button.type = "button";
    const item = { button, paper, store, connected: false };
    buttonRegistry.add(item); refreshSaveButtons();
    button.addEventListener("click", async (event) => {
      event.preventDefault(); event.stopPropagation();
      button.disabled = true;
      try {
        const current = await store.getState();
        const saved = Boolean(current.entries[store.canonicalId(paper.arxiv_id)]?.saved);
        buttonData = await store.setSaved(paper, !saved);
        refreshSaveButtons();
        window.dispatchEvent(new CustomEvent("dit:library-status", { detail: { text: t(saved ? "unsavedPaper" : "savedPaper", { title: paper.short_title || paper.title }) } }));
      } catch (error) {
        window.dispatchEvent(new CustomEvent("dit:library-status", { detail: { text: t("unavailable"), error: true } }));
        button.textContent = t("retry");
      } finally { button.disabled = false; }
    });
    return button;
  }
  async function initSidebar(container, { store = window.DiTLibraryStore, onNavigate, currentCollection = "", onSelect } = {}) {
    let data = await store.getState();
    let current = currentCollection;
    const details = element("details", "library-sidebar-panel");
    details.open = !matchMedia("(max-width: 900px)").matches;
    const summary = element("summary", "library-sidebar-summary");
    const content = element("div", "library-sidebar-content");
    const status = element("p", "library-inline-status"); status.setAttribute("aria-live", "polite");
    const createPanel = element("div", "library-create-panel"); createPanel.hidden = true;
    const nameLabel = element("label");
    const nameInput = element("input"); nameInput.type = "text"; nameInput.maxLength = 80;
    const createButton = element("button", "library-action primary"); createButton.type = "button";
    const cancelButton = element("button", "library-action"); cancelButton.type = "button";
    nameLabel.append(nameInput); createPanel.append(nameLabel, createButton, cancelButton);
    const links = element("nav", "library-collection-links");
    const heading = element("p", "library-section-label");
    const newButton = element("button", "library-new-button"); newButton.type = "button";
    const local = element("p", "library-storage-hint");
    details.append(summary, content); content.append(links, heading, newButton, createPanel, local, status);
    container.replaceChildren(details);
    function link(label, id, count, className = "") {
      const a = element("a", `library-collection-link ${className}`);
      a.href = `./library.html${id === "all" ? "" : `?collection=${encodeURIComponent(id)}`}`;
      if (current === id) a.setAttribute("aria-current", "page");
      a.append(element("span", "", label)); if (count !== undefined) a.append(element("span", "library-count", String(count)));
      a.addEventListener("click", async (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        if (onSelect) { event.preventDefault(); await onSelect(id); return; }
        if (onNavigate) { event.preventDefault(); const result = await onNavigate(a.href); if (result !== false) location.href = a.href; }
      });
      return a;
    }
    function render() {
      const entries = Object.values(data.entries || {}), saved = entries.filter((entry) => entry.saved);
      summary.textContent = `${t("title")} · ${saved.length}`;
      links.replaceChildren();
      if (!onSelect) links.append(link(t("expand"), "all", undefined, "library-expand"));
      links.append(link(t("all"), "all", saved.length), link(t("unsorted"), "unsorted", saved.filter((entry) => !entry.collectionIds.length).length), link(t("notes"), "notes", entries.filter((entry) => entry.note?.trim()).length));
      heading.textContent = t("folders");
      links.append(heading);
      for (const collection of [...data.collections].sort((a, b) => a.order - b.order)) links.append(link(collection.name, collection.id, saved.filter((entry) => entry.collectionIds.includes(collection.id)).length));
      newButton.textContent = t("newFolder");
      nameInput.setAttribute("aria-label", t("name")); nameInput.placeholder = t("name");
      createButton.textContent = t("create"); cancelButton.textContent = t("cancel"); local.textContent = t("local");
    }
    newButton.addEventListener("click", () => { createPanel.hidden = !createPanel.hidden; if (!createPanel.hidden) nameInput.focus(); });
    cancelButton.addEventListener("click", () => { createPanel.hidden = true; nameInput.value = ""; });
    async function create() {
      if (!nameInput.value.trim()) { status.textContent = t("invalidName"); return; }
      createButton.disabled = true;
      try { await store.createCollection(nameInput.value.trim()); nameInput.value = ""; createPanel.hidden = true; status.textContent = ""; }
      catch (error) { status.textContent = errorText(error); }
      finally { createButton.disabled = false; }
    }
    createButton.addEventListener("click", create);
    nameInput.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); create(); } });
    const unsubscribe = store.subscribe((next) => { data = next; render(); });
    const languageChanged = () => render();
    window.addEventListener("dit:language-change", languageChanged);
    const statusChanged = (event) => { status.textContent = event.detail?.text || ""; status.classList.toggle("is-error", Boolean(event.detail?.error)); };
    window.addEventListener("dit:library-status", statusChanged);
    render();
    return {
      refresh(nextCurrent) { if (nextCurrent !== undefined) current = nextCurrent; render(); },
      destroy() { unsubscribe(); window.removeEventListener("dit:language-change", languageChanged); window.removeEventListener("dit:library-status", statusChanged); }
    };
  }
  window.addEventListener("dit:language-change", refreshSaveButtons);
  window.DiTLibraryUI = { initSidebar, createSaveButton, element, errorText };
})();
