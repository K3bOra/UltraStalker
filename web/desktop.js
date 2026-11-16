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
  }

  function start() {
    build();
    if (!BROWSE) return;
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
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
