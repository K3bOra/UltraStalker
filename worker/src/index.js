/* Ultra Stalker Web — small relay for the website (Cloudflare Worker, free plan).

   Browsers cannot talk to IPTV portals directly: they refuse the MAC cookie and the
   MAG User-Agent, block plain http from an https page, and portals send no CORS
   headers. The website sends each request here instead, and this Worker forwards
   it with the headers the portal expects and hands the answer back to the page.

   It only answers pages from the Ultra Stalker website (see ORIGINS), so nobody
   else can use it as a free proxy.

   GET /health                     -> {"ok":true}
   GET|HEAD /p?u=<url>&h=<headers>  -> the upstream answer (API, playlist, image or video)
        u: the full upstream URL (http/https only)
        h: optional base64url JSON object of request headers (Cookie, User-Agent, Authorization…)
        Playlists (.m3u8) are rewritten so every segment also goes through /p with the same headers. */

const ORIGINS = [
  "https://k3bora.github.io",
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
];
const PASS_REQ = ["range", "if-range", "if-none-match", "if-modified-since"];
const PASS_RES = [
  "content-type", "content-length", "content-range", "accept-ranges",
  "etag", "last-modified", "cache-control", "expires",
];
const MAX_REDIRECTS = 6;

function allowedOrigin(value) {
  if (!value) return "";
  return ORIGINS.some((o) => (typeof o === "string" ? o === value : o.test(value))) ? value : "";
}

function originOf(request) {
  const origin = request.headers.get("Origin");
  if (origin) return allowedOrigin(origin);
  // <video src> and <img src> send no Origin header, only the page address as Referer.
  const ref = request.headers.get("Referer");
  if (!ref) return "";
  try {
    return allowedOrigin(new URL(ref).origin);
  } catch (_) {
    return "";
  }
}

function cors(origin, extra = {}) {
  return Object.assign(
    {
      "Access-Control-Allow-Origin": origin || "*",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Range, Content-Type",
      "Access-Control-Expose-Headers": "Content-Length, Content-Range, Content-Type, X-Final-Url, X-Upstream-Status",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    },
    extra,
  );
}

function json(obj, status, origin) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: cors(origin, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }),
  });
}

function b64urlDecode(text) {
  const s = String(text || "").replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const bin = atob(s + pad);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function blockedHost(host) {
  const h = String(host || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!h || h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10 || a === 127 || a === 0 || a >= 224) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  if (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return true;
  return false;
}

/* Workers cannot open a bare IP address, so 1.2.3.4 is reached as 1.2.3.4.sslip.io,
   a public name that always answers with the IP written inside it. */
function reachable(url, env) {
  const u = new URL(url);
  if (env && env.ALLOW_PRIVATE) return u;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname)) u.hostname = u.hostname + ".sslip.io";
  return u;
}

function cleanHeaders(raw) {
  const out = new Headers();
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw)) {
      const key = String(k).trim();
      if (!key || /^(host|origin|referer|cf-|x-forwarded|x-real-ip|content-length)/i.test(key)) continue;
      out.set(key, String(v));
    }
  }
  if (!out.has("User-Agent")) out.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36");
  if (!out.has("Accept")) out.set("Accept", "*/*");
  return out;
}

async function fetchFollow(url, init, env) {
  // Follow redirects ourselves so a hop to a bare IP or a custom port still works.
  let current = url;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const target = reachable(current, env);
    if (!(env && env.ALLOW_PRIVATE) && blockedHost(new URL(current).hostname)) throw new Error("blocked host");
    const res = await fetch(target.toString(), Object.assign({}, init, { redirect: "manual" }));
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get("Location");
      if (!loc) return { res, final: current };
      current = new URL(loc, current).toString();
      if (!/^https?:/i.test(current)) throw new Error("unsupported redirect");
      if (res.status === 303) init = Object.assign({}, init, { method: "GET", body: undefined });
      continue;
    }
    return { res, final: current };
  }
  throw new Error("too many redirects");
}

function looksLikePlaylist(url, type) {
  const t = String(type || "").toLowerCase();
  if (t.includes("mpegurl")) return true;
  try {
    return /\.m3u8$/i.test(new URL(url).pathname);
  } catch (_) {
    return false;
  }
}

function rewritePlaylist(text, base, self, h) {
  const wrap = (uri) => {
    const abs = new URL(uri, base).toString();
    return self + "/p?u=" + encodeURIComponent(abs) + (h ? "&h=" + encodeURIComponent(h) : "");
  };
  return text
    .split(/\r?\n/)
    .map((line) => {
      const t = line.trim();
      if (!t) return line;
      if (t.startsWith("#")) return line.replace(/URI="([^"]+)"/g, (_, uri) => 'URI="' + wrap(uri) + '"');
      return wrap(t);
    })
    .join("\n");
}

async function relay(request, url, origin, env) {
  const u = url.searchParams.get("u") || "";
  const h = url.searchParams.get("h") || "";
  if (!/^https?:\/\//i.test(u)) return json({ error: "bad url" }, 400, origin);
  let target;
  try {
    target = new URL(u);
  } catch (_) {
    return json({ error: "bad url" }, 400, origin);
  }
  if (!(env && env.ALLOW_PRIVATE) && blockedHost(target.hostname)) return json({ error: "blocked host" }, 403, origin);
  let extra = {};
  if (h) {
    try {
      extra = JSON.parse(b64urlDecode(h));
    } catch (_) {
      return json({ error: "bad headers" }, 400, origin);
    }
  }
  const headers = cleanHeaders(extra);
  for (const name of PASS_REQ) {
    const v = request.headers.get(name);
    if (v) headers.set(name, v);
  }
  const init = { method: request.method === "HEAD" ? "HEAD" : request.method, headers };
  if (request.method === "POST") init.body = await request.arrayBuffer();

  let res, final;
  try {
    ({ res, final } = await fetchFollow(target.toString(), init, env));
  } catch (e) {
    return json({ error: "unreachable", detail: String((e && e.message) || e).slice(0, 160) }, 502, origin);
  }

  const out = new Headers(cors(origin));
  for (const name of PASS_RES) {
    const v = res.headers.get(name);
    if (v) out.set(name, v);
  }
  out.set("X-Final-Url", final);
  out.set("X-Upstream-Status", String(res.status));

  const type = res.headers.get("content-type") || "";
  // Posters and logos: let the browser keep them, so pages open fast next time.
  if (res.ok && /^image\//i.test(type)) out.set("Cache-Control", "public, max-age=604800");
  if (request.method !== "HEAD" && res.ok && looksLikePlaylist(final, type)) {
    const text = await res.text();
    if (text.trimStart().startsWith("#EXTM3U") && /#EXT-X-/.test(text)) {
      const self = new URL(request.url).origin;
      out.delete("content-length");
      out.set("content-type", "application/vnd.apple.mpegurl");
      out.set("Cache-Control", "no-store");
      return new Response(rewritePlaylist(text, final, self, h), { status: res.status, headers: out });
    }
    return new Response(text, { status: res.status, headers: out });
  }
  return new Response(request.method === "HEAD" ? null : res.body, { status: res.status, headers: out });
}

/* ------------------------------------------------------------------ play tickets

   Stalker portals hand out stream links that work once, for a short time, and often
   only for the address that asked for them. A link made by the website and opened
   later by VLC, Outplayer or the page's own player is often refused.

   So the website never hands players a portal link. It asks POST /ticket (from the
   site only) for a sealed ticket describing *how* to get the link, and players open
   GET /play/<ticket>.<ext>. Every time a player opens it (also retries, seeking and
   reconnects), this Worker asks the portal for a fresh link and streams it from the
   same place it asked from. Tickets are encrypted with RELAY_KEY and last 24 hours. */

const TICKET_HOURS = 24;
let keyCache = null;
async function ticketKey(env) {
  if (keyCache) return keyCache;
  const hex = String((env && env.RELAY_KEY) || "");
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error("RELAY_KEY missing");
  const raw = new Uint8Array(hex.match(/../g).map((b) => parseInt(b, 16)));
  keyCache = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  return keyCache;
}
function b64urlBytes(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function bytesB64url(text) {
  const s = String(text || "").replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + (s.length % 4 ? "=".repeat(4 - (s.length % 4)) : ""));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
async function seal(data, env) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const body = new TextEncoder().encode(JSON.stringify(Object.assign({ exp: Date.now() + TICKET_HOURS * 3600e3 }, data)));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await ticketKey(env), body));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return b64urlBytes(out);
}
async function unseal(ticket, env) {
  const raw = bytesB64url(ticket);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, await ticketKey(env), raw.slice(12));
  const data = JSON.parse(new TextDecoder().decode(plain));
  if (!data || Number(data.exp) < Date.now()) throw new Error("expired");
  return data;
}
function extOf(url) {
  try {
    const m = new URL(url).pathname.match(/\.(m3u8|ts|mp4|mkv|avi|m4v|mov|webm|mp3|aac)$/i);
    return m ? m[1].toLowerCase() : "ts";
  } catch (_) {
    return "ts";
  }
}

function stripPlayer(v, mac) {
  let t = String(v || "").trim().replace(/^["']|["']$/g, "");
  const first = t.split(" ")[0].toLowerCase();
  if (first === "ffmpeg" || first === "auto") t = t.slice(first.length).trim();
  const m = t.match(/(https?|rtmp|rtsp):\/\/\S+/i);
  if (m) t = m[0];
  if (mac) t = t.replace(/%mac%/gi, mac);
  return t;
}
async function portalCall(d, params, token, env) {
  const url = d.endpoint + (d.endpoint.includes("?") ? "&" : "?") + new URLSearchParams(params).toString();
  const headers = cleanHeaders(Object.assign({}, d.headers, token ? { Authorization: "Bearer " + token } : {}));
  const { res } = await fetchFollow(url, { method: "GET", headers }, env);
  const text = await res.text();
  let obj = null;
  try {
    obj = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch (_) {
    obj = null;
  }
  return obj && typeof obj === "object" && "js" in obj ? obj.js : obj;
}
/* Ask the portal for a fresh stream link; sign in again if the saved session ended. */
async function stalkerLink(d, env) {
  let why = "";
  const tryLink = async (token, series) => {
    const params = Object.assign({}, d.create, series != null ? { series: String(series) } : {});
    const js = await portalCall(d, params, token, env);
    const value = js && typeof js === "object" ? js.cmd || js.url || js.link : js;
    if (js && typeof js === "object" && js.error) why = String(js.error).slice(0, 120);
    const clean = stripPlayer(value, d.mac);
    return /^(https?|rtmp|rtsp):\/\//i.test(clean) && !/\/\/(localhost|127\.0\.0\.1)[:/]/i.test(clean) ? clean : "";
  };
  const attempt = async (token) => {
    let link = await tryLink(token, null);
    if (!link && d.altSeries != null) link = await tryLink(token, d.altSeries);
    return link;
  };
  let link = d.token ? await attempt(d.token).catch(() => "") : "";
  if (!link && d.handshake) {
    const hs = await portalCall(d, d.handshake, "", env);
    const token = hs && hs.token ? String(hs.token) : "";
    if (token) {
      if (d.profile) await portalCall(d, d.profile, token, env).catch(() => null);
      link = await attempt(token).catch(() => "");
    }
  }
  if (!link && d.fallback) link = d.fallback;
  if (!link) throw new Error("The portal did not give a stream link" + (why ? " (" + why + ")" : ""));
  return link;
}

async function makeTicket(request, origin, env) {
  let body;
  try {
    const text = await request.text();
    if (text.length > 24000) throw new Error("too big");
    body = JSON.parse(text);
  } catch (_) {
    return json({ error: "bad ticket request" }, 400, origin);
  }
  const mode = body && body.mode;
  if (mode === "direct") {
    if (!/^https?:\/\//i.test(String(body.u || ""))) return json({ error: "bad url" }, 400, origin);
  } else if (mode === "stalker") {
    if (!/^https?:\/\//i.test(String(body.endpoint || "")) || !body.create) return json({ error: "bad portal" }, 400, origin);
  } else return json({ error: "bad mode" }, 400, origin);
  try {
    const ticket = await seal(body, env);
    const ext = String(body.ext || (mode === "direct" ? extOf(body.u) : "ts")).replace(/[^a-z0-9]/gi, "").slice(0, 5) || "ts";
    return json({ ok: true, url: new URL(request.url).origin + "/play/" + ticket + "." + ext }, 200, origin);
  } catch (e) {
    return json({ error: "tickets are not set up: " + String(e.message || e) }, 500, origin);
  }
}

/* A movie is read in many pieces (players jump to the end of the file, seek, retry).
   Asking the portal for a new link for every piece makes many portals cut the
   previous one, so a link is kept and reused while it keeps working; when the
   stream server refuses it, a fresh one is asked for at once. Live links are
   kept only briefly because they are usually good for one connection. */
const LINKS = new Map();
function linkCache(ticket, d) {
  const key = ticket.slice(-48);
  const ttl = d.create && d.create.type === "itv" ? 20e3 : 3 * 3600e3;
  return {
    get() {
      const hit = LINKS.get(key);
      return hit && Date.now() - hit.at < ttl ? hit.link : "";
    },
    set(link) {
      if (LINKS.size > 500) LINKS.delete(LINKS.keys().next().value);
      LINKS.set(key, { link, at: Date.now() });
    },
    drop() {
      LINKS.delete(key);
    },
  };
}

async function play(request, ticket, env) {
  const open = cors("*");
  let d;
  try {
    d = await unseal(ticket, env);
  } catch (_) {
    return new Response("This link expired. Open it again from Ultra Stalker.", { status: 403, headers: open });
  }
  const headers = d.mode === "stalker" ? d.streamHeaders || {} : d.h || {};
  const h = cleanHeaders(headers);
  for (const name of PASS_REQ) {
    const v = request.headers.get(name);
    if (v) h.set(name, v);
  }
  const init = { method: request.method === "HEAD" ? "HEAD" : "GET", headers: h };
  const cache = d.mode === "stalker" ? linkCache(ticket, d) : null;
  let res, final, target, problem = "";
  for (let round = 0; round < 2; round++) {
    // ?fresh=… : the player is retrying after a failed attempt; never hand it the used link.
    const reused = cache && round === 0 && !new URL(request.url).searchParams.has("fresh") ? cache.get() : "";
    try {
      target = d.mode === "stalker" ? reused || (await stalkerLink(d, env)) : d.u;
    } catch (e) {
      return new Response(String(e.message || e), { status: 502, headers: open });
    }
    try {
      ({ res, final } = await fetchFollow(target, init, env));
    } catch (e) {
      res = null;
      problem = "Stream server unreachable";
    }
    if (res && res.status < 400) {
      if (cache) cache.set(target);
      break;
    }
    if (res) problem = "Stream server answered " + res.status;
    if (cache) cache.drop();
    if (!cache) break; // a plain link has no fresh copy to ask for
  }
  if (!res) return new Response(problem, { status: 502, headers: open });
  const out = new Headers(open);
  for (const name of PASS_RES) {
    const v = res.headers.get(name);
    if (v) out.set(name, v);
  }
  out.set("Cache-Control", "no-store");
  const type = res.headers.get("content-type") || "";
  if (request.method !== "HEAD" && res.ok && looksLikePlaylist(final, type)) {
    const text = await res.text();
    if (text.trimStart().startsWith("#EXTM3U")) {
      const self = new URL(request.url).origin;
      const lines = [];
      for (const line of text.split(/\r?\n/)) {
        const t = line.trim();
        const wrap = async (uri) => {
          const abs = new URL(uri, final).toString();
          return self + "/play/" + (await seal({ mode: "direct", u: abs, h: headers }, env)) + "." + extOf(abs);
        };
        if (!t) lines.push(line);
        else if (t.startsWith("#")) {
          const m = line.match(/URI="([^"]+)"/);
          lines.push(m ? line.replace(m[0], 'URI="' + (await wrap(m[1])) + '"') : line);
        } else lines.push(await wrap(t));
      }
      out.delete("content-length");
      out.set("content-type", "application/vnd.apple.mpegurl");
      return new Response(lines.join("\n"), { status: res.status, headers: out });
    }
    return new Response(text, { status: res.status, headers: out });
  }
  return new Response(request.method === "HEAD" ? null : res.body, { status: res.status, headers: out });
}

/* TMDB lookups for artwork and details. The key stays here as a Worker
   secret (TMDB_KEY); the website only names the TMDB path it wants. */
const TMDB_PATH = /^(search\/(movie|tv|multi)|movie\/\d{1,9}|tv\/\d{1,9}|tv\/\d{1,9}\/season\/\d{1,4}|find\/tt\d{4,10})$/;
async function tmdb(request, url, origin, env) {
  const key = String((env && env.TMDB_KEY) || "").trim();
  if (!key) return json({ error: "tmdb is not set up" }, 503, origin);
  const path = url.pathname.slice("/tmdb/".length);
  if (!TMDB_PATH.test(path)) return json({ error: "bad path" }, 400, origin);
  const target = new URL("https://api.themoviedb.org/3/" + path);
  for (const [k, v] of url.searchParams) {
    if (/^(query|year|first_air_date_year|primary_release_year|language|page|include_adult|append_to_response|include_image_language|external_source)$/.test(k)) target.searchParams.set(k, v.slice(0, 200));
  }
  const headers = { Accept: "application/json" };
  if (/^[0-9a-f]{32}$/i.test(key)) target.searchParams.set("api_key", key);
  else headers.Authorization = "Bearer " + key.replace(/^Bearer\s+/i, "");
  let res;
  try {
    res = await fetch(target.toString(), { headers, cf: { cacheTtl: 86400, cacheEverything: true } });
  } catch (e) {
    return json({ error: "tmdb unreachable" }, 502, origin);
  }
  const body = await res.text();
  return new Response(body, { status: res.status, headers: cors(origin, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": res.ok ? "public, max-age=86400" : "no-store" }) });
}

export default {
  // env.ALLOW_PRIVATE is only set for local testing (wrangler dev --var ALLOW_PRIVATE:1).
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = originOf(request);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: origin ? 204 : 403, headers: cors(origin) });
    }
    if (url.pathname === "/health") return json({ ok: true, service: "ultrastalker-web", tickets: /^[0-9a-f]{64}$/i.test(String((env && env.RELAY_KEY) || "")), tmdb: !!(env && env.TMDB_KEY) }, 200, origin);
    // Players (VLC, Outplayer, MX, the page) open tickets without an Origin header.
    const pm = url.pathname.match(/^\/play\/([A-Za-z0-9_-]+)(?:\.[a-z0-9]{1,5})?$/i);
    if (pm && (request.method === "GET" || request.method === "HEAD")) return play(request, pm[1], env);
    if (!origin) return json({ error: "This relay only works for the Ultra Stalker website." }, 403, "");
    if (url.pathname === "/p" && ["GET", "HEAD", "POST"].includes(request.method)) return relay(request, url, origin, env);
    if (url.pathname === "/ticket" && request.method === "POST") return makeTicket(request, origin, env);
    if (url.pathname.startsWith("/tmdb/") && request.method === "GET") return tmdb(request, url, origin, env);
    return json({ error: "not found" }, 404, origin);
  },
};
