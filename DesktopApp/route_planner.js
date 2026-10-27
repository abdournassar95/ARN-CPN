/**
 * ARN Marine Navigator - Route Planning & Interactive Waypoint Engine
 * شركة ARN Technology - تطوير وبرمجة: عبده رجب نصار
 * محرك تخطيط المسارات البحرية، حسابات الإبحار المتعامد (Rhumb Line) والدائرة العظمى (Great Circle)،
 * وتصدير/استيراد ملفات GPX القياسية (100% Offline)
 */

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

class RoutePlanner {
  constructor(storageDir) {
    if (!storageDir) {
      try {
        const { app } = require('electron');
        storageDir = path.join(app.getPath('userData'), 'navigation');
      } catch {
        // خارج Electron (الاختبارات) — احتياطي داخل مجلد المشروع
        storageDir = path.join(__dirname, '..', 'data', 'navigation');
      }
    }
    this.storageDir = storageDir;
    this.storageFile = path.join(this.storageDir, 'routes.json');

    this.routes = [];
    this.waypoints = [];
    this.activeRouteId = null;
    this.activeWaypointIndex = 0;

    this._ensureStorage();
    this.loadFromDisk();
  }

  _ensureStorage() {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }
    } catch (e) {
      console.error('[RoutePlanner] Failed to ensure storage dir:', e.message);
    }
  }

  loadFromDisk() {
    try {
      if (fs.existsSync(this.storageFile)) {
        const raw = fs
          .readFileSync(this.storageFile, 'utf8')
          .replace(/^\uFEFF/, '')
          .trim();
        if (raw) {
          const data = JSON.parse(raw);
          this.routes = data.routes || [];
          this.waypoints = data.waypoints || [];
          this.activeRouteId = data.activeRouteId || null;
          this.activeWaypointIndex = data.activeWaypointIndex || 0;
          this._recalculateAllRoutes();
          return;
        }
      }
    } catch (e) {
      console.warn('[RoutePlanner] Could not parse routes.json, starting fresh:', e.message);
    }
    this.routes = [];
    this.waypoints = [];
  }

  saveToDisk() {
    try {
      this._ensureStorage();
      const payload = {
        routes: this.routes,
        waypoints: this.waypoints,
        activeRouteId: this.activeRouteId,
        activeWaypointIndex: this.activeWaypointIndex,
        savedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.storageFile, JSON.stringify(payload, null, 2), 'utf8');
      return true;
    } catch (e) {
      console.error('[RoutePlanner] Save failed:', e.message);
      return false;
    }
  }

  // =========================================================
  // معادلات الملاحة البحرية الرياضية (Marine Navigation Math)
  // =========================================================

  /**
   * حساب مسافة الإبحار المتعامد (Rhumb Line / Loxodrome) بالدرجات والأميال البحرية
   * المسار المتعامد يحافظ على زاوية بوصلة ثابتة وهو المعيار المعتمد في الخرائط الملاحية
   */
  static rhumbDistanceAndBearing(lat1, lon1, lat2, lon2) {
    const phi1 = (lat1 * Math.PI) / 180.0;
    const phi2 = (lat2 * Math.PI) / 180.0;
    const dPhi = phi2 - phi1;
    let dLambda = ((lon2 - lon1) * Math.PI) / 180.0;

    // معالجة خط الزوال العكسي 180 درجة
    if (Math.abs(dLambda) > Math.PI) {
      dLambda = dLambda > 0 ? -(2 * Math.PI - dLambda) : 2 * Math.PI + dLambda;
    }

    const dPsi = Math.log(Math.tan(Math.PI / 4 + phi2 / 2) / Math.tan(Math.PI / 4 + phi1 / 2));
    const q = Math.abs(dPsi) > 1e-11 ? dPhi / dPsi : Math.cos(phi1);

    // المسافة بالأميال البحرية (1 درجة = 60 NM)
    const distanceNm = Math.sqrt(dPhi * dPhi + q * q * dLambda * dLambda) * (180.0 / Math.PI) * 60.0;

    // زاوية التوجيه (True Bearing)
    let bearing = (Math.atan2(dLambda, dPsi) * 180.0) / Math.PI;
    bearing = ((bearing % 360) + 360) % 360;

    return {
      distanceNm: parseFloat(distanceNm.toFixed(2)),
      bearingTrue: parseFloat(bearing.toFixed(1))
    };
  }

  /**
   * حساب مسافة الدائرة العظمى (Great Circle / Orthodrome) - أقصر مسار على سطح الكرة الأرضية
   */
  static greatCircleDistanceAndBearing(lat1, lon1, lat2, lon2) {
    const phi1 = (lat1 * Math.PI) / 180.0;
    const phi2 = (lat2 * Math.PI) / 180.0;
    const dPhi = phi2 - phi1;
    const dLambda = ((lon2 - lon1) * Math.PI) / 180.0;

    const a =
      Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) * Math.sin(dLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    // المسافة بالأميال البحرية
    const distanceNm = c * (180.0 / Math.PI) * 60.0;

    // الاتجاه الابتدائي (Initial Bearing)
    const y = Math.sin(dLambda) * Math.cos(phi2);
    const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
    let bearing = (Math.atan2(y, x) * 180.0) / Math.PI;
    bearing = ((bearing % 360) + 360) % 360;

    return {
      distanceNm: parseFloat(distanceNm.toFixed(2)),
      bearingTrue: parseFloat(bearing.toFixed(1))
    };
  }

  /**
   * حساب خطأ الانحراف عن المسار (Cross-Track Error - XTE)
   * وبعد وزاوية السفينة نحو النقطة الإرشادية النشطة
   */
  static calculateSteering(vesselLat, vesselLon, sog, cog, legStartLat, legStartLon, wptLat, wptLon) {
    // 1. المسافة وزاوية التوجيه المباشرة نحو النقطة المستهدفة (DTW & BTW)
    const toWpt = RoutePlanner.rhumbDistanceAndBearing(vesselLat, vesselLon, wptLat, wptLon);
    const dtw = toWpt.distanceNm;
    const btw = toWpt.bearingTrue;

    // 2. مسار المرحلة المستهدفة من البداية إلى النقطة (Leg Bearing)
    const leg = RoutePlanner.rhumbDistanceAndBearing(legStartLat, legStartLon, wptLat, wptLon);
    const legBearing = leg.bearingTrue;

    // 3. حساب زاوية وزمن XTE
    const d13 = RoutePlanner.rhumbDistanceAndBearing(legStartLat, legStartLon, vesselLat, vesselLon).distanceNm;
    const brg13 = RoutePlanner.rhumbDistanceAndBearing(legStartLat, legStartLon, vesselLat, vesselLon).bearingTrue;
    const angleDiffRad = ((brg13 - legBearing) * Math.PI) / 180.0;

    // خطأ المسار XTE بالأميال البحرية (موجب = يمين المسار Starboard، سالب = يسار المسار Port)
    const xteNm = d13 * Math.sin(angleDiffRad);
    const steerDir = xteNm > 0 ? 'L' : 'R'; // للتصحيح: إذا كنا يميناً نتجه يساراً L

    // 4. السرعة الفعالة نحو الهدف (Velocity Made Good - VMG)
    const vmgAngleRad = ((cog - btw) * Math.PI) / 180.0;
    const vmg = sog * Math.cos(vmgAngleRad);

    // 5. الوقت التقديري للوصول (Time to Go - TTG) بالدقائق
    const effectiveSpeed = Math.max(vmg, 0.5);
    const ttgHours = dtw / effectiveSpeed;
    const ttgMinutes = Math.round(ttgHours * 60);

    return {
      dtwNm: parseFloat(dtw.toFixed(2)), // المسافة إلى النقطة
      btwDeg: parseFloat(btw.toFixed(1)), // زاوية التوجيه للهدف
      xteNm: parseFloat(Math.abs(xteNm).toFixed(3)), // قيمة الانحراف
      xteSteerDir: steerDir, // جهة التصحيح (L / R)
      vmgKts: parseFloat(vmg.toFixed(1)), // السرعة نحو الهدف
      ttgMinutes: ttgMinutes, // الدقائق المتبقية
      arrivalAlarm: dtw <= 0.05 // وصل (نصف قطر 100 متر)
    };
  }

  // =========================================================
  // إدارة النقاط الإرشادية (Waypoints)
  // =========================================================

  static isValidLatLon(lat, lon) {
    const la = Number(lat);
    const lo = Number(lon);
    return Number.isFinite(la) && Number.isFinite(lo) && la >= -90 && la <= 90 && lo >= -180 && lo <= 180;
  }

  /**
   * معرّف فريد تشفير (UUIDv4) مع بادئة بشرية القراءة — بديل Date.now()+random()
   */
  static newId(prefix) {
    return `${prefix}_${randomUUID()}`;
  }

  createWaypoint(lat, lon, name = '', desc = '') {
    const la = parseFloat(lat);
    const lo = parseFloat(lon);
    if (!RoutePlanner.isValidLatLon(la, lo)) {
      throw new Error(`إحداثيات غير صالحة للنقطة الإرشادية: ${lat}, ${lon}`);
    }
    const id = RoutePlanner.newId('wpt');
    const defaultName = name || `WPT ${String(this.waypoints.length + 1).padStart(2, '0')}`;
    const wpt = {
      id,
      name: defaultName,
      lat: la,
      lon: lo,
      desc: desc || '',
      created: new Date().toISOString()
    };
    this.waypoints.push(wpt);
    this.saveToDisk();
    return wpt;
  }

  deleteWaypoint(wptId) {
    this.waypoints = this.waypoints.filter((w) => w.id !== wptId);
    // إزالتها أيضاً من أي مسارات تحتويها
    for (const route of this.routes) {
      route.points = route.points.filter((p) => p.id !== wptId);
      this._recalculateRoute(route);
    }
    this.saveToDisk();
    return true;
  }

  // =========================================================
  // إدارة المسارات الملاحية (Routes)
  // =========================================================

  createRoute(name = '', points = [], navType = 'rhumb') {
    const safePoints = (points || []).filter((p) => RoutePlanner.isValidLatLon(p.lat, p.lon));
    if (safePoints.length !== (points || []).length) {
      throw new Error('المسار يحتوي إحداثيات غير صالحة.');
    }
    const id = RoutePlanner.newId('rte');
    const defaultName = name || `مسار رحلة ${this.routes.length + 1}`;
    const newRoute = {
      id,
      name: defaultName,
      navType: navType === 'great_circle' ? 'great_circle' : 'rhumb',
      points: safePoints,
      legs: [],
      totalDistanceNm: 0,
      estimatedTimeHours: 0,
      createdAt: new Date().toISOString()
    };

    this._recalculateRoute(newRoute);
    this.routes.push(newRoute);
    if (!this.activeRouteId) {
      this.activeRouteId = id;
      this.activeWaypointIndex = 0;
    }
    this.saveToDisk();
    return newRoute;
  }

  addPointToRoute(routeId, lat, lon, name = '') {
    const route = this.routes.find((r) => r.id === routeId);
    if (!route) return null;
    if (!RoutePlanner.isValidLatLon(lat, lon)) {
      throw new Error(`إحداثيات غير صالحة: ${lat}, ${lon}`);
    }

    const ptIndex = route.points.length + 1;
    const ptName = name || `${route.name} - P${ptIndex}`;
    const pt = {
      id: RoutePlanner.newId('pt'),
      name: ptName,
      lat: parseFloat(lat),
      lon: parseFloat(lon)
    };

    route.points.push(pt);
    this._recalculateRoute(route);
    this.saveToDisk();
    return route;
  }

  removePointFromRoute(routeId, pointIndex) {
    const route = this.routes.find((r) => r.id === routeId);
    if (!route) return null;

    if (pointIndex >= 0 && pointIndex < route.points.length) {
      route.points.splice(pointIndex, 1);
      this._recalculateRoute(route);
      this.saveToDisk();
    }
    return route;
  }

  deleteRoute(routeId) {
    this.routes = this.routes.filter((r) => r.id !== routeId);
    if (this.activeRouteId === routeId) {
      this.activeRouteId = this.routes.length > 0 ? this.routes[0].id : null;
      this.activeWaypointIndex = 0;
    }
    this.saveToDisk();
    return true;
  }

  setActiveRoute(routeId) {
    const r = this.routes.find((rt) => rt.id === routeId);
    if (r) {
      this.activeRouteId = routeId;
      this.activeWaypointIndex = 0;
      this.saveToDisk();
      return true;
    }
    return false;
  }

  advanceActiveWaypoint() {
    const r = this.routes.find((rt) => rt.id === this.activeRouteId);
    if (!r) return false;

    if (this.activeWaypointIndex < r.points.length - 1) {
      this.activeWaypointIndex++;
      this.saveToDisk();
      return true;
    }
    return false;
  }

  _recalculateRoute(route) {
    route.legs = [];
    route.totalDistanceNm = 0;

    if (!route.points || route.points.length < 2) return;

    let totalDist = 0;
    for (let i = 0; i < route.points.length - 1; i++) {
      const p1 = route.points[i];
      const p2 = route.points[i + 1];

      const leg =
        route.navType === 'great_circle'
          ? RoutePlanner.greatCircleDistanceAndBearing(p1.lat, p1.lon, p2.lat, p2.lon)
          : RoutePlanner.rhumbDistanceAndBearing(p1.lat, p1.lon, p2.lat, p2.lon);

      totalDist += leg.distanceNm;
      route.legs.push({
        fromIndex: i,
        toIndex: i + 1,
        fromName: p1.name,
        toName: p2.name,
        distanceNm: leg.distanceNm,
        bearingTrue: leg.bearingTrue
      });
    }

    route.totalDistanceNm = parseFloat(totalDist.toFixed(2));
  }

  _recalculateAllRoutes() {
    for (const r of this.routes) {
      this._recalculateRoute(r);
    }
  }

  // =========================================================
  // تصدير واستيراد ملفات GPX القياسية (GPX 1.1 Standard XML)
  // =========================================================

  /**
   * تصدير مسار أو جميع المسارات والنقاط بصيغة GPX قياسية معتمدة ملاحياً.
   * @param {string|null} routeId تصدير مسار محدد أو الكل
   * @param {Array<{lat:number,lon:number,ts?:number}>} [tracks] نقاط أثر الإبحار (trk)
   */
  exportToGPX(routeId = null, tracks = null) {
    const routesToExport = routeId ? this.routes.filter((r) => r.id === routeId) : this.routes;

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<gpx version="1.1" creator="ARN Marine Navigator - ARN Technology" xmlns="http://www.topografix.com/GPX/1/1">\n`;
    xml += `  <metadata>\n`;
    xml += `    <name>ARN Marine Navigation Plan</name>\n`;
    xml += `    <author><name>عبده رجب نصار</name></author>\n`;
    xml += `    <time>${new Date().toISOString()}</time>\n`;
    xml += `  </metadata>\n`;

    // 1. تصدير النقاط الإرشادية المنفصلة
    for (const wpt of this.waypoints) {
      xml += `  <wpt lat="${wpt.lat}" lon="${wpt.lon}">\n`;
      xml += `    <name>${escapeXml(wpt.name)}</name>\n`;
      if (wpt.desc) xml += `    <desc>${escapeXml(wpt.desc)}</desc>\n`;
      xml += `    <sym>Waypoint</sym>\n`;
      xml += `  </wpt>\n`;
    }

    // 2. تصدير المسارات المحددة
    for (const route of routesToExport) {
      xml += `  <rte>\n`;
      xml += `    <name>${escapeXml(route.name)}</name>\n`;
      xml += `    <number>${route.id}</number>\n`;
      for (const pt of route.points) {
        xml += `    <rtept lat="${pt.lat}" lon="${pt.lon}">\n`;
        xml += `      <name>${escapeXml(pt.name)}</name>\n`;
        xml += `    </rtept>\n`;
      }
      xml += `  </rte>\n`;
    }

    // 3. تصدير أثر الإبحار الحي كمسار مستمر <trk><trkseg>
    if (Array.isArray(tracks) && tracks.length > 1) {
      xml += `  <trk>\n`;
      xml += `    <name>${escapeXml('Vessel Track Log')}</name>\n`;
      xml += `    <trkseg>\n`;
      for (const tp of tracks) {
        if (!RoutePlanner.isValidLatLon(tp.lat, tp.lon)) continue;
        const timeAttr = tp.ts ? `\n      <time>${new Date(tp.ts).toISOString()}</time>` : '';
        xml += `      <trkpt lat="${Number(tp.lat)}" lon="${Number(tp.lon)}">${timeAttr}\n      </trkpt>\n`;
      }
      xml += `    </trkseg>\n  </trk>\n`;
    }

    xml += `</gpx>\n`;
    return xml;
  }

  /**
   * استيراد وتحليل ملف GPX من محرك الأقراص
   */
  importFromGPX(gpxContent) {
    const importedRoutes = [];
    const importedWaypoints = [];

    try {
      // 1. استخراج النقاط المنفصلة <wpt lat="..." lon="...">
      const wptRegex = /<wpt\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>([\s\S]*?)<\/wpt>/gi;
      let match;
      while ((match = wptRegex.exec(gpxContent)) !== null) {
        const lat = parseFloat(match[1]);
        const lon = parseFloat(match[2]);
        const inner = match[3];
        const nameMatch = /<name>([^<]+)<\/name>/i.exec(inner);
        const name = nameMatch ? unescapeXml(nameMatch[1].trim()) : `WPT ${importedWaypoints.length + 1}`;
        const descMatch = /<desc>([^<]+)<\/desc>/i.exec(inner);
        const desc = descMatch ? unescapeXml(descMatch[1].trim()) : '';

        const wpt = this.createWaypoint(lat, lon, name, desc);
        importedWaypoints.push(wpt);
      }

      // 2. استخراج المسارات <rte> ... <rtept lat="..." lon="...">
      const rteRegex = /<rte>([\s\S]*?)<\/rte>/gi;
      let rteMatch;
      while ((rteMatch = rteRegex.exec(gpxContent)) !== null) {
        const rteInner = rteMatch[1];
        const nameMatch = /<name>([^<]+)<\/name>/i.exec(rteInner);
        const routeName = nameMatch ? unescapeXml(nameMatch[1].trim()) : `مسار مستورد ${importedRoutes.length + 1}`;

        const points = [];
        const ptRegex = /<rtept\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>([\s\S]*?)<\/rtept>/gi;
        let ptMatch;
        let pIndex = 1;
        while ((ptMatch = ptRegex.exec(rteInner)) !== null) {
          const lat = parseFloat(ptMatch[1]);
          const lon = parseFloat(ptMatch[2]);
          const ptInner = ptMatch[3];
          const ptNameMatch = /<name>([^<]+)<\/name>/i.exec(ptInner);
          const ptName = ptNameMatch ? unescapeXml(ptNameMatch[1].trim()) : `P${pIndex}`;

          points.push({
            id: RoutePlanner.newId('pt'),
            name: ptName,
            lat,
            lon
          });
          pIndex++;
        }

        if (points.length > 0) {
          const newRoute = this.createRoute(routeName, points, 'rhumb');
          importedRoutes.push(newRoute);
        }
      }

      // 3. استخراج مسارات الأثر <trk><trkseg><trkpt> وتحويلها لمسارات ملاحية
      const trkRegex = /<trk(?:\s[^>]*)?>([\s\S]*?)<\/trk>/gi;
      let trkMatch;
      let importedTracksCount = 0;
      while ((trkMatch = trkRegex.exec(gpxContent)) !== null) {
        const trkInner = trkMatch[1];
        const nameMatch = /<name>([^<]+)<\/name>/i.exec(trkInner);
        const trkName = nameMatch ? unescapeXml(nameMatch[1].trim()) : `أثر مستورد ${importedTracksCount + 1}`;

        const points = [];
        const ptRegex = /<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>([\s\S]*?)<\/trkpt>/gi;
        let ptMatch;
        let pIndex = 1;
        while ((ptMatch = ptRegex.exec(trkInner)) !== null) {
          const lat = parseFloat(ptMatch[1]);
          const lon = parseFloat(ptMatch[2]);
          if (RoutePlanner.isValidLatLon(lat, lon)) {
            points.push({
              id: RoutePlanner.newId('pt'),
              name: `T${pIndex}`,
              lat,
              lon
            });
            pIndex++;
          }
        }

        if (points.length >= 2) {
          const trkRoute = this.createRoute(trkName, points, 'rhumb');
          trkRoute.navType = 'track';
          this._recalculateRoute(trkRoute);
          this.saveToDisk();
          importedRoutes.push(trkRoute);
          importedTracksCount++;
        }
      }

      this.saveToDisk();
      return {
        success: true,
        importedRoutesCount: importedRoutes.length,
        importedWaypointsCount: importedWaypoints.length,
        importedTracksCount
      };
    } catch (err) {
      console.error('[RoutePlanner] GPX Import failed:', err.message);
      return { success: false, error: err.message };
    }
  }

  getActiveSteering(vesselLat, vesselLon, sog, cog) {
    if (!this.activeRouteId || vesselLat === null || vesselLon === null) return null;
    const route = this.routes.find((r) => r.id === this.activeRouteId);
    if (!route || !route.points || route.points.length === 0) return null;

    const targetIdx = Math.min(this.activeWaypointIndex, route.points.length - 1);
    const targetWpt = route.points[targetIdx];

    // بداية المرحلة (Leg Start): النقطة السابقة أو موقع السفينة الحالي
    let startLat = vesselLat;
    let startLon = vesselLon;
    if (targetIdx > 0) {
      startLat = route.points[targetIdx - 1].lat;
      startLon = route.points[targetIdx - 1].lon;
    }

    const steering = RoutePlanner.calculateSteering(
      vesselLat,
      vesselLon,
      sog || 0,
      cog || 0,
      startLat,
      startLon,
      targetWpt.lat,
      targetWpt.lon
    );

    return {
      routeId: route.id,
      routeName: route.name,
      targetWaypointIndex: targetIdx,
      targetWaypointName: targetWpt.name,
      targetWaypointLat: targetWpt.lat,
      targetWaypointLon: targetWpt.lon,
      totalRouteDistanceNm: route.totalDistanceNm,
      ...steering
    };
  }
}

function escapeXml(unsafe) {
  if (!unsafe) return '';
  return String(unsafe).replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case "'":
        return '&apos;';
      case '"':
        return '&quot;';
    }
  });
}

function unescapeXml(safe) {
  if (!safe) return '';
  return safe
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"');
}

module.exports = RoutePlanner;
