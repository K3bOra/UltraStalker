/* Ultra Stalker Web — the in-page player ("Ultra Player").

   One player, one set of controls, two engines underneath:
     • Browser engine: the page's own <video> (hardware decoding) fed by mpegts.js for
       live MPEG-TS, hls.js for HLS, or a plain src for movie files.
     • Ultra engine: libmedia AVPlayer — FFmpeg decoders compiled to WebAssembly, so it
       plays what browsers can't (AC-3 / E-AC-3 / MP2 sound, HEVC, MPEG-2, MKV…).

   Like a desktop app with VLC built in, the user never chooses: each stream walks a
   plan (browser → Ultra with hardware → Ultra in software → picture-only for live) and
   the first step that plays wins. The step that worked is remembered per channel, so
   the next time it opens straight away. A watchdog reconnects dropped live streams,
   a start timer reports streams that never answer, and the settings menu offers audio
   tracks, subtitles, picture fit, the engine choice, VLC and the link. */
(function () {
  "use strict";
  const HERE = ((document.currentScript && document.currentScript.src) || location.href).replace(/[^/]*$/, "");
  const ENGINE_WASM = "https://cdn.jsdelivr.net/gh/zhaohappy/libmedia@1.3.1/dist";
  const START_TIMEOUT = 22000; // ms without a picture before moving on
  const STALL_LIMIT = 9000; // ms a live picture may freeze before reconnecting
  const MAX_RECONNECT = 4;

  const css = `
.usp{position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;background:rgba(4,3,2,.86);backdrop-filter:blur(14px);padding:18px}
.usp.hidden{display:none}
.usp-card{position:relative;width:min(1320px,100%);border-radius:24px;overflow:hidden;border:1.5px solid transparent;background:linear-gradient(155deg,rgba(26,20,12,.98),rgba(10,8,6,.98) 58%,rgba(31,25,16,.9)) padding-box,linear-gradient(var(--us-edge),var(--us-edge)) border-box;box-shadow:0 30px 90px rgba(0,0,0,.65),0 0 90px -40px rgba(240,190,80,.6)}
.usp-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px 12px 18px}
.usp-title{min-width:0}.usp-title strong{display:block;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fbf6e6}.usp-title small{display:block;color:#e3c46f;font-size:11px;margin-top:3px;letter-spacing:.04em}
.usp-btns{display:flex;gap:8px;flex:none}
.usp-btn{appearance:none;height:40px;min-width:40px;padding:0 14px;border-radius:999px;border:1px solid rgba(240,222,180,.28);color:#fff3d0;font:inherit;font-size:12.5px;font-weight:700;line-height:1;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;background:rgba(30,23,13,.85);transition:background .2s,color .2s}
.usp-btn:hover{background:var(--foil);color:#1a1306}
.usp-btn.x{font-size:22px;padding:0;width:40px}
.usp-stage{position:relative;background:#000;aspect-ratio:16/9;max-height:calc(100vh - 140px);width:100%;overflow:hidden;user-select:none;-webkit-user-select:none}
.usp-stage video{width:100%;height:100%;display:block;background:#000;object-fit:contain}
.usp-stage[data-fit=fill] video,.usp-stage[data-fit=fill] .usp-engine video{object-fit:cover!important}
.usp-stage[data-fit=stretch] video{object-fit:fill!important}
.usp-stage.idle{cursor:none}
/* subtitles from the engine: clear white, above the controls while they show */
.usp-engine .ASS-box{transform:translateY(-78px);transition:transform .3s ease}
.usp-stage.idle .usp-engine .ASS-box{transform:translateY(-20px)}
.usp-engine .ASS-dialogue span{color:#fff!important;font-weight:600!important;text-shadow:0 2px 6px rgba(0,0,0,.95),0 0 2px #000,0 0 1px #000!important;-webkit-text-stroke:0!important}
.usp-mh{padding:2px 4px 10px;font-size:15px;font-weight:700;color:#fff}
.usp-empty{padding:9px 12px;border-radius:12px;font-size:13px;color:#a99f8c;background:rgba(255,240,210,.035)}
.usp-menu button.usp-cta{margin-top:14px;justify-content:center;text-align:center;background:var(--foil)!important;color:#1a1306!important;font-weight:700;border-radius:14px;box-shadow:0 10px 24px -12px rgba(226,192,124,.8)}
.usp-hint{margin:8px 4px 2px;font-size:11.5px;line-height:1.5;color:#a99f8c}
.usp-hint .ar{display:block;direction:rtl;margin-top:4px}
.usp-ic.stop svg{fill:currentColor;stroke:none;width:17px;height:17px}
.usp-vlchole{position:absolute;inset:0;z-index:1;background:#000;display:none}
.usp-stage.vlcmode .usp-vlchole{display:block}
.usp-stage.vlcmode video{visibility:hidden}
.usp-msg{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;gap:14px;align-items:center;justify-content:center;text-align:center;padding:24px;color:#eadfc5;font-size:14px;line-height:1.7;pointer-events:none}
.usp-msg.err{background:radial-gradient(70% 80% at 50% 40%,rgba(30,22,10,.92),rgba(4,3,2,.96));pointer-events:auto}
.usp-msg b{font-size:18px;color:#fff6dc}
.usp-msg .ar{direction:rtl;font-size:15px;color:#e5cfa4}
.usp-msg small{color:#cdb98a;font-size:12px;max-width:640px}
.usp-diag{max-width:640px;padding:10px 14px;border-radius:12px;background:rgba(0,0,0,.4);border:1px solid rgba(240,222,180,.14);font-size:11.5px;line-height:1.6;color:#bfb08e;text-align:left;font-family:ui-monospace,Menlo,Consolas,monospace;direction:ltr}
.usp-acts{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}
.usp-msg .loader{margin-right:8px}
.usp-spin{width:46px;height:46px;border-radius:50%;border:3px solid rgba(240,222,180,.15);border-top-color:#e2c07c;animation:uspSpin .9s linear infinite;filter:drop-shadow(0 0 10px rgba(226,192,124,.6))}
@keyframes uspSpin{to{transform:rotate(360deg)}}
.usp-engine{position:absolute;inset:0;z-index:1;background:#000}
.usp-engine canvas,.usp-engine video{width:100%!important;height:100%!important;object-fit:contain}
/* controls */
.usp-ui{position:absolute;inset:0;z-index:4;pointer-events:none}
.usp-osd{position:absolute;left:18px;top:16px;display:flex;align-items:center;gap:10px;max-width:70%;padding:8px 14px 8px 10px;border-radius:14px;background:rgba(12,9,5,.72);border:1px solid rgba(240,222,180,.22);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);opacity:0;transform:translateY(-8px);transition:opacity .3s,transform .3s}
.usp-osd.on{opacity:1;transform:none}
.usp-facts{display:flex;gap:5px;flex-wrap:wrap}
.usp-facts em{font-style:normal;padding:2px 7px;border-radius:7px;font-size:10px;font-weight:600;letter-spacing:.04em;color:#f1e6cc;background:rgba(255,246,225,.08);border:1px solid rgba(232,211,164,.2)}
.usp-osd b{font-size:14px;color:#fff6dc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.usp-osd i,.usp-tag{font-style:normal;flex:none;padding:3px 8px;border-radius:999px;font-size:9.5px;font-weight:800;letter-spacing:.1em;color:#1a1306;background:var(--foil)}
.usp-osd i.b{color:#f3e2b4;background:rgba(240,222,180,.14)}
.usp-bar{position:absolute;left:0;right:0;bottom:0;padding:44px 14px 12px;background:linear-gradient(0deg,rgba(6,4,2,.92),rgba(6,4,2,.55) 55%,rgba(6,4,2,0));pointer-events:auto;transition:opacity .3s,transform .3s}
.usp-stage.idle .usp-bar,.usp-stage.idle .usp-osd{opacity:0;transform:translateY(10px);pointer-events:none}
.usp-seek{display:flex;align-items:center;gap:10px;margin:0 6px 6px;font-size:12px;color:#e9dcbc;font-variant-numeric:tabular-nums}
.usp-seek input{flex:1}
.usp-row{display:flex;align-items:center;gap:6px}
.usp-row .sp{flex:1}
.usp-ic{appearance:none;flex:none;width:40px;height:40px;border-radius:12px;border:0;background:none;color:#f6e7b8;cursor:pointer;display:grid;place-items:center;transition:background .2s,color .2s,transform .15s}
.usp-ic:hover{background:rgba(240,222,180,.12);color:#fff}
.usp-ic:active{transform:scale(.92)}
.usp-ic svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.usp-ic.pp{width:46px;height:46px;border-radius:50%;background:var(--foil);color:#1a1306;box-shadow:0 8px 24px -8px rgba(226,192,124,.8)}
.usp-ic.pp svg{fill:currentColor;stroke:none}
.usp-ic[hidden]{display:none}
.usp-live{display:inline-flex;align-items:center;gap:6px;margin:0 6px;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:.1em;color:#ffd9d9;background:rgba(255,70,70,.14);border:1px solid rgba(255,90,90,.35)}
.usp-live:before{content:"";width:7px;height:7px;border-radius:50%;background:#ff4d4d;box-shadow:0 0 10px #ff4d4d;animation:uspBlink 1.6s ease-in-out infinite}
@keyframes uspBlink{50%{opacity:.35}}
.usp-time{margin:0 6px;font-size:12.5px;color:#e9dcbc;font-variant-numeric:tabular-nums}
.usp-vol{display:flex;align-items:center}
.usp-vol input{width:0;opacity:0;transition:width .25s,opacity .25s}
.usp-vol:hover input,.usp-vol input:focus{width:90px;opacity:1}
.usp input[type=range]{-webkit-appearance:none;appearance:none;height:4px;border-radius:4px;background:linear-gradient(90deg,#e2c07c var(--p,0%),rgba(240,222,180,.22) var(--p,0%));cursor:pointer}
.usp input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;border-radius:50%;background:#fff3cf;box-shadow:0 0 0 3px rgba(226,192,124,.45)}
.usp input[type=range]::-moz-range-thumb{width:14px;height:14px;border:0;border-radius:50%;background:#fff3cf}
.usp-unmute{position:absolute;right:16px;top:16px;z-index:6;pointer-events:auto;display:none;align-items:center;gap:8px;padding:9px 14px;border-radius:999px;border:0;cursor:pointer;font:inherit;font-size:12.5px;font-weight:700;color:#1a1306;background:var(--foil);box-shadow:0 10px 30px -10px rgba(226,192,124,.9)}
.usp-unmute.on{display:inline-flex}
/* settings */
.usp-menu{position:absolute;right:14px;bottom:76px;z-index:7;width:min(300px,calc(100% - 28px));max-height:calc(100% - 100px);overflow:auto;pointer-events:auto;padding:8px;border-radius:18px;background:linear-gradient(165deg,rgba(60,44,18,.9),rgba(16,12,8,.95) 45%) padding-box,linear-gradient(var(--us-edge),var(--us-edge)) border-box;border:1px solid transparent;box-shadow:0 30px 60px -20px rgba(0,0,0,.9);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);display:none;scrollbar-width:thin}
.usp-menu.on{display:block;animation:uspPop .18s ease-out}
@keyframes uspPop{from{opacity:0;transform:translateY(6px) scale(.98)}}
.usp-menu h4{margin:8px 10px 6px;font-size:10.5px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#e2c07c}
.usp-menu button,.usp-menu a{appearance:none;display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;padding:9px 10px;border:0;border-radius:11px;background:none;color:#efe4c9;font:inherit;font-size:13px;text-align:left;cursor:pointer;text-decoration:none}
.usp-menu button:hover,.usp-menu a:hover{background:rgba(240,222,180,.1)}
.usp-menu button.on{color:#fff6dc;background:rgba(226,192,124,.16)}
.usp-menu button.on:after{content:"";width:8px;height:8px;border-radius:50%;background:#e2c07c;box-shadow:0 0 10px #e2c07c}
.usp-menu small{color:#a99c80;font-size:11px}
.usp-seg{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:3px;margin:2px 4px 8px;padding:3px;border-radius:999px;background:rgba(8,7,6,.5);box-shadow:inset 0 1px 3px rgba(0,0,0,.55),0 0 0 1px rgba(232,211,164,.22)}
.usp-menu .usp-seg button{justify-content:center;height:32px;padding:0 8px;border:0;border-radius:999px;background:none;color:#cfc3a8;font-size:12.5px;font-weight:500}
.usp-menu .usp-seg button:hover{background:rgba(255,246,225,.06);color:#fff6e3}
.usp-menu .usp-seg button.on{color:#1a1306;font-weight:600;background:var(--foil);box-shadow:0 6px 16px -8px rgba(226,192,124,.8),inset 0 1px rgba(255,255,255,.5)}
.usp-menu .usp-seg button.on:after{display:none}
.usp-now{margin:0 10px 4px;font-size:11.5px;color:#a99f8a}.usp-now b{color:#e6cb8c;font-weight:600}
.usp-info{margin:2px 4px 6px;padding:4px 12px;border-radius:14px;background:rgba(8,7,6,.42);box-shadow:inset 0 1px 3px rgba(0,0,0,.5),0 0 0 1px rgba(232,211,164,.16)}
.usp-info div{display:flex;justify-content:space-between;gap:12px;padding:7px 0;font-size:12px;border-top:1px solid rgba(232,211,164,.08)}
.usp-info div:first-child{border-top:0}
.usp-info span{color:#a99f8a}.usp-info b{color:#f1e6cc;font-weight:500;text-align:right;font-variant-numeric:tabular-nums}
.usp-menu hr{border:0;border-top:1px solid rgba(240,222,180,.12);margin:6px 4px}
.usp-note{position:absolute;left:14px;right:14px;bottom:86px;z-index:6;display:none;align-items:center;gap:12px;flex-wrap:wrap;padding:10px 14px;border-radius:14px;background:rgba(14,10,6,.9);border:1px solid rgba(226,192,124,.4);color:#eadfc8;font-size:12.5px;line-height:1.5;pointer-events:auto}
.usp-note .ar{direction:rtl;flex:1 1 100%;color:#d6c7a6}
.usp-note .usp-btn{height:32px;margin-inline-start:auto}
@media(max-width:760px){.usp{padding:0}.usp-card{border-radius:0;border-left:0;border-right:0}.usp-stage{max-height:none}.usp-head .usp-btn.vlc{display:none}.usp-vol input{display:none}.usp-ic{width:38px;height:38px}.usp-bar{padding:36px 8px 8px}.usp-ic.pip{display:none}}
.player-option.web{border-color:rgba(201,155,48,.5)!important}
body.usp-direct #playerSheet{display:none!important}
.usp.docked{position:absolute;inset:0;z-index:2;padding:0;background:#000;backdrop-filter:none;border-radius:inherit;overflow:hidden}
.usp.docked .usp-card{width:100%;height:100%;border:0;border-radius:inherit;background:#000;box-shadow:none;display:flex;flex-direction:column}
.usp.docked .usp-head{display:none}
.usp.docked .usp-stage{flex:1;aspect-ratio:auto;max-height:none;height:100%}
.usp-stage:fullscreen{width:100%;height:100%;max-height:none;aspect-ratio:auto}
.usp.expanded{position:fixed;inset:0;z-index:1000;width:100%;height:100%;height:100dvh;box-sizing:border-box;
  padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  background:#000;backdrop-filter:none;border-radius:0}
.usp.expanded .usp-card{width:100%;height:100%;display:flex;flex-direction:column;border:0;border-radius:0;background:#000;box-shadow:none}
.usp.expanded .usp-head{flex:none}
.usp.expanded .usp-stage{flex:1;min-height:0;height:auto;max-height:none;aspect-ratio:auto}
`;
  // mpegts.js posts a few late messages after a stream is unloaded (its emitter is gone by
  // then). They are harmless; keep them out of the console.
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    if (r && /reading 'emit'|reading "emit"|_emitter/.test(String(r.message || r)) && /mpegts/.test(String(r.stack || ""))) e.preventDefault();
  });
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  const I = {
    play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><rect x="6.5" y="5" width="4" height="14" rx="1.2"/><rect x="13.5" y="5" width="4" height="14" rx="1.2"/></svg>',
    prev: '<svg viewBox="0 0 24 24"><path d="M18 6 9 12l9 6z"/><path d="M6 6v12"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="m6 6 9 6-9 6z"/><path d="M18 6v12"/></svg>',
    vol: '<svg viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
    mute: '<svg viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="m16 9.5 5 5m0-5-5 5"/></svg>',
    gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/></svg>',
    tracks: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3.2"/><path d="M6.8 12.6h3.4M12.6 12.6h4.6M6.8 15.6h6.2M15.4 15.6h1.8"/></svg>',
    stop: '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2.2"/></svg>',
    pip: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><rect x="12" y="11.5" width="7" height="5.5" rx="1"/></svg>',
    full: '<svg viewBox="0 0 24 24"><path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4"/></svg>',
    exitFull: '<svg viewBox="0 0 24 24"><path d="M4 9h5V4m6 0v5h5M4 15h5v5m6 0v-5h5"/></svg>',
  };

  const loaded = {};
  function lib(src) {
    if (!loaded[src]) {
      loaded[src] = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = src;
        s.onload = resolve;
        s.onerror = () => {
          delete loaded[src];
          reject(new Error("could not load " + src.split("/").pop()));
        };
        document.head.appendChild(s);
      });
    }
    return loaded[src];
  }
  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem(k);
        return v === null ? d : v;
      } catch (_) {
        return d;
      }
    },
    set(k, v) {
      try {
        if (v === null) localStorage.removeItem(k);
        else localStorage.setItem(k, String(v));
      } catch (_) {}
    },
  };
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
  function fmtClock(sec) {
    const t = Math.max(0, Math.floor(sec || 0));
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(s).padStart(2, "0");
  }

  /* ------------------------------------------------------------------ plans
     A plan is the ordered list of ways to try one stream. */
  const STEP_LABEL = { native: "Playing here", engine: "Ultra engine", soft: "Ultra engine · software", vlc: "VLC", mute: "Picture only" };
  /* VLC inside the Windows program: the program runs VLC and lets it draw into a window
     that sits exactly over the player (window.usNative comes from the program). */
  const NV = (window.usNative && window.usNative.vlc) || null;
  const hasVlc = () => !!(NV && NV.available);
  /* How many seconds to keep ahead before showing live video (like VLC's network
     caching). More = fewer stutters on shaky lines, a little later start. */
  const BUFFER = { fast: 1.2, normal: 3, smooth: 6 };
  function bufferSecs() {
    return BUFFER[store.get("us-buffer", "normal")] || 3;
  }
  function engineMode() {
    const m = store.get("us-player-engine", "auto"); // auto | browser | vlc | ultra
    return m === "vlc" && !hasVlc() ? "auto" : m;
  }
  function planFor(ticket, key) {
    const live = !!ticket.live;
    const mode = engineMode();
    let plan;
    const mem = key ? store.get("us-eng:" + key, "") : "";
    if (mode === "browser") plan = ["native"];
    else if (mode === "vlc") plan = ["vlc", "native", "engine", "soft"];
    else if (mode === "ultra") plan = ["engine", "soft", "native"];
    // The program: whatever the browser can't play smoothly goes to VLC.
    else if (hasVlc()) plan = mem ? ["vlc", "native", "engine", "soft"] : ["native", "vlc", "engine", "soft"];
    else if (mem === "1" || streamExt(ticket) === "mkv") plan = ["engine", "soft", "native"];
    else plan = ["native", "engine", "soft"];
    if (live) plan.push("mute");
    return plan;
  }

  /* ------------------------------------------------------------------ state */
  let box, stage, video, msg, title, sub, vlc, ui, bar, osd, menu, unmuteBtn;
  let hls = null, ts = null, eng = null, engBox = null;
  let vs = null, vlcOn = false, vlcPoll = 0, vlcPlace = 0, vlcLast = "", pausedAt = 0;
  let alive = 0, info = null, started = false, current = null, opts = {};
  let lastT = 0, lastMove = 0, playingSince = 0, startTimer = 0, tick = 0, idleTimer = 0, gate = 0;
  function ahead() {
    try {
      const b = video.buffered;
      for (let i = b.length - 1; i >= 0; i--) if (b.start(i) <= video.currentTime + 0.3) return b.end(i) - video.currentTime;
      return b.length ? b.end(b.length - 1) - video.currentTime : 0;
    } catch (_) {
      return 0;
    }
  }
  /* Live: hold the picture until enough is buffered, then play smoothly. Used at the
     start and whenever the buffer runs dry (instead of stuttering every second). */
  function holdForBuffer(my, again) {
    if (!current || !current.live || isEngine() || !video) return false;
    const need = again ? Math.max(1.5, bufferSecs()) : bufferSecs();
    if (ahead() >= need) return false;
    clearInterval(gate);
    if (!video.paused) video.pause();
    current._holding = true;
    const t0 = Date.now();
    let best = ahead(), grewAt = Date.now();
    gate = setInterval(() => {
      if (my !== alive || !current) return clearInterval(gate);
      const a = ahead();
      if (a > best + 0.05) {
        best = a;
        grewAt = Date.now();
      } else if (Date.now() - grewAt > 8000) {
        // nothing new is arriving: the line dropped, open it again
        clearInterval(gate);
        current._holding = false;
        return reconnect("stall");
      }
      if (started) show('<div class="usp-spin"></div><small>Buffering ' + Math.min(100, Math.round((a / need) * 100)) + "%</small>");
      if (a >= need || Date.now() - t0 > 15000) {
        clearInterval(gate);
        current._holding = false;
        video.play().catch(() => {});
      }
    }, 200);
    return true;
  }

  const step = () => (current && current._plan ? current._plan[current._step || 0] : "native");
  const isEngine = () => step() === "engine" || step() === "soft";
  const isVlc = () => step() === "vlc";

  /* ------------------------------------------------------------------ one API over both engines */
  const A = {
    paused() {
      if (current && current._halted) return true;
      if (isVlc()) return !vs || !!vs.paused;
      if (isEngine()) return !eng || eng.getStatus() === 8;
      return !video || video.paused;
    },
    async toggle() {
      if (current && current._halted) return resume();
      const live = current && current.live;
      // Live: pause holds the picture; play jumps back to what is on air now.
      if (live && A.paused() && pausedAt && Date.now() - pausedAt > 1500) {
        pausedAt = 0;
        return restart(Object.assign({}, current, { _reconnects: 0 }));
      }
      pausedAt = A.paused() ? 0 : Date.now();
      if (isVlc()) {
        if (vs) vs.paused = !vs.paused;
        return NV.cmd(vs && vs.paused ? "pause" : "play");
      }
      if (isEngine()) {
        if (!eng) return;
        if (eng.getStatus() === 8) await eng.play().catch(() => {});
        else await eng.pause().catch(() => {});
      } else if (video) video.paused ? video.play().catch(() => {}) : video.pause();
    },
    time() {
      if (isVlc()) return vs ? vs.time || 0 : 0;
      if (isEngine()) {
        try {
          return eng ? Number(eng.currentTime || 0) / 1000 : 0;
        } catch (_) {
          return 0;
        }
      }
      return video ? video.currentTime : 0;
    },
    duration() {
      if (current && current.live) return 0;
      if (isVlc()) return vs ? vs.length || 0 : 0;
      if (isEngine()) {
        try {
          return eng ? Number(eng.getDuration() || 0) / 1000 : 0;
        } catch (_) {
          return 0; // not loaded yet
        }
      }
      return video && isFinite(video.duration) ? video.duration : 0;
    },
    seek(sec) {
      if (current && current.live) return;
      if (isVlc()) {
        if (vs) vs.time = Math.max(0, sec);
        return NV.cmd("seek", String(Math.max(0, Math.floor(sec))));
      }
      if (isEngine()) eng && eng.seek(BigInt(Math.max(0, Math.floor(sec * 1000)))).catch(() => {});
      else if (video) video.currentTime = Math.max(0, sec);
    },
    vol() {
      return Math.min(1, Math.max(0, +store.get("us-vol", "1") || 0));
    },
    muted() {
      return store.get("us-muted", "0") === "1";
    },
    applyVol() {
      const v = A.vol(), m = A.muted();
      if (vlcOn) NV.cmd("volume", String(m ? 0 : Math.round(v * 256)));
      if (video) {
        video.volume = v;
        video.muted = m || !!(current && current._noAudio);
      }
      if (eng) {
        try {
          eng.setVolume(m ? 0 : v);
        } catch (_) {}
      }
    },
    setVol(v) {
      store.set("us-vol", Math.min(1, Math.max(0, v)).toFixed(2));
      if (v > 0) store.set("us-muted", "0");
      A.applyVol();
    },
    toggleMute() {
      store.set("us-muted", A.muted() ? "0" : "1");
      A.applyVol();
    },
    audioTracks() {
      try {
        return A._audioTracks();
      } catch (_) {
        return [];
      }
    },
    _audioTracks() {
      if (isVlc()) return vs && vs.atracks && vs.atracks.length > 1 ? vs.atracks : [];
      if (isEngine() && eng) {
        let cur = -1;
        try {
          cur = eng.getSelectedAudioStreamId();
        } catch (_) {}
        return (eng.getStreams() || [])
          .filter((s) => /audio/i.test(String(s.mediaType)))
          .map((s, i) => ({ id: s.id, on: s.id === cur, label: trackLabel(s.metadata, i, codecOf(s)) }));
      }
      if (hls && hls.audioTracks && hls.audioTracks.length > 1) return hls.audioTracks.map((t, i) => ({ id: i, on: i === hls.audioTrack, label: trackLabel({ language: t.lang, title: t.name }, i) }));
      if (video && video.audioTracks && video.audioTracks.length > 1) return [...video.audioTracks].map((t, i) => ({ id: i, on: t.enabled, label: trackLabel({ language: t.language, title: t.label }, i) }));
      return [];
    },
    selectAudio(id) {
      if (isVlc()) return NV.cmd("atrack", String(id)).then(vlcTracks);
      if (isEngine() && eng) eng.selectAudio(id).catch(() => {});
      else if (hls) hls.audioTrack = id;
      else if (video && video.audioTracks) [...video.audioTracks].forEach((t, i) => (t.enabled = i === id));
    },
    subTracks() {
      try {
        return A._subTracks();
      } catch (_) {
        return [];
      }
    },
    _subTracks() {
      if (isVlc()) return vs && vs.stracks ? vs.stracks : [];
      if (isEngine() && eng) {
        let cur = -1;
        try {
          cur = eng.getSelectedSubtitleStreamId();
        } catch (_) {}
        return (eng.getStreams() || [])
          .filter((s) => /subtitle/i.test(String(s.mediaType)))
          .map((s, i) => ({ id: s.id, on: s.id === cur && store.get("us-subs", "1") === "1", label: trackLabel(s.metadata, i) }));
      }
      if (hls && hls.subtitleTracks && hls.subtitleTracks.length) return hls.subtitleTracks.map((t, i) => ({ id: i, on: i === hls.subtitleTrack, label: trackLabel({ language: t.lang, title: t.name }, i) }));
      if (video && video.textTracks) return [...video.textTracks].filter((t) => /subtitles|captions/.test(t.kind)).map((t, i) => ({ id: i, on: t.mode === "showing", label: trackLabel({ language: t.language, title: t.label }, i) }));
      return [];
    },
    selectSub(id) {
      if (isVlc()) {
        store.set("us-subs", id < 0 ? "0" : "1");
        return NV.cmd("strack", String(id)).then(vlcTracks);
      }
      if (isEngine() && eng) {
        if (id < 0) {
          store.set("us-subs", "0");
          eng.setSubtitleEnable(false);
        } else {
          store.set("us-subs", "1");
          eng.setSubtitleEnable(true);
          eng.selectSubtitle(id).catch(() => {});
        }
      } else if (hls) hls.subtitleTrack = id;
      else if (video && video.textTracks) [...video.textTracks].filter((t) => /subtitles|captions/.test(t.kind)).forEach((t, i) => (t.mode = i === id ? "showing" : "disabled"));
    },
    setFit(fit) {
      store.set("us-fit", fit);
      if (stage) stage.dataset.fit = fit;
      if (vlcOn) NV.fit(fit);
      if (eng) {
        try {
          eng.setRenderMode(fit === "fill" ? 1 : 0);
        } catch (_) {}
      }
    },
  };
  const LANGS = { ar: "Arabic", ara: "Arabic", en: "English", eng: "English", fr: "French", fre: "French", fra: "French", de: "German", ger: "German", deu: "German", es: "Spanish", spa: "Spanish", tr: "Turkish", tur: "Turkish", it: "Italian", ita: "Italian", ru: "Russian", rus: "Russian", fa: "Persian", per: "Persian", ku: "Kurdish", kur: "Kurdish", und: "" };
  function trackLabel(meta, i, codec) {
    const m = meta || {};
    const lang = String(m.language || m.lang || "").toLowerCase();
    const name = LANGS[lang] !== undefined ? LANGS[lang] : lang.toUpperCase();
    const t = String(m.title || m.name || m.label || "").trim();
    return [t || name || "Track " + (i + 1), codec].filter(Boolean).join(" · ");
  }
  function codecOf(s) {
    try {
      const id = s.codecparProxy && s.codecparProxy.codecId;
      return { 86019: "AC-3", 86056: "E-AC-3", 86017: "MP3", 86016: "MP2", 86018: "AAC", 86076: "Opus", 86020: "DTS" }[id] || "";
    } catch (_) {
      return "";
    }
  }

  /* ------------------------------------------------------------------ UI */
  function build() {
    if (box) return;
    box = document.createElement("div");
    box.className = "usp hidden";
    box.innerHTML =
      '<div class="usp-card" role="dialog" aria-modal="true"><div class="usp-head"><div class="usp-title"><strong></strong><small></small></div>' +
      '<div class="usp-btns"><a class="usp-btn vlc">▶ VLC</a><button type="button" class="usp-btn x" aria-label="Close">×</button></div></div>' +
      '<div class="usp-stage"><video playsinline autoplay></video><div class="usp-vlchole"></div><div class="usp-msg"></div>' +
      '<div class="usp-ui"><div class="usp-osd"><b></b><i></i><span class="usp-facts"></span></div>' +
      '<div class="usp-bar"><div class="usp-seek"><span class="c">0:00</span><input type="range" min="0" max="1000" value="0" aria-label="Seek"><span class="d">0:00</span></div>' +
      '<div class="usp-row">' +
      `<button type="button" class="usp-ic prev" aria-label="Previous channel" title="Previous channel (↑)">${I.prev}</button>` +
      `<button type="button" class="usp-ic pp" aria-label="Play / pause" title="Pause (Space)">${I.pause}</button>` +
      `<button type="button" class="usp-ic stop" aria-label="Stop" title="Stop">${I.stop}</button>` +
      `<button type="button" class="usp-ic next" aria-label="Next channel" title="Next channel (↓)">${I.next}</button>` +
      '<span class="usp-live">LIVE</span><span class="usp-time"></span>' +
      `<div class="usp-vol"><button type="button" class="usp-ic mute" aria-label="Sound (M)">${I.vol}</button><input type="range" min="0" max="100" aria-label="Volume"></div>` +
      '<span class="sp"></span><span class="usp-tag" hidden>ULTRA</span>' +
      `<button type="button" class="usp-ic trk" aria-label="Audio &amp; subtitles" title="Audio &amp; subtitles">${I.tracks}</button>` +
      `<button type="button" class="usp-ic gear" aria-label="Settings">${I.gear}</button>` +
      `<button type="button" class="usp-ic pip" aria-label="Picture in picture">${I.pip}</button>` +
      `<button type="button" class="usp-ic full" aria-label="Full screen (F)">${I.full}</button>` +
      "</div></div><div class=\"usp-menu\" role=\"menu\"></div></div>" +
      '<button type="button" class="usp-unmute">' + I.mute.replace("<svg", '<svg width="16" height="16" style="fill:none;stroke:currentColor;stroke-width:2"') + " Tap for sound</button>" +
      "</div></div>";
    document.body.appendChild(box);
    stage = box.querySelector(".usp-stage");
    video = box.querySelector("video");
    msg = box.querySelector(".usp-msg");
    title = box.querySelector(".usp-title strong");
    sub = box.querySelector(".usp-title small");
    vlc = box.querySelector(".usp-btn.vlc");
    ui = box.querySelector(".usp-ui");
    bar = box.querySelector(".usp-bar");
    osd = box.querySelector(".usp-osd");
    menu = box.querySelector(".usp-menu");
    unmuteBtn = box.querySelector(".usp-unmute");
    stage.dataset.fit = store.get("us-fit", "fit");
    box.querySelector(".usp-btn.x").addEventListener("click", close);
    box.addEventListener("click", (e) => e.target === box && !box.classList.contains("docked") && close());

    const q = (s) => bar.querySelector(s);
    q(".pp").onclick = () => Promise.resolve(A.toggle()).then(refresh);
    q(".stop").onclick = halt;
    q(".prev").onclick = () => opts.onPrev && opts.onPrev();
    q(".next").onclick = () => opts.onNext && opts.onNext();
    q(".mute").onclick = () => {
      A.toggleMute();
      refresh();
    };
    q(".usp-vol input").oninput = (e) => {
      A.setVol(+e.target.value / 100);
      refresh();
    };
    const seek = q(".usp-seek input");
    seek.oninput = () => {
      const d = A.duration();
      q(".usp-seek .c").textContent = fmtClock((seek.value / 1000) * d);
      paint(seek);
    };
    seek.onchange = () => A.seek((seek.value / 1000) * A.duration());
    q(".gear").onclick = (e) => {
      e.stopPropagation();
      menu.classList.contains("on") && menu.dataset.kind !== "tracks" ? menu.classList.remove("on") : openMenu();
    };
    q(".trk").onclick = (e) => {
      e.stopPropagation();
      menu.classList.contains("on") && menu.dataset.kind === "tracks" ? menu.classList.remove("on") : openMenu("tracks");
    };
    q(".pip").onclick = () => {
      if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
      else if (video && video.requestPictureInPicture && !isEngine()) video.requestPictureInPicture().catch(() => {});
    };
    q(".full").onclick = fullscreen;
    document.addEventListener("fullscreenchange", updateFullscreenButton);
    if (window.ResizeObserver) new ResizeObserver(resizeEngine).observe(stage);
    unmuteBtn.onclick = (e) => {
      e.stopPropagation();
      store.set("us-muted", "0");
      if (eng && eng.isSuspended && eng.isSuspended()) eng.resume().catch(() => {});
      A.applyVol();
      if (video && !isEngine()) video.play().catch(() => {});
      unmuteBtn.classList.remove("on");
      refresh();
    };
    menu.addEventListener("click", (e) => e.stopPropagation());

    // show the controls on movement, hide them when idle
    const wake = () => {
      stage.classList.remove("idle");
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => !menu.classList.contains("on") && !A.paused() && !isVlc() && stage.classList.add("idle"), 3200);
    };
    stage.addEventListener("mousemove", wake);
    stage.addEventListener("touchstart", wake, { passive: true });
    stage.addEventListener("click", (e) => {
      if (e.target.closest(".usp-bar,.usp-menu,.usp-msg.err,.usp-unmute,.usp-note")) return;
      if (menu.classList.contains("on")) return menu.classList.remove("on");
      if (matchMedia("(hover: none)").matches) return; // touch: a tap only wakes the controls
      if (current && !current.live) Promise.resolve(A.toggle()).then(refresh);
    });
    stage.addEventListener("dblclick", (e) => !e.target.closest(".usp-bar,.usp-menu") && fullscreen());

    document.addEventListener("keydown", (e) => {
      if (box.classList.contains("hidden")) return;
      const docked = box.classList.contains("docked");
      if (/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || "") && document.activeElement.type !== "range") return;
      const k = e.key;
      const live = current && current.live;
      if (k === "Escape") {
        if (menu.classList.contains("on")) menu.classList.remove("on");
        else if (box.classList.contains("expanded") || document.fullscreenElement === stage) fullscreen();
        else if (!docked) close();
        else return;
      } else if (k === " " || k === "k") Promise.resolve(A.toggle()).then(refresh);
      else if (k === "m" || k === "M") A.toggleMute();
      else if (k === "f" || k === "F") fullscreen();
      else if (!live && (k === "ArrowRight" || k === "ArrowLeft")) A.seek(A.time() + (k === "ArrowRight" ? 10 : -10));
      else if (live && (k === "ArrowUp" || k === "PageUp" || k === "ChannelUp") && opts.onPrev) opts.onPrev();
      else if (live && (k === "ArrowDown" || k === "PageDown" || k === "ChannelDown") && opts.onNext) opts.onNext();
      else if (!live && (k === "ArrowUp" || k === "ArrowDown")) A.setVol(A.vol() + (k === "ArrowUp" ? 0.1 : -0.1));
      else return;
      e.preventDefault();
      wake();
      refresh();
    });

    video.addEventListener("playing", () => {
      if (isEngine()) return;
      onStarted();
      if (current && current._noAudio) note("Playing without sound — this channel's audio doesn't decode here. Use VLC for sound.", "القناة شغالة من غير صوت لأن صيغة الصوت مش بتشتغل هنا. للصوت شغّلها بـ VLC.");
    });
    video.addEventListener("waiting", () => {
      if (!started || isEngine()) return;
      if (!holdForBuffer(alive, true)) show('<div class="usp-spin"></div>');
    });
    video.addEventListener("timeupdate", () => {
      if (isEngine()) return;
      if (msg.classList.contains("err") && video.currentTime > lastT + 1 && !video.paused) show("");
      else if (started && !msg.classList.contains("err") && msg.style.display !== "none" && video.currentTime > lastT) show("");
    });
    video.addEventListener("error", () => {
      if (isEngine() || !current) return;
      const fmt = video.error && (video.error.code === 4 || video.error.code === 3);
      if ((video.error?.code === 2 && retryViaRelay()) || tryNativeHls() || escalate(fmt ? "format" : "")) return;
      fail(fmt ? "format" : "");
    });
    video.addEventListener("ended", () => current && current.live && reconnect("ended"));
  }
  function paint(range) {
    range.style.setProperty("--p", (range.value / range.max) * 100 + "%");
  }
  function refresh() {
    if (!box || box.classList.contains("hidden")) return;
    const q = (s) => bar.querySelector(s);
    const live = !!(current && current.live);
    const paused = A.paused();
    q(".pp").innerHTML = paused ? I.play : I.pause;
    q(".pp").hidden = !current || (!current.stream && !current.url);
    q(".stop").hidden = !current || (!current.stream && !current.url) || !!current._halted;
    q(".prev").hidden = q(".next").hidden = !(live && opts.onPrev);
    q(".usp-live").style.display = live ? "" : "none";
    const d = A.duration(), t = A.time();
    q(".usp-seek").style.display = !live && d > 0 ? "" : "none";
    q(".usp-time").textContent = !live && !d && t ? fmtClock(t) : "";
    if (!live && d > 0) {
      q(".usp-seek .c").textContent = fmtClock(t);
      q(".usp-seek .d").textContent = fmtClock(d);
      const s = q(".usp-seek input");
      if (document.activeElement !== s) {
        s.value = Math.round((t / d) * 1000) || 0;
        paint(s);
      }
    }
    const muted = A.muted() || !!(current && current._noAudio);
    q(".mute").innerHTML = muted || !A.vol() ? I.mute : I.vol;
    const v = q(".usp-vol input");
    if (document.activeElement !== v) v.value = muted ? 0 : Math.round(A.vol() * 100);
    paint(v);
    const tag = q(".usp-tag");
    tag.hidden = !isEngine() && !isVlc();
    tag.textContent = isVlc() ? "VLC" : "ULTRA";
    q(".pip").hidden = isEngine() || isVlc() || !document.pictureInPictureEnabled;
    // Audio & subtitles: always for movies and episodes; for live when there is a choice
    q(".trk").hidden = !current || (!current.stream && !current.url) || (live && A.audioTracks().length < 2 && !A.subTracks().length);
    if (paused) stage.classList.remove("idle");
  }
  function osdShow() {
    if (!osd || !current) return;
    osd.querySelector("b").textContent = current.title || "Ultra Stalker";
    const i = osd.querySelector("i");
    i.textContent = isVlc() ? "VLC" : isEngine() ? "ULTRA ENGINE" : current._noAudio ? "PICTURE ONLY" : current.live ? "LIVE" : "HD";
    i.className = isEngine() || isVlc() ? "" : "b";
    osd.classList.add("on");
    clearTimeout(osdShow.t);
    osdShow.t = setTimeout(() => osd.classList.remove("on"), 3500);
  }
  /* Can this way of playing list the file's own audio and subtitle tracks? (A browser
     playing an MP4 / MKV directly can't: only the first sound track and no subtitles.) */
  function canListTracks() {
    return isEngine() || isVlc() || !!hls || !!(video && video.audioTracks);
  }
  function tracksHtml(at, st) {
    const list = canListTracks();
    let h = "<h4>Audio</h4>";
    if (at.length) h += at.map((t) => `<button type="button" data-a="${t.id}" class="${t.on ? "on" : ""}">${esc(t.label)}</button>`).join("");
    else h += `<div class="usp-empty">${list ? "One sound track" : "Main sound track"}</div>`;
    h += "<h4>Subtitles</h4>";
    if (st.length) h += `<button type="button" data-s="-1" class="${st.some((t) => t.on) ? "" : "on"}">Off</button>` + st.map((t) => `<button type="button" data-s="${t.id}" class="${t.on ? "on" : ""}">${esc(t.label)}</button>`).join("");
    else h += `<div class="usp-empty">${list ? "No subtitles in this video" : "Not shown by this player"}</div>`;
    if (!list && current && !current.live)
      h += `<button type="button" data-x="alltracks" class="usp-cta">Show all audio &amp; subtitles</button><div class="usp-hint">Continues from the same moment with ${hasVlc() ? "VLC" : "the Ultra engine"}, which reads every track in the file.<span class="ar">بيكمّل من نفس اللحظة بمحرك بيقرا كل الأصوات والترجمات.</span></div>`;
    return h;
  }
  function openMenu(kind) {
    const at = A.audioTracks(), st = A.subTracks();
    const fit = store.get("us-fit", "fit");
    const mode = engineMode();
    if (kind === "tracks") {
      menu.innerHTML = '<div class="usp-mh">Audio &amp; subtitles</div>' + tracksHtml(at, st);
      menu.dataset.kind = "tracks";
      menu.onclick = menuClick;
      menu.classList.add("on");
      return;
    }
    const fits = isEngine() || isVlc() ? [["fit", "Fit"], ["fill", "Fill"]] : [["fit", "Fit"], ["fill", "Fill"], ["stretch", "Stretch"]];
    let h = qualityMenu();
    if (current && !current.live && !canListTracks()) h += tracksHtml(at, st);
    else if (at.length > 1) h += "<h4>Audio</h4>" + at.map((t) => `<button type="button" data-a="${t.id}" class="${t.on ? "on" : ""}">${esc(t.label)}</button>`).join("");
    if (st.length) h += "<h4>Subtitles</h4>" + `<button type="button" data-s="-1" class="${st.some((t) => t.on) ? "" : "on"}">Off</button>` + st.map((t) => `<button type="button" data-s="${t.id}" class="${t.on ? "on" : ""}">${esc(t.label)}</button>`).join("");
    h += '<h4>Picture</h4><div class="usp-seg">' + fits.map(([k, l]) => `<button type="button" data-f="${k}" class="${fit === k ? "on" : ""}">${l}</button>`).join("") + "</div>";
    if (current && current.live) {
      const bf = store.get("us-buffer", "normal");
      h += '<h4>Buffer</h4><div class="usp-seg">' + [["fast", "Fast"], ["normal", "Normal"], ["smooth", "Smooth"]].map(([k, l]) => `<button type="button" data-b="${k}" class="${bf === k ? "on" : ""}">${l}</button>`).join("") + "</div>";
    }
    h +=
      '<h4>Player engine</h4><div class="usp-seg">' +
      (hasVlc() ? [["auto", "Auto"], ["browser", "Browser"], ["vlc", "VLC"], ["ultra", "Ultra"]] : [["auto", "Auto"], ["browser", "Browser"], ["ultra", "Ultra"]]).map(([k, l]) => `<button type="button" data-e="${k}" class="${mode === k ? "on" : ""}">${l}</button>`).join("") +
      `</div><div class="usp-now">Now: <b>${esc(STEP_LABEL[step()] || "")}</b></div>`;
    if (hasVlc() && !isVlc()) h += '<button type="button" data-x="vlc">Play this with VLC</button>';
    else if (!isEngine() && !isVlc() && mode !== "browser") h += '<button type="button" data-x="ultra">Play this with Ultra engine</button>';
    h += '<h4>Stream info</h4><div class="usp-info">' + streamInfo().map((l) => {
      const i = l.indexOf(": ");
      return i > 0 ? `<div><span>${esc(l.slice(0, i))}</span><b>${esc(l.slice(i + 2))}</b></div>` : `<div><b>${esc(l)}</b></div>`;
    }).join("") + "</div>";
    const href = vlcHref(current || {});
    if (window.usNative && window.usNative.openLogs) h += '<button type="button" data-x="logs">Open program log</button>';
    h += `<hr><a href="${esc(href)}"${/^data:/.test(href) ? ' download="ultra-stalker.m3u"' : ""}>Open in VLC <small>▶</small></a><button type="button" data-x="copy">Copy stream link</button>`;
    menu.innerHTML = h;
    menu.dataset.kind = "";
    menu.onclick = menuClick;
    menu.classList.add("on");
  }
  function menuClick(e) {
      e.stopPropagation();
      const b = e.target.closest("button");
      if (!b || b.disabled) return;
      if (b.dataset.a !== undefined) A.selectAudio(+b.dataset.a);
      else if (b.dataset.s !== undefined) A.selectSub(+b.dataset.s);
      else if (b.dataset.q !== undefined && hls) {
        const level = Number(b.dataset.q);
        if (level === -1 || hls.levels[level]) {
          current._quality = level < 0 ? "" : qualityKey(hls.levels[level]);
          hls.nextLevel = level;
        }
      } else if (b.dataset.f) A.setFit(b.dataset.f);
      else if (b.dataset.b) {
        store.set("us-buffer", b.dataset.b);
        if (current) restart(Object.assign({}, current, { _reconnects: 0 }));
        return menu.classList.remove("on");
      }
      else if (b.dataset.e) {
        store.set("us-player-engine", b.dataset.e);
        if (current) restart(Object.assign({}, current, { _plan: null, _step: 0 }));
        return menu.classList.remove("on");
      } else if (b.dataset.x === "alltracks") {
        // same movie, same moment, with an engine that reads every track
        const plan = (hasVlc() ? ["vlc", "engine", "soft"] : ["engine", "soft"]).concat(["native"]);
        restart(Object.assign({}, current, { _plan: plan, _step: 0, _manual: true, _resumeAt: A.time(), _openTracks: true }));
        return menu.classList.remove("on");
      } else if (b.dataset.x === "logs") {
        window.usNative.openLogs();
        return;
      } else if (b.dataset.x === "vlc") {
        restart(Object.assign({}, current, { _plan: ["vlc", "native", "engine", "soft"], _step: 0, _manual: true }));
        return menu.classList.remove("on");
      } else if (b.dataset.x === "ultra") {
        const plan = ["engine", "soft", "native"].concat(current.live ? ["mute"] : []);
        restart(Object.assign({}, current, { _plan: plan, _step: 0, _manual: true }));
        return menu.classList.remove("on");
      } else if (b.dataset.x === "copy") {
        const url = String((current && (current.stream || current.url)) || "");
        if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => (b.textContent = "Copied ✓"));
        return;
      }
      setTimeout(() => openMenu(menu.dataset.kind), 60);
  }
  /* Stream facts for badges: quality, frame rate, video / audio codec, channels. */
  const VCODEC = { 27: "H.264", 173: "HEVC", 2: "MPEG-2", 1: "MPEG-1", 225: "AV1", 167: "VP9", 12: "MPEG-4" };
  const ACODEC = { 86018: "AAC", 86019: "AC-3", 86056: "E-AC-3", 86017: "MPEG audio", 86016: "MPEG audio", 86076: "Opus", 86020: "DTS", 86028: "Vorbis", 86065: "AAC" };
  function prettyCodec(c) {
    const s = String(c || "").toLowerCase();
    if (/^avc|h264/.test(s)) return "H.264";
    if (/^(hvc|hev)|hevc|h265/.test(s)) return "HEVC";
    if (/^mp4a\.40/.test(s) || s === "aac") return "AAC";
    if (/^ec-?3/.test(s)) return "E-AC-3";
    if (/^ac-?3/.test(s)) return "AC-3";
    if (/mp3|mp4a\.6b|mpeg audio/.test(s)) return "MPEG audio";
    if (/opus/.test(s)) return "Opus";
    if (/mpeg2|mp2v|m2v/.test(s)) return "MPEG-2";
    return c ? String(c).split(".")[0].toUpperCase() : "";
  }
  function qualityOf(w, h) {
    const v = Math.max(h || 0, Math.round(((w || 0) * 9) / 16));
    if (!v) return "";
    if (v >= 2000) return "4K UHD";
    if (v >= 1400) return "QHD 1440p";
    if (v >= 1000) return "FHD 1080p";
    if (v >= 700) return "HD 720p";
    return "SD " + (h || v) + "p";
  }
  function qualityKey(level) {
    return [level.width, level.height, level.frameRate, level.bitrate, level.videoCodec].join("|");
  }
  function qualityMenu() {
    if (!hls || hls.levels.length < 2) return "";
    const active = hls.levels[hls.currentLevel];
    const selected = hls.manualLevel;
    const labelFor = (level) => qualityOf(level.width, level.height) || level.name;
    const activeLabel = active ? labelFor(active) : "";
    const autoLabel = activeLabel ? "Auto · " + activeLabel : "Auto";
    const auto = `<button type="button" data-q="-1" class="${selected < 0 ? "on" : ""}">${esc(autoLabel)}</button>`;
    const levels = hls.levels.map((level, index) => {
      const fps = level.frameRate > 0 ? Math.round(level.frameRate) + " fps" : "";
      const rate = level.bitrate > 0 ? (level.bitrate / 1e6).toFixed(1) + " Mb/s" : "";
      const label = [labelFor(level) || "Quality " + (index + 1), fps, rate].filter(Boolean).join(" · ");
      return `<button type="button" data-q="${index}" class="${index === selected ? "on" : ""}">${esc(label)}</button>`;
    });
    return "<h4>Quality</h4>" + auto + levels.join("");
  }
  function channelsOf(n) {
    return !n ? "" : n === 1 ? "Mono" : n === 2 ? "Stereo" : n === 6 ? "5.1" : n === 8 ? "7.1" : n + " ch";
  }
  function facts() {
    const f = { quality: "", fps: "", video: "", audio: "", channels: "", engine: isVlc() ? "VLC" : isEngine() ? "Ultra engine" : current && current._noAudio ? "Picture only" : "Browser" };
    try {
      if (isVlc()) {
        const v = (vs && vs.info) || {};
        f.quality = qualityOf(v.width, v.height);
        f.fps = v.fps > 1 ? Math.round(v.fps) + " fps" : "";
        f.video = prettyCodec(v.vcodec);
        f.audio = prettyCodec(v.acodec);
        f.channels = v.channels || "";
        return f;
      }
      if (isEngine() && eng) {
        const streams = eng.getStreams() || [];
        const vs = streams.find((x) => /video/i.test(String(x.mediaType)));
        const as = streams.find((x) => x.id === eng.getSelectedAudioStreamId()) || streams.find((x) => /audio/i.test(String(x.mediaType)));
        const st = eng.getStats();
        if (vs) {
          const cp = vs.codecparProxy || {};
          f.quality = qualityOf(cp.width || (st && st.width), cp.height || (st && st.height));
          f.video = VCODEC[cp.codecId] || "";
          const fr = cp.framerate || vs.avgFramerate || vs.rFrameRate;
          const fps = fr && fr.den ? fr.num / fr.den : 0;
          if (fps > 1) f.fps = Math.round(fps) + " fps";
        }
        if (as) {
          const cp = as.codecparProxy || {};
          f.audio = ACODEC[cp.codecId] || codecOf(as) || "";
          f.channels = channelsOf((cp.chLayout && cp.chLayout.nbChannels) || cp.channels);
        }
      } else {
        if (video && video.videoWidth) f.quality = qualityOf(video.videoWidth, video.videoHeight);
        else if (info && info.height) f.quality = qualityOf(info.width, info.height);
        if (info) {
          f.video = prettyCodec(info.videoCodec);
          f.audio = current && current._noAudio ? "" : prettyCodec(info.audioCodec);
          if (info.fps) f.fps = Math.round(info.fps) + " fps";
          f.channels = current && current._noAudio ? "" : channelsOf(info.channels);
        }
      }
    } catch (_) {}
    return f;
  }
  let lastFacts = "";
  function announceFacts() {
    if (!current || !started) return;
    const f = facts();
    const key = JSON.stringify(f);
    if (key === lastFacts) return;
    lastFacts = key;
    window.dispatchEvent(new CustomEvent("usp:facts", { detail: f }));
    const chips = [f.quality, f.fps, f.video, [f.audio, f.channels].filter(Boolean).join(" ")].filter(Boolean);
    const box = osd && osd.querySelector(".usp-facts");
    if (box) box.innerHTML = chips.map((c) => `<em>${esc(c)}</em>`).join("");
  }

  /* What is playing and how well: picture size, codecs, decode speed, CPU threads. */
  function streamInfo() {
    const out = [];
    try {
      if (isVlc()) {
        const v = (vs && vs.info) || {};
        if (v.width) out.push("Picture: " + v.width + "×" + v.height + (v.fps ? " · " + Math.round(v.fps) + " fps" : ""));
        if (v.vcodec || v.acodec) out.push("Codecs: " + [prettyCodec(v.vcodec), [prettyCodec(v.acodec), v.channels].filter(Boolean).join(" ")].filter(Boolean).join(" + "));
        if (vs && vs.stats && vs.stats.shown != null) out.push("Frames: " + vs.stats.shown + " shown · " + (vs.stats.lost || 0) + " lost");
        if (vs && vs.version) out.push("VLC: " + vs.version);
      } else if (isEngine() && eng) {
        const st = eng.getStats();
        const vs = (eng.getStreams() || []).find((x) => /video/i.test(String(x.mediaType)));
        const w = (st && st.width) || (vs && vs.codecparProxy && vs.codecparProxy.width) || 0;
        const hgt = (st && st.height) || (vs && vs.codecparProxy && vs.codecparProxy.height) || 0;
        if (w) out.push("Picture: " + w + "×" + hgt);
        if (st) out.push("Decoding: " + Math.round(st.videoDecodeFramerate || 0) + " fps · shown " + Math.round(st.videoRenderFramerate || 0) + " fps");
      } else if (video && video.videoWidth) {
        out.push("Picture: " + video.videoWidth + "×" + video.videoHeight);
        const q = video.getVideoPlaybackQuality && video.getVideoPlaybackQuality();
        if (q) out.push("Frames: " + q.totalVideoFrames + " · dropped " + q.droppedVideoFrames);
      }
      if (info && (info.videoCodec || info.audioCodec)) out.push("Codecs: " + [info.videoCodec, info.audioCodec].filter(Boolean).map(codecName).join(" + "));
    } catch (_) {}
    out.push("Engine: " + STEP_LABEL[step()] + (isVlc() ? " · graphics card" : "") + (isEngine() ? (self.crossOriginIsolated ? " · multi-core" : " · single-core") : ""));
    out.push("CPU threads: " + (navigator.hardwareConcurrency || "?"));
    for (const l of (current && current._log) || []) out.push("Tried: " + l);
    return out;
  }
  function note(en, ar) {
    if (!box) return;
    let n = box.querySelector(".usp-note");
    if (!n) {
      n = document.createElement("div");
      n.className = "usp-note";
      stage.appendChild(n);
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

  /* ------------------------------------------------------------------ lifecycle */
  function onStarted() {
    if (started) return;
    started = true;
    playingSince = Date.now();
    lastMove = Date.now();
    clearTimeout(startTimer);
    show("");
    A.applyVol();
    osdShow();
    refresh();
    lastFacts = "";
    setTimeout(announceFacts, 600);
    // Remember which way this channel plays, so next time it opens on the first try.
    const key = opts.key;
    if (key && !current._manual && engineMode() === "auto") {
      if (isEngine()) store.set("us-eng:" + key, "1");
      else if (isVlc()) store.set("us-eng:" + key, "vlc");
      else if (step() === "native") store.set("us-eng:" + key, null);
    }
    // Autoplay with sound may be refused: play muted and offer one tap for sound.
    if (!isEngine() && video && video.muted && !A.muted() && !current._noAudio) unmuteBtn.classList.add("on");
    if (isEngine() && eng && eng.isSuspended && eng.isSuspended()) unmuteBtn.classList.add("on");
    if (isVlc()) vlcTracks();
    if (current._resumeAt > 1 && !current.live) {
      const at = current._resumeAt;
      const my = alive;
      setTimeout(() => {
        if (my !== alive) return;
        A.seek(at);
        current._resumeAt = 0;
      }, isVlc() ? 300 : 0);
    }
    if (current._openTracks) {
      current._openTracks = false;
      setTimeout(() => started && openMenu("tracks"), 1400);
    }
    const vlcWhy = (current._log || []).find((l) => /^VLC: /.test(l));
    if (!isVlc() && hasVlc() && vlcWhy) note("VLC couldn't play this channel, so it plays here instead (" + vlcWhy.replace(/^VLC: /, "") + ").", "VLC مقدرش يشغّل القناة دي فاشتغلت هنا. السبب في الإعدادات ← Stream info");
  }
  /* Move on to the next way of playing this stream. */
  function escalate(why) {
    if (!current || !current._plan) return false;
    const n = (current._step || 0) + 1;
    if (n >= current._plan.length) return false;
    note_step(why);
    if (current._plan[n] === "mute" && info && badPart("video")) return false;
    restart(Object.assign({}, current, { _step: n, _why: why || "" }));
    return true;
  }
  function note_step(why) {
    if (!current) return;
    current._log = (current._log || []).concat(STEP_LABEL[step()] + ": " + describe(why));
    try {
      console.info("[player] " + STEP_LABEL[step()] + " → next: " + describe(why));
    } catch (_) {}
  }
  function describe(why) {
    const w = String(why || "").trim();
    const codecs = info ? [info.videoCodec, info.audioCodec].filter(Boolean).map(codecName).join(" + ") : "";
    if (w === "codec") return "can't decode " + (unsupported() || codecs || "this format");
    if (w === "timeout") return "no picture after " + Math.round(START_TIMEOUT / 1000) + "s" + (codecs ? " (" + codecs + ")" : "");
    if (w === "format") return "unsupported format" + (codecs ? " (" + codecs + ")" : "");
    if (w === "media") return "decoder error" + (codecs ? " (" + codecs + ")" : "");
    return w.replace(/\[[^\]]*\]\s*/g, "").replace(/,\s*$/, "").slice(0, 90) || "failed";
  }
  /* What did the stream server actually send? (status, type, first bytes) */
  async function probe(url) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch(url, { headers: { Range: "bytes=0-2047" }, cache: "no-store", signal: ctl.signal });
      const type = (r.headers.get("content-type") || "").split(";")[0];
      let kind = "";
      if (r.ok && r.body) {
        const rd = r.body.getReader();
        let got = new Uint8Array(0);
        while (got.length < 400) {
          const { value, done } = await rd.read();
          if (done || !value) break;
          const m = new Uint8Array(got.length + value.length);
          m.set(got);
          m.set(value, got.length);
          got = m;
        }
        ctl.abort();
        const txt = new TextDecoder().decode(got.slice(0, 60)).trim();
        if (!got.length) kind = "empty reply";
        else if (got[0] === 0x47 && (got.length < 189 || got[188] === 0x47)) kind = "MPEG-TS data";
        else if (/^#EXTM3U/.test(txt)) kind = "HLS playlist";
        else if (/ftyp/.test(new TextDecoder().decode(got.slice(4, 8)))) kind = "MP4 data";
        else if (/^</.test(txt)) kind = "a web page, not video";
        else if (got[0] === 0x1a && got[1] === 0x45) kind = "MKV data";
        else kind = "unknown data (" + [...got.slice(0, 4)].map((b) => b.toString(16).padStart(2, "0")).join(" ") + ")";
      } else if (!r.ok) kind = ((await r.text().catch(() => "")) || "").slice(0, 120);
      clearTimeout(t);
      return "Server: HTTP " + r.status + (type ? " · " + type : "") + (kind ? " · " + kind : "");
    } catch (e) {
      return "Server: no answer (" + String((e && e.name) || e).slice(0, 40) + ")";
    }
  }
  /* The stream dropped: open it again the same way (like VLC's http-reconnect). */
  function reconnect(why) {
    if (!current) return;
    const n = (current._reconnects || 0) + 1;
    if (n > MAX_RECONNECT) return fail("dropped");
    show('<div class="usp-spin"></div><small>Reconnecting… · بيعيد الاتصال</small>');
    restart(Object.assign({}, current, { _reconnects: n, _why: why || "" }));
  }
  function restart(t) {
    if (started && !t.live) t._resumeAt = Math.max(t._resumeAt || 0, A.time() || 0);
    play(t, Object.assign({}, opts, { _again: true }));
  }

  function retryViaRelay() {
    const url = String(current.stream || current.url || "");
    if (current.ticket || current._viaRelay || !/^https:/i.test(url) || current._src !== url) return false;
    const alternate = viaRelay(url, current.headers);
    if (alternate === url) return false;
    restart(Object.assign({}, current, { _viaRelay: true }));
    return true;
  }

  function tryNativeHls() {
    if (!hls || current._nativeHls || !video.canPlayType("application/vnd.apple.mpegurl")) return false;
    restart(Object.assign({}, current, { _nativeHls: true }));
    return true;
  }
  function watchdog() {
    if (!current || !box || box.classList.contains("hidden")) return;
    refresh();
    announceFacts();
    if (!started) return;
    const t = A.time();
    if (Math.abs(t - lastT) > 0.05) {
      lastT = t;
      lastMove = Date.now();
      if (current._reconnects && Date.now() - playingSince > 60000) current._reconnects = 0;
    } else if (current._holding) {
      lastMove = Date.now();
    } else if (current.live && !A.paused() && Date.now() - lastMove > STALL_LIMIT && navigator.onLine !== false) {
      reconnect("stall");
    }
  }

  function badPart(kind) {
    if (!info || !window.MediaSource || !MediaSource.isTypeSupported) return false;
    const c = kind === "audio" ? info.audioCodec : info.videoCodec;
    return !!c && !MediaSource.isTypeSupported((kind === "audio" ? "audio" : "video") + '/mp4; codecs="' + c + '"');
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
    if (started && !isEngine() && video && video.readyState >= 2 && !video.paused && !video.error) return;
    clearTimeout(startTimer);
    const url = String(current.stream || current.url || "");
    let en = "This stream could not play inside the browser.", ar = "الستريم ده مش راضي يشتغل جوه المتصفح.";
    const bad = unsupported();
    if (detail === "timeout") {
      en = "The stream timed out or is not supported.";
      ar = "الستريم مردش أو صيغته مش مدعومة.";
    } else if (detail === "dropped") {
      en = "The stream keeps dropping. The server may be busy or the line is in use elsewhere.";
      ar = "الستريم بيقطع كتير. ممكن السيرفر مشغول أو الاشتراك شغال في مكان تاني.";
    } else if (bad && engineMode() === "browser") {
      en = "This stream uses " + bad + ". Switch the player engine to Auto or Ultra to play it here.";
      ar = "الستريم ده بصيغة " + bad + ". خلّي محرّك التشغيل Auto أو Ultra من الإعدادات وهيشتغل هنا.";
    }
    const log = (current._log || []).concat(STEP_LABEL[step()] + ": " + describe(detail));
    show('<div class="usp-spin"></div><small>Checking the stream…</small>');
    const via = String(current._src || url).replace(/[?&]fresh=[^&]*$/, "");
    const server = /^https?:/i.test(via) ? await probe(/\/play\/[^?]+$/.test(via) ? via + "?fresh=probe" + Date.now().toString(36) : via) : "";
    if (my !== alive) return;
    if (/web page|empty reply|HTTP 4\d\d|HTTP 5\d\d|no answer/.test(server)) {
      en = "The stream server didn't send video to the website (it may only allow its own apps or one connection at a time).";
      ar = "سيرفر القناة مبعتش فيديو للموقع. ممكن يكون مش بيسمح غير لأجهزته أو لاتصال واحد في نفس الوقت.";
    }
    const href = vlcHref(current);
    show(
      `<b>Can't play here</b><div class="ar">${esc(ar)}</div><small>${esc(en)}</small>` +
        `<div class="usp-diag">${log.map((l) => "<div>" + esc(l) + "</div>").join("")}${server ? "<div>" + esc(server) + "</div>" : ""}</div>` +
        `<div class="usp-acts"><button type="button" class="usp-btn" data-retry>↻ Try again · جرّب تاني</button><a class="usp-btn" href="${esc(href)}"${/^data:/.test(href) ? ' download="ultra-stalker.m3u"' : ""}>▶ VLC</a><button type="button" class="usp-btn" data-copy>Copy link · انسخ الرابط</button></div>`,
      true,
    );
    const copy = msg.querySelector("[data-copy]");
    if (copy) copy.onclick = () => navigator.clipboard && navigator.clipboard.writeText(url).then(() => (copy.textContent = "Copied · اتنسخ"));
    const again = msg.querySelector("[data-retry]");
    if (again) again.onclick = () => restart(Object.assign({}, current, { _plan: null, _step: 0, _reconnects: 0, _log: [] }));
  }
  function stopEngine() {
    const e = eng;
    eng = null;
    if (e) e.destroy().catch(() => {});
    if (engBox) engBox.remove();
    engBox = null;
    if (video) video.style.visibility = "";
  }
  function resizeEngine() {
    if (eng && stage.clientWidth && stage.clientHeight) eng.resize(stage.clientWidth, stage.clientHeight);
  }
  function stop() {
    alive++;
    clearTimeout(startTimer);
    clearInterval(gate);
    const h = hls, t = ts;
    hls = ts = null;
    try {
      if (h) h.destroy();
    } catch (_) {}
    if (t) {
      // Let mpegts finish its own teardown first; its late callbacks then find nothing.
      try {
        t.pause();
        t.unload();
        t.detachMediaElement();
      } catch (_) {}
      setTimeout(() => {
        try {
          t.destroy();
        } catch (_) {}
      }, 2500);
    }
    stopEngine();
    stopVlc();
    pausedAt = 0;
    info = null;
    const n = box && box.querySelector(".usp-note");
    if (n) n.style.display = "none";
    if (menu) menu.classList.remove("on");
    if (unmuteBtn) unmuteBtn.classList.remove("on");
    started = false;
    lastT = 0;
    if (video) {
      video.removeAttribute("src");
      try {
        video.load();
      } catch (_) {}
    }
  }
  function close() {
    if (stage && document.fullscreenElement === stage) document.exitFullscreen().catch(() => {});
    if (box) {
      box.classList.remove("expanded");
      updateFullscreenButton();
    }
    stop();
    current = null;
    if (directWatch) directWatch.disconnect();
    if (document.body.classList.contains("usp-direct")) {
      document.body.classList.remove("usp-direct");
      const sheet = document.getElementById("playerSheet");
      if (sheet) {
        sheet.classList.add("hidden");
        sheet.setAttribute("aria-hidden", "true");
      }
    }
    clearInterval(tick);
    tick = 0;
    if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
    if (box) box.classList.add("hidden");
    document.documentElement.style.overflow = "";
  }

  function streamExt(ticket) {
    const url = String(ticket.stream || ticket.url || "");
    let ext = "";
    try {
      const outer = new URL(url);
      const inner = outer.searchParams.get("u");
      const actual = inner && /^https?:\/\//i.test(inner) ? new URL(inner) : outer;
      const m = actual.pathname.toLowerCase().match(/\.([a-z0-9]{2,4})$/);
      ext = m ? m[1] : "";
      const q = actual.search.match(/[?&](?:extension|output|type)=(ts|m3u8|hls|mp4|mkv)(?:&|$)/i);
      if (q) ext = q[1].toLowerCase() === "hls" ? "m3u8" : q[1].toLowerCase();
    } catch (_) {}
    if (!ext || !/^(ts|m3u8|mp4|mkv|m4v|mov|webm|avi|flv|mpg|mpeg)$/.test(ext)) ext = ticket.live ? "ts" : "mp4";
    return ext;
  }
  async function startEngine(ticket, src, my, soft) {
    await lib(HERE + "vendor/libmedia/avplayer.js");
    if (my !== alive) return;
    const AV = window.AVPlayer && (window.AVPlayer.default || window.AVPlayer);
    if (!AV) throw new Error("engine unavailable");
    engBox = document.createElement("div");
    engBox.className = "usp-engine";
    stage.insertBefore(engBox, msg);
    video.style.visibility = "hidden";
    // Hardware first, software if that fails — like VLC's avcodec-hw then none.
    // The engine decodes everything itself (WebCodecs hardware, else WebAssembly) and never
    // hands the stream back to the browser's own player: that path is what already failed
    // (e.g. 4K HEVC/HDR with MP2 sound -> "the element has no supported sources").
    eng = new AV({ container: engBox, wasmBaseUrl: ENGINE_WASM, isLive: !!ticket.live, enableHardware: !soft, enableWebCodecs: !soft, enableWorker: true, lowLatency: false, preLoadTime: ticket.live ? bufferSecs() : 4, enableJitterBuffer: !!ticket.live, jitterBufferMin: ticket.live ? Math.max(1, bufferSecs() - 1) : undefined, jitterBufferMax: ticket.live ? bufferSecs() * 2 + 2 : undefined, checkUseMSE: () => false });
    const me = eng;
    const onErr = (e) => {
      if (my !== alive || eng !== me) return;
      if (started && ticket.live) return reconnect("engine");
      if (!escalate(String((e && e.message) || e || "engine"))) fail(String((e && e.message) || e));
    };
    eng.on("error", onErr);
    eng.on("timeout", onErr);
    eng.on("ended", () => my === alive && (ticket.live ? reconnect("ended") : refresh()));
    eng.on("firstVideoRendered", () => {
      if (my !== alive) return;
      resizeEngine();
      onStarted();
    });
    eng.on("firstAudioRendered", () => my === alive && setTimeout(() => my === alive && onStarted(), 1500));
    // The engine picks its demuxer from the file extension; relay links (/p?u=…) have
    // none, so tell it what the original link was (ts, m3u8, mp4, mkv…).
    await eng.load(src, { isLive: !!ticket.live, ext: streamExt(ticket) });
    if (my !== alive) return;
    A.setFit(store.get("us-fit", "fit") === "fill" ? "fill" : "fit");
    A.applyVol();
    try {
      await eng.play();
    } catch (e) {
      if (my !== alive) return;
      if (e && e.name === "NotAllowedError") return askTap(() => eng && eng.play().then(() => eng.resume && eng.resume()));
      throw e;
    }
    if (my !== alive) return;
    if (store.get("us-subs", "1") === "0") {
      try {
        eng.setSubtitleEnable(false);
      } catch (_) {}
    }
    setTimeout(() => my === alive && eng === me && !started && eng.getStatus() >= 5 && onStarted(), 2500);
  }

  /* ------------------------------------------------------------------ VLC (program only) */
  async function startVlc(ticket, src, my) {
    if (!hasVlc()) throw new Error("VLC isn't available");
    vlcOn = true;
    vs = { paused: false, time: 0, length: 0 };
    stage.classList.add("vlcmode");
    const url = new URL(src, location.href).href;
    const r = await NV.play({
      url,
      live: !!ticket.live,
      caching: Math.round((ticket.live ? bufferSecs() : 3) * 1000),
      volume: A.muted() ? 0 : Math.round(A.vol() * 256),
      fit: store.get("us-fit", "fit"),
      subs: store.get("us-subs", "1") === "1",
    });
    if (my !== alive) return;
    if (!r || !r.ok) throw new Error((r && r.error) || "couldn't start");
    ticket._vlcRetry = ticket._vlcRetry || 0;
    if (r.version) vs.version = r.version;
    const t0 = Date.now();
    clearInterval(vlcPoll);
    vlcPoll = setInterval(async () => {
      let s;
      try {
        s = await NV.status();
      } catch (_) {
        return;
      }
      if (my !== alive || !vlcOn || !s) return;
      const keep = { atracks: vs.atracks, stracks: vs.stracks, version: vs.version };
      vs = Object.assign(keep, s, { paused: s.state === "paused" });
      if (!started && /playing|paused/.test(s.state) && (s.time > 0 || (s.info && s.info.width))) onStarted();
      const over = /stopped|ended|error/.test(s.state) && Date.now() - t0 > 2500;
      if (over && started && ticket.live) return reconnect("ended");
      if (over && !started) {
        clearInterval(vlcPoll);
        const why = s.error || "couldn't open this stream";
        // One more try first: the line may still have been busy with the last channel.
        if (!ticket._vlcRetry) {
          show('<div class="usp-spin"></div><small>VLC · trying again</small>');
          setTimeout(() => my === alive && restart(Object.assign({}, current, { _vlcRetry: 1, _vlcWhy: why })), 1500);
          return;
        }
        if (!escalate(why)) fail(why);
      }
      if (over && started && !ticket.live) refresh();
    }, 600);
    placeVlc();
  }
  async function vlcTracks() {
    if (!vlcOn) return;
    const my = alive;
    try {
      const t = await NV.tracks();
      if (my !== alive || !vs || !t) return;
      vs.atracks = (t.audio || []).filter((x) => x.id >= 0).map((x, i) => ({ id: x.id, on: x.on, label: trackLabel({ title: x.name }, i) }));
      vs.stracks = (t.subs || []).filter((x) => x.id >= 0).map((x, i) => ({ id: x.id, on: x.on, label: trackLabel({ title: x.name }, i) }));
      if (menu && menu.classList.contains("on")) openMenu(menu.dataset.kind);
    } catch (_) {}
  }
  /* Keep VLC's picture exactly over the free part of the player: above the control bar,
     left of the settings panel, hidden while something else covers the player. */
  function vlcRect() {
    if (!box || box.classList.contains("hidden") || !started || document.hidden) return null;
    if (msg && msg.style.display !== "none" && msg.classList.contains("err")) return null;
    const r = stage.getBoundingClientRect();
    if (r.width < 40 || r.height < 40) return null;
    let right = r.right, bottom = r.bottom;
    const b = bar.getBoundingClientRect();
    if (b.height && b.top > r.top) bottom = Math.min(bottom, b.top - 2);
    if (menu.classList.contains("on")) {
      const m = menu.getBoundingClientRect();
      if (m.width) right = Math.min(right, m.left - 6);
    }
    const x = Math.max(r.left, 0), y = Math.max(r.top, 0);
    right = Math.min(right, innerWidth);
    bottom = Math.min(bottom, innerHeight);
    if (right - x < 40 || bottom - y < 40) return null;
    // something else on top (a list, a dialog, the side menu)?
    const pts = [[(x + right) / 2, (y + bottom) / 2], [x + 8, y + 8], [right - 8, y + 8], [x + 8, bottom - 8], [right - 8, bottom - 8]];
    for (const [px, py] of pts) {
      const el = document.elementFromPoint(px, py);
      if (el && !stage.contains(el)) return null;
      if (el && el.closest(".usp-menu,.usp-note,.usp-unmute")) return null;
    }
    return { x: Math.round(x), y: Math.round(y), w: Math.round(right - x), h: Math.round(bottom - y) };
  }
  function placeVlc() {
    clearInterval(vlcPlace);
    const go = () => {
      if (!vlcOn) return;
      const r = vlcRect();
      const key = r ? r.x + "," + r.y + "," + r.w + "," + r.h : "";
      if (key === vlcLast) return;
      vlcLast = key;
      NV.place(r);
    };
    vlcPlace = setInterval(go, 150);
    go();
  }
  function stopVlc() {
    clearInterval(vlcPoll);
    clearInterval(vlcPlace);
    if (stage) stage.classList.remove("vlcmode");
    if (!vlcOn) return;
    vlcOn = false;
    vlcLast = "";
    vs = null;
    NV.place(null);
    NV.stop();
  }
  /* Stop: end the stream but stay on the page (the line is freed). */
  function halt() {
    if (!current || current._halted) return;
    const t = Object.assign({}, current);
    if (!box.classList.contains("docked")) return close();
    stop();
    current = Object.assign({}, t, { _halted: true });
    show(`<button type="button" class="usp-ic pp" style="pointer-events:auto;width:64px;height:64px" aria-label="Play">${I.play}</button><small>Stopped · متوقف</small>`);
    const b = msg.querySelector(".pp");
    if (b) b.onclick = (e) => (e.stopPropagation(), resume());
    refresh();
  }
  function resume() {
    if (!current) return;
    const t = Object.assign({}, current, { _halted: false, _reconnects: 0 });
    restart(t);
  }

  async function startNative(ticket, src, my) {
    const ext = streamExt(ticket);
    A.applyVol();
    if (ext === "m3u8") {
      await startHls(ticket, src, my);
      if (my !== alive) return;
    } else if (ext === "ts") {
      await lib(HERE + "vendor/mpegts.min.js");
      if (my !== alive) return;
      const M = window.mpegts;
      if (!M || !M.isSupported()) video.src = src;
      else {
        const ds = { type: "mpegts", isLive: !!ticket.live, url: src };
        if (ticket._noAudio) ds.hasAudio = false;
        ts = M.createPlayer(ds, { enableStashBuffer: true, stashInitialSize: 512 * 1024, liveBufferLatencyChasing: false, liveSync: false, lazyLoad: !ticket.live, autoCleanupSourceBuffer: true, autoCleanupMaxBackwardDuration: 60, autoCleanupMinBackwardDuration: 30 });
        ts.on(M.Events.MEDIA_INFO, (mi) => {
          if (my !== alive) return;
          info = { videoCodec: mi && mi.videoCodec, audioCodec: ticket._noAudio ? "" : mi && mi.audioCodec, hasVideo: mi && mi.hasVideo, fps: mi && mi.fps, width: mi && mi.width, height: mi && mi.height, channels: mi && mi.audioChannelCount };
          if (unsupported()) escalate("codec") || fail();
        });
        ts.on(M.Events.ERROR, (type, detail) => {
          if (my !== alive) return;
          if (/MSE|Media/i.test(String(detail || type))) return escalate("media") || fail(String(detail || type));
          if (started && ticket.live) return reconnect("network");
          if (/network/i.test(String(type)) && retryViaRelay()) return;
          escalate(String(detail || type)) || fail(String(detail || type));
        });
        ts.attachMediaElement(video);
        ts.load();
      }
    } else video.src = src;
    if (ticket.live && ts) {
      // let a few seconds build up before the first frame
      await new Promise((r) => setTimeout(r, 120));
      if (my !== alive) return;
      const t0 = Date.now();
      await new Promise((r) => {
        const iv = setInterval(() => {
          if (my !== alive || ahead() >= bufferSecs() || Date.now() - t0 > 9000) {
            clearInterval(iv);
            r();
          }
        }, 150);
      });
      if (my !== alive) return;
    }
    const p = video.play();
    if (p && p.catch)
      p.catch((e) => {
        if (my !== alive || started || !e || e.name !== "NotAllowedError") return;
        // Autoplay with sound refused: start muted, one tap brings the sound back.
        video.muted = true;
        video.play().catch(() => my === alive && !started && askTap(() => video.play()));
      });
  }

  async function startHls(ticket, src, my) {
    const nativeHls = video.canPlayType("application/vnd.apple.mpegurl");
    if (!ticket._nativeHls && (window.MediaSource || window.ManagedMediaSource || !nativeHls)) {
      try {
        await lib(HERE + "vendor/hls.min.js");
      } catch (error) {
        if (!nativeHls) throw error;
      }
      if (my !== alive) return;
      const H = window.Hls;
      if (H?.isSupported()) {
        const player = hls = new H({ autoStartLoad: false, lowLatencyMode: false, maxBufferLength: 30, manifestLoadingMaxRetry: 3, levelLoadingMaxRetry: 4, fragLoadingMaxRetry: 6 });
        player.on(H.Events.MANIFEST_PARSED, () => {
          if (my !== alive) return;
          const selected = ticket._quality ? player.levels.findIndex((level) => qualityKey(level) === ticket._quality) : -1;
          if (selected >= 0) {
            player.startLevel = selected;
            player.loadLevel = selected;
          } else ticket._quality = "";
          player.startLoad(ticket._resumeAt > 1 ? ticket._resumeAt : -1);
        });
        player.on(H.Events.LEVEL_SWITCHED, (_, data) => {
          if (my !== alive) return;
          const level = player.levels[data.level];
          if (level) info = { videoCodec: level.videoCodec, audioCodec: level.audioCodec, width: level.width, height: level.height, fps: level.frameRate };
        });
        player.on(H.Events.ERROR, (_, data) => {
          if (!data?.fatal || my !== alive) return;
          const network = data.type === H.ErrorTypes.NETWORK_ERROR;
          if (network && !started && retryViaRelay()) return;
          if (network && started && ticket.live) return reconnect("network");
          tryNativeHls() || escalate(data.details) || fail(data.details);
        });
        player.loadSource(src);
        player.attachMedia(video);
        return;
      }
    }
    if (!nativeHls) throw new Error("HLS playback is unavailable in this browser");
    video.src = src;
  }

  /* The browser refused to start playback by itself (autoplay blocked): that is not a
     broken stream, so stop the clock and ask for one tap. */
  function askTap(go) {
    clearTimeout(startTimer);
    show('<button type="button" class="usp-ic pp" style="pointer-events:auto;width:72px;height:72px" aria-label="Play">' + I.play + '</button><small>Tap to play · دوس للتشغيل</small>');
    const b = msg.querySelector(".pp");
    if (b)
      b.onclick = (e) => {
        e.stopPropagation();
        show('<div class="usp-spin"></div>');
        Promise.resolve(go()).catch(() => {});
      };
  }
  /* opts.host: play inside that element (the Live TV screen) instead of the pop-up.
     opts.key: a stable id for remembering how this stream plays.
     opts.onPrev / opts.onNext: channel zapping for live. */
  async function play(ticket, o) {
    build();
    stop();
    o = o || {};
    if (!o._again) opts = o;
    const host = opts.host;
    if (host) {
      if (box.parentNode !== host) host.appendChild(box);
      box.classList.add("docked");
    } else if (box.classList.contains("docked") || box.parentNode !== document.body) {
      box.classList.remove("docked");
      document.body.appendChild(box);
    }
    const my = alive;
    ticket = Object.assign({}, ticket);
    if (!opts.key) opts.key = String(ticket.item || ticket.id || ticket.title || "");
    if (!ticket._plan) {
      ticket._plan = planFor(ticket, opts.key);
      ticket._step = 0;
      ticket._log = [];
    }
    current = ticket;
    const how = step();
    ticket._noAudio = how === "mute";
    const url = String(ticket.stream || ticket.url || "");
    const headers = ticket.headers || {};
    title.textContent = ticket.title || "Ultra Stalker";
    sub.textContent = (ticket.live ? "Live · " : "") + STEP_LABEL[how];
    const href = vlcHref(ticket);
    vlc.href = href;
    if (/^data:/.test(href)) vlc.setAttribute("download", "ultra-stalker.m3u");
    else vlc.removeAttribute("download");
    box.classList.remove("hidden");
    if (!host) document.documentElement.style.overflow = "hidden";
    if (!ticket._reconnects || !msg.innerHTML) show('<div class="usp-spin"></div>' + (how === "engine" || how === "soft" ? "<small>Ultra engine</small>" : how === "vlc" ? "<small>VLC</small>" : ""));
    stage.classList.remove("idle");
    refresh();
    if (!tick) tick = setInterval(watchdog, 1000);
    // A stream that never shows a picture: try the next way, then explain.
    startTimer = setTimeout(() => {
      if (my !== alive || started) return;
      if (how === "native" && video.readyState >= 2 && video.paused) return askTap(() => video.play());
      tryNativeHls() || escalate("timeout") || fail("timeout");
    }, how === "native" ? START_TIMEOUT : how === "vlc" ? START_TIMEOUT + 35000 : START_TIMEOUT + 8000);
    let src = (ticket.ticket || (!ticket._viaRelay && /^https:/i.test(url) && !Object.keys(headers).length)) ? url : viaRelay(url, headers);
    // Retries ask the relay for a fresh portal link (live links usually work once).
    if ((ticket._step || ticket._reconnects || ticket._nativeHls) && /\/play\/[^?]+$/.test(src)) src += "?fresh=" + Date.now().toString(36);
    // Give the previous connection a moment to close: many lines allow one stream at a time.
    if (o._again && ticket.live) await new Promise((r) => setTimeout(r, 700));
    if (my !== alive) return;
    ticket._src = src;
    try {
      if (how === "vlc") await startVlc(ticket, src, my);
      else if (how === "engine" || how === "soft") await startEngine(ticket, src, my, how === "soft");
      else await startNative(ticket, src, my);
    } catch (e) {
      if (my !== alive) return;
      const reason = String((e && e.message) || e);
      if (/failed to fetch|networkerror|cors/i.test(reason) && retryViaRelay()) return;
      if (!escalate(reason)) fail(reason);
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
  /* Computer: Play starts the stream in the page straight away (no chooser sheet).
     pending() runs when the page starts preparing a stream, offer() when it is ready. */
  const direct = () => document.body.classList.contains("desk");
  let directWatch = null;
  function pending() {
    const a = document.getElementById("playerWeb");
    if (a) {
      a.classList.add("unavailable");
      a.setAttribute("aria-disabled", "true");
      a.removeAttribute("href");
      a.onclick = null;
    }
    if (!direct()) return;
    document.body.classList.add("usp-direct");
    build();
    stop();
    current = { title: "Preparing stream…", _plan: ["native"], _step: 0 };
    opts = {};
    if (box.classList.contains("docked") || box.parentNode !== document.body) {
      box.classList.remove("docked");
      document.body.appendChild(box);
    }
    title.textContent = "Preparing stream…";
    sub.textContent = "";
    box.classList.remove("hidden");
    document.documentElement.style.overflow = "hidden";
    show('<div class="usp-spin"></div>');
    const subEl = document.getElementById("playerSheetSub");
    if (directWatch) directWatch.disconnect();
    if (subEl) {
      const check = () => {
        const t = subEl.textContent || "";
        if (/preparing stream|choose a player/i.test(t)) {
          const name = t.split(" • ")[0];
          if (name && current && !current.stream) title.textContent = name;
          return;
        }
        // The page could not prepare the stream: say why in the player.
        directWatch.disconnect();
        if (current && !current.stream) show(`<b>Can't open this</b><small>${esc(t)}</small>`, true);
      };
      directWatch = new MutationObserver(check);
      directWatch.observe(subEl, { childList: true, characterData: true, subtree: true });
    }
  }
  function offer(ticket) {
    const a = document.getElementById("playerWeb");
    if (direct()) {
      if (directWatch) directWatch.disconnect();
      const sheet = document.getElementById("playerSheet");
      if (sheet) {
        sheet.classList.add("hidden");
        sheet.setAttribute("aria-hidden", "true");
      }
      if (box && !box.classList.contains("hidden") && current && !current.stream) play(ticket);
    }
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
  function updateFullscreenButton() {
    const active = box.classList.contains("expanded") || document.fullscreenElement === stage;
    const button = bar.querySelector(".full");
    button.innerHTML = active ? I.exitFull : I.full;
    button.setAttribute("aria-label", active ? "Exit full screen" : "Full screen (F)");
    button.setAttribute("aria-pressed", String(active));
  }
  async function fullscreen() {
    if (!box || box.classList.contains("hidden")) return;
    if (box.classList.contains("expanded")) {
      box.classList.remove("expanded");
      updateFullscreenButton();
      return;
    }
    if (document.fullscreenElement === stage) return document.exitFullscreen().catch(() => {});
    if (stage.requestFullscreen && document.fullscreenEnabled !== false) {
      try {
        await stage.requestFullscreen();
        if (document.fullscreenElement === stage) return;
      } catch (_) {
        // The player can still fill the browser viewport if fullscreen is denied.
      }
    }
    if (box.classList.contains("hidden")) return;
    box.classList.add("expanded");
    updateFullscreenButton();
  }
  window.USPlayer = { play, offer, pending, close, vlcHref, fullscreen, video: () => video, engine: () => step(), facts };
})();
