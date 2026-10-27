<div align="center">

[![Ultra Stalker — Premium Enigma2 Media Hub / تجربة ترفيه متكاملة](assets/ultrastalker-hero.png)](assets/ultrastalker-hero.png)

### Your media. Beautifully connected.
### محتواك المفضل… في تجربة واحدة متكاملة.

Live TV, movies, series and your local library — built for Enigma2.

بث مباشر وأفلام ومسلسلات ومكتبتك المحلية — على أجهزة Enigma2.

[![Release / الإصدار](https://img.shields.io/github/v/release/K3bOra/UltraStalker?style=for-the-badge&label=RELEASE&labelColor=321d24&color=43bb87)](https://github.com/K3bOra/UltraStalker/releases/latest)
[![Platform / المنصة](https://img.shields.io/badge/PLATFORM-Enigma2-172724?style=for-the-badge&labelColor=321d24&color=43bb87)](#compatibility)
[![Python / بايثون](https://img.shields.io/badge/PYTHON-3.12%E2%80%933.15-172724?style=for-the-badge&labelColor=321d24&color=43bb87)](#compatibility)
[![Downloads / التنزيلات](https://img.shields.io/github/downloads/K3bOra/UltraStalker/total?style=for-the-badge&labelColor=321d24&color=43bb87)](https://github.com/K3bOra/UltraStalker/releases)

Platform: Enigma2 · Python: 3.12–3.15 · Official release and download count above.

المنصة: Enigma2 · بايثون: 3.12–3.15 · الشارات بالأعلى تعرض الإصدار الرسمي وعدد التنزيلات.

[![Install Ultra Stalker / تثبيت الترا ستالكر](assets/action-install.svg)](#install)
[![Official releases / الإصدارات الرسمية](assets/action-releases.svg)](https://github.com/K3bOra/UltraStalker/releases)

**[التثبيت الرسمي](#install) · [تحميل الإصدارات الرسمية](https://github.com/K3bOra/UltraStalker/releases)**

[What's new](#whats-new) · [Screenshots](#experience) · [Features](#features) · [Compatibility](#compatibility) · [Install](#install) · [FAQ](#faq)

[الجديد](#whats-new) · [الصور](#experience) · [المميزات](#features) · [التوافق](#compatibility) · [التثبيت](#install) · [الأسئلة الشائعة](#faq)

</div>

---

<a name="overview"></a>

## Meet Ultra Stalker
### تعرّف على الترا ستالكر

Bring Portal, Xtream and M3U sources together with Live TV, cinematic movie and series browsing, global search, favorites and HDD/USB media — without switching between plugins.

اجمع مصادر Portal وXtream وM3U في واجهة واحدة للبث المباشر، وتصفح الأفلام والمسلسلات بعرض سينمائي، والبحث الشامل، والمفضلة، ومحتوى الهارد والفلاشة — من غير التنقل بين بلجنات مختلفة.

Dark panels, subtle red-to-emerald accents, reusable artwork and straightforward remote navigation keep the experience consistent.

واجهات داكنة وتدرجات هادئة من الأحمر للأخضر، مع حفظ الصور لإعادة استخدامها وتنقل واضح بالريموت، لتجربة متناسقة في كل الأقسام.

> Ultra Stalker is a media interface. Supply your own lawful content sources; no subscriptions or copyrighted content are included.
>
> الترا ستالكر واجهة لتشغيل المحتوى. أضف مصادر المحتوى القانونية الخاصة بك؛ البلجن لا يتضمن اشتراكات أو محتوى محميًا بحقوق النشر.

---

<a name="whats-new"></a>

## What's new — V9.2.5 · Revision 572
### الجديد في V9.2.5 · المراجعة 572

The latest published release is **V9.2.5**. These notes describe that release.

أحدث إصدار منشور هو **V9.2.5**، والملاحظات التالية تخص هذا الإصدار.

- **Package integrity:** fixed verification failures after temporary Python bytecode files are cleaned.<br>**سلامة الحزمة:** إصلاح فشل التحقق بعد تنظيف ملفات بايثون المؤقتة.
- **Installation:** skip optional bytecode compilation when `py_compile` is unavailable, while still reporting genuine source compilation errors.<br>**التثبيت:** تجاوز تجميع ملفات بايثون الاختياري عند غياب `py_compile`، مع الاستمرار في إظهار أخطاء تجميع السورس الحقيقية.
- **Live shortcut:** confirmed that **0** already restarts the current live stream; its existing mapping is retained.<br>**اختصار اللايف:** التأكد من أن زر **0** يعيد تشغيل البث الحالي، مع الحفاظ على تعيينه الموجود.

[Full release notes and downloads](https://github.com/K3bOra/UltraStalker/releases/latest) · [Previous versions](CHANGELOG.md)

[تفاصيل الإصدار والتحميل](https://github.com/K3bOra/UltraStalker/releases/latest) · [سجل الإصدارات السابقة](CHANGELOG.md)

---

<a name="experience"></a>

## The experience
### جولة داخل البلجن

### Home — Your media in one place
#### الرئيسية — كل محتواك في مكان واحد

Discover content, return to recently viewed titles and reach your sources from one dashboard.

اكتشف المحتوى، وارجع لما شاهدته مؤخرًا، ووصل لمصادرك من شاشة رئيسية واحدة.

[![Home / الشاشة الرئيسية](docs/screenshots/02_home_cinematic.jpg)](docs/screenshots/02_home_cinematic.jpg)

### Live TV — Channels and guide
#### البث المباشر — القنوات ودليل البرامج

Browse categories, channels and Now/Next guide information in an interface designed for the TV.

تصفح التصنيفات والقنوات، واعرف البرنامج الحالي والتالي من واجهة مصممة للتلفزيون.

| Live TV Grid<br>شبكة قنوات البث المباشر | Channel Browser<br>قائمة القنوات |
|:---:|:---:|
| [![Live TV grid / شبكة القنوات](docs/screenshots/03_live_tv.jpg)](docs/screenshots/03_live_tv.jpg) | [![Channel browser / قائمة القنوات](docs/screenshots/04_live_channels.jpg)](docs/screenshots/04_live_channels.jpg) |

<details>
<summary><b>More Live TV — Guide & EPG / المزيد — دليل البرامج</b></summary>

[![EPG / دليل البرامج](docs/screenshots/05_live_epg.jpg)](docs/screenshots/05_live_epg.jpg)

</details>

### Movies & Series — Cinematic discovery
#### الأفلام والمسلسلات — تجربة تصفح سينمائية

Explore poster grids, backdrops, cast and title details when metadata is available.

تصفح البوسترات والخلفيات وطاقم العمل وتفاصيل العناوين عند توفر بياناتها.

| Cinematic Browsing<br>التصفح السينمائي | Poster Grid<br>شبكة البوسترات |
|:---:|:---:|
| [![Cinematic browsing / التصفح السينمائي](docs/screenshots/10_cinematic_browse.jpg)](docs/screenshots/10_cinematic_browse.jpg) | [![Poster grid / شبكة البوسترات](docs/screenshots/08_poster_grid.jpg)](docs/screenshots/08_poster_grid.jpg) |
| **Movie Details**<br>تفاصيل الفيلم | **Series Details**<br>تفاصيل المسلسل |
| [![Movie details / تفاصيل الفيلم](docs/screenshots/06_movie_details.jpg)](docs/screenshots/06_movie_details.jpg) | [![Series details / تفاصيل المسلسل](docs/screenshots/13_series_details.jpg)](docs/screenshots/13_series_details.jpg) |

<details>
<summary><b>More cinematic views / المزيد من شاشات العرض السينمائي</b></summary>

**Discovery**<br>اكتشاف المحتوى

[![Discovery / اكتشاف المحتوى](docs/screenshots/07_cinematic_discovery.jpg)](docs/screenshots/07_cinematic_discovery.jpg)

**Series Grid**<br>شبكة المسلسلات

[![Series grid / شبكة المسلسلات](docs/screenshots/09_series_grid.jpg)](docs/screenshots/09_series_grid.jpg)

</details>

### Search — Find what you love
#### البحث — وصل للمحتوى اللي بتحبه

Search across media, browse movie and series results, and return to your search history.

ابحث في المحتوى، وتصفح نتائج الأفلام والمسلسلات، وارجع لسجل عمليات البحث.

[![Search / البحث](docs/screenshots/14_search.jpg)](docs/screenshots/14_search.jpg)

### Your library — Local Media & Favorites
#### مكتبتك — المحتوى المحلي والمفضلة

Browse HDD/USB media and organize favorite content in the same experience.

تصفح محتوى الهارد والفلاشة، ونظم المحتوى المفضل عندك من نفس الواجهة.

| Local Library<br>المكتبة المحلية | Favorites<br>المفضلة |
|:---:|:---:|
| [![Local library / المكتبة المحلية](docs/screenshots/11_local_library.jpg)](docs/screenshots/11_local_library.jpg) | [![Favorites / المفضلة](docs/screenshots/12_favorites.jpg)](docs/screenshots/12_favorites.jpg) |

### Sources & Settings
#### المصادر والإعدادات

Manage your saved sources and adjust playback, language, appearance, performance and storage.

أدر مصادر المحتوى المحفوظة، واضبط التشغيل واللغة والمظهر والأداء والتخزين.

| Portal Management<br>إدارة البورتلات | Settings<br>الإعدادات |
|:---:|:---:|
| [![Portal manager / إدارة البورتلات](docs/screenshots/01_portal_manager_private.jpg)](docs/screenshots/01_portal_manager_private.jpg) | [![Settings / الإعدادات](docs/screenshots/15_settings.jpg)](docs/screenshots/15_settings.jpg) |

Connection identifiers in the Portal Manager screenshot have been permanently redacted.

تم إخفاء بيانات الاتصال الظاهرة في صورة إدارة البورتلات نهائيًا قبل نشرها.

---

<a name="features"></a>

## Built around your media
### مميزات تناسب طريقة مشاهدتك

| Experience<br>القسم | What it offers<br>المميزات |
|:---|:---|
| **Live TV**<br>البث المباشر | Portal, Xtream and M3U sources; Now/Next EPG; stream quality detection and automatic retry.<br>مصادر Portal وXtream وM3U، ودليل البرنامج الحالي والتالي، والتعرف على جودة البث وإعادة المحاولة تلقائيًا. |
| **Movies & Series**<br>الأفلام والمسلسلات | Cinematic and poster grid views, metadata matching, artwork and title logos when available.<br>عرض سينمائي وشبكات بوسترات، ومطابقة بيانات المحتوى والصور وشعارات العناوين عند توفرها. |
| **Title Details**<br>تفاصيل المحتوى | Overviews, ratings, genres, cast, runtime, writers and directors when metadata is available.<br>وصف وتقييم وتصنيفات وطاقم العمل والمدة والكاتب والمخرج عند توفر البيانات. |
| **Search**<br>البحث | Live TV, movies and series search, server-wide discovery and search history.<br>البحث في القنوات والأفلام والمسلسلات، واكتشاف المحتوى على السيرفر وحفظ سجل البحث. |
| **Local Media**<br>المحتوى المحلي | HDD/USB indexing, folder browsing and season/episode recognition.<br>فهرسة الهارد والفلاشة، وتصفح المجلدات والتعرف على المواسم والحلقات. |
| **Favorites**<br>المفضلة | Separate favorites, custom folders and manual ordering.<br>قوائم مفضلة منفصلة ومجلدات مخصصة وترتيب يدوي. |
| **Playback**<br>التشغيل | Resume, aspect ratio controls, subtitle options and playback information.<br>استكمال المشاهدة، وضبط أبعاد الصورة وخيارات الترجمة ومعلومات التشغيل. |
| **Languages**<br>اللغات | 29 interface languages with right-to-left support.<br>٢٩ لغة للواجهة مع دعم الكتابة من اليمين لليسار. |
| **Performance**<br>الأداء | Persistent artwork cache and fewer repeated TMDb requests.<br>حفظ صور المحتوى لإعادة استخدامها وتقليل طلبات TMDb المتكررة. |
| **Management**<br>الإدارة | Web-based source management, backup/restore, export and online updates.<br>إدارة المصادر من الويب، والنسخ الاحتياطي والاستعادة والتصدير والتحديث أونلاين. |

<details>
<summary><b>Advanced capabilities / مميزات إضافية</b></summary>

- Reusable posters, backdrops and logos, with 1080p trailer preference when supported.<br>إعادة استخدام البوسترات والخلفيات والشعارات، مع تفضيل تريلر بدقة 1080p عند دعمه.
- Local series recognition using names such as `S01E01` and `1x01`.<br>التعرف على حلقات المسلسلات المحلية بأسماء مثل `S01E01` و`1x01`.
- Local media remains available when a remote Portal is offline.<br>المحتوى المحلي يظل متاحًا عند انقطاع البورتال.
- Enigma2 Bouquet and M3U export.<br>تصدير المحتوى إلى باقات Enigma2 وقوائم M3U.
- Embedded, external and online subtitles, with SubsSupport integration when available.<br>ترجمة مدمجة وخارجية وأونلاين، مع تكامل SubsSupport عند توفره.
- Upgrades are designed to preserve portals, favorites, history and artwork caches.<br>التحديثات مصممة للحفاظ على البورتلات والمفضلة والسجل والصور المحفوظة.

</details>

---

<a name="compatibility"></a>

## Compatibility
### التوافق والمتطلبات

| Requirement<br>المتطلب | Details<br>التفاصيل |
|:---|:---|
| Platform<br>المنصة | Enigma2 receivers<br>أجهزة استقبال Enigma2 |
| Python<br>بايثون | 3.12–3.15 |
| Package manager<br>مدير الحزم | `opkg` |
| Access<br>الوصول | Root via Telnet / SSH<br>حساب root عبر Telnet أو SSH |
| Sources<br>المصادر | Stalker Portal · Xtream Codes · M3U |
| Local storage<br>التخزين المحلي | HDD / USB for local media<br>هارد أو فلاشة للمحتوى المحلي |

These are the published package requirements, not confirmation that every receiver and image has been tested.

دي متطلبات الحزمة المنشورة، وليست تأكيدًا إن كل جهاز وصورة تشغيل تم اختبارهم عمليًا.

---

<a name="install"></a>

## Official installation
### التثبيت الرسمي

Open Telnet or SSH on a compatible receiver as **root**, then run:

افتح Telnet أو SSH على رسيفر متوافق بحساب **root**، ثم نفّذ:

```sh
wget -qO- https://raw.githubusercontent.com/K3bOra/UltraStalker/main/install.sh | /bin/sh
```

The installer reads the latest official release and checks the package size, SHA-256, name, version and architecture before installing with `opkg`.

المُثبّت يقرأ أحدث إصدار رسمي، ويتحقق من حجم الحزمة وبصمة SHA-256 واسمها ورقمها ومعماريتها قبل التثبيت باستخدام `opkg`.

[Review the installer](install.sh) · [Download the latest IPK](https://github.com/K3bOra/UltraStalker/releases/latest)

[راجع سكربت التثبيت](install.sh) · [حمّل أحدث حزمة IPK](https://github.com/K3bOra/UltraStalker/releases/latest)

> Installation may restart Enigma2. Back up important receiver settings first.
>
> التثبيت قد يعيد تشغيل واجهة Enigma2. احتفظ بنسخة احتياطية من إعدادات الرسيفر المهمة أولًا.

---

<a name="faq"></a>

## Troubleshooting & FAQ
### حل المشاكل والأسئلة الشائعة

<details>
<summary><b>Installation failed — what should I check?<br>التثبيت فشل — أراجع إيه؟</b></summary>

Check that you are using **root**, Python **3.12–3.15**, an active internet connection and enough free temporary storage. Keep the full error output when reporting a problem.

تأكد إنك داخل بحساب **root**، وإن بايثون **3.12–3.15**، والإنترنت شغال وفيه مساحة مؤقتة كافية. احتفظ برسالة الخطأ كاملة لو هتبلغ عن المشكلة.

</details>

<details>
<summary><b>My Portal is offline — is my library lost?<br>البورتال مش متصل — هل مكتبتي ضاعت؟</b></summary>

Local media remains available. Check your saved source details and connection in Portal Management.

المحتوى المحلي يظل متاحًا. راجع بيانات المصدر المحفوظة والاتصال من إدارة البورتلات.

</details>

<details>
<summary><b>Posters or artwork are missing.<br>البوسترات أو صور المحتوى مش ظاهرة.</b></summary>

Check the internet connection and allow time on the first browse. Artwork depends on metadata matching and is cached for later use.

راجع اتصال الإنترنت واديه وقت في أول تصفح. الصور تعتمد على مطابقة بيانات المحتوى، وبعد تحميلها بتتحفظ للاستخدام بعد كده.

</details>

<details>
<summary><b>Will an update remove my settings?<br>هل التحديث هيمسح إعداداتي؟</b></summary>

Upgrades are designed to preserve portals, favorites, history and artwork caches. Keep a backup of important receiver settings.

التحديثات مصممة للحفاظ على البورتلات والمفضلة والسجل والصور المحفوظة. احتفظ بنسخة احتياطية من إعدادات الرسيفر المهمة.

</details>

<details>
<summary><b>How do I report a problem?<br>أبلغ عن مشكلة إزاي؟</b></summary>

[Open an issue](https://github.com/K3bOra/UltraStalker/issues) with the receiver model, image, Python version, plugin version, steps to reproduce and full error text. Remove private connection details first.

[افتح بلاغ مشكلة](https://github.com/K3bOra/UltraStalker/issues)، واكتب موديل الرسيفر واسم الصورة وإصدار بايثون والبلجن وخطوات ظهور المشكلة ورسالة الخطأ كاملة. امسح بيانات الاتصال الخاصة قبل النشر.

</details>

---

<a name="resources"></a>

## Updates & resources
### التحديثات والروابط المهمة

The installer and current plugin updater use the manifest attached to the latest official release. The repository copy is synchronized after publishing.

المُثبّت ومحدّث البلجن الحالي بيعتمدوا على ملف بيانات أحدث إصدار رسمي، والنسخة الموجودة في المستودع بتتزامن بعد النشر.

- [Official releases](https://github.com/K3bOra/UltraStalker/releases)<br>[الإصدارات الرسمية](https://github.com/K3bOra/UltraStalker/releases)
- [Latest release manifest](https://github.com/K3bOra/UltraStalker/releases/latest/download/update.json)<br>[ملف بيانات أحدث إصدار](https://github.com/K3bOra/UltraStalker/releases/latest/download/update.json)
- [Repository manifest](update.json)<br>[نسخة بيانات التحديث في المستودع](update.json)
- [Version history](CHANGELOG.md)<br>[سجل الإصدارات](CHANGELOG.md)
- [Publishing guide](RELEASING.md)<br>[دليل نشر الإصدارات](RELEASING.md)

---

<a name="privacy"></a>

## Share with confidence
### شارك من غير كشف بياناتك

Before sharing screenshots or error logs, remove Portal URLs, server IPs, MAC addresses, usernames, passwords, API keys and access tokens.

قبل مشاركة الصور أو سجلات الأخطاء، امسح روابط البورتلات وعناوين السيرفر وأرقام MAC وأسماء المستخدمين وكلمات المرور ومفاتيح API ورموز الوصول.

---

## License
### الترخيص

Released under the [MIT License](LICENSE).

المشروع منشور بترخيص [MIT](LICENSE).

---

<div align="center">

**ULTRA STALKER** · Premium media experience for Enigma2

**الترا ستالكر** · تجربة ترفيه متكاملة لأجهزة Enigma2

Developed and maintained by **Ahmed L-HadarY**

تطوير وصيانة **Ahmed L-HadarY**

[GitHub Repository](https://github.com/K3bOra/UltraStalker)<br>
[المستودع الرسمي على GitHub](https://github.com/K3bOra/UltraStalker)

</div>

