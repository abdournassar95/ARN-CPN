/**
 * ARN Marine Navigator - Autopilot Output Service
 * شركة ARN Technology - تطوير وبرمجة: عبده رجب نصار
 * محرك إرسال بيانات التوجيه الآلي NMEA 0183 (APB, RMB, XTE, RMC) لأجهزة الطيار الآلي البحرية
 */

class AutopilotService {
  constructor(nmeaService, routePlanner, wmmEngine) {
    this.nmeaService = nmeaService;
    this.routePlanner = routePlanner;
    this.wmmEngine = wmmEngine;

    this.enabled = false;
    this.intervalId = null;
    this.transmissionRateHz = 1; // 1 Hz
  }

  start() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.enabled = true;
    this.intervalId = setInterval(() => {
      this._broadcastAutopilotSentences();
    }, 1000 / this.transmissionRateHz);
  }

  stop() {
    this.enabled = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  _broadcastAutopilotSentences() {
    if (!this.enabled || !this.nmeaService) return;

    const vessel = this.nmeaService.vessel;
    if (vessel.lat === null || vessel.lon === null) return;

    // استخراج بيانات التوجيه النشطة من مخطط المسارات
    const steering = this.routePlanner.getActiveSteering(
      vessel.lat,
      vessel.lon,
      vessel.sog || 0,
      vessel.cog || 0
    );

    if (!steering) return;

    // حساب الانحراف المغناطيسي لتحويل التوجيه إلى زوايا مغناطيسية (°M) للطيار الآلي
    const wmm = this.wmmEngine.calculate(vessel.lat, vessel.lon);
    const declination = wmm.declination || 0;

    let btwMag = steering.btwDeg - declination;
    btwMag = ((btwMag % 360) + 360) % 360;

    // 1. صياغة جملة $GPAPB (Autopilot Sentence B)
    const apb = this._formatAPB(steering, btwMag);
    this._sendSentence(apb);

    // 2. صياغة جملة $GPRMB (Recommended Minimum Navigation Information)
    const rmb = this._formatRMB(vessel, steering, btwMag);
    this._sendSentence(rmb);

    // 3. صياغة جملة $GPXTE (Cross-Track Error)
    const xte = this._formatXTE(steering);
    this._sendSentence(xte);
  }

  _formatAPB(steering, btwMag) {
    // $GPAPB,A,A,x.xx,a,N,A,A,x.x,M,c--c,x.x,M,x.x,M*hh
    const xteVal = (steering.xteNm || 0).toFixed(2);
    const steerDir = steering.xteSteerDir || 'L';
    const arrAlarm = steering.arrivalAlarm ? 'A' : 'V';
    const wptId = (steering.targetWaypointName || 'WPT').slice(0, 8);
    const brgStr = btwMag.toFixed(1);

    const body = `GPAPB,A,A,${xteVal},${steerDir},N,${arrAlarm},V,${brgStr},M,${wptId},${brgStr},M,${brgStr},M`;
    return `$${body}*${this._calcChecksum(body)}`;
  }

  _formatRMB(vessel, steering, btwMag) {
    // $GPRMB,A,x.xx,a,c--c,c--c,llll.ll,a,yyyyy.yy,a,x.x,x.x,x.x,A,A*hh
    const xteVal = (steering.xteNm || 0).toFixed(2);
    const steerDir = steering.xteSteerDir || 'L';
    const fromWpt = 'ORIGIN';
    const toWpt = (steering.targetWaypointName || 'WPT').slice(0, 8);

    const destLat = this._formatNMEACoord(steering.targetWaypointLat, true);
    const destLon = this._formatNMEACoord(steering.targetWaypointLon, false);

    const dtwStr = (steering.dtwNm || 0).toFixed(1);
    const btwStr = btwMag.toFixed(1);
    const vmgStr = (steering.vmgKts || 0).toFixed(1);
    const arrAlarm = steering.arrivalAlarm ? 'A' : 'V';

    const body = `GPRMB,A,${xteVal},${steerDir},${fromWpt},${toWpt},${destLat},${destLon},${dtwStr},${btwStr},${vmgStr},${arrAlarm},A`;
    return `$${body}*${this._calcChecksum(body)}`;
  }

  _formatXTE(steering) {
    // $GPXTE,A,A,x.xx,a,N*hh
    const xteVal = (steering.xteNm || 0).toFixed(2);
    const steerDir = steering.xteSteerDir || 'L';
    const body = `GPXTE,A,A,${xteVal},${steerDir},N`;
    return `$${body}*${this._calcChecksum(body)}`;
  }

  _formatNMEACoord(degVal, isLat) {
    if (degVal === undefined || degVal === null) return isLat ? '0000.00,N' : '00000.00,E';
    const absVal = Math.abs(degVal);
    const deg = Math.floor(absVal);
    const min = ((absVal - deg) * 60).toFixed(2);
    const hemi = isLat ? (degVal >= 0 ? 'N' : 'S') : (degVal >= 0 ? 'E' : 'W');
    const padDeg = isLat ? String(deg).padStart(2, '0') : String(deg).padStart(3, '0');
    const padMin = String(min).padStart(5, '0');
    return `${padDeg}${padMin},${hemi}`;
  }

  _calcChecksum(str) {
    let checksum = 0;
    for (let i = 0; i < str.length; i++) {
      checksum ^= str.charCodeAt(i);
    }
    return checksum.toString(16).toUpperCase().padStart(2, '0');
  }

  _sendSentence(sentence) {
    if (!this.nmeaService) return;

    // بث الجملة إلى مخرجات النوافذ والمنافذ المفتوحة
    const line = sentence + '\r\n';

    // 1. الإرسال عبر منفذ الـ Serial إن كان متصلاً
    if (this.nmeaService.serialPort && this.nmeaService.serialPort.isOpen) {
      try {
        this.nmeaService.serialPort.write(line);
      } catch (e) {}
    }

    // 2. الإرسال عبر مقبس TCP إن كان متصلاً
    if (this.nmeaService.tcpSocket && !this.nmeaService.tcpSocket.destroyed) {
      try {
        this.nmeaService.tcpSocket.write(line);
      } catch (e) {}
    }

    // 3. إشعار الواجهة كجملة NMEA صادرة
    this.nmeaService.emit('raw_nmea', sentence);
  }
}

module.exports = AutopilotService;
