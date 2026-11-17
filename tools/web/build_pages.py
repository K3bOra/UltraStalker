#!/usr/bin/env python3
"""Build the website pages in web/ from the receiver's own pages.

The receiver ships web/browse.html (Browse) and web/cleaner.html (Manage Servers)
inside the plugin package. This script takes them from packages/Ultra_Stalker_Final.ipk,
keeps their look and code, and applies a small, checked list of changes so they run
on GitHub Pages: relative paths, the in-browser engine (engine.js) instead of the
receiver's /api, links between the two pages, Play here, and the Backup panel.

    python3 tools/web/build_pages.py            # from packages/Ultra_Stalker_Final.ipk
    python3 tools/web/build_pages.py some.ipk   # from another build

Every change must apply exactly where expected; if the receiver page changed, the
script stops and says which change no longer fits.
"""
import io
import re
import sys
import tarfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from goldify import recolor_html  # noqa: E402  (black & gold theme)

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "web"
WEB_VERSION = 19
PLUGIN_DIR = "usr/lib/enigma2/python/Plugins/Extensions/UltraStalker/"


def read_ipk(path):
    data = Path(path).read_bytes()
    if not data.startswith(b"!<arch>\n"):
        raise SystemExit("not an ipk (ar archive): %s" % path)
    pos, members = 8, {}
    while pos + 60 <= len(data):
        head = data[pos:pos + 60]
        name = head[:16].decode().strip().rstrip("/")
        size = int(head[48:58].decode().strip())
        members[name] = data[pos + 60:pos + 60 + size]
        pos += 60 + size + (size & 1)
    tar = tarfile.open(fileobj=io.BytesIO(members["data.tar.gz"]), mode="r:gz")
    out = {}
    for name in ("web/browse.html", "web/cleaner.html", "version.py"):
        for prefix in ("./", ""):
            try:
                out[name] = tar.extractfile(prefix + PLUGIN_DIR + name).read().decode("utf-8")
                break
            except KeyError:
                continue
        else:
            raise SystemExit("missing %s in the package" % name)
    return out


def sub(text, old, new, count=1, regex=False, label=""):
    if regex:
        found = len(re.findall(old, text, flags=re.S))
        if found != count:
            raise SystemExit("change %r: expected %d match(es), found %d" % (label or old[:60], count, found))
        return re.sub(old, new, text, flags=re.S)
    found = text.count(old)
    if found != count:
        raise SystemExit("change %r: expected %d match(es), found %d" % (label or old[:60], count, found))
    return text.replace(old, new)


def relative_paths(html):
    # /api/..., /ui/..., /brand-logo.png and the poster placeholders become page-relative.
    html = re.sub(r"""(["'(])/(api/|ui/|brand-logo\.png|poster-movie\.png|poster-series\.png)""", r"\1\2", html)
    html = html.replace("ui/page_background.png", "ui/page_background.jpg").replace("brand-logo.png", "brand-logo-gold.webp")
    # Black & gold: gold logo, gold section icons, gold-mapped colours.
    html = re.sub(r"ui/(live|movies|series|favorites|folder)\.png", r"ui/gold/\1.png", html)
    return recolor_html(html)


def head_scripts(names):
    return "".join('<script src="%s?v=%d"></script>' % (n, WEB_VERSION) for n in names)


META = (
    '<meta name="description" content="Ultra Stalker on the web: your Portal, Xtream and M3U sources from anywhere, '
    'with receiver backup and restore.">\n<link rel="manifest" href="manifest.webmanifest?v=gold1">\n'
    '<link rel="apple-touch-icon" href="icons/gold-192.png">\n'
)


STYLES = "".join('<link rel="stylesheet" href="%s?v=%d">' % (n, WEB_VERSION) for n in ("fonts.css", "theme.css", "desktop.css"))


# Arabic labels for the visible parts of the Browse page (the user reads Arabic).
ARABIC = [
    ("function mediaName(media=browseMedia){return media==='itv'?'Live':media==='vod'?'Movies':'Series'}",
     "function mediaName(media=browseMedia){return media==='itv'?'البث المباشر':media==='vod'?'الأفلام':'المسلسلات'}"),
    ("' categories • '+mediaName(media)", "' قسم • '+mediaName(media)"),
    ("(loadedItemCount+' of '+total+' loaded'):(loadedItemCount+' loaded')", "(loadedItemCount+' من '+total):(String(loadedItemCount))"),
    ("note.textContent=mediaName()+' folder'", "note.textContent='قسم · '+mediaName()"),
    ("(count+' Episode'+(count===1?'':'s')):'Episodes'", "(count+' حلقة'):'حلقات'"),
    ("title.textContent='Episode '+ep", "title.textContent='الحلقة '+ep"),
    ("+' episode'+(Number(Array.isArray(rows)?rows.length:0)===1?'':'s')", "+' حلقة'+''"),
    ("‹ Categories", "‹ الأقسام"), ("‹ Back", "‹ رجوع"), ("‹ Seasons", "‹ المواسم"),
    (">Choose Player<", ">اختار المشغل<"), (">Play here<", ">شغّل هنا<"), (">In this browser<", ">جوه المتصفح<"),
    (">Native Player<", ">مشغل الجهاز<"), ("<span>Play</span>", "<span>تشغيل</span>"), ("<span>Favorite</span>", "<span>مفضلة</span>"),
    ("Choose a saved source…", "اختار مصدر…"), ("Loading series information…", "بنجهز معلومات المسلسل…"),
    ("Loading movie information…", "بنجهز معلومات الفيلم…"), ("End of this category", "خلصت القايمة"),
    ("Loading seasons…", "بنجيب المواسم…"), ("No seasons returned", "مفيش مواسم"),
    ("' • preparing stream…'", "' • بنجهز البث…'"),
    ("‹ Browse", "‹ رجوع"),
    ("' saved item'+(rows.length===1?'':'s')", "' محفوظ'+''"),
]


def arabic_labels(h):
    for old, new in ARABIC:
        if old not in h:
            raise SystemExit("Arabic label not found: %r" % old[:60])
        h = h.replace(old, new)
    return h


def build_browse(src, release):
    h = src
    h = sub(h, '<link rel="icon" type="image/png" href="/brand-logo.png">',
            '<link rel="icon" type="image/png" href="icons/gold-192.png">\n' + META)
    h = sub(h, "</head>", STYLES
            + head_scripts(["coi.js", "i18n.js", "config.js", "hash.js", "engine.js", "player.js", "desktop.js"]) + "\n</head>")
    h = sub(h, "Palestinian identity • mobile browser", "Palestinian identity • from anywhere")
    h = sub(h, "Browse saved Portal, Xtream and M3U sources plus the receiver's Local library from your phone. "
               "Nothing here changes the channel or player on the receiver.",
            "Your Portal, Xtream and M3U sources from anywhere, on your phone or computer. "
            "Load a receiver backup to bring your servers and Favorites here.")
    launches = (
        '<div class="home-launches" id="homeLaunches" aria-label="Ultra Stalker web tools">\n'
        '    <a class="home-launch cleaner" href="sources.html#connectionPanel">\n'
        '      <span class="home-launch-kicker">STALKER PORTAL / XTREAM &amp; M3U</span>\n'
        '      <strong>Add Connection</strong>\n'
        '      <span>Add a Portal, Xtream or M3U source.</span>\n'
        '    </a>\n'
        '    <a class="home-launch connections" href="sources.html#managerPanel">\n'
        '      <span class="home-launch-kicker">SAVED SOURCES</span>\n'
        '      <strong>Manage Servers</strong>\n'
        '      <span>Edit, rename, reorder or remove saved servers.</span>\n'
        '    </a>\n'
        '    <a class="home-launch local-launch keys-launch" href="sources.html#backupPanel" aria-label="Backup and Restore">\n'
        '      <span class="local-launch-title"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" '
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 21.5a6 6 0 0 1 .8-11.9 8 8 0 0 1 15.4 2.2 '
        '4.9 4.9 0 0 1 .8 9.7"></path><path d="M16 14v12"></path><path d="m11.5 21.5 4.5 4.5 4.5-4.5"></path></svg>'
        '<strong>Backup<small lang="ar" dir="rtl">باك اب الرسيفر</small></strong></span>\n'
        '      <span>Load or save a receiver backup</span>\n'
        '    </a>\n'
        '  </div>\n  '
    )
    h = sub(h, r'<div class="home-launches" id="homeLaunches".*?</div>\s*(?=<main class="shell">)', launches,
            regex=True, label="home launches")
    h = sub(h, '<a class="player-option native" id="playerNative"',
            '<a class="player-option native web unavailable" id="playerWeb" aria-disabled="true"><span class="player-option-mark">◉</span>'
            '<span>Play here</span><small>In this browser</small></a>\n        <a class="player-option native" id="playerNative"')
    h = sub(h, "__US_WEB_RELEASE__", release)
    h = sub(h, "Shared with receiver", "Saved in this browser")
    # The receiver's Local library (HDD/USB) has no button on the site.
    h = sub(h, "$('localLaunch').addEventListener('click',()=>loadLocalRoot(true));",
            "if($('localLaunch'))$('localLaunch').addEventListener('click',()=>loadLocalRoot(true));")

    # Artwork: pictures come from the provider (through the relay when plain http).
    h = sub(h, "function artworkUrl(itemId,media){return itemId?('/api/browse/artwork?item='+encodeURIComponent(itemId)):posterFallback(media)}",
            "function artworkUrl(itemId,media){return (itemId&&USEngine.art(itemId,media))||posterFallback(media)}")
    h = sub(h, "function backdropUrl(itemId){return '/api/browse/backdrop?item='+encodeURIComponent(itemId||'')}",
            "function backdropUrl(itemId){return USEngine.backdrop(itemId)}")
    h = sub(h, "bg.onload=()=>{const ok=String(bg.src||'').includes('/api/browse/backdrop?');",
            "const real=backdropUrl(itemId);bg.onload=()=>{const ok=!!real&&bg.src===real;")
    h = sub(h, "bg.src=artworkUrl(itemId,media)};bg.src=backdropUrl(itemId)}",
            "bg.src=artworkUrl(itemId,media)};bg.src=real||artworkUrl(itemId,media)}")
    h = sub(h, "function applyResolvedBackdrop(bg,itemId,media,details){if(!bg||!details||!details.has_backdrop||bg.dataset.backdropState==='ready')return;",
            "function applyResolvedBackdrop(bg,itemId,media,details){const real=backdropUrl(itemId);if(!real||!bg||!details||!details.has_backdrop||bg.dataset.backdropState==='ready')return;")
    h = sub(h, "bg.src=backdropUrl(itemId)+'&phase=resolved'}", "bg.src=real}")

    # Player chooser: "Play here", and a playlist file for VLC on computers.
    h = sub(h, "players.forEach(setPlayerPending);const platform=phonePlatform();",
            "players.forEach(setPlayerPending);USPlayer.pending();const platform=phonePlatform();")
    h = sub(h, "setPlayerReady(native,j.stream,'_blank');", "setPlayerReady(native,j.stream,'_blank');USPlayer.offer(j);")
    h = sub(h, "setPlayerReady(vlc,'/api/browse/vlc?item='+encodeURIComponent(row.id),'_blank')",
            "setPlayerReady(vlc,'data:audio/x-mpegurl;charset=utf-8,'+encodeURIComponent('#EXTM3U\\n#EXTINF:-1,'+(j.title||'Ultra Stalker')+'\\n'+j.stream+'\\n'),'_self');vlc.setAttribute('download','ultra-stalker.m3u')")
    h = sub(h, "(j.local?' • LAN • choose a player':' • choose a player')", "' • choose a player'")
    h = sub(h, "rows.length?'Choose a saved source to load categories.':'No saved sources found.'",
            "rows.length?'Choose a saved source to load categories.':'No saved sources yet. Add a connection or load a receiver backup above.'")
    return relative_paths(h)


def build_sources(src, release):
    h = src
    h = sub(h, '<link rel="icon" type="image/png" href="/brand-logo.png">',
            '<link rel="icon" type="image/png" href="icons/gold-192.png">\n' + META)
    h = sub(h, "<title>Ultra Stalker • Playlist Cleaner</title>", "<title>Ultra Stalker • Sources &amp; Backup</title>")
    h = sub(h, "</head>", '<link rel="stylesheet" href="sources.css?v=%d">' % WEB_VERSION + STYLES
            + head_scripts(["coi.js", "i18n.js", "config.js", "hash.js", "engine.js", "backup.js", "desktop.js"]) + "\n</head>")
    h = sub(h, 'href="/" style="min-height:38px', 'href="index.html" style="min-height:38px')
    h = sub(h, "Local processing • private by design", "Saved in this browser • private")
    h = sub(h, "__US_WEB_RELEASE__", release)
    h = sub(h, '<div class="kicker">Playlist Intelligence</div>', '<div class="kicker">Sources &amp; Backup</div>')
    h = sub(h, "<h1>Clean once. Keep only what works.</h1>", "<h1>Your servers, everywhere.</h1>")
    h = sub(h, "<p>Drop one mixed file. Ultra Stalker detects, cleans, groups and prepares Portal, Xtream and M3U entries before deep validation.</p>",
            "<p>Add and edit Portal, Xtream and M3U servers, then move them between this site and your receiver with a backup file.</p>")

    main = re.search(r'<main class="shell">.*?</main>', h, flags=re.S)
    if not main:
        raise SystemExit("change 'main': not found")
    body = main.group(0)
    conn = re.search(r'<section class="glass connection-panel" id="connectionPanel">.*?</section>', body, flags=re.S)
    mgr = re.search(r'<section class="glass manager-panel" id="managerPanel">.*?</section>', body, flags=re.S)
    if not conn or not mgr:
        raise SystemExit("change 'panels': connection or manager panel not found")
    conn_html = conn.group(0)
    conn_html = sub(conn_html, "Add Portal, Xtream or M3U directly from your browser. Saved connections appear in Ultra Stalker on the receiver.",
                    "Add Portal, Xtream or M3U. Saved connections stay in this browser; use Backup to move them to the receiver.")
    conn_html = sub(conn_html, '<span class="dot"></span> Receiver storage', '<span class="dot"></span> This browser')
    conn_html = sub(conn_html, "＋ Save to Ultra Stalker", "＋ Save Connection")
    mgr_html = mgr.group(0)
    mgr_html = sub(mgr_html, '<div class="manager-actions"><button type="button" class="btn green" id="managerSaveBtn" disabled>Save Changes</button></div>',
                   '<div class="manager-actions"><button type="button" class="btn green" id="managerSaveBtn" disabled>Save Changes</button>'
                   '<button type="button" class="btn danger" id="managerDeleteBtn" disabled>Remove</button></div>')
    mgr_html = sub(mgr_html, '<a class="btn" href="/">‹ Browse Ultra Stalker</a>', '<a class="btn" href="index.html">‹ Browse Ultra Stalker</a>')
    launch = (
        '<section class="glass browse-panel" id="browsePanel">\n'
        '    <div class="browse-launch browse-launch-split">\n'
        '      <a class="launch-half launch-edit" href="#connectionPanel"><span class="launch-half-kicker">STALKER PORTAL / XTREAM &amp; M3U</span>'
        '<strong>Add Connection</strong><span>Add a source to this site.</span></a>\n'
        '      <a class="launch-half launch-manager" href="#managerPanel"><span class="launch-half-kicker">SAVED SOURCES</span>'
        '<strong>Manage Servers</strong><span>Edit, reorder or remove saved servers.</span></a>\n'
        '    </div>\n'
        '  </section>\n'
    )
    backup = (
        '<section class="glass connection-panel backup-panel" id="backupPanel">\n'
        '    <div class="connection-head"><div><h2>Backup &amp; Restore <small lang="ar" dir="rtl">باك اب الرسيفر</small></h2>'
        '<p>Load the backup file your receiver made, or save this site\'s servers and Favorites as a backup the receiver can restore.</p></div>'
        '<div class="badge" id="backupBadge"><span class="dot"></span><span id="backupBadgeText">…</span></div></div>\n'
        '    <div class="backup-grid">\n'
        '      <div class="backup-card">\n'
        '        <span class="launch-half-kicker">FROM THE RECEIVER · من الرسيفر</span>\n'
        '        <strong>Load receiver backup</strong>\n'
        '        <p>On the receiver: Settings › Storage &amp; Maintenance › Backup &amp; Restore › Create portable backup. Copy the file '
        '<code>ultrastalker-backup-….zip</code> from <code>/media/hdd/UltraStalker/Backup</code> and choose it here. It replaces the servers and Favorites saved on this site.</p>\n'
        '        <label class="btn green" for="backupFile">＋ Choose backup file</label><input id="backupFile" type="file" accept=".zip,application/zip" hidden>\n'
        '      </div>\n'
        '      <div class="backup-card">\n'
        '        <span class="launch-half-kicker">TO THE RECEIVER · للرسيفر</span>\n'
        '        <strong>Save backup for the receiver</strong>\n'
        '        <p>Downloads <code>ultrastalker-backup-….zip</code> with the servers and Favorites from this site. Put it in '
        '<code>/media/hdd/UltraStalker/Backup</code>, then on the receiver open Backup &amp; Restore › Restore backup.</p>\n'
        '        <button type="button" class="btn" id="backupSaveBtn">⇩ Save backup file</button>\n'
        '      </div>\n'
        '    </div>\n'
        '    <div class="connection-result" id="backupResult" aria-live="polite">Checking this browser…</div>\n'
        '  </section>\n'
    )
    new_main = '<main class="shell">\n  ' + launch + "\n  " + conn_html + "\n\n  " + mgr_html + "\n\n  " + backup + "\n </main>"
    h = h.replace(body, new_main)

    # Keep only the connection + manager part of the receiver script; the rest is the playlist cleaner.
    script = re.search(r"<script>(.*?)</script>\s*</body>", h, flags=re.S)
    if not script:
        raise SystemExit("change 'script': not found")
    code = script.group(1)
    cut = code.find("function fmtElapsed(")
    end = code.rfind("loadManager();", 0, cut)
    if cut < 0 or end < 0:
        raise SystemExit("change 'script cut': the manager code moved")
    code = code[:end] + "loadManager();\n"
    code = sub(code, "$('connResult').textContent='Testing on the receiver…';", "$('connResult').textContent='Testing…';") if "$('connResult').textContent='Testing on the receiver…';" in code else code
    code = code.replace("Testing on the receiver…", "Testing…").replace("Saving changes on the receiver…", "Saving…")
    code = code.replace("＋ Save to Ultra Stalker", "＋ Save Connection")
    h = h.replace(script.group(0), "<script>" + code + "</script>\n" + head_scripts(["sources.js"]) + "\n</body>")
    return relative_paths(h)


def main():
    ipk = sys.argv[1] if len(sys.argv) > 1 else ROOT / "packages" / "Ultra_Stalker_Final.ipk"
    pages = read_ipk(ipk)
    ver = re.search(r'PLUGIN_VERSION\s*=\s*["\']([^"\']+)', pages["version.py"])
    release = "Web · V%s" % (ver.group(1) if ver else "?")
    WEB.mkdir(exist_ok=True)
    (WEB / "index.html").write_text(build_browse(pages["web/browse.html"], release), encoding="utf-8")
    (WEB / "sources.html").write_text(build_sources(pages["web/cleaner.html"], release), encoding="utf-8")
    print("built web/index.html and web/sources.html from", ipk, "(%s)" % release)


if __name__ == "__main__":
    main()
