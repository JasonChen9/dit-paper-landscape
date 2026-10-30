/* Exercise library business rules against a serialized, rollback-capable IDB test adapter.
 * Browser availability and persistence across real reloads are checked in the UI separately. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

function memoryIDB() {
  let committed;
  let queue = Promise.resolve();
  let failNextPut = false;
  const db = {
    objectStoreNames: { contains: () => true },
    close() {},
    transaction() {
      let finish;
      const previous = queue;
      queue = new Promise((resolve) => { finish = resolve; });
      let aborted = false;
      let pending;
      let wrote = false;
      const tx = {
        error: null,
        abort() {
          if (aborted) return;
          aborted = true;
          queueMicrotask(() => { tx.onabort?.(); finish(); });
        },
        objectStore() {
          return {
            get() {
              const request = {};
              previous.then(() => {
                request.result = structuredClone(committed);
                request.onsuccess?.();
                queueMicrotask(() => {
                  if (aborted) return;
                  if (wrote) committed = pending;
                  tx.oncomplete?.(); finish();
                });
              });
              return request;
            },
            put(value) {
              if (failNextPut) { failNextPut = false; throw new DOMException("Storage full", "QuotaExceededError"); }
              pending = structuredClone(value); wrote = true;
            },
          };
        },
      };
      return tx;
    },
  };
  return {
    open() { const request = {}; queueMicrotask(() => { request.result = db; request.onsuccess?.(); }); return request; },
    failWrite() { failNextPut = true; },
  };
}

function client(indexedDB) {
  const window = { indexedDB, addEventListener() {}, dispatchEvent() {} };
  const context = vm.createContext({ window, document: { addEventListener() {} }, console, structuredClone, TextEncoder, URL, crypto: webcrypto, CustomEvent: class {} });
  vm.runInContext(fs.readFileSync(require("node:path").join(__dirname, "../site/library-store.js"), "utf8"), context);
  return window.DiTLibraryStore;
}

(async () => {
  const db = memoryIDB();
  const store = client(db);
  await store.init();
  const first = { arxiv_id: "old-id", title: "First paper", pdf_url: "javascript:alert(1)" };
  const second = { arxiv_id: "second", title: "Second paper" };
  await Promise.all([store.setSaved(first, true), store.setSaved(second, true)]);
  assert.equal(Object.keys((await store.getState()).entries).length, 2, "concurrent writes must preserve both entries");
  assert.equal((await store.getState()).entries["old-id"].snapshot.pdf_url, "", "imported snapshot URLs must be safe");
  const collection = await store.createCollection("Reading");
  const another = await store.createCollection("Seminar");
  await store.addToCollection(["old-id"], collection.id);
  await store.addToCollection(["old-id"], another.id);
  assert.equal((await store.getState()).entries["old-id"].collectionIds.length, 2, "one paper can belong to two collections");
  await store.saveNote(first, "My reading note", 0);
  await assert.rejects(store.saveNote(first, "stale draft", 0), (e) => e.code === "CONFLICT" && e.current.note === "My reading note");
  await store.setSaved(first, false);
  assert.equal((await store.getState()).entries["old-id"].note, "My reading note", "unstar must keep notes");
  assert.equal((await store.getState()).entries["old-id"].collectionIds.length, 0);
  await store.setSaved(first, true);
  await store.addToCollection(["old-id"], collection.id);
  const deleted = await store.deleteCollection(collection.id);
  assert.equal((await store.getState()).entries["old-id"].saved, true, "deleting a collection must preserve the paper");
  await store.restoreCollection(deleted.collection, deleted.memberIds);
  assert.equal((await store.getState()).entries["old-id"].collectionIds[0], collection.id);
  await assert.rejects(store.addToCollection(["second", "missing"], collection.id), (e) => e.code === "INVALID");
  assert.equal((await store.getState()).entries.second.collectionIds.length, 0, "partly invalid bulk operations roll back");
  await store.init({ "old-id": "canonical-id" });
  assert.equal((await store.getState()).entries["canonical-id"].note, "My reading note", "aliases move notes and saved state");
  assert.equal((await store.getState()).entries["old-id"], undefined);
  await assert.rejects(store.init({ a: "b", b: "a" }), (e) => e.code === "INVALID");
  assert.equal(store.canonicalId("old-id"), "canonical-id", "invalid aliases must not replace working aliases");
  const backup = await store.backup();
  const fresh = client(memoryIDB());
  await fresh.init();
  await fresh.importBackup(backup);
  assert.equal(JSON.stringify(await fresh.getState()), JSON.stringify(await store.getState()), "backup round trip must preserve personal content");
  await store.saveNote({ arxiv_id: "canonical-id" }, "Changed current note", 1);
  const preview = await store.previewImport(backup);
  assert.equal(preview.conflictingNotes, 1);
  await store.importBackup(backup);
  const merged = (await store.getState()).entries["canonical-id"].note;
  assert.ok(merged.includes("Changed current note") && merged.includes("My reading note"), "import conflict must preserve both notes");
  const before = JSON.stringify(await store.getState());
  db.failWrite();
  await assert.rejects(store.saveNote({ arxiv_id: "canonical-id" }, "uncommitted", 3), (e) => e.code === "QUOTA");
  assert.equal(JSON.stringify(await store.getState()), before, "failed writes must not change data");
  await assert.rejects(store.previewImport('{"schemaVersion":999}'), (e) => e.code === "INVALID");
  await assert.rejects(store.createCollection("Reading"), (e) => e.code === "DUPLICATE");
  await assert.rejects(store.createCollection("bad\nname"), (e) => e.code === "INVALID");
  assert.throws(() => store.canonicalId("__proto__"), (e) => e.code === "INVALID");
  const shared = memoryIDB();
  const tabA = client(shared);
  const tabB = client(shared);
  await Promise.all([tabA.init(), tabB.init()]);
  await Promise.all([
    tabA.setSaved({ arxiv_id: "legacy", title: "Legacy" }, true),
    tabB.setSaved({ arxiv_id: "current", title: "Current" }, true),
  ]);
  await tabA.saveNote({ arxiv_id: "legacy" }, "Legacy note", 0);
  await tabB.saveNote({ arxiv_id: "current" }, "Current note", 0);
  await tabA.init({ legacy: "current" });
  const consolidated = await tabA.getState();
  assert.equal(Object.keys(consolidated.entries).length, 1, "aliases coalesce duplicates across tabs");
  assert.ok(consolidated.entries.current.note.includes("Legacy note") && consolidated.entries.current.note.includes("Current note"), "alias collisions must preserve both notes");
  const currentRevision = consolidated.entries.current.noteRevision;
  await tabA.saveNote({ arxiv_id: "current" }, "Most recent note", currentRevision);
  await assert.rejects(tabB.saveNote({ arxiv_id: "current" }, "Stale other-tab draft", currentRevision), (e) => e.code === "CONFLICT");
  const bounded = client(memoryIDB());
  await bounded.init();
  const largePaper = { arxiv_id: "size-boundary", title: "UTF-8 backup boundary", padding1: "", padding2: "", padding3: "" };
  for (let part = 0; part < 41; part++) largePaper[`part${part}`] = "中".repeat(100000);
  await bounded.setSaved(largePaper, true);
  const byteLimit = 12 * 1024 * 1024;
  const initialBytes = Buffer.byteLength(JSON.stringify(await bounded.backup(), null, 2));
  let available = byteLimit - initialBytes - 8;
  for (let part = 1; part <= 3; part++) {
    const length = Math.min(100000, available);
    largePaper[`padding${part}`] = "a".repeat(length);
    available -= length;
  }
  assert.equal(available, 0, "fixture should fill the backup to eight bytes below its limit");
  await bounded.setSaved(largePaper, true);
  const nearLimit = JSON.stringify(await bounded.backup(), null, 2);
  assert.equal(Buffer.byteLength(nearLimit), byteLimit - 8);
  const importedLarge = client(memoryIDB());
  await importedLarge.init();
  await importedLarge.importBackup(nearLimit);
  assert.equal(Buffer.byteLength(JSON.stringify(await importedLarge.backup(), null, 2)), byteLimit - 8, "a maximal committed backup must round-trip");
  let notifications = 0;
  bounded.subscribe(() => { notifications++; });
  await assert.rejects(bounded.saveNote({ arxiv_id: "size-boundary" }, "中".repeat(20), 0), (e) => e.code === "QUOTA" && e.limitBytes === byteLimit);
  assert.equal((await bounded.getState()).entries["size-boundary"].note, "", "over-capacity note must leave the old committed note intact");
  assert.equal(notifications, 0, "failed capacity check must not publish a saved-state notification");
  assert.equal(Buffer.byteLength(JSON.stringify(await bounded.backup(), null, 2)), byteLimit - 8);
  await assert.rejects(bounded.init({ "size-boundary": "a-much-longer-canonical-identifier-that-does-not-fit-the-backup-boundary" }), (e) => e.code === "QUOTA");
  assert.equal(bounded.canonicalId("size-boundary"), "size-boundary", "failed alias migration must preserve the working alias map");
  assert.equal(Object.keys((await bounded.getState()).entries)[0], "size-boundary", "over-capacity alias migration must roll back data");
  console.log("Library store: concurrent writes, atomic rollback, note conflict, alias migration, backup merge, safe URLs and limits passed.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
