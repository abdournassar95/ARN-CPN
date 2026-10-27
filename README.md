# ⚓ ARN-CPN | ARN Marine Navigator & Chart Plotter

<div align="center">

### **نظام الملاحة وتخطيط المسارات البحرية التكتيكي المتقدم**
### **Advanced Tactical Marine Navigation & Chart Plotter System**

[![License](https://img.shields.io/badge/License-Proprietary-red.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20x64-blue.svg)](https://electronjs.org)
[![Framework](https://img.shields.io/badge/Stack-Electron%20%7C%20Node.js%20%7C%20Canvas-emerald.svg)](https://nodejs.org)
[![Tests](https://img.shields.io/badge/Tests-36%20node%3Atest-brightgreen.svg)](#-الاختبارات والجودة)

**تطوير وبرمجة:** عبده رجب نصار  
**الجهة المالكة والمطورة:** شركة ARN Technology  
**جميع الحقوق محفوظة © 2026 لشركة ARN Technology**

---

</div>

## 🌊 نظرة عامة (Overview)

**ARN-CPN (ARN Marine Navigator)** هو نظام ملاحة بحرية إلكتروني وتخطيط مسارات مبني على **Electron.js + Canvas 2D + Node.js**، يعمل دون اتصال بالإنترنت (Offline-First) ويعتمد كلياً على البيانات المخزنة محلياً، مع واجهة تكتيكية داكنة (**Tactical Dark Glassmorphism HUD**) تدعم الرؤية الليلية.

> **حالة النضج:** إثبات مفهوم متقدم (Prototype) ذو نواة حسابية مختبرة آلياً، وليس بعد منصة ملاحية معتمدة من هيئات التصنيف. راجع قسم [حدود التنفيذ الحالية](#-حدود-التنفيذ-الحالية-honest-limitations) قبل أي استخدام تشغيلي.

---

## ⚡ المزايا المنفذة فعلاً (Implemented Features)

### 🗺️ 1. الخرائط الملاحية
- **خرائط المتجهات S-57 ENC:** فك خلايا `.000`–`.003` بترميز ISO/IEC 8211 (غير حاجب عبر `parseFileAsync`) وعرض طبقات الأعماق والمنارات والعلامات.
- **الخرائط النقطية BSB / KAP:** مفكك RLE فعلي (`bsb_decoder.js`) مع تحويل إلى صور PNG محلية وعرضها عبر المحرك.
- **MBTiles:** قراءة رقع SQLite حقيقية عبر sql.js مع كاش LRU (4 قواعد مفتوحة، 256 رقعة/إطار).
- **GSHHS:** خطوط سواحل عالمية مدمجة مع كاش LRU بسقف 512 خلية.

### 📡 2. المعالجة والأجهزة
- **NMEA 0183 فقط:** منافذ Serial/COM (SerialPort) وبروتوكولات UDP/TCP، مع رفض الجمل بلا checksum صحيحة.
- جمل مدعومة: RMC/GGA/GLL/HDG/DBT/DPT/MWV/VHW/VLW وغيرها.
- **إرسال تسلسلي فعلي للطيار الآلي** (`autopilot_service.js`) عبر قناة `vessel:control` مع سجل إرسال TX.

### 🚢 3. AIS والسلامة
- فك AIVDM/AIVDO بما في ذلك الرسائل متعددة الأجزاء والنوع 5 (بيانات ثابتة: الاسم/النداء/الأبعاد)، مع كاش متعدد الأجزاء بسق حجمي وتنظيف.
- حساب CPA/TCPA وإنذارات بصرية وصوتية (Web Audio) ومراقبة المخطاف (Anchor Watch) وطوارئ MOB.

### 🧭 4. المسارات والأثر
- حسابات Rhumb Line و Great Circle مع تحقق صارم من الإحداثيات.
- تصدير/استيراد **GPX** كامل (`wpt`/`rte`/`trk`) مع تهريب XML.
- أثر إبحار دائم في `userData` (`track_store.js`)، سقف 20 ألف نقطة وكتابة مجمّعة.

### 🌦️ 5. الطقس والمغناطيسية والمد
- مفكك **GRIB الإصدار 1 فقط** (GRIB2 مرفوض صراحة) مع وضع عرض حقيقي ووضع تجريبي موسوم بوضوح.
- النموذج المغناطيسي **WMM2025** الرسمي مع تحذير انتهاء صلاحية وعرض حالة النموذج في نافذة "حول".
- مد وجزر من بيانات XTide التوافقية (7464 محطة)، مع وسم `isEstimate` صريح للمحطات المقدّرة وعقد نجاح/فشل موحّدة.

---

## ⚠️ حدود التنفيذ الحالية (Honest Limitations)

| البند | الحالة الفعلية |
|---|---|
| **S-63** (الخرائط المشفّرة) | غير منفذ — لا يوجد فك تشفير؛ لا يُعلَن دعمه |
| **NMEA 2000 / PGN / CAN** | غير منفذ — NMEA 0183 فقط حالياً |
| **CM93 v2 / GeoTIFF** | يُكتشف المجلد/الملف فقط مع بطاقة وصفية صادقة؛ لا يوجد مفكك عرض (`renderable: false`) |
| **GRIB2** | مرفوض عمداً برسالة خطأ واضحة (المفكك GRIB1 فقط) |
| **KML** | غير مدعوم؛ التصدير/الاستيراد GPX فقط |
| **التوقيع الرقمي** | شهادة ARN الموقعة ذاتياً تكسب ثقة محلية فقط؛ **Smart App Control/SmartScreen** يتطلبان شهادة OV/EV من مرجع عام وسمعة متراكمة |
| **بيانات المد** | تقديرات توافقية وليست تنبؤات رسمية؛ تُوسَم بـ `isEstimate` دائماً |

---

## 🛠️ التشغيل والتطوير (Getting Started)

### المتطلبات
- **Windows 10 / 11 (64-bit)** للتشغيل المُحزَّم، أو أي نظام يدعم Electron للتطوير
- **Node.js 18+** (محدَّد في حقل `engines`)

```bash
git clone https://github.com/abdournassar95/ARN-CPN.git
cd ARN-CPN
npm install
npm start
```

أو عبر المشغّل المرفق على Windows: `Run-DesktopApp.bat`

### أوامر الجودة

```bash
npm test            # اختبارات الوحدة (node:test) — 36 اختباراً
npm run lint        # ESLint 9 (flat config)
npm run format      # Prettier كتابة
npm run format:check# فحص التنسيق فقط (يستخدمه CI)
```

يعمل خط أنابيب **GitHub Actions** على Node 18/20/22: تثبيت، اختبارات، ESLint، فحص Prettier (راجع `.github/workflows/ci.yml`).

---

## 📁 هيكلية المشروع الفعلية (Project Structure)

```plaintext
ARN-CPN/
├── DesktopApp/
│   ├── main.js               # عملية Electron الرئيسية وكل قنوات IPC ودورة حياة الموارد
│   ├── preload.js            # جسر contextBridge معزول (contextIsolation)
│   ├── nmea_service.js       # محلل NMEA 0183/AIS (checksum، multipart بسقف)
│   ├── autopilot_service.js  # إرسال أوامر الطيار الآلي التسلسلي
│   ├── route_planner.js      # Rhumb/GC + GPX (wpt/rte/trk) + تخزين userData
│   ├── track_store.js        # أثر الإبحار الدائم (سقف 20000 نقطة)
│   ├── s57_decoder.js        # فك S-57 ENC / ISO 8211 (واجهات async)
│   ├── bsb_decoder.js        # فك BSB/KAP RLE وتحويل PNG محلي
│   ├── mbtiles_reader.js     # قارئ MBTiles (sql.js) مع كاش LRU
│   ├── grib_decoder.js       # محلل GRIB1 (يرفض GRIB2)
│   ├── gshhs_provider.js     # سواحل GSHHS مع كاش محدود
│   ├── tides_engine.js       # مد وجزر XTide التوافقي
│   ├── wmm_engine.js         # النموذج المغناطيسي WMM2025
│   ├── chart_scanner.js      # مسح المجلدات بوسوم renderable/status صادقة
│   ├── settings_manager.js   # إعدادات userData (لا كتابة في مجلد التثبيت)
│   └── renderer/
│       ├── index.html        # الواجهة + CSP صارمة
│       ├── styles.css        # تصميم HUD داكن
│       ├── fonts.css         # خطوط محلية (Cairo/JetBrains Mono)
│       ├── app.js            # منطق الواجهة وتهريب كل المخرجات الخارجية
│       ├── chart_engine.js   # محرك Canvas: MBTiles/BSB/S-57/GSHHS/الأثر
│       └── grib_layer.js     # طبقة GRIB (وضع real موسوم مقابل demo)
├── tests/                    # 36 اختبار node:test (routing/nmea/wmm/tides/bsb/grib/track)
├── data/                     # بيانات أوفلاين: gshhs/ s57data/ tcdata/ wmm/
├── assets/                   # أيقونات وخطوط محلية
├── cert/                     # الشهادة العامة (مرجعية — لا تُحقن في الجذر)
├── installer/                # سكربت Inno Setup 7 (تثبيت per-user بلا admin)
├── build_and_sign.ps1        # بناء + توقيع SHA-256/RFC-3161 (اختياري -TrustPublisher)
├── eslint.config.js          # ESLint 9 Flat Config
└── package.json
```

> ملاحظة: بيانات المستخدم (الإعدادات، المسارات، الأثر) تُكتب في مجلد `userData` الخاص بـ Electron، وليس داخل مجلد التثبيت — لذلك يعمل التثبيت per-user بلا صلاحيات مسؤول.

---

## 🔒 الأمان والتوقيع الرقمي (Code Signing & Security)

- **CSP صارمة** في `index.html` (`default-src 'self'`, `object-src 'none'`) مع خطوط محلية بالكامل — لا أي طلب خارجي وقت التشغيل.
- **عزل السياق** مفعّل؛ كل بيانات AIS/GPX الخارجية تُهرَّب قبل الإدراج (`esc()`/`textContent`).
- المثبّت **per-user بلا UAC** ولا يحقن أي شهادة جذر؛ توثيق الناشر في `CurrentUser\TrustedPublisher` مهمة اختيارية غير مفعّلة افتراضياً وتُزال عند إلغاء التثبيت.
- شهادة التوقيع الحالية **موقعة ذاتياً** (SHA-256 مع ختم زمني RFC-3161 عند توفّر الشبكة وقت البناء). هي لا تكسب ثقة SmartScreen على أجهزة نظيفة؛ الترقية لشهادة OV/EV من مرجع شهادات عام بند مستقبلي صريح.

---

## 📞 قنوات التواصل والدعم الفني (Contact & Support)

- **المطور:** عبده رجب نصار (Abdou Ragab Nassar)
- **الشركة:** ARN Technology
- **WhatsApp:** [+201556710314](https://wa.me/201556710314)
- **Telegram:** [@ABDOURNASSAR95](https://t.me/ABDOURNASSAR95)
- **Facebook:** [abdouragab.nassar](https://www.facebook.com/abdouragab.nassar)
- **Email:** abdou314@live.com

---

<div align="center">
  <b>صُنِع بكل فخر وإتقان بواسطة شركة ARN Technology © 2026</b>
</div>
