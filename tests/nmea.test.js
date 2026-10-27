'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const NMEAService = require('../DesktopApp/nmea_service');

describe('NMEAService — تحليل الجمل وأهداف AIS', () => {
  let svc;

  beforeEach(() => {
    svc = new NMEAService();
  });

  test('يقبل جملة RMC صحيحة الـ checksum ويحدّث الموقع', () => {
    // $GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*6A
    svc.parseSentence('$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*6A');
    assert.ok(Math.abs(svc.vessel.lat - 48.1173) < 0.001);
    assert.ok(Math.abs(svc.vessel.lon - 11.5167) < 0.001);
    assert.ok(Math.abs(svc.vessel.sog - 22.4) < 0.001);
    assert.equal(svc.stats.parsed >= 1, true);
  });

  test('يرفض الجملة ذات الـ checksum التالف', () => {
    const before = svc.stats.checksumRejected;
    svc.parseSentence('$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*00');
    assert.equal(svc.stats.checksumRejected, before + 1);
    assert.equal(svc.vessel.lat, null);
  });

  test('يحسب درجات العرض والطول NMEA بشكل صحيح', () => {
    assert.ok(Math.abs(svc._nmeaToDecimalLat('4807.038', 'N') - 48.1173) < 0.001);
    assert.ok(Math.abs(svc._nmeaToDecimalLon('01131.000', 'E') - 11.5167) < 0.001);
    assert.ok(svc._nmeaToDecimalLat('4807.038', 'S') < 0);
  });

  test('يفك رسالة AIS نوع 1 (تقرير موقع) ويحسب MMSI', () => {
    // جملة AIVDM قياسية موثقة
    svc.vessel.lat = 47.5;
    svc.vessel.lon = -122.4;
    svc.vessel.sog = 10;
    svc.vessel.cog = 90;
    svc.parseSentence('!AIVDM,1,1,,B,177KQJ5000G?tO`K>RA1wUbN0TKH,0*5C');
    assert.equal(svc.aisTargetsMap.size, 1);
    const target = [...svc.aisTargetsMap.values()][0];
    assert.equal(target.mmsi, '477553000');
    assert.equal(Number.isFinite(target.lat), true);
    assert.equal(Number.isFinite(target.lon), true);
    assert.equal(target.lat >= -90 && target.lat <= 90, true);
    assert.equal(typeof target.cpa, 'number');
    assert.equal(typeof target.tcpa, 'number');
  });

  test('الرسالة نوع 5 تُنشئ هدفاً مؤقتاً عند وصولها قبل تقرير الموقع', () => {
    // نبني رسالة AIS نوع 5 حتمية (424 بت) ونرمزها 6-bit ثم نقسمها جزأين
    const bits = [];
    const write = (val, len) => {
      for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
    };
    // len هنا بعدد الأحرف (كل حرف 6 بت): النداء 7 أحرف=42بت، الاسم 20 حرفاً=120بت
    const writeText = (text, charCount) => {
      const six = (ch) => {
        if (ch === ' ') return 32;
        const code = ch.charCodeAt(0);
        if (code >= 65 && code <= 90) return code - 64; // A=1..Z=26
        if (code >= 48 && code <= 57) return code; // 0=48..9=57
        return 32;
      };
      for (let i = 0; i < charCount; i++) write(i < text.length ? six(text[i]) : 0, 6);
    };

    write(5, 6); // نوع الرسالة
    write(0, 2); // repeat
    write(123456789, 30); // MMSI
    write(0, 2); // AIS version
    write(0, 30); // IMO
    writeText('CALL', 7);
    writeText('TEST VESSEL', 20);
    while (bits.length < 424) bits.push(0);

    // تحويل شريط البتات إلى Armored ASCII
    let armored = '';
    for (let i = 0; i < bits.length; i += 6) {
      let code = 0;
      for (let b = 0; b < 6; b++) code = (code << 1) | (bits[i + b] || 0);
      armored += String.fromCharCode(code + (code > 39 ? 56 : 48));
    }
    const fillBits = armored.length * 6 - bits.length;
    const frag1 = armored.slice(0, 50);
    const frag2 = armored.slice(50);

    const wrap = (fragment, count, idx, fill) => {
      const body = `AIVDM,${count},${idx},9,B,${fragment},${fill}`;
      let cs = 0;
      for (const ch of body) cs ^= ch.charCodeAt(0);
      return `!${body}*${cs.toString(16).toUpperCase().padStart(2, '0')}`;
    };

    svc.parseSentence(wrap(frag1, 2, 1, 0));
    svc.parseSentence(wrap(frag2, 2, 2, fillBits));

    const target = svc.aisTargetsMap.get('123456789');
    assert.ok(target, 'يجب إنشاء هدف مؤقت للبيانات الثابتة حتى دون تقرير موقع');
    assert.equal(target.name, 'TEST VESSEL');
    assert.equal(target.callsign, 'CALL');
  });

  test('CPA/TCPA رياضيات: سفن متباعدة آمنة', () => {
    const v1 = { lat: 0, lon: 0, sog: 10, cog: 0 };
    const v2 = { lat: 1, lon: 0, sog: 10, cog: 180 }; // تتجهان نحو بعضهما
    const r = svc._calculateCPA(v1, v2);
    assert.equal(Number.isFinite(r.cpa), true);
    assert.ok(r.tcpa > 0); // اقتراب في المستقبل
  });

  test('multipart cache محدود الحجم', () => {
    for (let i = 0; i < svc.maxMultipartEntries + 10; i++) {
      svc.parseSentence(`!AIVDM,2,1,${i},B,payload,0*00`);
    }
    assert.ok(svc.aisMultipartCache.size <= svc.maxMultipartEntries);
  });

  test('destroy() يوقف المؤقتات ويمسح الأهداف', () => {
    svc.destroy();
    assert.equal(svc._cleanupTimer, null);
    assert.equal(svc.aisTargetsMap.size, 0);
  });
});
