/**
 * ARN Marine Navigator - Secure Context Bridge Preload
 * شركة ARN Technology - تطوير وبرمجة: عبده رجب نصار
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // 1. نظام فحص وإدارة الخرائط البحرية المحلية (S-57, BSB, MBTiles, GSHHS)
  selectChartFolder: () => ipcRenderer.invoke('charts:select-folder'),
  scanCharts: (folderPath) => ipcRenderer.invoke('charts:scan', folderPath),
  getLoadedCharts: () => ipcRenderer.invoke('charts:get-loaded'),
  getGshhsCoastlines: (bounds) => ipcRenderer.invoke('charts:get-gshhs', bounds),
  openS57Chart: (path) => ipcRenderer.invoke('charts:open-s57', path),
  openBsbChart: (path) => ipcRenderer.invoke('charts:open-bsb', path),
  openMbtiles: (path) => ipcRenderer.invoke('charts:open-mbtiles', path),
  getMbtilesTile: (path, z, x, y) => ipcRenderer.invoke('charts:get-mbtiles-tile', { path, z, x, y }),

  // 2. إدارة وتوقع المد والجزر والتيارات البحرية (XTide Offline Harmonics)
  getNearbyTideStations: (params) => ipcRenderer.invoke('tides:get-nearby', params),
  getTidesInBounds: (bounds) => ipcRenderer.invoke('tides:get-in-bounds', bounds),
  predictTide: (params) => ipcRenderer.invoke('tides:predict', params),

  // 3. إدارة الاتصال بأجهزة NMEA الحقيقية والمحاكي
  listSerialPorts: () => ipcRenderer.invoke('nmea:list-ports'),
  connectSerial: (port, baudRate) => ipcRenderer.invoke('nmea:connect-serial', { port, baudRate }),
  connectUDP: (port) => ipcRenderer.invoke('nmea:connect-udp', { port }),
  connectTCP: (host, port) => ipcRenderer.invoke('nmea:connect-tcp', { host, port }),
  disconnectNMEA: () => ipcRenderer.invoke('nmea:disconnect'),
  startSimulation: () => ipcRenderer.invoke('simulation:start'),
  stopSimulation: () => ipcRenderer.invoke('simulation:stop'),
  controlVessel: (controls) => ipcRenderer.invoke('vessel:control', controls),

  // 4. السلامة والمخطاف وطوارئ رجل في البحر MOB
  toggleAnchorWatch: (enabled, radius) => ipcRenderer.invoke('safety:anchor-watch', { enabled, radius }),
  triggerMOB: () => ipcRenderer.invoke('safety:trigger-mob'),
  clearMOB: () => ipcRenderer.invoke('safety:clear-mob'),

  // 5. النموذج المغناطيسي العالمي WMM (NOAA Offline)
  calculateWMM: (lat, lon, date, altKm) => ipcRenderer.invoke('wmm:calculate', { lat, lon, date, altKm }),
  trueToMagnetic: (trueCourse, lat, lon) => ipcRenderer.invoke('wmm:true-to-magnetic', { trueCourse, lat, lon }),
  magneticToTrue: (magCourse, lat, lon) => ipcRenderer.invoke('wmm:magnetic-to-true', { magCourse, lat, lon }),

  // 6. مخطط المسارات والنقاط الإرشادية وملفات GPX (Navigation Routes & Waypoints)
  getRouteData: () => ipcRenderer.invoke('routes:get-data'),
  createWaypoint: (params) => ipcRenderer.invoke('routes:create-waypoint', params),
  deleteWaypoint: (wptId) => ipcRenderer.invoke('routes:delete-waypoint', { wptId }),
  createRoute: (params) => ipcRenderer.invoke('routes:create-route', params),
  addPointToRoute: (params) => ipcRenderer.invoke('routes:add-point', params),
  removePointFromRoute: (params) => ipcRenderer.invoke('routes:remove-point', params),
  deleteRoute: (routeId) => ipcRenderer.invoke('routes:delete-route', { routeId }),
  setActiveRoute: (routeId) => ipcRenderer.invoke('routes:set-active', { routeId }),
  advanceActiveWaypoint: () => ipcRenderer.invoke('routes:advance-wpt'),
  exportGPX: (routeId) => ipcRenderer.invoke('routes:export-gpx', { routeId }),
  importGPX: () => ipcRenderer.invoke('routes:import-gpx'),

  // 7. بث التوجيه الآلي للطيار الآلي (Autopilot Output)
  toggleAutopilot: (enabled) => ipcRenderer.invoke('autopilot:toggle', { enabled }),
  getAutopilotStatus: () => ipcRenderer.invoke('autopilot:get-status'),

  // 5. إدارة النافذة وأوامر النظام
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  openExternal: (url) => ipcRenderer.send('shell:open-external', url),
  getAppInfo: () => ipcRenderer.invoke('app:info'),

  // 8. إدارة الإعدادات وقاعدة الأسماء العالمية (Settings & World Places)
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (partial) => ipcRenderer.invoke('settings:update', partial),
  saveLastConnection: (params) => ipcRenderer.invoke('settings:save-connection', params),
  saveChartDirectory: (dirPath) => ipcRenderer.invoke('settings:save-chart-dir', dirPath),
  saveVectorDisplay: (options) => ipcRenderer.invoke('settings:save-vector-display', options),
  getWorldPlaces: () => ipcRenderer.invoke('places:get-world-places'),
  onChartsAutoLoaded: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('charts:auto-loaded', handler);
    return () => ipcRenderer.removeListener('charts:auto-loaded', handler);
  },

  // 6. الاستماع للأحداث والبيانات الحية (IPC Event Listeners)
  onTelemetry: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('telemetry:update', handler);
    return () => ipcRenderer.removeListener('telemetry:update', handler);
  },
  onRawNmea: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('nmea:raw', handler);
    return () => ipcRenderer.removeListener('nmea:raw', handler);
  },
  onConnectionStatus: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('nmea:connection_status', handler);
    return () => ipcRenderer.removeListener('nmea:connection_status', handler);
  },
  onMOBAlarm: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('alarm:mob', handler);
    return () => ipcRenderer.removeListener('alarm:mob', handler);
  }
});
