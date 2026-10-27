/**
 * ARN Marine Navigator - Settings Manager
 * شركة ARN Technology - تطوير وبرمجة: عبده رجب نصار
 * إدارة الإعدادات وحفظ آخر اتصال ومسار الخرائط ومستويات العرض محلياً
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class SettingsManager {
  constructor() {
    this.userDataPath = app.getPath('userData');
    this.settingsFilePath = path.join(this.userDataPath, 'arn_nav_settings.json');
    this.fallbackPath = path.join(__dirname, '..', 'data', 'settings.json');

    this.defaultSettings = {
      lastConnection: {
        type: 'tcp',
        tcp: { host: '192.168.1.1', port: 10110 },
        udp: { port: 10110 },
        serial: { port: '', baudRate: 4800 },
        autoConnect: true
      },
      chartDirectory: '', // لا مسارات افتراضية على جهاز المطور — يحددها المستخدم
      vectorDisplay: {
        category: 'standard', // 'base', 'standard', 'all'
        detailFactor: 0, // منزلق التفاصيل من -5 إلى +5 (CM93 Detail Slider)
        showCountryNames: true,
        showCityNames: true,
        showSeaNames: true,
        showDepthContours: true,
        showSoundings: true,
        showNavAids: true,
        showLightSectors: true,
        showHazards: true,
        showChartOutlines: false,
        showTides: true,
        rasterOpacity: 1.0
      }
    };

    this.settings = this.load();
  }

  load() {
    let raw = null;
    try {
      if (fs.existsSync(this.settingsFilePath)) {
        raw = fs.readFileSync(this.settingsFilePath, 'utf8');
      } else if (fs.existsSync(this.fallbackPath)) {
        raw = fs.readFileSync(this.fallbackPath, 'utf8');
      }
    } catch (e) {
      console.warn('[Settings] Failed to read settings file:', e.message);
    }

    if (!raw) {
      return { ...this.defaultSettings };
    }

    try {
      const clean = raw.replace(/^\uFEFF/, '').trim();
      const parsed = JSON.parse(clean);
      return {
        ...this.defaultSettings,
        ...parsed,
        lastConnection: { ...this.defaultSettings.lastConnection, ...(parsed.lastConnection || {}) },
        vectorDisplay: { ...this.defaultSettings.vectorDisplay, ...(parsed.vectorDisplay || {}) }
      };
    } catch (e) {
      console.warn('[Settings] Failed to parse settings JSON:', e.message);
      return { ...this.defaultSettings };
    }
  }

  save() {
    try {
      const json = JSON.stringify(this.settings, null, 2);
      fs.writeFileSync(this.settingsFilePath, json, 'utf8');

      // حفظ نسخة احتياطية في مجلد data إن أمكن
      try {
        const dataDir = path.dirname(this.fallbackPath);
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(this.fallbackPath, json, 'utf8');
      } catch {}

      return true;
    } catch (e) {
      console.error('[Settings] Error saving settings:', e.message);
      return false;
    }
  }

  getSettings() {
    return this.settings;
  }

  updateSettings(partial) {
    if (!partial) return this.settings;
    if (partial.lastConnection) {
      this.settings.lastConnection = { ...this.settings.lastConnection, ...partial.lastConnection };
    }
    if (partial.chartDirectory !== undefined) {
      this.settings.chartDirectory = partial.chartDirectory;
    }
    if (partial.vectorDisplay) {
      this.settings.vectorDisplay = { ...this.settings.vectorDisplay, ...partial.vectorDisplay };
    }
    this.save();
    return this.settings;
  }

  saveLastConnection(type, data, autoConnect = true) {
    this.settings.lastConnection.type = type;
    this.settings.lastConnection.autoConnect = autoConnect;
    if (type === 'tcp' && data) {
      this.settings.lastConnection.tcp = {
        host: data.host || '192.168.1.1',
        port: parseInt(data.port, 10) || 10110
      };
    } else if (type === 'udp' && data) {
      this.settings.lastConnection.udp = {
        port: parseInt(data.port, 10) || 10110
      };
    } else if (type === 'serial' && data) {
      this.settings.lastConnection.serial = {
        port: data.port || '',
        baudRate: parseInt(data.baudRate, 10) || 4800
      };
    }
    this.save();
    return this.settings.lastConnection;
  }

  saveChartDirectory(dirPath) {
    this.settings.chartDirectory = dirPath;
    this.save();
    return this.settings.chartDirectory;
  }

  saveVectorDisplay(options) {
    this.settings.vectorDisplay = { ...this.settings.vectorDisplay, ...options };
    this.save();
    return this.settings.vectorDisplay;
  }
}

module.exports = SettingsManager;
