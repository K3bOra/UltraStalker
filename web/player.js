/* Ultra Stalker Web — play inside the page.

   Adds "Play here" to the receiver's player chooser. Live channels (MPEG-TS) play
   with mpegts.js, HLS with hls.js, and movie files with the browser's own player.
   Portal streams arrive as relay /play tickets; other plain-http streams go through
   the relay so an https page may load them.

   Browsers can't decode everything VLC can (MPEG-2 video, AC-3 / E-AC-3 audio, and
   HEVC on some systems). When a stream uses one of those, the player says exactly
   that and offers VLC / a copyable link, instead of failing silently. */
(function () {
  "use strict";
  const HERE = ((document.currentScript && document.currentScript.src) || location.href).replace(/[^/]*$/, "");
  const css = `
.usp{position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;background:rgba(1,6,4,.88);backdrop-filter:blur(14px);padding:18px}
.usp.hidden{display:none}
.usp-card{position:relative;width:min(1320px,100%);border-radius:24px;overflow:hidden;border:3px solid transparent;background:linear-gradient(155deg,rgba(6,22,13,.98),rgba(4,13,9,.98) 58%,rgba(45,10,16,.6)) padding-box,linear-gradient(135deg,rgba(245,243,237,.48),rgba(34,190,100,.95) 30%,rgba(20,104,59,.58) 52%,rgba(214,43,57,.88) 77%,rgba(8,12,9,.92)) border-box;box-shadow:0 30px 90px rgba(0,0,0,.6)}
.usp-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px 12px 18px}
.usp-title{min-width:0}.usp-title strong{display:block;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#f4faf6}.usp-title small{display:block;color:#86a491;font-size:11px;margin-top:3px}
.usp-btns{display:flex;gap:8px;flex:none}
.usp-btn{appearance:none;height:40px;min-width:40px;padding:0 14px;border-radius:999px;border:2px solid transparent;color:#fff;font:inherit;font-size:12px;font-weight:800;line-height:1;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;background:linear-gradient(rgba(3,12,8,.9),rgba(3,12,8,.9)) padding-box,linear-gradient(135deg,rgba(245,243,237,.3),rgba(41,190,103,.7),rgba(210,44,58,.56)) border-box}
.usp-btn.x{font-size:22px;padding:0;width:40px}
.usp-stage{position:relative;background:#000;aspect-ratio:16/9;max-height:calc(100vh - 140px);width:100%}
.usp-stage video{width:100%;height:100%;display:block;background:#000}
.usp-msg{position:absolute;inset:0;display:flex;flex-direction:column;gap:14px;align-items:center;justify-content:center;text-align:center;padding:24px;color:#cfe0d4;font-size:14px;line-height:1.7;pointer-events:none}
.usp-msg.err{background:rgba(0,0,0,.74);pointer-events:auto}
.usp-msg b{font-size:17px;color:#fff}
.usp-msg .ar{direction:rtl;font-size:15px;color:#f2dfe1}
.usp-msg small{color:#9fb5a8;font-size:12px;max-width:640px}
.usp-acts{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}
.usp-msg .loader{margin-right:8px}
@media(max-width:760px){.usp{padding:0}.usp-card{border-radius:0;border-left:0;border-right:0}.usp-stage{max-height:none}.usp-head .usp-btn.vlc{display:none}}
.player-option.web{border-color:rgba(41,190,105,.5)!important}
`;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

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
  const esc = (t) => String(t || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  function vlcHref(ticket) {
    const url = String(ticket.stream || ticket.url || "");
    const ua = navigator.userAgent || "";
    if (/android/i.test(ua)) return "intent://" + url.replace(/^\w+:\/\//, "") + "#Intent;scheme=" + (url.split(":")[0] || "https") + ";package=org.videolan.vlc;action=android.intent.action.VIEW;type=video/*;end";
    if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && "ontouchend" in document)) return "vlc-x-callback://x-callback-url/stream?url=" + encodeURIComponent(url);
    return "data:audio/x-mpegurl;charset=utf-8," + encodeURIComponent("#EXTM3U\n#EXTINF:-1," + (ticket.title || "Ultra Stalker") + "\n" + url + "\n");
  }
  function codecName(c) {
    const s = String(c || "").toLowerCase();
    if (/^(hvc1|hev1)/.test(s)) return "HEVC (H.265)";
    if (/^ec-?3/.test(s)) return "E-AC-3 (Dolby)";
    if (/^ac-?3/.test(s)) return "AC-3 (Dolby)";
    if (/mp4v|mpeg2|m2v/.test(s)) return "MPEG-2";
    return c || "";
  }

  let box, video, msg, title, sub, vlc, hls = null, ts = null, alive = 0, info = null, started = false, current = null;
  function build() {
    if (box) return;
    box = document.createElement("div");
    box.className = "usp hidden";
    box.innerHTML =
      '<div class="usp-card" role="dialog" aria-modal="true"><div class="usp-head"><div class="usp-title"><strong></strong><small></small></div>' +
      '<div class="usp-btns"><a class="usp-btn vlc">▶ VLC</a><button type="button" class="usp-btn x" aria-label="Close">×</button></div></div>' +
      '<div class="usp-stage"><video controls playsinline autoplay></video><div class="usp-msg"></div></div></div>';
    document.body.appendChild(box);
    video = box.querySelector("video");
    msg = box.querySelector(".usp-msg");
    title = box.querySelector(".usp-title strong");
    sub = box.querySelector(".usp-title small");
    vlc = box.querySelector(".usp-btn.vlc");
    box.querySelector(".usp-btn.x").addEventListener("click", close);
    box.addEventListener("click", (e) => e.target === box && close());
    document.addEventListener("keydown", (e) => {
      if (box.classList.contains("hidden")) return;
      const k = e.key;
      if (k === "Escape") close();
      else if (k === " " && document.activeElement !== video) video.paused ? video.play() : video.pause();
      else if ((k === "ArrowRight" || k === "ArrowLeft") && isFinite(video.duration)) video.currentTime = Math.max(0, video.currentTime + (k === "ArrowRight" ? 10 : -10));
      else if (k === "f" || k === "F") document.fullscreenElement ? document.exitFullscreen() : box.querySelector(".usp-stage").requestFullscreen().catch(() => {});
      else return;
      e.preventDefault();
    });
    video.addEventListener("playing", () => {
      started = true;
      show("");
    });
    video.addEventListener("waiting", () => started && show('<span class="loader"></span>Loading…'));
    video.addEventListener("error", () => fail(video.error && video.error.code === 4 ? "format" : ""));
  }
  function show(html, err) {
    msg.innerHTML = html || "";
    msg.classList.toggle("err", !!err);
    msg.style.display = html ? "flex" : "none";
  }
  function unsupported() {
    if (!info || !window.MediaSource || !MediaSource.isTypeSupported) return "";
    const bad = [];
    if (info.videoCodec && !MediaSource.isTypeSupported('video/mp4; codecs="' + info.videoCodec + '"')) bad.push(codecName(info.videoCodec));
    if (info.audioCodec && !MediaSource.isTypeSupported('audio/mp4; codecs="' + info.audioCodec + '"')) bad.push(codecName(info.audioCodec));
    return bad.join(" + ");
  }
  async function fail(detail) {
    const my = alive;
    if (!current) return;
    const url = String(current.stream || current.url || "");
    let en = "This stream could not play inside the browser.", ar = "الستريم ده مش راضي يشتغل جوه المتصفح.", extra = detail && detail !== "format" ? String(detail) : "";
    const bad = unsupported();
    if (bad) {
      en = "This stream uses " + bad + ", which web browsers can't play.";
      ar = "الستريم ده معمول بصيغة " + bad + "، والمتصفحات مش بتعرف تشغلها. VLC بيشغلها عادي.";
      extra = "";
    } else if (detail === "format" || (info && info.hasVideo === false)) {
      en = "This video format can't play in web browsers (often MPEG-2 or AC-3 sound).";
      ar = "صيغة الفيديو دي مش بتشتغل في المتصفحات (غالباً MPEG-2 أو صوت AC-3). VLC بيشغلها عادي.";
    } else if (/\/play\//.test(url)) {
      // Ask the relay what the portal or stream server answered.
      try {
        const r = await fetch(url, { headers: { Range: "bytes=0-0" }, cache: "no-store" });
        if (my !== alive) return;
        if (!r.ok) extra = (await r.text()).slice(0, 180) || "Server answered " + r.status;
        else {
          en = "The stream opens, but its format can't play in this browser.";
          ar = "الرابط شغال، بس صيغته مش بتشتغل في المتصفح. شغّله بـ VLC.";
        }
      } catch (_) {}
    }
    if (my !== alive) return;
    const href = vlcHref(current);
    show(
      `<b>Can't play here</b><div class="ar">${esc(ar)}</div><small>${esc(en)}${extra ? "<br>" + esc(extra) : ""}</small>` +
        `<div class="usp-acts"><a class="usp-btn" href="${esc(href)}"${/^data:/.test(href) ? ' download="ultra-stalker.m3u"' : ""}>▶ VLC</a><button type="button" class="usp-btn" data-copy>Copy link · انسخ الرابط</button></div>`,
      true,
    );
    const copy = msg.querySelector("[data-copy]");
    if (copy) copy.onclick = () => navigator.clipboard && navigator.clipboard.writeText(url).then(() => (copy.textContent = "Copied · اتنسخ"));
  }
  function stop() {
    alive++;
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
    info = null;
    started = false;
    if (video) {
      video.removeAttribute("src");
      try {
        video.load();
      } catch (_) {}
    }
  }
  function close() {
    stop();
    current = null;
    if (box) box.classList.add("hidden");
    document.documentElement.style.overflow = "";
  }
  async function play(ticket) {
    build();
    stop();
    const my = alive;
    current = ticket;
    const url = String(ticket.stream || ticket.url || "");
    const headers = ticket.headers || {};
    title.textContent = ticket.title || "Ultra Stalker";
    sub.textContent = ticket.live ? "Live • playing in this browser" : "Playing in this browser";
    const href = vlcHref(ticket);
    vlc.href = href;
    if (/^data:/.test(href)) vlc.setAttribute("download", "ultra-stalker.m3u");
    else vlc.removeAttribute("download");
    box.classList.remove("hidden");
    document.documentElement.style.overflow = "hidden";
    show('<span class="loader"></span>Opening stream…');
    let path = "";
    try {
      path = new URL(url).pathname.toLowerCase();
    } catch (_) {}
    const isHls = /\.m3u8$/.test(path) || /[?&](extension|type|output)=(m3u8|hls)/i.test(url);
    const isTs = !isHls && (/\.ts$/.test(path) || /[?&](extension|output)=ts/i.test(url) || (ticket.live && !/\.(mp4|mkv|m4v|mov|webm|avi)$/.test(path)));
    const src = (/^https:/i.test(url) && !Object.keys(headers).length) || ticket.ticket ? url : viaRelay(url, headers);
    try {
      if (isHls) {
        if (video.canPlayType("application/vnd.apple.mpegurl") && !window.MediaSource) video.src = src;
        else {
          await lib(HERE + "vendor/hls.min.js");
          if (my !== alive) return;
          hls = new window.Hls({ lowLatencyMode: false, maxBufferLength: 30 });
          hls.on(window.Hls.Events.MANIFEST_PARSED, (_, d) => {
            const l = d && d.levels && d.levels[0];
            if (l) info = { videoCodec: l.videoCodec, audioCodec: l.audioCodec };
          });
          hls.on(window.Hls.Events.ERROR, (_, d) => d && d.fatal && fail(d.details));
          hls.loadSource(src);
          hls.attachMedia(video);
        }
      } else if (isTs) {
        await lib(HERE + "vendor/mpegts.min.js");
        if (my !== alive) return;
        const M = window.mpegts;
        if (!M || !M.isSupported()) video.src = src;
        else {
          ts = M.createPlayer({ type: "mpegts", isLive: !!ticket.live, url: src }, { enableStashBuffer: true, stashInitialSize: 384 * 1024, liveBufferLatencyChasing: false, lazyLoad: !ticket.live });
          ts.on(M.Events.MEDIA_INFO, (mi) => {
            info = { videoCodec: mi && mi.videoCodec, audioCodec: mi && mi.audioCodec, hasVideo: mi && mi.hasVideo };
            if (unsupported()) fail();
          });
          ts.on(M.Events.ERROR, (type, detail) => fail(String(detail || type)));
          ts.attachMediaElement(video);
          ts.load();
          // Data arrives but nothing can be decoded (MPEG-2 video has no browser decoder): say so.
          setTimeout(() => my === alive && !started && video.readyState < 2 && fail(info ? "format" : ""), 20000);
        }
      } else video.src = src;
      const p = video.play();
      if (p && p.catch) p.catch(() => my === alive && !started && show("Press ▶ to start"));
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
  window.USPlayer = { play, offer, pending, close, vlcHref };
})();
