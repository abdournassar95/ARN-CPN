/**
 * ARN Marine Navigator - GRIB Weather & Animated Wind Particles Layer
 * شركة ARN Technology - تطوير وبرمجة: عبده رجب نصار
 * محرك عرض الطقس البحري والرياح الحركية (100% Offline GRIB Weather Engine)
 */

class GribWeatherLayer {
  constructor(chartEngine, containerId) {
    this.chartEngine = chartEngine;
    this.container = document.querySelector(containerId || '.map-viewport');

    this.enabled = false;
    this.showIsobars = true;
    this.particleCount = 650;
    this.particles = [];
    this.animFrameId = null;

    // إنشاء كانفاس شفاف لطبقة الطقس فوق كانفاس الخريطة
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'weather-overlay-canvas';
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.zIndex = '50';
    this.canvas.style.display = 'none';

    if (this.container) {
      this.container.appendChild(this.canvas);
    }

    this.ctx = this.canvas.getContext('2d');
    this._resize();
    window.addEventListener('resize', () => this._resize());

    // مراكز الضغط الجوي (High / Low Pressure Centers) لمحاكاة الحقل الريحي الواقعي
    this.pressureCenters = [
      { lat: 32.0, lon: 30.0, type: 'H', val: 1022 }, // مرتفع جوي فوق المتوسط
      { lat: 22.0, lon: 38.0, type: 'L', val: 1008 }, // منخفض جوي استوائي / بحر أحمر
      { lat: 46.0, lon: 37.0, type: 'H', val: 1024 }, // مرتفع قاري بحر آزوف
      { lat: 15.0, lon: 116.0, type: 'L', val: 1004 } // منخفض بحر الصين الجنوبي
    ];
  }

  _resize() {
    if (!this.canvas || !this.container) return;
    this.width = this.container.clientWidth;
    this.height = this.container.clientHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this._initParticles();
  }

  _initParticles() {
    this.particles = [];
    for (let i = 0; i < this.particleCount; i++) {
      this.particles.push(this._createParticle());
    }
  }

  _createParticle() {
    const x = Math.random() * this.width;
    const y = Math.random() * this.height;
    const geo = this.chartEngine.pixelToGeo(x, y);

    return {
      x,
      y,
      lat: geo.lat,
      lon: geo.lon,
      age: Math.floor(Math.random() * 80),
      maxAge: 60 + Math.floor(Math.random() * 60),
      speed: 1.0 + Math.random() * 1.5
    };
  }

  /**
   * حساب متجه الرياح (u, v) وسرعتها بالعقدة والضغط الجوي عند أي إحداثي جغرافي
   */
  getWindAt(lat, lon) {
    // محاكاة ديناميكية السوائل الجوية (Coriolis Effect & Geostrophic Balance)
    let u = 0; // مركبة الشرق (East-West)
    let v = 0; // مركبة الشمال (North-South)
    let pressure = 1013.25;

    // رياح تجارية عامة (North-West Trade Winds)
    u += 8.0;
    v += -6.0;

    for (const pc of this.pressureCenters) {
      const dLat = lat - pc.lat;
      const dLon = (lon - pc.lon) * Math.cos((lat * Math.PI) / 180);
      const distDeg = Math.sqrt(dLat * dLat + dLon * dLon);
      const influence = Math.exp(-distDeg / 8.0);

      // تدرج الضغط والرياح الدورانية (قانون بويز بالوت: دوران عكس عقارب الساعة حول المنخفضات في نصف الكرة الشمالي)
      const gradP = (pc.val - 1013.25) * influence;
      pressure += gradP;

      const angle = Math.atan2(dLat, dLon);
      const circFactor = (pc.type === 'L' ? 1.0 : -1.0) * 16.0 * influence;

      // دوران حلزوني (Cyclostrophic flow)
      u += -Math.sin(angle) * circFactor;
      v += Math.cos(angle) * circFactor;
    }

    const speedKts = Math.sqrt(u * u + v * v);
    let directionDeg = (Math.atan2(-u, -v) * 180) / Math.PI;
    directionDeg = ((directionDeg % 360) + 360) % 360;

    return {
      u,
      v,
      speedKts: parseFloat(speedKts.toFixed(1)),
      directionDeg: Math.round(directionDeg),
      pressureHpa: Math.round(pressure)
    };
  }

  toggle(enabled) {
    this.enabled = (enabled !== undefined) ? enabled : !this.enabled;
    this.canvas.style.display = this.enabled ? 'block' : 'none';

    if (this.enabled) {
      this._resize();
      this._startLoop();
    } else {
      this._stopLoop();
      if (this.ctx) this.ctx.clearRect(0, 0, this.width, this.height);
    }
    return this.enabled;
  }

  _startLoop() {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    const loop = () => {
      if (!this.enabled) return;
      this._drawFrame();
      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  _stopLoop() {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  _drawFrame() {
    const ctx = this.ctx;
    if (!ctx) return;

    // مسح تدريجي خفيف لإنتاج أثر حركي (Motion Blur Trail)
    ctx.fillStyle = 'rgba(7, 11, 20, 0.25)';
    ctx.fillRect(0, 0, this.width, this.height);

    // 1. رسم خطوط الضغط المتساوي (Isobars) ومراكز الضغط
    if (this.showIsobars) {
      this._drawPressureCenters(ctx);
    }

    // 2. تحديث ورسم جزيئات الرياح الحركية (Animated Wind Streamlines)
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const wind = this.getWindAt(p.lat, p.lon);

      // تحديد لون الجزيء حسب سرعة الرياح بالعقدة البحرية
      let strokeColor = '#38bdf8'; // < 12 عقدة (نسيم خفيف - سماوي)
      if (wind.speedKts >= 30) strokeColor = '#ef4444';      // > 30 عقدة (عاصفة - أحمر نيون)
      else if (wind.speedKts >= 22) strokeColor = '#f59e0b'; // 22-30 عقدة (رياح قوية - كهرماني)
      else if (wind.speedKts >= 14) strokeColor = '#10b981'; // 14-22 عقدة (رياح معتدلة - أخضر)

      const oldX = p.x;
      const oldY = p.y;

      // نقل موقع الجزيء عبر شاشة مركاتور
      const stepFactor = 0.28 * p.speed;
      p.x += wind.u * stepFactor;
      p.y -= wind.v * stepFactor; // عكس اتجاه المحور Y في الكانفاس

      ctx.beginPath();
      ctx.moveTo(oldX, oldY);
      ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = wind.speedKts >= 20 ? 1.8 : 1.2;
      ctx.stroke();

      p.age++;
      const currentGeo = this.chartEngine.pixelToGeo(p.x, p.y);
      p.lat = currentGeo.lat;
      p.lon = currentGeo.lon;

      // إعادة تدوير الجزيء إذا انتهى عمره أو خرج خارج الشاشة
      if (p.age >= p.maxAge || p.x < 0 || p.x > this.width || p.y < 0 || p.y > this.height) {
        this.particles[i] = this._createParticle();
      }
    }

    // 3. رسم مفتاح سرعة الرياح (Wind Speed Legend)
    this._drawLegend(ctx);
  }

  _drawPressureCenters(ctx) {
    ctx.save();
    for (const pc of this.pressureCenters) {
      const p = this.chartEngine.geoToPixel(pc.lat, pc.lon);
      if (p.x < -100 || p.x > this.width + 100 || p.y < -100 || p.y > this.height + 100) continue;

      const isHigh = pc.type === 'H';
      const color = isHigh ? '#38bdf8' : '#ef4444';

      // دوائر ضغط متحدة المركز (Isobar Rings)
      for (let r = 25; r <= 80; r += 25) {
        ctx.strokeStyle = isHigh ? 'rgba(56, 189, 248, 0.15)' : 'rgba(239, 68, 68, 0.15)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // شارة مركز الضغط
      ctx.fillStyle = isHigh ? 'rgba(14, 165, 233, 0.85)' : 'rgba(220, 38, 38, 0.85)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px JetBrains Mono';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pc.type, p.x, p.y);

      // قيمة الضغط
      ctx.font = '10px JetBrains Mono';
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(`${pc.val} hPa`, p.x, p.y + 20);
    }
    ctx.restore();
  }

  _drawLegend(ctx) {
    ctx.save();
    const x = this.width - 240;
    const y = 80;
    const w = 220;
    const h = 42;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 6);
    ctx.fill();
    ctx.stroke();

    ctx.font = 'bold 10px Cairo';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'right';
    ctx.fillText('سرعة الرياح (عقدة بحرية - KTS):', x + w - 8, y + 14);

    // تدرج لوني
    const items = [
      { color: '#38bdf8', label: '< 14' },
      { color: '#10b981', label: '14-22' },
      { color: '#f59e0b', label: '22-30' },
      { color: '#ef4444', label: '> 30' }
    ];

    let bx = x + 12;
    for (const it of items) {
      ctx.fillStyle = it.color;
      ctx.fillRect(bx, y + 22, 10, 10);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '10px JetBrains Mono';
      ctx.textAlign = 'left';
      ctx.fillText(it.label, bx + 14, y + 31);
      bx += 48;
    }

    ctx.restore();
  }
}

window.GribWeatherLayer = GribWeatherLayer;
