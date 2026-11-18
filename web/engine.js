/* Ultra Stalker Web — the receiver's web backend, rebuilt inside the browser.

   The pages (index.html and sources.html) are the receiver's own Browse and
   Manage Servers pages. On the receiver they call /api/... on the box; here every
   /api/... call is answered by this file instead:

   - saved sources and favorites live in this browser (localStorage), in the same
     shape the receiver stores them, so a receiver backup can be loaded and a
     backup for the receiver can be written back (see backup.js);
   - Stalker portals, Xtream and M3U are spoken to directly from the browser,
     through the small relay Worker (see worker/), because browsers can't send the
     MAC cookie / MAG headers or reach plain-http servers on their own. */
(function () {
  "use strict";
  const H = window.USHash;
  const CFG = window.US_WEB_CONFIG || {};
  const UA = "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG254 stbapp ver: 4 rev: 272 Safari/533.3";
  const XUA = "Model: MAG254; Link: Ethernet";
  const MEDIA = ["itv", "vod", "series"];
  const PAGE = 60;
  const K = { profiles: "us-web-profiles", text: "us-web-text-profiles", disabled: "us-web-disabled", favs: "us-web-favorites", relay: "us-web-relay" };

  /* ------------------------------------------------------------------ helpers */
  class WebError extends Error {
    constructor(message, status = 400) {
      super(message);
      this.status = status;
    }
  }
  const str = (v) => (v == null ? "" : String(v)).trim();
  const empty = (v) => v === undefined || v === null || v === "";
  const load = (key, fallback) => {
    try {
      const v = JSON.parse(localStorage.getItem(key) || "null");
      return v == null ? fallback : v;
    } catch (_) {
      return fallback;
    }
  };
  const STATE_KEYS = ["profiles", "text", "disabled", "favs"];
  function idbOpen() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("ultrastalker-web", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("kv");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  let mirrorTimer = null;
  function mirror() {
    clearTimeout(mirrorTimer);
    mirrorTimer = setTimeout(async () => {
      try {
        const snap = {};
        for (const k of STATE_KEYS) snap[k] = localStorage.getItem(K[k]);
        snap.saved_at = Date.now();
        const db = await idbOpen();
        db.transaction("kv", "readwrite").objectStore("kv").put(snap, "state");
      } catch (_) {}
    }, 150);
  }
  const save = (key, value) => {
    localStorage.setItem(key, JSON.stringify(value));
    if (key !== K.relay) mirror();
  };
  /* Browsers sometimes clear localStorage on their own; bring the last copy back from IndexedDB. */
  const ready = (async () => {
    try {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    } catch (_) {}
    try {
      if (STATE_KEYS.some((k) => localStorage.getItem(K[k]) !== null)) return;
      const db = await idbOpen();
      const snap = await new Promise((resolve) => {
        const r = db.transaction("kv", "readonly").objectStore("kv").get("state");
        r.onsuccess = () => resolve(r.result || null);
        r.onerror = () => resolve(null);
      });
      if (snap) for (const k of STATE_KEYS) if (snap[k] != null) localStorage.setItem(K[k], snap[k]);
    } catch (_) {}
  })();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ?relay=<address> (for testing) is remembered in this browser; ?relay=default forgets it.
  try {
    const want = new URLSearchParams(location.search).get("relay");
    if (want === "default") localStorage.removeItem(K.relay);
    else if (want && /^https?:\/\//i.test(want)) localStorage.setItem(K.relay, want);
  } catch (_) {}
  function relayBase() {
    let v = "";
    try {
      v = localStorage.getItem(K.relay) || "";
    } catch (_) {}
    return str(v || CFG.relay).replace(/\/+$/, "");
  }
  function b64url(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = "";
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function relayUrl(url, headers) {
    const base = relayBase();
    if (!base) throw new WebError("The website relay is not set up yet.", 503);
    let out = base + "/p?u=" + encodeURIComponent(url);
    if (headers && Object.keys(headers).length) out += "&h=" + b64url(JSON.stringify(headers));
    return out;
  }
  async function relayFetch(url, headers, { timeout = 20000, retries = 1 } = {}) {
    let last;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeout);
      try {
        const res = await fetch(relayUrl(url, headers), { signal: ctrl.signal, cache: "no-store", __usNative: true });
        clearTimeout(timer);
        if (res.status === 502 || res.status === 403) {
          const j = await res.json().catch(() => ({}));
          if (j && j.error) throw new WebError(j.error === "unreachable" ? "Server unreachable" : j.error, res.status);
        }
        return res;
      } catch (e) {
        clearTimeout(timer);
        last = e;
        if (e instanceof WebError && e.status === 403) throw e;
        if (attempt < retries) await sleep(500 * (attempt + 1));
      }
    }
    if (last && last.name === "AbortError") throw new WebError("Server did not answer in time", 504);
    throw last instanceof WebError ? last : new WebError("Server unreachable", 502);
  }
  function parseJsonText(text) {
    const t = String(text || "").replace(/^\uFEFF/, "").trim();
    if (!t) return null;
    try {
      return JSON.parse(t);
    } catch (_) {
      const a = t.indexOf("{"), b = t.lastIndexOf("}");
      if (a >= 0 && b > a) {
        try {
          return JSON.parse(t.slice(a, b + 1));
        } catch (__) {}
      }
      return undefined;
    }
  }
  /* An image address the page can show: plain http goes through the relay
     (https pages may not load http pictures). */
  function imageUrl(url, base) {
    let u = str(url);
    if (!u) return "";
    try {
      u = new URL(u, base || undefined).toString();
    } catch (_) {
      return "";
    }
    if (/^https:/i.test(u)) return u;
    if (/^http:/i.test(u)) {
      try {
        return relayUrl(u);
      } catch (_) {
        return "";
      }
    }
    return "";
  }

  /* ----------------------------------------------------- profiles (sources) */
  const MAC_RE = /^\s*([0-9A-Fa-f]{2}(?:[:-][0-9A-Fa-f]{2}){5}|[0-9A-Fa-f]{12})\s*$/;
  function canonicalMac(v) {
    const raw = String(v || "").replace(/[^0-9A-Fa-f]/g, "");
    if (raw.length !== 12) return "";
    return raw.match(/../g).join(":").toUpperCase();
  }
  function syntheticMac(portal) {
    const raw = "02" + H.sha1(String(portal || "")).slice(0, 10);
    return raw.match(/../g).join(":").toUpperCase();
  }
  function looksLikeM3u(value) {
    const s = str(value);
    if (!s) return false;
    const low = s.toLowerCase();
    if (low.startsWith("file://")) return true;
    if (low.startsWith("m3u://") || low.startsWith("m3u8://")) return true;
    try {
      const u = new URL(s);
      const path = u.pathname.toLowerCase(), q = u.search.toLowerCase();
      if (path.endsWith(".m3u") || path.endsWith(".m3u8")) return true;
      if (q.includes("type=m3u") || q.includes("output=m3u")) return true;
      if (path.includes("get.php") && (q.includes("username=") || q.includes("password="))) return true;
    } catch (_) {}
    return false;
  }
  function profileKind(p) {
    const portal = str(p && p.portal);
    const stype = str(p && p.source_type).toLowerCase();
    if (stype !== "m3u" && !looksLikeM3u(portal)) return "portal";
    const mode = str(p && p.playlist_mode).toLowerCase();
    if (mode === "xtream" || mode === "m3u") return mode;
    if (portal.toLowerCase().startsWith("file://")) return "m3u";
    const low = portal.toLowerCase();
    if ((low.includes("get.php") || low.includes("player_api.php") || low.includes("username=")) && low.includes("password=")) return "xtream";
    return "m3u";
  }
  /* Same rules as the receiver's storage._normalize_profile, for rows this site creates or edits. */
  function normalizeProfile(raw, defaultSource = "web") {
    if (!raw || typeof raw !== "object") return null;
    let portal = str(raw.portal).replace(/[.,;]+$/, "");
    const local = portal.toLowerCase().startsWith("file://");
    let stype = str(raw.source_type).toLowerCase() || (local || looksLikeM3u(portal) ? "m3u" : "stalker");
    if (local) stype = "m3u";
    else if (stype === "m3u") {
      if (/^m3u:\/\//i.test(portal)) portal = "http://" + portal.slice(6);
      else if (/^m3u8:\/\//i.test(portal)) portal = "http://" + portal.slice(7);
    }
    if (!local && !/^https?:\/\//i.test(portal) && portal) portal = "https://" + portal;
    if (!portal) return null;
    if (!local) {
      try {
        const u = new URL(portal);
        if (!/^https?:$/.test(u.protocol) || !u.hostname) return null;
      } catch (_) {
        return null;
      }
    }
    const mac = stype === "m3u" ? syntheticMac(portal) : canonicalMac(raw.mac);
    if (!mac) return null;
    const out = Object.assign({}, raw, {
      portal,
      mac,
      state: str(raw.state || "Not checked").slice(0, 160),
      source: str(raw.source || defaultSource).slice(0, 40),
      source_type: stype === "m3u" ? "m3u" : "stalker",
      health: str(raw.health || "unknown").slice(0, 16),
      name: str(raw.name).slice(0, 80),
      account_state: str(raw.account_state).slice(0, 80),
      expiry: str(raw.expiry).slice(0, 80),
      allow_http_fallback: false,
      http_fallback_accepted: false,
      tls_fallback_accepted: false,
      tls_mode: "strict",
      device_profile: ["auto", "mag250", "mag254", "mag256"].includes(str(raw.device_profile).toLowerCase()) ? str(raw.device_profile).toLowerCase() : "auto",
      explicit_http_accepted: /^http:\/\//i.test(portal) ? !!raw.explicit_http_accepted : false,
    });
    if (out.source_type === "m3u") {
      const pm = str(raw.playlist_mode).toLowerCase();
      out.playlist_mode = pm === "xtream" || pm === "m3u" ? pm : profileKind(Object.assign({}, out, { playlist_mode: "" }));
    } else delete out.playlist_mode;
    return out;
  }
  const profileKey = (p) => [str(p.portal).replace(/\/+$/, "").toLowerCase(), str(p.mac).toUpperCase()];
  const keyText = (k) => k[0] + "|" + k[1];

  const store = {
    profiles: () => load(K.profiles, []),
    textProfiles: () => load(K.text, []),
    disabled: () => load(K.disabled, []),
    setProfiles: (rows) => save(K.profiles, rows),
    setText: (rows) => save(K.text, rows),
    setDisabled: (rows) => save(K.disabled, rows),
    favorites: () => load(K.favs, []),
    setFavorites: (rows) => save(K.favs, rows),
  };

  /* Active sources in receiver order: saved rows, then portals.txt rows, minus disabled ones. */
  function activeProfiles() {
    const disabled = new Set(store.disabled().map((k) => keyText(k)));
    const seen = new Set(), out = [];
    for (const raw of store.profiles().concat(store.textProfiles())) {
      const p = normalizeProfile(raw, raw.source || "saved");
      if (!p) continue;
      const k = keyText(profileKey(p));
      if (seen.has(k) || disabled.has(k)) continue;
      seen.add(k);
      out.push(p);
    }
    return out;
  }
  const accountId = (p) => "a" + H.sha1(keyText(profileKey(p))).slice(0, 14);
  function findProfile(id) {
    const p = activeProfiles().find((x) => accountId(x) === id);
    if (!p) throw new WebError("This source is no longer saved", 404);
    return p;
  }
  function hostName(url) {
    try {
      return new URL(url).host;
    } catch (_) {
      return str(url).slice(0, 40);
    }
  }
  function displayName(p, index) {
    if (str(p.name)) return str(p.name);
    const kind = profileKind(p);
    const label = kind === "portal" ? "Portal" : kind === "xtream" ? "Xtream" : "M3U";
    return label + " " + (index + 1) + " · " + hostName(p.portal);
  }

  /* ------------------------------------------------------------ item cache */
  const ITEMS = new Map();
  function identity(media, item) {
    const order = {
      itv: ["ch_id", "id", "channel_id", "cmd", "command", "url", "name", "title"],
      vod: ["movie_id", "id", "video_id", "tmdb_id", "imdb_id", "cmd", "command", "url", "name", "title"],
      series: ["series_id", "id", "series_uid", "tmdb_id", "imdb_id", "cmd", "command", "url", "name", "title"],
    }[media] || ["id", "movie_id", "series_id", "episode_id", "ch_id", "cmd", "command", "url", "name", "title"];
    for (const k of order) {
      const v = item && item[k];
      if (!empty(v)) return k + ":" + String(v).trim().slice(0, 420);
    }
    const title = str(item && (item.original_name || item.original_title || item.name || item.title)) || "unknown";
    const year = str(item && (item.year || item.release_year || item.first_air_date)).slice(0, 10);
    return { title: title.slice(0, 280), year };
  }
  /* The receiver's content_key(): sha256 of [portal, MAC, media, identity] as compact JSON. */
  function sortedJson(v) {
    if (Array.isArray(v)) return "[" + v.map(sortedJson).join(",") + "]";
    if (v && typeof v === "object") return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + sortedJson(v[k])).join(",") + "}";
    return JSON.stringify(v);
  }
  function contentKey(profile, media, item) {
    const portal = str(profile.portal).replace(/\/+$/, "").toLowerCase();
    const mac = str(profile.mac).toUpperCase();
    return H.sha256(sortedJson([portal, mac, media, identity(media, item)]));
  }
  function remember(account, media, row, extra = {}) {
    const ident = identity(media, row);
    const token = media.slice(0, 2) + H.sha1(account + "|" + media + "|" + sortedJson(ident) + "|" + (extra.parent || "")).slice(0, 18);
    const entry = Object.assign({ account, media, item: row }, extra);
    ITEMS.set(token, entry);
    try {
      sessionStorage.setItem("usi:" + token, JSON.stringify(entry));
    } catch (_) {
      try {
        Object.keys(sessionStorage).filter((k) => k.startsWith("usi:")).forEach((k) => sessionStorage.removeItem(k));
      } catch (__) {}
    }
    return token;
  }
  function cached(token) {
    const t = str(token);
    let e = ITEMS.get(t);
    if (!e) {
      try {
        e = JSON.parse(sessionStorage.getItem("usi:" + t) || "null");
      } catch (_) {
        e = null;
      }
      if (e) ITEMS.set(t, e);
    }
    if (!e) throw new WebError("This item expired; open it again from its folder", 410);
    return e;
  }

  /* ------------------------------------------------------------- Stalker */
  function portalIdentity(mac) {
    const sn = H.md5(mac).toUpperCase().slice(0, 13);
    const deviceId = H.sha256(mac).toUpperCase();
    const deviceId2 = H.sha256(deviceId).toUpperCase();
    const hw2 = H.sha1(mac);
    const prehash = H.sha1(sn + mac);
    const signature = H.sha256(deviceId + deviceId).toUpperCase();
    return { sn, deviceId, deviceId2, hw2, prehash, signature };
  }
  function portalEndpoints(url) {
    let u;
    try {
      u = new URL(str(url));
    } catch (_) {
      return [];
    }
    const base = u.origin;
    const path = u.pathname.replace(/\/+$/, "");
    const low = path.toLowerCase();
    const c = [];
    if (low.endsWith("portal.php") || low.endsWith("server/load.php")) c.push(base + path);
    if (low.includes("stalker_portal")) c.push(base + path.slice(0, low.indexOf("stalker_portal")).replace(/\/+$/, "") + "/stalker_portal/server/load.php");
    if (low.endsWith("/c")) c.push(base + path.slice(0, -2) + "/server/load.php");
    c.push(base + "/portal.php", base + "/server/load.php", base + "/stalker_portal/server/load.php");
    return [...new Set(c)].slice(0, 5);
  }
  const SESSIONS = new Map();
  class Stalker {
    constructor(profile) {
      this.p = profile;
      this.mac = canonicalMac(profile.mac);
      this.key = accountId(profile);
      const saved = load("us-web-sess-" + this.key, null);
      this.endpoint = (saved && saved.endpoint) || "";
      this.token = "";
      this.random = "";
      this.authing = null;
    }
    headers(token) {
      const h = {
        "User-Agent": UA,
        "X-User-Agent": XUA,
        Cookie: "mac=" + this.mac + "; stb_lang=en; timezone=Europe%2FLondon",
        Accept: "*/*",
      };
      try {
        h.Referer = new URL(this.p.portal).origin + "/";
      } catch (_) {}
      if (token) h.Authorization = "Bearer " + token;
      return h;
    }
    async raw(endpoint, params, token) {
      const url = endpoint + (endpoint.includes("?") ? "&" : "?") + new URLSearchParams(params).toString();
      const res = await relayFetch(url, this.headers(token));
      const text = await res.text();
      if (!res.ok && !text) throw new WebError("Portal answered " + res.status, 502);
      const obj = parseJsonText(text);
      if (obj === undefined) {
        if (/authoriz|token/i.test(text)) throw new WebError("invalid token", 401);
        throw new WebError("Portal sent an unreadable answer", 502);
      }
      const js = obj && typeof obj === "object" && "js" in obj ? obj.js : obj;
      return { js, text };
    }
    async handshakeOn(endpoint) {
      const tries = [
        { type: "stb", action: "handshake", token: "", JsHttpRequest: "1-xml" },
        { type: "stb", action: "handshake", token: "", mac: this.mac, JsHttpRequest: "1-xml" },
      ];
      for (const params of tries) {
        try {
          const { js } = await this.raw(endpoint, params, "");
          if (js && js.token) return { token: String(js.token), random: str(js.random) };
        } catch (e) {
          if (e.status === 504 || e.status === 403) throw e;
        }
      }
      const fake = H.sha1(String(Math.random()) + Date.now()).slice(0, 32).toUpperCase();
      const { js } = await this.raw(endpoint, { type: "stb", action: "handshake", JsHttpRequest: "1-xml", mac: this.mac, prehash: H.sha1(fake) }, fake);
      if (js && js.token) return { token: String(js.token), random: str(js.random) };
      throw new WebError("Portal refused the MAC address", 401);
    }
    profileParams(full) {
      const id = portalIdentity(this.mac);
      const ts = String(Math.floor(Date.now() / 1000));
      if (!full) return { type: "stb", action: "get_profile", JsHttpRequest: "1-xml", sn: id.sn, device_id: "", timestamp: ts };
      return {
        type: "stb", action: "get_profile", JsHttpRequest: "1-xml", hd: "1",
        ver: "ImageDescription: 0.2.18-r23-254; PORTAL version: 5.3.0; API Version: JS API version: 343; STB API version: 146; Player Engine version: 0x58c",
        num_banks: "2", sn: id.sn, stb_type: "MAG254", client_type: "STB", image_version: "218", video_out: "hdmi",
        device_id: id.deviceId, device_id2: id.deviceId2, signature: id.signature, auth_second_step: "1",
        hw_version: "2.6-IB-00", not_valid_token: "0",
        metrics: JSON.stringify({ type: "STB", model: "MAG254", mac: this.mac, sn: id.sn, uid: "", random: this.random || "" }),
        hw_version_2: id.hw2, timestamp: ts, api_signature: "262", prehash: id.prehash,
      };
    }
    async authorize(force = false) {
      if (this.token && !force) return;
      if (this.authing) return this.authing;
      this.authing = (async () => {
        const list = this.endpoint ? [this.endpoint].concat(portalEndpoints(this.p.portal).filter((e) => e !== this.endpoint)) : portalEndpoints(this.p.portal);
        let last = null;
        for (const ep of list) {
          try {
            const hs = await this.handshakeOn(ep);
            this.endpoint = ep;
            this.token = hs.token;
            this.random = hs.random;
            let prof = null;
            for (const full of [true, false]) {
              try {
                const { js } = await this.raw(ep, this.profileParams(full), this.token);
                if (js && typeof js === "object") {
                  prof = js;
                  if (!(/error/i.test(str(js.msg)) && !js.play_token)) break;
                }
              } catch (e) {
                if (e.status === 401) break;
              }
            }
            if (prof && prof.status === 2 && /block/i.test(str(prof.msg))) throw new WebError("Portal reports this account blocked", 403);
            save("us-web-sess-" + this.key, { endpoint: ep });
            return;
          } catch (e) {
            last = e;
            if (e.status === 403 && /block/i.test(e.message)) throw e;
          }
        }
        throw last || new WebError("Portal unreachable", 502);
      })();
      try {
        await this.authing;
      } finally {
        this.authing = null;
      }
    }
    async call(params) {
      await this.authorize();
      for (let attempt = 0; attempt < 2; attempt++) {
        let out;
        try {
          out = await this.raw(this.endpoint, params, this.token);
        } catch (e) {
          if (e.status === 401 && attempt === 0) {
            await this.authorize(true);
            continue;
          }
          throw e;
        }
        const bad = out.js == null && /authoriz|invalid token|access denied/i.test(out.text);
        if (bad && attempt === 0) {
          await this.authorize(true);
          continue;
        }
        return out.js;
      }
      throw new WebError("Portal session expired", 401);
    }
    static rows(js) {
      if (Array.isArray(js)) return js.filter((x) => x && typeof x === "object");
      if (js && typeof js === "object") {
        for (const k of ["data", "items", "channels", "results"]) if (Array.isArray(js[k])) return js[k].filter((x) => x && typeof x === "object");
      }
      return [];
    }
    portalPrefix() {
      const ep = this.endpoint || portalEndpoints(this.p.portal)[0] || "";
      return ep.replace(/server\/load\.php$|portal\.php$/i, "");
    }
    /* Folders, pages, search and seasons ask the portal exactly the way the receiver
       does (client_mixin_catalogue.py / client_mixin_series.py), so portals answer
       the site the same way they answer Ultra Stalker. */
    async categoryRows(media, action) {
      for (const sortby of [false, true]) {
        const params = { type: media, action, JsHttpRequest: "1-xml" };
        if (sortby) params.sortby = "number";
        const js = await this.call(params);
        const rows = Stalker.rows(js);
        if (rows.length || Array.isArray(js)) return rows;
      }
      return [];
    }
    async categories(media) {
      const label = (r) => str(r.title || r.name || r.category_name || r.genre_name || r.label || r.alias);
      let rows = [];
      if (media === "itv") {
        rows = await this.categoryRows("itv", "get_genres");
        // Some portals answer get_genres with short routing labels (AR, AR, AR…); their real folders are in get_categories.
        const counts = {};
        rows.forEach((r) => { const k = label(r).toLowerCase(); if (k) counts[k] = (counts[k] || 0) + 1; });
        if (rows.length >= 8 && Object.entries(counts).some(([k, n]) => n >= 3 && k.length <= 4)) {
          const alt = await this.categoryRows("itv", "get_categories").catch(() => []);
          if (new Set(alt.map(label)).size > new Set(rows.map(label)).size) rows = alt;
        }
      } else {
        rows = await this.categoryRows(media, "get_categories");
        if (!rows.length) rows = await this.categoryRows(media, "get_genres");
      }
      return rows
        .map((r) => ({ id: str(r.id ?? r.category_id ?? r.genre_id), title: label(r) }))
        .filter((r) => r.id !== "" && r.title);
    }
    listParams(media, category, page) {
      const params = { type: media, action: "get_ordered_list", p: String(page), JsHttpRequest: "1-xml" };
      if (media === "itv") Object.assign(params, { genre: category, force_ch_link_check: "0" });
      else if (media === "vod") params.category = category;
      else Object.assign(params, { movie_id: "0", season_id: "0", episode_id: "0", category });
      return params;
    }
    async page(media, category, page) {
      let js, rows = [];
      for (const sortby of [false, true]) {
        const params = this.listParams(media, category, page);
        if (sortby) params.sortby = "number";
        js = await this.call(params);
        rows = Stalker.rows(js);
        if (rows.length) break;
      }
      const meta = js && typeof js === "object" && !Array.isArray(js) ? js : {};
      const total = Number(meta.total_items || meta.total || 0) || 0;
      const per = Number(meta.max_page_items || meta.page_size || rows.length || 1) || 1;
      return { rows, total, hasNext: rows.length > 0 && (total ? page * per < total : rows.length >= per) };
    }
    async search(media, q) {
      // Like the receiver: the first search key that gets rows is used, then every row is checked against the words.
      const ident = (r) => str(r.id || r.series_id || r.movie_id || r.cmd || r.name);
      let key = null, first = null;
      for (const k of ["search", "search_str", "name"]) {
        try {
          const params = this.listParams(media, "*", 1);
          params[k] = q;
          const js = await this.call(params);
          if (Stalker.rows(js).length) {
            key = k;
            first = js;
            break;
          }
        } catch (_) {}
      }
      if (!key) return [];
      const needle = str(q).toLowerCase(), words = normTitle(q).split(" ").filter(Boolean);
      const out = [], seen = new Set();
      let js = first;
      for (let p = 1; p <= 4; p++) {
        if (p > 1) {
          const params = this.listParams(media, "*", p);
          params[key] = q;
          try {
            js = await this.call(params);
          } catch (_) {
            break;
          }
        }
        const rows = Stalker.rows(js);
        let fresh = 0;
        for (const r of rows) {
          const k = ident(r);
          if (seen.has(k)) continue;
          seen.add(k);
          fresh++;
          const hay = str(r.name || r.title) + " " + str(r.o_name) + " " + str(r.description || r.descr);
          const norm = normTitle(hay);
          if (hay.toLowerCase().includes(needle) || words.every((w) => norm.includes(w))) out.push(r);
        }
        const total = Number((js && js.total_items) || 0), per = Number((js && js.max_page_items) || rows.length || 1);
        if (!rows.length || !fresh || (total && seen.size >= total) || (!total && rows.length < per)) break;
      }
      return out;
    }
    seriesId(item) {
      return item.series_id || item.id || item.movie_id;
    }
    static rowIdentity(row, index) {
      const ep = row.episode_id || row.episode;
      if (!empty(ep)) return "episode|" + str(row.season || row.season_number || row.season_id) + "|" + str(ep) + "|" + str(row.id);
      const n = Stalker.seasonNumber(row, "");
      if (!empty(n)) return "season|" + str(n);
      if (!empty(row.season_id)) return "season_id|" + str(row.season_id);
      if (!empty(row.id)) return "id|" + str(row.id);
      return "row|" + str(row.name || row.title) + "|" + index;
    }
    static mergeRows(...lists) {
      const merged = new Map();
      for (const list of lists) {
        (list || []).forEach((row, i) => {
          if (!row || typeof row !== "object") return;
          const k = Stalker.rowIdentity(row, i);
          const prev = merged.get(k);
          if (!prev) merged.set(k, Object.assign({}, row));
          else for (const [f, v] of Object.entries(row)) if (!(v == null || v === "" || (Array.isArray(v) && !v.length))) prev[f] = v;
        });
      }
      return [...merged.values()];
    }
    static suspicious(rows) {
      if (!rows.length) return true;
      if (rows.some((r) => r.episode_id || r.episode)) return false;
      const nums = [];
      rows.forEach((r, i) => {
        let t = str(Stalker.seasonNumber(r, i + 1));
        if (t.includes(":")) t = t.split(":").pop();
        const n = parseInt(t, 10);
        if (Number.isFinite(n)) nums.push(n);
      });
      if (!nums.length) return false;
      const u = [...new Set(nums)].sort((a, b) => a - b);
      if (u[0] > 1) return true;
      return u.length !== u[u.length - 1] - u[0] + 1;
    }
    async seriesRowsOnce(seriesId, page) {
      const params = { type: "series", action: "get_ordered_list", movie_id: String(seriesId), season_id: "0", episode_id: "0", JsHttpRequest: "1-xml" };
      if (page != null) Object.assign(params, { p: String(page), page: String(page) });
      return Stalker.rows(await this.call(params));
    }
    async seriesRows(seriesId) {
      const fresh = await this.seriesRowsOnce(seriesId);
      let combined = Stalker.mergeRows(fresh);
      if (Stalker.suspicious(fresh)) {
        try {
          combined = Stalker.mergeRows(combined, await this.seriesRowsOnce(seriesId));
        } catch (_) {}
        let seen = combined.length;
        for (let page = 1; page < 5; page++) {
          let rows;
          try {
            rows = await this.seriesRowsOnce(seriesId, page);
          } catch (_) {
            break;
          }
          if (!rows.length) break;
          const merged = Stalker.mergeRows(combined, rows);
          if (merged.length <= seen) break;
          combined = merged;
          seen = combined.length;
          if (!Stalker.suspicious(combined)) break;
        }
      }
      // Seasons carry their episode list; rows without one are other titles some portals add to later pages.
      if (combined.some((r) => Array.isArray(r.series) && r.series.length)) {
        combined = combined.filter((r) => (Array.isArray(r.series) && r.series.length) || (Array.isArray(r.episodes) && r.episodes.length) || str(r.id).includes(":"));
      }
      return combined;
    }
    static seasonNumber(season, fallback) {
      const sid = str(season && (season.id || season.season_id));
      if (sid.includes(":")) {
        const tail = sid.split(":").pop();
        if (tail) return tail;
      }
      return (season && (season.season || season.season_number)) || fallback;
    }
    async seasons(series) {
      const sid = this.seriesId(series);
      if (empty(sid)) return [];
      const rows = await this.seriesRows(sid);
      let result = rows.map((row, i) => {
        const s = Object.assign({}, row);
        const id = s.id || s.season_id || sid + ":" + (i + 1);
        const number = Stalker.seasonNumber(s, i + 1);
        Object.assign(s, { id, season_id: id, season: number, parent_series_id: sid });
        if (!s.name) s.name = "Season " + number;
        return s;
      });
      if (result.length && !result.some((x) => Array.isArray(x.series)) && result.some((x) => x.episode || x.episode_id)) {
        const groups = new Map();
        for (const ep of result) {
          const n = String(ep.season || ep.season_id || "1");
          if (!groups.has(n)) groups.set(n, []);
          groups.get(n).push(ep);
        }
        result = [...groups].map(([n, eps]) => ({ id: sid + ":" + n, season_id: sid + ":" + n, season: n, name: "Season " + n, episodes: eps, parent_series_id: sid }));
      }
      return result;
    }
    episodes(series, season) {
      const sid = this.seriesId(series);
      const seasonId = season.id || season.season_id || sid + ":1";
      const number = Stalker.seasonNumber(season, 1);
      const values = Array.isArray(season.episodes) && season.episodes.length ? season.episodes : season.series;
      if (!Array.isArray(values)) return [];
      const command = season.cmd || season.command || season.url || "";
      return values.map((v, i) => {
        let ep, epId;
        if (v && typeof v === "object") {
          ep = Object.assign({}, v);
          epId = ep.episode_id || ep.episode || ep.number || ep.episode_num || ep.episode_number || ep.id || i + 1;
          if (!ep.cmd) ep.cmd = command;
        } else {
          epId = v;
          ep = { cmd: command };
        }
        Object.assign(ep, { id: epId, episode_id: epId, episode: epId, number: epId, season: number, season_id: seasonId, stream_id: seasonId, movie_id: sid });
        if (!ep.name) ep.name = "Episode " + epId;
        for (const k of ["description", "actors", "director", "genres_str", "rating_imdb", "year", "screenshot_uri", "cover", "poster", "backdrop"]) {
          if (empty(ep[k]) && !empty(season[k])) ep[k] = season[k];
        }
        return ep;
      });
    }
    static stripWrapper(v) {
      let t = str(v).replace(/^["']|["']$/g, "");
      if (!t) return "";
      const parts = t.split(" ");
      if (parts.length > 1 && ["ffmpeg", "auto"].includes(parts[0].toLowerCase())) t = parts.slice(1).join(" ").trim();
      const m = t.match(/(https?|rtmp|rtsp|udp|rtp):\/\/\S+/i);
      if (m) t = m[0];
      return t.replace(/^["']|["']$/g, "");
    }
    cleanLive(v) {
      let t = Stalker.stripWrapper(v).replace(/%mac%/gi, this.mac);
      try {
        const u = new URL(t);
        if (!/^(https?|rtmp|rtsp|udp|rtp):$/i.test(u.protocol)) return "";
        if (["localhost", "127.0.0.1", "::1"].includes(u.hostname.toLowerCase()) || t.toLowerCase().includes("///")) return "";
        return t;
      } catch (_) {
        return "";
      }
    }
    static flag(v) {
      return ["1", "true", "yes", "on"].includes(String(v).trim().toLowerCase());
    }
    async vodMediaCommand(item, media) {
      const command = str(item.cmd || item.command || item.url);
      if (!command.startsWith("/media/")) return command;
      const sid = item.stream_id || item.season_id || item.id || item.movie_id;
      if (empty(sid)) return command;
      try {
        const rows = Stalker.rows(await this.call({ type: media === "vod" ? "vod" : "series", action: "get_ordered_list", movie_id: String(sid), season_id: "0", episode_id: "0", category: "1", sortby: "", p: "1", JsHttpRequest: "1-xml" }));
        const mid = rows[0] && rows[0].id;
        if (!empty(mid)) {
          const last = (command.split("?")[0].split("/").pop() || "");
          const ext = last.includes(".") ? "." + last.split(".").pop() : "";
          return "/media/file_" + mid + ext;
        }
      } catch (_) {}
      return command;
    }
    async link(row, media, seriesNumber) {
      let raw = str(row.cmd || row.command || row.url);
      if (media !== "itv") raw = await this.vodMediaCommand(row, media);
      raw = raw.replace(/^["']|["']$/g, "");
      if (!raw) throw new WebError("This item has no stream", 404);
      if (media === "itv") {
        const meta = ["use_http_tmp_link", "use_load_balancing", "disable_ad"].some((k) => k in row);
        const force = Stalker.flag(row.force_ch_link_check);
        const low = raw.toLowerCase();
        const needs = meta ? Stalker.flag(row.use_http_tmp_link) || Stalker.flag(row.use_load_balancing) || force
          : force || low.includes("localhost") || low.includes("///") || low.includes("/ch/") || !low.includes("http");
        const direct = this.cleanLive(raw);
        if (!needs && direct) return direct;
        const js = await this.call({ type: "itv", action: "create_link", cmd: raw, series: "0", forced_storage: "0", disable_ad: Stalker.flag(row.disable_ad) ? "1" : "0", download: "0", force_ch_link_check: force ? "1" : "0", JsHttpRequest: "1-xml" });
        const value = js && typeof js === "object" ? js.cmd || js.url || js.link : js;
        const clean = this.cleanLive(value);
        if (clean) return clean;
        if (direct) return direct;
        throw new WebError("Portal did not return a playable link", 502);
      }
      const directFallback = Stalker.stripWrapper(raw);
      const directOk = /^(https?|rtmp|rtsp):\/\//i.test(directFallback) && !/localhost|\/\/\//i.test(raw);
      const js = await this.call({ type: "vod", action: "create_link", cmd: raw, series: empty(seriesNumber) ? "" : String(seriesNumber), forced_storage: "", disable_ad: "0", download: "0", force_ch_link_check: "0", JsHttpRequest: "1-xml" });
      const value = js && typeof js === "object" ? js.cmd || js.url || js.link : js;
      const clean = Stalker.stripWrapper(value);
      if (/^(https?|rtmp|rtsp|udp|rtp):\/\//i.test(clean)) return clean;
      if (directOk) return directFallback;
      throw new WebError("Portal did not return a playable link", 502);
    }
    /* How to get this item's stream, for the relay's /play tickets: the relay asks the
       portal for a fresh link every time a player opens it (see worker/src/index.js). */
    async ticket(row, media, seriesNumber, altSeries) {
      await this.authorize();
      let raw = str(row.cmd || row.command || row.url);
      if (media !== "itv") raw = await this.vodMediaCommand(row, media);
      raw = raw.replace(/^["']|["']$/g, "");
      if (!raw) throw new WebError("This item has no stream", 404);
      const streamHeaders = { "User-Agent": UA };
      const base = {
        mode: "stalker", endpoint: this.endpoint, headers: this.headers(""), token: this.token, mac: this.mac,
        handshake: { type: "stb", action: "handshake", token: "", JsHttpRequest: "1-xml" },
        profile: this.profileParams(true), streamHeaders,
      };
      if (media === "itv") {
        const meta = ["use_http_tmp_link", "use_load_balancing", "disable_ad"].some((k) => k in row);
        const force = Stalker.flag(row.force_ch_link_check);
        const low = raw.toLowerCase();
        const needs = meta ? Stalker.flag(row.use_http_tmp_link) || Stalker.flag(row.use_load_balancing) || force
          : force || low.includes("localhost") || low.includes("///") || low.includes("/ch/") || !low.includes("http");
        const direct = this.cleanLive(raw);
        if (!needs && direct) return { mode: "direct", u: direct, h: streamHeaders, ext: /\.m3u8/i.test(direct) ? "m3u8" : "ts" };
        return Object.assign(base, {
          create: { type: "itv", action: "create_link", cmd: raw, series: "0", forced_storage: "0", disable_ad: Stalker.flag(row.disable_ad) ? "1" : "0", download: "0", force_ch_link_check: force ? "1" : "0", JsHttpRequest: "1-xml" },
          fallback: direct, ext: /m3u8/i.test(raw) ? "m3u8" : "ts",
        });
      }
      const directFallback = Stalker.stripWrapper(raw);
      const directOk = /^(https?|rtmp|rtsp):\/\//i.test(directFallback) && !/localhost|\/\/\//i.test(raw);
      const extm = (raw.split("?")[0].match(/\.(mp4|mkv|avi|m4v|mov|ts|m3u8|mpg)$/i) || [])[1];
      return Object.assign(base, {
        create: { type: "vod", action: "create_link", cmd: raw, series: empty(seriesNumber) ? "" : String(seriesNumber), forced_storage: "", disable_ad: "0", download: "0", force_ch_link_check: "0", JsHttpRequest: "1-xml" },
        altSeries: empty(altSeries) || String(altSeries) === String(seriesNumber) ? undefined : String(altSeries),
        fallback: directOk ? directFallback : "", ext: extm && extm.toLowerCase() !== "mpg" ? extm.toLowerCase() : "mp4",
      });
    }
    async accountInfo() {
      for (const type of ["account_info", "account"]) {
        try {
          const js = await this.call({ type, action: "get_main_info", JsHttpRequest: "1-xml" });
          if (js && typeof js === "object") return js;
        } catch (_) {}
      }
      return null;
    }
    art(row, media) {
      const base = this.portalPrefix() || this.p.portal;
      const pick = (...keys) => keys.map((k) => row[k]).find((v) => !empty(v) && String(v) !== "0");
      if (media === "itv") {
        let logo = str(pick("logo", "logo_url", "picon"));
        if (logo && !/^(https?:)?\//i.test(logo) && !logo.includes("/")) logo = "misc/logos/320/" + logo;
        return logo ? imageUrl(logo, base) : "";
      }
      const v = str(pick("screenshot_uri", "cover_big", "cover", "poster", "poster_url", "logo"));
      return v ? imageUrl(v, base) : "";
    }
  }

  /* --------------------------------------------------------- Xtream / M3U */
  function xtreamCreds(portal) {
    try {
      const u = new URL(portal);
      const user = u.searchParams.get("username"), pass = u.searchParams.get("password");
      if (!user || !pass) return null;
      const path = u.pathname.replace(/\/(get|player_api)\.php$/i, "").replace(/\/+$/, "");
      return { base: u.origin + path, user, pass };
    } catch (_) {
      return null;
    }
  }
  function xtreamPlaylist(host, user, pass) {
    const h = str(host).replace(/\/+$/, "");
    if (!h || !user || !pass) return "";
    return h + "/get.php?" + new URLSearchParams({ username: user, password: pass, type: "m3u_plus", output: "ts" }).toString();
  }
  const cleanTitle = (v) => str(v).replace(/\s+/g, " ");

  class Xtream {
    constructor(profile) {
      this.p = profile;
      this.c = xtreamCreds(profile.portal);
      if (!this.c) throw new WebError("Xtream details are incomplete", 400);
      this.cache = new Map();
      this.groups = {};
    }
    async api(action, extra = {}, key, ua) {
      const k = key || action + JSON.stringify(extra);
      if (this.cache.has(k)) return this.cache.get(k);
      const q = new URLSearchParams(Object.assign({ username: this.c.user, password: this.c.pass }, action ? { action } : {}, extra));
      const res = await relayFetch(this.c.base + "/player_api.php?" + q.toString(), { "User-Agent": ua || this.ua || "VLC/3.0.20 LibVLC/3.0.20" }, { timeout: 45000 });
      const text = await res.text();
      const js = parseJsonText(text);
      if (js === undefined) throw new WebError(res.ok ? "Server sent an unreadable answer" : "Server answered " + res.status, 502);
      if (action && !/info$/.test(action)) this.cache.set(k, js);
      return js;
    }
    streamUrl(kind, sid, ext) {
      const u = encodeURIComponent(this.c.user), p = encodeURIComponent(this.c.pass);
      if (kind === "itv") return `${this.c.base}/live/${u}/${p}/${sid}.${ext || "ts"}`;
      if (kind === "vod") return `${this.c.base}/movie/${u}/${p}/${sid}.${ext || "mp4"}`;
      return `${this.c.base}/series/${u}/${p}/${sid}.${ext || "mp4"}`;
    }
    /* Some panels answer with an object keyed by id instead of a list. */
    static asRows(js) {
      if (Array.isArray(js)) return js.filter((r) => r && typeof r === "object");
      if (js && typeof js === "object" && !js.user_info) {
        const vals = Object.values(js).filter((r) => r && typeof r === "object" && !Array.isArray(r));
        if (vals.length && vals.every((r) => "category_id" in r || "stream_id" in r || "series_id" in r)) return vals;
      }
      return [];
    }
    async categories(media) {
      const action = { itv: "get_live_categories", vod: "get_vod_categories", series: "get_series_categories" }[media];
      let out = [], lastErr = null;
      // Many panels only answer known player apps: try a few identities before giving up.
      for (const ua of [this.ua || "VLC/3.0.20 LibVLC/3.0.20", "IPTVSmartersPlayer", "okhttp/4.9.3", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"]) {
        try {
          const js = await this.api(action, {}, action + "|" + ua, ua);
          out = Xtream.asRows(js).map((r) => ({ id: str(r.category_id), title: str(r.category_name) || "Other" }));
          if (out.length) {
            this.ua = ua;
            break;
          }
        } catch (e) {
          lastErr = e;
        }
      }
      if (!out.length) {
        // Why is it empty? Ask for the account itself.
        let info = null;
        try {
          info = await this.api("", {}, "account|" + (this.ua || ""));
        } catch (e) {
          lastErr = lastErr || e;
        }
        const ui = info && info.user_info;
        if (ui && (String(ui.auth) === "0" || ui.auth === false)) throw new WebError("The server refused this login (wrong details, an expired line, or it does not accept web connections)", 401);
        if (ui && ui.status && !/^active$/i.test(String(ui.status))) throw new WebError("This line is " + String(ui.status).toLowerCase() + (ui.exp_date ? " (ended " + new Date(Number(ui.exp_date) * 1000).toLocaleDateString() + ")" : ""), 403);
        // Last way in: the same line's M3U playlist.
        try {
          const m = new M3U(Object.assign({}, this.p, { portal: xtreamPlaylist(this.c.base, this.c.user, this.c.pass), playlist_mode: "m3u" }));
          const cats = await m.categories(media);
          if (cats.length) {
            CLIENTS.set(accountId(this.p), m);
            return cats;
          }
        } catch (e) {
          lastErr = lastErr || e;
        }
        if (!ui && lastErr) throw lastErr;
      }
      this.groups[media] = new Map(out.map((r) => [r.id, r.title]));
      return out;
    }
    normalise(media, rows, cid) {
      const groups = this.groups[media] || new Map();
      return Xtream.asRows(rows).map((row, pos) => {
        const c = str(row.category_id || cid);
        const group = groups.get(c) || str(row.category_name) || "Other";
        if (media === "itv") {
          const sid = row.stream_id, name = str(row.name) || "Channel", icon = str(row.stream_icon);
          const url = this.streamUrl("itv", sid, "ts");
          return { id: "xt-live-" + sid, ch_id: "xt-live-" + sid, stream_id: sid, name, title: name, number: row.num || pos + 1, cmd: url, url, logo: icon, logo_url: icon, picon: icon, stream_icon: icon, genre: group, category: group, category_id: group, _xtream_category_id: c, tvg_id: str(row.epg_channel_id), epg_channel_id: str(row.epg_channel_id), _xtream: true, _xtream_kind: "itv" };
        }
        if (media === "vod") {
          const sid = row.stream_id, rawName = str(row.name) || "Movie", ext = str(row.container_extension) || "mp4";
          const cover = str(row.cover_big || row.movie_image || row.cover_tmdb || row.stream_icon || row.cover);
          let bd = row.backdrop_path || row.backdrop || "";
          if (Array.isArray(bd)) bd = bd[0] || "";
          const url = this.streamUrl("vod", sid, ext);
          return { id: "xt-vod-" + sid, movie_id: "xt-vod-" + sid, stream_id: sid, name: cleanTitle(rawName), title: cleanTitle(rawName), _raw_name: rawName, cmd: url, url, logo: cover, logo_url: cover, cover, cover_url: cover, poster: cover, poster_url: cover, backdrop: str(bd), backdrop_url: str(bd), genre: group, category: group, category_id: group, _xtream_category_id: c, rating: row.rating || row.rating_5based || "", rating_imdb: row.rating_imdb || row.rating || "", year: row.year || row.releaseDate || row.release_date || "", tmdb_id: row.tmdb_id || row.tmdb || "", imdb_id: row.imdb_id || "", plot: row.plot || row.description || "", container_extension: ext, _xtream: true, _xtream_kind: "vod" };
        }
        const sid = row.series_id, rawName = str(row.name) || "Series";
        const cover = str(row.cover_tmdb || row.cover_big || row.cover || row.stream_icon || row.movie_image);
        let bd = row.backdrop_path || row.backdrop || "";
        if (Array.isArray(bd)) bd = bd[0] || "";
        return { id: "xt-series-" + sid, series_id: str(sid), movie_id: "xt-series-" + sid, name: cleanTitle(rawName), title: cleanTitle(rawName), _raw_name: rawName, genre: group, category: group, category_id: group, _xtream_category_id: c, logo: cover, cover, cover_url: cover, poster: cover, poster_url: cover, backdrop: str(bd), backdrop_url: str(bd), rating: row.rating || row.rating_5based || "", rating_imdb: row.rating_imdb || row.rating || "", year: row.year || row.releaseDate || row.release_date || "", tmdb_id: row.tmdb_id || row.tmdb || "", imdb_id: row.imdb_id || "", plot: row.plot || "", season_count: suppliedSeasonCount(row), _m3u_series: true, _xtream: true, _xtream_kind: "series" };
      });
    }
    async list(media, category) {
      if (!this.groups[media]) await this.categories(media).catch(() => []);
      const action = { itv: "get_live_streams", vod: "get_vod_streams", series: "get_series" }[media];
      const extra = category && category !== "*" ? { category_id: category } : {};
      const key = "list:" + media + ":" + (extra.category_id || "*");
      if (this.cache.has(key)) return this.cache.get(key);
      const rows = this.normalise(media, await this.api(action, extra, "raw:" + key), extra.category_id);
      this.cache.set(key, rows);
      return rows;
    }
    async page(media, category, page) {
      const rows = await this.list(media, category);
      const start = (page - 1) * PAGE;
      return { rows: rows.slice(start, start + PAGE), total: rows.length, hasNext: start + PAGE < rows.length };
    }
    async search(media, q) {
      const rows = await this.list(media, "*");
      return searchRows(rows, q);
    }
    async seriesInfo(series) {
      return this.api("get_series_info", { series_id: String(series.series_id || str(series.id).replace(/^xt-series-/, "")) });
    }
    async seasons(series) {
      const info = await this.seriesInfo(series);
      const eps = (info && info.episodes) || {};
      const list = Array.isArray(eps) ? { 1: eps } : eps;
      const sid = str(series.series_id || series.id);
      const meta = new Map(((info && info.seasons) || []).map((s) => [String(s.season_number), s]));
      return Object.keys(list)
        .sort((a, b) => Number(a) - Number(b))
        .map((n) => {
          const episodes = (list[n] || []).map((e) => {
            const eid = e.id, num = Number(e.episode_num || 0) || 0, ext = str(e.container_extension) || "mp4";
            const url = this.streamUrl("series", eid, ext);
            const inf = e.info || {};
            return { id: "xt-ep-" + eid, episode_id: str(eid), episode: num, number: num, episode_num: num, season: Number(n) || n, season_id: String(n), series_id: sid, movie_id: "xt-series-" + sid, name: str(e.title) || "Episode " + num, title: str(e.title) || "Episode " + num, cmd: url, url, container_extension: ext, plot: str(inf.plot), cover: str(inf.movie_image), _xtream: true, _xtream_kind: "episode" };
          });
          const m = meta.get(String(n)) || {};
          return { id: "xs-" + sid + "-" + n, season_id: String(n), season: Number(n) || n, name: str(m.name) || "Season " + n, episodes, cover: str(m.cover || m.cover_big) };
        });
    }
    episodes(series, season) {
      return Array.isArray(season.episodes) ? season.episodes : [];
    }
    async link(row) {
      const u = str(row.url || row.cmd);
      if (!u) throw new WebError("This item has no stream", 404);
      return u;
    }
    art(row, media) {
      return imageUrl(media === "itv" ? row.stream_icon || row.logo : row.cover || row.poster || row.logo, this.c.base);
    }
    async details(entry) {
      const row = entry.item;
      if (entry.media === "vod") {
        const js = await this.api("get_vod_info", { vod_id: String(row.stream_id) }).catch(() => null);
        const inf = (js && js.info) || {};
        let bd = inf.backdrop_path || row.backdrop || "";
        if (Array.isArray(bd)) bd = bd[0] || "";
        return {
          overview: str(inf.plot || inf.description || row.plot), genres: splitGenres(inf.genre || row.genre_str),
          year: yearOf(inf.releasedate || inf.release_date || row.year), rating: num(inf.rating || row.rating),
          runtime: inf.duration_secs ? Math.round(Number(inf.duration_secs) / 60) : parseInt(inf.episode_run_time || inf.runtime || 0, 10) || "",
          backdrop: str(bd), poster: str(inf.movie_image || inf.cover_big),
        };
      }
      const js = await this.seriesInfo(row).catch(() => null);
      const inf = (js && js.info) || {};
      let bd = inf.backdrop_path || row.backdrop || "";
      if (Array.isArray(bd)) bd = bd[0] || "";
      return { overview: str(inf.plot || row.plot), genres: splitGenres(inf.genre), year: yearOf(inf.releaseDate || inf.release_date || row.year), rating: num(inf.rating || row.rating), runtime: parseInt(inf.episode_run_time || 0, 10) || "", backdrop: str(bd), poster: str(inf.cover) };
    }
  }

  const EP = [/\bS(\d{1,2})\s*E(\d{1,3})\b/i, /\b(\d{1,2})x(\d{1,3})\b/i, /\bseason[\s._-]*(\d{1,2}).{0,12}episode[\s._-]*(\d{1,3})\b/i];
  const EP_CLEAN = [/[\s._-]*\bS\d{1,2}\s*E\d{1,3}\b.*$/i, /[\s._-]*\b\d{1,2}x\d{1,3}\b.*$/i, /[\s._-]*\bseason[\s._-]*\d{1,2}.{0,12}episode[\s._-]*\d{1,3}\b.*$/i];
  function wordMatcher(words) {
    const latin = words.filter((w) => /^[\x00-\x7f]+$/.test(w)).map((w) => w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const other = words.filter((w) => !/^[\x00-\x7f]+$/.test(w));
    const rx = latin.length ? new RegExp("(?<![\\p{L}])(?:" + latin.join("|") + ")(?![\\p{L}])", "u") : null;
    return (g) => (rx && rx.test(g)) || other.some((w) => g.includes(w));
  }
  const isSeriesGroup = wordMatcher(["series", "tv series", "shows", "show", "مسلسل", "مسلسلات", "دراما"]);
  const isMovieGroup = wordMatcher(["movie", "movies", "vod", "film", "films", "cinema", "افلام", "أفلام", "فيلم"]);
  const isLiveGroup = wordMatcher(["live", "channel", "channels", "قنوات", "قناة", "sports", "news", "bein", "osn"]);
  function episodeNumbers(name) {
    const text = String(name || "").replace(/(?<![\w])24\s*[x/]\s*(?:7|365)(?![\d])/gi, " ");
    for (const rx of EP) {
      const m = text.match(rx);
      if (m) return [parseInt(m[1], 10), parseInt(m[2], 10)];
    }
    return null;
  }
  function seriesBase(name) {
    const t = str(name);
    for (const rx of EP_CLEAN) {
      const c = t.replace(rx, "").replace(/^[ ._\-|]+|[ ._\-|]+$/g, "");
      if (c && c !== t) return c;
    }
    return t;
  }
  function m3uKind(group, name, url) {
    const g = String(group || "").toLowerCase();
    if (episodeNumbers(name)) return "series";
    if (isSeriesGroup(g)) return "series";
    if (isMovieGroup(g)) return "vod";
    if (isLiveGroup(g)) return "itv";
    let path = "";
    try {
      path = new URL(url).pathname.toLowerCase();
    } catch (_) {}
    return /\.(mp4|mkv|avi|mov|wmv|m4v)$/.test(path) ? "vod" : "itv";
  }
  function attrMap(info) {
    const attrs = {};
    const text = String(info || "");
    for (const m of text.matchAll(/([\w-]+)=(?:"([^"]*)"|'([^']*)')/g)) attrs[m[1].toLowerCase()] = m[2] !== undefined && m[2] !== "" ? m[2] : m[3] || "";
    for (const m of text.matchAll(/([\w-]+)=([^"'\s,]+)/g)) if (!(m[1].toLowerCase() in attrs)) attrs[m[1].toLowerCase()] = m[2];
    return attrs;
  }
  const slugId = (...parts) => H.sha1(parts.map((x) => (x == null ? "" : String(x))).join("|")).slice(0, 20);

  class M3U {
    constructor(profile) {
      this.p = profile;
      this.data = null;
      this.loading = null;
    }
    async load() {
      if (this.data) return this.data;
      if (this.loading) return this.loading;
      this.loading = (async () => {
        if (str(this.p.portal).toLowerCase().startsWith("file://")) throw new WebError("This playlist is a file on the receiver", 400);
        const res = await relayFetch(this.p.portal, { "User-Agent": "VLC/3.0.20 LibVLC/3.0.20" }, { timeout: 90000 });
        if (!res.ok) throw new WebError("Playlist answered " + res.status, 502);
        const text = await res.text();
        if (!/#EXTM3U|#EXTINF/i.test(text.slice(0, 4096))) throw new WebError("This address is not an M3U playlist", 400);
        this.data = this.parse(text);
        return this.data;
      })();
      try {
        return await this.loading;
      } finally {
        this.loading = null;
      }
    }
    parse(text) {
      const live = [], movies = [], groups = new Map();
      let pending = null;
      for (let line of text.split(/\r?\n/)) {
        line = line.trim();
        if (!line) continue;
        if (/^#EXTINF/i.test(line)) {
          const body = line.slice(line.indexOf(":") + 1);
          let quote = "", split = -1;
          for (let i = 0; i < body.length; i++) {
            const ch = body[i];
            if (ch === '"' || ch === "'") {
              if (!quote) quote = ch;
              else if (ch === quote) quote = "";
            } else if (ch === "," && !quote) {
              split = i;
              break;
            }
          }
          const left = split < 0 ? body : body.slice(0, split);
          const title = split < 0 ? "" : body.slice(split + 1);
          const a = attrMap(left);
          pending = {
            name: str(a["tvg-name"] || a.tvg_name || title || "Untitled"),
            group: str(a["group-title"] || a.group_title || a.group || "Other") || "Other",
            logo: str(a["tvg-logo"] || a.tvg_logo || a.logo || a.icon || a["channel-logo"]),
            tvg_id: str(a["tvg-id"] || a.tvg_id),
          };
          continue;
        }
        if (line.startsWith("#")) {
          if (pending && /^#EXTGRP:/i.test(line)) {
            const g = str(line.split(":").slice(1).join(":"));
            if (g && ["", "Other"].includes(pending.group)) pending.group = g;
          } else if (pending && /^#EXTIMG:/i.test(line) && !pending.logo) pending.logo = str(line.split(":").slice(1).join(":"));
          continue;
        }
        const e = pending || { name: "Stream", group: "Other", logo: "", tvg_id: "" };
        pending = null;
        const { name, group, logo } = e, url = line;
        const kind = m3uKind(group, name, url);
        const common = { name, title: name, cmd: url, url, logo, logo_url: logo, picon: logo, stream_icon: logo, genre: group, category: group, category_id: group, tvg_id: e.tvg_id || "" };
        if (kind === "series") {
          const nums = episodeNumbers(name);
          if (!nums) {
            movies.push(Object.assign({}, common, { id: "m3u-vod-" + slugId(url, name), movie_id: "m3u-vod-" + slugId(url, name) }));
            continue;
          }
          const [season, episode] = nums;
          const base = seriesBase(name) || name;
          const gk = group.toLowerCase() + "\u0000" + base.toLowerCase();
          const sid = "m3u-series-" + slugId(group, base);
          if (!groups.has(gk)) groups.set(gk, { id: sid, name: base, group, logo, episodes: [] });
          groups.get(gk).episodes.push(Object.assign({}, common, { id: "m3u-ep-" + slugId(url, name), episode_id: String(episode), episode, number: episode, season, season_id: String(season), movie_id: sid, series_id: sid }));
        } else if (kind === "vod") {
          const id = "m3u-vod-" + slugId(url, name);
          movies.push(Object.assign({}, common, { id, movie_id: id }));
        } else {
          const id = "m3u-live-" + slugId(url, name);
          live.push(Object.assign({}, common, { id, ch_id: id, number: live.length + 1 }));
        }
      }
      const series = [...groups.values()].map((b) => {
        const eps = b.episodes.sort((x, y) => x.season - y.season || x.episode - y.episode);
        return { id: b.id, series_id: b.id, movie_id: b.id, name: b.name, title: b.name, genre: b.group, category: b.group, category_id: b.group, logo: b.logo, cover: b.logo, cover_url: b.logo, season_count: new Set(eps.map((episode) => episode.season)).size, _m3u_series: true, _episodes: eps };
      });
      return { itv: live, vod: movies, series };
    }
    async categories(media) {
      const d = await this.load();
      const seen = new Map();
      for (const r of d[media]) if (!seen.has(r.category)) seen.set(r.category, { id: r.category, title: r.category });
      return [...seen.values()];
    }
    async page(media, category, page) {
      const d = await this.load();
      const rows = category && category !== "*" ? d[media].filter((r) => r.category === category) : d[media];
      const start = (page - 1) * PAGE;
      const out = rows.slice(start, start + PAGE).map((r) => {
        if (media !== "series") return r;
        const copy = Object.assign({}, r);
        delete copy._episodes;
        return copy;
      });
      return { rows: out, total: rows.length, hasNext: start + PAGE < rows.length };
    }
    async search(media, q) {
      const d = await this.load();
      return searchRows(d[media], q).map((r) => {
        const c = Object.assign({}, r);
        delete c._episodes;
        return c;
      });
    }
    async seasons(series) {
      const d = await this.load();
      const full = d.series.find((s) => s.id === series.id);
      const eps = (full && full._episodes) || [];
      const by = new Map();
      for (const e of eps) {
        const n = String(e.season);
        if (!by.has(n)) by.set(n, []);
        by.get(n).push(e);
      }
      return [...by].map(([n, list]) => ({ id: series.id + ":" + n, season_id: String(n), season: Number(n), name: "Season " + n, episodes: list }));
    }
    episodes(series, season) {
      return Array.isArray(season.episodes) ? season.episodes : [];
    }
    async link(row) {
      const u = str(row.url || row.cmd);
      if (!u) throw new WebError("This item has no stream", 404);
      return u;
    }
    art(row) {
      return imageUrl(row.logo || row.cover || row.stream_icon, this.p.portal);
    }
  }

  const CLIENTS = new Map();
  function client(profile) {
    const id = accountId(profile);
    if (CLIENTS.has(id)) return CLIENTS.get(id);
    const kind = profileKind(profile);
    const c = kind === "portal" ? new Stalker(profile) : kind === "xtream" ? new Xtream(profile) : new M3U(profile);
    CLIENTS.set(id, c);
    return c;
  }

  /* Series counts come from the same provider and season list used by Details. */
  const SEASON_COUNTS = new Map();
  const SEASON_JOBS = new Map();
  function suppliedSeasonCount(row) {
    const values = [row.season_count, row.seasons_count, row.total_seasons, row.num_seasons, row.number_of_seasons];
    if (Array.isArray(row.seasons)) values.push(row.seasons.length);
    return values.map(Number).find((count) => Number.isSafeInteger(count) && count > 0) || 0;
  }
  function recentSeasonCount(token) {
    const known = SEASON_COUNTS.get(token);
    if (known && known.until > Date.now()) return known.count;
    SEASON_COUNTS.delete(token);
  }
  function providerSeasons(token, entry) {
    if (SEASON_JOBS.has(token)) return SEASON_JOBS.get(token);
    const profile = findProfile(entry.account);
    const request = client(profile).seasons(entry.item).then((seasons) => {
      if (SEASON_COUNTS.size >= 512) SEASON_COUNTS.delete(SEASON_COUNTS.keys().next().value);
      SEASON_COUNTS.set(token, { count: seasons.length, until: Date.now() + (seasons.length ? 300000 : 60000) });
      return seasons;
    }).finally(() => SEASON_JOBS.delete(token));
    SEASON_JOBS.set(token, request);
    return request;
  }

  /* ---------------------------------------------------------- card fields */
  function yearOf(v) {
    const m = str(v).match(/(19|20)\d{2}/);
    return m ? m[0] : "";
  }
  function num(v) {
    const n = parseFloat(String(v || "").replace(",", "."));
    return Number.isFinite(n) && n > 0 ? Math.min(n, 10) : 0;
  }
  function splitGenres(v) {
    return str(v).split(/\s*[,/|]\s*/).filter(Boolean).slice(0, 4);
  }
  function normTitle(v) {
    return str(v).toLowerCase().normalize("NFKD").replace(/[\u064B-\u065F\u0670]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  }
  function searchRows(rows, q) {
    const words = normTitle(q).split(" ").filter(Boolean);
    if (!words.length) return [];
    return rows.filter((r) => {
      const t = normTitle(r.name || r.title);
      return words.every((w) => t.includes(w));
    });
  }
  function favoriteKeys(profile) {
    const portal = str(profile.portal).replace(/\/+$/, "").toLowerCase();
    const mac = str(profile.mac).toUpperCase();
    return new Set(
      store.favorites().filter((f) => str(f.portal).replace(/\/+$/, "").toLowerCase() === portal && str(f.mac).toUpperCase() === mac).map((f) => f.key),
    );
  }
  function publicItem(account, profile, media, row, extra = {}, favs) {
    const token = remember(account, media, row, extra);
    const keys = favs || favoriteKeys(profile);
    const item = {
      id: token,
      media_type: media,
      title: str(row.name || row.title || row.o_name) || (media === "itv" ? "Channel" : media === "vod" ? "Movie" : "Series"),
      raw_title: str(row._raw_name || row.name || row.title),
      favorite: keys.has(contentKey(profile, media, row)),
      source_kind: profileKind(profile),
    };
    if (media === "series") {
      const count = recentSeasonCount(token) ?? suppliedSeasonCount(row);
      if (count > 0) item.season_count = count;
    }
    if (media !== "itv") {
      const y = yearOf(row.year || row.releaseDate || row.release_date || row.added);
      if (y && (row.year || row.releaseDate || row.release_date)) item.year = y;
      const r = num(row.rating_imdb || row.rating || row.rating_kinopoisk);
      if (r) item.rating = r;
      if (!empty(row.age) && /\d/.test(String(row.age))) item.age_rating = str(row.age);
    } else {
      const n = row.number || row.num;
      if (!empty(n)) item.number = String(n);
      item.has_picon = !!client(profile).art(row, "itv");
    }
    return item;
  }

  /* --------------------------------------------------------- API handlers */
  function q(url, name) {
    return str(url.searchParams.get(name));
  }
  const API = {};

  API["browse/accounts"] = () => ({
    ok: true,
    accounts: activeProfiles()
      .filter((p) => !str(p.portal).toLowerCase().startsWith("file://"))
      .map((p, i) => ({ id: accountId(p), name: displayName(p, i), kind: profileKind(p) })),
  });
  API["browse/ownership"] = () => ({ ok: true });

  API["browse/categories"] = async (url) => {
    const p = findProfile(q(url, "account"));
    const media = q(url, "type");
    if (!MEDIA.includes(media)) throw new WebError("invalid media type");
    const rows = await client(p).categories(media);
    return { ok: true, categories: rows, count: rows.length };
  };

  API["browse/items"] = async (url) => {
    const account = q(url, "account");
    const p = findProfile(account);
    const media = q(url, "type");
    if (!MEDIA.includes(media)) throw new WebError("invalid media type");
    const category = q(url, "category") || "*";
    const page = Math.max(1, parseInt(q(url, "page") || "1", 10) || 1);
    const res = await client(p).page(media, category, page);
    const favs = favoriteKeys(p);
    const items = res.rows.map((row) => publicItem(account, p, media, row, { category, category_title: q(url, "title") }, favs));
    return { ok: true, page, count: items.length, total: res.total || 0, has_next: !!res.hasNext, items };
  };

  /* ------------------------------------------------ TMDB (via the relay) */
  const TMDB_IMG = "https://image.tmdb.org/t/p/";
  const ROUTE = new Set("4K 8K UHD FHD HD SD AR EN TR DO S D AS KR JP CN IN US UK EG FR DE ES IT RU SUBS SUB DUB DUBS VIP TOP RAW ARA ENG MOVIES MOVIE SERIES TV VOD NF OSN SHAHID".split(" "));
  function tmdbQueries(raw) {
    let t = str(raw).replace(/\[[^\]]*\]/g, " ").replace(/\([^)]*\)/g, " ");
    t = t.replace(/^\s*0\d{2,3}\s*[-.:]\s*/, "");
    for (let i = 0; i < 2; i++) {
      t = t.replace(/^\s*([A-Za-z0-9]{1,6}(?:[-_][A-Za-z0-9]{1,8}){0,6})\s*[-|:]\s*/, (m, g) => (g.split(/[-_]/).every((x) => ROUTE.has(x.toUpperCase())) ? " " : m));
    }
    t = t.replace(/\b(?:4K|8K|UHD|FHD|HD|HDR|RAW|SUBS?|DUBS?|DUBBED|MULTI|1080p|720p|2160p)\b/gi, " ");
    t = t.replace(/\b(?:19|20)\d{2}\s*$/, " ").replace(/\s+/g, " ").trim().replace(/^[\s\-_|:.]+|[\s\-_|:.]+$/g, "");
    const out = [];
    const add = (q) => {
      q = str(q).replace(/\s+/g, " ").replace(/^[\s\-_|:.]+|[\s\-_|:.]+$/g, "");
      if (q.replace(/[^\p{L}\p{N}]+/gu, "").length >= 2 && !out.includes(q)) out.push(q);
    };
    const latin = /[A-Za-z]/.test(t), arabic = /[؀-ۿ]/.test(t);
    if (latin && arabic) {
      add(t.replace(/[؀-ۿ]+/g, " "));
      add(t.replace(/[A-Za-z]+/g, " "));
    }
    add(t);
    add(t.replace(/\s+[-|:]\s*\d{1,2}\s*$/, ""));
    // TMDB search is literal (راسا ≠ رأسا): fall back to one strong word and
    // let the normalised scoring below pick the right title.
    const words = t.replace(/[^\p{L}\p{N}\s]+/gu, " ").split(/\s+/).filter((w) => w.length >= 3);
    if (words.length > 1) {
      add(words[0]);
      add(words.slice().sort((x, y) => y.length - x.length)[0]);
    }
    out.base = t;
    return out;
  }
  function tmdbNorm(v) {
    return str(v).toLowerCase().normalize("NFKD").replace(/[ً-ٰٟـ]/g, "")
      .replace(/[أإآٱ]/g, "ا").replace(/[ىئ]/g, "ي").replace(/ؤ/g, "و").replace(/ة/g, "ه")
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
      .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  }
  const TMDB_STOP = new Set("the a an of and in on at to for la le el al de der die das il the ال و في من".split(" "));
  function tmdbSimilar(a, b) {
    const words = (v) => tmdbNorm(v).split(" ").filter((w) => w && !TMDB_STOP.has(w));
    const A = new Set(words(a)), B = new Set(words(b));
    if (!A.size || !B.size) return 0;
    if (tmdbNorm(a) === tmdbNorm(b)) return 1;
    let hit = 0;
    A.forEach((w) => B.has(w) && hit++);
    return hit / Math.max(A.size, B.size);
  }
  const TMDB_CACHE_KEY = "us-tmdb-v5";
  let tmdbMem = null;
  function tmdbCache() {
    if (!tmdbMem) {
      try {
        tmdbMem = JSON.parse(localStorage.getItem(TMDB_CACHE_KEY) || "{}") || {};
      } catch (_) {
        tmdbMem = {};
      }
    }
    return tmdbMem;
  }
  function tmdbRemember(key, value) {
    const c = tmdbCache();
    c[key] = { t: Date.now(), v: value };
    const keys = Object.keys(c);
    if (keys.length > 350) keys.sort((a, b) => c[a].t - c[b].t).slice(0, keys.length - 300).forEach((k) => delete c[k]);
    try {
      localStorage.setItem(TMDB_CACHE_KEY, JSON.stringify(c));
    } catch (_) {
      // Storage full: keep it in memory only.
    }
  }
  async function tmdbGet(path, params) {
    const base = relayBase();
    if (!base) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    try {
      const res = await fetch(base + "/tmdb/" + path + "?" + new URLSearchParams(params).toString(), { signal: ctrl.signal });
      if (!res.ok) return null;
      return await res.json();
    } catch (_) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  const TMDB_PENDING = new Map();
  function tmdbLang() {
    return window.USLang && !window.USLang.ar ? "en-US" : "ar";
  }
  function tmdbLookup(title, year, media) {
    const type = media === "series" ? "tv" : "movie";
    const LANG = tmdbLang();
    const key = type + "|" + LANG + "|" + tmdbNorm(title) + "|" + (year || "");
    const hit = tmdbCache()[key];
    if (hit && Date.now() - hit.t < 14 * 864e5) return Promise.resolve(hit.v);
    if (TMDB_PENDING.has(key)) return TMDB_PENDING.get(key);
    const job = (async () => {
      let best = null;
      const queries = tmdbQueries(title);
      const base = queries.base || title;
      for (const query of queries) {
        for (const withYear of year ? [true, false] : [false]) {
          // Search in the query's own script so titles compare like with like.
          const params = { query, language: /[\u0600-\u06ff]/.test(query) ? "ar" : LANG, include_adult: "false" };
          if (withYear) params[type === "tv" ? "first_air_date_year" : "year"] = year;
          const r = await tmdbGet("search/" + type, params);
          const rows = (r && r.results) || [];
          const broad = query.indexOf(" ") < 0;
          rows.slice(0, broad ? 20 : 8).forEach((row, i) => {
            const name = row.title || row.name || "";
            const orig = row.original_title || row.original_name || "";
            const ry = yearOf(row.release_date || row.first_air_date);
            const sim = Math.max(tmdbSimilar(base, name), tmdbSimilar(base, orig), broad ? 0 : Math.max(tmdbSimilar(query, name), tmdbSimilar(query, orig)));
            const sameYear = !!(year && ry && ry === String(year));
            // The title has to match on its own; the year only breaks ties.
            if (sim < 0.6 && !(sim >= 0.5 && sameYear)) return;
            let score = sim;
            if (year && ry) score += sameYear ? 0.35 : Math.abs(+ry - +year) <= 1 ? 0.15 : -0.25;
            score += Math.min(0.1, (row.popularity || 0) / 1000) - (broad ? 0 : i * 0.02);
            if (!best || score > best.score) best = { score, row };
          });
          if (best && best.score >= 0.9) break;
        }
        if (best && best.score >= 0.6) break;
      }
      let out = null;
      if (best && best.score >= 0.45) {
        const d = await tmdbGet(type + "/" + best.row.id, { language: LANG, append_to_response: "credits,images,translations", include_image_language: "ar,en,null" });
        if (d) {
          const img = d.images || {};
          const clean = (img.backdrops || []).filter((b) => !b.iso_639_1).sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0))[0];
          const logos = img.logos || [];
          // Phones show a tall picture: the poster without its title text when TMDB has one.
          const tall = (img.posters || []).filter((p) => !p.iso_639_1).sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0))[0];
          const first = LANG === "ar" ? "ar" : "en";
          const logo = logos.find((l) => l.iso_639_1 === first) || logos.find((l) => l.iso_639_1 === (first === "ar" ? "en" : "ar")) || logos[0];
          const tr = ((d.translations || {}).translations || []).find((t) => t.iso_639_1 === (first === "ar" ? "en" : "ar"));
          const enOverview = tr && tr.data && tr.data.overview;
          out = {
            id: d.id,
            type,
            backdrop: (clean && clean.file_path) || d.backdrop_path ? TMDB_IMG + "w1280" + ((clean && clean.file_path) || d.backdrop_path) : "",
            poster: d.poster_path ? TMDB_IMG + "w500" + d.poster_path : "",
            portrait: tall ? TMDB_IMG + "w780" + tall.file_path : d.poster_path ? TMDB_IMG + "w780" + d.poster_path : "",
            logo: logo ? TMDB_IMG + "w500" + logo.file_path : "",
            overview: str(d.overview) || str(enOverview),
            genres: (d.genres || []).map((g) => g.name).slice(0, 4),
            rating: Math.round((d.vote_average || 0) * 10) / 10,
            runtime: d.runtime || (d.episode_run_time || [])[0] || "",
            year: yearOf(d.release_date || d.first_air_date),
            tagline: str(d.tagline),
            seasons: d.number_of_seasons || 0,
            seasonsList: (d.seasons || []).map((x) => ({ n: x.season_number, poster: x.poster_path ? TMDB_IMG + "w342" + x.poster_path : "", name: str(x.name), eps: x.episode_count || 0, year: yearOf(x.air_date) })),
            cast: ((d.credits || {}).cast || []).slice(0, 14).map((c) => ({ name: c.name, role: c.character || "", photo: c.profile_path ? TMDB_IMG + "w185" + c.profile_path : "" })),
          };
        }
      }
      tmdbRemember(key, out);
      return out;
    })().finally(() => TMDB_PENDING.delete(key));
    TMDB_PENDING.set(key, job);
    return job;
  }
  const EXTRAS = new Map();

  async function detailsFor(token) {
    const entry = cached(token);
    const p = findProfile(entry.account);
    const c = client(p);
    const row = entry.item;
    let d = {};
    if (c instanceof Xtream && (entry.media === "vod" || entry.media === "series")) d = await c.details(entry);
    else {
      d = {
        overview: str(row.description || row.plot || row.overview),
        genres: splitGenres(row.genres_str || row.genre_str || ""),
        year: yearOf(row.year || row.releaseDate),
        rating: num(row.rating_imdb || row.rating || row.rating_kinopoisk),
        runtime: parseInt(row.time || row.duration || 0, 10) || "",
        backdrop: str(row.backdrop_url || row.backdrop || row.backdrop_path || ""),
      };
      if (row.director || row.actors) d.tagline = [row.director ? "Director: " + str(row.director) : "", row.actors ? "Cast: " + str(row.actors).slice(0, 140) : ""].filter(Boolean).join(" • ");
    }
    if ((entry.media === "vod" || entry.media === "series") && !row.local) {
      try {
        const t = await tmdbLookup(str(row._raw_name || row.name || row.title), d.year || yearOf(row.year), entry.media);
        if (t) {
          d.tmdb = t;
          if (t.backdrop) d.backdrop = t.backdrop;
          if (t.portrait) d.portrait = t.portrait;
          if (t.poster && !d.poster) d.poster = t.poster;
          if (!d.overview || d.overview.length < 25) d.overview = t.overview || d.overview;
          if (!d.genres || !d.genres.length) d.genres = t.genres;
          if (!d.rating) d.rating = t.rating;
          if (!d.runtime) d.runtime = t.runtime;
          if (!d.year) d.year = t.year;
          if (!d.tagline) d.tagline = t.tagline;
        }
      } catch (_) {}
    }
    if (d.backdrop) entry.backdrop = d.backdrop;
    if (d.portrait) entry.portrait = d.portrait;
    if (d.poster && !c.art(row, entry.media)) entry.poster = d.poster;
    return { entry, d };
  }
  API["browse/details"] = async (url) => {
    const token = q(url, "item");
    const { entry, d } = await detailsFor(token);
    const row = entry.item;
    const out = {
      ok: true,
      item: token,
      title: str(row.name || row.title),
      year: d.year || "",
      genres: d.genres || [],
      rating: d.rating || 0,
      runtime: d.runtime || "",
      status: "",
      tagline: d.tagline || "",
      overview: d.overview || "",
      has_backdrop: !!d.backdrop,
      tmdb_enriched: !!d.tmdb,
    };
    const extra = { item: token, media: entry.media, tmdb: d.tmdb ? d.tmdb.id : 0, logo: (d.tmdb && d.tmdb.logo) || "", backdrop: (d.tmdb && d.tmdb.backdrop) || "", cast: (d.tmdb && d.tmdb.cast) || [], seasons: (d.tmdb && d.tmdb.seasons) || 0, seasonsList: (d.tmdb && d.tmdb.seasonsList) || [], poster: (d.tmdb && d.tmdb.poster) || "" };
    EXTRAS.set(token, extra);
    setTimeout(() => document.dispatchEvent(new CustomEvent("us-details", { detail: extra })), 0);
    return out;
  };

  API["browse/season-count"] = async (url) => {
    const token = q(url, "item");
    const entry = cached(token);
    if (entry.media !== "series") throw new WebError("not a series");
    const supplied = suppliedSeasonCount(entry.item);
    const count = recentSeasonCount(token) ?? (supplied || (await providerSeasons(token, entry)).length);
    return { ok: true, count };
  };

  API["browse/seasons"] = async (url) => {
    const token = q(url, "item");
    const entry = cached(token);
    if (entry.media !== "series") throw new WebError("not a series");
    const seasons = await providerSeasons(token, entry);
    const out = seasons.map((s, i) => {
      const id = remember(entry.account, "season", s, { parent: token });
      const eps = Array.isArray(s.episodes) ? s.episodes.length : Array.isArray(s.series) ? s.series.length : undefined;
      const number = s.season || i + 1;
      return { id, title: str(s.name) || "Season " + number, number: String(number), episode_count: eps };
    });
    // Like the receiver: seasons from 1 upward, then Season 0 / specials, then unnumbered ones.
    const order = (x) => { const n = parseInt(x.number, 10); return Number.isFinite(n) ? (n >= 1 ? n : n === 0 ? 1e6 : 2e6) : 3e6; };
    out.sort((a, b) => order(a) - order(b));
    return { ok: true, count: out.length, seasons: out };
  };

  API["browse/episodes"] = async (url) => {
    const seriesToken = q(url, "series"), seasonToken = q(url, "season");
    const series = cached(seriesToken), season = cached(seasonToken);
    const p = findProfile(series.account);
    const eps = await client(p).episodes(series.item, season.item);
    const out = eps.map((e, i) => {
      const id = remember(series.account, "episode", e, { parent: seasonToken });
      return { id, title: str(e.name || e.title) || "Episode " + (i + 1), season: e.season || season.item.season || "", episode: Number(e.episode || e.number || i + 1) || i + 1, media_type: "episode" };
    });
    return { ok: true, count: out.length, episodes: out, season_title: str(season.item.name) || "Season" };
  };

  async function resolve(token) {
    const entry = cached(token);
    if (!["itv", "vod", "episode"].includes(entry.media)) throw new WebError("this item is not directly playable");
    const p = findProfile(entry.account);
    const c = client(p);
    const row = entry.item;
    let url;
    if (c instanceof Stalker) {
      let epNum, alt;
      if (entry.media === "episode") {
        epNum = row.id ?? row.episode_id ?? row.series ?? row.number;
        try {
          const season = cached(entry.parent);
          alt = c.seriesId(cached(season.parent).item);
        } catch (_) {}
      }
      const t = await c.ticket(row, entry.media === "episode" ? "series" : entry.media, epNum, alt);
      return { entry, profile: p, url: await mintTicket(t), ticket: true };
    }
    url = await c.link(row);
    return { entry, profile: p, url };
  }
  async function mintTicket(data) {
    const base = relayBase();
    if (!base) throw new WebError("The website relay is not set up yet.", 503);
    let res;
    try {
      res = await fetch(base + "/ticket", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), cache: "no-store", __usNative: true });
    } catch (_) {
      throw new WebError("The website relay is unreachable", 502);
    }
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.url) throw new WebError(j.error || "Could not prepare the stream", res.status || 502);
    return j.url;
  }
  function playHeaders(profile) {
    return profileKind(profile) === "portal" ? { "User-Agent": UA } : {};
  }
  API["browse/prepare"] = async (url) => {
    const token = q(url, "item");
    const { entry, profile, url: stream, ticket } = await resolve(token);
    const row = entry.item;
    const title = str(row.name || row.title) || "Ultra Stalker stream";
    return {
      ok: true,
      stream,
      url: stream,
      title,
      media_type: entry.media,
      live: entry.media === "itv",
      local: false,
      headers: ticket ? {} : playHeaders(profile),
      ticket: !!ticket,
    };
  };
  API["browse/vlc"] = async (url) => {
    const { entry, url: stream } = await resolve(q(url, "item"));
    const title = str(entry.item.name || entry.item.title) || "Ultra Stalker";
    return { __file: { name: "ultra-stalker.m3u", type: "audio/x-mpegurl", body: "#EXTM3U\n#EXTINF:-1," + title + "\n" + stream + "\n" } };
  };

  API["browse/search"] = async (url) => {
    const account = q(url, "account");
    const p = findProfile(account);
    const query = q(url, "q");
    const mode = q(url, "mode") || "full";
    const limit = Math.min(200, parseInt(q(url, "limit") || "80", 10) || 80);
    const c = client(p);
    const favs = favoriteKeys(p);
    const name = displayName(p, activeProfiles().findIndex((x) => accountId(x) === account));
    const groups = new Map();
    const buckets = { vod: 0, series: 0 };
    let copies = 0;
    for (const media of ["vod", "series"]) {
      let rows = [];
      try {
        rows = (await c.search(media, query)).slice(0, limit);
      } catch (_) {
        rows = [];
      }
      for (const row of rows) {
        const item = publicItem(account, p, media, row, { category: "search", category_title: "Search" }, favs);
        item.source_name = name;
        const key = media + ":" + normTitle(item.raw_title || item.title);
        if (!groups.has(key)) {
          groups.set(key, { id: "g" + H.sha1(key).slice(0, 12), media_type: media, raw_title: item.raw_title || item.title, title: item.title, copies: [], copy_count: 0, portal_count: 1, poster_item: item.id });
          buckets[media]++;
        }
        const g = groups.get(key);
        g.copies.push(item);
        g.copy_count++;
        copies++;
      }
    }
    return { ok: true, query, mode, count: groups.size, copy_count: copies, matched_portals: groups.size ? 1 : 0, buckets, groups: [...groups.values()] };
  };

  API["browse/favorites"] = (url) => {
    const account = q(url, "account");
    const p = findProfile(account);
    const portal = str(p.portal).replace(/\/+$/, "").toLowerCase(), mac = str(p.mac).toUpperCase();
    const wanted = q(url, "type");
    const favs = favoriteKeys(p);
    const items = store
      .favorites()
      .filter((f) => str(f.portal).replace(/\/+$/, "").toLowerCase() === portal && str(f.mac).toUpperCase() === mac)
      .filter((f) => MEDIA.includes(f.media_type) && (!wanted || f.media_type === wanted))
      .map((f) => publicItem(account, p, f.media_type, f.item || {}, { category: "favorites", category_title: "Favorites" }, favs));
    return { ok: true, account, media_type: wanted, count: items.length, items };
  };
  API["browse/favorite"] = (url, body) => {
    const entry = cached(body && body.item);
    if (!MEDIA.includes(entry.media)) throw new WebError("this item cannot be saved to Favorites");
    const p = findProfile(entry.account);
    const key = contentKey(p, entry.media, entry.item);
    const list = store.favorites();
    const at = list.findIndex((f) => f.key === key);
    let favorite;
    if (at >= 0) {
      list.splice(at, 1);
      favorite = false;
    } else {
      list.push({ key, portal: p.portal, mac: p.mac, media_type: entry.media, item: entry.item, updated_at: Math.floor(Date.now() / 1000) });
      favorite = true;
    }
    store.setFavorites(list);
    return { ok: true, item: body.item, favorite };
  };
  /* Now / next for one live channel (Stalker get_short_epg, Xtream get_short_epg). */
  API["browse/epg"] = async (url) => {
    const entry = cached(q(url, "item"));
    const p = findProfile(entry.account);
    const c = client(p);
    const row = entry.item || {};
    const now = Math.floor(Date.now() / 1000);
    const dec = (v) => {
      try {
        return decodeURIComponent(escape(atob(String(v || ""))));
      } catch (_) {
        return str(v);
      }
    };
    let rows = [];
    try {
      if (c instanceof Stalker) {
        const js = await c.call({ type: "itv", action: "get_short_epg", ch_id: String(row.id || row.ch_id || ""), size: "4", JsHttpRequest: "1-xml" });
        rows = Stalker.rows(js).map((e) => ({ title: str(e.name || e.title), start: Number(e.start_timestamp) || 0, end: Number(e.stop_timestamp) || 0, description: str(e.descr || e.description) }));
      } else if (c instanceof Xtream && row.stream_id) {
        const js = await c.api("get_short_epg", { stream_id: String(row.stream_id), limit: "4" }, "epg:" + row.stream_id + ":" + Math.floor(now / 300));
        rows = ((js && js.epg_listings) || []).map((e) => ({ title: dec(e.title), start: Number(e.start_timestamp) || 0, end: Number(e.stop_timestamp) || 0, description: dec(e.description) }));
      }
    } catch (_) {
      rows = [];
    }
    rows = rows.filter((e) => e.title && e.end > now - 60).sort((a, b) => a.start - b.start);
    return { ok: true, now, rows };
  };
  API["browse/local"] = () => {
    throw new WebError("The Local library lives on the receiver's HDD and is only available on the receiver.", 404);
  };

  /* -------------------------------------------- Manage Servers (sources) */
  function editorRow(p) {
    const kind = profileKind(p);
    const row = { key: profileKey(p), kind, group: kind === "portal" ? "stalker" : "xtream", name: str(p.name), url: p.portal, mac: kind === "portal" ? p.mac : "", username: "", password: "", source: str(p.source) };
    if (kind === "xtream") {
      const c = xtreamCreds(p.portal);
      if (c) Object.assign(row, { url: c.base, username: c.user, password: c.pass });
    }
    return row;
  }
  function formPayload(body) {
    const kind = str(body && body.kind).toLowerCase();
    const name = str(body && body.name).slice(0, 80);
    if (kind === "portal") {
      const url = str(body.url).replace(/\/+$/, ""), mac = str(body.mac).toUpperCase().replace(/-/g, ":");
      if (!url || !mac) throw new WebError("Portal URL and MAC address are required");
      if (!MAC_RE.test(mac)) throw new WebError("The MAC address is not valid");
      return { kind, name, raw: { portal: url, mac, source_type: "stalker" } };
    }
    if (kind === "xtream") {
      const host = str(body.url || body.host).replace(/\/+$/, ""), user = str(body.username || body.user), pass = String(body.password || body.pass || "");
      if (!host || !user || !pass) throw new WebError("Server URL, username and password are required");
      const fixed = /^https?:\/\//i.test(host) ? host : "http://" + host;
      return { kind, name, raw: { portal: xtreamPlaylist(fixed, user, pass), source_type: "m3u", playlist_mode: "xtream" } };
    }
    if (kind === "m3u") {
      const url = str(body.url);
      if (!url) throw new WebError("M3U URL is required");
      return { kind, name, raw: { portal: url, source_type: "m3u", playlist_mode: "m3u" } };
    }
    throw new WebError("connection type must be portal, xtream or m3u");
  }
  API["connections"] = () => ({ ok: true, connections: activeProfiles().map(editorRow) });
  API["connection-save"] = (url, body) => {
    const f = formPayload(body);
    const p = normalizeProfile(Object.assign(f.raw, { name: f.name, source: "web", state: "Not checked", explicit_http_accepted: /^http:/i.test(f.raw.portal) }), "web");
    if (!p) throw new WebError("Connection details are not valid");
    const k = keyText(profileKey(p));
    if (activeProfiles().some((x) => keyText(profileKey(x)) === k)) return { ok: true, saved: false, duplicate: true, kind: f.kind, message: "Connection already exists" };
    const rows = store.profiles();
    rows.push(p);
    store.setProfiles(rows);
    store.setDisabled(store.disabled().filter((d) => keyText(d) !== k));
    return { ok: true, saved: true, duplicate: false, kind: f.kind, name: p.name, message: f.kind.toUpperCase() + " connection saved" };
  };
  API["connection-test"] = async (url, body) => {
    const f = formPayload(body);
    const p = normalizeProfile(Object.assign(f.raw, { name: f.name }), "web");
    if (!p) throw new WebError("Connection details are not valid");
    return { ok: true, kind: f.kind, name: f.name, result: await testProfile(p) };
  };
  async function testProfile(p) {
    const kind = profileKind(p);
    try {
      if (kind === "portal") {
        const c = new Stalker(p);
        await c.authorize(true);
        const info = await c.accountInfo();
        const status = str(info && (info.status || info.account_status)).toLowerCase();
        const expiry = str(info && (info.end_date || info.exp_date || info.expire_billing_date || info.expire_date));
        if (info && (Stalker.flag(info.blocked) || ["blocked", "banned"].includes(status))) return { status: "blocked", expiry };
        const cats = await c.categories("itv").catch(() => []);
        return { status: "working", expiry, categories: cats.length };
      }
      if (kind === "xtream") {
        const c = new Xtream(p);
        const js = await c.api("", {}, "auth");
        const ui = (js && js.user_info) || {};
        if (String(ui.auth) === "0" || !js || !js.user_info) return { status: "auth_failed" };
        const st = str(ui.status).toLowerCase();
        const exp = Number(ui.exp_date || 0);
        if (st === "expired" || (exp && exp * 1000 < Date.now())) return { status: "expired", expiry: exp ? new Date(exp * 1000).toISOString().slice(0, 10) : "" };
        if (st && st !== "active") return { status: st };
        return { status: "working", expiry: exp ? new Date(exp * 1000).toISOString().slice(0, 10) : "Unlimited", max_connections: ui.max_connections };
      }
      const c = new M3U(p);
      const d = await c.load();
      return { status: d.itv.length + d.vod.length + d.series.length ? "working" : "no_content" };
    } catch (e) {
      const s = e.status === 504 || e.status === 502 ? "unreachable" : e.status === 401 ? "auth_failed" : "unreachable";
      return { status: s, detail: e.message };
    }
  }
  API["connection-update"] = (url, body) => {
    const oldKey = Array.isArray(body && body.key) ? keyText(body.key) : "";
    if (!oldKey) throw new WebError("missing connection identity");
    const saved = store.profiles(), text = store.textProfiles();
    const all = activeProfiles();
    const current = all.find((x) => keyText(profileKey(x)) === oldKey);
    if (!current) throw new WebError("connection no longer exists; reload the list");
    const kind = profileKind(current);
    const f = formPayload(Object.assign({}, body, { kind }));
    const updated = Object.assign({}, current, f.raw, { name: f.name, source: "web" });
    if (kind === "xtream") {
      const ed = editorRow(current);
      if (ed.url === str(body.url).replace(/\/+$/, "") && ed.username === str(body.username) && ed.password === String(body.password || "")) updated.portal = current.portal;
    }
    updated.explicit_http_accepted = /^http:/i.test(updated.portal);
    const changed = keyText(profileKey(normalizeProfile(updated) || current)) !== oldKey;
    if (changed) {
      Object.assign(updated, { state: "Not checked", health: "unknown" });
      ["account_state", "expiry", "last_error", "last_success", "active_connections", "max_connections", "connections_source"].forEach((k) => delete updated[k]);
    }
    const p = normalizeProfile(updated, "web");
    if (!p) throw new WebError("edited connection is not valid");
    const newKey = keyText(profileKey(p));
    if (all.some((x) => keyText(profileKey(x)) !== oldKey && keyText(profileKey(x)) === newKey)) throw new WebError("another saved connection already uses these details");

    // Edited rows become saved rows (like the receiver); the old text row is hidden.
    const inSaved = saved.findIndex((x) => { const n = normalizeProfile(x); return n && keyText(profileKey(n)) === oldKey; });
    let rows = saved.slice();
    if (inSaved >= 0) rows[inSaved] = p;
    else {
      rows.push(p);
      if (text.some((x) => { const n = normalizeProfile(x); return n && keyText(profileKey(n)) === oldKey; })) {
        const dis = store.disabled();
        dis.push(body.key);
        store.setDisabled(dis);
      }
    }
    if (changed && inSaved >= 0) {
      const dis = store.disabled().filter((d) => keyText(d) !== newKey);
      store.setDisabled(dis);
    }
    // Reorder inside the selected group, keeping the other group's slots fixed.
    const group = kind === "portal" ? "stalker" : "xtream";
    const groupOf = (x) => { const n = normalizeProfile(x); return n ? (profileKind(n) === "portal" ? "stalker" : "xtream") : ""; };
    const slots = rows.map((x, i) => (groupOf(x) === group ? i : -1)).filter((i) => i >= 0);
    const ordered = slots.map((i) => rows[i]);
    const cur = ordered.findIndex((x) => { const n = normalizeProfile(x); return n && keyText(profileKey(n)) === newKey; });
    const target = Math.max(1, Math.min(parseInt(body.position, 10) || cur + 1, ordered.length));
    if (cur >= 0) {
      const [moved] = ordered.splice(cur, 1);
      ordered.splice(target - 1, 0, moved);
      slots.forEach((slot, i) => (rows[slot] = ordered[i]));
    }
    store.setProfiles(rows);
    CLIENTS.delete(accountId(current));
    return { ok: true, message: "Connection updated", connection: editorRow(p), count: rows.length };
  };
  API["connection-delete"] = (url, body) => {
    const key = Array.isArray(body && body.key) ? keyText(body.key) : "";
    if (!key) throw new WebError("missing connection identity");
    const before = store.profiles();
    const rows = before.filter((x) => { const n = normalizeProfile(x); return !(n && keyText(profileKey(n)) === key); });
    store.setProfiles(rows);
    if (store.textProfiles().some((x) => { const n = normalizeProfile(x); return n && keyText(profileKey(n)) === key; })) {
      const dis = store.disabled();
      if (!dis.some((d) => keyText(d) === key)) dis.push(body.key);
      store.setDisabled(dis);
    }
    return { ok: true, removed: before.length - rows.length, message: "Connection removed" };
  };

  /* --------------------------------------------------- fetch interception */
  const nativeFetch = window.fetch.bind(window);
  function apiPath(input) {
    const raw = typeof input === "string" ? input : (input && input.url) || "";
    let u;
    try {
      u = new URL(raw, location.href);
    } catch (_) {
      return null;
    }
    if (u.origin !== location.origin) return null;
    const m = u.pathname.match(/\/api\/(.+)$/);
    return m ? { name: m[1].replace(/\/+$/, ""), url: u } : null;
  }
  window.fetch = async function (input, init) {
    if (init && init.__usNative) {
      const clean = Object.assign({}, init);
      delete clean.__usNative;
      return nativeFetch(input, clean);
    }
    const hit = apiPath(input);
    if (!hit || !API[hit.name]) return nativeFetch(input, init);
    await ready;
    let body = null;
    if (init && init.body) {
      try {
        body = JSON.parse(init.body);
      } catch (_) {
        body = null;
      }
    }
    try {
      const out = await API[hit.name](hit.url, body);
      if (out && out.__file) {
        const blob = new Blob([out.__file.body], { type: out.__file.type });
        return new Response(blob, { status: 200, headers: { "Content-Type": out.__file.type } });
      }
      return new Response(JSON.stringify(out), { status: 200, headers: { "Content-Type": "application/json" } });
    } catch (e) {
      const status = (e && e.status) || 500;
      if (!(e instanceof WebError)) console.error("[Ultra Stalker Web]", hit.name, e);
      return new Response(JSON.stringify({ ok: false, error: (e && e.message) || "Unavailable" }), { status, headers: { "Content-Type": "application/json" } });
    }
  };

  /* ---------------------------------------------- artwork for the pages */
  function art(token, media) {
    let entry;
    try {
      entry = cached(token);
    } catch (_) {
      return "";
    }
    try {
      const p = findProfile(entry.account);
      return client(p).art(entry.item, entry.media) || (entry.poster ? imageUrl(entry.poster) : "");
    } catch (_) {
      return "";
    }
  }
  function backdrop(token) {
    let entry;
    try {
      entry = cached(token);
    } catch (_) {
      return "";
    }
    const row = entry.item || {};
    // Phones: a tall picture fits the screen; a wide backdrop would be cut to a slice.
    if (entry.portrait && window.matchMedia && window.matchMedia("(max-width: 1099px)").matches) return entry.portrait;
    const v = entry.backdrop || row.backdrop_url || row.backdrop || "";
    if (!v) return "";
    try {
      const p = findProfile(entry.account);
      const base = profileKind(p) === "xtream" ? (xtreamCreds(p.portal) || {}).base : p.portal;
      return imageUrl(Array.isArray(v) ? v[0] : v, base);
    } catch (_) {
      return imageUrl(v);
    }
  }

  /* Until the relay Worker is deployed the pages can't reach any server: say so once. */
  document.addEventListener("DOMContentLoaded", () => {
    if (relayBase()) return;
    const at = document.querySelector("main.shell");
    if (!at) return;
    const note = document.createElement("div");
    note.className = "empty";
    note.style.margin = "0 0 14px";
    note.textContent = "The website relay is being set up. Saved servers and backups work now; browsing and playing start working as soon as it is ready.";
    at.parentNode.insertBefore(note, at);
  });

  window.USEngine = {
    version: 2,
    ready,
    relayBase,
    relayUrl,
    art,
    backdrop,
    extras: (token) => EXTRAS.get(token) || null,
    tmdbGet,
    store,
    normalizeProfile,
    profileKey,
    keyText,
    profileKind,
    activeProfiles,
    contentKey,
    canonicalMac,
    parseTextImports,
    resetClients: () => CLIENTS.clear(),
    entry: (token) => cached(token),
    adopt: (entry) => remember(entry.account, entry.media, entry.item, { parent: entry.parent || "", category: entry.category || "", category_title: entry.category_title || "" }),
    accountId,
    findProfile,
    playHeaders,
  };

  /* portals.txt / portal.txt from a receiver backup: one portal URL followed by its
     MAC addresses (or both on one line), M3U links and Xtream logins. */
  function parseTextImports(text) {
    const out = [];
    let current = "";
    let xt = { base: "", user: "", pass: "" };
    const flushXt = () => {
      if (xt.base && xt.user && xt.pass) out.push({ portal: xtreamPlaylist(/^https?:/i.test(xt.base) ? xt.base : "http://" + xt.base, xt.user, xt.pass), source: "text", source_type: "m3u", playlist_mode: "xtream" });
      xt = { base: "", user: "", pass: "" };
    };
    for (const rawLine of String(text || "").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) {
        flushXt();
        current = "";
        continue;
      }
      if (/^(#|;|\/\/)/.test(line)) continue;
      const lab = (name) => {
        const m = line.match(new RegExp("\\b" + name + "\\s*[:=]\\s*(\\S+)", "i"));
        return m ? m[1] : "";
      };
      const user = lab("username") || lab("user"), pass = lab("password") || lab("pass");
      const urlMatch = line.match(/https?:\/\/[^\s"'<>]+/i);
      const url = urlMatch ? urlMatch[0].replace(/[.,;]+$/, "") : "";
      if (url && looksLikeM3u(url)) {
        out.push({ portal: url, source: "text", source_type: "m3u" });
        continue;
      }
      if (user || pass) {
        if (url) xt.base = url;
        if (user) xt.user = user;
        if (pass) xt.pass = pass;
        if (xt.base && xt.user && xt.pass) flushXt();
        continue;
      }
      if (url) current = url;
      const macs = line.match(/[0-9A-Fa-f]{2}(?:[:-][0-9A-Fa-f]{2}){5}/g) || [];
      if (current && macs.length) for (const mac of macs) out.push({ portal: current, mac: canonicalMac(mac), source: "text", source_type: "stalker" });
    }
    flushXt();
    return out;
  }
})();
