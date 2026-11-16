/* Ultra Stalker Web — play inside the page.

   Adds "Play here" to the receiver's player chooser. Live channels (MPEG-TS) play
   with mpegts.js, HLS with hls.js, and movie files with the browser's own player.
   Plain-http streams go through the relay so an https page may load them. */
(function () {
  "use strict";
  const css = `
.usp{position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;background:rgba(1,6,4,.86);backdrop-filter:blur(14px);padding:18px}
.usp.hidden{display:none}
.usp-card{position:relative;width:min(1100px,100%);border-radius:24px;overflow:hidden;border:3px solid transparent;background:linear-gradient(155deg,rgba(6,22,13,.98),rgba(4,13,9,.98) 58%,rgba(45,10,16,.6)) padding-box,linear-gradient(135deg,rgba(245,243,237,.48),rgba(34,190,100,.95) 30%,rgba(20,104,59,.58) 52%,rgba(214,43,57,.88) 77%,rgba(8,12,9,.92)) border-box;box-shadow:0 30px 90px rgba(0,0,0,.6)}
.usp-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px 12px 18px}
.usp-title{min-width:0}.usp-title strong{display:block;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#f4faf6}.usp-title small{display:block;color:#86a491;font-size:11px;margin-top:3px}
.usp-close{appearance:none;flex:none;width:40px;height:40px;border-radius:50%;border:2px solid transparent;color:#fff;font-size:22px;line-height:1;cursor:pointer;background:linear-gradient(rgba(3,12,8,.9),rgba(3,12,8,.9)) padding-box,linear-gradient(135deg,rgba(245,243,237,.3),rgba(41,190,103,.7),rgba(210,44,58,.56)) border-box}
.usp-stage{position:relative;background:#000;aspect-ratio:16/9;max-height:calc(100vh - 140px);width:100%}
.usp-stage video{width:100%;height:100%;display:block;background:#000}
.usp-msg{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:22px;color:#cfe0d4;font-size:13px;line-height:1.6;pointer-events:none}
.usp-msg.err{color:#ffb3ba;background:rgba(0,0,0,.6);pointer-events:auto}
.usp-msg .loader{margin-right:8px}
@media(max-width:760px){.usp{padding:0}.usp-card{border-radius:0;border-left:0;border-right:0}.usp-stage{max-height:none}}
.player-option.web{border-color:rgba(41,190,105,.5)!important}
`;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  let box, video, msg, title, sub, hls = null, ts = null;
  function build() {
    if (box) return;
    box = document.createElement("div");
    box.className = "usp hidden";
    box.innerHTML =
      '<div class="usp-card" role="dialog" aria-modal="true"><div class="usp-head"><div class="usp-title"><strong></strong><small></small></div>' +
      '<button type="button" class="usp-close" aria-label="Close">×</button></div>' +
      '<div class="usp-stage"><video controls playsinline autoplay></video><div class="usp-msg"></div></div></div>';
    document.body.appendChild(box);
    video = box.querySelector("video");
    msg = box.querySelector(".usp-msg");
    title = box.querySelector(".usp-title strong");
    sub = box.querySelector(".usp-title small");
    box.querySelector(".usp-close").addEventListener("click", close);
    box.addEventListener("click", (e) => {
      if (e.target === box) close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !box.classList.contains("hidden")) close();
    });
    video.addEventListener("playing", () => show(""));
    video.addEventListener("waiting", () => show('<span class="loader"></span>Loading…'));
    video.addEventListener("error", () => fail());
  }
  function show(html, err) {
    msg.innerHTML = html || "";
    msg.classList.toggle("err", !!err);
    msg.style.display = html ? "flex" : "none";
  }
  let current = "";
  const esc = (t) => String(t || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  function fail(detail) {
    show("This stream could not play inside the browser." + (detail ? "<br><small>" + esc(detail) + "</small>" : "") + "<br>Try VLC or MX Player from the Play button.", true);
    // Ask the relay why, so the message says what the portal or stream server answered.
    const url = current;
    if (!url || !/\/play\//.test(url)) return;
    fetch(url, { headers: { Range: "bytes=0-0" }, cache: "no-store" })
      .then(async (r) => {
        if (url !== current) return;
        const why = r.ok ? "The server sends a format this browser can't play." : (await r.text()).slice(0, 160) || "Server answered " + r.status;
        show("This stream could not play inside the browser.<br><small>" + esc(why) + "</small><br>Try VLC or MX Player from the Play button.", true);
      })
      .catch(() => {});
  }
  function stop() {
    try {
      if (hls) hls.destroy();
    } catch (_) {}
    try {
      if (ts) {
        ts.pause();
        ts.unload();
        ts.detachMediaElement();
        ts.destroy();
      }
    } catch (_) {}
    hls = ts = null;
    if (video) {
      video.removeAttribute("src");
      try {
        video.load();
      } catch (_) {}
    }
  }
  function close() {
    stop();
    if (box) box.classList.add("hidden");
    document.documentElement.style.overflow = "";
  }
  const loaded = {};
  function lib(src) {
    if (!loaded[src]) {
      loaded[src] = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = src;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    return loaded[src];
  }
  function viaRelay(url, headers) {
    try {
      const base = window.USEngine.relayBase();
      if (base && url.indexOf(base + "/") === 0) return url;
      return window.USEngine.relayUrl(url, headers);
    } catch (_) {
      return url;
    }
  }
  async function play(ticket) {
    build();
    stop();
    const url = String(ticket.stream || ticket.url || "");
    current = url;
    const headers = ticket.headers || {};
    title.textContent = ticket.title || "Ultra Stalker";
    sub.textContent = ticket.live ? "Live • playing in this browser" : "Playing in this browser";
    box.classList.remove("hidden");
    document.documentElement.style.overflow = "hidden";
    show('<span class="loader"></span>Opening stream…');
    let path = "";
    try {
      path = new URL(url).pathname.toLowerCase();
    } catch (_) {}
    const isHls = /\.m3u8$/.test(path) || /[?&](extension|type|output)=(m3u8|hls)/i.test(url);
    const isTs = /\.ts$/.test(path) || /[?&](extension|output)=ts/i.test(url) || (ticket.live && !isHls && !/\.(mp4|mkv|m4v|mov|webm)$/.test(path));
    try {
      if (isHls) {
        if (video.canPlayType("application/vnd.apple.mpegurl") && !window.MediaSource) {
          video.src = viaRelay(url, headers);
        } else {
          await lib("vendor/hls.min.js");
          hls = new window.Hls({ lowLatencyMode: false, maxBufferLength: 30 });
          hls.on(window.Hls.Events.ERROR, (_, d) => {
            if (d && d.fatal) fail(d.details);
          });
          hls.loadSource(viaRelay(url, headers));
          hls.attachMedia(video);
        }
      } else if (isTs) {
        await lib("vendor/mpegts.min.js");
        const M = window.mpegts;
        if (!M || !M.isSupported()) {
          video.src = viaRelay(url, headers);
        } else {
          ts = M.createPlayer({ type: "mpegts", isLive: !!ticket.live, url: viaRelay(url, headers) }, { enableStashBuffer: true, stashInitialSize: 384 * 1024, liveBufferLatencyChasing: false, lazyLoad: !ticket.live });
          ts.on(M.Events.ERROR, (type, detail) => fail(String(detail || type)));
          ts.attachMediaElement(video);
          ts.load();
        }
      } else {
        video.src = (/^https:/i.test(url) && !Object.keys(headers).length) || ticket.ticket ? url : viaRelay(url, headers);
      }
      const p = video.play();
      if (p && p.catch) p.catch(() => show("Press ▶ to start"));
    } catch (e) {
      fail(e && e.message);
    }
  }
  /* Called by the page right after a stream link is ready. */
  function offer(ticket) {
    const a = document.getElementById("playerWeb");
    if (!a) return;
    a.classList.remove("unavailable");
    a.removeAttribute("aria-disabled");
    a.href = "#play";
    a.onclick = (e) => {
      e.preventDefault();
      const sheet = document.getElementById("playerSheet");
      if (sheet) {
        sheet.classList.add("hidden");
        sheet.setAttribute("aria-hidden", "true");
      }
      play(ticket);
    };
  }
  function pending() {
    const a = document.getElementById("playerWeb");
    if (!a) return;
    a.classList.add("unavailable");
    a.setAttribute("aria-disabled", "true");
    a.removeAttribute("href");
    a.onclick = null;
  }
  window.USPlayer = { play, offer, pending, close };
})();
