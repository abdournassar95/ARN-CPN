'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const TidesEngine = require('../DesktopApp/tides_engine');

describe('TidesEngine — المد والجزر', () => {
  const engine = new TidesEngine();

  test('يحمّل فهرس المحطات', () => {
    assert.equal(engine.isReady, true);
    assert.ok(engine.stations.length > 1000);
  });

  test('لا يرتد بصمت لمحطة عشوائية عند غياب الاسم', () => {
    const r = engine.predictTide('__محطة_غير_موجودة__');
    assert.equal(r.ok, false);
    assert.equal(r.error, 'STATION_NOT_FOUND');
  });

  test('التنبؤ موسوم صراحة كتقدير غير توافقي', () => {
    const station = engine.stations[0];
    const r = engine.predictTide(station.name, new Date(2026, 9, 27));
    assert.equal(r.ok, true);
    assert.equal(r.isEstimate, true);
    assert.match(r.method, /estimated/);
    assert.ok(r.confidenceWarning.length > 20);
    assert.ok(r.curve.length === 97); // كل 15 دقيقة لـ24 ساعة
  });

  test('parse إزاحة المنطقة الزمنية', () => {
    assert.equal(engine._parseTimezoneOffset('3:30'), 3.5);
    assert.equal(engine._parseTimezoneOffset('-8:0'), -8);
    assert.equal(engine._parseTimezoneOffset('0:0'), 0);
  });

  test('findNearbyStations يرتب حسب المسافة', () => {
    const near = engine.findNearbyStations(engine.stations[0].lat, engine.stations[0].lon, 500);
    assert.ok(near.length > 0);
    for (let i = 1; i < near.length; i++) {
      assert.ok(near[i].distanceNm >= near[i - 1].distanceNm);
    }
  });
});
