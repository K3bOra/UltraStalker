/* Ultra Stalker Web — computer layout.

   On wide screens the receiver's Browse page becomes a full-screen app: a premium
   menu on the right (like Ultra Quran), the content using the whole width, and
   big poster walls you scroll through. The page's own elements are moved, not
   copied, so all of the receiver page's code keeps working unchanged. Phones keep
   the original layout. */
(function () {
  "use strict";
  const WIDE = window.matchMedia("(min-width: 1100px)");
  if (!WIDE.matches || /[?&]phone=1/.test(location.search)) return;
  WIDE.addEventListener("change", () => location.reload());
  const $ = (id) => document.getElementById(id);
  const ICON = {
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="M12 2.8l2.8 5.9 6.4.9-4.7 4.5 1.2 6.4L12 17.4l-5.7 3.1 1.2-6.4L2.8 9.6l6.4-.9z"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    servers: '<svg viewBox="0 0 24 24"><rect x="3.5" y="4" width="17" height="6.5" rx="2"/><rect x="3.5" y="13.5" width="17" height="6.5" rx="2"/><path d="M7 7.3h.01M7 16.8h.01"/></svg>',
    backup: '<svg viewBox="0 0 24 24"><path d="M6.5 17.5a4.5 4.5 0 0 1 .6-9 6 6 0 0 1 11.6 1.6 3.7 3.7 0 0 1 .3 7.4"/><path d="M12 11v9"/><path d="m8.6 16.6 3.4 3.4 3.4-3.4"/></svg>',
    home: '<svg viewBox="0 0 24 24"><path d="M3 10.8 12 3l9 7.8"/><path d="M5.6 9.6V21h12.8V9.6"/></svg>',
  };
  const NAV = [
    ["portals", "Portals", "البورتالات", '<svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/></svg>'],
    ["itv", "Live TV", "البث المباشر", '<img src="ui/live.png" alt="">'],
    ["vod", "Movies", "الأفلام", '<img src="ui/movies.png" alt="">'],
    ["series", "Series", "المسلسلات", '<img src="ui/series.png" alt="">'],
    ["search", "Search", "البحث", ICON.search],
    ["fav", "Favorites", "المفضلة", ICON.star],
  ];

  let BROWSE = false;
  // Cinematic details: mark rating / year chips and give episode cards artwork.
  function decorateDetails() {
    document.querySelectorAll(".series-cinematic .series-chip:not([data-dk])").forEach((c) => {
      c.dataset.dk = "1";
      const t = c.textContent.trim();
      if (t.startsWith("★")) c.classList.add("dk-gold");
      else if (/^(19|20)\d\d$/.test(t)) c.classList.add("dk-year");
    });
    decorateSeasons();
    const cards = document.querySelectorAll("#seriesOverview .inline-episode:not([data-dk])");
    if (!cards.length) return;
    const bg = document.getElementById("seriesBackdrop");
    const poster = document.getElementById("seriesPoster");
    const art = (seriesExtra && seriesExtra.backdrop) || (bg && bg.dataset.backdropState === "ready" && bg.src ? bg.src : poster && poster.src);
    let season = 0;
    cards.forEach((b) => {
      b.dataset.dk = "1";
      if (art) b.style.setProperty("--ep-bg", 'url("' + String(art).replace(/"/g, "%22") + '")');
      const code = (b.querySelector("small") || {}).textContent || "";
      const m = /E(\d+)/.exec(code);
      const sm = /S(\d+)/.exec(code);
      if (sm) season = +sm[1];
      if (m) b.dataset.ep = String(+m[1]);
      const n = document.createElement("span");
      n.className = "dk-ep-n";
      n.textContent = m ? m[1] : "";
      const play = document.createElement("span");
      play.className = "dk-ep-play";
      b.prepend(n, play);
    });
    episodeStills([...cards], season || 1);
  }

  /* Seasons as poster cards (TMDB season posters, else the series poster). */
  function decorateSeasons() {
    const list = (seriesExtra && seriesExtra.seasonsList) || [];
    const fallback = (seriesExtra && seriesExtra.poster) || ($("seriesPoster") || {}).src || "";
    document.querySelectorAll("#seriesSeasonStack .series-season-btn").forEach((b) => {
      const strong = b.querySelector("strong");
      const m = /(\d+)/.exec((strong && strong.textContent) || "");
      const n = m ? +m[1] : 0;
      const info = list.find((x) => x.n === n) || null;
      const art = (info && info.poster) || fallback;
      const sig = n + "|" + art;
      if (b.dataset.dkSeason === sig) return;
      b.dataset.dkSeason = sig;
      b.classList.add("dk-season");
      let pic = b.querySelector(".dk-season-art");
      if (!pic) {
        pic = document.createElement("span");
        pic.className = "dk-season-art";
        pic.innerHTML = '<i class="dk-season-n"></i>';
        b.prepend(pic);
      }
      pic.style.backgroundImage = art ? 'url("' + String(art).replace(/"/g, "%22") + '")' : "";
      pic.querySelector(".dk-season-n").textContent = n ? String(n).padStart(2, "0") : "";
      let yr = b.querySelector(".dk-season-year");
      if (info && info.year) {
        if (!yr) {
          yr = document.createElement("em");
          yr.className = "dk-season-year";
          b.appendChild(yr);
        }
        yr.textContent = info.year;
      }
    });
  }

  /* TMDB extras: title logo, cast and episode stills. */
  let seriesExtra = null;
  const SEASONS = new Map();
  async function episodeStills(cards, season) {
    const ex = seriesExtra;
    if (!ex || !ex.tmdb || !window.USEngine.tmdbGet) return;
    const key = ex.tmdb + ":" + season;
    if (!SEASONS.has(key)) SEASONS.set(key, window.USEngine.tmdbGet("tv/" + ex.tmdb + "/season/" + season, { language: "ar" }));
    const data = await SEASONS.get(key);
    if (!data || !Array.isArray(data.episodes) || seriesExtra !== ex) return;
    const byNum = new Map(data.episodes.map((e) => [e.episode_number, e]));
    cards.forEach((b) => {
      const e = byNum.get(+b.dataset.ep);
      if (!e) return;
      if (e.still_path) b.style.setProperty("--ep-bg", 'url("https://image.tmdb.org/t/p/w500' + e.still_path + '")');
      const name = String(e.name || "").trim();
      if (name && !/^(الحلقة|episode)\s*\d+$/i.test(name) && !b.querySelector(".dk-ep-name")) {
        const t = document.createElement("span");
        t.className = "dk-ep-name";
        t.textContent = name;
        b.querySelector("strong").after(t);
      }
    });
  }
  function esc(t) {
    return String(t || "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]);
  }
  function showExtras(ex) {
    const stage = $(ex.media === "series" ? "seasonsStage" : "movieStage");
    if (!stage) return;
    if (ex.media === "series") {
      seriesExtra = ex;
      decorateSeasons();
    }
    const info = stage.querySelector(".series-info");
    const content = stage.querySelector(".series-cinematic-content");
    stage.querySelectorAll(".dk-logo,.dk-cast").forEach((n) => n.remove());
    info.classList.remove("dk-has-logo");
    if (ex.logo) {
      const img = new Image();
      img.className = "dk-logo";
      img.alt = "";
      img.onload = () => info.classList.add("dk-has-logo");
      img.onerror = () => img.remove();
      img.src = ex.logo;
      info.querySelector("h3").before(img);
    }
    const cast = (ex.cast || []).filter((c) => c.name).slice(0, 12);
    if (cast.length) {
      const box = document.createElement("div");
      box.className = "dk-cast";
      box.innerHTML =
        '<div class="dk-cast-h">Cast · الأبطال</div><div class="dk-cast-row">' +
        cast
          .map(
            (c) =>
              `<div class="dk-person"><span class="dk-face">${c.photo ? `<img loading="lazy" src="${esc(c.photo)}" alt="">` : `<i>${esc(c.name.trim()[0] || "")}</i>`}</span><b>${esc(c.name)}</b><small>${esc(c.role)}</small></div>`
          )
          .join("") +
        "</div>";
      content.appendChild(box);
    }
  }
  document.addEventListener("us-details", (e) => {
    if (document.body.classList.contains("desk")) showExtras(e.detail || {});
  });

  function build() {
    BROWSE = !!document.getElementById("browseAccount");
    document.body.classList.add("desk", BROWSE ? "desk-browse" : "desk-sources");
    const side = document.createElement("aside");
    side.className = "dk-side";
    side.innerHTML =
      '<a class="dk-brand" href="index.html" title="Ultra Stalker"><img src="brand-logo.webp" alt="Ultra Stalker"><span>From anywhere · من أي مكان</span></a>' +
      (BROWSE ? '<div class="dk-source" id="dkSource"><div class="dk-label">Saved source <span>المصدر</span></div></div>' : "") +
      '<nav class="dk-nav" id="dkNav">' +
      NAV.map(([k, en, ar, ic]) => `<button type="button" data-go="${k}"><span class="dk-ic">${ic}</span><span class="dk-tx"><b>${en}</b><small>${ar}</small></span></button>`).join("") +
      "</nav>" +
      '<div class="dk-sep"><i></i></div>' +
      '<nav class="dk-nav dk-tools">' +
      `<a href="sources.html#connectionPanel" data-sec="connectionPanel"><span class="dk-ic">${ICON.plus}</span><span class="dk-tx"><b>Add Connection</b><small>إضافة مصدر</small></span></a>` +
      `<a href="sources.html#managerPanel" data-sec="managerPanel"><span class="dk-ic">${ICON.servers}</span><span class="dk-tx"><b>Manage Servers</b><small>إدارة السيرفرات</small></span></a>` +
      `<a href="sources.html#backupPanel" data-sec="backupPanel"><span class="dk-ic">${ICON.backup}</span><span class="dk-tx"><b>Backup &amp; Restore</b><small>باك اب الرسيفر</small></span></a>` +
      "</nav>" +
      '<div class="dk-credit"><small>Design &amp; development · تصميم وتطوير</small><b>Ahmed L-HadarY</b><span id="dkVer"></span></div>';
    document.body.appendChild(side);

    if (!BROWSE) {
      // Sources & Backup page: the menu goes back to Browse, tools scroll to their panel.
      $("dkNav").addEventListener("click", (e) => {
        const b = e.target.closest("button[data-go]");
        if (b) location.href = "index.html" + (b.dataset.go === "search" ? "" : "");
      });
      document.querySelectorAll(".dk-tools a[data-sec]").forEach((a) =>
        a.addEventListener("click", (e) => {
          const el = document.getElementById(a.dataset.sec);
          if (!el) return;
          e.preventDefault();
          history.replaceState(null, "", "#" + a.dataset.sec);
          el.scrollIntoView({ behavior: "smooth", block: "start" });
          markTool();
        }),
      );
      const markTool = () => document.querySelectorAll(".dk-tools a").forEach((a) => a.classList.toggle("on", "#" + a.dataset.sec === (location.hash || "#connectionPanel")));
      markTool();
      return;
    }
    // The source picker moves into the menu.
    const field = document.querySelector(".source-field");
    if (field) $("dkSource").appendChild(field);
    const ver = document.querySelector(".footer");
    if (ver) $("dkVer").textContent = ver.textContent.replace(/^Ultra Stalker\s*·\s*/, "");

    // A top bar over the content: where you are, and a wide search.
    const top = document.createElement("header");
    top.className = "dk-top";
    top.innerHTML = '<div class="dk-where"><small id="dkKicker">Ultra Stalker</small><h1 id="dkTitle">Browse</h1><span id="dkSub"></span></div><div class="dk-search" id="dkSearch"></div>';
    const shell = document.querySelector("main.shell");
    shell.parentNode.insertBefore(top, shell);
    const sb = document.querySelector(".search-box");
    if (sb) {
      $("dkSearch").appendChild(sb);
      const input = $("browseSearch");
      input.placeholder = "Search movies and series…  ·  ابحث عن فيلم أو مسلسل";
    }

    // Welcome wall when no source is chosen: every saved source as a big card.
    const welcome = document.createElement("section");
    welcome.className = "dk-welcome";
    welcome.id = "dkWelcome";
    shell.parentNode.insertBefore(welcome, shell);

    $("dkNav").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-go]");
      if (!b) return;
      const go = b.dataset.go;
      if (go === "portals") {
        $("sourceHomeBtn").click();
        return;
      }
      if (go === "search") {
        const i = $("browseSearch");
        i.focus();
        i.select();
        return;
      }
      if (!$("browseAccount").value) {
        flash();
        return;
      }
      if (go === "fav") $("favoritesBtn").click();
      else {
        const t = document.querySelector(`.type[data-media="${go}"]`);
        if (t) t.click();
      }
    });
  }

  function flash() {
    const s = $("dkSource");
    s.classList.remove("flash");
    void s.offsetWidth;
    s.classList.add("flash");
  }

  function drawWelcome() {
    const box = $("dkWelcome");
    if (!box) return;
    const sel = $("browseAccount");
    const opts = [...sel.options].filter((o) => o.value);
    const kinds = { portal: "Stalker Portal", xtream: "Xtream Codes", m3u: "M3U Playlist" };
    const icons = { portal: "ui/live.png", xtream: "ui/movies.png", m3u: "ui/series.png" };
    const host = (id) => {
      try {
        const p = window.USEngine.findProfile(id);
        const k = window.USEngine.profileKind(p);
        const u = new URL(p.portal);
        return { host: u.host, mac: k === "portal" ? p.mac : k === "xtream" ? u.searchParams.get("username") || "" : "" };
      } catch (_) {
        return { host: "", mac: "" };
      }
    };
    box.innerHTML =
      '<div class="dk-hero"><div class="dk-hero-copy"><small>Ultra Stalker · Web</small><h2>Your sources, everywhere.</h2>' +
      '<p>Live TV, movies and series from your own Portal, Xtream and M3U servers — on any computer.</p>' +
      '<p class="ar">مصادرك في أي مكان: البث المباشر والأفلام والمسلسلات من سيرفراتك على أي كمبيوتر.</p></div>' +
      '<img src="brand-logo.webp" alt=""></div>' +
      (opts.length
        ? '<div class="dk-row-h"><h3>Portals <span>البورتالات</span></h3><span>' + opts.length + " saved · <a href=\"sources.html#connectionPanel\">＋ Add</a></span></div>" +
          '<div class="dk-sources">' +
          opts
            .map((o) => {
              const k = String(o.dataset.kind || "portal");
              const h = host(o.value);
              const safe = (t) => String(t || "").replace(/[<>&"]/g, "");
              return `<button type="button" class="dk-src ${k}" data-v="${o.value}">
                <span class="dk-src-art"><img src="${icons[k] || icons.portal}" alt=""></span>
                <span class="dk-src-k">${kinds[k] || "Portal"}</span>
                <b>${safe(o.textContent)}</b>
                <span class="dk-src-host" dir="ltr">${safe(h.host)}</span>
                ${h.mac ? `<span class="dk-src-id" dir="ltr">${safe(h.mac)}</span>` : ""}
                <span class="dk-src-go">Open portal <i>›</i></span></button>`;
            })
            .join("") +
          "</div>"
        : '<div class="dk-empty"><b>No saved sources yet</b><span>لسه مفيش مصادر. ضيف بورتال أو Xtream أو M3U، أو ارفع باك اب الرسيفر.</span>' +
          '<div><a class="dk-btn" href="sources.html#connectionPanel">＋ Add Connection</a><a class="dk-btn ghost" href="sources.html#backupPanel">⇩ Load receiver backup</a></div></div>');
    box.onclick = (e) => {
      const b = e.target.closest(".dk-src");
      if (!b) return;
      sel.value = b.dataset.v;
      sel.dispatchEvent(new Event("change"));
    };
  }

  const visible = (id) => {
    const el = $(id);
    return el && !el.classList.contains("hidden");
  };
  /* ------------------------------------------------ Live TV screen */
  const tv = { on: false, id: "", timer: 0, gen: 0 };
  function tvBuild() {
    if ($("dkTv")) return;
    const stage = $("itemsStage");
    const panel = document.createElement("div");
    panel.id = "dkTv";
    panel.className = "dk-tv";
    panel.innerHTML =
      '<div class="dk-tv-screen" id="dkTvScreen"><div class="dk-tv-idle"><img src="brand-logo.webp" alt=""><b>Choose a channel</b><span>اختار قناة من القايمة</span></div></div>' +
      '<div class="dk-tv-info" id="dkTvInfo">' +
      '<div class="dk-tv-ch"><span class="dk-tv-logo" id="dkTvLogo"></span><div class="dk-tv-name"><small>LIVE · مباشر</small><b id="dkTvName">—</b></div>' +
      '<div class="dk-tv-acts"><a class="dk-tv-btn" id="dkTvVlc">▶ VLC</a><button type="button" class="dk-tv-btn" id="dkTvFull" title="Full screen">⛶</button></div></div>' +
      '<div class="dk-tv-epg" id="dkTvEpg"></div></div>';
    const list = document.createElement("div");
    list.id = "dkTvList";
    list.className = "dk-tv-list";
    stage.querySelector(".items-head").after(panel);
    panel.after(list);
    list.appendChild($("browseItems"));
    list.appendChild($("itemInfinite"));
    $("dkTvFull").onclick = () => window.USPlayer.fullscreen();
    // The screen and the list fit the window: keep the page itself at the top.
    window.addEventListener("scroll", () => tv.on && window.scrollY > 0 && window.scrollTo(0, 0), { passive: true });
    // Channels play on the screen instead of opening the player chooser.
    $("browseItems").addEventListener(
      "click",
      (e) => {
        if (!tv.on) return;
        const card = e.target.closest(".live-card");
        if (!card || e.target.closest(".favorite-action")) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        tune(card);
      },
      true
    );
    $("browseItems").addEventListener(
      "keydown",
      (e) => {
        if (!tv.on || e.key !== "Enter") return;
        const card = e.target.closest(".live-card");
        if (!card) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        tune(card);
      },
      true
    );
    document.addEventListener("keydown", (e) => {
      if (!tv.on || !tv.id || !/^(ArrowUp|ArrowDown|PageUp|PageDown)$/.test(e.key)) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || "")) return;
      const cards = [...document.querySelectorAll("#browseItems .live-card")];
      const i = cards.findIndex((c) => c.dataset.item === tv.id);
      const next = cards[i + (/Down/.test(e.key) ? 1 : -1)];
      if (!next) return;
      e.preventDefault();
      tune(next);
    });
  }
  function fmtTime(t) {
    const d = new Date(t * 1000);
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }
  async function loadEpg(id, gen) {
    const box = $("dkTvEpg");
    try {
      const j = await (await fetch("api/browse/epg?item=" + encodeURIComponent(id), { cache: "no-store" })).json();
      if (gen !== tv.gen) return;
      const now = Date.now() / 1000;
      const rows = (j && j.rows) || [];
      const cur = rows.find((r) => r.start <= now && r.end > now) || null;
      const later = rows.filter((r) => r.start >= (cur ? cur.end - 1 : now)).slice(0, 2);
      if (!cur && !later.length) {
        box.innerHTML = '<div class="dk-epg-none">No programme guide for this channel · مفيش دليل برامج للقناة دي</div>';
        return;
      }
      const esc2 = (t) => String(t || "").replace(/[<>&"]/g, "");
      let html = "";
      if (cur) {
        const pct = Math.max(0, Math.min(100, ((now - cur.start) / Math.max(1, cur.end - cur.start)) * 100));
        html += `<div class="dk-epg-now"><div class="dk-epg-row"><span class="dk-epg-tag">NOW · الآن</span><span class="dk-epg-time">${fmtTime(cur.start)} – ${fmtTime(cur.end)}</span></div><b>${esc2(cur.title)}</b>${cur.description ? `<p>${esc2(cur.description).slice(0, 260)}</p>` : ""}<div class="dk-epg-bar"><i style="width:${pct.toFixed(1)}%"></i></div></div>`;
      }
      if (later.length) html += '<div class="dk-epg-next">' + later.map((r) => `<div><span class="dk-epg-time">${fmtTime(r.start)}</span><b>${esc2(r.title)}</b></div>`).join("") + "</div>";
      box.innerHTML = html;
    } catch (_) {
      if (gen === tv.gen) box.innerHTML = "";
    }
  }
  async function tune(card) {
    const id = card.dataset.item;
    if (!id) return;
    const gen = ++tv.gen;
    tv.id = id;
    document.querySelectorAll("#browseItems .live-card.dk-on").forEach((c) => c.classList.remove("dk-on"));
    card.classList.add("dk-on");
    const name = card.title || (card.querySelector(".item-title") || {}).textContent || "Channel";
    $("dkTvName").textContent = name;
    const pic = card.querySelector("img.live-picon");
    $("dkTvLogo").innerHTML = pic && pic.complete && pic.naturalWidth ? `<img src="${pic.src}" alt="">` : `<i>${(name.trim()[0] || "TV").toUpperCase()}</i>`;
    $("dkTv").classList.add("playing");
    $("dkTvEpg").innerHTML = '<div class="dk-epg-none"><span class="loader"></span></div>';
    clearInterval(tv.timer);
    tv.timer = setInterval(() => tv.on && tv.id === id && loadEpg(id, gen), 60000);
    loadEpg(id, gen);
    const screen = $("dkTvScreen");
    try {
      const j = await (await fetch("api/browse/prepare?item=" + encodeURIComponent(id), { cache: "no-store" })).json();
      if (gen !== tv.gen) return;
      if (!j || !j.stream) throw new Error((j && j.error) || "Stream unavailable");
      j.live = true;
      j.title = j.title || name;
      const vlc = $("dkTvVlc");
      const href = window.USPlayer.vlcHref(j);
      vlc.href = href;
      if (/^data:/.test(href)) vlc.setAttribute("download", "ultra-stalker.m3u");
      window.USPlayer.play(j, { host: screen });
    } catch (err) {
      if (gen !== tv.gen) return;
      window.USPlayer.close();
      screen.querySelector(".dk-tv-idle b").textContent = "Channel unavailable";
      screen.querySelector(".dk-tv-idle span").textContent = String((err && err.message) || "القناة مش متاحة دلوقتي");
      $("dkTv").classList.remove("playing");
    }
  }
  function tvMode(on) {
    if (on === tv.on) return;
    tv.on = on;
    document.body.classList.toggle("dk-tv-mode", on);
    if (on) window.scrollTo(0, 0);
    if (!on) {
      tv.gen++;
      clearInterval(tv.timer);
      if (tv.id) window.USPlayer.close();
      tv.id = "";
      const panel = $("dkTv");
      if (panel) {
        panel.classList.remove("playing");
        panel.querySelector(".dk-tv-idle b").textContent = "Choose a channel";
        panel.querySelector(".dk-tv-idle span").textContent = "اختار قناة من القايمة";
      }
    }
  }

  function sync() {
    const active = !!$("browseAccount").value;
    document.body.classList.toggle("dk-home", !active);
    const media = (document.querySelector(".type.active") || {}).dataset?.media || "itv";
    let go = media;
    if (visible("favoritesStage")) go = "fav";
    else if (visible("searchStage")) go = "search";
    document.querySelectorAll("#dkNav button").forEach((b) => b.classList.toggle("on", active ? b.dataset.go === go : b.dataset.go === "portals"));
    document.body.dataset.media = media;
    const names = { itv: "Live TV", vod: "Movies", series: "Series", search: "Search", fav: "Favorites" };
    const ar = { itv: "البث المباشر", vod: "الأفلام", series: "المسلسلات", search: "البحث", fav: "المفضلة" };
    const opt = $("browseAccount").selectedOptions[0];
    $("dkKicker").textContent = active && opt ? opt.textContent : "Ultra Stalker";
    let title = active ? names[go] : "Welcome";
    let sub = active ? ar[go] : "أهلاً بيك";
    if (active && visible("itemsStage")) {
      title = $("itemsTitle").textContent || title;
      sub = names[go] + " · " + ar[go];
    }
    $("dkTitle").textContent = title;
    $("dkSub").textContent = sub;
    tvMode(active && media === "itv" && visible("itemsStage") && !visible("favoritesStage") && !visible("searchStage"));
  }

  function start() {
    build();
    if (!BROWSE) return;
    tvBuild();
    drawWelcome();
    sync();
    let t = 0;
    new MutationObserver(() => {
      clearTimeout(t);
      t = setTimeout(sync, 30);
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["class"], childList: false });
    new MutationObserver(() => {
      drawWelcome();
      sync();
    }).observe($("browseAccount"), { childList: true });
    $("browseAccount").addEventListener("change", sync);
    $("itemsTitle") && new MutationObserver(sync).observe($("itemsTitle"), { childList: true, characterData: true, subtree: true });
    ["seasonsStage", "movieStage"].forEach((id) => {
      const el = $(id);
      if (el) new MutationObserver(decorateDetails).observe(el, { childList: true, subtree: true });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
