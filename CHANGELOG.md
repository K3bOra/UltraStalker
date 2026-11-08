# Ultra Stalker — Change Log
# الترا ستالكر — سجل الإصدارات

For the authoritative current version and download metadata, see [update.json](update.json).

لمعرفة الإصدار الحالي وبيانات التحميل الرسمية، راجع [update.json](update.json).

## V9.3.4 · Revision 583
### V9.3.4 · المراجعة 583

- Improved YouTube trailer resolution and playback, with 1080p preferred and 720p or lower fallback when available.<br>تحسين جلب وتشغيل تريلرات يوتيوب، مع أولوية لجودة 1080p والرجوع لـ720p أو أقل حسب المتاح.

- Web management starts automatically and opens without a PIN on the local network by default. Explicit Web Cleaner settings are respected.<br>صفحة إدارة السيرفرات بتشتغل تلقائيًا وبتفتح من الشبكة المحلية من غير PIN افتراضيًا، مع احترام الإعدادات اللي اخترتها بنفسك.

[Release and downloads](https://github.com/K3bOra/UltraStalker/releases/tag/v9.3.4)<br>
[تفاصيل الإصدار والتحميل](https://github.com/K3bOra/UltraStalker/releases/tag/v9.3.4)

## V9.3.3 · Revision 582
### الجديد في V9.3.3 · المراجعة 582

- Two source cards for Stalker Portal and Xtream / M3U, with green Online status and local playlist browsing.<br>كارتين للمصادر، Stalker Portal وXtream / M3U، مع حالة Online باللون الأخضر وإمكانية تصفّح قوائم M3U المحلية.

- Edit and reorder each source group separately in Manage Servers. Web Cleaner starts automatically with PIN / QR protection by default.<br>تعديل وترتيب كل مجموعة سيرفرات لوحدها من الويب. Web Cleaner بيشتغل تلقائيًا بحماية PIN أو QR افتراضيًا.

- Search shows Xtream / M3U results as they arrive and limits simultaneous requests.<br>عرض نتائج بحث Xtream وM3U أول ما تظهر، مع تقليل عدد الطلبات اللي بتشتغل في نفس الوقت.

- Local opens mounted drives without waiting for a media scan. Refresh rebuilds the library when requested.<br>فتح الهارد والفلاشة من Local مباشرةً، وتحديث فهرس المكتبة عند الضغط على Refresh.

- Check Artwork reuses cached images and prepares title logos for different views.<br>إعادة استخدام الصور المحفوظة وتجهيز شعارات العناوين لأكتر من واجهة عند فحص الصور.

- Updated the Live channel list, picons and poster frames in the player, and restored Recent and Continue cards.<br>تحسين قائمة قنوات اللايف وأيقوناتها وإطارات البوسترات في المشغّل، واسترجاع عرض آخر المشاهدات ومتابعة المشاهدة.

- Added Free Portal and Free Xtream catalogs, and cleaned up unused picons when exported bouquets are removed.<br>إضافة قوائم Free Portal وFree Xtream، وتنظيف أيقونات القنوات غير المستخدمة عند حذف الباقات المصدّرة.

[Release and downloads](https://github.com/K3bOra/UltraStalker/releases/tag/v9.3.3)<br>
[تفاصيل الإصدار والتحميل](https://github.com/K3bOra/UltraStalker/releases/tag/v9.3.3)

## V9.3.2 · Revision 581
### الجديد في V9.3.2 · المراجعة 581

- Improve plugin responsiveness and smoother navigation between pages.<br>تحسين خفة البلجن وسلاسة التنقل بين الصفحات.

- Speed up posters, backdrops and title logos.<br>تسريع ظهور البوسترات والخلفيات وشعارات العناوين.

- Improve Check Artwork scanning and artwork caching.<br>تحسين فحص الصور وملفات العرض (Check Artwork).

- Interface improvements for a faster, smoother experience.<br>تحسينات في الواجهات لتجربة استخدام أسرع وأكثر سلاسة.

[Release and downloads](https://github.com/K3bOra/UltraStalker/releases/tag/v9.3.2)<br>
[تفاصيل الإصدار والتحميل](https://github.com/K3bOra/UltraStalker/releases/tag/v9.3.2)

## V9.2.5 · Revision 572 — 2026-10-26
### V9.2.5 · المراجعة 572

- Fix package integrity failures after temporary Python bytecode is cleaned.<br>إصلاح فشل فحص سلامة الحزمة بعد تنظيف ملفات بايثون المؤقتة.
- Skip optional bytecode compilation when py_compile is unavailable; report genuine source compilation errors.<br>تجاوز تجميع ملفات بايثون الاختياري عند غياب py_compile، مع إظهار أخطاء تجميع السورس الحقيقية.
- Confirm key 0 restarts the current live stream; retain its existing mapping.<br>التأكد من أن زر 0 يعيد تشغيل البث الحالي، مع الحفاظ على تعيينه الموجود.

[Release and downloads](https://github.com/K3bOra/UltraStalker/releases/tag/v9.2.5)<br>
[تفاصيل الإصدار والتحميل](https://github.com/K3bOra/UltraStalker/releases/tag/v9.2.5)

---

## Earlier history
### السجل السابق

## V9.2.3 (Revision 570) — 2026-10-26
### V9.2.3 · المراجعة 570

- Subtitle preservation fix for late-mounted storage (HDD/USB that appears after boot).<br>إصلاح الحفاظ على الترجمة عند تأخر ظهور الهارد أو الفلاشة بعد التشغيل.
- Buffered reader handoff fix for smoother, more reliable playback.<br>إصلاح الانتقال بين مراحل قراءة البافر لتحسين سلاسة التشغيل وثباته.
- General stability and reliability improvements.<br>تحسينات عامة في الاستقرار والموثوقية.
- **Clean release model:** online updates and `install.sh` now read `update.json` from the **latest** GitHub release, and accept any official Ultra Stalker release asset (no single frozen download location). The package name is unchanged, so this installs as a normal upgrade over earlier builds.<br>أصبح المُثبّت والتحديث أونلاين يقرآن ملف بيانات أحدث إصدار رسمي بدل الاعتماد على رابط ثابت لحزمة واحدة. اسم الحزمة ثابت، لذلك يتم تثبيتها كتحديث عادي للإصدارات السابقة.

## Documentation refresh — 2026-10-26
### تحديث التوثيق

- Reorganized the public README with an Enigma2 introduction, premium gallery, categorized feature overview, installation instructions and bilingual guidance.<br>إعادة تنظيم الصفحة الرئيسية بمقدمة ومعرض صور ومميزات مرتبة وتعليمات تثبيت وإرشادات باللغتين.
- Added custom dark/red/emerald brand SVG assets for headers and separators.<br>إضافة رسومات SVG للعناوين والفواصل بألوان الهوية الداكنة والأحمر والأخضر.
- Prepared 15 gallery screenshots. The Portal Manager image permanently masks every visible MAC address and the displayed server URL.<br>تجهيز ١٥ صورة للمعرض، مع إخفاء أرقام MAC ورابط السيرفر الظاهرين في صورة إدارة البورتلات نهائيًا.
- **No plugin, installer, release, or online-update metadata was changed as part of this documentation package.**<br>**هذه الحزمة الخاصة بالتوثيق لم تغيّر البلجن أو المُثبّت أو ملفات الإصدار أو بيانات التحديث أونلاين.**


