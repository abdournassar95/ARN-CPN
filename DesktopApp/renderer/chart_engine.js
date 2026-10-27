/**
 * ARN Marine Navigator - Offline Nautical Chart Engine
 * شركة ARN Technology - تطوير وبرمجة: عبده رجب نصار
 * محرك الخرائط البحرية والملاحة التكتيكية (100% Offline)
 */

class MarineChartEngine {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');

    // مركز العرض الملاحي
    this.centerLat = 27.8340;
    this.centerLon = 34.3210;
    this.zoom = 10; // مستوى التكبير

    // حالة تفاعل الفأرة والتحريك
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;

    // تتبع أثر الإبحار (Vessel Breadcrumb Track)
    this.trackHistory = [];
    this.maxTrackPoints = 2000;

    // الخرائط الملاحية النشطة وطبقات العرض
    this.activeCharts = [];
    this.s57Charts = []; // خرائط المتجهات S-57 المحملة
    this.showChartOutlines = true;
    this.showRasterCharts = true;
    this.rasterOpacity = 0.85;
    this.showDepthContours = true;
    this.showNavAids = true;
    this.showSoundings = true;
    this.showTides = true;

    // خيارات العرض ومستويات التفاصيل الملاحية وفق معايير OpenCPN & IHO S-52
    this.displayCategory = 'standard'; // 'base', 'standard', 'all'
    this.detailFactor = 0;              // منزلق التفاصيل من -5 إلى +5 (OpenCPN CM93 Detail Slider)
    this.showCountryNames = true;
    this.showCityNames = true;
    this.showSeaNames = true;
    this.showLightSectors = true;
    this.places = { countries: [], cities: [], seas: [] };

    // بيانات الطبقات الجغرافية الحقيقية (خالية من أي بيانات وهمية)
    this.coastlines = [];      // مضلعات GSHHS و S-57 الحقيقية
    this.depthContours = [];   // خطوط الأعماق
    this.depthAreas = [];      // مناطق الأعماق
    this.navAids = [];         // المنارات والعوامات
    this.soundings = [];       // قياسات الأعماق النقطية
    this.hazards = [];         // حطام السفن والعوائق
    this.tideStations = [];    // محطات المد والجزر

    // طبقات الملاحة التفاعلية (المسارات والنقاط الإرشادية و EBL/VRM)
    this.routes = [];
    this.waypoints = [];
    this.activeRouteId = null;
    this.activeWaypointIndex = 0;
    this.activeSteering = null;
    this.magneticVariation = 0;
    this.isRouteDrawingMode = false;
    this.tempRoutePoints = [];
    this.cursorGeo = null;
    this.eblVrm = {
      active: false,
      originLat: null,
      originLon: null,
      targetLat: null,
      targetLon: null,
      attachToVessel: true
    };
    this.onChartClick = null;
    this.onCursorMove = null;

    this.onBoundsChange = null;
    this._boundsDebounceTimer = null;

    this._bindEvents();
    this.resize();
  }

  resize() {
    if (!this.canvas || !this.canvas.parentElement) return;
    this.width = this.canvas.parentElement.clientWidth;
    this.height = this.canvas.parentElement.clientHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this._triggerBoundsUpdate();
  }

  /**
   * حساب الحدود الجغرافية الحالية للشاشة [minLon, minLat, maxLon, maxLat]
   */
  getViewBounds() {
    const pTopLeft = this.pixelToGeo(0, 0);
    const pBottomRight = this.pixelToGeo(this.width, this.height);

    const minLon = Math.min(pTopLeft.lon, pBottomRight.lon);
    const maxLon = Math.max(pTopLeft.lon, pBottomRight.lon);
    const minLat = Math.min(pTopLeft.lat, pBottomRight.lat);
    const maxLat = Math.max(pTopLeft.lat, pBottomRight.lat);

    return [minLon, minLat, maxLon, maxLat];
  }

  _triggerBoundsUpdate() {
    clearTimeout(this._boundsDebounceTimer);
    this._boundsDebounceTimer = setTimeout(() => {
      if (typeof this.onBoundsChange === 'function') {
        this.onBoundsChange(this.getViewBounds());
      }
    }, 250);
  }

  /**
   * تحويل إحداثيات (Lat, Lon) إلى بكسل على شاشة الكانفاس (Mercator Projection)
   */
  geoToPixel(lat, lon) {
    const scale = Math.pow(2, this.zoom) * 256;
    
    // معادلة مركاتور الكلاسيكية
    const x = ((lon - this.centerLon) * (Math.PI / 180)) * (scale / (2 * Math.PI)) + (this.width / 2);
    
    const latRad = (lat * Math.PI) / 180;
    const centerLatRad = (this.centerLat * Math.PI) / 180;
    
    const yCenter = Math.log(Math.tan(Math.PI / 4 + centerLatRad / 2));
    const yPoint = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
    
    const y = ((yCenter - yPoint) * (scale / (2 * Math.PI))) + (this.height / 2);

    return { x, y };
  }

  pixelToGeo(x, y) {
    const scale = Math.pow(2, this.zoom) * 256;
    const lon = this.centerLon + ((x - (this.width / 2)) * (2 * Math.PI) / scale) * (180 / Math.PI);

    const centerLatRad = (this.centerLat * Math.PI) / 180;
    const yCenter = Math.log(Math.tan(Math.PI / 4 + centerLatRad / 2));
    const yPoint = yCenter - ((y - (this.height / 2)) * (2 * Math.PI) / scale);

    const latRad = 2 * (Math.atan(Math.exp(yPoint)) - Math.PI / 4);
    const lat = (latRad * 180) / Math.PI;

    return { lat, lon };
  }

  /**
   * رسم المشهد الملاحي بالكامل
   */
  render(vesselState, aisTargets) {
    if (!this.ctx) return;

    if (vesselState !== undefined) {
      this.lastVesselState = vesselState;
    } else {
      vesselState = this.lastVesselState;
    }

    if (aisTargets !== undefined) {
      this.lastAisTargets = aisTargets;
    } else {
      aisTargets = this.lastAisTargets || [];
    }

    const ctx = this.ctx;

    // مسح الشاشة
    ctx.clearRect(0, 0, this.width, this.height);

    // 1. رسم شبكة الإحداثيات البحرية (Graticule Grid)
    this._renderGraticule(ctx);

    // 2. رسم مناطق الأعماق S-57 (Depth Areas - Shallow / Deep Shading)
    if (this.showDepthContours) {
      this._renderDepthAreas(ctx);
    }

    // 3. رسم خطوط السواحل والشواطئ الطبوغرافية الحقيقية (Offline GSHHS & S-57)
    this._renderCoastlines(ctx);

    // 4. رسم رقع الخرائط النقطية المحلية (BSB / KAP / MBTiles Overlays)
    this._renderRasterOverlays(ctx);

    // 5. رسم خطوط الأعماق ومناطق المياه الضحلة (Depth Contours)
    if (this.showDepthContours) {
      this._renderDepthContours(ctx);
    }

    // 6. رسم قياسات الأعماق النقطية S-57 (Soundings)
    const minSoundingZoom = Math.max(6, 11 - this.detailFactor);
    if (this.showSoundings && this.zoom >= minSoundingZoom) {
      this._renderSoundings(ctx);
    }

    // 7. رسم حطام السفن والعوائق (Hazards & Wrecks)
    if (this.showHazards !== false) {
      this._renderHazards(ctx);
    }

    // 8. رسم محطات المد والجزر والتيارات (Tide & Current Stations)
    if (this.showTides) {
      this._renderTideStations(ctx);
    }

    // 9. رسم المنارات وعلامات الملاحة الدولية (Aids to Navigation)
    if (this.showNavAids) {
      this._renderNavAids(ctx);
    }

    // 10. رسم حدود وتفاصيل الخرائط الملاحية النشطة (Chart Outlines)
    this._renderChartOutlines(ctx);

    // 10a. رسم أسماء البحار والمحيطات والخلجان الملاحية
    if (this.showSeaNames) {
      this._renderSeaNames(ctx);
    }

    // 10b. رسم أسماء الدول والأقاليم
    if (this.showCountryNames) {
      this._renderCountryNames(ctx);
    }

    // 10c. رسم الموانئ والمدن الساحلية
    if (this.showCityNames) {
      this._renderCityNames(ctx);
    }

    // 10b. رسم المسارات البحرية المخططة (Navigation Routes)
    this._renderRoutes(ctx);

    // 10c. رسم النقاط الإرشادية (Waypoints)
    this._renderWaypoints(ctx);

    // 10d. رسم خط التوجيه النشط وانحراف المسار (Active Steering & XTE)
    if (vesselState) {
      this._renderActiveSteering(ctx, vesselState);
    }

    // 10e. رسم المسار التفاعلي قيد الإنشاء (Interactive Route Drawing)
    if (this.isRouteDrawingMode) {
      this._renderTempRoute(ctx);
    }

    // 11. رسم أثر الإبحار السابق (Vessel Track)
    if (vesselState) {
      this._recordAndRenderTrack(ctx, vesselState);
    }

    // 12. رسم دائرة مراقبة المخطاف إن كانت نشطة
    if (vesselState && vesselState.anchorWatch && vesselState.anchorPos) {
      this._renderAnchorCircle(ctx, vesselState);
    }

    // 13. رسم نقطة الطوارئ رجل في البحر MOB
    if (vesselState && vesselState.mobActive && vesselState.mobPos) {
      this._renderMOB(ctx, vesselState.mobPos);
    }

    // 14. رسم أهداف الـ AIS وسفن الرادار الحقيقية
    if (aisTargets && aisTargets.length > 0) {
      this._renderAISTargets(ctx, aisTargets);
    }

    // 15. رسم سفينتنا الرئيسية (Own Vessel) - فقط عند وجود إشارة GPS حقيقية
    if (vesselState) {
      this._renderOwnVessel(ctx, vesselState);
    }

    // 15b. رسم مسطرة قياس الاتجاه والمسافة EBL / VRM
    if (this.eblVrm && this.eblVrm.active) {
      this._renderEblVrm(ctx, vesselState);
    }

    // 16. رسم مسطرة قياس المسافات البحرية (Nautical Miles Scale)
    this._renderScaleBar(ctx);
  }

  /**
   * شبكة الإحداثيات الجغرافية (خطوط الطول والعرض)
   */
  _renderGraticule(ctx) {
    let gridStep = 0.5;
    if (this.zoom >= 14) gridStep = 0.02;
    else if (this.zoom >= 12) gridStep = 0.05;
    else if (this.zoom >= 10) gridStep = 0.1;
    else if (this.zoom >= 8) gridStep = 0.5;
    else if (this.zoom >= 6) gridStep = 1.0;
    else gridStep = 5.0;

    const topLeft = this.pixelToGeo(0, 0);
    const bottomRight = this.pixelToGeo(this.width, this.height);

    const startLat = Math.floor(bottomRight.lat / gridStep) * gridStep;
    const endLat = Math.ceil(topLeft.lat / gridStep) * gridStep;
    const startLon = Math.floor(topLeft.lon / gridStep) * gridStep;
    const endLon = Math.ceil(bottomRight.lon / gridStep) * gridStep;

    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
    ctx.lineWidth = 1;
    ctx.font = '10px JetBrains Mono';
    ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';

    // خطوط العرض
    for (let lat = startLat; lat <= endLat; lat += gridStep) {
      const p = this.geoToPixel(lat, this.centerLon);
      ctx.beginPath();
      ctx.moveTo(0, p.y);
      ctx.lineTo(this.width, p.y);
      ctx.stroke();

      const deg = Math.floor(Math.abs(lat));
      const min = ((Math.abs(lat) - deg) * 60).toFixed(1);
      ctx.fillText(`${deg}° ${min}' N`, 10, p.y - 4);
    }

    // خطوط الطول
    for (let lon = startLon; lon <= endLon; lon += gridStep) {
      const p = this.geoToPixel(this.centerLat, lon);
      ctx.beginPath();
      ctx.moveTo(p.x, 0);
      ctx.lineTo(p.x, this.height);
      ctx.stroke();

      const deg = Math.floor(Math.abs(lon));
      const min = ((Math.abs(lon) - deg) * 60).toFixed(1);
      ctx.fillText(`${deg}° ${min}' E`, p.x + 4, this.height - 10);
    }

    ctx.restore();
  }

  /**
   * رسم مناطق الأعماق (S-57 Depth Areas)
   */
  _renderDepthAreas(ctx) {
    if (!this.depthAreas || this.depthAreas.length === 0) return;

    ctx.save();
    for (const area of this.depthAreas) {
      // تظليل أزرق سماوي للمياه الضحلة وتدرج أغمق للمياه العميقة
      let fillColor = 'rgba(56, 189, 248, 0.04)';
      if (area.maxDepth <= 5) fillColor = 'rgba(56, 189, 248, 0.15)'; // ضحلة جداً
      else if (area.maxDepth <= 10) fillColor = 'rgba(56, 189, 248, 0.10)';
      else if (area.maxDepth <= 20) fillColor = 'rgba(56, 189, 248, 0.06)';

      ctx.fillStyle = fillColor;
      ctx.beginPath();
      for (let i = 0; i < area.points.length; i++) {
        const pt = this.geoToPixel(area.points[i][0], area.points[i][1]);
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * رسم خطوط السواحل والشواطئ الحقيقية
   */
  _renderCoastlines(ctx) {
    if (!this.coastlines || this.coastlines.length === 0) return;

    ctx.save();
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
    ctx.lineWidth = 1.5;

    for (const polygon of this.coastlines) {
      const pts = polygon.points || polygon;
      if (!pts || pts.length < 2) continue;

      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const pt = this.geoToPixel(pts[i][0], pts[i][1]);
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * رسم خطوط الأعماق البحرية ومناطق الأمان (Depth Contours)
   */
  _renderDepthContours(ctx) {
    if (!this.depthContours || this.depthContours.length === 0) return;

    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    for (const contour of this.depthContours) {
      const pts = contour.points || contour;
      if (!pts || pts.length < 2) continue;

      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const pt = this.geoToPixel(pts[i][0], pts[i][1]);
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();
      
      // كتابة قيمة العمق على الخط
      if (contour.depth && pts.length > 2) {
        const midIdx = Math.floor(pts.length / 2);
        const midPt = this.geoToPixel(pts[midIdx][0], pts[midIdx][1]);
        ctx.fillStyle = 'rgba(56, 189, 248, 0.8)';
        ctx.font = '10px JetBrains Mono';
        ctx.fillText(`${contour.depth}m`, midPt.x, midPt.y);
      }
    }
    ctx.restore();
  }

  /**
   * رسم قياسات الأعماق النقطية S-57 (Soundings)
   */
  _renderSoundings(ctx) {
    if (!this.soundings || this.soundings.length === 0) return;

    ctx.save();
    ctx.fillStyle = 'rgba(148, 163, 184, 0.75)';
    ctx.font = '9px JetBrains Mono';

    for (const s of this.soundings) {
      const pt = this.geoToPixel(s.lat, s.lon);
      if (pt.x >= 0 && pt.x <= this.width && pt.y >= 0 && pt.y <= this.height) {
        ctx.fillText(String(s.depth), pt.x, pt.y);
      }
    }
    ctx.restore();
  }

  /**
   * رسم حطام السفن والعوائق (Hazards & Wrecks)
   */
  _renderHazards(ctx) {
    if (!this.hazards || this.hazards.length === 0) return;

    ctx.save();
    for (const h of this.hazards) {
      const pt = this.geoToPixel(h.lat, h.lon);
      if (pt.x < -20 || pt.x > this.width + 20 || pt.y < -20 || pt.y > this.height + 20) continue;

      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.5;

      // رمز غرق السفينة القياسي (خط متقاطع)
      ctx.beginPath();
      ctx.moveTo(pt.x - 7, pt.y);
      ctx.lineTo(pt.x + 7, pt.y);
      ctx.moveTo(pt.x, pt.y - 5);
      ctx.lineTo(pt.x, pt.y + 5);
      ctx.stroke();

      ctx.fillStyle = '#ef4444';
      ctx.font = '9px Cairo';
      ctx.fillText(h.name || 'Wreck', pt.x + 8, pt.y + 3);
    }
    ctx.restore();
  }

  /**
   * رسم محطات المد والجزر والتيارات (XTide Stations)
   */
  _renderTideStations(ctx) {
    if (!this.tideStations || this.tideStations.length === 0) return;

    ctx.save();
    for (const st of this.tideStations) {
      const pt = this.geoToPixel(st.lat, st.lon);
      if (pt.x < -30 || pt.x > this.width + 30 || pt.y < -30 || pt.y > this.height + 30) continue;

      const isTide = st.type === 'Tide';
      const color = isTide ? '#38bdf8' : '#10b981';

      // رمز الماسة للمد، أو السهم للتيار
      ctx.fillStyle = color;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;

      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.font = 'bold 9px Cairo';
      ctx.fillStyle = color;
      ctx.fillText(`[${isTide ? 'مد' : 'تيار'}] ${st.name}`, pt.x + 8, pt.y + 3);
    }
    ctx.restore();
  }

  /**
   * رسم المنارات وعلامات الملاحة (Lighthouses & Buoys)
   */
  _renderNavAids(ctx) {
    if (!this.navAids || this.navAids.length === 0) return;

    ctx.save();
    for (const aid of this.navAids) {
      const pt = this.geoToPixel(aid.lat, aid.lon);
      if (pt.x < -30 || pt.x > this.width + 30 || pt.y < -30 || pt.y > this.height + 30) continue;
      
      // منارة مضيئة
      if (aid.type === 'lighthouse') {
        // هالة وميض الضوء
        ctx.fillStyle = 'rgba(250, 204, 21, 0.25)';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 14, 0, Math.PI * 2);
        ctx.fill();

        // قطاع ضوء المنارة الزاوي (Light Sector Arc)
        if (this.showLightSectors) {
          ctx.strokeStyle = 'rgba(250, 204, 21, 0.4)';
          ctx.setLineDash([4, 2]);
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 26, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // رمز المنارة
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#f8fafc';
        ctx.font = '10px Cairo';
        ctx.fillText(aid.name, pt.x + 8, pt.y + 4);
      } 
      // عوامة ملاحية (Buoy)
      else {
        ctx.fillStyle = aid.color || '#10b981';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /**
   * رسم حدود الخرائط الملاحية النشطة (Chart Outlines & Quilting)
   */
  _renderChartOutlines(ctx) {
    if (!this.showChartOutlines || !this.activeCharts || this.activeCharts.length === 0) return;

    ctx.save();
    for (const chart of this.activeCharts) {
      let strokeColor = '#38bdf8'; // BSB / KAP (Cyan)
      let fillColor = 'rgba(56, 189, 248, 0.08)';
      if (chart.type === 'S-57') {
        strokeColor = '#a855f7'; // S-57 ENC (Purple)
        fillColor = 'rgba(168, 85, 247, 0.08)';
      } else if (chart.type === 'MBTiles') {
        strokeColor = '#10b981'; // MBTiles (Green)
        fillColor = 'rgba(16, 185, 129, 0.08)';
      } else if (chart.type === 'CM93') {
        strokeColor = '#f59e0b'; // CM93 (Amber)
        fillColor = 'rgba(245, 158, 11, 0.08)';
      }

      ctx.strokeStyle = strokeColor;
      ctx.fillStyle = fillColor;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 3]);

      let pts = [];
      if (chart.neatline && chart.neatline.length >= 3) {
        pts = chart.neatline.map(p => this.geoToPixel(p[0], p[1]));
      } else if (chart.bounds && chart.bounds.length >= 4) {
        const [minLon, minLat, maxLon, maxLat] = chart.bounds;
        pts = [
          this.geoToPixel(minLat, minLon),
          this.geoToPixel(maxLat, minLon),
          this.geoToPixel(maxLat, maxLon),
          this.geoToPixel(minLat, maxLon)
        ];
      }

      if (pts.length >= 3) {
        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) {
          if (i === 0) ctx.moveTo(pts[i].x, pts[i].y);
          else ctx.lineTo(pts[i].x, pts[i].y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // بطاقة ملصق الخريطة البحرية
        const labelPt = pts[0];
        ctx.font = 'bold 10px JetBrains Mono';
        ctx.fillStyle = strokeColor;
        ctx.fillText(`[${chart.type}] ${chart.name || chart.title}`, labelPt.x + 8, labelPt.y - 6);
      }
    }
    ctx.restore();
  }

  /**
   * رسم رقع الخرائط النقطية المحلية (BSB / KAP / MBTiles Overlays)
   */
  _renderRasterOverlays(ctx) {
    if (!this.showRasterCharts || !this.activeCharts || this.activeCharts.length === 0) return;

    ctx.save();
    ctx.globalAlpha = this.rasterOpacity;

    for (const chart of this.activeCharts) {
      if (chart.type === 'BSB' || chart.type === 'KAP') {
        if (chart.bounds && chart.bounds.length >= 4) {
          const [minLon, minLat, maxLon, maxLat] = chart.bounds;
          const pTopLeft = this.geoToPixel(maxLat, minLon);
          const pBottomRight = this.geoToPixel(minLat, maxLon);
          const w = pBottomRight.x - pTopLeft.x;
          const h = pBottomRight.y - pTopLeft.y;

          // ورقة الخريطة الملاحية
          ctx.fillStyle = 'rgba(254, 252, 232, 0.20)';
          ctx.fillRect(pTopLeft.x, pTopLeft.y, w, h);

          // إطار الخريطة المزدوج
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(pTopLeft.x, pTopLeft.y, w, h);

          // عنوان وبيانات الخريطة الورقية الممسوحة
          ctx.font = 'bold 11px Cairo';
          ctx.fillStyle = '#38bdf8';
          ctx.fillText(`خريطة ورقية: ${chart.title || chart.name}`, pTopLeft.x + 10, pTopLeft.y + 18);
          ctx.font = '10px JetBrains Mono';
          ctx.fillStyle = '#94a3b8';
          ctx.fillText(`Scale: ${chart.scale || 'N/A'} | Datum: ${chart.datum || 'WGS84'}`, pTopLeft.x + 10, pTopLeft.y + 32);
        }
      }
    }
    ctx.restore();
  }

  /**
   * تسجيل ورسم أثر إبحار السفينة (Breadcrumbs)
   */
  _recordAndRenderTrack(ctx, vessel) {
    if (!vessel || vessel.lat === null || vessel.lon === null) return;

    const lastPoint = this.trackHistory[this.trackHistory.length - 1];
    if (!lastPoint || Math.abs(lastPoint.lat - vessel.lat) > 0.0001 || Math.abs(lastPoint.lon - vessel.lon) > 0.0001) {
      this.trackHistory.push({ lat: vessel.lat, lon: vessel.lon });
      if (this.trackHistory.length > this.maxTrackPoints) this.trackHistory.shift();
    }

    if (this.trackHistory.length < 2) return;

    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);

    ctx.beginPath();
    for (let i = 0; i < this.trackHistory.length; i++) {
      const pt = this.geoToPixel(this.trackHistory[i].lat, this.trackHistory[i].lon);
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * رسم سفينتنا الرئيسية (Own Vessel) - فقط عند توفر إشارة GPS حقيقية
   */
  _renderOwnVessel(ctx, vessel) {
    if (!vessel || vessel.lat === null || vessel.lon === null) return;

    const pt = this.geoToPixel(vessel.lat, vessel.lon);
    const radHeading = ((vessel.heading || 0) * Math.PI) / 180;

    ctx.save();
    ctx.translate(pt.x, pt.y);

    // 1. متجه الاتجاه ومؤشر السرعة (Course Predictor Vector)
    const vectorLength = Math.max(25, vessel.sog * 3.5);
    ctx.rotate(radHeading);

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -vectorLength);
    ctx.stroke();

    // 2. هيكل السفينة التكتيكي
    ctx.fillStyle = '#0284c7';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(0, -18);      // Bow
    ctx.lineTo(9, 12);       // Starboard
    ctx.lineTo(0, 7);        // Stern
    ctx.lineTo(-9, 12);      // Port
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // نقطة مركز السفينة
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // اسم السفينة والسرعة بجانبها
    ctx.save();
    ctx.font = '11px Cairo';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(`${vessel.name} [${vessel.sog} Kts]`, pt.x + 15, pt.y + 4);
    ctx.restore();
  }

  /**
   * رسم أهداف الـ AIS وسفن الرادار
   */
  _renderAISTargets(ctx, aisTargets) {
    ctx.save();

    for (const target of aisTargets) {
      const pt = this.geoToPixel(target.lat, target.lon);
      const radCog = (target.cog * Math.PI) / 180;

      ctx.save();
      ctx.translate(pt.x, pt.y);

      let targetColor = '#10b981'; // آمن أخضر
      if (target.status === 'WARNING') targetColor = '#f59e0b';
      else if (target.status === 'DANGER') targetColor = '#ef4444';

      ctx.rotate(radCog);
      ctx.strokeStyle = targetColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -target.sog * 2.5);
      ctx.stroke();

      ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.lineTo(7, 8);
      ctx.lineTo(-7, 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.restore();

      ctx.font = '10px JetBrains Mono';
      ctx.fillStyle = targetColor;
      ctx.fillText(`${target.name}`, pt.x + 12, pt.y - 2);
      ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
      ctx.fillText(`CPA: ${target.cpa}nm | ${target.tcpa}m`, pt.x + 12, pt.y + 11);
    }

    ctx.restore();
  }

  /**
   * رسم دائرة مراقبة المخطاف (Anchor Watch Circle)
   */
  _renderAnchorCircle(ctx, vessel) {
    const pt = this.geoToPixel(vessel.anchorPos.lat, vessel.anchorPos.lon);
    const radiusMeters = vessel.anchorRadius || 50;
    const testPt = this.geoToPixel(vessel.anchorPos.lat, vessel.anchorPos.lon + (radiusMeters / 111320));
    const pixelRadius = Math.max(15, Math.abs(testPt.x - pt.x));

    ctx.save();
    ctx.strokeStyle = '#f59e0b';
    ctx.fillStyle = 'rgba(245, 158, 11, 0.1)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);

    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pixelRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '11px Cairo';
    ctx.fillText(`مخطاف (${radiusMeters}م)`, pt.x + 10, pt.y + 4);

    ctx.restore();
  }

  /**
   * رسم نقطة طوارئ رجل في البحر MOB
   */
  _renderMOB(ctx, mobPos) {
    const pt = this.geoToPixel(mobPos.lat, mobPos.lon);

    ctx.save();
    ctx.strokeStyle = '#ef4444';
    ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 20, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fill();

    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 12px Cairo';
    ctx.fillText(`طوارئ M.O.B! [${mobPos.time}]`, pt.x + 12, pt.y + 4);
    ctx.restore();
  }

  /**
   * مسطرة قياس المسافات بالأميال البحرية
   */
  _renderScaleBar(ctx) {
    const nm = 2;
    const p1 = this.geoToPixel(this.centerLat, this.centerLon);
    const p2 = this.geoToPixel(this.centerLat, this.centerLon + (nm / 60));
    const barWidth = Math.abs(p2.x - p1.x);

    ctx.save();
    const x = 20;
    const y = this.height - 30;

    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + barWidth, y);
    ctx.moveTo(x, y - 5);
    ctx.lineTo(x, y + 5);
    ctx.moveTo(x + barWidth, y - 5);
    ctx.lineTo(x + barWidth, y + 5);
    ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px JetBrains Mono';
    ctx.fillText(`${nm} Nautical Miles`, x + 5, y - 6);
    ctx.restore();
  }

  /**
   * رسم المسارات البحرية المخططة
   */
  _renderRoutes(ctx) {
    if (!this.routes || this.routes.length === 0) return;

    ctx.save();
    for (const route of this.routes) {
      if (!route.points || route.points.length < 2) continue;
      const isActive = (route.id === this.activeRouteId);

      // رسم مسار المرحلة
      ctx.beginPath();
      for (let i = 0; i < route.points.length; i++) {
        const pt = route.points[i];
        const p = this.geoToPixel(pt.lat, pt.lon);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }

      if (isActive) {
        ctx.strokeStyle = '#f59e0b'; // لون ذهبي ملاحي للمسار النشط
        ctx.lineWidth = 3.5;
        ctx.setLineDash([8, 4]);
      } else {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // رسم بطاقات المراحل (Leg Badges) إذا كان التكبير مناسباً
      if (this.zoom >= 8 && route.legs) {
        for (const leg of route.legs) {
          if (!route.points[leg.fromIndex] || !route.points[leg.toIndex]) continue;
          const p1 = this.geoToPixel(route.points[leg.fromIndex].lat, route.points[leg.fromIndex].lon);
          const p2 = this.geoToPixel(route.points[leg.toIndex].lat, route.points[leg.toIndex].lon);
          const midX = (p1.x + p2.x) / 2;
          const midY = (p1.y + p2.y) / 2;

          const text = `${leg.distanceNm} NM @ ${Math.round(leg.bearingTrue)}°T`;
          ctx.font = '10px JetBrains Mono';
          const txtWidth = ctx.measureText(text).width;

          ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
          ctx.strokeStyle = isActive ? '#f59e0b' : 'rgba(56, 189, 248, 0.4)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(midX - (txtWidth / 2) - 6, midY - 9, txtWidth + 12, 18, 4);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = isActive ? '#fef08a' : '#94a3b8';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, midX, midY);
        }
      }
    }
    ctx.restore();
  }

  /**
   * رسم النقاط الإرشادية (Waypoints)
   */
  _renderWaypoints(ctx) {
    if (!this.waypoints && (!this.routes || this.routes.length === 0)) return;

    // تجميع كافة النقاط
    const allWpts = [...(this.waypoints || [])];
    if (this.routes) {
      for (const r of this.routes) {
        if (r.points) {
          for (let i = 0; i < r.points.length; i++) {
            const p = r.points[i];
            const isTarget = (r.id === this.activeRouteId && i === this.activeWaypointIndex);
            allWpts.push({ ...p, isTarget, routeName: r.name });
          }
        }
      }
    }

    ctx.save();
    for (const wpt of allWpts) {
      const p = this.geoToPixel(wpt.lat, wpt.lon);
      if (p.x < -50 || p.x > this.width + 50 || p.y < -50 || p.y > this.height + 50) continue;

      const isTarget = wpt.isTarget;

      // وميض النقطة المستهدفة النشطة
      if (isTarget) {
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const pulse = 14 + (Math.sin(Date.now() / 200) * 4);
        ctx.arc(p.x, p.y, pulse, 0, Math.PI * 2);
        ctx.stroke();
      }

      // رسم رمز النقطة الإرشادية (Maritime Diamond)
      const sz = isTarget ? 8 : 6;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - sz);
      ctx.lineTo(p.x + sz, p.y);
      ctx.lineTo(p.x, p.y + sz);
      ctx.lineTo(p.x - sz, p.y);
      ctx.closePath();

      ctx.fillStyle = isTarget ? '#f59e0b' : '#38bdf8';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // النقطة المركزية
      ctx.fillStyle = '#070b14';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fill();

      // اسم النقطة
      ctx.font = 'bold 11px Cairo, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = isTarget ? '#fef08a' : '#f8fafc';
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 4;
      ctx.fillText(wpt.name || 'WPT', p.x, p.y - sz - 4);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  /**
   * رسم خط التوجيه النشط ومسافة الانحراف XTE
   */
  _renderActiveSteering(ctx, vesselState) {
    if (!vesselState || vesselState.lat === null || vesselState.lon === null) return;
    if (!this.activeSteering) return;

    const s = this.activeSteering;
    if (s.targetWaypointLat === undefined || s.targetWaypointLon === undefined) return;

    const shipP = this.geoToPixel(vesselState.lat, vesselState.lon);
    const targetP = this.geoToPixel(s.targetWaypointLat, s.targetWaypointLon);

    ctx.save();
    // خط التوجيه المباشر نحو الهدف
    ctx.strokeStyle = '#10b981'; // أخضر نيون للتوجيه
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(shipP.x, shipP.y);
    ctx.lineTo(targetP.x, targetP.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // سهم التوجيه في منتصف الخط
    const midX = (shipP.x + targetP.x) / 2;
    const midY = (shipP.y + targetP.y) / 2;
    const angle = Math.atan2(targetP.y - shipP.y, targetP.x - shipP.x);
    ctx.save();
    ctx.translate(midX, midY);
    ctx.rotate(angle);
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-6, -5);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-6, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // مربع معلومات التوجيه اللحظية (BTW, DTW, XTE)
    const steerInfo = `إلى: ${s.targetWaypointName} | ${s.dtwNm} NM @ ${s.btwDeg}°T | XTE: ${s.xteNm} NM ${s.xteSteerDir}`;
    ctx.font = '11px JetBrains Mono';
    const infoW = ctx.measureText(steerInfo).width;
    ctx.fillStyle = 'rgba(6, 78, 59, 0.85)';
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(midX - (infoW / 2) - 8, midY + 12, infoW + 16, 20, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(steerInfo, midX, midY + 22);

    ctx.restore();
  }

  /**
   * رسم المسار قيد الإنشاء تفاعلياً بالفأرة
   */
  _renderTempRoute(ctx) {
    if (!this.tempRoutePoints || this.tempRoutePoints.length === 0) return;

    ctx.save();
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([4, 4]);

    ctx.beginPath();
    for (let i = 0; i < this.tempRoutePoints.length; i++) {
      const pt = this.tempRoutePoints[i];
      const p = this.geoToPixel(pt.lat, pt.lon);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }

    // خط وهمي إلى مؤشر الفأرة الحالي (Rubber Band)
    if (this.cursorGeo) {
      const curP = this.geoToPixel(this.cursorGeo.lat, this.cursorGeo.lon);
      ctx.lineTo(curP.x, curP.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // رسم نقاط المسار المؤقت
    for (let i = 0; i < this.tempRoutePoints.length; i++) {
      const pt = this.tempRoutePoints[i];
      const p = this.geoToPixel(pt.lat, pt.lon);

      ctx.fillStyle = '#eab308';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.font = '10px JetBrains Mono';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`P${i + 1}`, p.x + 8, p.y + 4);
    }

    ctx.restore();
  }

  /**
   * رسم مسطرة قياس الاتجاه والمسافة EBL / VRM
   */
  _renderEblVrm(ctx, vesselState) {
    const ebl = this.eblVrm;
    if (!ebl || !ebl.active) return;

    // نقطة المركز (Origin)
    let oLat = ebl.originLat;
    let oLon = ebl.originLon;
    if (ebl.attachToVessel && vesselState && vesselState.lat !== null && vesselState.lon !== null) {
      oLat = vesselState.lat;
      oLon = vesselState.lon;
    }
    if (oLat === null || oLon === null) return;

    // نقطة الهدف (Target)
    let tLat = ebl.targetLat;
    let tLon = ebl.targetLon;
    if (tLat === null || tLon === null) {
      if (this.cursorGeo) {
        tLat = this.cursorGeo.lat;
        tLon = this.cursorGeo.lon;
      } else {
        return;
      }
    }

    const oP = this.geoToPixel(oLat, oLon);
    const tP = this.geoToPixel(tLat, tLon);

    // حساب المسافة بالأميال وزاوية التوجيه
    const dx = tP.x - oP.x;
    const dy = tP.y - oP.y;
    const radiusPx = Math.sqrt(dx * dx + dy * dy);
    if (radiusPx < 2) return;

    // حساب المسافة الحقيقية بالأميال البحرية
    const dLat = (tLat - oLat) * 60;
    const dLon = (tLon - oLon) * 60 * Math.cos(((oLat + tLat) / 2) * Math.PI / 180);
    const rangeNm = Math.sqrt(dLat * dLat + dLon * dLon);

    // حساب الاتجاه الحقيقي والمغناطيسي
    let bearingTrue = (Math.atan2(dLon, dLat) * 180) / Math.PI;
    bearingTrue = ((bearingTrue % 360) + 360) % 360;

    const magVar = this.magneticVariation || 0;
    let bearingMag = bearingTrue - magVar;
    bearingMag = ((bearingMag % 360) + 360) % 360;

    ctx.save();

    // 1. رسم دائرة VRM (Variable Range Marker)
    ctx.strokeStyle = '#06b6d4'; // سماوي سيان
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(oP.x, oP.y, radiusPx, 0, Math.PI * 2);
    ctx.stroke();

    // 2. رسم خط EBL (Electronic Bearing Line)
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    ctx.moveTo(oP.x, oP.y);

    // تمديد الخط أبعد من نقطة الفأرة
    const extendFactor = Math.max(1.5, (this.width / Math.max(radiusPx, 1)));
    const extX = oP.x + dx * extendFactor;
    const extY = oP.y + dy * extendFactor;
    ctx.lineTo(extX, extY);
    ctx.stroke();
    ctx.setLineDash([]);

    // نقطة المركز ونقطة الهدف
    ctx.fillStyle = '#06b6d4';
    ctx.beginPath();
    ctx.arc(oP.x, oP.y, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(tP.x, tP.y, 4, 0, Math.PI * 2);
    ctx.fill();

    // 3. شريط قراءة EBL / VRM التكتيكي
    const readout = `EBL: ${bearingTrue.toFixed(1)}°T (${bearingMag.toFixed(1)}°M) | VRM: ${rangeNm.toFixed(2)} NM`;
    ctx.font = 'bold 11px JetBrains Mono';
    const rw = ctx.measureText(readout).width;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(tP.x + 10, tP.y - 12, rw + 16, 24, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(readout, tP.x + 18, tP.y);

    ctx.restore();
  }

  /**
   * تفاعل السحب والتقريب بالفأرة
   */
  _bindEvents() {
    let downTime = 0;
    let downX = 0, downY = 0;

    this.canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      downTime = Date.now();
      downX = e.clientX;
      downY = e.clientY;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
    });

    window.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const canvasX = e.clientX - rect.left;
      const canvasY = e.clientY - rect.top;

      if (canvasX >= 0 && canvasX <= this.width && canvasY >= 0 && canvasY <= this.height) {
        this.cursorGeo = this.pixelToGeo(canvasX, canvasY);
        if (typeof this.onCursorMove === 'function') {
          this.onCursorMove(this.cursorGeo);
        }
      }

      if (this.isDragging) {
        const dx = e.clientX - this.dragStartX;
        const dy = e.clientY - this.dragStartY;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;

        const scale = Math.pow(2, this.zoom) * 256;
        this.centerLon -= (dx / scale) * 360;
        this.centerLat += (dy / scale) * 180;
        if (typeof this.onRedrawNeeded === 'function') {
          this.onRedrawNeeded();
        }
        this._triggerBoundsUpdate();
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (this.isDragging) {
        this.isDragging = false;
        const distMoved = Math.hypot(e.clientX - downX, e.clientY - downY);
        const timeDiff = Date.now() - downTime;

        // نقرة واحدة (Click) إذا لم يحدث سحب فعلي
        if (distMoved < 6 && timeDiff < 450) {
          const rect = this.canvas.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          const clickY = e.clientY - rect.top;
          const geo = this.pixelToGeo(clickX, clickY);

          if (this.isRouteDrawingMode) {
            this.tempRoutePoints.push(geo);
          } else if (this.eblVrm && this.eblVrm.active) {
            this.eblVrm.targetLat = geo.lat;
            this.eblVrm.targetLon = geo.lon;
          }

          if (typeof this.onChartClick === 'function') {
            this.onChartClick(geo, { pixelX: clickX, pixelY: clickY });
          }
        }
        if (typeof this.onRedrawNeeded === 'function') {
          this.onRedrawNeeded();
        }
        this._triggerBoundsUpdate();
      }
    });

    // التقريب والتبعيد السلس بعجلة الفأرة نحو موقع المؤشر بدقة (Zoom to Cursor Position)
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // 1. الإحداثي الجغرافي الدقيق تحت مؤشر الفأرة قبل التكبير
      const geoBefore = this.pixelToGeo(mouseX, mouseY);

      // 2. حساب مستوى التكبير الجديد
      const zoomDelta = e.deltaY < 0 ? 0.35 : -0.35;
      const targetZoom = Math.max(3.0, Math.min(18.0, this.zoom + zoomDelta));
      if (Math.abs(targetZoom - this.zoom) < 0.001) return;

      this.zoom = targetZoom;

      // 3. تعديل مركز الخريطة ليبقى نفس الإحداثي تحت مؤشر الفأرة مباشرة
      const scale = Math.pow(2, this.zoom) * 256;
      this.centerLon = geoBefore.lon - ((mouseX - (this.width / 2)) * (2 * Math.PI) / scale) * (180 / Math.PI);

      const latRad = (geoBefore.lat * Math.PI) / 180;
      const yPoint = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
      const yCenter = yPoint + ((mouseY - (this.height / 2)) * (2 * Math.PI) / scale);
      const centerLatRad = 2 * (Math.atan(Math.exp(yCenter)) - Math.PI / 4);
      this.centerLat = (centerLatRad * 180) / Math.PI;

      // 4. إعادة رسم الخريطة فوراً بدون تأخير
      if (typeof this.onRedrawNeeded === 'function') {
        this.onRedrawNeeded();
      }
      this._triggerBoundsUpdate();
    }, { passive: false });

    window.addEventListener('resize', () => {
      this.resize();
      if (typeof this.onRedrawNeeded === 'function') {
        this.onRedrawNeeded();
      }
    });
  }

  zoomIn() {
    this.zoom = Math.min(18, this.zoom + 0.5);
    if (typeof this.onRedrawNeeded === 'function') {
      this.onRedrawNeeded();
    }
    this._triggerBoundsUpdate();
  }

  zoomOut() {
    this.zoom = Math.max(3, this.zoom - 0.5);
    if (typeof this.onRedrawNeeded === 'function') {
      this.onRedrawNeeded();
    }
    this._triggerBoundsUpdate();
  }

  centerOn(lat, lon) {
    this.centerLat = lat;
    this.centerLon = lon;
    if (typeof this.onRedrawNeeded === 'function') {
      this.onRedrawNeeded();
    }
    this._triggerBoundsUpdate();
  }

  focusChart(bounds) {
    if (!bounds || bounds.length < 4) return;
    const [minLon, minLat, maxLon, maxLat] = bounds;
    this.centerLon = (minLon + maxLon) / 2;
    this.centerLat = (minLat + maxLat) / 2;

    const span = Math.max(Math.abs(maxLon - minLon), Math.abs(maxLat - minLat));
    if (span < 0.1) this.zoom = 14;
    else if (span < 0.5) this.zoom = 12;
    else if (span < 2.0) this.zoom = 10;
    else if (span < 6.0) this.zoom = 8;
    else this.zoom = 6;
    if (typeof this.onRedrawNeeded === 'function') {
      this.onRedrawNeeded();
    }
    this._triggerBoundsUpdate();
  }

  // دوال تحميل وتعيين الطبقات الملاحية الحقيقية
  setActiveCharts(charts) {
    this.activeCharts = charts || [];
  }

  setCoastlines(list) {
    this.coastlines = Array.isArray(list) ? list : [];
  }

  setTideStations(stations) {
    this.tideStations = Array.isArray(stations) ? stations : [];
  }

  setRoutes(routes, activeRouteId, activeWaypointIndex) {
    this.routes = routes || [];
    this.activeRouteId = activeRouteId || null;
    this.activeWaypointIndex = activeWaypointIndex || 0;
  }

  setWaypoints(waypoints) {
    this.waypoints = waypoints || [];
  }

  setActiveSteering(steering) {
    this.activeSteering = steering;
  }

  setMagneticVariation(deg) {
    this.magneticVariation = deg || 0;
  }

  toggleEblVrm(active) {
    this.eblVrm.active = active;
    if (active) {
      this.eblVrm.targetLat = null;
      this.eblVrm.targetLon = null;
    }
  }

  setRouteDrawingMode(enabled) {
    this.isRouteDrawingMode = enabled;
    if (!enabled) {
      this.tempRoutePoints = [];
    }
  }

  addS57Chart(chartData) {
    if (!chartData) return;
    this.s57Charts.push(chartData);

    if (chartData.coastlines) this.coastlines.push(...chartData.coastlines);
    if (chartData.depthContours) this.depthContours.push(...chartData.depthContours);
    if (chartData.depthAreas) this.depthAreas.push(...chartData.depthAreas);
    if (chartData.navAids) this.navAids.push(...chartData.navAids);
    if (chartData.soundings) this.soundings.push(...chartData.soundings);
    if (chartData.hazards) this.hazards.push(...chartData.hazards);
  }

  setPlacesData(places) {
    if (places) {
      this.places = places;
    }
  }

  setDisplaySettings(opts) {
    if (!opts) return;
    if (opts.category !== undefined) this.displayCategory = opts.category;
    if (opts.detailFactor !== undefined) this.detailFactor = opts.detailFactor;
    if (opts.showCountryNames !== undefined) this.showCountryNames = opts.showCountryNames;
    if (opts.showCityNames !== undefined) this.showCityNames = opts.showCityNames;
    if (opts.showSeaNames !== undefined) this.showSeaNames = opts.showSeaNames;
    if (opts.showDepthContours !== undefined) this.showDepthContours = opts.showDepthContours;
    if (opts.showSoundings !== undefined) this.showSoundings = opts.showSoundings;
    if (opts.showNavAids !== undefined) this.showNavAids = opts.showNavAids;
    if (opts.showLightSectors !== undefined) this.showLightSectors = opts.showLightSectors;
    if (opts.showHazards !== undefined) this.showHazards = opts.showHazards;
    if (opts.showChartOutlines !== undefined) this.showChartOutlines = opts.showChartOutlines;
    if (opts.rasterOpacity !== undefined) this.rasterOpacity = opts.rasterOpacity;
  }

  /**
   * رسم أسماء البحار والمحيطات والخلجان والمضايق
   */
  _renderSeaNames(ctx) {
    if (!this.places || !this.places.seas) return;
    const effZoom = this.zoom + (this.detailFactor * 0.3);

    ctx.save();
    for (const sea of this.places.seas) {
      if (effZoom < sea.zoomMin || effZoom > sea.zoomMax) continue;
      const p = this.geoToPixel(sea.lat, sea.lon);
      if (p.x < -150 || p.x > this.width + 150 || p.y < -50 || p.y > this.height + 50) continue;

      ctx.font = 'italic 700 13px Cairo, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(56, 189, 248, 0.70)';
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 4;
      ctx.fillText(`${sea.nameAr}  |  ${sea.nameEn}`, p.x, p.y);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  /**
   * رسم أسماء الدول والأقاليم
   */
  _renderCountryNames(ctx) {
    if (!this.places || !this.places.countries) return;
    const effZoom = this.zoom + (this.detailFactor * 0.35);

    ctx.save();
    for (const c of this.places.countries) {
      if (effZoom < c.zoomMin || effZoom > c.zoomMax) continue;
      const p = this.geoToPixel(c.lat, c.lon);
      if (p.x < -120 || p.x > this.width + 120 || p.y < -40 || p.y > this.height + 40) continue;

      ctx.font = 'bold 12px Cairo, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#e2e8f0';
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 5;
      ctx.fillText(`${c.nameAr} (${c.nameEn.toUpperCase()})`, p.x, p.y);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  /**
   * رسم الموانئ والمدن البحرية
   */
  _renderCityNames(ctx) {
    if (!this.places || !this.places.cities) return;
    const effZoom = this.zoom + (this.detailFactor * 0.4);

    ctx.save();
    for (const city of this.places.cities) {
      if (effZoom < city.zoomMin) continue;
      const p = this.geoToPixel(city.lat, city.lon);
      if (p.x < -80 || p.x > this.width + 80 || p.y < -40 || p.y > this.height + 40) continue;

      const isPort = (city.type === 'port');

      // رمز الميناء أو المدينة
      ctx.beginPath();
      if (isPort) {
        ctx.fillStyle = '#38bdf8';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.rect(p.x - 3.5, p.y - 3.5, 7, 7);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillStyle = '#f59e0b';
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // اسم المدينة والميناء
      ctx.font = isPort ? 'bold 11px Cairo, sans-serif' : '10px Cairo, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isPort ? '#38bdf8' : '#cbd5e1';
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 4;
      ctx.fillText(`${city.nameAr} (${city.nameEn})`, p.x - 8, p.y);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }
}

window.MarineChartEngine = MarineChartEngine;

