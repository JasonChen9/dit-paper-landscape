(() => {
  const store = window.DiTLibraryStore;
  const t = (key, values) => window.DiTLibraryI18n.t(key, values);
  const el = window.DiTLibraryUI.element;
  const $ = (selector) => document.querySelector(selector);
  const DRAFT_KEY = "dit-library-note-draft";
  const builtinCollections = new Set(["all", "unsorted", "notes"]);
  let data = null, catalog = null, paperMap = new Map(), sidebar = null;
  let collection = new URLSearchParams(location.search).get("collection") || "all";
  let selected = new Set(), query = "", sort = "recent", importing = null, importPreview = null, undoAction = null;
  let note = { id: null, revision: 0, dirty: false, saving: null, conflict: null, timer: null };
  let noteStatus = "", lastStatus = null, noteFlush = null;

  function status(key, values, error = false) {
    lastStatus = key ? { key, values, error } : null;
    $("#library-status").textContent = key ? t(key, values) : "";
    $("#library-status").classList.toggle("is-error", error);
  }
  function setNoteStatus(key) { noteStatus = key; $("#library-note-status").textContent = key ? t(key) : ""; }
  function keyOf(paper) { return store.canonicalId(paper.arxiv_id); }
  function entryOf(paper) { return data.entries[keyOf(paper)]; }
  function paperFor(id) {
    const canonical = store.canonicalId(id);
    return paperMap.get(canonical) || data.entries[canonical]?.snapshot || { arxiv_id: canonical, title: canonical, short_title: canonical, authors: "", topic_tags: "", published: "", venue: "" };
  }
  function safeLink(label, url) {
    const link = el(/^https?:\/\//i.test(url || "") ? "a" : "span", "", label);
    if (link.tagName === "A") { link.href = url; link.target = "_blank"; link.rel = "noopener noreferrer"; }
    return link;
  }
  function currentName() {
    return builtinCollections.has(collection) ? t(collection) : data.collections.find((item) => item.id === collection)?.name || t("all");
  }
  function matchingPapers() {
    const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const papers = Object.values(data.entries).filter((entry) => {
      if (collection === "notes") return Boolean(entry.note?.trim());
      if (!entry.saved) return false;
      return collection === "all" || (collection === "unsorted" ? !entry.collectionIds.length : entry.collectionIds.includes(collection));
    }).map((entry) => paperFor(entry.paperId)).filter((paper) => {
      const record = entryOf(paper);
      const text = [paper.title, paper.title_zh, paper.short_title, paper.alternate_titles, paper.authors, paper.topic_tags, record?.note].filter(Boolean).join(" ").toLocaleLowerCase();
      return terms.every((term) => text.includes(term));
    });
    return papers.sort((a, b) => {
      if (sort === "title") return (a.short_title || a.title || "").localeCompare(b.short_title || b.title || "");
      if (sort === "newest") return String(b.published || "").localeCompare(String(a.published || ""));
      return String(entryOf(b)?.savedAt || entryOf(b)?.updatedAt || "").localeCompare(String(entryOf(a)?.savedAt || entryOf(a)?.updatedAt || ""));
    });
  }
  function updateSelection() {
    const papers = matchingPapers();
    const ids = new Set(papers.map(keyOf));
    selected = new Set([...selected].filter((id) => ids.has(id)));
    $("#library-result-count").textContent = t("results", { count: papers.length, selected: selected.size });
    const all = $("#library-select-all");
    all.checked = papers.length > 0 && papers.every((paper) => selected.has(keyOf(paper)));
    all.indeterminate = selected.size > 0 && !all.checked;
    all.disabled = !papers.length;
    $("#library-clear-selection").disabled = !selected.size;
    $("#library-add").disabled = !selected.size || !data.collections.length || [...selected].some((id) => !data.entries[id]?.saved);
    $("#library-remove").disabled = !selected.size;
    $("#library-unsave").disabled = ![...selected].some((id) => data.entries[id]?.saved);
    $("#library-export-label").textContent = t("export", { count: selected.size });
    $("#library-export-menu").setAttribute("aria-disabled", String(!selected.size));
    $("#library-export-markdown").disabled = $("#library-export-html").disabled = !selected.size;
    if (!selected.size) $("#library-export-menu").open = false;
  }
  function renderPapers() {
    const papers = matchingPapers();
    const list = $("#library-papers"); list.replaceChildren();
    const language = window.DiTI18n.language;
    for (const paper of papers) {
      const id = keyOf(paper), entry = data.entries[id];
      const article = el("article", "library-paper"); article.dataset.paperId = id;
      const check = el("input"); check.type = "checkbox"; check.checked = selected.has(id);
      check.setAttribute("aria-label", t("selectPaper", { title: paper.short_title || paper.title }));
      check.addEventListener("change", () => { check.checked ? selected.add(id) : selected.delete(id); updateSelection(); });
      const content = el("div", "library-paper-content"), heading = el("h2");
      const title = el("button", "library-paper-title", paper.short_title || paper.title || t("untitled")); title.type = "button";
      title.addEventListener("click", () => openNote(id)); heading.append(title);
      content.append(heading, el("p", "library-paper-full-title", language === "zh" && paper.title_zh ? paper.title_zh : paper.title));
      const venue = paper.venue === "Publication venue unverified" ? window.DiTI18n.t("paper.venueUnknown")
        : paper.venue === "arXiv preprint" ? window.DiTI18n.t("paper.arxivPreprint") : paper.venue;
      content.append(el("p", "library-paper-meta", [paper.published, venue, paper.authors].filter(Boolean).join(" · ")));
      if (!paperMap.has(id)) content.append(el("p", "library-paper-meta", t("missingPaper")));
      if (!entry.saved) content.append(el("p", "library-paper-meta", t("notSaved")));
      const description = paper.details?.method?.[language] || (language === "zh" ? paper.summary_zh : paper.summary_en);
      if (description) content.append(el("p", "library-paper-description", description));
      const folders = el("div", "library-paper-folders");
      for (const folderId of entry.collectionIds) {
        const folder = data.collections.find((item) => item.id === folderId);
        if (folder) folders.append(el("span", "", folder.name));
      }
      if (entry.note?.trim()) folders.append(el("span", "", t("noteCount")));
      content.append(folders);
      const actions = el("div", "library-paper-actions");
      actions.append(window.DiTLibraryUI.createSaveButton(paper, { store }));
      const edit = el("button", "library-action", t(entry.note?.trim() ? "editNote" : "openNote")); edit.type = "button";
      edit.addEventListener("click", () => openNote(id, true)); actions.append(edit);
      actions.append(safeLink(t("original"), paper.venue_url || paper.arxiv_url));
      if (paper.pdf_url) actions.append(safeLink(t("pdf"), paper.pdf_url));
      content.append(actions);
      const abstractLanguage = language === "zh" && (paper.abstract_zh_kind || paper.zh_kind) === "translation" && paper.abstract_zh ? "zh" : "en";
      const abstract = abstractLanguage === "zh" ? paper.abstract_zh : paper.abstract_en;
      if (abstract) {
        const details = el("details", "library-paper-abstract"); details.append(el("summary", "", t("abstract")), el("p", "", abstract));
        if (paper.abstract_source_url) {
          details.append(safeLink(window.DiTI18n.t(abstractLanguage === "zh" ? "paper.abstractTranslation" : "paper.abstractSource", { source: paper.abstract_source || paper.source_label || "" }), paper.abstract_source_url));
        }
        content.append(details);
      }
      article.append(check, content); list.append(article);
    }
    $("#library-empty").hidden = Boolean(papers.length);
    updateSelection();
  }
  function render() {
    $("#library-title").textContent = currentName();
    document.title = `${t("title")} · Diffusion Intelligence Atlas`;
    sidebar?.refresh(collection);
    const custom = !builtinCollections.has(collection), folder = data.collections.find((item) => item.id === collection);
    $("#library-management").hidden = !custom;
    $("#library-remove").hidden = !custom;
    if (folder && document.activeElement !== $("#collection-name")) $("#collection-name").value = folder.name;
    const ordered = [...data.collections].sort((a, b) => a.order - b.order);
    const index = ordered.findIndex((item) => item.id === collection);
    $("#collection-up").disabled = index <= 0;
    $("#collection-down").disabled = index < 0 || index >= ordered.length - 1;
    const target = $("#library-target"), previous = target.value; target.replaceChildren();
    for (const item of ordered) { const option = el("option", "", item.name); option.value = item.id; target.append(option); }
    if (ordered.some((item) => item.id === previous)) target.value = previous;
    renderPapers();
    if (note.id) $("#library-note-paper").textContent = paperFor(note.id).short_title || paperFor(note.id).title || note.id;
    if (lastStatus) status(lastStatus.key, lastStatus.values, lastStatus.error);
    setNoteStatus(noteStatus);
    if (!$("#collection-delete-confirmation").hidden) $("#collection-delete-question").textContent = t("deleteQuestion", { name: currentName() });
    if (importPreview && !$("#library-import-preview").hidden) $("#library-import-summary").textContent = t("restorePreview", { collections: importPreview.collections, papers: importPreview.entries, notes: importPreview.notes });
  }
  function cacheDraft() {
    try {
      if (note.id && note.dirty) sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ id: note.id, text: $("#library-note-text").value, revision: note.revision }));
      else sessionStorage.removeItem(DRAFT_KEY);
    } catch {}
  }
  function showConflict(current) {
    note.conflict = current;
    $("#library-note-conflict").hidden = false;
    $("#library-note-other").textContent = current?.note || "";
    setNoteStatus("noteConflict");
  }
  function flushNote() {
    clearTimeout(note.timer);
    if (noteFlush) return noteFlush;
    noteFlush = drainNote().finally(() => { noteFlush = null; });
    return noteFlush;
  }
  async function drainNote() {
    if (!note.id || !note.dirty) return true;
    if (note.conflict) { setNoteStatus("noteConflict"); return false; }
    while (note.dirty) {
      const id = note.id, text = $("#library-note-text").value, revision = note.revision;
      let success = false;
      setNoteStatus("saving");
      note.saving = (async () => {
        try {
          const entry = await store.saveNote(paperFor(id), text, revision);
          if (note.id === id) {
            note.revision = entry.noteRevision;
            note.dirty = $("#library-note-text").value !== text;
            setNoteStatus(note.dirty ? "pending" : "noteSaved"); cacheDraft();
          }
          success = true;
        } catch (error) {
          if (error.code === "CONFLICT") showConflict(error.current || error.entry);
          else setNoteStatus("error");
          cacheDraft();
        }
      })();
      await note.saving; note.saving = null;
      if (!success) return false;
    }
    return true;
  }
  async function openNote(id, focus = false) {
    if (!(await flushNote())) return false;
    id = store.canonicalId(id);
    const entry = data.entries[id];
    note.id = id; note.revision = entry?.noteRevision || 0; note.dirty = false; note.conflict = null;
    $("#library-note-panel").hidden = false;
    $("#library-note-empty").hidden = true; $("#library-note-editor").hidden = false;
    $("#library-note-paper").textContent = paperFor(id).short_title || paperFor(id).title || id;
    $("#library-note-text").value = entry?.note || "";
    $("#library-note-conflict").hidden = true;
    setNoteStatus(entry?.note ? "noteSaved" : "emptyNote");
    if (focus) $("#library-note-text").focus({ preventScroll: true });
    if (matchMedia("(max-width: 1180px)").matches) $("#library-note-panel").scrollIntoView({ behavior: "smooth", block: "start" });
    return true;
  }
  async function changeCollection(next, updateHistory = true) {
    if (!(await flushNote())) return;
    collection = next; selected.clear(); query = ""; $("#library-search").value = "";
    $("#collection-delete-confirmation").hidden = true;
    if (updateHistory) {
      const url = new URL(location.href); url.searchParams.delete("q");
      next === "all" ? url.searchParams.delete("collection") : url.searchParams.set("collection", next);
      history.pushState(null, "", url);
    }
    status("selectionCleared"); render();
  }
  async function mutation(action, message, values) {
    try { if (await action() === false) return false; if (message) status(message, values); return true; }
    catch (error) { status(error.code === "DUPLICATE" ? "collectionExists" : error.code === "INVALID" ? "invalidName" : "error", {}, true); return false; }
  }
  async function restoreDeletedNote(id, previous) {
    if (!(await flushNote())) return false;
    const restoredText = (current) => !previous || current.includes(previous) ? current : current ? `${current}\n\n${previous}` : previous;
    if (note.id === id) {
      // Restore through the editor's save queue so edits made before or during undo survive.
      const input = $("#library-note-text");
      const restored = restoredText(input.value);
      if (restored === input.value) return true;
      input.value = restored; note.dirty = true; cacheDraft();
      return flushNote();
    }
    const current = (await store.getState()).entries[id];
    await store.saveNote(paperFor(id), restoredText(current?.note || ""), current?.noteRevision || 0);
    return true;
  }
  function offerUndo(callback, label = "undo") {
    undoAction = callback; $("#library-undo").hidden = false; $("#library-undo-button").textContent = t(label);
  }
  async function returnHome(event) {
    if (event?.metaKey || event?.ctrlKey || event?.shiftKey || event?.altKey) return;
    event?.preventDefault();
    if (!(await flushNote())) return;
    let target = new URL("./", location.href);
    try {
      const saved = JSON.parse(sessionStorage.getItem("dit-library-return") || "null");
      if (saved?.url) { const url = new URL(saved.url, location.href); if (url.origin === location.origin && !url.pathname.endsWith("library.html")) target = url; }
      sessionStorage.setItem("dit-library-restore", "1");
    } catch {}
    location.href = target.href;
  }
  function textDownload(text, filename, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), link = el("a");
    link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function exportSelected(format) {
    if (!selected.size) return;
    const ids = [...selected];
    const includeNotes = $("#library-include-notes").checked;
    const description = `${t("title")}: ${currentName()}${query ? ` · ${query}` : ""}`;
    if (!(await flushNote())) return;
    const papers = ids.map(paperFor);
    const notes = includeNotes ? Object.fromEntries(ids.map((id) => [id, data.entries[id]?.note || ""])) : {};
    const result = window.DiTExport.download(papers, format, { taxonomy: catalog.taxonomy, description, notes });
    $("#library-export-menu").open = false;
    if (result) status("exported", { count: papers.length, format: result.format });
  }

  function bindEvents() {
    $("#theme-toggle").addEventListener("click", () => {
      const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = theme; try { localStorage.setItem("dit-paper-theme", theme); } catch {}
    });
    document.querySelectorAll(".library-return-link").forEach((link) => link.addEventListener("click", returnHome));
    $("#library-search").addEventListener("input", (event) => { query = event.target.value; selected.clear(); status("selectionCleared"); renderPapers(); });
    $("#library-sort").addEventListener("change", (event) => { sort = event.target.value; renderPapers(); });
    $("#library-select-all").addEventListener("change", (event) => { selected = event.target.checked ? new Set(matchingPapers().map(keyOf)) : new Set(); renderPapers(); });
    $("#library-clear-selection").addEventListener("click", () => { selected.clear(); renderPapers(); });
    $("#library-add").addEventListener("click", () => { const ids = [...selected], target = $("#library-target").value; if (ids.length && target) mutation(() => store.addToCollection(ids, target), "added", { count: ids.length }); });
    $("#library-remove").addEventListener("click", () => { const ids = [...selected]; if (ids.length) mutation(() => store.removeFromCollection(ids, collection), "removed", { count: ids.length }); });
    $("#library-unsave").addEventListener("click", async () => {
      const ids = [...selected].filter((id) => data.entries[id]?.saved);
      if (!ids.length || !confirm(t("confirmUnsave", { count: ids.length }))) return;
      await mutation(async () => { for (const id of ids) await store.setSaved(paperFor(id), false); }, "removedSaved", { count: ids.length });
    });
    $("#library-export-menu").querySelector("summary").addEventListener("click", (event) => { if (!selected.size) event.preventDefault(); });
    $("#library-export-markdown").addEventListener("click", () => exportSelected("markdown"));
    $("#library-export-html").addEventListener("click", () => exportSelected("html"));
    $("#collection-rename").addEventListener("click", () => mutation(() => store.renameCollection(collection, $("#collection-name").value)));
    $("#collection-name").addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); $("#collection-rename").click(); } });
    $("#collection-up").addEventListener("click", () => mutation(() => store.moveCollection(collection, -1)));
    $("#collection-down").addEventListener("click", () => mutation(() => store.moveCollection(collection, 1)));
    $("#collection-delete").addEventListener("click", () => { $("#collection-delete-question").textContent = t("deleteQuestion", { name: currentName() }); $("#collection-delete-confirmation").hidden = false; });
    $("#collection-delete-cancel").addEventListener("click", () => { $("#collection-delete-confirmation").hidden = true; });
    $("#collection-delete-confirm").addEventListener("click", async () => {
      if (!(await flushNote())) return;
      await mutation(async () => { const removed = await store.deleteCollection(collection); await changeCollection("all"); offerUndo(() => store.restoreCollection(removed.collection, removed.memberIds)); }, "deleted");
    });
    $("#library-undo-button").addEventListener("click", async () => { if (undoAction && await mutation(undoAction, "restored")) { undoAction = null; $("#library-undo").hidden = true; } });
    $("#library-note-text").addEventListener("input", () => { note.dirty = true; setNoteStatus("pending"); cacheDraft(); clearTimeout(note.timer); note.timer = setTimeout(flushNote, 650); });
    $("#library-note-save").addEventListener("click", flushNote);
    $("#library-note-close").addEventListener("click", async () => { if (await flushNote()) $("#library-note-panel").hidden = true; });
    $("#library-note-copy").addEventListener("click", async () => { try { await navigator.clipboard.writeText($("#library-note-text").value); setNoteStatus("copied"); } catch { $("#library-note-text").focus(); $("#library-note-text").select(); } });
    $("#library-note-merge").addEventListener("click", async () => {
      const fresh = (await store.getState()).entries[note.id];
      const draft = $("#library-note-text").value;
      $("#library-note-text").value = fresh?.note && fresh.note !== draft ? `${fresh.note}\n\n${t("mergedMarker")}\n${draft}` : draft;
      note.revision = fresh?.noteRevision || 0; note.conflict = null; note.dirty = true; $("#library-note-conflict").hidden = true; cacheDraft(); await flushNote();
    });
    $("#library-note-delete").addEventListener("click", async () => {
      if (!note.id || !(await flushNote())) return;
      const id = note.id, previous = $("#library-note-text").value;
      $("#library-note-text").value = ""; note.dirty = true;
      if (await flushNote()) {
        status("noteDeleted");
        offerUndo(() => restoreDeletedNote(id, previous), "undoNote");
      }
    });
    $("#library-backup").addEventListener("click", async () => {
      if (!(await flushNote())) return;
      try { const payload = await store.backup(); textDownload(JSON.stringify(payload, null, 2), `diffusion-intelligence-library-${new Date().toISOString().slice(0, 10)}.json`, "application/json"); status("backupDone"); } catch { status("error", {}, true); }
    });
    $("#library-restore").addEventListener("click", () => $("#library-import-file").click());
    $("#library-import-file").addEventListener("change", async (event) => {
      const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
      if (file.size > 12 * 1024 * 1024) { status("backupTooLarge", {}, true); return; }
      try {
        importing = JSON.parse(await file.text()); importPreview = await store.previewImport(importing);
        $("#library-import-summary").textContent = t("restorePreview", { collections: importPreview.collections, papers: importPreview.entries, notes: importPreview.notes }); $("#library-import-preview").hidden = false;
      } catch { importing = null; importPreview = null; status("invalidBackup", {}, true); }
    });
    $("#library-import-cancel").addEventListener("click", () => { importing = null; importPreview = null; $("#library-import-preview").hidden = true; });
    $("#library-import-confirm").addEventListener("click", async () => {
      if (!importing || !(await flushNote())) return;
      if (await mutation(() => store.importBackup(importing), "restoreDone")) { importing = null; importPreview = null; $("#library-import-preview").hidden = true; }
    });
    window.addEventListener("dit:language-change", () => { window.DiTLibraryI18n.apply(); render(); });
    window.addEventListener("dit:library-status", (event) => { $("#library-status").textContent = event.detail.text; lastStatus = null; });
    window.addEventListener("popstate", () => changeCollection(new URLSearchParams(location.search).get("collection") || "all", false));
    window.addEventListener("beforeunload", (event) => { if (note.dirty || note.saving) { cacheDraft(); event.preventDefault(); event.returnValue = ""; } });
    document.addEventListener("visibilitychange", () => { if (document.hidden) flushNote(); });
  }
  async function initialize() {
    try {
      catalog = await window.DiTCatalog.load();
      await store.init(catalog.aliases?.aliases || catalog.aliases || {});
      data = await store.getState();
      paperMap = new Map(catalog.papers.map((paper) => [store.canonicalId(paper.arxiv_id), paper]));
      if (!builtinCollections.has(collection) && !data.collections.some((item) => item.id === collection)) { collection = "all"; status("unknownFolder"); history.replaceState(null, "", "./library.html"); }
      sidebar = await window.DiTLibraryUI.initSidebar($("#library-sidebar"), { store, currentCollection: collection, onSelect: changeCollection });
      store.subscribe((next) => {
        data = next;
        if (!builtinCollections.has(collection) && !data.collections.some((item) => item.id === collection)) collection = "all";
        render();
        if (note.id && !note.dirty && !note.saving && !note.conflict) { const entry = data.entries[note.id]; note.revision = entry?.noteRevision || 0; $("#library-note-text").value = entry?.note || ""; }
      });
      bindEvents(); render();
      try {
        const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null");
        const draftId = draft?.id ? store.canonicalId(draft.id) : null;
        if (draftId && typeof draft.text === "string" && (data.entries[draftId] || paperMap.has(draftId))) {
          await openNote(draftId); $("#library-note-text").value = draft.text; note.dirty = true;
          if (draft.revision !== note.revision) showConflict(data.entries[note.id]); else { setNoteStatus("freshDraft"); note.timer = setTimeout(flushNote, 650); }
        }
      } catch {}
    } catch (error) {
      status(error.code ? "unavailable" : "loadError", {}, true);
      $("#library-papers").replaceChildren();
      document.querySelectorAll(".library-main button, .library-main select, .library-main input, .library-note-panel button").forEach((node) => { node.disabled = true; });
      console.error("Library initialization failed", error);
    }
  }
  initialize();
})();
