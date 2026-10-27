'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const WMMEngine = require('../DesktopApp/wmm_engine');

describe('WMMEngine — النموذج المغناطيسي العالمي', () => {
  const wmm = new WMMEngine();

  test('يحمّل نموذج WMM-2025 بنافذة صلاحية سارية', () => {
    assert.equal(wmm._initialized, true);
    assert.equal(wmm.modelName, 'WMM-2025');
    assert.equal(wmm.epoch, 2025.0);
    assert.equal(wmm.validUntil, 2030.0);
    const info = wmm.getModelInfo(new Date(2026, 9, 27));
    assert.equal(info.withinValidity, true);
  });

  test('يشير إلى انتهاء الصلاحية خارج النافذة', () => {
    const r = wmm.calculate(30, 31, new Date(2035, 0, 1));
    assert.equal(r.modelExpired, true);
  });

  // القيم المعيارية الرسمية لـ WMM2025 (WMM2025_TEST_VALUES)
  const official = [
    [28, 89, -121, -99.77, 88.47, 1504.298146, 56214.419888],
    [48, 80, -96, -29.91, 87.77, 2164.285547, 55665.134163],
    [65, 43, 93, 0.5, 64.1, 24300.764692, 55626.621348],
    [51, -33, 109, -5.49, -67.5, 21838.046477, 57054.752538],
    [39, -59, -8, -15.75, -58.55, 14918.115796, 28589.818346],
    [3, -50, -103, 27.96, -54.89, 22106.041373, 38431.724126]
  ];

  test('يطابق القيم المعيارية الرسمية ضمن تفاوتات ضيقة', () => {
    for (const [alt, lat, lon, expD, expI, expH, expF] of official) {
      const r = wmm.calculate(lat, lon, 2025.0, alt);
      assert.ok(Math.abs(r.declination - expD) < 0.05, `D ${lat},${lon}: got ${r.declination} exp ${expD}`);
      assert.ok(Math.abs(r.inclination - expI) < 0.05, `I ${lat},${lon}: got ${r.inclination} exp ${expI}`);
      assert.ok(
        Math.abs(r.horizontalIntensity - expH) < 15,
        `H ${lat},${lon}: got ${r.horizontalIntensity} exp ${expH}`
      );
      assert.ok(Math.abs(r.totalIntensity - expF) < 15, `F ${lat},${lon}: got ${r.totalIntensity} exp ${expF}`);
    }
  });

  test('تحويلات الاتجاه المغناطيسي متسقة', () => {
    const mag = wmm.trueToMagnetic(90, 30, 31);
    const back = wmm.magneticToTrue(mag.magnetic, 30, 31);
    assert.ok(Math.abs(back.trueCourse - 90) < 1e-9);
  });
});
