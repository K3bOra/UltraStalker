# Ultra Stalker — Change Log
# الترا ستالكر — سجل الإصدارات

For the authoritative current version and download metadata, see [update.json](update.json).

لمعرفة الإصدار الحالي وبيانات التحميل الرسمية، راجع [update.json](update.json).

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


