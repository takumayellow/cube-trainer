/**
 * live/trace.js — keep a record of what the camera saw and what the page made
 * of it, for working out afterwards why a solve went wrong.
 *
 * Every entry is kept in this browser's storage until it is written out. Once
 * a folder has been chosen (File System Access, in Chrome, Edge and Vivaldi),
 * entries are appended about once a second to `live-YYYY-MM-DD.jsonl` there,
 * one JSON object a line, and the folder is remembered for the next visit —
 * after a reload the browser asks once more before writing to it. Without a
 * folder, `download()` saves what is kept as one .jsonl file.
 *
 * Console: LiveTrace.read(), LiveTrace.clear().
 */
'use strict';

(function () {
  const KEY = 'live-trace';          // entries not yet in a file
  const KEEP = 5000;                 // most entries kept when nothing is written out (about 2 MB)
  const FLUSH_MS = 1000;
  const DB = 'cube-trainer';
  const STORE = 'handles';

  const session = new Date().toISOString();
  let pending = [];
  try { pending = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { pending = []; }
  if (!Array.isArray(pending)) pending = [];
  let folder = null;                 // a directory handle allowed to be written
  let stored = null;                 // a remembered handle still waiting for permission
  let writing = Promise.resolve();
  let timer = null;
  let onChange = () => {};

  const canPick = () => typeof window.showDirectoryPicker === 'function';
  const pad = n => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return `live-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.jsonl`; };

  function save() {
    // With a folder, everything waits for the next write; without one, keep the latest.
    if (!folder && pending.length > KEEP) pending = pending.slice(-KEEP);
    try { localStorage.setItem(KEY, JSON.stringify(pending.slice(-KEEP))); } catch (e) { /* storage full or blocked */ }
  }

  function idb(mode, fn) {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('no indexedDB')); return; }
      const open = indexedDB.open(DB, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(STORE);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const tx = open.result.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => { open.result.close(); resolve(req && req.result); };
        tx.onerror = () => { open.result.close(); reject(tx.error); };
      };
    });
  }

  async function append(dir, text) {
    const file = await dir.getFileHandle(today(), { create: true });
    const size = (await file.getFile()).size;
    const out = await file.createWritable({ keepExistingData: true });
    await out.seek(size);
    await out.write(text);
    await out.close();
  }

  function flush() {
    clearTimeout(timer);
    timer = null;
    save();
    if (!folder) return writing;
    const dir = folder;
    // Writes run one after another; each takes what is waiting when its turn comes,
    // so nothing is written twice and entries added meanwhile wait for the next one.
    writing = writing.then(async () => {
      if (folder !== dir || !pending.length) return;
      const batch = pending.slice();
      try {
        await append(dir, batch.map(e => JSON.stringify(e)).join('\n') + '\n');
        pending = pending.slice(batch.length);
        save();
      } catch (err) {
        // permission withdrawn or the folder gone: keep the entries, ask again
        stored = dir;
        folder = null;
        save();
        console.warn('LiveTrace: could not write the log', err);
        onChange();
      }
    });
    return writing;
  }

  function add(kind, data) {
    pending.push(Object.assign({ at: new Date().toISOString(), session, kind }, data));
    if (!timer) timer = setTimeout(flush, FLUSH_MS);
  }

  async function use(dir) {
    folder = dir;
    stored = null;
    try { await idb('readwrite', s => s.put(dir, 'log-folder')); } catch (e) { /* not remembered; still written */ }
    onChange();
    return flush();
  }

  /**
   * Ask for a folder (needs a click). Resolves true when writing to it, false
   * when the player cancels, or the browser's reason when it refuses (Chrome
   * will not hand out Desktop, Documents or Downloads themselves, only a
   * folder inside them).
   */
  async function pick() {
    if (stored) {
      try {
        if (await stored.requestPermission({ mode: 'readwrite' }) === 'granted') { await use(stored); return true; }
      } catch (e) { /* fall through to a new pick */ }
    }
    if (!canPick()) return false;
    try {
      await use(await window.showDirectoryPicker({ id: 'cube-trainer-log', mode: 'readwrite' }));
      return true;
    } catch (e) {
      if (e && e.name === 'AbortError') return false;   // cancelled
      console.warn('LiveTrace: could not use the folder', e);
      return (e && e.message) || String(e);
    }
  }

  /** Pick up the folder chosen on an earlier visit, without asking. */
  async function restore() {
    if (!canPick()) return;
    let dir = null;
    try { dir = await idb('readonly', s => s.get('log-folder')); } catch (e) { return; }
    if (!dir || typeof dir.queryPermission !== 'function') return;
    try {
      if (await dir.queryPermission({ mode: 'readwrite' }) === 'granted') { await use(dir); return; }
    } catch (e) { /* treat as not granted */ }
    stored = dir;
    onChange();
  }

  /** Save what is kept as one file through the browser's downloads. */
  function download() {
    const blob = new Blob([pending.map(e => JSON.stringify(e)).join('\n') + '\n'], { type: 'application/x-ndjson' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = today();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /** 'file' (writing to a folder), 'ask' (a folder waits for a click), 'none'. */
  function state() {
    if (folder) return { kind: 'file', name: folder.name, kept: pending.length };
    if (stored) return { kind: 'ask', name: stored.name, kept: pending.length };
    return { kind: 'none', kept: pending.length, canPick: canPick() };
  }

  window.LiveTrace = {
    add, pick, restore, download, state, flush,
    set onChange(fn) { onChange = typeof fn === 'function' ? fn : () => {}; },
    read: () => pending.map(e => Object.assign({}, e)),
    clear: () => { pending = []; save(); },
  };
})();
