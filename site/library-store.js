/* Personal data stays in this origin's IndexedDB; public catalog files are never written. */
(() => {
  "use strict";
  const DATABASE = "dit-paper-library";
  const STORE = "library";
  const KEY = "state";
  const SCHEMA = 1;
  const LIMITS = { importBytes: 12 * 1024 * 1024, entries: 5000, collections: 1000, note: 200000 };
  const subscribers = new Set();
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const now = () => new Date().toISOString();
  const clone = (value) => structuredClone(value);
  let database = null;
  let opening = null;
  let aliases = Object.create(null);
  let channel = null;

  function error(code, message, properties = {}) {
    return Object.assign(new Error(message), { code, ...properties });
  }

  function storageError(cause) {
    if (cause?.code && typeof cause.code === "string") return cause;
    return error(cause?.name === "QuotaExceededError" ? "QUOTA" : "UNAVAILABLE", cause?.message || "Personal library storage is unavailable.", { cause });
  }

  function id(value) {
    if (typeof value !== "string" || !value || value.length > 200 || /[\u0000-\u001f\u007f]/.test(value)
      || ["__proto__", "constructor", "prototype"].includes(value)) throw error("INVALID", "Invalid identifier.");
    return value;
  }

  function canonicalId(value) {
    let result = id(value);
    const visited = new Set();
    while (own(aliases, result)) {
      if (visited.has(result)) throw error("INVALID", "Alias cycle detected.");
      visited.add(result);
      result = id(aliases[result]);
    }
    return result;
  }

  function name(value) {
    if (typeof value !== "string" || !value.trim() || value.trim().length > 80 || /[\u0000-\u001f\u007f]/.test(value)) throw error("INVALID", "Collection names must contain 1–80 characters.");
    return value.trim();
  }

  function safeURL(value) {
    if (!value) return "";
    try {
      const url = new URL(value);
      return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
    } catch { return ""; }
  }

  function safeValue(value, key = "", depth = 0) {
    if (depth > 8) return null;
    if (typeof value === "string") return /(?:url|href)s?$/i.test(key) ? safeURL(value) : value.slice(0, 100000);
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "boolean" || value === null) return value;
    if (Array.isArray(value)) return value.slice(0, 500).map((item) => safeValue(item, key, depth + 1));
    if (value && typeof value === "object") {
      const result = Object.create(null);
      for (const [field, item] of Object.entries(value).slice(0, 100)) {
        if (!["__proto__", "constructor", "prototype"].includes(field)) result[field] = safeValue(item, field, depth + 1);
      }
      return result;
    }
    return null;
  }

  function snapshot(paper, paperId) {
    if (!paper || typeof paper !== "object" || Array.isArray(paper)) throw error("INVALID", "A paper is required.");
    return { ...safeValue(paper), arxiv_id: paperId };
  }

  function emptyState() {
    return { schemaVersion: SCHEMA, collections: [], entries: Object.create(null) };
  }

  function buildBackupPayload(state) {
    return { format: "dit-paper-library", exportedAt: now(), schemaVersion: state.schemaVersion, collections: state.collections, entries: state.entries };
  }

  function ensureBackupCapacity(state) {
    // Match the actual JSON download, including its envelope and two-space indentation.
    // Checking inside the write transaction ensures every committed library can be restored.
    const bytes = new TextEncoder().encode(JSON.stringify(buildBackupPayload(state), null, 2)).length;
    if (bytes > LIMITS.importBytes) throw error("QUOTA", "The personal library backup would exceed 12 MiB. This change was not saved.", { bytes, limitBytes: LIMITS.importBytes });
  }

  function entryFor(state, paper) {
    const paperId = canonicalId(paper.arxiv_id || paper.paperId);
    if (!own(state.entries, paperId)) {
      if (Object.keys(state.entries).length >= LIMITS.entries) throw error("INVALID", "The library contains too many papers.");
      state.entries[paperId] = { paperId, saved: false, savedAt: null, collectionIds: [], note: "", noteRevision: 0, updatedAt: now(), snapshot: snapshot(paper, paperId) };
    } else state.entries[paperId].snapshot = { ...state.entries[paperId].snapshot, ...snapshot(paper, paperId) };
    return state.entries[paperId];
  }

  function collectionFor(state, collectionId) {
    const found = state.collections.find((collection) => collection.id === id(collectionId));
    if (!found) throw error("INVALID", "Collection no longer exists.");
    return found;
  }

  function normalizedOrder(state) {
    state.collections.sort((a, b) => a.order - b.order).forEach((collection, index) => { collection.order = index; });
  }

  function timestamp(value, fallback = now()) {
    return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : fallback;
  }

  function preservedNote(first, second, label) {
    if (!second || first === second || first.includes(second)) return first;
    if (!first) return second;
    const combined = `${first}\n\n---\n[${label}]\n${second}`;
    if (combined.length > LIMITS.note) throw error("INVALID", "Combined notes exceed the note limit; export each copy before merging.");
    return combined;
  }

  function validateState(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload) || payload.schemaVersion !== SCHEMA
      || !Array.isArray(payload.collections) || !payload.entries || typeof payload.entries !== "object" || Array.isArray(payload.entries)) {
      throw error("INVALID", "Unsupported or malformed library backup.");
    }
    if (payload.collections.length > LIMITS.collections || Object.keys(payload.entries).length > LIMITS.entries) throw error("INVALID", "Backup contains too many records.");
    const result = emptyState();
    const collectionIds = new Set();
    for (const item of payload.collections) {
      if (!item || typeof item !== "object") throw error("INVALID", "Invalid collection record.");
      const collectionId = id(item.id);
      if (collectionIds.has(collectionId)) throw error("INVALID", "Duplicate collection identifier.");
      collectionIds.add(collectionId);
      result.collections.push({ id: collectionId, name: name(item.name), order: Number.isFinite(item.order) ? item.order : result.collections.length, createdAt: timestamp(item.createdAt), updatedAt: timestamp(item.updatedAt) });
    }
    normalizedOrder(result);
    for (const [key, item] of Object.entries(payload.entries)) {
      if (!item || typeof item !== "object" || item.paperId !== key || typeof item.saved !== "boolean"
        || typeof item.note !== "string" || item.note.length > LIMITS.note || !Array.isArray(item.collectionIds)
        || !Number.isSafeInteger(item.noteRevision) || item.noteRevision < 0) throw error("INVALID", "Invalid paper or note record.");
      const paperId = id(key);
      const memberships = item.collectionIds.map(id);
      if (memberships.some((value) => !collectionIds.has(value))) throw error("INVALID", "A paper refers to an unknown collection.");
      result.entries[paperId] = {
        paperId, saved: item.saved, savedAt: item.saved ? timestamp(item.savedAt) : null,
        collectionIds: item.saved ? [...new Set(memberships)] : [], note: item.note,
        noteRevision: item.noteRevision, updatedAt: timestamp(item.updatedAt), snapshot: snapshot(item.snapshot, paperId),
      };
    }
    return result;
  }

  function migrateAliases(state) {
    const entries = Object.create(null);
    for (const entry of Object.values(state.entries)) {
      const paperId = canonicalId(entry.paperId);
      const incoming = { ...entry, paperId, snapshot: { ...entry.snapshot, arxiv_id: paperId } };
      if (!own(entries, paperId)) { entries[paperId] = incoming; continue; }
      const current = entries[paperId];
      const note = preservedNote(current.note, incoming.note, "Preserved note from merged paper ID");
      entries[paperId] = {
        ...current, saved: current.saved || incoming.saved,
        savedAt: [current.savedAt, incoming.savedAt].filter(Boolean).sort()[0] || null,
        collectionIds: [...new Set([...current.collectionIds, ...incoming.collectionIds])],
        note, noteRevision: Math.max(current.noteRevision, incoming.noteRevision) + (note !== current.note ? 1 : 0),
        updatedAt: [current.updatedAt, incoming.updatedAt].sort().pop(),
        snapshot: { ...incoming.snapshot, ...current.snapshot, arxiv_id: paperId },
      };
    }
    state.entries = entries;
    return state;
  }

  function openDatabase() {
    if (database) return Promise.resolve(database);
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(error("UNAVAILABLE", "This browser does not provide IndexedDB.")); return; }
      let request;
      try { request = window.indexedDB.open(DATABASE, 1); } catch (cause) { reject(storageError(cause)); return; }
      let failed = false;
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
      request.onblocked = () => { failed = true; reject(error("BLOCKED", "Close another tab using this library, then retry.")); };
      request.onerror = () => reject(storageError(request.error));
      request.onsuccess = () => {
        if (failed) { request.result.close(); return; }
        database = request.result;
        database.onversionchange = () => { database.close(); database = null; opening = null; };
        resolve(database);
      };
    });
    opening.catch(() => { opening = null; });
    return opening;
  }

  async function transaction(mutator = null) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      let tx;
      try { tx = db.transaction(STORE, mutator ? "readwrite" : "readonly"); } catch (cause) { reject(storageError(cause)); return; }
      const store = tx.objectStore(STORE);
      const request = store.get(KEY);
      let value;
      let result;
      let failure;
      request.onsuccess = () => {
        try {
          value = request.result === undefined ? emptyState() : validateState(request.result);
          if (mutator) { result = mutator(value); ensureBackupCapacity(value); store.put(value, KEY); }
        } catch (cause) { failure = storageError(cause); tx.abort(); }
      };
      tx.oncomplete = () => resolve({ state: clone(value), result: clone(result) });
      tx.onabort = () => reject(failure || storageError(tx.error));
      tx.onerror = () => { failure ||= storageError(tx.error); };
    });
  }

  function emit(state) {
    for (const callback of subscribers) {
      try { callback(clone(state)); } catch (cause) { console.error("Library subscriber failed", cause); }
    }
  }

  async function mutate(mutator) {
    const completed = await transaction(mutator);
    emit(completed.state);
    try { channel?.postMessage({ changed: true }); } catch { /* The committed data remains available on focus. */ }
    return completed;
  }

  async function refresh() {
    if (!subscribers.size) return;
    try { emit((await transaction()).state); } catch (cause) {
      window.dispatchEvent(new CustomEvent("dit:library-error", { detail: { code: storageError(cause).code } }));
    }
  }

  function importedPayload(payload) {
    let serialized;
    try { serialized = typeof payload === "string" ? payload : JSON.stringify(payload); } catch { throw error("INVALID", "Backup must be JSON."); }
    if (typeof serialized !== "string" || new TextEncoder().encode(serialized).length > LIMITS.importBytes) throw error("INVALID", "Backup exceeds 12 MiB.");
    let parsed;
    try { parsed = JSON.parse(serialized); } catch { throw error("INVALID", "Backup must contain valid JSON."); }
    if (parsed?.format && parsed.format !== "dit-paper-library") throw error("INVALID", "This is not a library backup.");
    return migrateAliases(validateState(parsed));
  }

  function mergeImported(current, incoming) {
    const summary = { collections: incoming.collections.length, entries: Object.keys(incoming.entries).length, notes: Object.values(incoming.entries).filter((entry) => entry.note.trim()).length, addedCollections: 0, addedEntries: 0, mergedEntries: 0, conflictingNotes: 0 };
    for (const collection of incoming.collections) {
      if (!current.collections.some((item) => item.id === collection.id)) {
        current.collections.push({ ...collection, order: current.collections.length });
        summary.addedCollections++;
      }
    }
    for (const [paperId, entry] of Object.entries(incoming.entries)) {
      if (!own(current.entries, paperId)) { current.entries[paperId] = clone(entry); summary.addedEntries++; continue; }
      const existing = current.entries[paperId];
      summary.mergedEntries++;
      const note = preservedNote(existing.note, entry.note, `Imported note · ${entry.updatedAt}`);
      if (existing.note && entry.note && note !== existing.note) summary.conflictingNotes++;
      current.entries[paperId] = {
        ...existing, saved: existing.saved || entry.saved,
        savedAt: existing.savedAt || entry.savedAt,
        collectionIds: [...new Set([...existing.collectionIds, ...entry.collectionIds])],
        snapshot: { ...entry.snapshot, ...existing.snapshot },
        note, noteRevision: existing.noteRevision + (note !== existing.note ? 1 : 0), updatedAt: now(),
      };
    }
    if (current.collections.length > LIMITS.collections || Object.keys(current.entries).length > LIMITS.entries) throw error("INVALID", "Merged library contains too many records.");
    normalizedOrder(current);
    return summary;
  }

  const api = {
    async init(aliasMap = {}) {
      if (!aliasMap || typeof aliasMap !== "object" || Array.isArray(aliasMap)) throw error("INVALID", "Invalid aliases.");
      const next = Object.create(null);
      for (const [from, to] of Object.entries(aliasMap)) next[id(from)] = id(to);
      const previous = aliases;
      aliases = next;
      try { for (const from of Object.keys(aliases)) canonicalId(from); } catch (cause) { aliases = previous; throw cause; }
      if (!channel && typeof window.BroadcastChannel === "function") {
        try { channel = new BroadcastChannel("dit-paper-library"); channel.onmessage = refresh; } catch { /* Focus refresh still works. */ }
      }
      try { return (await mutate((state) => migrateAliases(state))).state; }
      catch (cause) { aliases = previous; throw cause; }
    },
    canonicalId,
    async getState() { return (await transaction()).state; },
    subscribe(callback) {
      if (typeof callback !== "function") throw error("INVALID", "A subscriber must be a function.");
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },
    async setSaved(paper, saved) {
      return (await mutate((state) => {
        const entry = entryFor(state, paper);
        if (saved && !entry.saved) entry.savedAt = now();
        entry.saved = Boolean(saved);
        if (!entry.saved) { entry.collectionIds = []; entry.savedAt = null; }
        entry.updatedAt = now();
      })).state;
    },
    async createCollection(value) {
      const label = name(value);
      return (await mutate((state) => {
        if (state.collections.length >= LIMITS.collections) throw error("INVALID", "Too many collections.");
        if (state.collections.some((item) => item.name.toLocaleLowerCase() === label.toLocaleLowerCase())) throw error("DUPLICATE", "A collection with this name already exists.");
        const createdAt = now();
        const collection = { id: crypto.randomUUID(), name: label, order: state.collections.length, createdAt, updatedAt: createdAt };
        state.collections.push(collection);
        return collection;
      })).result;
    },
    async renameCollection(collectionId, value) {
      const label = name(value);
      return (await mutate((state) => {
        const collection = collectionFor(state, collectionId);
        if (state.collections.some((item) => item.id !== collectionId && item.name.toLocaleLowerCase() === label.toLocaleLowerCase())) throw error("DUPLICATE", "A collection with this name already exists.");
        collection.name = label; collection.updatedAt = now();
      })).state;
    },
    async moveCollection(collectionId, delta) {
      return (await mutate((state) => {
        collectionFor(state, collectionId); normalizedOrder(state);
        const index = state.collections.findIndex((item) => item.id === collectionId);
        const target = Math.max(0, Math.min(state.collections.length - 1, index + Math.sign(Number(delta) || 0)));
        const [collection] = state.collections.splice(index, 1);
        state.collections.splice(target, 0, collection);
        state.collections.forEach((item, order) => { item.order = order; });
      })).state;
    },
    async deleteCollection(collectionId) {
      const completed = await mutate((state) => {
        const collection = clone(collectionFor(state, collectionId));
        const memberIds = Object.values(state.entries).filter((entry) => entry.collectionIds.includes(collectionId)).map((entry) => entry.paperId);
        state.collections = state.collections.filter((item) => item.id !== collectionId);
        for (const entry of Object.values(state.entries)) entry.collectionIds = entry.collectionIds.filter((value) => value !== collectionId);
        normalizedOrder(state);
        return { collection, memberIds };
      });
      return { ...completed.result, state: completed.state };
    },
    async restoreCollection(collection, memberIds = []) {
      const restored = { ...collection, id: id(collection.id), name: name(collection.name) };
      return (await mutate((state) => {
        if (state.collections.some((item) => item.id === restored.id)) throw error("DUPLICATE", "Collection already exists.");
        if (state.collections.some((item) => item.name.toLocaleLowerCase() === restored.name.toLocaleLowerCase())) throw error("DUPLICATE", "A collection with this name already exists.");
        if (state.collections.length >= LIMITS.collections) throw error("INVALID", "Too many collections.");
        state.collections.splice(Math.max(0, Math.min(state.collections.length, restored.order || 0)), 0, restored);
        state.collections.forEach((item, order) => { item.order = order; });
        for (const value of memberIds) {
          const entry = state.entries[canonicalId(value)];
          if (entry?.saved) entry.collectionIds = [...new Set([...entry.collectionIds, restored.id])];
        }
      })).state;
    },
    async addToCollection(paperIds, collectionId) {
      return (await mutate((state) => {
        collectionFor(state, collectionId);
        for (const value of paperIds) {
          const entry = state.entries[canonicalId(value)];
          if (!entry?.saved) throw error("INVALID", "Save the paper before adding it to a collection.");
          entry.collectionIds = [...new Set([...entry.collectionIds, collectionId])]; entry.updatedAt = now();
        }
      })).state;
    },
    async removeFromCollection(paperIds, collectionId) {
      return (await mutate((state) => {
        collectionFor(state, collectionId);
        for (const value of paperIds) {
          const entry = state.entries[canonicalId(value)];
          if (entry) { entry.collectionIds = entry.collectionIds.filter((value) => value !== collectionId); entry.updatedAt = now(); }
        }
      })).state;
    },
    async saveNote(paper, text, expectedRevision) {
      if (typeof text !== "string" || text.length > LIMITS.note) throw error("INVALID", "Note exceeds 200,000 characters.");
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw error("INVALID", "A note revision is required.");
      return (await mutate((state) => {
        const entry = entryFor(state, paper);
        if (entry.noteRevision !== expectedRevision) throw error("CONFLICT", "This note changed in another tab. Your draft was not overwritten.", { current: clone(entry) });
        entry.note = text; entry.noteRevision++; entry.updatedAt = now();
        return entry;
      })).result;
    },
    async backup() { return buildBackupPayload(await api.getState()); },
    async previewImport(payload) {
      const incoming = importedPayload(payload);
      const current = await api.getState();
      const summary = mergeImported(current, incoming);
      ensureBackupCapacity(current);
      return summary;
    },
    async importBackup(payload) {
      const incoming = importedPayload(payload);
      return (await mutate((state) => mergeImported(state, incoming))).state;
    },
  };
  window.addEventListener("focus", refresh);
  window.addEventListener("pageshow", refresh);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
  window.DiTLibraryStore = api;
})();
