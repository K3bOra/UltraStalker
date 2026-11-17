/* Ultra Stalker Web — language.

   The page is built in English. In Arabic (the default) every text the page
   shows is translated as it appears: fixed labels by exact match, counters and
   generated lines by pattern. Switching language saves the choice and reloads. */
(function () {
  "use strict";
  const KEY = "us-web-lang";
  // The site is in English (Arabic text still shows in Cairo). The Arabic
  // translation below is kept for later but is switched off.
  const lang = "en";
  try {
    localStorage.removeItem(KEY);
  } catch (_) {}
  const AR = lang === "ar";
  document.documentElement.lang = lang;
  document.documentElement.classList.add("lang-" + lang);

  const MEDIA = { Live: "البث المباشر", Movies: "الأفلام", Series: "المسلسلات" };
  const EXACT = {
    "‹ Categories": "‹ الأقسام",
    "‹ Back": "‹ رجوع",
    "‹ Seasons": "‹ المواسم",
    "‹ Browse": "‹ رجوع",
    "Choose Player": "اختار المشغل",
    "Play here": "شغّل هنا",
    "In this browser": "جوه المتصفح",
    "Native Player": "مشغل الجهاز",
    "Play": "تشغيل",
    "Favorite": "مفضلة",
    "Try again": "حاول تاني",
    "Search": "بحث",
    "Episodes": "حلقات",
    "Choose a saved source…": "اختار مصدر…",
    "Loading saved sources…": "بنجيب المصادر…",
    "Loading series information…": "بنجهز معلومات المسلسل…",
    "Loading movie information…": "بنجهز معلومات الفيلم…",
    "Loading seasons…": "بنجيب المواسم…",
    "Loading episodes…": "بنجيب الحلقات…",
    "No seasons returned": "مفيش مواسم",
    "End of this category": "خلصت القايمة",
    "Scroll to load more": "انزل لتحت عشان يحمّل أكتر",
    "Keep scrolling": "كمّل نزول",
    "Categories will appear here.": "الأقسام هتظهر هنا.",
    "Choose a category.": "اختار قسم.",
    "Choose a saved source to load categories.": "اختار مصدر عشان الأقسام تظهر.",
    "No episodes returned for this season.": "مفيش حلقات للموسم ده.",
    "Episodes unavailable.": "الحلقات مش متاحة دلوقتي.",
    "Stream unavailable": "البث مش متاح",
    "Opening stream…": "بيفتح البث…",
    "Loading…": "بيحمّل…",
    "Press ▶ to start": "دوس ▶ عشان يبدأ",
    "Can't play here": "مش هيشتغل هنا",
    "Favorites": "المفضلة",
    "Live": "البث المباشر",
    "Movies": "الأفلام",
    "Series": "المسلسلات",
    "Movie information is unavailable right now. Playback is still available.": "معلومات الفيلم مش متاحة دلوقتي، بس التشغيل شغال.",
    "No additional description is available for this movie.": "مفيش وصف للفيلم ده.",
    "No additional description is available for this series.": "مفيش وصف للمسلسل ده.",
    // Sources & Backup page
    "‹ Browse Home": "‹ الرئيسية",
    "Saved in this browser • private": "محفوظ في المتصفح ده • خاص",
    "Sources & Backup": "المصادر والباك اب",
    "Your servers, everywhere.": "سيرفراتك في أي مكان",
    "Add and edit Portal, Xtream and M3U servers, then move them between this site and your receiver with a backup file.": "ضيف وعدّل سيرفرات البورتال والـ Xtream والـ M3U، وانقلها بين الموقع والرسيفر بملف باك اب.",
    "STALKER PORTAL / XTREAM & M3U": "بورتال ستالكر / XTREAM و M3U",
    "Add Connection": "إضافة مصدر",
    "＋ Add Connection": "＋ إضافة مصدر",
    "Add a source to this site.": "ضيف مصدر للموقع.",
    "SAVED SOURCES": "المصادر المحفوظة",
    "Manage Servers": "إدارة السيرفرات",
    "Edit, reorder or remove saved servers.": "عدّل أو رتّب أو امسح السيرفرات المحفوظة.",
    "Add Portal, Xtream or M3U. Saved connections stay in this browser; use Backup to move them to the receiver.": "ضيف بورتال أو Xtream أو M3U. المصادر بتتحفظ في المتصفح ده، واستخدم الباك اب عشان تنقلها للرسيفر.",
    "This browser": "المتصفح ده",
    "Stalker Portal": "بورتال ستالكر",
    "Type": "النوع",
    "Name (optional)": "الاسم (اختياري)",
    "Portal URL": "رابط البورتال",
    "MAC address": "الماك",
    "Username": "اسم المستخدم",
    "Password": "الباسورد",
    "◉ Test Connection": "◉ اختبر الاتصال",
    "＋ Save Connection": "＋ احفظ المصدر",
    "Choose a connection type, enter its details, then test or save it.": "اختار النوع، اكتب البيانات، وبعدين اختبر أو احفظ.",
    "Choose a group, then select the server to edit or reorder.": "اختار المجموعة، وبعدين اختار السيرفر اللي عايز تعدّله أو ترتّبه.",
    "Position / Order": "الترتيب",
    "Name": "الاسم",
    "Save Changes": "احفظ التعديلات",
    "Remove": "امسح",
    "No sources in this category": "مفيش مصادر هنا",
    "‹ Browse Ultra Stalker": "‹ ارجع للموقع",
    "Backup & Restore": "باك اب الرسيفر",
    "Load the backup file your receiver made, or save this site's servers and Favorites as a backup the receiver can restore.": "ارفع ملف الباك اب اللي عمله الرسيفر، أو احفظ سيرفرات الموقع والمفضلة في ملف الرسيفر يقدر يرجّعه.",
    "FROM THE RECEIVER · من الرسيفر": "من الرسيفر",
    "TO THE RECEIVER · للرسيفر": "للرسيفر",
    "Load receiver backup": "ارفع باك اب الرسيفر",
    "On the receiver: Settings › Storage & Maintenance › Backup & Restore › Create portable backup. Copy the file": "على الرسيفر: Settings › Storage & Maintenance › Backup & Restore › Create portable backup. انسخ الملف",
    "from": "من",
    "and choose it here. It replaces the servers and Favorites saved on this site.": "واختاره هنا. هيحل محل السيرفرات والمفضلة اللي على الموقع.",
    "＋ Choose backup file": "＋ اختار ملف الباك اب",
    "Save backup for the receiver": "احفظ باك اب للرسيفر",
    "Downloads": "بينزّل",
    "with the servers and Favorites from this site. Put it in": "فيه السيرفرات والمفضلة اللي على الموقع. حطه في",
    ", then on the receiver open Backup & Restore › Restore backup.": "، وبعدين على الرسيفر افتح Backup & Restore › Restore backup.",
    "⇩ Save backup file": "⇩ احفظ ملف الباك اب",
    "Nothing saved on this site yet. Load your receiver backup to bring your servers and Favorites here.": "لسه مفيش حاجة محفوظة هنا. ارفع باك اب الرسيفر عشان سيرفراتك ومفضلتك تيجي هنا.",
    "Checking this browser…": "بنشوف المتصفح…",
  };
  const RULES = [
    [/^(\d+) categories • (Live|Movies|Series)$/, (m) => m[1] + " قسم • " + MEDIA[m[2]]],
    [/^(\d+) of (\d+) loaded$/, (m) => m[1] + " من " + m[2]],
    [/^(\d+) loaded$/, (m) => m[1]],
    [/^(Live|Movies|Series) folder$/, (m) => "قسم · " + MEDIA[m[1]]],
    [/^(\d+) Episodes?$/i, (m) => m[1] + " حلقة"],
    [/^(\d+) episodes?$/i, (m) => m[1] + " حلقة"],
    [/^Episode (\d+)$/, (m) => "الحلقة " + m[1]],
    [/^Season (\d+)$/, (m) => "الموسم " + m[1]],
    [/^(.+) • preparing stream…$/, (m) => m[1] + " • بنجهز البث…"],
    [/^(.+) • choose a player$/, (m) => m[1] + " • اختار المشغل"],
    [/^(Live|Movies|Series) • (\d+) saved items?$/, (m) => MEDIA[m[1]] + " • " + m[2] + " محفوظ"],
    [/^(\d+) saved sources?$/, (m) => m[1] + " مصدر محفوظ"],
    [/^(\d+) · Saved sources$/, (m) => m[1] + " · مصادر محفوظة"],
    [/^(\d+) sources? · (\d+) favorites?$/, (m) => m[1] + " مصدر · " + m[2] + " مفضلة"],
  ];
  function tr(v) {
    const t = v.trim();
    if (!t || t.length > 400) return null;
    if (Object.prototype.hasOwnProperty.call(EXACT, t)) return v.replace(t, EXACT[t]);
    if (t.length > 160) return null;
    for (const [re, fn] of RULES) {
      const m = t.match(re);
      if (m) return v.replace(t, fn(m));
    }
    return null;
  }
  const SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, SELECT: 1, OPTION: 1, CODE: 1 };
  function textNode(n) {
    const p = n.parentNode;
    if (!p || SKIP[p.nodeName] || (p.closest && p.closest("[data-no-tr]"))) return;
    const out = tr(n.nodeValue);
    if (out !== null && out !== n.nodeValue) n.nodeValue = out;
  }
  function walk(root) {
    if (root.nodeType === 3) return textNode(root);
    if (root.nodeType !== 1 || SKIP[root.nodeName]) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) textNode(n);
  }
  if (AR) {
    new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === "characterData") textNode(m.target);
        else m.addedNodes.forEach(walk);
      }
    }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    document.addEventListener("DOMContentLoaded", () => walk(document.body));
  }

  window.USLang = {
    lang,
    ar: AR,
    t: (en, ar) => (AR ? ar : en),
    set(next) {
      try {
        localStorage.setItem(KEY, next === "en" ? "en" : "ar");
      } catch (_) {}
      location.reload();
    },
    toggle() {
      this.set(AR ? "en" : "ar");
    },
  };
})();
