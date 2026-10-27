/**
 * ARN Marine Navigator - Main Process
 * شركة ARN Technology - تطوير وبرمجة: عبده رجب نصار
 */

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const ChartScanner = require('./chart_scanner');
const NMEAService = require('./nmea_service');
const BSBDecoder = require('./bsb_decoder');
const GSHHSProvider = require('./gshhs_provider');
const S57Decoder = require('./s57_decoder');
const TidesEngine = require('./tides_engine');
const WMMEngine = require('./wmm_engine');
const RoutePlanner = require('./route_planner');
const AutopilotService = require('./autopilot_service');
const SettingsManager = require('./settings_manager');
const TrackStore = require('./track_store');
const GribDecoder = require('./grib_decoder');
const fs = require('fs');

let mainWindow = null;
const chartScanner = new ChartScanner();
const nmeaService = new NMEAService();
const gshhsProvider = new GSHHSProvider();
const s57Decoder = new S57Decoder();
const tidesEngine = new TidesEngine();
const wmmEngine = new WMMEngine();
const routePlanner = new RoutePlanner();
const autopilotService = new AutopilotService(nmeaService, routePlanner, wmmEngine);
const settingsManager = new SettingsManager();
const trackStore = new TrackStore();

const openMbtilesMap = new Map();
const MAX_OPEN_MBTILES = 4; // حد LRU لقارئات SQLite المفتوحة
let loadedChartsCache = [];

/**
 * إدارة دورة حياة قارئات MBTiles مع إزاحة LRU وإغلاق الموارد
 */
async function getMbtilesReader(mbtilesPath) {
  if (openMbtilesMap.has(mbtilesPath)) {
    return openMbtilesMap.get(mbtilesPath);
  }
  if (openMbtilesMap.size >= MAX_OPEN_MBTILES) {
    const oldestKey = openMbtilesMap.keys().next().value;
    const oldReader = openMbtilesMap.get(oldestKey);
    try {
      oldReader.close();
    } catch {
      /* تجاهل */
    }
    openMbtilesMap.delete(oldestKey);
  }
  const MBTilesReader = require('./mbtiles_reader');
  const reader = new MBTilesReader(mbtilesPath);
  await reader.init();
  openMbtilesMap.set(mbtilesPath, reader);
  return reader;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#070b14',
    frame: false, // شريط عنوان مخصص بنمط Glassmorphism
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[RENDERER ${level}] ${message} (${sourceId}:${line})`);
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', async () => {
    mainWindow.show();

    // 1. استعادة الاتصال السابق تلقائياً إن كان مفعلاً
    const settings = settingsManager.getSettings();
    if (settings && settings.lastConnection && settings.lastConnection.autoConnect) {
      const lc = settings.lastConnection;
      console.log(`[AutoConnect] Restoring previous connection: ${lc.type}...`);
      setTimeout(() => {
        try {
          if (lc.type === 'tcp' && lc.tcp && lc.tcp.host) {
            nmeaService.connectTCP(lc.tcp.host, lc.tcp.port || 10110);
          } else if (lc.type === 'udp' && lc.udp && lc.udp.port) {
            nmeaService.connectUDP(lc.udp.port || 10110);
          } else if (lc.type === 'serial' && lc.serial && lc.serial.port) {
            nmeaService.connectSerial(lc.serial.port, lc.serial.baudRate || 4800);
          }
        } catch (e) {
          console.warn('[AutoConnect] Auto connection attempt failed:', e.message);
        }
      }, 1000);
    }

    // 2. التحميل التلقائي لمجلد الخرائط المحفوظ (CM93 أو غيره) إن وجد
    if (settings && settings.chartDirectory && fs.existsSync(settings.chartDirectory)) {
      try {
        console.log(`[Charts] Auto-loading saved chart directory: ${settings.chartDirectory}`);
        const scanRes = await chartScanner.scanDirectory(settings.chartDirectory);
        loadedChartsCache = scanRes.charts;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('charts:auto-loaded', scanRes);
        }
      } catch (err) {
        console.warn('[Charts] Auto-load of saved chart directory failed:', err.message);
      }
    }
  });

  // ربط أحداث الاتصال الملاحي اللحظي بالواجهة الرسومية
  nmeaService.on('telemetry', (payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (payload && payload.vessel && payload.vessel.lat !== null && payload.vessel.lon !== null) {
        // 1. حساب الانحراف المغناطيسي الحقيقي أوفلاين (NOAA WMM)
        const wmm = wmmEngine.calculate(payload.vessel.lat, payload.vessel.lon);
        payload.vessel.magVariation = wmm.declination;
        payload.vessel.magVariationStr = wmm.str;
        payload.vessel.magModelExpired = wmm.modelExpired;

        // 2. حساب بيانات التوجيه النشطة (Steering, DTW, BTW, XTE)
        payload.steering = routePlanner.getActiveSteering(
          payload.vessel.lat,
          payload.vessel.lon,
          payload.vessel.sog,
          payload.vessel.cog
        );

        // 3. حفظ أثر الإبحار بشكل دائم في userData (كتابة مُجمّعة)
        trackStore.appendPoint(payload.vessel.lat, payload.vessel.lon, {
          sog: payload.vessel.sog,
          cog: payload.vessel.cog
        });
      }
      mainWindow.webContents.send('telemetry:update', payload);
    }
  });

  nmeaService.on('raw_nmea', (sentence) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('nmea:raw', sentence);
    }
  });

  nmeaService.on('connection_status', (status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('nmea:connection_status', status);
    }
  });

  nmeaService.on('mob_alarm', (mobPos) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('alarm:mob', mobPos);
    }
  });

  // جمل NMEA الصادرة من الطيار الآلي (قناة منفصلة عن الوارد)
  nmeaService.on('out_nmea', (out) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('nmea:out', out);
    }
  });

  mainWindow.on('closed', () => {
    autopilotService.stop();
    nmeaService.disconnect();
    nmeaService.destroy();
    trackStore.destroy();
    for (const reader of openMbtilesMap.values()) {
      try {
        reader.close();
      } catch {
        /* تجاهل */
      }
    }
    openMbtilesMap.clear();
    try {
      gshhsProvider.close();
    } catch {
      /* تجاهل */
    }
    mainWindow = null;
  });
}

// تشغيل التطبيق بنسخة واحدة
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(createWindow);
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ==========================================
// IPC HANDLERS - معالجة طلبات الواجهة
// ==========================================

// 1. اختيار مجلد الخرائط المحلية من الحاسوب
ipcMain.handle('charts:select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'تحديد مجلد الخرائط البحرية المحلية (S-57, BSB, MBTiles, CM93)',
    properties: ['openDirectory']
  });

  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

// 2. فحص المجلد واستخراج الخرائط وحفظ المسار تلقائياً
ipcMain.handle('charts:scan', async (event, folderPath) => {
  try {
    const scanResults = await chartScanner.scanDirectory(folderPath);
    loadedChartsCache = scanResults.charts;
    settingsManager.saveChartDirectory(folderPath); // حفظ المسار في الإعدادات
    return { success: true, data: scanResults };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('charts:get-loaded', async () => {
  return loadedChartsCache;
});

// 3. استرجاع خطوط السواحل والشواطئ العالمية (GSHHS Baseline الحقيقي)
ipcMain.handle('charts:get-gshhs', (event, bounds) => {
  try {
    if (bounds && bounds.length >= 4) {
      return gshhsProvider.getCoastlinesForBounds(bounds[0], bounds[1], bounds[2], bounds[3]);
    }
    // افتراضي: حوض البحر الأحمر وسيناء والمتوسط (أو النطاق المطلوب)
    return gshhsProvider.getCoastlinesForBounds(20, 10, 45, 36);
  } catch (err) {
    console.error('Error fetching GSHHS coastlines:', err.message);
    return [];
  }
});

// 4. فتح وقراءة خريطة متجهات S-57 ENC (.000) — قراءة غير حاجبة
ipcMain.handle('charts:open-s57', async (event, s57Path) => {
  try {
    const chartData = await s57Decoder.parseFileAsync(s57Path);
    return { success: true, chart: chartData };
  } catch (error) {
    console.error('[S-57] Parse failed:', error.message);
    return { success: false, error: error.message };
  }
});

// 5. فتح وقراءة ترويسة خريطة BSB/KAP محددة
ipcMain.handle('charts:open-bsb', (event, bsbPath) => {
  try {
    const decoder = new BSBDecoder(bsbPath);
    return { success: true, metadata: decoder.toMetadata() };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 5b. فك الصورة النقطية الكاملة لخريطة BSB/KAP (RLE + PNG)
ipcMain.handle('charts:open-bsb-image', (event, bsbPath) => {
  try {
    const decoder = new BSBDecoder(bsbPath);
    const metadata = decoder.toMetadata();
    const dataUrl = decoder.getImageDataURL();
    return { success: true, metadata, dataUrl };
  } catch (error) {
    console.warn('[BSB] Image decode failed:', error.message);
    return { success: false, error: error.message };
  }
});

// 6. فتح حزمة MBTiles واستعلام الرقع محلياً (LRU)
ipcMain.handle('charts:open-mbtiles', async (event, mbtilesPath) => {
  try {
    const reader = await getMbtilesReader(mbtilesPath);
    return { success: true, metadata: reader.metadata };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('charts:get-mbtiles-tile', async (event, { path: mbtilesPath, z, x, y }) => {
  try {
    const reader = await getMbtilesReader(mbtilesPath);
    const dataUrl = reader.getTileDataURL(z, x, y);
    return { success: true, dataUrl };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 6b. فتح وتحليل ملف طقس GRIB1 حقيقي
ipcMain.handle('grib:open-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'فتح ملف طقس بحري GRIB1',
    filters: [
      { name: 'GRIB Weather Files', extensions: ['grb', 'grib', 'grb1', 'bin'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return { success: false, canceled: true };
  }
  try {
    const grids = GribDecoder.parseFile(result.filePaths[0]);
    return {
      success: true,
      fileName: path.basename(result.filePaths[0]),
      grids: grids.map((g) => ({
        parameter: g.parameter,
        label: g.label,
        unit: g.unit,
        levelValue: g.levelValue,
        ni: g.ni,
        nj: g.nj,
        lat0: g.lat0,
        lon0: g.lon0,
        lat1: g.lat1,
        lon1: g.lon1,
        dLat: g.dLat,
        dLon: g.dLon,
        referenceTime: g.referenceTime ? g.referenceTime.toISOString() : null,
        values: Array.from(g.values)
      }))
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 7. إدارة وتوقع المد والجزر والتيارات البحرية (XTide Offline Harmonics)
ipcMain.handle('tides:get-nearby', (event, { lat, lon, maxDistanceNm }) => {
  return tidesEngine.findNearbyStations(lat, lon, maxDistanceNm);
});

ipcMain.handle('tides:get-in-bounds', (event, bounds) => {
  if (!bounds || bounds.length < 4) return [];
  return tidesEngine.getStationsInBounds(bounds[0], bounds[1], bounds[2], bounds[3]);
});

ipcMain.handle('tides:predict', (event, { stationName, date }) => {
  return tidesEngine.predictTide(stationName, date ? new Date(date) : new Date());
});

// 8. إدارة الاتصال بأجهزة NMEA الحقيقية ومنافذ Serial / UDP
ipcMain.handle('nmea:list-ports', async () => {
  return await nmeaService.listSerialPorts();
});

ipcMain.handle('nmea:connect-serial', (event, { port, baudRate, remember = true }) => {
  try {
    const res = nmeaService.connectSerial(port, baudRate);
    if (res && res.success && remember) {
      settingsManager.saveLastConnection('serial', { port, baudRate }, true);
    }
    return res;
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('nmea:connect-udp', (event, { port, remember = true }) => {
  try {
    const res = nmeaService.connectUDP(port);
    if (res && res.success && remember) {
      settingsManager.saveLastConnection('udp', { port }, true);
    }
    return res;
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('nmea:connect-tcp', (event, { host, port, remember = true }) => {
  try {
    const res = nmeaService.connectTCP(host, port);
    if (res && res.success && remember) {
      settingsManager.saveLastConnection('tcp', { host, port }, true);
    }
    return res;
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('nmea:disconnect', () => {
  // إيقاف بث الطيار الآلي أولاً حتى لا تُرسل جمل توجيه بلا مصدر موقع
  autopilotService.stop();
  nmeaService.stopSimulation();
  nmeaService.disconnect();
  // عند قطع الاتصال اليدوي، نلغي الربط التلقائي في المرة القادمة
  settingsManager.updateSettings({ lastConnection: { autoConnect: false } });
  return { success: true };
});

// 8b. محاكي الإبحار الداخلي (للتجربة دون أجهزة حقيقية)
ipcMain.handle('simulation:start', () => {
  nmeaService.startSimulation();
  return { success: true, simulating: nmeaService.isSimulating };
});

ipcMain.handle('simulation:stop', () => {
  nmeaService.stopSimulation();
  return { success: true, simulating: false };
});

ipcMain.handle('vessel:control', (event, controls) => {
  if (!controls || typeof controls !== 'object') return { success: false };
  nmeaService.controlVessel(controls);
  return { success: true };
});

// 9. السلامة والمخطاف ورجل في البحر MOB
ipcMain.handle('safety:anchor-watch', (event, { enabled, radius }) => {
  return nmeaService.toggleAnchorWatch(enabled, radius);
});

ipcMain.handle('safety:trigger-mob', () => {
  return nmeaService.triggerMOB();
});

ipcMain.handle('safety:clear-mob', () => {
  return nmeaService.clearMOB();
});

// 10. حسابات النموذج المغناطيسي العالمي WMM (Offline NOAA WMM)
ipcMain.handle('wmm:calculate', (event, { lat, lon, date, altKm }) => {
  return wmmEngine.calculate(lat, lon, date ? new Date(date) : new Date(), altKm || 0);
});

ipcMain.handle('wmm:model-info', () => {
  return wmmEngine.getModelInfo(new Date());
});

ipcMain.handle('wmm:true-to-magnetic', (event, { trueCourse, lat, lon }) => {
  return wmmEngine.trueToMagnetic(trueCourse, lat, lon);
});

ipcMain.handle('wmm:magnetic-to-true', (event, { magCourse, lat, lon }) => {
  return wmmEngine.magneticToTrue(magCourse, lat, lon);
});

// 11. إدارة مخطط المسارات والنقاط الإرشادية وملفات GPX
ipcMain.handle('routes:get-data', () => {
  return {
    routes: routePlanner.routes,
    waypoints: routePlanner.waypoints,
    activeRouteId: routePlanner.activeRouteId,
    activeWaypointIndex: routePlanner.activeWaypointIndex
  };
});

ipcMain.handle('routes:create-waypoint', (event, { lat, lon, name, desc }) => {
  return routePlanner.createWaypoint(lat, lon, name, desc);
});

ipcMain.handle('routes:delete-waypoint', (event, { wptId }) => {
  return routePlanner.deleteWaypoint(wptId);
});

ipcMain.handle('routes:create-route', (event, { name, points, navType }) => {
  return routePlanner.createRoute(name, points, navType);
});

ipcMain.handle('routes:add-point', (event, { routeId, lat, lon, name }) => {
  return routePlanner.addPointToRoute(routeId, lat, lon, name);
});

ipcMain.handle('routes:remove-point', (event, { routeId, pointIndex }) => {
  return routePlanner.removePointFromRoute(routeId, pointIndex);
});

ipcMain.handle('routes:delete-route', (event, { routeId }) => {
  return routePlanner.deleteRoute(routeId);
});

ipcMain.handle('routes:set-active', (event, { routeId }) => {
  return routePlanner.setActiveRoute(routeId);
});

ipcMain.handle('routes:advance-wpt', () => {
  return routePlanner.advanceActiveWaypoint();
});

ipcMain.handle('routes:export-gpx', async (event, { routeId, includeTrack = true } = {}) => {
  const tracks = includeTrack ? trackStore.getPoints() : null;
  const gpxXml = routePlanner.exportToGPX(routeId, tracks);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'تصدير مسارات الملاحة البحرية بصيغة GPX',
    defaultPath: path.join(app.getPath('documents'), `ARN_Route_${Date.now()}.gpx`),
    filters: [{ name: 'GPS Exchange Format (*.gpx)', extensions: ['gpx'] }]
  });

  if (!result.canceled && result.filePath) {
    fs.writeFileSync(result.filePath, gpxXml, 'utf8');
    return { success: true, filePath: result.filePath };
  }
  return { success: false, canceled: true };
});

ipcMain.handle('routes:import-gpx', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'استيراد مسارات ونقاط إرشادية من ملف GPX',
    filters: [{ name: 'GPS Exchange Format (*.gpx)', extensions: ['gpx', 'xml'] }],
    properties: ['openFile']
  });

  if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    const content = fs.readFileSync(filePath, 'utf8');
    const importRes = routePlanner.importFromGPX(content);
    return { ...importRes, filePath };
  }
  return { success: false, canceled: true };
});

// 11b. إدارة أثر الإبحار الدائم (Track Store في userData)
ipcMain.handle('track:get', () => {
  return { points: trackStore.getPoints(), count: trackStore.points.length };
});

ipcMain.handle('track:clear', () => {
  trackStore.clear();
  return { success: true, count: 0 };
});

ipcMain.handle('track:flush', () => {
  return { success: true, flushed: trackStore.flush() };
});

// 12. تشغيل وبث التوجيه الآلي NMEA للطيار الآلي (Autopilot Output)
ipcMain.handle('autopilot:toggle', (event, { enabled }) => {
  if (enabled) {
    autopilotService.start();
  } else {
    autopilotService.stop();
  }
  return { enabled: autopilotService.enabled };
});

ipcMain.handle('autopilot:get-status', () => {
  return { enabled: autopilotService.enabled };
});

// 13. إدارة النوافذ والأوامر الخارجية
ipcMain.on('window:minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window:maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  }
});

ipcMain.on('window:close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.on('shell:open-external', (event, url) => {
  if (url && (url.startsWith('https://') || url.startsWith('http://') || url.startsWith('mailto:'))) {
    shell.openExternal(url);
  }
});

// 14. استرجاع وحفظ الإعدادات وقاعدة بيانات الأسماء العالمية (Settings & World Places)
ipcMain.handle('settings:get', () => {
  return settingsManager.getSettings();
});

ipcMain.handle('settings:update', (event, partial) => {
  return settingsManager.updateSettings(partial);
});

ipcMain.handle('settings:save-connection', (event, { type, data, autoConnect }) => {
  return settingsManager.saveLastConnection(type, data, autoConnect);
});

ipcMain.handle('settings:save-chart-dir', (event, dirPath) => {
  return settingsManager.saveChartDirectory(dirPath);
});

ipcMain.handle('settings:save-vector-display', (event, options) => {
  return settingsManager.saveVectorDisplay(options);
});

ipcMain.handle('places:get-world-places', () => {
  try {
    const placesPath = path.join(__dirname, '..', 'data', 'world_places.json');
    if (fs.existsSync(placesPath)) {
      const content = fs
        .readFileSync(placesPath, 'utf8')
        .replace(/^\uFEFF/, '')
        .trim();
      return JSON.parse(content);
    }
  } catch (e) {
    console.warn('[Places] Failed to read world places:', e.message);
  }
  return { seas: [], countries: [], cities: [] };
});

ipcMain.handle('app:info', () => {
  return {
    name: 'ARN Marine Navigator',
    version: '1.0.0',
    developer: 'عبده رجب نصار',
    company: 'ARN Technology',
    copyright: 'حقوق النشر (c) 2026 لشركة ARN Technology. جميع الحقوق محفوظة.',
    social: {
      whatsapp: 'https://wa.me/201556710314',
      telegram: 'https://t.me/ABDOURNASSAR95',
      facebook: 'https://www.facebook.com/abdouragab.nassar',
      messenger: 'https://m.me/abdouragab.nassar'
    }
  };
});
