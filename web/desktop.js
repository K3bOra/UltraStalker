/* Ultra Stalker Web — the app shell (phone and computer).

   Computer (1100px and wider): a menu on the right, a top bar, the content using
   the whole width, and the Live TV screen.
   Phone and tablet: a top bar with the source picker and a tab bar at the bottom.
   The receiver page's own elements are moved, not copied, so all of its code keeps
   working unchanged. */
(function () {
  "use strict";
  const WIDE = window.matchMedia("(min-width: 1100px)");
  const DESK = WIDE.matches && !/[?&]phone=1/.test(location.search);
  WIDE.addEventListener("change", () => location.reload());
  const $ = (id) => document.getElementById(id);
  const AR = !(window.USLang && !window.USLang.ar);
  const T = (en, ar) => (AR ? ar : en);
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
    ["itv", "Live TV", "البث المباشر", '<img src="ui/gold/live.png" alt="">'],
    ["vod", "Movies", "الأفلام", '<img src="ui/gold/movies.png" alt="">'],
    ["series", "Series", "المسلسلات", '<img src="ui/gold/series.png" alt="">'],
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

  /* Provider names often use stylised letters (ᵁᴴᴰ ᴿᴬᵂ ⁶⁰ᶠᵖˢ) that render as spaced-out
     glyphs: fold them to plain letters, then turn quality words into small badges. */
  const QUALITY = /^(4K|8K|UHD|FHD|QHD|HD|SD|HDR|HDR10|DV|DOLBY|ATMOS|AUDIO|VISION|\d{3,4}P|H\.?265|HEVC|H\.?264|\d{2,3}FPS|FPS|VIP|RAW|MULTI|SUBS?|DUB|DUBBED|NEW|TOP|BACKUP|LOW|LQ|HQ)$/i;
  function plain(t) {
    return String(t || "").normalize("NFKC").replace(/[\u2000-\u200b\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim();
  }
  function splitName(raw) {
    let text = plain(raw);
    const tags = [];
    // "UK| GENERAL", "8K | SPORT": short codes before a bar are tags.
    const bar = text.match(/^([A-Za-z0-9 ]{1,12})\s*[|│┃]\s*(.+)$/);
    if (bar && bar[1].trim().split(/\s+/).every((w) => w.length <= 4)) {
      bar[1].trim().split(/\s+/).forEach((w) => tags.push(w.toUpperCase()));
      text = bar[2];
    }
    const words = text.split(/\s+/).flatMap((w) => (/^[A-Za-z0-9]+\/[A-Za-z0-9/]+$/.test(w) ? w.split("/") : [w]));
    const keep = [];
    const isTag = (w) => QUALITY.test(w.replace(/[|•·:,]+$/g, ""));
    words.forEach((w, i) => {
      const clean = w.replace(/[|•·:,]+$/g, "");
      if (!/[\p{L}\p{N}]/u.test(clean)) return; // lone symbols ☼ ★ ###
      // quality words count as tags at the start or the end of the name
      const edge = keep.length === 0 || words.slice(i + 1).every((x) => isTag(x) || !/[\p{L}\p{N}]/u.test(x));
      if (isTag(clean) && edge && words.length > 1) {
        const up = clean.toUpperCase();
        if (/^(AUDIO|ATMOS|VISION)$/.test(up) && /^DOLBY$/.test(tags[tags.length - 1] || "")) tags[tags.length - 1] += " " + up;
        else if (!tags.includes(up)) tags.push(up);
      } else keep.push(clean);
    });
    const name = keep.join(" ").replace(/^#+\s*|\s*#+$/g, "").trim();
    return name ? { name, tags } : { name: plain(raw), tags: [] };
  }
  function decorateCategories() {
    document.querySelectorAll("#browseCategories .category:not([data-dk])").forEach((el) => {
      el.dataset.dk = "1";
      const t = el.querySelector(".category-title");
      if (!t) return;
      const { name, tags } = splitName(t.textContent);
      t.textContent = name === "All" && AR ? "الكل" : name;
      t.setAttribute("dir", "auto");
      const code = tags.find((x) => /^[A-Z]{2,3}$/.test(x) && !QUALITY.test(x));
      const mono = document.createElement("span");
      mono.className = "dk-cat-mono";
      mono.textContent = code || (name === "All" ? "✦" : (t.textContent.trim().match(/[\p{L}\p{N}]/u) || ["•"])[0].toUpperCase());
      el.prepend(mono);
      const row = document.createElement("span");
      row.className = "dk-cat-tags";
      row.innerHTML = tags.filter((x) => x !== code).map((x) => `<i>${esc(x)}</i>`).join("");
      if (row.innerHTML) t.after(row);
      const chev = document.createElement("span");
      chev.className = "dk-cat-chev";
      chev.textContent = AR ? "‹" : "›";
      el.appendChild(chev);
    });
  }
  /* Programme guide on channel rows: what's on now, with a progress bar. */
  const EPG = new Map(); // id -> { t, now }
  const epgQueue = [];
  let epgBusy = 0;
  const epgSeen = new WeakSet();
  const epgIO = "IntersectionObserver" in window ? new IntersectionObserver((list) => list.forEach((e) => e.isIntersecting && wantEpg(e.target)), { rootMargin: "200px 0px" }) : null;
  function epgLine(card, now) {
    let box = card.querySelector(".dk-live-epg");
    if (!now) {
      if (box) box.remove();
      card.classList.remove("has-epg");
      return;
    }
    if (!box) {
      box = document.createElement("div");
      box.className = "dk-live-epg";
      box.innerHTML = '<span class="dk-le-t"></span><span class="dk-le-tm"></span><i class="dk-le-bar"><b></b></i>';
      const copy = card.querySelector(".live-copy") || card;
      copy.appendChild(box);
    }
    card.classList.add("has-epg");
    const sec = Date.now() / 1000;
    const pct = Math.max(0, Math.min(100, ((sec - now.start) / Math.max(1, now.end - now.start)) * 100));
    box.querySelector(".dk-le-t").textContent = now.title;
    box.querySelector(".dk-le-t").setAttribute("dir", "auto");
    box.querySelector(".dk-le-tm").textContent = fmtTime(now.start) + " – " + fmtTime(now.end);
    box.querySelector(".dk-le-bar b").style.width = pct.toFixed(1) + "%";
  }
  function wantEpg(card) {
    const id = card.dataset.item;
    if (!id) return;
    const hit = EPG.get(id);
    if (hit && Date.now() - hit.t < 5 * 60000 && (!hit.now || hit.now.end * 1000 > Date.now())) return epgLine(card, hit.now);
    if (card.dataset.epgQ) return;
    card.dataset.epgQ = "1";
    epgQueue.push(card);
    pumpEpg();
  }
  function pumpEpg() {
    while (epgBusy < 3 && epgQueue.length) {
      const card = epgQueue.shift();
      if (!card.isConnected) continue;
      epgBusy++;
      const id = card.dataset.item;
      fetch("api/browse/epg?item=" + encodeURIComponent(id), { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => {
          const sec = Date.now() / 1000;
          const now = ((j && j.rows) || []).find((r) => r.start <= sec && r.end > sec) || null;
          EPG.set(id, { t: Date.now(), now });
          if (card.isConnected) epgLine(card, now);
        })
        .catch(() => EPG.set(id, { t: Date.now(), now: null }))
        .finally(() => {
          delete card.dataset.epgQ;
          epgBusy--;
          pumpEpg();
        });
    }
  }
  function watchEpg() {
    if (!epgIO || document.body.dataset.media !== "itv") return;
    document.querySelectorAll("#browseItems .live-card[data-item]").forEach((c) => {
      if (epgSeen.has(c)) return;
      epgSeen.add(c);
      epgIO.observe(c);
    });
  }
  setInterval(() => {
    if (document.hidden) return;
    document.querySelectorAll("#browseItems .live-card.has-epg").forEach((c) => {
      const hit = EPG.get(c.dataset.item);
      if (hit && hit.now) {
        if (hit.now.end * 1000 <= Date.now()) {
          EPG.delete(c.dataset.item);
          wantEpg(c);
        } else epgLine(c, hit.now);
      }
    });
  }, 30000);

  function cleanItemTitles() {
    document.querySelectorAll("#browseItems .item-title:not([data-n])").forEach((t) => {
      t.dataset.n = "1";
      const v = plain(t.textContent).replace(/^#+\s*|\s*#+$/g, "");
      if (v && v !== t.textContent) t.textContent = v;
      t.setAttribute("dir", "auto");
    });
    const it = $("itemsTitle");
    if (it && /[\u1d00-\u1dbf\u2070-\u209f]/.test(it.textContent)) it.textContent = plain(it.textContent);
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
        '<div class="dk-cast-h">' + T("Cast", "الأبطال") + '</div><div class="dk-cast-row">' +
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
  function openItemId(media) {
    try {
      // The receiver page keeps the open movie / series in these globals.
      // eslint-disable-next-line no-undef
      if (media === "series") return typeof activeSeries !== "undefined" && activeSeries ? String(activeSeries.id) : "";
      // eslint-disable-next-line no-undef
      return typeof activeMovie !== "undefined" && activeMovie ? String(activeMovie.id) : "";
    } catch (_) {
      return "";
    }
  }
  document.addEventListener("us-details", (e) => {
    const ex = e.detail || {};
    if (ex.item && ex.item !== openItemId(ex.media)) return; // details fetched for the featured banner
    showExtras(ex);
  });

  /* ------------------------------------------------ featured banner over poster walls */
  const feat = { key: "", ids: [], i: 0, timer: 0, data: new Map(), hold: false };
  function featBuild() {
    if ($("dkFeature")) return $("dkFeature");
    const el = document.createElement("section");
    el.id = "dkFeature";
    el.className = "dk-feature";
    el.innerHTML =
      '<div class="dk-f-bg"><img alt=""><img alt=""></div><div class="dk-f-shade"></div>' +
      '<div class="dk-f-copy"><small class="dk-f-k">' + T("FEATURED", "مختارات") + '</small><img class="dk-f-logo" alt=""><h2 class="dk-f-title"></h2>' +
      '<div class="dk-f-meta"></div><p class="dk-f-plot"></p><div class="dk-f-acts"><button type="button" class="dk-f-go"><i></i><span>' + T("View details", "شاهد التفاصيل") + '</span></button></div></div>' +
      '<div class="dk-f-dots"></div>';
    const head = $("itemsStage").querySelector(".items-head");
    head.after(el);
    el.addEventListener("mouseenter", () => (feat.hold = true));
    el.addEventListener("mouseleave", () => (feat.hold = false));
    el.querySelector(".dk-f-go").onclick = () => {
      const card = document.querySelector(`#browseItems .poster-card[data-item="${CSS.escape(feat.ids[feat.i] || "")}"]`);
      if (card) (card.querySelector(".item-title") || card).click();
    };
    el.querySelector(".dk-f-dots").onclick = (e) => {
      const d = e.target.closest("i[data-i]");
      if (d) featShow(+d.dataset.i);
    };
    return el;
  }
  async function featData(id) {
    if (feat.data.has(id)) return feat.data.get(id);
    const job = fetch("api/browse/details?item=" + encodeURIComponent(id), { cache: "no-store" })
      .then((r) => r.json())
      .catch(() => null);
    feat.data.set(id, job);
    return job;
  }
  async function featShow(i) {
    const el = $("dkFeature");
    if (!el || !feat.ids.length) return;
    feat.i = (i + feat.ids.length) % feat.ids.length;
    const id = feat.ids[feat.i];
    const key = feat.key;
    const d = await featData(id);
    if (key !== feat.key || feat.ids[feat.i] !== id) return;
    const ex = (window.USEngine.extras && window.USEngine.extras(id)) || {};
    const back = window.USEngine.backdrop(id);
    const art = back || window.USEngine.art(id, document.body.dataset.media) || "";
    const imgs = el.querySelectorAll(".dk-f-bg img");
    const front = imgs[0].classList.contains("on") ? imgs[1] : imgs[0];
    const other = front === imgs[0] ? imgs[1] : imgs[0];
    front.classList.toggle("soft", !back);
    front.onload = () => {
      front.classList.add("on");
      other.classList.remove("on");
    };
    if (art) front.src = art;
    const copy = el.querySelector(".dk-f-copy");
    copy.classList.remove("in");
    void copy.offsetWidth;
    copy.classList.add("in");
    const logo = el.querySelector(".dk-f-logo");
    const title = el.querySelector(".dk-f-title");
    title.textContent = (d && d.title) || (document.querySelector(`#browseItems [data-item="${CSS.escape(id)}"] .item-title`) || {}).textContent || "";
    logo.classList.remove("on");
    if (ex.logo) {
      logo.onload = () => logo.classList.add("on");
      logo.src = ex.logo;
    } else logo.removeAttribute("src");
    el.classList.toggle("has-logo", !!ex.logo);
    const chips = [];
    if (d) {
      if (d.year) chips.push(`<span class="y">${d.year}</span>`);
      if (d.rating) chips.push(`<span class="r">★ ${Number(d.rating).toFixed(1)}</span>`);
      (d.genres || []).slice(0, 3).forEach((g) => chips.push(`<span>${esc(g)}</span>`));
      if (d.runtime) chips.push(`<span>${d.runtime} ${T("min", "دقيقة")}</span>`);
    }
    el.querySelector(".dk-f-meta").innerHTML = chips.join("");
    el.querySelector(".dk-f-plot").textContent = (d && d.overview) || "";
    el.querySelector(".dk-f-dots").innerHTML = feat.ids.map((_, k) => `<i data-i="${k}" class="${k === feat.i ? "on" : ""}"></i>`).join("");
    // Warm the next one so the change is instant.
    if (feat.ids.length > 1) featData(feat.ids[(feat.i + 1) % feat.ids.length]);
  }
  function featSync() {
    const media = document.body.dataset.media;
    const on = !!$("browseAccount").value && (media === "vod" || media === "series") && visible("itemsStage");
    const cards = on ? [...document.querySelectorAll("#browseItems .poster-card[data-item]")] : [];
    const el = $("dkFeature");
    if (!cards.length) {
      if (el) el.classList.add("hidden");
      feat.key = "";
      clearInterval(feat.timer);
      return;
    }
    const ids = cards.slice(0, 5).map((c) => c.dataset.item);
    const key = media + "|" + ids.join(",");
    if (key === feat.key) return;
    feat.key = key;
    feat.ids = ids;
    featBuild().classList.remove("hidden");
    featShow(0);
    clearInterval(feat.timer);
    feat.timer = setInterval(() => {
      if (!feat.hold && !document.hidden && feat.ids.length > 1 && visible("itemsStage")) featShow(feat.i + 1);
    }, 9000);
  }

  function langSwitch() {
    const el = document.createElement("div");
    el.className = "dk-lang";
    el.setAttribute("data-no-tr", "");
    el.innerHTML = `<button type="button" data-l="ar" class="${AR ? "on" : ""}" title="عربي">ع</button><button type="button" data-l="en" class="${AR ? "" : "on"}" title="English">EN</button>`;
    el.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-l]");
      if (b && window.USLang && b.dataset.l !== window.USLang.lang) window.USLang.set(b.dataset.l);
    });
    return el;
  }

  function build() {
    BROWSE = !!document.getElementById("browseAccount");
    document.body.classList.add("app", DESK ? "desk" : "ph", BROWSE ? "desk-browse" : "desk-sources");
    const side = document.createElement("aside");
    side.className = "dk-side";
    side.innerHTML =
      '<a class="dk-brand" href="index.html" title="Ultra Stalker"><img src="brand-logo-gold.webp" alt="Ultra Stalker"><span>' + T("From anywhere · من أي مكان", "من أي مكان · From anywhere") + '</span></a>' +
      (BROWSE ? '<div class="dk-source" id="dkSource"><div class="dk-label">' + T("Source <span>المصدر</span>", "المصدر <span>Source</span>") + '</div></div>' : "") +
      '<nav class="dk-nav" id="dkNav">' +
      NAV.map(([k, en, ar, ic]) => `<button type="button" data-go="${k}"><span class="dk-ic">${ic}</span><span class="dk-tx"><b>${T(en, ar)}</b><small>${T(ar, en)}</small></span></button>`).join("") +
      "</nav>" +
      '<div class="dk-sep"><i></i></div>' +
      '<nav class="dk-nav dk-tools">' +
      `<a href="sources.html#connectionPanel" data-sec="connectionPanel"><span class="dk-ic">${ICON.plus}</span><span class="dk-tx"><b>${T("Add Connection", "إضافة مصدر")}</b><small>${T("إضافة مصدر", "Add Connection")}</small></span></a>` +
      `<a href="sources.html#managerPanel" data-sec="managerPanel"><span class="dk-ic">${ICON.servers}</span><span class="dk-tx"><b>${T("Manage Servers", "إدارة السيرفرات")}</b><small>${T("إدارة السيرفرات", "Manage Servers")}</small></span></a>` +
      `<a href="sources.html#backupPanel" data-sec="backupPanel"><span class="dk-ic">${ICON.backup}</span><span class="dk-tx"><b>${T("Backup &amp; Restore", "باك اب الرسيفر")}</b><small>${T("باك اب الرسيفر", "Backup &amp; Restore")}</small></span></a>` +
      "</nav>" +
      '<div class="dk-credit"><small>' + T("Design &amp; development", "تصميم وتطوير") + "</small>" + '<b>Ahmed L-HadarY</b><span id="dkVer"></span></div>';
    document.body.appendChild(side);
    if (!BROWSE) {
      if (DESK) side.querySelector(".dk-brand").after(langSwitch());
      else {
        const hero = document.querySelector(".hero");
        if (hero) hero.prepend(langSwitch());
      }
    }

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
    // The source picker moves into the menu (computer) or the top bar (phone).
    const field = document.querySelector(".source-field");
    if (field) $("dkSource").appendChild(field);
    const brandMini = '<a class="ph-brand" href="index.html"><img src="ui/gold/emblem.png" alt="Ultra Stalker"></a>';
    const ver = document.querySelector(".footer");
    if (ver) $("dkVer").textContent = ver.textContent.replace(/^Ultra Stalker\s*·\s*/, "");

    // A top bar over the content: where you are, and a wide search.
    const top = document.createElement("header");
    top.className = "dk-top";
    top.innerHTML = (DESK ? "" : brandMini) + '<div class="dk-where"><small id="dkKicker">Ultra Stalker</small><h1 id="dkTitle">Browse</h1><span id="dkSub"></span></div><div class="dk-search" id="dkSearch"></div>';
    const shell = document.querySelector("main.shell");
    shell.parentNode.insertBefore(top, shell);
    top.insertBefore(langSwitch(), $("dkSearch"));
    if (!DESK) top.appendChild($("dkSource"));
    const sb = document.querySelector(".search-box");
    if (sb) {
      $("dkSearch").appendChild(sb);
      const input = $("browseSearch");
      input.placeholder = T("Search movies and series…", "ابحث عن فيلم أو مسلسل…");
      const sbtn = $("searchBtn");
      if (sbtn) sbtn.textContent = T("Search", "بحث");
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
      document.body.classList.toggle("ph-search", go === "search");
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
    const icons = { portal: "ui/gold/live.png", xtream: "ui/gold/movies.png", m3u: "ui/gold/series.png" };
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
    const counts = { portal: 0, xtream: 0 };
    opts.forEach((o) => (counts[String(o.dataset.kind || "portal") === "portal" ? "portal" : "xtream"] += 1));
    let group = "portal";
    try {
      group = localStorage.getItem("us-web-ptab") || "";
    } catch (_) {}
    if (group !== "portal" && group !== "xtream") group = counts.portal || !counts.xtream ? "portal" : "xtream";
    const tools =
      '<div class="dk-hero-tools">' +
      `<a href="sources.html#connectionPanel"><span>${ICON.plus}</span><b>${T("Add Connection", "إضافة مصدر")}</b></a>` +
      `<a href="sources.html#managerPanel"><span>${ICON.servers}</span><b>${T("Manage Servers", "إدارة السيرفرات")}</b></a>` +
      `<a href="sources.html#backupPanel"><span>${ICON.backup}</span><b>${T("Backup", "باك اب الرسيفر")}</b></a>` +
      "</div>";
    const kindsAr = AR ? { portal: "بورتال ستالكر", xtream: "Xtream Codes", m3u: "قائمة M3U" } : kinds;
    box.innerHTML =
      '<div class="dk-hero"><div class="dk-hero-copy"><small>ULTRA STALKER · WEB</small>' +
      T('<h2>Your sources,<br><span class="gold-text">everywhere.</span></h2>', '<h2>مصادرك<br><span class="gold-text">في أي مكان</span></h2>') +
      T("<p>Live TV, movies and series from your own servers, on your phone and computer.</p>", "<p>البث المباشر والأفلام والمسلسلات من سيرفراتك، على الموبايل والكمبيوتر.</p>") +
      tools +
      '</div><img src="brand-logo-gold.webp" alt=""></div>' +
      (opts.length
        ? '<div class="dk-row-h"><h3>' + T("Portals <span>البورتالات</span>", "البورتالات <span>Portals</span>") + "</h3><span>" + opts.length + T(" saved · ", " محفوظة · ") + '<a href="sources.html#connectionPanel">＋ ' + T("Add", "إضافة") + "</a></span></div>" +
          `<div class="dk-ptabs" role="tablist"><button type="button" data-g="portal" class="${group === "portal" ? "on" : ""}"><img src="ui/gold/live.png" alt=""><b>${T("Stalker Portal", "بورتال ستالكر")}</b><i>${counts.portal}</i></button>` +
          `<button type="button" data-g="xtream" class="${group === "xtream" ? "on" : ""}"><img src="ui/gold/movies.png" alt=""><b>${T("Xtream / M3U", "Xtream / M3U")}</b><i>${counts.xtream}</i></button></div>` +
          `<div class="dk-sources" data-show="${group}">` +
          opts
            .map((o) => {
              const k = String(o.dataset.kind || "portal");
              const h = host(o.value);
              const safe = (t) => String(t || "").replace(/[<>&"]/g, "");
              return `<button type="button" class="dk-src ${k}" data-v="${o.value}" data-g="${k === "portal" ? "portal" : "xtream"}">
                <span class="dk-src-art"><img src="${icons[k] || icons.portal}" alt=""></span>
                <span class="dk-src-k">${kindsAr[k] || kinds[k] || "Portal"}</span>
                <b>${safe(o.textContent)}</b>
                <span class="dk-src-host" dir="ltr">${safe(h.host)}</span>
                ${h.mac ? `<span class="dk-src-id" dir="ltr">${safe(h.mac)}</span>` : ""}
                <span class="dk-src-go">${T("Open portal <i>›</i>", "افتح البورتال <i>‹</i>")}</span><span class="dk-src-chev">${AR ? "‹" : "›"}</span></button>`;
            })
            .join("") +
          `<div class="dk-src-none">${T("Nothing saved here yet.", "مفيش مصادر هنا لسه.")} <a href="sources.html#connectionPanel">＋ ${T("Add", "إضافة")}</a></div>` +
          "</div>"
        : '<div class="dk-empty">' + T("<b>No saved sources yet</b><span>Add a Portal, Xtream or M3U source, or load a receiver backup.</span>", "<b>لسه مفيش مصادر</b><span>ضيف بورتال أو Xtream أو M3U، أو ارفع باك اب الرسيفر.</span>") +
          '<div><a class="dk-btn" href="sources.html#connectionPanel">＋ ' + T("Add Connection", "إضافة مصدر") + '</a><a class="dk-btn ghost" href="sources.html#backupPanel">⇩ ' + T("Load receiver backup", "ارفع باك اب الرسيفر") + "</a></div></div>");
    const hero = box.querySelector(".dk-hero");
    if (hero) hero.appendChild(langSwitch());
    box.onclick = (e) => {
      const tab = e.target.closest(".dk-ptabs button[data-g]");
      if (tab) {
        box.querySelectorAll(".dk-ptabs button").forEach((x) => x.classList.toggle("on", x === tab));
        box.querySelector(".dk-sources").dataset.show = tab.dataset.g;
        try {
          localStorage.setItem("us-web-ptab", tab.dataset.g);
        } catch (_) {}
        return;
      }
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
      '<div class="dk-tv-screen" id="dkTvScreen"><div class="dk-tv-idle"><img src="brand-logo-gold.webp" alt=""><b>' + T("Choose a channel", "اختار قناة") + "</b><span>" + T("Pick one from the list", "من القايمة اللي جنبك") + '</span></div></div>' +
      '<div class="dk-tv-info" id="dkTvInfo">' +
      '<div class="dk-tv-ch"><span class="dk-tv-logo" id="dkTvLogo"></span><div class="dk-tv-name"><small>' + T("LIVE", "مباشر") + '</small><b id="dkTvName">—</b></div>' +
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
        box.innerHTML = '<div class="dk-epg-none">' + T("No programme guide for this channel", "مفيش دليل برامج للقناة دي") + "</div>";
        return;
      }
      const esc2 = (t) => String(t || "").replace(/[<>&"]/g, "");
      let html = "";
      if (cur) {
        const pct = Math.max(0, Math.min(100, ((now - cur.start) / Math.max(1, cur.end - cur.start)) * 100));
        html += `<div class="dk-epg-now"><div class="dk-epg-row"><span class="dk-epg-tag">${T("NOW", "الآن")}</span><span class="dk-epg-time">${fmtTime(cur.start)} – ${fmtTime(cur.end)}</span></div><b>${esc2(cur.title)}</b>${cur.description ? `<p>${esc2(cur.description).slice(0, 260)}</p>` : ""}<div class="dk-epg-bar"><i style="width:${pct.toFixed(1)}%"></i></div></div>`;
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
      screen.querySelector(".dk-tv-idle b").textContent = T("Channel unavailable", "القناة مش متاحة");
      screen.querySelector(".dk-tv-idle span").textContent = String((err && err.message) || T("Channel unavailable", "القناة مش متاحة دلوقتي"));
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
        panel.querySelector(".dk-tv-idle b").textContent = T("Choose a channel", "اختار قناة");
        panel.querySelector(".dk-tv-idle span").textContent = T("Pick one from the list", "من القايمة اللي جنبك");
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
    const ar = { itv: "Live TV", vod: "Movies", series: "Series", search: "Search", fav: "Favorites" };
    const names = { itv: "البث المباشر", vod: "الأفلام", series: "المسلسلات", search: "البحث", fav: "المفضلة" };
    const opt = $("browseAccount").selectedOptions[0];
    $("dkKicker").textContent = active && opt ? opt.textContent : "Ultra Stalker";
    let title = active ? T(ar[go], names[go]) : T("Welcome", "أهلاً بيك");
    let sub = active ? T(names[go], ar[go]) : T("أهلاً بيك", "Welcome");
    if (active && visible("itemsStage")) {
      title = $("itemsTitle").textContent || title;
      sub = T(ar[go] + " · " + names[go], names[go] + " · " + ar[go]);
    }
    $("dkTitle").textContent = title;
    $("dkSub").textContent = sub;
    featSync();
    tvMode(DESK && active && media === "itv" && visible("itemsStage") && !visible("favoritesStage") && !visible("searchStage"));
  }

  function start() {
    build();
    if (!BROWSE) return;
    if (DESK) tvBuild();
    new MutationObserver(decorateCategories).observe($("browseCategories"), { childList: true });
    decorateCategories();
    let ft = 0;
    new MutationObserver(() => {
      clearTimeout(ft);
      ft = setTimeout(featSync, 120);
      cleanItemTitles();
      watchEpg();
    }).observe($("browseItems"), { childList: true });
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
