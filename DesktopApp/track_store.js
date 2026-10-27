/**
 * ARN Marine Navigator - Persistent Vessel Track Store
 * شركة ARN Technology - تطوير وبرمجة: عبده رجب نصار
 * حفظ أثر الإبحار (Track Log) في مجلد بيانات المستخدم بدل ذاكرة الواجهة،
 * مع كتابة مُجمّعة (throttled) وتحقق من صحة الإحداثيات.
 */

const fs = require('fs');
const path = require('path');

class TrackStore {
  /**
   * @param {string} [baseDir] مجلد التخزين — افتراضياً userData الخاص بـ Electron
   */
  constructor(baseDir) {
    if (!baseDir) {
      try {
        const { app } = require('electron');
        baseDir = path.join(app.getPath('userData'), 'navigation');
      } catch {
        baseDir = path.join(__dirname, '..', 'data', 'navigation');
      }
    }
    this.storageDir = baseDir;
    this.storageFile = path.join(this.storageDir, 'track_history.json');

    this.points = [];
    this._dirty = false;
    this._flushTimer = null;
    this.minDistanceNm = 0.01; // ~18.5 متر: لا تُحفظ نقطة أقرب من ذلك
    this.maxPoints = 20000; // سقف صلب لحجم الملف

    this._ensureStorage();
    this.load();
  }

  _ensureStorage() {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }
    } catch (e) {
      console.error('[TrackStore] ensureStorage failed:', e.message);
    }
  }

  load() {
    try {
      if (fs.existsSync(this.storageFile)) {
        const raw = fs.readFileSync(this.storageFile, 'utf8').replace(/^﻿/, '').trim();
        if (raw) {
          const data = JSON.parse(raw);
          this.points = Array.isArray(data.points) ? data.points : [];
        }
      }
    } catch (e) {
      console.warn('[TrackStore] تعذر قراءة سجل الأثر، البدء بسجل فارغ:', e.message);
      this.points = [];
    }
  }

  static isValidLatLon(lat, lon) {
    return (
      typeof lat === 'number' &&
      typeof lon === 'number' &&
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      lat >= -90 &&
      lat <= 90 &&
      lon >= -180 &&
      lon <= 180
    );
  }

  /**
   * إضافة نقطة أثر مع التحقق وتصفية الإزاحات المتقاربة جداً.
   * الكتابة على القرص مُجمّعة كل 5 ثوانٍ أو عند امتلاء السقف.
   */
  appendPoint(lat, lon, extra = {}) {
    if (!TrackStore.isValidLatLon(lat, lon)) return false;

    const last = this.points[this.points.length - 1];
    if (last) {
      const dLat = (lat - last.lat) * 60; // تقريب الدقيقة الميلية
      const dLon = (lon - last.lon) * 60 * Math.cos((lat * Math.PI) / 180);
      const distNm = Math.sqrt(dLat * dLat + dLon * dLon);
      if (distNm < this.minDistanceNm) return false;
    }

    this.points.push({
      lat,
      lon,
      ts: extra.ts || Date.now(),
      sog: typeof extra.sog === 'number' ? extra.sog : null,
      cog: typeof extra.cog === 'number' ? extra.cog : null
    });

    if (this.points.length > this.maxPoints) {
      this.points.splice(0, this.points.length - this.maxPoints);
    }

    this._dirty = true;
    this._scheduleFlush();
    return true;
  }

  _scheduleFlush() {
    if (this._flushTimer) return;
    this._flushTimer = setTimeout(() => this.flush(), 5000);
    if (this._flushTimer.unref) this._flushTimer.unref();
  }

  flush() {
    if (this._flushTimer) {
      clearTimeout(this._flushTimer);
      this._flushTimer = null;
    }
    if (!this._dirty) return true;
    try {
      this._ensureStorage();
      const payload = {
        version: 1,
        updatedAt: new Date().toISOString(),
        count: this.points.length,
        points: this.points
      };
      const tmp = this.storageFile + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(payload), 'utf8');
      fs.renameSync(tmp, this.storageFile); // كتابة ذرّية
      this._dirty = false;
      return true;
    } catch (e) {
      console.error('[TrackStore] flush failed:', e.message);
      return false;
    }
  }

  getPoints(limit = null) {
    if (limit && limit > 0) return this.points.slice(-limit);
    return this.points;
  }

  clear() {
    this.points = [];
    this._dirty = true;
    this.flush();
    return true;
  }

  destroy() {
    this.flush();
    if (this._flushTimer) {
      clearTimeout(this._flushTimer);
      this._flushTimer = null;
    }
  }
}

module.exports = TrackStore;
