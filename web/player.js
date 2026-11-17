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
.usp-card{position:relative;width:min(1320px,100%);border-radius:24px;overflow:hidden;border:3px solid transparent;background:linear-gradient(155deg,rgba(16,14,10,.98),rgba(10,8,6,.98) 58%,rgba(31,27,20,.6)) padding-box,linear-gradient(135deg,rgba(245,243,237,.48),rgba(201,153,41,.95) 30%,rgba(110,84,24,.58) 52%,rgba(155,105,56,.88) 77%,rgba(11,10,7,.92)) border-box;box-shadow:0 30px 90px rgba(0,0,0,.6)}
.usp-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px 12px 18px}
.usp-title{min-width:0}.usp-title strong{display:block;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fbf9f3}.usp-title small{display:block;color:#ceb374;font-size:11px;margin-top:3px}
.usp-btns{display:flex;gap:8px;flex:none}
.usp-btn{appearance:none;height:40px;min-width:40px;padding:0 14px;border-radius:999px;border:2px solid transparent;color:#fff;font:inherit;font-size:12px;font-weight:800;line-height:1;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;background:linear-gradient(rgba(8,7,5,.9),rgba(8,7,5,.9)) padding-box,linear-gradient(135deg,rgba(245,243,237,.3),rgba(201,155,48,.7),rgba(152,104,56,.56)) border-box}
.usp-btn.x{font-size:22px;padding:0;width:40px}
.usp-stage{position:relative;background:#000;aspect-ratio:16/9;max-height:calc(100vh - 140px);width:100%}
.usp-stage video{width:100%;height:100%;display:block;background:#000}
.usp-msg{position:absolute;inset:0;display:flex;flex-direction:column;gap:14px;align-items:center;justify-content:center;text-align:center;padding:24px;color:#eadfc5;font-size:14px;line-height:1.7;pointer-events:none}
.usp-msg.err{background:rgba(0,0,0,.74);pointer-events:auto}
.usp-msg b{font-size:17px;color:#fff}
.usp-msg .ar{direction:rtl;font-size:15px;color:#dabfa4}
.usp-msg small{color:#dac595;font-size:12px;max-width:640px}
.usp-acts{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}
.usp-msg .loader{margin-right:8px}
@media(max-width:760px){.usp{padding:0}.usp-card{border-radius:0;border-left:0;border-right:0}.usp-stage{max-height:none}.usp-head .usp-btn.vlc{display:none}}
.player-option.web{border-color:rgba(201,155,48,.5)!important}
.usp-engine{position:absolute;inset:0;z-index:1;background:#000}
.usp-engine canvas,.usp-engine video{width:100%!important;height:100%!important;object-fit:contain}
.usp-ebar{position:absolute;left:0;right:0;bottom:0;z-index:4;display:none;align-items:center;gap:12px;padding:30px 16px 12px;background:linear-gradient(0deg,rgba(0,0,0,.85),rgba(0,0,0,0));color:#f2e9d6;font-size:12.5px;opacity:0;transition:opacity .25s}
.usp-stage:hover .usp-ebar,.usp-ebar:focus-within{opacity:1}
.usp-ebar.on{display:flex}
.usp-ebar button{appearance:none;width:36px;height:36px;border-radius:50%;border:1px solid rgba(255,232,170,.25);background:rgba(20,18,14,.7);color:#f6e7b8;cursor:pointer;font-size:14px;display:grid;place-items:center}
.usp-ebar input[type=range]{accent-color:#d4af37}
.usp-ebar .seek{flex:1}
.usp-ebar .vol{width:90px}
.usp-ebar .tag{padding:3px 9px;border-radius:999px;font-size:10.5px;font-weight:800;letter-spacing:.08em;color:#1a1306;background:linear-gradient(135deg,#fbeeb5,#d9b44a 45%,#a87b22)}
.usp-note{position:absolute;left:14px;right:14px;bottom:62px;z-index:3;display:none;align-items:center;gap:12px;flex-wrap:wrap;padding:10px 14px;border-radius:14px;background:rgba(10,9,7,.88);border:1px solid rgba(212,175,55,.35);color:#eadfc8;font-size:12.5px;line-height:1.5}
.usp-note .ar{direction:rtl;flex:1 1 100%;color:#c9bfa9}
.usp-note .usp-btn{height:32px;margin-inline-start:auto}
.usp.docked{position:absolute;inset:0;z-index:2;padding:0;background:#000;backdrop-filter:none;border-radius:inherit;overflow:hidden}
.usp.docked .usp-card{width:100%;height:100%;border:0;border-radius:inherit;background:#000;box-shadow:none;display:flex;flex-direction:column}
.usp.docked .usp-head{display:none}
.usp.docked .usp-stage{flex:1;aspect-ratio:auto;max-height:none;height:100%}
.usp.docked .usp-stage video{object-fit:contain}
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
    box.addEventListener("click", (e) => e.target === box && !box.classList.contains("docked") && close());
    document.addEventListener("keydown", (e) => {
      if (box.classList.contains("hidden")) return;
      const docked = box.classList.contains("docked");
      if (docked && /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || "")) return;
      const k = e.key;
      if (k === "Escape") {
        if (docked) return;
        close();
      }
      else if (k === " " && document.activeElement !== video) video.paused ? video.play() : video.pause();
      else if ((k === "ArrowRight" || k === "ArrowLeft") && isFinite(video.duration)) video.currentTime = Math.max(0, video.currentTime + (k === "ArrowRight" ? 10 : -10));
      else if (k === "f" || k === "F") document.fullscreenElement ? document.exitFullscreen() : box.querySelector(".usp-stage").requestFullscreen().catch(() => {});
      else return;
      e.preventDefault();
    });
    video.addEventListener("playing", () => {
      started = true;
      show("");
      if (current && current._noAudio) note("🔇 Playing without sound — this channel's audio format doesn't play in browsers. Use VLC for sound.", "الصوت بصيغة مش بتشتغل في المتصفح، فالقناة شغالة من غير صوت. للصوت شغّلها بـ VLC.");
    });
    video.addEventListener("waiting", () => started && show('<span class="loader"></span>Loading…'));
    // The picture is moving: whatever an earlier attempt reported is no longer true.
    let lastT = 0;
    video.addEventListener("timeupdate", () => {
      if (msg.classList.contains("err") && video.currentTime > lastT + 1 && !video.paused) show("");
      if (video.currentTime < lastT) lastT = video.currentTime;
      if (!msg.classList.contains("err")) lastT = video.currentTime;
    });
    video.addEventListener("error", () => {
      if (current && current._engine) return;
      const fmt = video.error && (video.error.code === 4 || video.error.code === 3);
      if (fmt && escalate()) return;
      fail(fmt ? "format" : "");
    });
  }
  function note(en, ar) {
    if (!box) return;
    let n = box.querySelector(".usp-note");
    if (!n) {
      n = document.createElement("div");
      n.className = "usp-note";
      box.querySelector(".usp-stage").appendChild(n);
    }
    n.innerHTML = `<span>${esc(en)}</span><span class="ar">${esc(ar)}</span><a class="usp-btn" href="${esc(vlcHref(current || {}))}">▶ VLC</a>`;
    n.style.display = "flex";
    clearTimeout(note.t);
    note.t = setTimeout(() => (n.style.display = "none"), 12000);
  }
  function show(html, err) {
    msg.innerHTML = html || "";
    msg.classList.toggle("err", !!err);
    msg.style.display = html ? "flex" : "none";
  }
  /* "Ultra engine": a full software player (FFmpeg decoders in WebAssembly, like VLC)
     for streams the browser can't play itself — AC-3/E-AC-3/MP2 sound, HEVC, MPEG-2,
     MKV. It loads only when needed. */
  const ENGINE_WASM = "https://cdn.jsdelivr.net/gh/zhaohappy/libmedia@1.3.1/dist";
  let eng = null, engBox = null, ebar = null, ebarTimer = 0;
  function hostOpts() {
    return box && box.classList.contains("docked") ? { host: box.parentNode } : undefined;
  }
  function escalate() {
    if (!current) return false;
    if (!current._engineTried) {
      play(Object.assign({}, current, { _engine: true, _engineTried: true }), hostOpts());
      return true;
    }
    if (current.live && !current._noAudio && !(info && badPart("video"))) {
      play(Object.assign({}, current, { _engine: false, _noAudio: true }), hostOpts());
      return true;
    }
    return false;
  }
  function fmtClock(ms) {
    const t = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
    return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(sec).padStart(2, "0");
  }
  function engineBar(live) {
    if (!ebar) {
      ebar = document.createElement("div");
      ebar.className = "usp-ebar";
      ebar.innerHTML = '<button type="button" class="pp" aria-label="Play / pause">❚❚</button><span class="t"></span><input class="seek" type="range" min="0" max="1000" value="0"><button type="button" class="mute" aria-label="Sound">🔊</button><input class="vol" type="range" min="0" max="100" value="100"><span class="tag">ULTRA ENGINE</span>';
      box.querySelector(".usp-stage").appendChild(ebar);
      ebar.querySelector(".pp").onclick = async () => {
        if (!eng) return;
        const st = eng.getStatus();
        if (st === 8) {
          await eng.play().catch(() => {});
          ebar.querySelector(".pp").textContent = "❚❚";
        } else {
          await eng.pause().catch(() => {});
          ebar.querySelector(".pp").textContent = "▶";
        }
      };
      ebar.querySelector(".mute").onclick = () => {
        if (!eng) return;
        const v = eng.getVolume() > 0 ? 0 : (+ebar.querySelector(".vol").value || 100) / 100;
        eng.setVolume(v);
        ebar.querySelector(".mute").textContent = v ? "🔊" : "🔇";
      };
      ebar.querySelector(".vol").oninput = (e) => eng && eng.setVolume(+e.target.value / 100);
      ebar.querySelector(".seek").onchange = (e) => {
        if (!eng) return;
        const d = Number(eng.getDuration() || 0);
        if (d > 0) eng.seek(BigInt(Math.floor((+e.target.value / 1000) * d))).catch(() => {});
      };
    }
    ebar.querySelector(".seek").style.display = live ? "none" : "";
    ebar.querySelector(".pp").style.display = live ? "none" : "";
    ebar.classList.add("on");
    clearInterval(ebarTimer);
    ebarTimer = setInterval(() => {
      if (!eng || live) return;
      const d = Number(eng.getDuration() || 0), c = Number(eng.currentTime || 0);
      ebar.querySelector(".t").textContent = fmtClock(c) + (d ? " / " + fmtClock(d) : "");
      if (d && document.activeElement !== ebar.querySelector(".seek")) ebar.querySelector(".seek").value = Math.round((c / d) * 1000);
    }, 500);
  }
  async function startEngine(ticket, src, my) {
    await lib(HERE + "vendor/libmedia/avplayer.js");
    if (my !== alive) return;
    const AV = window.AVPlayer && (window.AVPlayer.default || window.AVPlayer);
    if (!AV) throw new Error("engine unavailable");
    engBox = document.createElement("div");
    engBox.className = "usp-engine";
    box.querySelector(".usp-stage").insertBefore(engBox, msg);
    video.style.visibility = "hidden";
    eng = new AV({ container: engBox, wasmBaseUrl: ENGINE_WASM, isLive: !!ticket.live, enableHardware: true, enableWebCodecs: true, enableWorker: true, lowLatency: !!ticket.live });
    eng.on("error", (e) => my === alive && !escalate() && fail(String((e && e.message) || e)));
    await eng.load(src, { isLive: !!ticket.live });
    if (my !== alive) return;
    await eng.play();
    if (my !== alive) return;
    started = true;
    show("");
    engineBar(!!ticket.live);
  }
  function stopEngine() {
    clearInterval(ebarTimer);
    if (ebar) ebar.classList.remove("on");
    const e = eng;
    eng = null;
    if (e) e.destroy().catch(() => {});
    if (engBox) engBox.remove();
    engBox = null;
    if (video) video.style.visibility = "";
  }

  function badPart(kind) {
    if (!info || !window.MediaSource || !MediaSource.isTypeSupported) return false;
    const c = kind === "audio" ? info.audioCodec : info.videoCodec;
    return !!c && !MediaSource.isTypeSupported((kind === "audio" ? "audio" : "video") + '/mp4; codecs="' + c + '"');
  }
  /* Many IPTV channels carry sound the browser can't decode (AC-3, E-AC-3, MP2).
     The picture is usually fine (H.264): play it without sound rather than not at all. */
  function retryWithoutSound(detail) {
    if (!current || current._noAudio || !current.live) return false;
    if (started && video && video.currentTime > 5) return false;
    if (info && badPart("video")) return false;
    const again = Object.assign({}, current, { _noAudio: true });
    const host = box && box.classList.contains("docked") ? box.parentNode : null;
    play(again, host ? { host } : undefined);
    return true;
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
    // A late error from a player that was already replaced while the picture plays: ignore.
    if (started && video && video.readyState >= 2 && !video.paused && !video.error) return;
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
    stopEngine();
    info = null;
    const n = box && box.querySelector(".usp-note");
    if (n) n.style.display = "none";
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
  /* opts.host: play inside that element (the Live TV screen) instead of the pop-up. */
  async function play(ticket, opts) {
    build();
    stop();
    const host = opts && opts.host;
    if (host) {
      if (box.parentNode !== host) host.appendChild(box);
      box.classList.add("docked");
    } else if (box.classList.contains("docked") || box.parentNode !== document.body) {
      box.classList.remove("docked");
      document.body.appendChild(box);
    }
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
    if (!host) document.documentElement.style.overflow = "hidden";
    show('<span class="loader"></span>Opening stream…');
    let path = "";
    try {
      path = new URL(url).pathname.toLowerCase();
    } catch (_) {}
    const isHls = /\.m3u8$/.test(path) || /[?&](extension|type|output)=(m3u8|hls)/i.test(url);
    const isTs = !isHls && (/\.ts$/.test(path) || /[?&](extension|output)=ts/i.test(url) || (ticket.live && !/\.(mp4|mkv|m4v|mov|webm|avi)$/.test(path)));
    const src = (/^https:/i.test(url) && !Object.keys(headers).length) || ticket.ticket ? url : viaRelay(url, headers);
    if (ticket._engine) {
      show('<span class="loader"></span>Opening with Ultra engine…');
      try {
        await startEngine(ticket, src, my);
      } catch (e) {
        if (my === alive && !escalate()) fail(String((e && e.message) || e));
      }
      return;
    }
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
          hls.on(window.Hls.Events.ERROR, (_, d) => {
            if (!d || !d.fatal || my !== alive) return;
            if (d.type === "mediaError" && escalate()) return;
            fail(d.details);
          });
          hls.loadSource(src);
          hls.attachMedia(video);
        }
      } else if (isTs) {
        await lib(HERE + "vendor/mpegts.min.js");
        if (my !== alive) return;
        const M = window.mpegts;
        if (!M || !M.isSupported()) video.src = src;
        else {
          const ds = { type: "mpegts", isLive: !!ticket.live, url: src };
          if (ticket._noAudio) ds.hasAudio = false;
          ts = M.createPlayer(ds, { enableStashBuffer: true, stashInitialSize: 384 * 1024, liveBufferLatencyChasing: false, lazyLoad: !ticket.live });
          ts.on(M.Events.MEDIA_INFO, (mi) => {
            info = { videoCodec: mi && mi.videoCodec, audioCodec: ticket._noAudio ? "" : mi && mi.audioCodec, hasVideo: mi && mi.hasVideo };
            if (unsupported() && escalate()) return;
            if (unsupported()) fail();
          });
          ts.on(M.Events.ERROR, (type, detail) => {
            if (my !== alive) return;
            if (/MSE|Media/i.test(String(detail || type)) && escalate()) return;
            fail(String(detail || type));
          });
          ts.attachMediaElement(video);
          ts.load();
          // Data arrives but nothing can be decoded (MPEG-2 video has no browser decoder): say so.
          setTimeout(() => my === alive && !started && video.readyState < 2 && !escalate() && fail(info ? "format" : ""), 20000);
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
  function fullscreen() {
    if (!box) return;
    const st = box.querySelector(".usp-stage");
    if (document.fullscreenElement) document.exitFullscreen();
    else if (st && st.requestFullscreen) st.requestFullscreen().catch(() => {});
  }
  window.USPlayer = { play, offer, pending, close, vlcHref, fullscreen, video: () => video };
})();
