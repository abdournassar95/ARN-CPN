'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const BSBDecoder = require('../DesktopApp/bsb_decoder');

describe('BSBDecoder — فك خرائط KAP/BSB', () => {
  let tmpDir;
  let kapPath;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arn-bsb-'));
    kapPath = path.join(tmpDir, 'synthetic.kap');

    // صورة 4×2 بعمق لون واحد (مستويان)
    const width = 4;
    const height = 2;
    const header = [
      '! ARN synthetic test chart',
      'BSB/NA=SYNTHETIC TEST',
      'NU=TEST001',
      `RA=${width},${height}`,
      'IFI=1',
      'RGB=0,0,0,',
      'RGB=255,255,255,',
      'REF/1,0.0,0.0,31.0000,32.0000,MERCATOR',
      'REF/2,3.0,1.0,31.1000,32.1000,MERCATOR',
      'PLY/1,31.0000,32.0000',
      'PLY/2,31.1000,32.1000',
      ''
    ].join('\r\n');

    // مستوى بت واحد، صفان:
    //  صف1: بكسلات 0,0,1,1 — شوط bit0 بطول 2 ثم bit1 بطول 2 ثم نهاية صف
    //  صف2: بكسلات 0,0,0,0 — شوط bit0 بطول 4 ثم نهاية صف
    const raster = Buffer.from([
      0x01,
      0x02,
      0x02,
      0x00, // رقم الصف 1 + الشوطان + EOR
      0x02,
      0x04,
      0x00 // رقم الصف 2 + شوط + EOR
    ]);

    const buf = Buffer.concat([Buffer.from(header, 'latin1'), Buffer.from([0x1a]), raster]);
    fs.writeFileSync(kapPath, buf);
  });

  test('يقرأ الترويسة واللوحة ونقاط المعايرة', () => {
    const d = new BSBDecoder(kapPath);
    const meta = d.toMetadata();
    assert.equal(meta.title, 'SYNTHETIC TEST');
    assert.equal(meta.width, 4);
    assert.equal(meta.height, 2);
    assert.equal(meta.bitDepth, 1);
    assert.equal(meta.hasPalette, true);
    assert.equal(meta.calibrationPoints.length, 2);
    assert.ok(meta.bounds && meta.bounds.length === 4);
  });

  test('يفك ضغط RLE إلى مؤشرات ألوان صحيحة', () => {
    const d = new BSBDecoder(kapPath);
    const img = d.decodeImage();
    assert.equal(img.width, 4);
    assert.equal(img.height, 2);
    // الصف الأول: 0,0,1,1
    assert.deepEqual([img.rgba[0], img.rgba[1], img.rgba[2]], [0, 0, 0]);
    assert.deepEqual([img.rgba[8], img.rgba[9], img.rgba[10]], [255, 255, 255]);
    // الصف الثاني كله أسود
    assert.equal(img.rgba[(4 + 0) * 4], 0);
    assert.equal(img.rgba[(4 + 3) * 4], 0);
    // قناة ألفا معبأة
    assert.equal(img.rgba[3], 255);
  });

  test('ينتج PNG صالح بتوقيع المعيار', () => {
    const d = new BSBDecoder(kapPath);
    const url = d.getImageDataURL();
    assert.match(url, /^data:image\/png;base64,/);
    const png = Buffer.from(url.split(',')[1], 'base64');
    assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    // IHDR
    assert.equal(png.toString('ascii', 12, 16), 'IHDR');
    const w = png.readUInt32BE(16);
    const h = png.readUInt32BE(20);
    assert.equal(w, 4);
    assert.equal(h, 2);
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
