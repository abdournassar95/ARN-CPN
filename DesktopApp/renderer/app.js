/**
 * ARN Marine Navigator - Main Renderer Controller
 * شركة ARN Technology - تطوير وبرمجة: عبده رجب نصار
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 1. تهيئة محرك الخرائط البحرية وعارض الطقس GRIB
  const chartEngine = new window.MarineChartEngine('marineCanvas');
  const weatherLayer = new window.GribWeatherLayer(chartEngine, '.map-viewport');

  // عناصر أزرار التكبير والتصغير التكتيكية (Zoom Controls) وعارض الطقس
  const btnZoomIn = document.getElementById('btnZoomIn');
  const btnZoomOut = document.getElementById('btnZoomOut');
  const btnNorthUp = document.getElementById('btnNorthUp');
  const zoomLevelBadge = document.getElementById('zoomLevelBadge');
  const btnToggleWeather = document.getElementById('btnToggleWeather');
  const weatherBtnText = document.getElementById('weatherBtnText');

  function updateZoomBadge() {
    if (zoomLevelBadge) {
      zoomLevelBadge.textContent = `${Math.round(chartEngine.zoom)}x`;
    }
  }

  // ربط إعادة الرسم اللحظي السلس عند السحب أو التكبير بعجلة الفأرة (Instant Redraw Callback)
  chartEngine.onRedrawNeeded = () => {
    chartEngine.render(currentVesselState, currentAisTargets);
    updateZoomBadge();
  };

  if (btnZoomIn) {
    btnZoomIn.addEventListener('click', () => {
      chartEngine.zoomIn();
      updateZoomBadge();
    });
  }

  if (btnZoomOut) {
    btnZoomOut.addEventListener('click', () => {
      chartEngine.zoomOut();
      updateZoomBadge();
    });
  }

  if (btnNorthUp) {
    btnNorthUp.addEventListener('click', () => {
      if (currentVesselState && currentVesselState.lat !== null) {
        chartEngine.centerOn(currentVesselState.lat, currentVesselState.lon);
      } else {
        chartEngine.centerOn(27.8340, 34.3210);
      }
      updateZoomBadge();
    });
  }

  if (btnToggleWeather) {
    btnToggleWeather.addEventListener('click', () => {
      const isActive = weatherLayer.toggle();
      if (isActive) {
        btnToggleWeather.classList.add('active');
        btnToggleWeather.style.borderColor = 'var(--accent-cyan)';
        weatherBtnText.textContent = 'الطقس [نشط]';
      } else {
        btnToggleWeather.classList.remove('active');
        btnToggleWeather.style.borderColor = 'var(--border-subtle)';
        weatherBtnText.textContent = 'الطقس (GRIB)';
      }
    });
  }

  updateZoomBadge();

  // عناصر شريط العدادات (Telemetry HUD)
  const elSOG = document.getElementById('valSOG');
  const elCOG = document.getElementById('valCOG');
  const elHDG = document.getElementById('valHDG');
  const elDepth = document.getElementById('valDepth');
  const elWind = document.getElementById('valWind');
  const elVar = document.getElementById('valVar');
  const elPOS = document.getElementById('valPOS');
  const compassSvg = document.getElementById('compassSvg');

  // عناصر الإنذار البحري والصوت (Web Audio API Synthesizer)
  const alarmBanner = document.getElementById('alarmBanner');
  const alarmTitle = document.getElementById('alarmTitle');
  const alarmDesc = document.getElementById('alarmDesc');
  const btnAckAlarm = document.getElementById('btnAckAlarm');
  const btnToggleSound = document.getElementById('btnToggleSound');
  const soundIcon = document.getElementById('soundIcon');
  let audioCtx = null;
  let isMuted = false;
  let ackAlarmUntil = 0;

  // عناصر تخطيط المسارات والنقاط الإرشادية والطيار الآلي
  const btnOpenRoutes = document.getElementById('btnOpenRoutes');
  const routesModal = document.getElementById('routesModal');
  const btnCloseRoutes = document.getElementById('btnCloseRoutes');
  const btnToggleAutopilot = document.getElementById('btnToggleAutopilot');
  const autopilotStatusText = document.getElementById('autopilotStatusText');
  let autopilotActive = false;

  const btnStartRouteDraw = document.getElementById('btnStartRouteDraw');
  const routeDrawingBar = document.getElementById('routeDrawingBar');
  const btnFinishRoute = document.getElementById('btnFinishRoute');
  const btnCancelRoute = document.getElementById('btnCancelRoute');

  const btnOpenNewWptForm = document.getElementById('btnOpenNewWptForm');
  const manualWptForm = document.getElementById('manualWptForm');
  const inputWptName = document.getElementById('inputWptName');
  const inputWptLat = document.getElementById('inputWptLat');
  const inputWptLon = document.getElementById('inputWptLon');
  const btnSaveManualWpt = document.getElementById('btnSaveManualWpt');
  const btnCancelManualWpt = document.getElementById('btnCancelManualWpt');

  const btnExportAllGpx = document.getElementById('btnExportAllGpx');
  const btnImportGpxFile = document.getElementById('btnImportGpxFile');
  const routesCountBadge = document.getElementById('routesCountBadge');
  const routesListContainer = document.getElementById('routesListContainer');
  const waypointsCountBadge = document.getElementById('waypointsCountBadge');
  const waypointsListContainer = document.getElementById('waypointsListContainer');

  // مسطرة قياس الاتجاه والمسافة EBL / VRM
  const btnToggleEblVrm = document.getElementById('btnToggleEblVrm');
  const eblVrmText = document.getElementById('eblVrmText');
  const cursorCoordsText = document.getElementById('cursorCoordsText');

  // عناصر لوحة التمركز والملاحة
  const vesselSourceBadge = document.getElementById('vesselSourceBadge');
  const vesselSourceText = document.getElementById('vesselSourceText');
  const vesselFixText = document.getElementById('vesselFixText');
  const vesselSatsText = document.getElementById('vesselSatsText');
  const btnCenterShip = document.getElementById('btnCenterShip');
  const btnQuickConnect = document.getElementById('btnQuickConnect');

  // أزرار السلامة
  const btnMOB = document.getElementById('btnMOB');
  const btnAnchor = document.getElementById('btnAnchor');

  // نافذة ربط الأجهزة (Connections Modal)
  const btnConnections = document.getElementById('btnConnections');
  const connectionsModal = document.getElementById('connectionsModal');
  const btnCloseConnections = document.getElementById('btnCloseConnections');
  const selectSerialPort = document.getElementById('selectSerialPort');
  const selectBaudRate = document.getElementById('selectBaudRate');
  const btnRefreshPorts = document.getElementById('btnRefreshPorts');
  const btnConnectSerial = document.getElementById('btnConnectSerial');
  const inputUdpPort = document.getElementById('inputUdpPort');
  const btnConnectUdp = document.getElementById('btnConnectUdp');
  const inputTcpHost = document.getElementById('inputTcpHost');
  const inputTcpPort = document.getElementById('inputTcpPort');
  const btnConnectTcp = document.getElementById('btnConnectTcp');
  const btnDisconnectAll = document.getElementById('btnDisconnectAll');
  const activeConnLabel = document.getElementById('activeConnLabel');
  const connStatusText = document.getElementById('connStatusText');
  const nmeaConsole = document.getElementById('nmeaConsole');
  const btnClearNmeaLog = document.getElementById('btnClearNmeaLog');

  // نافذة المد والجزر (XTide Modal)
  const btnOpenTides = document.getElementById('btnOpenTides');
  const tidesModal = document.getElementById('tidesModal');
  const btnCloseTides = document.getElementById('btnCloseTides');
  const selectTideStation = document.getElementById('selectTideStation');
  const tideHighVal = document.getElementById('tideHighVal');
  const tideLowVal = document.getElementById('tideLowVal');
  const tideGraphCanvas = document.getElementById('tideGraphCanvas');

  // نافذة مدير الخرائط المحلية
  const btnOpenCharts = document.getElementById('btnOpenCharts');
  const chartsModal = document.getElementById('chartsModal');
  const btnCloseCharts = document.getElementById('btnCloseCharts');
  const btnSelectChartFolder = document.getElementById('btnSelectChartFolder');
  const chartScanResults = document.getElementById('chartScanResults');

  // طبقات وخيارات العرض
  const chkChartOutlines = document.getElementById('chkChartOutlines');
  const chkRasterCharts = document.getElementById('chkRasterCharts');
  const chkDepthContours = document.getElementById('chkDepthContours');
  const chkNavAids = document.getElementById('chkNavAids');
  const chkSoundings = document.getElementById('chkSoundings');
  const chkTides = document.getElementById('chkTides');
  const sliderRasterOpacity = document.getElementById('sliderRasterOpacity');

  // نافذة وخيارات تفاصيل الخريطة الملاحية (Display Options Modal)
  const btnDisplayOptions = document.getElementById('btnDisplayOptions');
  const displayOptionsModal = document.getElementById('displayOptionsModal');
  const btnCloseDisplayOptions = document.getElementById('btnCloseDisplayOptions');
  const sliderDetailFactor = document.getElementById('sliderDetailFactor');
  const detailFactorBadge = document.getElementById('detailFactorBadge');
  const chkShowCountryNames = document.getElementById('chkShowCountryNames');
  const chkShowCityNames = document.getElementById('chkShowCityNames');
  const chkShowSeaNames = document.getElementById('chkShowSeaNames');
  const chkShowDepthContoursModal = document.getElementById('chkShowDepthContours');
  const chkShowSoundingsModal = document.getElementById('chkShowSoundings');
  const chkShowNavAidsModal = document.getElementById('chkShowNavAids');
  const chkShowLightSectors = document.getElementById('chkShowLightSectors');
  const chkShowHazards = document.getElementById('chkShowHazards');
  const chkShowChartOutlinesModal = document.getElementById('chkShowChartOutlines');
  const btnSaveDisplayDefaults = document.getElementById('btnSaveDisplayDefaults');
  const displayCatButtons = document.querySelectorAll('.display-cat-btn');

  // عناصر إعادة الاتصال ومسار الخرائط المحفوظ
  const chkAutoReconnect = document.getElementById('chkAutoReconnect');
  const lblSavedChartDir = document.getElementById('lblSavedChartDir');
  const btnReloadSavedCharts = document.getElementById('btnReloadSavedCharts');

  // نافذة حول البرنامج
  const btnAbout = document.getElementById('btnAbout');
  const aboutModal = document.getElementById('aboutModal');
  const btnCloseAbout = document.getElementById('btnCloseAbout');

  // جدول أهداف AIS
  const aisTableBody = document.getElementById('aisTableBody');
  const aisCountBadge = document.getElementById('aisCountBadge');

  let currentVesselState = null;
  let currentAisTargets = [];
  const nmeaLogLines = [];

  // =========================================================
  // 1b. تهيئة ونطق أصوات الإنذار البحري (Web Audio API Synthesizer)
  // =========================================================
  function initAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playTone(freq, durationMs, type = 'sine', gainVal = 0.2) {
    if (isMuted) return;
    try {
      initAudio();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(gainVal, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + (durationMs / 1000));
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + (durationMs / 1000));
    } catch (e) {}
  }

  function playCpaCollisionAlarm() {
    if (isMuted || Date.now() < ackAlarmUntil) return;
    playTone(880, 120, 'square', 0.15);
    setTimeout(() => playTone(1200, 150, 'square', 0.18), 130);
  }

  function playAnchorDriftAlarm() {
    if (isMuted || Date.now() < ackAlarmUntil) return;
    playTone(440, 250, 'sawtooth', 0.2);
  }

  function playMobEmergencyAlarm() {
    if (isMuted || Date.now() < ackAlarmUntil) return;
    playTone(950, 180, 'sine', 0.25);
    setTimeout(() => playTone(650, 220, 'sine', 0.25), 190);
  }

  function triggerAlarmBanner(title, desc, soundType) {
    if (Date.now() < ackAlarmUntil) return;
    alarmTitle.textContent = title;
    alarmDesc.textContent = desc;
    alarmBanner.style.display = 'flex';
    if (soundType === 'CPA') playCpaCollisionAlarm();
    else if (soundType === 'ANCHOR') playAnchorDriftAlarm();
    else if (soundType === 'MOB') playMobEmergencyAlarm();
  }

  if (btnToggleSound) {
    btnToggleSound.addEventListener('click', () => {
      isMuted = !isMuted;
      soundIcon.textContent = isMuted ? '🔇' : '🔊';
      btnToggleSound.style.borderColor = isMuted ? '#ef4444' : 'var(--accent-cyan)';
    });
  }

  if (btnAckAlarm) {
    btnAckAlarm.addEventListener('click', () => {
      ackAlarmUntil = Date.now() + 60000; // إسكات التنبيه لمدة 60 ثانية
      alarmBanner.style.display = 'none';
    });
  }

  // =========================================================
  // 2. تحديث التليمتري الحقيقي اللحظي (Real NMEA Telemetry)
  // =========================================================
  if (window.api && window.api.onTelemetry) {
    window.api.onTelemetry((data) => {
      const v = data.vessel;
      currentVesselState = v;

      // تحديث قيم العدادات العلوية
      if (v.lat !== null && v.lon !== null) {
        elSOG.textContent = (v.sog || 0).toFixed(1);
        elCOG.textContent = `${Math.round(v.cog || 0)}°`;
        elHDG.textContent = `${Math.round(v.heading || 0)}°`;
        elDepth.textContent = v.depth !== null ? v.depth.toFixed(1) : '--.-';
        elWind.textContent = v.windSpeed !== null ? `${v.windSpeed.toFixed(1)} Kts @ ${String(Math.round(v.windAngle || 0)).padStart(3, '0')}°` : '--.-';

        // تحديث قيمة الانحراف المغناطيسي WMM الحقيقي
        if (elVar) {
          elVar.textContent = v.magVariationStr || '--.-';
        }
        if (v.magVariation !== undefined) {
          chartEngine.setMagneticVariation(v.magVariation);
        }

        // تنسيق الإحداثيات الجغرافية البحرية
        const latDeg = Math.floor(Math.abs(v.lat));
        const latMin = ((Math.abs(v.lat) - latDeg) * 60).toFixed(2);
        const lonDeg = Math.floor(Math.abs(v.lon));
        const lonMin = ((Math.abs(v.lon) - lonDeg) * 60).toFixed(2);
        elPOS.textContent = `${latDeg}° ${latMin}' ${v.lat >= 0 ? 'N' : 'S'} , ${lonDeg}° ${lonMin}' ${v.lon >= 0 ? 'E' : 'W'}`;

        // تدوير وردة البوصلة
        if (compassSvg) {
          compassSvg.style.transform = `rotate(${-v.heading}deg)`;
          compassSvg.style.transition = 'transform 0.4s ease-out';
        }
      } else {
        elSOG.textContent = '--.-';
        elCOG.textContent = '---°';
        elHDG.textContent = '---°';
        elDepth.textContent = '--.-';
        elWind.textContent = '--.-';
        if (elVar) elVar.textContent = '--.-';
        elPOS.textContent = 'في انتظار إشارة GPS...';
      }

      // تمرير بيانات التوجيه النشطة (Steering, DTW, BTW, XTE) لمحرّك الخريطة
      if (data.steering) {
        chartEngine.setActiveSteering(data.steering);
      } else {
        chartEngine.setActiveSteering(null);
      }

      // تحديث لوحة حالة الملاحة والتمركز
      vesselSourceBadge.textContent = v.source !== 'None' ? v.source : 'غير متصل';
      vesselSourceText.textContent = v.connectionStatus || 'لا يوجد';
      vesselFixText.textContent = v.fixQuality || 'Awaiting NMEA';
      vesselSatsText.textContent = String(v.satellites || 0);

      // تحديث حالة زر المخطاف
      if (data.anchorStatus && data.anchorStatus.active) {
        btnAnchor.classList.add('active');
        btnAnchor.querySelector('span').textContent = `مخطاف (${data.anchorStatus.driftMeters}م)`;
      } else {
        btnAnchor.classList.remove('active');
        btnAnchor.querySelector('span').textContent = 'المخطاف';
      }

      // فحص أخطار التصادم CPA وانحراف المخطاف وطوارئ MOB
      const dangerousAis = (data.aisTargets || []).find(t => t.status === 'DANGER');
      if (dangerousAis) {
        triggerAlarmBanner(
          'إنذار تصادم وشيك (CPA Collision Danger)!',
          `سفينة ${dangerousAis.name} تقترب: مسافة CPA = ${dangerousAis.cpa} NM خلال ${dangerousAis.tcpa} دقيقة`,
          'CPA'
        );
      } else if (data.anchorStatus && data.anchorStatus.driftAlarm) {
        triggerAlarmBanner(
          'إنذار انحراف المخطاف (Anchor Drift Alarm)!',
          `انحرفت السفينة بمقدار ${data.anchorStatus.driftMeters}م خارج دائرة الأمان (${data.anchorStatus.radiusMeters}م)`,
          'ANCHOR'
        );
      } else if (v.mobActive) {
        triggerAlarmBanner(
          'طوارئ رجل في البحر (Man Overboard - M.O.B)!',
          'تم تفعيل استغاثة سقوط ملاح في البحر - اتجه فوراً لموقع الحادث',
          'MOB'
        );
      } else {
        if (Date.now() >= ackAlarmUntil) {
          alarmBanner.style.display = 'none';
        }
      }

      currentAisTargets = data.aisTargets || [];

      // تحديث جدول أهداف AIS
      updateAISTable(data.aisTargets);

      // إعادة رسم الخريطة البحرية
      chartEngine.render(v, data.aisTargets);
    });
  }

  // تحديث جدول أهداف الـ AIS الحقيقية
  function updateAISTable(targets) {
    if (!targets || targets.length === 0) {
      aisCountBadge.textContent = '0 أهداف';
      aisTableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 16px;">لا توجد أهداف AIS مكتشفة حالياً (في انتظار إشارات الراديو الحقيقية)</td></tr>';
      return;
    }

    aisCountBadge.textContent = `${targets.length} أهداف`;
    aisTableBody.innerHTML = '';
    targets.forEach(t => {
      const tr = document.createElement('tr');
      const badgeClass = t.status === 'DANGER' ? 'danger' : (t.status === 'WARNING' ? 'warning' : 'safe');
      const badgeText = t.status === 'DANGER' ? 'خطر داهم' : (t.status === 'WARNING' ? 'تحذير' : 'آمن');

      tr.innerHTML = `
        <td style="font-weight: 600; color: #fff;">${t.name}</td>
        <td>${t.distance !== undefined ? t.distance + ' nm' : '---'}</td>
        <td>${t.cpa !== undefined ? t.cpa + ' nm' : '---'}</td>
        <td>${t.tcpa !== undefined ? t.tcpa + ' m' : '---'}</td>
        <td><span class="ais-badge ${badgeClass}">${badgeText}</span></td>
      `;
      aisTableBody.appendChild(tr);
    });
  }

  // =========================================================
  // 3. إدارة الاتصال بأجهزة NMEA الحقيقية (Real Connections)
  // =========================================================
  async function refreshSerialPorts() {
    if (!window.api) return;
    selectSerialPort.innerHTML = '<option value="">جاري فحص المنافذ المتاحة...</option>';
    try {
      const ports = await window.api.listSerialPorts();
      selectSerialPort.innerHTML = '';
      if (!ports || ports.length === 0) {
        selectSerialPort.innerHTML = '<option value="">لم يتم العثور على منافذ COM / USB</option>';
        return;
      }
      ports.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.path;
        opt.textContent = `${p.path} ${p.manufacturer ? `(${p.manufacturer})` : ''}`;
        selectSerialPort.appendChild(opt);
      });
    } catch (e) {
      selectSerialPort.innerHTML = '<option value="">خطأ أثناء فحص المنافذ</option>';
    }
  }

  btnConnections.addEventListener('click', () => {
    connectionsModal.classList.add('open');
    refreshSerialPorts();
  });
  btnQuickConnect.addEventListener('click', () => {
    connectionsModal.classList.add('open');
    refreshSerialPorts();
  });
  btnCloseConnections.addEventListener('click', () => connectionsModal.classList.remove('open'));
  btnRefreshPorts.addEventListener('click', refreshSerialPorts);

  // اتصال Serial
  btnConnectSerial.addEventListener('click', async () => {
    const port = selectSerialPort.value;
    const baudRate = parseInt(selectBaudRate.value, 10);
    if (!port) {
      alert('يرجى اختيار منفذ Serial صالح.');
      return;
    }

    try {
      const res = await window.api.connectSerial(port, baudRate);
      if (res && res.success) {
        activeConnLabel.textContent = `متصل: ${port} @ ${baudRate} bps`;
        connStatusText.textContent = `متصل (${port})`;
        btnConnections.style.borderColor = 'var(--accent-green)';
        if (window.api && window.api.saveLastConnection) {
          window.api.saveLastConnection('serial', { port, baudRate }, chkAutoReconnect ? chkAutoReconnect.checked : true);
        }
      }
    } catch (err) {
      alert(`فشل الاتصال بالمنفذ: ${err.message}`);
    }
  });

  // اتصال UDP
  btnConnectUdp.addEventListener('click', async () => {
    const port = parseInt(inputUdpPort.value, 10) || 10110;
    try {
      const res = await window.api.connectUDP(port);
      if (res && res.success) {
        activeConnLabel.textContent = `استماع UDP على منفذ ${port}`;
        connStatusText.textContent = `UDP ${port}`;
        btnConnections.style.borderColor = 'var(--accent-cyan)';
        if (window.api && window.api.saveLastConnection) {
          window.api.saveLastConnection('udp', { port }, chkAutoReconnect ? chkAutoReconnect.checked : true);
        }
      }
    } catch (err) {
      alert(`فشل بدء استماع UDP: ${err.message}`);
    }
  });

  // اتصال TCP (Wi-Fi)
  btnConnectTcp.addEventListener('click', async () => {
    const host = inputTcpHost.value.trim() || '192.168.1.1';
    const port = parseInt(inputTcpPort.value, 10) || 10110;
    try {
      const res = await window.api.connectTCP(host, port);
      if (res && res.success) {
        activeConnLabel.textContent = `متصل TCP: ${host}:${port}`;
        connStatusText.textContent = `TCP ${host}`;
        btnConnections.style.borderColor = '#f59e0b';
        if (window.api && window.api.saveLastConnection) {
          window.api.saveLastConnection('tcp', { host, port }, chkAutoReconnect ? chkAutoReconnect.checked : true);
        }
      }
    } catch (err) {
      alert(`فشل اتصال TCP: ${err.message}`);
    }
  });

  // قطع الاتصال
  btnDisconnectAll.addEventListener('click', async () => {
    await window.api.disconnectNMEA();
    activeConnLabel.textContent = 'غير متصل';
    connStatusText.textContent = 'ربط الأجهزة';
    btnConnections.style.borderColor = 'var(--border-subtle)';
  });

  // استقبال جمل NMEA اللحظية وعرضها في الكونسول
  if (window.api && window.api.onRawNmea) {
    window.api.onRawNmea((sentence) => {
      nmeaLogLines.push(sentence);
      if (nmeaLogLines.length > 150) nmeaLogLines.shift();
      nmeaConsole.textContent = nmeaLogLines.join('\n');
      nmeaConsole.scrollTop = nmeaConsole.scrollHeight;
    });
  }

  btnClearNmeaLog.addEventListener('click', () => {
    nmeaLogLines.length = 0;
    nmeaConsole.textContent = 'تم مسح السجل.';
  });

  // =========================================================
  // 4. تحميل خطوط السواحل الحقيقية وتحديث المشهد ديناميكياً
  // =========================================================
  async function loadCoastlinesForBounds(bounds) {
    if (!window.api || !window.api.getGshhsCoastlines) return;
    try {
      const coastlines = await window.api.getGshhsCoastlines(bounds);
      if (coastlines && coastlines.length > 0) {
        chartEngine.setCoastlines(coastlines);
      }
    } catch (err) {
      console.warn('Failed to load GSHHS coastlines for bounds:', err);
    }
  }

  async function loadTideStationsForBounds(bounds) {
    if (!window.api || !window.api.getTidesInBounds) return;
    try {
      const stations = await window.api.getTidesInBounds(bounds);
      chartEngine.setTideStations(stations || []);
      populateTideStationsDropdown(stations || []);
    } catch (err) {}
  }

  // عند تحريك أو تكبير الخريطة، استعلام خطوط السواحل والمحطات الحقيقية
  chartEngine.onBoundsChange = (bounds) => {
    loadCoastlinesForBounds(bounds);
    loadTideStationsForBounds(bounds);
  };

  // التحميل المبدئي لخطوط السواحل
  loadCoastlinesForBounds(chartEngine.getViewBounds());
  loadTideStationsForBounds(chartEngine.getViewBounds());

  // =========================================================
  // 5. توقعات المد والجزر XTide ورسم المنحنى
  // =========================================================
  btnOpenTides.addEventListener('click', () => tidesModal.classList.add('open'));
  btnCloseTides.addEventListener('click', () => tidesModal.classList.remove('open'));

  function populateTideStationsDropdown(stations) {
    selectTideStation.innerHTML = '';
    if (!stations || stations.length === 0) {
      selectTideStation.innerHTML = '<option value="">لا توجد محطات مد في النطاق الحالي</option>';
      return;
    }
    stations.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.name;
      opt.textContent = `[${s.type === 'Tide' ? 'مد' : 'تيار'}] ${s.name} (${s.tz})`;
      selectTideStation.appendChild(opt);
    });

    if (stations.length > 0) {
      updateTidePrediction(stations[0].name);
    }
  }

  selectTideStation.addEventListener('change', (e) => {
    if (e.target.value) updateTidePrediction(e.target.value);
  });

  async function updateTidePrediction(stationName) {
    if (!window.api || !window.api.predictTide) return;
    try {
      const pred = await window.api.predictTide({ stationName });
      if (!pred) return;

      // تحديث بطاقات القمة والقاع
      if (pred.highTides && pred.highTides.length > 0) {
        tideHighVal.textContent = `${pred.highTides[0].height} m (${pred.highTides[0].time})`;
      } else {
        tideHighVal.textContent = '--.- m';
      }

      if (pred.lowTides && pred.lowTides.length > 0) {
        tideLowVal.textContent = `${pred.lowTides[0].height} m (${pred.lowTides[0].time})`;
      } else {
        tideLowVal.textContent = '--.- m';
      }

      // رسم المنحنى على الكانفاس
      drawTideCurve(pred.curve);
    } catch (err) {}
  }

  function drawTideCurve(points) {
    if (!tideGraphCanvas || !points || points.length === 0) return;
    const ctx = tideGraphCanvas.getContext('2d');
    const w = tideGraphCanvas.width;
    const h = tideGraphCanvas.height;

    ctx.clearRect(0, 0, w, h);

    // إيجاد القيم الدنيا والعليا
    let minH = Infinity, maxH = -Infinity;
    for (const p of points) {
      if (p.height < minH) minH = p.height;
      if (p.height > maxH) maxH = p.height;
    }
    const range = (maxH - minH) || 1;

    // خط الأساس (Mean Sea Level)
    const midY = h / 2;
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(w, midY);
    ctx.stroke();
    ctx.setLineDash([]);

    // رسم المنحنى التوافقي
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      const x = (i / (points.length - 1)) * w;
      const normalizedH = (points[i].height - minH) / range;
      const y = h - 20 - (normalizedH * (h - 40));

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // تظليل تحت المنحنى
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = 'rgba(56, 189, 248, 0.08)';
    ctx.fill();
  }

  // =========================================================
  // 6. نافذة فحص وإدارة الخرائط البحرية المحلية (Phase 2 & 3)
  // =========================================================
  btnOpenCharts.addEventListener('click', () => chartsModal.classList.add('open'));
  btnCloseCharts.addEventListener('click', () => chartsModal.classList.remove('open'));

  // ربط خيارات طبقات العرض
  if (chkChartOutlines) {
    chkChartOutlines.addEventListener('change', (e) => chartEngine.showChartOutlines = e.target.checked);
  }
  if (chkRasterCharts) {
    chkRasterCharts.addEventListener('change', (e) => chartEngine.showRasterCharts = e.target.checked);
  }
  if (chkDepthContours) {
    chkDepthContours.addEventListener('change', (e) => chartEngine.showDepthContours = e.target.checked);
  }
  if (chkNavAids) {
    chkNavAids.addEventListener('change', (e) => chartEngine.showNavAids = e.target.checked);
  }
  if (chkSoundings) {
    chkSoundings.addEventListener('change', (e) => chartEngine.showSoundings = e.target.checked);
  }
  if (chkTides) {
    chkTides.addEventListener('change', (e) => chartEngine.showTides = e.target.checked);
  }
  if (sliderRasterOpacity) {
    sliderRasterOpacity.addEventListener('input', (e) => chartEngine.rasterOpacity = parseFloat(e.target.value));
  }

  function renderChartsTable(data) {
    if (!data || !data.charts || data.charts.length === 0) {
      chartScanResults.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 20px;">لم يتم العثور على خرائط ملاحية في المجلد المحدد.</div>';
      return;
    }

    let html = `
      <div style="margin-bottom: 10px; color: var(--accent-green); font-weight: 700;">
        تم العثور على ${data.summary.totalCharts} خريطة ملاحية (S-57: ${data.summary.s57Count} | BSB: ${data.summary.bsbCount} | MBTiles: ${data.summary.mbtilesCount} | CM93: ${data.summary.cm93Count})
      </div>
      <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
        <thead>
          <tr style="color: var(--text-muted); border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right;">
            <th style="padding: 4px;">الاسم</th>
            <th style="padding: 4px;">النوع</th>
            <th style="padding: 4px;">المقياس</th>
            <th style="padding: 4px;">إجراء</th>
          </tr>
        </thead>
        <tbody>
    `;

    data.charts.forEach((c, index) => {
      html += `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); cursor: pointer;" class="chart-row" data-index="${index}">
          <td style="padding: 5px; color: #fff; font-weight: 600;">${c.name}</td>
          <td style="padding: 5px; color: var(--accent-cyan); font-weight: 700;">${c.type}</td>
          <td style="padding: 5px; color: var(--text-secondary);">${c.scale || 'N/A'}</td>
          <td style="padding: 5px;">
            <button class="hud-btn btn-focus-chart" data-index="${index}" style="padding: 2px 8px; font-size: 10px;">تحميل وعرض</button>
          </td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    chartScanResults.innerHTML = html;

    // ربط نقر الخريطة لتحميلها وعرضها
    chartScanResults.querySelectorAll('.btn-focus-chart').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index, 10);
        const chart = data.charts[idx];
        await openAndFocusChart(chart);
      });
    });

    chartScanResults.querySelectorAll('.chart-row').forEach(tr => {
      tr.addEventListener('click', async () => {
        const idx = parseInt(tr.dataset.index, 10);
        const chart = data.charts[idx];
        await openAndFocusChart(chart);
      });
    });
  }

  async function openAndFocusChart(chart) {
    if (!chart) return;

    let targetBounds = chart.bounds;

    // 1. إذا كانت خريطة متجهات S-57
    if (chart.type === 'S-57' && window.api && window.api.openS57Chart) {
      const res = await window.api.openS57Chart(chart.path);
      if (res && res.success && res.chart) {
        chartEngine.addS57Chart(res.chart);
        if (res.chart.bounds && res.chart.bounds[0] !== 0) {
          targetBounds = res.chart.bounds;
        }
      }
    }
    // 2. إذا كانت خريطة نقطية BSB أو KAP
    else if ((chart.type === 'BSB' || chart.type === 'KAP') && window.api && window.api.openBsbChart) {
      const res = await window.api.openBsbChart(chart.path);
      if (res && res.success && res.metadata) {
        chart.bounds = res.metadata.bounds || chart.bounds;
        chart.neatline = res.metadata.neatline || chart.neatline;
        targetBounds = chart.bounds;
      }
    }
    // 3. إذا كانت MBTiles
    else if (chart.type === 'MBTiles' && window.api && window.api.openMbtiles) {
      const res = await window.api.openMbtiles(chart.path);
      if (res && res.success && res.metadata && res.metadata.bounds) {
        chart.bounds = res.metadata.bounds;
        targetBounds = chart.bounds;
      }
    }
    // 4. إذا كانت قاعدة بيانات العالم CM93
    else if (chart.type === 'CM93') {
      targetBounds = chart.bounds || [-180, -85, 180, 85];
      if (currentVesselState && currentVesselState.lat !== null) {
        chartEngine.centerOn(currentVesselState.lat, currentVesselState.lon);
      } else {
        // مركز استراتيجي على قناة السويس والبحر الأحمر / الخليج العربي
        chartEngine.centerOn(27.8340, 34.3210);
      }
    }

    if (targetBounds && targetBounds.length >= 4 && chart.type !== 'CM93') {
      chartEngine.focusChart(targetBounds);
    }
    chartsModal.classList.remove('open');
    chartEngine.render(currentVesselState, currentAisTargets);
  }

  btnSelectChartFolder.addEventListener('click', async () => {
    if (!window.api) return;
    chartScanResults.innerHTML = '<div style="color: #38bdf8; text-align: center; padding: 20px;">جاري فحص المجلد والبحث عن الخرائط البحرية...</div>';

    const folderPath = await window.api.selectChartFolder();
    if (!folderPath) {
      chartScanResults.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 20px;">تم إلغاء اختيار المجلد.</div>';
      return;
    }

    // حفظ المسار فوراً في إعدادات وقاعدة بيانات التطبيق
    if (lblSavedChartDir) {
      lblSavedChartDir.textContent = folderPath;
    }
    if (window.api.saveChartDirectory) {
      await window.api.saveChartDirectory(folderPath);
    }

    const res = await window.api.scanCharts(folderPath);
    if (!res.success) {
      chartScanResults.innerHTML = `<div style="color: #ef4444; padding: 10px;">حدث خطأ أثناء الفحص: ${res.error}</div>`;
      return;
    }

    chartEngine.setActiveCharts(res.data.charts);
    renderChartsTable(res.data);

    // إذا كانت قاعدة CM93 العالمية أو مجموعة خرائط، نفتح ونفعل كامل الخرائط فوراً بدون حصر في منطقة واحدة
    const cm93Chart = res.data.charts.find(c => c.type === 'CM93');
    if (cm93Chart) {
      await openAndFocusChart(cm93Chart);
    } else {
      const firstValid = res.data.charts.find(c => c.bounds && c.bounds.length >= 4 && (c.bounds[0] !== -180 || c.bounds[2] !== 180));
      if (firstValid) {
        await openAndFocusChart(firstValid);
      }
    }
  });

  if (btnReloadSavedCharts) {
    btnReloadSavedCharts.addEventListener('click', async () => {
      const savedDir = lblSavedChartDir ? lblSavedChartDir.textContent.trim() : '';
      if (!savedDir || savedDir.includes('لم يتم')) {
        alert('يرجى اختيار مجلد خرائط أولاً لحفظه.');
        return;
      }
      chartScanResults.innerHTML = '<div style="color: #38bdf8; text-align: center; padding: 20px;">جاري فحص المجلد المحفوظ...</div>';
      const res = await window.api.scanCharts(savedDir);
      if (res && res.success) {
        chartEngine.setActiveCharts(res.data.charts);
        renderChartsTable(res.data);
        const cm93 = res.data.charts.find(c => c.type === 'CM93');
        if (cm93) await openAndFocusChart(cm93);
      } else {
        chartScanResults.innerHTML = `<div style="color: #ef4444; padding: 10px;">فشل فحص المجلد: ${res ? res.error : ''}</div>`;
      }
    });
  }

  // =========================================================
  // 6b. التحكم في مستويات تفاصيل الخريطة الملاحية (Display Options & Layers)
  // =========================================================
  if (btnDisplayOptions) {
    btnDisplayOptions.addEventListener('click', () => {
      if (displayOptionsModal) displayOptionsModal.classList.add('open');
    });
  }
  if (btnCloseDisplayOptions) {
    btnCloseDisplayOptions.addEventListener('click', () => {
      if (displayOptionsModal) displayOptionsModal.classList.remove('open');
    });
  }

  function getDisplaySettingsFromUI() {
    const activeCatBtn = document.querySelector('.display-cat-btn.active');
    return {
      category: activeCatBtn ? activeCatBtn.dataset.cat : 'standard',
      detailFactor: sliderDetailFactor ? parseInt(sliderDetailFactor.value, 10) : 0,
      showCountryNames: chkShowCountryNames ? chkShowCountryNames.checked : true,
      showCityNames: chkShowCityNames ? chkShowCityNames.checked : true,
      showSeaNames: chkShowSeaNames ? chkShowSeaNames.checked : true,
      showDepthContours: chkShowDepthContoursModal ? chkShowDepthContoursModal.checked : true,
      showSoundings: chkShowSoundingsModal ? chkShowSoundingsModal.checked : true,
      showNavAids: chkShowNavAidsModal ? chkShowNavAidsModal.checked : true,
      showLightSectors: chkShowLightSectors ? chkShowLightSectors.checked : true,
      showHazards: chkShowHazards ? chkShowHazards.checked : true,
      showChartOutlines: chkShowChartOutlinesModal ? chkShowChartOutlinesModal.checked : false
    };
  }

  function applyDisplaySettingsToUI(s) {
    if (!s) return;
    if (sliderDetailFactor && s.detailFactor !== undefined) {
      sliderDetailFactor.value = s.detailFactor;
      if (detailFactorBadge) {
        detailFactorBadge.textContent = (s.detailFactor > 0 ? '+' : '') + s.detailFactor;
      }
    }
    if (chkShowCountryNames && s.showCountryNames !== undefined) chkShowCountryNames.checked = s.showCountryNames;
    if (chkShowCityNames && s.showCityNames !== undefined) chkShowCityNames.checked = s.showCityNames;
    if (chkShowSeaNames && s.showSeaNames !== undefined) chkShowSeaNames.checked = s.showSeaNames;
    if (chkShowDepthContoursModal && s.showDepthContours !== undefined) chkShowDepthContoursModal.checked = s.showDepthContours;
    if (chkShowSoundingsModal && s.showSoundings !== undefined) chkShowSoundingsModal.checked = s.showSoundings;
    if (chkShowNavAidsModal && s.showNavAids !== undefined) chkShowNavAidsModal.checked = s.showNavAids;
    if (chkShowLightSectors && s.showLightSectors !== undefined) chkShowLightSectors.checked = s.showLightSectors;
    if (chkShowHazards && s.showHazards !== undefined) chkShowHazards.checked = s.showHazards;
    if (chkShowChartOutlinesModal && s.showChartOutlines !== undefined) chkShowChartOutlinesModal.checked = s.showChartOutlines;

    if (s.category) {
      displayCatButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.cat === s.category);
      });
    }

    chartEngine.setDisplaySettings(s);
    chartEngine.render(currentVesselState, currentAisTargets);
  }

  // مستويات العرض القياسية IHO S-52
  displayCatButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      displayCatButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const cat = btn.dataset.cat;
      if (cat === 'base') {
        if (chkShowCountryNames) chkShowCountryNames.checked = true;
        if (chkShowCityNames) chkShowCityNames.checked = false;
        if (chkShowSeaNames) chkShowSeaNames.checked = true;
        if (chkShowDepthContoursModal) chkShowDepthContoursModal.checked = false;
        if (chkShowSoundingsModal) chkShowSoundingsModal.checked = false;
        if (chkShowNavAidsModal) chkShowNavAidsModal.checked = false;
        if (chkShowLightSectors) chkShowLightSectors.checked = false;
        if (chkShowHazards) chkShowHazards.checked = false;
      } else if (cat === 'standard') {
        if (chkShowCountryNames) chkShowCountryNames.checked = true;
        if (chkShowCityNames) chkShowCityNames.checked = true;
        if (chkShowSeaNames) chkShowSeaNames.checked = true;
        if (chkShowDepthContoursModal) chkShowDepthContoursModal.checked = true;
        if (chkShowSoundingsModal) chkShowSoundingsModal.checked = true;
        if (chkShowNavAidsModal) chkShowNavAidsModal.checked = true;
        if (chkShowLightSectors) chkShowLightSectors.checked = false;
        if (chkShowHazards) chkShowHazards.checked = true;
      } else if (cat === 'all') {
        if (chkShowCountryNames) chkShowCountryNames.checked = true;
        if (chkShowCityNames) chkShowCityNames.checked = true;
        if (chkShowSeaNames) chkShowSeaNames.checked = true;
        if (chkShowDepthContoursModal) chkShowDepthContoursModal.checked = true;
        if (chkShowSoundingsModal) chkShowSoundingsModal.checked = true;
        if (chkShowNavAidsModal) chkShowNavAidsModal.checked = true;
        if (chkShowLightSectors) chkShowLightSectors.checked = true;
        if (chkShowHazards) chkShowHazards.checked = true;
      }
      chartEngine.setDisplaySettings(getDisplaySettingsFromUI());
      chartEngine.render(currentVesselState, currentAisTargets);
    });
  });

  // منزلق كثافة وتفاصيل الخريطة CM93 Detail Slider (-5 to +5)
  if (sliderDetailFactor) {
    sliderDetailFactor.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      if (detailFactorBadge) detailFactorBadge.textContent = (val > 0 ? '+' : '') + val;
      chartEngine.setDisplaySettings(getDisplaySettingsFromUI());
      chartEngine.render(currentVesselState, currentAisTargets);
    });
  }

  // مربعات التحديد للطبقات
  [
    chkShowCountryNames,
    chkShowCityNames,
    chkShowSeaNames,
    chkShowDepthContoursModal,
    chkShowSoundingsModal,
    chkShowNavAidsModal,
    chkShowLightSectors,
    chkShowHazards,
    chkShowChartOutlinesModal
  ].forEach(chk => {
    if (chk) {
      chk.addEventListener('change', () => {
        chartEngine.setDisplaySettings(getDisplaySettingsFromUI());
        chartEngine.render(currentVesselState, currentAisTargets);
      });
    }
  });

  // حفظ تفضيلات العرض في الإعدادات الدائمة
  if (btnSaveDisplayDefaults) {
    btnSaveDisplayDefaults.addEventListener('click', async () => {
      const settings = getDisplaySettingsFromUI();
      if (window.api && window.api.saveVectorDisplay) {
        await window.api.saveVectorDisplay(settings);
      }
      btnSaveDisplayDefaults.textContent = 'تم الحفظ بنجاح ✓';
      btnSaveDisplayDefaults.style.background = 'rgba(16, 185, 129, 0.4)';
      setTimeout(() => {
        btnSaveDisplayDefaults.textContent = 'حفظ كإعداد افتراضي دائم';
        btnSaveDisplayDefaults.style.background = 'rgba(16, 185, 129, 0.2)';
      }, 2000);
    });
  }

  // =========================================================
  // 6c. التهيئة التلقائية: تحميل أسماء الأماكن والإعدادات المحفوظة
  // =========================================================
  async function initSavedSettingsAndPlaces() {
    if (!window.api) return;

    // 1. تحميل أسماء الدول والبحار والموانئ والمدن
    try {
      if (window.api.getWorldPlaces) {
        const places = await window.api.getWorldPlaces();
        if (places) {
          chartEngine.setPlacesData(places);
        }
      }
    } catch (err) {
      console.warn('Could not load world places data:', err);
    }

    // 2. تحميل الإعدادات المحفوظة (الاتصال، مسار الخرائط، طبقات العرض)
    try {
      if (window.api.getSettings) {
        const settings = await window.api.getSettings();
        if (settings) {
          // استعادة بيانات الاتصال
          if (settings.lastConnection) {
            const lc = settings.lastConnection;
            if (lc.tcp && inputTcpHost && inputTcpPort) {
              if (lc.tcp.host) inputTcpHost.value = lc.tcp.host;
              if (lc.tcp.port) inputTcpPort.value = lc.tcp.port;
            }
            if (lc.udp && inputUdpPort && lc.udp.port) {
              inputUdpPort.value = lc.udp.port;
            }
            if (lc.serial && selectBaudRate && lc.serial.baudRate) {
              selectBaudRate.value = String(lc.serial.baudRate);
            }
            if (chkAutoReconnect) {
              chkAutoReconnect.checked = (lc.autoConnect !== false);
            }
            if (lc.autoConnect && lc.type) {
              activeConnLabel.textContent = `جاري استعادة الاتصال التلقائي (${lc.type.toUpperCase()})...`;
            }
          }

          // مسار الخرائط المحفوظ
          if (settings.chartDirectory && lblSavedChartDir) {
            lblSavedChartDir.textContent = settings.chartDirectory;
          }

          // طبقات العرض ومستوى التفاصيل
          if (settings.vectorDisplay) {
            applyDisplaySettingsToUI(settings.vectorDisplay);
          }
        }
      }
    } catch (err) {
      console.warn('Failed to load settings:', err);
    }

    // 3. الاستماع لتحميل الخرائط التلقائي من مسار البداية
    if (window.api.onChartsAutoLoaded) {
      window.api.onChartsAutoLoaded(async (data) => {
        chartEngine.setActiveCharts(data.charts);
        renderChartsTable(data);
        if (lblSavedChartDir) {
          lblSavedChartDir.textContent = data.dir || data.rootPath;
        }
        const cm93 = data.charts.find(c => c.type === 'CM93');
        if (cm93) {
          await openAndFocusChart(cm93);
        }
      });
    }

    // 4. استرجاع الخرائط المحملة في الذاكرة المخبأة مسبقاً إن وجدت
    if (window.api.getLoadedCharts) {
      try {
        const cached = await window.api.getLoadedCharts();
        if (cached && cached.length > 0) {
          chartEngine.setActiveCharts(cached);
          renderChartsTable({
            charts: cached,
            summary: {
              totalCharts: cached.length,
              cm93Count: cached.filter(c => c.type === 'CM93').length,
              s57Count: 0,
              bsbCount: 0,
              mbtilesCount: 0
            }
          });
          const cm93 = cached.find(c => c.type === 'CM93');
          if (cm93) {
            await openAndFocusChart(cm93);
          }
        }
      } catch (e) {}
    }

    chartEngine.render(currentVesselState, currentAisTargets);
  }

  // استدعاء التهيئة التلقائية
  initSavedSettingsAndPlaces();

  // =========================================================
  // 7. أزرار السلامة والطوارئ (MOB & Anchor Watch)
  // =========================================================
  btnCenterShip.addEventListener('click', () => {
    if (currentVesselState && currentVesselState.lat !== null) {
      chartEngine.centerOn(currentVesselState.lat, currentVesselState.lon);
    } else {
      alert('لا توجد إشارة GPS نشطة حالياً للتمركز عليها.');
    }
  });

  btnMOB.addEventListener('click', async () => {
    if (!window.api) return;
    if (btnMOB.classList.contains('active')) {
      await window.api.clearMOB();
      btnMOB.classList.remove('active');
    } else {
      await window.api.triggerMOB();
      btnMOB.classList.add('active');
    }
  });

  btnAnchor.addEventListener('click', async () => {
    if (!window.api) return;
    const isActive = btnAnchor.classList.contains('active');
    await window.api.toggleAnchorWatch(!isActive, 50);
  });

  // =========================================================
  // 7b. مسطرة قياس الاتجاه والمسافة البحرية (EBL / VRM)
  // =========================================================
  let eblVrmActive = false;
  if (btnToggleEblVrm) {
    btnToggleEblVrm.addEventListener('click', () => {
      eblVrmActive = !eblVrmActive;
      chartEngine.toggleEblVrm(eblVrmActive);
      if (eblVrmActive) {
        btnToggleEblVrm.classList.add('active');
        btnToggleEblVrm.style.borderColor = 'var(--accent-cyan)';
        eblVrmText.textContent = 'EBL/VRM [نشط]';
      } else {
        btnToggleEblVrm.classList.remove('active');
        btnToggleEblVrm.style.borderColor = 'var(--border-subtle)';
        eblVrmText.textContent = 'EBL/VRM';
      }
      chartEngine.render(currentVesselState);
    });
  }

  // تتبع حركة مؤشر الفأرة لعرض الإحداثيات وتحديث مسطرة القياس
  chartEngine.onCursorMove = (geo) => {
    if (!geo || !cursorCoordsText) return;
    const latDeg = Math.floor(Math.abs(geo.lat));
    const latMin = ((Math.abs(geo.lat) - latDeg) * 60).toFixed(2);
    const lonDeg = Math.floor(Math.abs(geo.lon));
    const lonMin = ((Math.abs(geo.lon) - lonDeg) * 60).toFixed(2);
    cursorCoordsText.textContent = `${latDeg}° ${latMin}' ${geo.lat >= 0 ? 'N' : 'S'} , ${lonDeg}° ${lonMin}' ${geo.lon >= 0 ? 'E' : 'W'}`;

    if (chartEngine.isRouteDrawingMode || (chartEngine.eblVrm && chartEngine.eblVrm.active)) {
      chartEngine.render(currentVesselState);
    }
  };

  // =========================================================
  // 7c. تخطيط المسارات والنقاط الإرشادية والطيار الآلي (Routes & GPX)
  // =========================================================
  if (btnOpenRoutes) {
    btnOpenRoutes.addEventListener('click', () => {
      routesModal.classList.add('open');
      loadRoutesAndWaypoints();
    });
  }
  if (btnCloseRoutes) {
    btnCloseRoutes.addEventListener('click', () => routesModal.classList.remove('open'));
  }

  async function loadRoutesAndWaypoints() {
    if (!window.api || !window.api.getRouteData) return;
    try {
      const data = await window.api.getRouteData();
      chartEngine.setRoutes(data.routes, data.activeRouteId, data.activeWaypointIndex);
      chartEngine.setWaypoints(data.waypoints);
      renderRoutesList(data.routes, data.activeRouteId);
      renderWaypointsList(data.waypoints);
      chartEngine.render(currentVesselState);
    } catch (e) {
      console.error('Failed to load routes:', e);
    }
  }

  function renderRoutesList(routes, activeRouteId) {
    if (!routesListContainer) return;
    routesCountBadge.textContent = `${routes ? routes.length : 0} مسارات`;
    routesListContainer.innerHTML = '';

    if (!routes || routes.length === 0) {
      routesListContainer.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 16px; font-size: 12px;">لا توجد مسارات محفوظة حالياً. اضغط "رسم مسار" للبدء.</div>';
      return;
    }

    routes.forEach(r => {
      const isActive = (r.id === activeRouteId);
      const div = document.createElement('div');
      div.className = `route-item-card ${isActive ? 'active' : ''}`;
      div.innerHTML = `
        <div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <strong style="color: #fff; font-size: 13px;">${r.name}</strong>
            ${isActive ? '<span class="badge-active-route">المسار النشط للرحلة</span>' : ''}
          </div>
          <div class="route-meta">
            <span>النقاط: ${r.points ? r.points.length : 0}</span>
            <span>المسافة الإجمالية: ${r.totalDistanceNm} NM</span>
            <span>النوع: ${r.navType === 'great_circle' ? 'دائرة عظمى' : 'متعامد (Rhumb)'}</span>
          </div>
        </div>
        <div style="display: flex; gap: 6px;">
          ${!isActive ? `<button class="hud-btn btn-activate-route" data-id="${r.id}" style="padding: 4px 10px; font-size: 11px;">تفعيل التوجيه</button>` : ''}
          <button class="hud-btn btn-export-single-gpx" data-id="${r.id}" style="padding: 4px 8px; font-size: 11px;">GPX</button>
          <button class="hud-btn btn-delete-route" data-id="${r.id}" style="padding: 4px 8px; font-size: 11px; color: #ef4444;">حذف</button>
        </div>
      `;
      routesListContainer.appendChild(div);
    });

    routesListContainer.querySelectorAll('.btn-activate-route').forEach(btn => {
      btn.addEventListener('click', async () => {
        await window.api.setActiveRoute(btn.dataset.id);
        loadRoutesAndWaypoints();
      });
    });

    routesListContainer.querySelectorAll('.btn-export-single-gpx').forEach(btn => {
      btn.addEventListener('click', async () => {
        await window.api.exportGPX(btn.dataset.id);
      });
    });

    routesListContainer.querySelectorAll('.btn-delete-route').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('هل أنت متأكد من حذف هذا المسار؟')) {
          await window.api.deleteRoute(btn.dataset.id);
          loadRoutesAndWaypoints();
        }
      });
    });
  }

  function renderWaypointsList(waypoints) {
    if (!waypointsListContainer) return;
    waypointsCountBadge.textContent = `${waypoints ? waypoints.length : 0} نقاط`;
    waypointsListContainer.innerHTML = '';

    if (!waypoints || waypoints.length === 0) {
      waypointsListContainer.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 16px; font-size: 12px;">لا توجد نقاط إرشادية منفصلة.</div>';
      return;
    }

    waypoints.forEach(w => {
      const div = document.createElement('div');
      div.className = 'route-item-card';
      div.innerHTML = `
        <div>
          <strong style="color: #fff; font-size: 13px;">${w.name}</strong>
          <div class="route-meta">
            <span>Lat: ${w.lat.toFixed(4)}°</span>
            <span>Lon: ${w.lon.toFixed(4)}°</span>
            ${w.desc ? `<span>${w.desc}</span>` : ''}
          </div>
        </div>
        <div>
          <button class="hud-btn btn-delete-wpt" data-id="${w.id}" style="padding: 4px 8px; font-size: 11px; color: #ef4444;">حذف</button>
        </div>
      `;
      waypointsListContainer.appendChild(div);
    });

    waypointsListContainer.querySelectorAll('.btn-delete-wpt').forEach(btn => {
      btn.addEventListener('click', async () => {
        await window.api.deleteWaypoint(btn.dataset.id);
        loadRoutesAndWaypoints();
      });
    });
  }

  // وضع رسم المسار التفاعلي على الخريطة
  if (btnStartRouteDraw) {
    btnStartRouteDraw.addEventListener('click', () => {
      routesModal.classList.remove('open');
      chartEngine.setRouteDrawingMode(true);
      if (routeDrawingBar) routeDrawingBar.style.display = 'flex';
      chartEngine.render(currentVesselState);
    });
  }

  if (btnFinishRoute) {
    btnFinishRoute.addEventListener('click', async () => {
      if (chartEngine.tempRoutePoints.length < 2) {
        alert('يجب النقر على الخريطة لتحديد نقطتين على الأقل لإنشاء مسار.');
        return;
      }
      const routeName = prompt('أدخل اسم المسار البحري:', `مسار ${new Date().toLocaleDateString('ar-EG')}`);
      if (routeName) {
        await window.api.createRoute({
          name: routeName,
          points: chartEngine.tempRoutePoints,
          navType: 'rhumb'
        });
        chartEngine.setRouteDrawingMode(false);
        if (routeDrawingBar) routeDrawingBar.style.display = 'none';
        await loadRoutesAndWaypoints();
      }
    });
  }

  if (btnCancelRoute) {
    btnCancelRoute.addEventListener('click', () => {
      chartEngine.setRouteDrawingMode(false);
      if (routeDrawingBar) routeDrawingBar.style.display = 'none';
      chartEngine.render(currentVesselState);
    });
  }

  // إضافة نقطة يدوية
  if (btnOpenNewWptForm) {
    btnOpenNewWptForm.addEventListener('click', () => {
      manualWptForm.style.display = 'block';
      if (currentVesselState && currentVesselState.lat !== null) {
        inputWptLat.value = currentVesselState.lat.toFixed(4);
        inputWptLon.value = currentVesselState.lon.toFixed(4);
      }
    });
  }

  if (btnCancelManualWpt) {
    btnCancelManualWpt.addEventListener('click', () => manualWptForm.style.display = 'none');
  }

  if (btnSaveManualWpt) {
    btnSaveManualWpt.addEventListener('click', async () => {
      const name = inputWptName.value.trim() || 'WPT';
      const lat = parseFloat(inputWptLat.value);
      const lon = parseFloat(inputWptLon.value);

      if (isNaN(lat) || isNaN(lon)) {
        alert('يرجى إدخال إحداثيات صحيحة.');
        return;
      }

      await window.api.createWaypoint({ lat, lon, name });
      manualWptForm.style.display = 'none';
      inputWptName.value = '';
      inputWptLat.value = '';
      inputWptLon.value = '';
      await loadRoutesAndWaypoints();
    });
  }

  // تصدير واستيراد GPX
  if (btnExportAllGpx) {
    btnExportAllGpx.addEventListener('click', async () => {
      const res = await window.api.exportGPX();
      if (res && res.success) {
        alert(`تم تصدير ملف GPX بنجاح إلى:\n${res.filePath}`);
      }
    });
  }

  if (btnImportGpxFile) {
    btnImportGpxFile.addEventListener('click', async () => {
      const res = await window.api.importGPX();
      if (res && res.success) {
        alert(`تم استيراد ${res.importedRoutesCount} مسارات و ${res.importedWaypointsCount} نقاط إرشادية بنجاح!`);
        await loadRoutesAndWaypoints();
      }
    });
  }

  // تشغيل وإيقاف بث الطيار الآلي Autopilot
  if (btnToggleAutopilot) {
    btnToggleAutopilot.addEventListener('click', async () => {
      autopilotActive = !autopilotActive;
      const res = await window.api.toggleAutopilot(autopilotActive);
      autopilotActive = res.enabled;
      if (autopilotActive) {
        btnToggleAutopilot.style.background = 'rgba(16, 185, 129, 0.3)';
        btnToggleAutopilot.style.borderColor = 'var(--accent-green)';
        autopilotStatusText.textContent = 'إيقاف الطيار الآلي';
      } else {
        btnToggleAutopilot.style.background = 'transparent';
        btnToggleAutopilot.style.borderColor = 'var(--border-subtle)';
        autopilotStatusText.textContent = 'تشغيل الطيار الآلي';
      }
    });
  }

  // تحميل المسارات والنقاط عند الإقلاع
  loadRoutesAndWaypoints();

  // =========================================================
  // 8. محدد أوضاع الإضاءة الملاحية (Day / Dusk / Night)
  // =========================================================
  const modeButtons = document.querySelectorAll('.mode-btn');
  modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      modeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.dataset.mode;
      document.body.className = '';
      if (mode === 'night-red') document.body.classList.add('mode-night-red');
      else if (mode === 'day') document.body.classList.add('mode-day');
      else document.body.classList.add('mode-dark-glass');
    });
  });

  // =========================================================
  // 9. نافذة حول البرنامج (About Dialog) وفق معايير ARN
  // =========================================================
  btnAbout.addEventListener('click', () => aboutModal.classList.add('open'));
  btnCloseAbout.addEventListener('click', () => aboutModal.classList.remove('open'));

  document.getElementById('linkWhatsApp').addEventListener('click', (e) => {
    e.preventDefault();
    if (window.api) window.api.openExternal('https://wa.me/201556710314');
  });

  document.getElementById('linkTelegram').addEventListener('click', (e) => {
    e.preventDefault();
    if (window.api) window.api.openExternal('https://t.me/ABDOURNASSAR95');
  });

  document.getElementById('linkFacebook').addEventListener('click', (e) => {
    e.preventDefault();
    if (window.api) window.api.openExternal('https://www.facebook.com/abdouragab.nassar');
  });

  document.getElementById('linkMessenger').addEventListener('click', (e) => {
    e.preventDefault();
    if (window.api) window.api.openExternal('https://m.me/abdouragab.nassar');
  });

  // =========================================================
  // 10. أزرار التحكم بالنافذة
  // =========================================================
  document.getElementById('btnMin').addEventListener('click', () => {
    if (window.api) window.api.minimizeWindow();
  });

  document.getElementById('btnMax').addEventListener('click', () => {
    if (window.api) window.api.maximizeWindow();
  });

  document.getElementById('btnClose').addEventListener('click', () => {
    if (window.api) window.api.closeWindow();
  });
});
