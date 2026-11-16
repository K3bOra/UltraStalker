/* Ultra Stalker Web — receiver backups.

   Load:  an ultrastalker-backup-*.zip made by the receiver (Ultra Stalker > Backup).
          Its servers (profiles.json + portals.txt), hidden servers and Favorites
          (from ultrastalker.db) are copied into this browser, and the whole file is
          kept so nothing else in it is lost.
   Save:  a new ultrastalker-backup-*.zip in exactly the receiver's format 9: the
          kept backup with this browser's servers and Favorites written into it.
          The receiver checks it like any of its own backups and restores it. */
(function () {
  "use strict";
  const HERE = ((document.currentScript && document.currentScript.src) || location.href).replace(/[^/]*$/, "");
  const E = () => window.USEngine;
  const ALLOWED = new Set([
    "profiles.json", "disabled_profiles.json", "settings.json", "recent_searches.json", "smart_engines.json",
    "title_engines.json", "ui_state.json", ".wizard_done", "portals.txt", "portal.txt", "api_keys.conf",
    "ultrastalker.db", "manifest.json", "manual_tmdb.json",
  ]);
  const MAX_ARCHIVE = 128 * 1024 * 1024;
  const SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS favorites(content_key TEXT PRIMARY KEY,portal TEXT NOT NULL,media_type TEXT NOT NULL,payload TEXT NOT NULL,updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS favorite_folders(folder_id TEXT PRIMARY KEY,portal TEXT NOT NULL,mac TEXT NOT NULL,media_type TEXT NOT NULL,name TEXT NOT NULL,sort_order INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_favorite_folders_scope ON favorite_folders(portal,mac,media_type,sort_order);
CREATE TABLE IF NOT EXISTS favorite_folder_items(folder_id TEXT NOT NULL,content_key TEXT NOT NULL,sort_order INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL,PRIMARY KEY(folder_id,content_key),FOREIGN KEY(folder_id) REFERENCES favorite_folders(folder_id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_favorite_folder_items_key ON favorite_folder_items(content_key);
CREATE TABLE IF NOT EXISTS history(content_key TEXT PRIMARY KEY,portal TEXT NOT NULL,media_type TEXT NOT NULL,payload TEXT NOT NULL,position INTEGER NOT NULL DEFAULT 0,duration INTEGER NOT NULL DEFAULT 0,completed INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_history_updated ON history(updated_at DESC);
CREATE TABLE IF NOT EXISTS search_history(term TEXT PRIMARY KEY,normalized TEXT NOT NULL,updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS cache(cache_key TEXT PRIMARY KEY,payload TEXT NOT NULL,expires_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_cache_expiry ON cache(expires_at);
CREATE TABLE IF NOT EXISTS portal_state(portal_key TEXT PRIMARY KEY,payload TEXT NOT NULL,updated_at INTEGER NOT NULL);`;
  const SCHEMA_VERSION = 5;

  /* ------------------------------------------------------------- loaders */
  const loaded = {};
  function script(src) {
    if (!loaded[src]) {
      loaded[src] = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = src;
        s.onload = resolve;
        s.onerror = () => reject(new Error("Could not load " + src));
        document.head.appendChild(s);
      });
    }
    return loaded[src];
  }
  async function zipLib() {
    await script(HERE + "vendor/fflate.min.js");
    return window.fflate;
  }
  let sqlPromise = null;
  async function sqlLib() {
    await script(HERE + "vendor/sql-wasm.js");
    if (!sqlPromise) sqlPromise = window.initSqlJs({ locateFile: (f) => HERE + "vendor/" + f });
    return sqlPromise;
  }

  /* ---------------------------------------------------- small IndexedDB */
  function idb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("ultrastalker-web", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("kv");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function kv(mode, fn) {
    const db = await idb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("kv", mode);
      const out = fn(tx.objectStore("kv"));
      tx.oncomplete = () => resolve(out && "result" in out ? out.result : undefined);
      tx.onerror = () => reject(tx.error);
    });
  }
  const putBase = (bytes, meta) => kv("readwrite", (s) => { s.put(bytes, "base"); s.put(meta, "base-meta"); });
  const getBase = () => kv("readonly", (s) => s.get("base"));
  const getBaseMeta = () => kv("readonly", (s) => s.get("base-meta"));

  /* ------------------------------------------------------------- helpers */
  const td = new TextDecoder("utf-8", { fatal: false });
  const te = new TextEncoder();
  const text = (bytes) => td.decode(bytes).replace(/^﻿/, "");
  async function sha256(bytes) {
    const d = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  function stamp(d = new Date()) {
    const p = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }
  /* sql.js has no WAL support; the receiver's database is WAL. Bytes 18-19 of the
     SQLite header say which journal to use: 1/1 = classic. The receiver switches it
     back to WAL by itself when it opens the file. */
  function classicJournal(bytes) {
    const b = new Uint8Array(bytes);
    if (b.length > 100 && b[18] === 2 && b[19] === 2) {
      b[18] = 1;
      b[19] = 1;
    }
    return b;
  }
  async function openDb(bytes) {
    const SQL = await sqlLib();
    return bytes ? new SQL.Database(classicJournal(bytes)) : new SQL.Database();
  }

  /* ------------------------------------------------------------- inspect */
  async function readArchive(bytes) {
    if (bytes.length > MAX_ARCHIVE) throw new Error("This backup is too large (over 128 MB).");
    const fflate = await zipLib();
    let files;
    try {
      files = fflate.unzipSync(bytes);
    } catch (_) {
      throw new Error("This file is not a ZIP backup.");
    }
    if (!files["manifest.json"]) throw new Error("This is not an Ultra Stalker backup (manifest.json is missing).");
    let manifest;
    try {
      manifest = JSON.parse(text(files["manifest.json"]));
    } catch (_) {
      throw new Error("The backup manifest is damaged.");
    }
    if (manifest.product !== "UltraStalker") throw new Error("This is not an Ultra Stalker backup.");
    const fmt = parseInt(manifest.format, 10) || 0;
    if (fmt < 1 || fmt > 9) throw new Error("This backup format (" + manifest.format + ") is not supported yet.");
    for (const name of Object.keys(files)) {
      if (name.endsWith("/")) continue;
      if (!ALLOWED.has(name)) throw new Error("The backup contains an unexpected file: " + name);
    }
    if (fmt >= 6 && manifest.sha256 && typeof manifest.sha256 === "object") {
      for (const [name, expected] of Object.entries(manifest.sha256)) {
        if (!files[name]) throw new Error("The backup is missing " + name);
        if ((await sha256(files[name])) !== String(expected).toLowerCase()) throw new Error("The backup is damaged (" + name + " does not match its fingerprint).");
      }
    }
    return { files, manifest, format: fmt };
  }
  async function favoritesFromDb(bytes) {
    if (!bytes) return [];
    const db = await openDb(bytes);
    try {
      const out = [];
      const res = db.exec("SELECT content_key, payload, updated_at FROM favorites ORDER BY updated_at ASC, rowid ASC");
      for (const [key, payload, updated] of (res[0] && res[0].values) || []) {
        try {
          const p = JSON.parse(payload);
          if (!p || typeof p.item !== "object") continue;
          out.push({ key: String(key), portal: String(p.portal || ""), mac: String(p.mac || ""), media_type: String(p.media_type || "").toLowerCase(), item: p.item, updated_at: Number(updated) || 0 });
        } catch (_) {}
      }
      return out;
    } finally {
      db.close();
    }
  }
  function jsonMember(files, name, fallback) {
    if (!files[name]) return fallback;
    try {
      return JSON.parse(text(files[name]));
    } catch (_) {
      return fallback;
    }
  }

  /* -------------------------------------------------------------- import */
  async function importFile(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { files, manifest, format } = await readArchive(bytes);
    const eng = E();
    const profiles = jsonMember(files, "profiles.json", []);
    const saved = (Array.isArray(profiles) ? profiles : []).filter((p) => p && typeof p === "object");
    let textRows = [];
    for (const name of ["portals.txt", "portal.txt"]) if (files[name]) textRows = textRows.concat(eng.parseTextImports(text(files[name])));
    const disabled = (jsonMember(files, "disabled_profiles.json", []) || []).filter((k) => Array.isArray(k) && k.length === 2).map((k) => [String(k[0]), String(k[1])]);
    const favorites = await favoritesFromDb(files["ultrastalker.db"]);

    eng.store.setProfiles(saved);
    eng.store.setText(textRows);
    eng.store.setDisabled(disabled);
    eng.store.setFavorites(favorites);
    eng.resetClients();
    const meta = {
      name: file.name,
      size: bytes.length,
      imported_at: Date.now(),
      created_at: Number(manifest.created_at || 0) * 1000,
      plugin_version: String(manifest.plugin_version || ""),
      format,
      source_platform: String(manifest.source_platform || ""),
    };
    await putBase(bytes, meta);
    const active = eng.activeProfiles();
    return {
      sources: active.length,
      portals: active.filter((p) => eng.profileKind(p) === "portal").length,
      playlists: active.filter((p) => eng.profileKind(p) !== "portal").length,
      receiverOnly: active.filter((p) => String(p.portal).toLowerCase().startsWith("file://")).length,
      favorites: favorites.length,
      meta,
    };
  }

  /* -------------------------------------------------------------- export */
  async function syncFavorites(db) {
    db.run(SCHEMA);
    const meta = db.exec("SELECT value FROM metadata WHERE key='schema_version'");
    if (!meta.length) {
      db.run("INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(?,?)", [SCHEMA_VERSION, Math.floor(Date.now() / 1000)]);
      db.run("INSERT OR REPLACE INTO metadata(key,value) VALUES('schema_version',?)", [String(SCHEMA_VERSION)]);
    }
    const want = E().store.favorites().filter((f) => f && f.key && f.item);
    const keep = new Set(want.map((f) => f.key));
    const have = new Set(((db.exec("SELECT content_key FROM favorites")[0] || {}).values || []).map((r) => String(r[0])));
    db.run("BEGIN");
    for (const key of have) {
      if (!keep.has(key)) {
        db.run("DELETE FROM favorite_folder_items WHERE content_key=?", [key]);
        db.run("DELETE FROM favorites WHERE content_key=?", [key]);
      }
    }
    let t = Math.floor(Date.now() / 1000);
    for (const f of want) {
      if (have.has(f.key)) continue;
      const payload = { portal: f.portal, mac: f.mac, media_type: f.media_type, item: f.item };
      db.run("INSERT OR IGNORE INTO favorites(content_key,portal,media_type,payload,updated_at) VALUES(?,?,?,?,?)", [f.key, String(f.portal || ""), f.media_type, JSON.stringify(payload), f.updated_at || t++]);
    }
    db.run("COMMIT");
    const check = db.exec("PRAGMA quick_check");
    if (!check.length || String(check[0].values[0][0]).toLowerCase() !== "ok") throw new Error("The favorites database failed its check.");
  }
  async function exportZip() {
    const fflate = await zipLib();
    const base = await getBase();
    const baseMeta = (await getBaseMeta()) || {};
    let files = {}, manifestBase = {};
    if (base) {
      const r = await readArchive(new Uint8Array(base));
      files = r.files;
      manifestBase = r.manifest;
    }
    const eng = E();
    const members = {};
    for (const [name, data] of Object.entries(files)) if (name !== "manifest.json" && ALLOWED.has(name)) members[name] = data;
    members["profiles.json"] = te.encode(JSON.stringify(eng.store.profiles(), null, 2));
    const disabled = eng.store.disabled().map((k) => [String(k[0]), String(k[1])]).sort((a, b) => (a[0] + a[1] < b[0] + b[1] ? -1 : 1));
    if (disabled.length || members["disabled_profiles.json"]) members["disabled_profiles.json"] = te.encode(JSON.stringify(disabled, null, 2));
    if (!members["manual_tmdb.json"]) members["manual_tmdb.json"] = te.encode(JSON.stringify({ schema: 1, choices: {} }));
    const db = await openDb(members["ultrastalker.db"] || null);
    try {
      await syncFavorites(db);
      members["ultrastalker.db"] = db.export();
    } finally {
      db.close();
    }
    const names = Object.keys(members).sort();
    const hashes = {};
    for (const n of names) hashes[n] = await sha256(members[n]);
    const manifest = {
      product: "UltraStalker",
      format: 9,
      plugin_version: String(manifestBase.plugin_version || baseMeta.plugin_version || "9.3.7"),
      created_at: Math.floor(Date.now() / 1000),
      contains_secrets: true,
      backup_kind: "complete-user-state",
      artwork_included: false,
      portable: true,
      source_platform: String(manifestBase.source_platform || "open"),
      compatible_platforms: ["dreamos", "open"],
      members: names,
      sha256: hashes,
      integrity_scope: "corruption-detection",
      authenticated: false,
      created_by: "Ultra Stalker Web",
    };
    const zipInput = {};
    for (const n of names) zipInput[n] = [members[n], { level: 6 }];
    zipInput["manifest.json"] = [te.encode(JSON.stringify(manifest, null, 2)), { level: 6 }];
    const zipped = fflate.zipSync(zipInput);
    return {
      blob: new Blob([zipped], { type: "application/zip" }),
      name: "ultrastalker-backup-" + stamp() + ".zip",
      fromReceiver: !!base,
      sources: eng.store.profiles().length + eng.store.textProfiles().length,
      favorites: eng.store.favorites().length,
    };
  }

  async function status() {
    const eng = E();
    const meta = (await getBaseMeta().catch(() => null)) || null;
    return { base: meta, sources: eng.activeProfiles().length, favorites: eng.store.favorites().length };
  }
  async function forget() {
    await kv("readwrite", (s) => { s.delete("base"); s.delete("base-meta"); });
  }

  window.USBackup = { importFile, exportZip, status, forget, readArchive };
})();
