/**
 * ARN Marine Navigator - World Magnetic Model (WMM) Engine
 * شركة ARN Technology - تطوير وبرمجة: عبده رجب نصار
 * نموذج الحقل المغناطيسي العالمي (100% Offline)
 * حساب الانحراف المغناطيسي (Magnetic Variation / Declination) والميلان بدقة WGS-84
 */

const fs = require('fs');
const path = require('path');

class WMMEngine {
  constructor(cofPath) {
    this.cofPath = cofPath || path.join(__dirname, '..', 'data', 'wmm', 'WMM.COF');
    this.epoch = 2025.0;
    this.modelName = 'WMM';
    this.releaseDate = '';
    // عمر النموذج التصميمي 5 سنوات (WMM-2025 صالح من 2025 حتى 2030)
    this.validFrom = 2025.0;
    this.validUntil = 2030.0;
    this.maxDegree = 12;

    // مصفوفات معاملات كروية هارمونية (Spherical Harmonics Coefficients)
    // g[n][m], h[n][m], dg[n][m], dh[n][m]
    this.c = [];
    this.cd = [];
    this.k = [];

    this._initialized = false;
    this._init();
  }

  _init() {
    try {
      if (!fs.existsSync(this.cofPath)) {
        console.warn(`[WMM] COF file not found at: ${this.cofPath}`);
        return;
      }

      const content = fs.readFileSync(this.cofPath, 'utf8');
      const lines = content.split(/\r?\n/);
      if (lines.length === 0) return;

      // سطر الترويسة: Epoch, Model, Release Date
      const headerTokens = lines[0].trim().split(/\s+/);
      if (headerTokens.length >= 1) {
        this.epoch = parseFloat(headerTokens[0]) || 2025.0;
        this.modelName = headerTokens[1] || 'WMM';
        this.releaseDate = headerTokens.slice(2).join(' ');
        // نافذة الصلاحية الرسمية لأي إصدار WMM هي 5 سنوات من حقبة الإصدار
        this.validFrom = this.epoch;
        this.validUntil = this.epoch + 5.0;
      }

      // تهيئة المصفوفات بحجم 13x13 (لدرجة maxDegree = 12)
      const size = this.maxDegree + 1;
      this.c = Array.from({ length: size }, () => new Float64Array(size));
      this.cd = Array.from({ length: size }, () => new Float64Array(size));

      // قراءة المعاملات n m g_nm h_nm dg_nm dh_nm
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith('#')) continue;
        const tokens = line.split(/\s+/);
        if (tokens.length < 6) continue;

        const n = parseInt(tokens[0], 10);
        const m = parseInt(tokens[1], 10);
        const g = parseFloat(tokens[2]);
        const h = parseFloat(tokens[3]);
        const dg = parseFloat(tokens[4]);
        const dh = parseFloat(tokens[5]);

        if (n <= this.maxDegree && m <= n) {
          if (m <= n) {
            this.c[m][n] = g;
            this.cd[m][n] = dg;
            if (m !== 0) {
              this.c[n][m - 1] = h;
              this.cd[n][m - 1] = dh;
            }
          }
        }
      }

      // حساب عوامل شمدت شبه القياسية (Schmidt semi-normalized factors)
      this._initSchmidtPolynomials();
      this._initialized = true;
    } catch (err) {
      console.error('[WMM] Error loading WMM.COF:', err.message);
    }
  }

  _initSchmidtPolynomials() {
    const size = this.maxDegree + 1;
    this.snorm = Array.from({ length: size }, () => new Float64Array(size));
    this.k = Array.from({ length: size }, () => new Float64Array(size));
    this.fn = new Float64Array(size);
    this.fm = new Float64Array(size);

    this.snorm[0][0] = 1.0;
    for (let n = 1; n <= this.maxDegree; n++) {
      this.snorm[0][n] = (this.snorm[0][n - 1] * (2 * n - 1)) / n;
      let j = 2;
      for (let m = 0, D1 = 1, D2 = (n - m + D1) / D1; D2 > 0; D2--, m += D1) {
        this.k[m][n] = ((n - 1) * (n - 1) - m * m) / ((2 * n - 1) * (2 * n - 3));
        if (m > 0) {
          const flnmj = ((n - m + 1) * j) / (n + m);
          this.snorm[m][n] = this.snorm[m - 1][n] * Math.sqrt(flnmj);
          j = 1;
        }
      }
      this.fn[n] = n + 1;
      this.fm[n] = n;
    }
    this.k[1][1] = 0.0;
  }

  /**
   * حساب الانحراف المغناطيسي (Magnetic Declination / Variation)
   * @param {number} lat - خط العرض بالدرجات (-90 إلى +90)
   * @param {number} lon - خط الطول بالدرجات (-180 إلى +180)
   * @param {Date|number} [date] - تاريخ الحساب (افتراضياً: الآن)
   * @param {number} [altKm=0] - الارتفاع عن سطح البحر بالكيلومتر
   * @returns {Object} { declination, inclination, horizontalIntensity, totalIntensity, str }
   */
  /**
   * تحويل التاريخ إلى سنة عشرية (decimal year)
   */
  _toDecimalYear(date) {
    if (typeof date === 'number') return date;
    const d = date instanceof Date ? date : new Date();
    const startOfYear = new Date(d.getFullYear(), 0, 1);
    const endOfYear = new Date(d.getFullYear() + 1, 0, 1);
    return d.getFullYear() + (d - startOfYear) / (endOfYear - startOfYear);
  }

  /**
   * معلومات النموذج المحمّل وحالة صلاحيته للتاريخ المطلوب
   */
  getModelInfo(date = new Date()) {
    const year = this._toDecimalYear(date);
    return {
      modelName: this.modelName,
      epoch: this.epoch,
      releaseDate: this.releaseDate,
      validFrom: this.validFrom,
      validUntil: this.validUntil,
      withinValidity: year >= this.validFrom && year <= this.validUntil,
      initialized: this._initialized
    };
  }

  calculate(lat, lon, date, altKm = 0) {
    if (!this._initialized) {
      return {
        declination: 0,
        inclination: 0,
        horizontalIntensity: 0,
        totalIntensity: 0,
        str: '0.0°',
        modelExpired: true,
        modelInfo: this.getModelInfo(date)
      };
    }

    const year = this._toDecimalYear(date);
    const modelExpired = year < this.validFrom || year > this.validUntil;

    const dt = year - this.epoch;

    // ثوابت WGS-84
    const a = 6378.137; // نصف القطر الاستوائي (كم)
    const b = 6356.7523142; // نصف القطر القطبي (كم)
    const re = 6371.2; // نصف قطر الأرض المرجعي المغناطيسي
    const a2 = a * a;
    const b2 = b * b;
    const c2 = a2 - b2;
    const a4 = a2 * a2;
    const b4 = b2 * b2;
    const c4 = a4 - b4;

    const rlat = (lat * Math.PI) / 180.0;
    const rlon = (lon * Math.PI) / 180.0;
    const srlat = Math.sin(rlat);
    const crlat = Math.cos(rlat);
    const srlon = Math.sin(rlon);
    const crlon = Math.cos(rlon);

    const srlat2 = srlat * srlat;
    const crlat2 = crlat * crlat;

    // التحويل من الإحداثيات الجيوديسية إلى الكروية الأرضية (Geodetic to Spherical)
    const q = Math.sqrt(a2 - c2 * srlat2);
    const q1 = altKm * q;
    const q2 = ((q1 + a2) / (q1 + b2)) * ((q1 + a2) / (q1 + b2));
    const ct = srlat / Math.sqrt(q2 * crlat2 + srlat2);
    const st = Math.sqrt(1.0 - ct * ct);
    const r2 = altKm * altKm + 2.0 * q1 + (a4 - c4 * srlat2) / (q * q);
    const r = Math.sqrt(r2);

    // مصفوفة القوى المتتالية (Powers of re / r)
    const size = this.maxDegree + 1;
    const aor = re / r;
    const ar = new Float64Array(size);
    ar[0] = aor * aor;
    for (let n = 1; n <= this.maxDegree; n++) {
      ar[n] = ar[n - 1] * aor;
    }

    // متواليات الزاوية sin(m * lon) و cos(m * lon)
    const sp = new Float64Array(size);
    const cp = new Float64Array(size);
    sp[0] = 0.0;
    cp[0] = 1.0;
    sp[1] = srlon;
    cp[1] = crlon;
    for (let m = 2; m <= this.maxDegree; m++) {
      sp[m] = sp[1] * cp[m - 1] + cp[1] * sp[m - 1];
      cp[m] = cp[1] * cp[m - 1] - sp[1] * sp[m - 1];
    }

    // كثيرات حدود ليجاندر (Legendre Polynomials P_n^m)
    const p = Array.from({ length: size }, () => new Float64Array(size));
    const dp = Array.from({ length: size }, () => new Float64Array(size));
    p[0][0] = 1.0;
    dp[0][0] = 0.0;

    for (let n = 1; n <= this.maxDegree; n++) {
      for (let m = 0; m <= n; m++) {
        if (n === m) {
          p[m][n] = st * p[m - 1][n - 1];
          dp[m][n] = st * dp[m - 1][n - 1] + ct * p[m - 1][n - 1];
        } else if (n === 1 && m === 0) {
          p[m][n] = ct * p[m][n - 1];
          dp[m][n] = ct * dp[m][n - 1] - st * p[m][n - 1];
        } else if (n > 1 && n !== m) {
          if (m > n - 2) {
            p[m][n] = ct * p[m][n - 1];
            dp[m][n] = ct * dp[m][n - 1] - st * p[m][n - 1];
          } else {
            const kVal = this.k[m][n];
            p[m][n] = ct * p[m][n - 1] - kVal * p[m][n - 2];
            dp[m][n] = ct * dp[m][n - 1] - st * p[m][n - 1] - kVal * dp[m][n - 2];
          }
        }
      }
    }

    // تجميع مركبات الحقل المغناطيسي Bx, By, Bz (بالنانوتسلا nT)
    let bx = 0.0;
    let by = 0.0;
    let bz = 0.0;

    for (let n = 1; n <= this.maxDegree; n++) {
      for (let m = 0; m <= n; m++) {
        // تحديث المعاملات حسب التاريخ
        let tc, th;
        if (m <= n) {
          tc = this.c[m][n] + dt * this.cd[m][n];
          if (m !== 0) {
            th = this.c[n][m - 1] + dt * this.cd[n][m - 1];
          } else {
            th = 0.0;
          }
        }

        // الأس الصحيح للحد من الرتبة n هو (re/r)^(n+2): ar[k] = aor^(k+2)
        const par = ar[n];
        const rho = m === 0 ? tc : tc * cp[m] + th * sp[m];

        // ملاحظة معيارية: مصفوفة dp في هذا المحرك مبنية كمشتقة بالنسبة لخط العرض
        // القطبي (colatitude)، بينما صيغة جمع NOAA تستخدم المشتقة بالنسبة لخط العرض
        // الجيوديسي المركزي (latitude) — والإشارة معكوسة بينهما، لذا تُجمع بـ plus.
        bx += par * dp[m][n] * rho * this.snorm[m][n];
        bz -= (n + 1) * par * p[m][n] * rho * this.snorm[m][n];

        if (st !== 0.0 && m > 0) {
          by += (par * p[m][n] * (m * (tc * sp[m] - th * cp[m])) * this.snorm[m][n]) / st;
        }
      }
    }

    // مكونات الحقل الكروية (لأغراض الاختبار والمراجعة التقنية)
    this._lastSpherical = { bx, by, bz, ct, st };

    // التحويل من الإحداثيات الكروية إلى الإحداثيات الجيوديسية (X: North, Y: East, Z: Down)
    // وفق الصيغة المرجعية NOAA GeomagnetismLibrary:
    //   Psi = خط العرض الجيوديسي المركزي (geocentric) - خط العرض الجيوديسي
    //   Bx_geo = Bx_sph·cos(Psi) - Bz_sph·sin(Psi)
    //   Bz_geo = Bx_sph·sin(Psi) + Bz_sph·cos(Psi)
    const phigRad = Math.asin(Math.max(-1, Math.min(1, ct)));
    const psi = phigRad - rlat;
    const cosPsi = Math.cos(psi);
    const sinPsi = Math.sin(psi);
    const x = bx * cosPsi - bz * sinPsi;
    const y = by;
    const z = bx * sinPsi + bz * cosPsi;

    // الحسابات الملاحية للمجال
    const h = Math.sqrt(x * x + y * y);
    const f = Math.sqrt(h * h + z * z);
    const dDeg = (Math.atan2(y, x) * 180.0) / Math.PI;
    const iDeg = (Math.atan2(z, h) * 180.0) / Math.PI;

    // صياغة النص الملاحي (مثلاً: 4.3° E أو 2.1° W)
    const absD = Math.abs(dDeg);
    const dir = dDeg >= 0 ? 'E' : 'W';
    const str = `${absD.toFixed(1)}° ${dir}`;

    return {
      declination: dDeg, // الانحراف المغناطيسي بالدرجات
      inclination: iDeg, // الميل المغناطيسي بالدرجات
      horizontalIntensity: h, // المركبة الأفقية (nT)
      totalIntensity: f, // الشدة الإجمالية (nT)
      str: str, // النص الملاحي الجاهز للعرض
      modelExpired, // true إذا كان التاريخ خارج نافذة صلاحية النموذج
      modelInfo: this.getModelInfo(date)
    };
  }

  /**
   * تحويل اتجاه حقيقي True إلى اتجاه مغناطيسي Magnetic
   */
  trueToMagnetic(trueCourse, lat, lon, date) {
    const res = this.calculate(lat, lon, date);
    let mag = trueCourse - res.declination;
    mag = ((mag % 360) + 360) % 360;
    return {
      magnetic: mag,
      declination: res.declination,
      variationStr: res.str
    };
  }

  /**
   * تحويل اتجاه مغناطيسي Magnetic إلى اتجاه حقيقي True
   */
  magneticToTrue(magCourse, lat, lon, date) {
    const res = this.calculate(lat, lon, date);
    let tru = magCourse + res.declination;
    tru = ((tru % 360) + 360) % 360;
    return {
      trueCourse: tru,
      declination: res.declination,
      variationStr: res.str
    };
  }
}

module.exports = WMMEngine;
