'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const TrackStore = require('../DesktopApp/track_store');

describe('TrackStore — أثر الإبحار الدائم', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arn-track-'));
  });

  test('يرفض الإحداثيات غير الصالحة', () => {
    const store = new TrackStore(tmpDir);
    assert.equal(store.appendPoint(91, 30), false);
    assert.equal(store.appendPoint(30, 181), false);
    assert.equal(store.appendPoint(NaN, 30), false);
    assert.equal(store.appendPoint(30, 30), true);
  });

  test('يصفّي النقاط المتقاربة ويحفظ على القرص', () => {
    const store = new TrackStore(tmpDir);
    store.clear();
    store.appendPoint(30.0, 32.0);
    store.appendPoint(30.00001, 32.00001); // مهملة (أقرب من العتبة)
    store.appendPoint(30.5, 32.5);
    assert.equal(store.points.length, 2);
    assert.equal(store.flush(), true);

    // إعادة التحميل من القرص
    const reloaded = new TrackStore(tmpDir);
    assert.equal(reloaded.points.length, 2);
    assert.equal(reloaded.points[0].lat, 30.0);
  });

  test('يحترم السقف الأقصى للنقاط', () => {
    const store = new TrackStore(tmpDir);
    store.maxPoints = 10;
    for (let i = 0; i < 25; i++) {
      store.appendPoint(30 + i * 0.01, 32 + i * 0.01);
    }
    assert.equal(store.points.length, 10);
  });

  test('المسح والدمار يعملان', () => {
    const store = new TrackStore(tmpDir);
    store.appendPoint(31, 33);
    store.clear();
    assert.equal(store.points.length, 0);
    assert.doesNotThrow(() => store.destroy());
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
