'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const RoutePlanner = require('../DesktopApp/route_planner');

describe('RoutePlanner — الملاحة الرياضية', () => {
  let planner;
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arn-routes-'));
    planner = new RoutePlanner(tmpDir);
  });

  test('Rhumb: مسافة واتجاه معروفين (ميل بحري)', () => {
    // خط طول واحد، فرق درجة عرض = 60 ميل بحري
    const r = RoutePlanner.rhumbDistanceAndBearing(30, 32, 31, 32);
    assert.ok(Math.abs(r.distanceNm - 60) < 0.05, `المسافة ${r.distanceNm}`);
    assert.ok(Math.abs(r.bearingTrue - 0) < 0.1);
  });

  test('Great Circle أقصر من أو يساوي Rhumb للمسافات الطويلة', () => {
    const rhumb = RoutePlanner.rhumbDistanceAndBearing(35, -10, 35, 40);
    const gc = RoutePlanner.greatCircleDistanceAndBearing(35, -10, 35, 40);
    assert.ok(gc.distanceNm <= rhumb.distanceNm + 1e-9);
    assert.ok(gc.distanceNm > 0);
  });

  test('معالجة خط الزوال العكسي 180°', () => {
    const r = RoutePlanner.rhumbDistanceAndBearing(0, 179, 0, -179);
    assert.ok(r.distanceNm > 0 && r.distanceNm < 200);
  });

  test('رفض الإحداثيات غير الصالحة', () => {
    assert.equal(RoutePlanner.isValidLatLon(91, 0), false);
    assert.equal(RoutePlanner.isValidLatLon(10, 181), false);
    assert.equal(RoutePlanner.isValidLatLon(NaN, 0), false);
    assert.equal(RoutePlanner.isValidLatLon(30, 31), true);
    assert.throws(() => planner.createWaypoint(200, 30, 'bad'));
    assert.throws(() =>
      planner.createRoute('x', [
        { lat: 10, lon: 10 },
        { lat: 95, lon: 10 }
      ])
    );
  });

  test('إنشاء مسار وحساب إجمالي المسافات', () => {
    const route = planner.createRoute(
      'Test',
      [
        { id: 'a', lat: 30, lon: 32 },
        { id: 'b', lat: 31, lon: 32 },
        { id: 'c', lat: 31, lon: 33 }
      ],
      'rhumb'
    );
    assert.equal(route.points.length, 3);
    assert.equal(route.legs.length, 2);
    assert.ok(route.totalDistanceNm > 60);
  });

  test('تصدير واستيراد GPX يشمل wpt/rte/trk', () => {
    planner.createWaypoint(30.1, 32.1, 'WP1');
    planner.createRoute('R1', [
      { id: 'p1', lat: 30, lon: 32 },
      { id: 'p2', lat: 31, lon: 33 }
    ]);
    const tracks = [
      { lat: 30, lon: 32, ts: Date.now() },
      { lat: 30.5, lon: 32.5, ts: Date.now() + 1000 },
      { lat: 31, lon: 33, ts: Date.now() + 2000 }
    ];
    const gpx = planner.exportToGPX(null, tracks);
    assert.match(gpx, /<wpt /);
    assert.match(gpx, /<rte>/);
    assert.match(gpx, /<trkseg>/);
    assert.match(gpx, /<trkpt /);
    assert.match(gpx, /<time>/);

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'arn-gpx-'));
    const importer = new RoutePlanner(tmp);
    const res = importer.importFromGPX(gpx);
    assert.equal(res.success, true);
    assert.equal(res.importedWaypointsCount, 1);
    assert.ok(res.importedRoutesCount >= 2); // rte + trk
    assert.equal(res.importedTracksCount, 1);
  });

  test('تهريب أسماء XML في التصدير', () => {
    planner.createWaypoint(30, 32, '<script>x</script>');
    const gpx = planner.exportToGPX();
    assert.ok(!gpx.includes('<script>'));
    assert.ok(gpx.includes('&lt;script&gt;'));
  });

  test('التوجيه النشط XTE/VMG/TTG', () => {
    planner.createRoute('Active', [
      { id: 'p1', lat: 30, lon: 32 },
      { id: 'p2', lat: 31, lon: 32 }
    ]);
    planner.setActiveRoute(planner.routes[0].id);
    const s = planner.getActiveSteering(30.1, 32.0, 10, 0);
    assert.ok(s);
    assert.ok(s.dtwNm > 0 && s.dtwNm < 60);
    assert.equal(typeof s.xteNm, 'number');
    assert.ok(s.ttgMinutes > 0);
  });
});
