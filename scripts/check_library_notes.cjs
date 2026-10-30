#!/usr/bin/env node
// Exercise the production note queue and undo helper without a browser dependency.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../site/library.js"), "utf8");
assert(source.includes("offerUndo(() => restoreDeletedNote(id, previous), \"undoNote\")"));
const instrumented = source.replace("  initialize();\n})();", `  window.noteTest = {
    flushNote, restoreDeletedNote, mutation, render,
    setup(records, editor) { data = records; note = editor; paperMap = new Map(Object.keys(records.entries).map(id => [id, { arxiv_id: id }])); },
    input(text) { $("#library-note-text").value = text; note.dirty = true; cacheDraft(); },
    setPreview(value) { importPreview = value; },
    getNote() { return note; }
  };
})();`);
assert.notEqual(instrumented, source, "Production initializer must be isolated for the harness");

function harness(active = "a") {
  const fields = new Map(), drafts = new Map();
  const field = (key) => {
    if (!fields.has(key)) fields.set(key, { value: "", textContent: "", hidden: true, classList: { toggle() {} }, setAttribute() {}, replaceChildren() {}, append() {} });
    return fields.get(key);
  };
  const records = { collections: [], entries: {
    a: { paperId: "a", saved: false, note: "", noteRevision: 1, collectionIds: [] },
    b: { paperId: "b", saved: false, note: "", noteRevision: 1, collectionIds: [] },
  } };
  const writes = [];
  let beforeWrite = async () => {};
  const store = {
    canonicalId: (id) => id,
    getState: async () => structuredClone(records),
    async saveNote(paper, text, revision) {
      const id = paper.arxiv_id;
      writes.push({ id, text, revision });
      await beforeWrite(writes.length, id);
      const current = records.entries[id];
      if (revision !== current.noteRevision) throw Object.assign(new Error("Conflict"), { code: "CONFLICT", current: structuredClone(current) });
      records.entries[id] = { ...current, note: text, noteRevision: revision + 1 };
      return structuredClone(records.entries[id]);
    },
  };
  const window = {
    DiTLibraryStore: store,
    DiTI18n: { language: "en" },
    DiTLibraryI18n: { t: (key, values) => `${window.DiTI18n.language}:${key}:${JSON.stringify(values || {})}` },
    DiTLibraryUI: { element: () => ({ append() {} }) },
  };
  vm.runInNewContext(instrumented, {
    window, document: { querySelector: field }, location: { search: "" }, URLSearchParams,
    clearTimeout, setTimeout, console,
    sessionStorage: { setItem: (key, value) => drafts.set(key, value), removeItem: (key) => drafts.delete(key) },
  });
  const api = window.noteTest;
  api.setup(records, { id: active, revision: 1, dirty: false, saving: null, conflict: null, timer: null });
  return { api, records, field, writes, drafts, window, beforeWrite: (fn) => { beforeWrite = fn; } };
}

function gate() {
  let enter, release;
  return { entered: new Promise((resolve) => { enter = resolve; }), wait: new Promise((resolve) => { release = resolve; }), enter: () => enter(), release: () => release() };
}

(async () => {
  // A new draft written after clearing must survive an immediate undo.
  const fresh = harness();
  fresh.api.input("NEW draft before autosave");
  assert.equal(await fresh.api.restoreDeletedNote("a", "OLD cleared note"), true);
  assert.equal(fresh.records.entries.a.note, "NEW draft before autosave\n\nOLD cleared note");
  assert.equal(fresh.field("#library-note-text").value, fresh.records.entries.a.note);
  assert.equal(fresh.api.getNote().dirty, false);
  assert.equal(fresh.drafts.size, 0);

  // Typing while the restoration write is pending uses the same serial save queue.
  const during = harness(), restoreGate = gate();
  during.beforeWrite(async (number) => { if (number === 1) { restoreGate.enter(); await restoreGate.wait; } });
  const restoring = during.api.restoreDeletedNote("a", "OLD cleared note");
  await restoreGate.entered;
  during.api.input("OLD cleared note\nNEW typed during undo");
  restoreGate.release();
  assert.equal(await restoring, true);
  assert.equal(during.records.entries.a.note, "OLD cleared note\nNEW typed during undo");
  assert.equal(during.writes.length, 2);

  // Undo joins an in-flight autosave, without self-conflict or losing later keystrokes.
  const pending = harness(), autoGate = gate();
  pending.beforeWrite(async (number) => { if (number === 1) { autoGate.enter(); await autoGate.wait; } });
  pending.api.input("FIRST draft");
  const autosaving = pending.api.flushNote();
  await autoGate.entered;
  const undoPending = pending.api.restoreDeletedNote("a", "OLD cleared note");
  pending.api.input("LATEST draft");
  autoGate.release();
  assert.deepEqual(await Promise.all([autosaving, undoPending]), [true, true]);
  assert.equal(pending.records.entries.a.note, "LATEST draft\n\nOLD cleared note");

  // A real other-tab revision change retains the draft and leaves undo available.
  const conflict = harness();
  conflict.api.input("NEW draft");
  conflict.beforeWrite(async (number, id) => {
    if (number === 2) conflict.records.entries[id] = { ...conflict.records.entries[id], note: "OTHER TAB", noteRevision: 9 };
  });
  assert.equal(await conflict.api.mutation(() => conflict.api.restoreDeletedNote("a", "OLD cleared note"), "restored"), false);
  assert.equal(conflict.records.entries.a.note, "OTHER TAB");
  assert.equal(conflict.field("#library-note-text").value, "NEW draft\n\nOLD cleared note");
  assert.equal(conflict.api.getNote().dirty, true);
  assert.equal(conflict.field("#library-note-conflict").hidden, false);
  assert.equal(conflict.field("#library-status").textContent, "");

  // Restoring an earlier paper must preserve the currently edited different paper.
  const other = harness("b");
  other.api.input("CURRENT PAPER draft");
  assert.equal(await other.api.restoreDeletedNote("a", "OLD cleared note"), true);
  assert.equal(other.records.entries.a.note, "OLD cleared note");
  assert.equal(other.records.entries.b.note, "CURRENT PAPER draft");
  assert.equal(other.field("#library-note-text").value, "CURRENT PAPER draft");

  // Visible confirmation text is regenerated on language render using cached counts.
  const language = harness();
  language.api.getNote().id = null;
  language.field("#collection-delete-confirmation").hidden = false;
  language.field("#library-import-preview").hidden = false;
  language.api.setPreview({ collections: 2, entries: 3, notes: 1 });
  language.api.render();
  assert.match(language.field("#library-import-summary").textContent, /^en:restorePreview:/);
  language.window.DiTI18n.language = "zh";
  language.api.render();
  assert.match(language.field("#collection-delete-question").textContent, /^zh:deleteQuestion:/);
  assert.equal(language.field("#library-import-summary").textContent, 'zh:restorePreview:{"collections":2,"papers":3,"notes":1}');
  console.log("Library notes: immediate undo, in-flight edits, autosave serialization, CAS conflicts, other-paper drafts and bilingual confirmations passed.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
