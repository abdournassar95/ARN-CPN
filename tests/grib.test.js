'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const GribDecoder = require('../DesktopApp/grib_decoder');

function buildSyntheticGrib1(values, parameter = 33) {
  // ---- Section 1 PDS (30 bytes) ----
  const pds = Buffer.alloc(30, 0);
  pds.writeUIntBE(30, 0, 3);
  pds[3] = 1;
  pds[4] = 2; // جدول المعاملات الإصدار 2
  pds[7] = 0x80; // GDS موجود، BMS غير موجود
  pds[8] = parameter; // 33=UGRD, 34=VGRD
  pds[9] = 1; // نوع المستوى
  pds[10] = 10;
  pds[12] = 25; // سنة
  pds[13] = 10; // شهر
  pds[14] = 27; // يوم
  pds[15] = 12; // ساعة
  pds[24] = 21; // القرن 21
  pds[27] = 0; // المقياس العشري
  pds[28] = 0;

  // ---- Section 2 GDS شبكة 2×2 (28 bytes) ----
  const gds = Buffer.alloc(28, 0);
  gds.writeUIntBE(28, 0, 3);
  gds[3] = 2;
  gds[5] = 0; // Lat/Lon grid
  gds.writeUInt16BE(2, 6); // Ni
  gds.writeUInt16BE(2, 8); // Nj
  gds.writeIntBE(40000, 10, 3); // lat0 = 40.000
  gds.writeIntBE(30000, 13, 3); // lon0 = 30.000
  gds[16] = 0;
  gds.writeIntBE(30000, 17, 3); // lat1 = 30.000
  gds.writeIntBE(40000, 20, 3); // lon1 = 40.000
  gds.writeInt16BE(10000, 23); // dLat 10°
  gds.writeInt16BE(10000, 25); // dLon 10°
  gds[27] = 0; // مسح شمال→جنوب، غرب→شرق

  // ---- Section 4 BDS (12 + بيانات) ----
  const bds = Buffer.alloc(12 + values.length, 0);
  bds.writeUIntBE(12 + values.length, 0, 3);
  bds[3] = 4;
  bds[4] = 0; // grid point، ضغط بسيط، مرجع IBM
  bds.writeInt16BE(0, 5); // مقياس ثنائي صفر
  // المرجع IBM عند 7..10 = صفر (البايتات مففرة أصلاً)
  bds[11] = 8; // 8 بت لكل قيمة
  values.forEach((v, i) => {
    bds[12 + i] = v;
  });

  // ---- Section 5 نهاية ----
  const end = Buffer.from('7777', 'ascii');
  const total = 8 + pds.length + gds.length + bds.length + end.length;

  const indicator = Buffer.alloc(8, 0);
  indicator.write('GRIB', 0, 'ascii');
  indicator.writeUIntBE(total, 4, 3);
  indicator[7] = 1; // الإصدار 1

  return Buffer.concat([indicator, pds, gds, bds, end]);
}

describe('GribDecoder — محلل GRIB1', () => {
  test('يفك شبكة رياح UGRD بضغط بسيط', () => {
    const buf = buildSyntheticGrib1([5, 7, 9, 11], 33);
    const grids = GribDecoder.parseBuffer(buf);
    assert.equal(grids.length, 1);
    const g = grids[0];
    assert.equal(g.edition, 1);
    assert.equal(g.parameter, 'UGRD');
    assert.equal(g.unit, 'm/s');
    assert.equal(g.ni, 2);
    assert.equal(g.nj, 2);
    assert.deepEqual(Array.from(g.values), [5, 7, 9, 11]);
    assert.equal(g.lat0, 40);
    assert.equal(g.lon1, 40);
    assert.equal(g.dLat, 10);
    assert.equal(g.referenceTime.getUTCFullYear(), 2025);
  });

  test('يرفض GRIB2 بخطأ صريح', () => {
    const g2 = Buffer.alloc(16, 0);
    g2.write('GRIB', 0, 'ascii');
    g2.writeUIntBE(16, 4, 3);
    g2[7] = 2;
    assert.throws(() => GribDecoder.parseBuffer(g2), /GRIB2/);
  });

  test('يرفض المحتوى الفارغ', () => {
    assert.throws(() => GribDecoder.parseBuffer(Buffer.alloc(4)));
  });

  test('تطبيع اتجاه الشبكة عند عكس اتجاه المسح', () => {
    const grid = { ni: 2, nj: 2, scanMode: 0xc0 }; // جنوب→شمال، شرق→غرب
    const vals = new Float64Array([1, 2, 3, 4]);
    const out = GribDecoder._canonicalize(vals, grid);
    assert.deepEqual(Array.from(out), [4, 3, 2, 1]);
  });
});
