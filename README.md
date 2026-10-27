# ⚓ ARN-CPN | ARN Marine Navigator & Chart Plotter

<div align="center">


### **نظام الملاحة وتخطيط المسارات البحرية التكتيكي المتقدم**
### **Advanced Tactical Marine Navigation & Chart Plotter System**

[![License](https://img.shields.io/badge/License-Proprietary-red.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20x64-blue.svg)](https://electronjs.org)
[![Framework](https://img.shields.io/badge/Stack-Electron%20%7C%20Node.js%20%7C%20Canvas%20WebGL-emerald.svg)](https://nodejs.org)
[![Offline](https://img.shields.io/badge/100%25-Offline--First-green.svg)](#)

**تطوير وبرمجة:** عبده رجب نصار  
**الجهة المالكة والمطورة:** شركة ARN Technology  
**جميع الحقوق محفوظة © 2026 لشركة ARN Technology**

---

</div>

## 🌊 نظرة عامة (Overview)

**ARN-CPN (ARN Marine Navigator)** هو نظام ملاحة بحري إلكتروني وتخطيط مسارات متقدم تم تصميمه كبديل سيادي وعصري فائق السرعة لبرامج الملاحة البحرية الكلاسيكية (مثل OpenCPN)، مبني بأحدث تقنيات الويب وسطح المكتب (**Electron.js + Canvas / WebGL 2.0 + Node.js**).

يعمل التطبيق **100% دون أي اتصال بالإنترنت (Offline-First)** لضمان الاستمرارية والاعتمادية التامة في عرض البحار والمحيطات، مع واجهة مستخدم تكتيكية زجاجية داكنة (**Tactical Dark Glassmorphism HUD**) تدعم الرؤية الليلية ومطابقة لأعلى معايير المنظمة الهيدروغرافية الدولية (**IHO S-52 / S-57**).

---

## ⚡ أبرز المزايا والمواصفات (Key Features)

### 🗺️ 1. دعم شامل ومتكامل لكافة صيغ الخرائط الملاحية (Marine Charts)
- **خرائط المتجهات الإلكترونية (S-57 ENC & S-63):** دعم خلايا `.000` و `.001` وفك تشفير ISO/IEC 8211 وعرض طبقات الأعماق (Contours) والمنارات والعلامات الملاحية المضيئة وفق معايير **IHO S-52**.
- **الخرائط النقطية الممسوحة (Raster Marine Charts - BSB / KAP):** دعم ملفات NOAA و Maptech عبر فك ترميز RLE وإسقاطات Polynomial Affine دقيقة.
- **خرائط الرقع المحزومة (MBTiles Offline):** قراءة سريعة لملفات SQLite MBTiles محلياً وبمعدل 60 إطاراً في الثانية.
- **قواعد البيانات العالمية للشواطئ (GSHHS & WVS):** خطوط سواحل تفصيلية متدرجة الدقة مدمجة مسبقاً.

### 📡 2. معالجة الإشارات وأجهزة السفينة (Sensors & NMEA)
- **NMEA 0183 & NMEA 2000:** قراءة وتحليل تيارات البيانات عبر منافذ السيريال (Serial/COM Ports) أو بروتوكولات الشبكة (UDP / TCP).
- **أجهزة الملاحة المدعومة:**
  - GPS / GNSS (GPGGA, GPRMC, GNGLL) لموقع وسرعة وزاوية تحرك السفينة (SOG / COG).
  - البوصلة الإلكترونية والجايرو (HDG / HDT / HDM).
  - مسبار الأعماق الصوتي (Echo Sounder - DBT / DPT).
  - محطات الرصد الجوي وسرعة واتجاه الرياح (WIND - MWV / MWD).
  - مستشعر تسجيل سرعة السفينة في الماء (Water Speed Log - VHW / VLW).

### 🚢 3. تتبع السفن وتفادي التصادم (AIS Target Tracking & CPA/TCPA)
- فك ترميز إشارات **AIS (AIVDM / AIVDO)** الفئتين Class A و Class B.
- محاكاة ورصد الأهداف وحساب مسافة أقرب نقطة اقتراب (**CPA**) والوقت المتبقي حتى الاقتراب (**TCPA**).
- إنذارات بصرية وصوتية ذكية عند الدخول في نطاقات الخطر المحددة.

### 🧭 4. تخطيط المسارات والرحلات (Route Planning & Waypoints)
- وضع وتعديل نقاط المسار (Waypoints) ومحاور الإبحار (Legs).
- حساب المسافات بالزوايا الكبرى (Great Circle) والخطوط الملاحية المنتظمة (Rhumb Line).
- تتبع مسار الرحلة الفعلي (Track Logging) والتسجيل اللحظي مع إمكانية التصدير والاستيراد (GPX / KML).

### 🌙 5. واجهة بحرية تكتيكية (Marine Tactical Glassmorphism HUD)
- تبديل فوري بين أوضاع الرؤية: **الوضع الليلي (Night Red HUD)** لحماية تكيف العين في الظلام، **وضع الشفق (Dusk)**، و**الوضع النهاري (Day)**.
- لوحة بيانات متكاملة لأجهزة القياس (Instrument Dashboard): بوصلة رقمية ثلاثية، مؤشر رياح تكتيكي، ومؤشر أعماق مباشر.
- حركات وانتقالات فائقة السلاسة وتجربة استخدام عصرية وسريعة.

---

## 🛠️ متطلبات التشغيل والتثبيت (Getting Started)

### المتطلبات الأساسية (Prerequisites)
- نظام تشغيل **Windows 10 / 11 (64-bit)**
- بيئة **Node.js 18+** أو أحدث

### خطوات التشغيل والتطوير (Development Setup)

```bash
# استنساخ المستودع
git clone https://github.com/abdournassar95/ARN-CPN.git
cd ARN-CPN

# تثبيت الحزم والاعتماديات
npm install

# تشغيل التطبيق في وضع التطوير
npm start
```

أو تشغيله مباشرة عبر الملف التنفيذي المرفق:
```cmd
Run-DesktopApp.bat
```

---

## 📁 هيكلية المشروع (Project Structure)

```plaintext
ARN-CPN/
├── DesktopApp/               # الكود البرمجي الرئيسي للتطبيق
│   ├── main.js               # المعالج الرئيسي لـ Electron وإدارة النوافذ و IPC
│   ├── preload.js            # جسر الحماية وعزل السياق (Context Isolation)
│   ├── renderer/             # واجهة المستخدم الرسومية
│   │   ├── index.html        # بنية الصفحة والخرائط
│   │   ├── styles.css        # نظام التصميم الزجاجي الداكن (Marine HUD)
│   │   ├── app.js            # منطق إدارة الواجهة وأجهزة القياس
│   │   └── modules/          # المحركات الملاحية والخرائطية
│   │       ├── chartEngine.js    # محرك عرض الخرائط S-57 / MBTiles / GSHHS
│   │       ├── s57Parser.js      # محلل وفك ترميز خرائط S-57 ENC ISO 8211
│   │       ├── nmeaParser.js     # فك وتحليل رسائل NMEA 0183
│   │       ├── aisTracker.js     # تتبع أهداف AIS وحساب CPA/TCPA
│   │       ├── instruments.js    # واجهات أجهزة القياس الرقمية والتناظرية
│   │       ├── routeManager.js   # إدارة وتخطيط المسارات ونقاط الـ Waypoints
│   │       └── tideManager.js    # الحسابات الهيدروغرافية والمد والجزر
├── data/                     # قواعد البيانات الملاحية دون اتصال
│   ├── gshhs/                # خطوط السواحل العالمية GSHHS
│   ├── s57data/              # قواميس ورموز مواصفات IHO S-57 / S-52
│   ├── tcdata/               # بيانات المد والجزر التوافقية (Harmonics)
│   ├── wmm/                  # نموذج المغناطيسية العالمي (World Magnetic Model)
│   ├── navigation/           # مسارات ونقاط ملاحية مخزنة
│   └── world_places.json     # قاعدة بيانات الموانئ والمدن البحرية العالمية
├── assets/                   # الأيقونات والشعارات والوسائط
├── installer/                # سكربتات حزم التثبيت (Inno Setup)
├── build_and_sign.ps1        # سكربت التجميع والتوقيع الرقمي المعتمد
├── MASTER_PLAN.md            # الخطة المعمارية الشاملة والمواصفات التفصيلية
└── LICENSE                   # وثيقة ترخيص الملكية الفكرية لشركة ARN Technology
```

---

## 🔒 الأمان والتوقيع الرقمي (Code Signing & Security)

جميع إصدارات التطبيق التنفيذية وحزم التثبيت يتم توقيعها رقمياً بشهادة معتمدة مشفرة بخوارزمية SHA-256 مع طابع زمني رسمي وفق معيار **RFC-3161** لضمان أعلى مستويات الأمان والموثوقية والتوافق التام مع **Windows 11 Smart App Control**.

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