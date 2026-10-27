/**
 * ARN Marine Navigator - XTide Harmonic Tide & Current Engine
 * شركة ARN Technology - تطوير وبرمجة: عبده رجب نصار
 * محرك المد والجزر والتيارات البحرية التوافقي دون إنترنت (100% Offline XTide)
 */

const fs = require('fs');
const path = require('path');

class TidesEngine {
  constructor(tcDataDir) {
    this.tcDataDir = tcDataDir || path.join(__dirname, '..', 'data', 'tcdata');
    this.indexPath = path.join(this.tcDataDir, 'HARMONIC.IDX');
    this.harmonicPath = path.join(this.tcDataDir, 'HARMONIC');

    this.stations = [];
    this.isReady = false;

    this._loadIndex();
  }

  _loadIndex() {
    try {
      if (!fs.existsSync(this.indexPath)) {
        console.warn('[Tides] Index file not found:', this.indexPath);
        return;
      }

      const content = fs.readFileSync(this.indexPath, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (
          !line ||
          line.startsWith('#') ||
          line.startsWith('REGION') ||
          line.startsWith('COUNTRY') ||
          line.startsWith('STATE') ||
          line.startsWith('XREF')
        ) {
          continue;
        }

        // TNAA:Can:Newf: -53.9833 47.3 -3:30 Argentia, Newfoundland
        // cNAP:US:WA: -122.635 48.4117 -8:0 Deception Pass (current)
        const typeChar = line.charAt(0);
        if (typeChar === 'T' || typeChar === 't' || typeChar === 'C' || typeChar === 'c') {
          const parts = line.split(/\s+/);
          if (parts.length >= 5) {
            const codePart = parts[0];
            const lon = parseFloat(parts[1]);
            const lat = parseFloat(parts[2]);
            const tz = parts[3];
            const name = parts.slice(4).join(' ');

            if (!isNaN(lat) && !isNaN(lon)) {
              this.stations.push({
                type: typeChar === 'T' || typeChar === 't' ? 'Tide' : 'Current',
                isSubordinate: typeChar === 't' || typeChar === 'c',
                code: codePart,
                lat,
                lon,
                tz,
                name: name.replace(/\r$/, '')
              });
            }
          }
        }
      }

      this.isReady = true;
      console.log(`[Tides] Loaded ${this.stations.length} offline tide & current stations from XTide harmonics.`);
    } catch (err) {
      console.error('[Tides] Failed to load HARMONIC.IDX:', err.message);
    }
  }

  /**
   * حساب المسافة بالأميال البحرية بين نقطتين (Haversine formula in NM)
   */
  _calcDistanceNm(lat1, lon1, lat2, lon2) {
    const R = 3440.065; // Earth radius in Nautical Miles
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * البحث عن أقرب محطات المد والجزر حول إحداثية معينة
   */
  findNearbyStations(lat, lon, maxDistanceNm = 150, limit = 20) {
    if (!this.isReady || lat === null || lon === null) return [];

    const results = [];
    for (const st of this.stations) {
      const dist = this._calcDistanceNm(lat, lon, st.lat, st.lon);
      if (dist <= maxDistanceNm) {
        results.push({
          ...st,
          distanceNm: Math.round(dist * 10) / 10
        });
      }
    }

    results.sort((a, b) => a.distanceNm - b.distanceNm);
    return results.slice(0, limit);
  }

  /**
   * البحث عن محطات ضمن حدود الشاشة المفتوحة
   */
  getStationsInBounds(minLon, minLat, maxLon, maxLat, limit = 50) {
    if (!this.isReady) return [];
    const results = [];

    for (const st of this.stations) {
      if (st.lon >= minLon && st.lon <= maxLon && st.lat >= minLat && st.lat <= maxLat) {
        results.push(st);
        if (results.length >= limit) break;
      }
    }
    return results;
  }

  /**
   * تحويل إزاحة المنطقة الزمنية بصيغة XTide (مثل "-3:30") إلى ساعات عشرية
   */
  _parseTimezoneOffset(tz) {
    if (!tz || typeof tz !== 'string') return 0;
    const m = /^(-?\d+):(\d{1,2})$/.exec(tz.trim());
    if (!m) {
      const n = parseFloat(tz);
      return isNaN(n) ? 0 : n;
    }
    const sign = m[1].startsWith('-') ? -1 : 1;
    const hours = Math.abs(parseInt(m[1], 10));
    const minutes = parseInt(m[2], 10);
    return sign * (hours + minutes / 60);
  }

  /**
   * حساب منحنى المد والجزر لمحطة محددة وتاريخ معين.
   *
   * تنبيه مصداقية: هذا المحرك يقرأ فهرس المحطات XTide (HARMONIC.IDX) فقط،
   * لكنه لا يفك ملف الثوابت التوافقية الثنائي (HARMONIC) بعد. لذلك المنحنى
   * تقدير فيزيائي عام (تراكب مركبتَي M2 و S2 بسعة مُخمّنة من خط العرض)
   * وليس تنبؤاً توافقياً رسمياً — وتُوسَم النتيجة صراحةً بذلك.
   */
  predictTide(stationName, date = new Date()) {
    if (!this.isReady || this.stations.length === 0) {
      return {
        ok: false,
        error: 'NO_INDEX',
        message: 'قاعدة بيانات محطات المد والجزر غير متاحة.'
      };
    }

    const station = this.stations.find((s) => s.name === stationName);
    // لا يوجد ارتداد صامت لمحطة عشوائية بعد الآن — إرجاع خطأ واضح
    if (!station) {
      return {
        ok: false,
        error: 'STATION_NOT_FOUND',
        message: `المحطة "${stationName}" غير موجودة في الفهرس — لا يمكن توليد تنبؤ موثوق.`
      };
    }

    // نموذج تقديري: M2 (12.42h قمري) + S2 (12.0h شمسي) بسعة مُخمّنة جغرافياً
    const latRad = (station.lat * Math.PI) / 180;
    const baseAmplitude = 1.2 + 0.8 * Math.cos(latRad); // نطاق مد تقديري
    const z0 = 1.5; // متوسط مستوى سطح البحر التقديري

    const startTime = new Date(date);
    startTime.setHours(0, 0, 0, 0);

    // إزاحة المنطقة الزمنية للمحطة لعرض الأوقات المحلية
    const tzOffsetHours = this._parseTimezoneOffset(station.tz);

    const curvePoints = [];
    const highTides = [];
    const lowTides = [];
    let prevHeight = null;
    let prevDiff = null;

    // حساب الارتفاع كل 15 دقيقة على مدار 24 ساعة (97 نقطة)
    for (let m = 0; m <= 24 * 60; m += 15) {
      const tHours = m / 60;
      const tRadM2 = (tHours / 12.42) * (2 * Math.PI);
      const tRadS2 = (tHours / 12.0) * (2 * Math.PI);

      // صيغة التراكب التوافقي التقديرية (Estimated Harmonic Superposition)
      const height = z0 + baseAmplitude * 0.7 * Math.cos(tRadM2) + baseAmplitude * 0.3 * Math.cos(tRadS2 + 0.5);

      // وقت المحطة المحلي = توقيت UTC + إزاحة المنطقة
      const localMinutes = (m + tzOffsetHours * 60 + 24 * 60) % (24 * 60);
      const timeStr = `${String(Math.floor(localMinutes / 60)).padStart(2, '0')}:${String(Math.round(localMinutes % 60)).padStart(2, '0')}`;

      curvePoints.push({
        time: timeStr,
        minutes: m,
        height: Math.round(height * 100) / 100 // بالأمتار
      });

      if (prevHeight !== null) {
        const diff = height - prevHeight;
        if (prevDiff !== null) {
          if (prevDiff > 0 && diff <= 0) {
            highTides.push({ time: timeStr, height: Math.round(height * 100) / 100 });
          } else if (prevDiff < 0 && diff >= 0) {
            lowTides.push({ time: timeStr, height: Math.round(height * 100) / 100 });
          }
        }
        prevDiff = diff;
      }
      prevHeight = height;
    }

    return {
      ok: true,
      station: station.name,
      type: station.type,
      lat: station.lat,
      lon: station.lon,
      timezone: station.tz,
      date: startTime.toISOString().split('T')[0],
      unit: 'Meters',
      // وسوم المصداقية — يجب أن تظهر في الواجهة
      isEstimate: true,
      method: 'estimated-m2-s2-superposition',
      confidenceWarning:
        'تقدير فيزيائي عام وليس تنبؤاً توافقياً رسمياً من ملف HARMONIC — يُمنع الاعتماد عليه للملاحة الحرجة.',
      highTides,
      lowTides,
      curve: curvePoints
    };
  }
}

module.exports = TidesEngine;
