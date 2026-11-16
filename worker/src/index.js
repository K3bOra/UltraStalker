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

export default {
  // env.ALLOW_PRIVATE is only set for local testing (wrangler dev --var ALLOW_PRIVATE:1).
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = originOf(request);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: origin ? 204 : 403, headers: cors(origin) });
    }
    if (url.pathname === "/health") return json({ ok: true, service: "ultrastalker-web" }, 200, origin);
    if (!origin) return json({ error: "This relay only works for the Ultra Stalker website." }, 403, "");
    if (url.pathname === "/p" && ["GET", "HEAD", "POST"].includes(request.method)) return relay(request, url, origin, env);
    return json({ error: "not found" }, 404, origin);
  },
};
