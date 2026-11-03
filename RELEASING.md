# نشر إصدارات Ultra Stalker

1. ضع النسختين النهائيتين في `packages/Ultra_Stalker_Final.ipk` و`packages/Ultra_Stalker_DreamOS_Py2.deb`.
2. ارفع رقم الإصدار والمراجعة في النسختين وحدّث `release-notes.json` بنفس الإصدار.
3. شغّل `python3 -B scripts/prepare_release.py` ثم `python3 -B scripts/test_blue_cache.py` محلياً. تحتاج اختبارات الصور Pillow.
4. من Actions اختر Publish verified Ultra Stalker release ثم Run workflow على main.

الإجراء يفحص الحزمتين دون تثبيتهما، ويختبر كاش البوسترات بمسار التحميل الحقيقي مع بدائل لاتصال الشبكة فقط. ثم يجهز ملفات التحديث المنفصلة وبصمات الملفات، ويرفع مسودة، وينزل المرفقات ويطابقها قبل النشر كـ Latest. بعد النشر يفحص التنزيل العام للحزمتين ويحدّث ملفات التحديث الأربعة في المستودع.

الإصدارات المنشورة لا تستبدل؛ ارفع رقم الإصدار عند أي تعديل. يدعم Open ملفات update.json وupdate-ipk.json، وتدعم DreamOS ملفات update-dreamos-py2.json وupdate-dreamos.json. أمر install.sh الحالي مخصص لـ Open/Python 3؛ DreamOS يستخدم DEB أو التحديث من داخل البلجن.

فحوص الحزم والتوزيع لا تغني عن تجربة أجهزة Enigma2 الفعلية.
