/**
 * ARN Marine Navigator - Real Hardware NMEA 0183 & AIS Telemetry Service
 * شركة ARN Technology - تطوير وبرمجة: عبده رجب نصار
 * مفسر إشارات NMEA 0183 وفك تشفير رسائل الـ AIS الحية مع دعم منافذ Serial/USB وشبكة UDP
 */

const EventEmitter = require('events');
const dgram = require('dgram');
const net = require('net');
let SerialPort = null;
let ReadlineParser = null;

try {
  const sp = require('serialport');
  SerialPort = sp.SerialPort;
  ReadlineParser = require('@serialport/parser-readline').ReadlineParser;
} catch (e) {
  console.warn('SerialPort native bindings warning:', e.message);
}

class NMEAService extends EventEmitter {
  constructor() {
    super();
    this.serialConnection = null;
    this.udpSocket = null;
    this.tcpSocket = null;
    this.isSimulating = false;
    this.simulationTimer = null;

    // الحالة الملاحية الحقيقية اللحظية (تكون فارغة افتراضياً حتى وصول أول قراءة GPS حقيقية)
    this.vessel = {
      name: 'Vessel',
      callsign: '',
      mmsi: '',
      lat: null,
      lon: null,
      sog: 0.0,
      cog: 0.0,
      heading: 0.0,
      depth: null,
      windSpeed: null,
      windAngle: null,
      fixQuality: 'No Fix / Awaiting NMEA',
      satellites: 0,
      hdop: null,
      lastFixTime: null,
      connectionStatus: 'Disconnected',
      source: 'None',
      anchorWatch: false,
      anchorPos: null,
      anchorRadius: 50,
      mobActive: false,
      mobPos: null
    };

    // خريطة أهداف الـ AIS الحقيقية المفكوكة من إشارات الراديو (MMSI -> Target)
    this.aisTargetsMap = new Map();
    this.aisMultipartCache = new Map(); // للرسائل متعددة الأجزاء
    this.maxMultipartEntries = 256; // حد لحماية الذاكرة من الرسائل الناقصة
    this.maxTargets = 2000; // حد أقصى لأهداف AIS المخزنة

    // إحصائيات جودة البيانات
    this.stats = { parsed: 0, checksumRejected: 0, noChecksum: 0, aisMessages: 0 };

    // مؤقت تنظيف أهداف الـ AIS المنقطعة (التي لم ترسل إشارة لأكثر من 6 دقائق)
    this._cleanupTimer = setInterval(() => this._cleanupStaleAISTargets(), 30000);
    if (this._cleanupTimer.unref) this._cleanupTimer.unref();
  }

  /**
   * إيقاف كافة المؤقتات الداخلية عند إغلاق التطبيق
   */
  destroy() {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }
    this.aisTargetsMap.clear();
    this.aisMultipartCache.clear();
  }

  // =================================================================
  // 1. إدارة منافذ الـ Serial / USB الحقيقية (Real Hardware Ports)
  // =================================================================

  /**
   * استعراض كافة منافذ الـ COM / SerialPort المتاحة في جهاز الحاسوب
   */
  async listSerialPorts() {
    if (!SerialPort) return [];
    try {
      return await SerialPort.list();
    } catch (e) {
      console.error('خطأ أثناء قراءة منافذ الـ Serial:', e.message);
      return [];
    }
  }

  /**
   * الاتصال بمنفذ Serial/USB حقيقي (GPS Dongle, AIS Receiver, NMEA Multiplexer)
   */
  connectSerial(portPath, baudRate = 4800) {
    if (!SerialPort) {
      throw new Error('مكتبة SerialPort غير متاحة على هذا النظام.');
    }

    this.disconnect();

    try {
      this.serialConnection = new SerialPort({
        path: portPath,
        baudRate: parseInt(baudRate, 10) || 4800,
        autoOpen: true
      });

      const parser = this.serialConnection.pipe(new ReadlineParser({ delimiter: '\r\n' }));

      this.serialConnection.on('open', () => {
        this.vessel.connectionStatus = `Connected (${portPath} @ ${baudRate} bps)`;
        this.vessel.source = 'Serial/USB';
        this.emit('connection_status', { connected: true, source: portPath });
      });

      parser.on('data', (line) => {
        const trimmed = line.trim();
        if (trimmed) {
          this.emit('raw_nmea', trimmed);
          this.parseSentence(trimmed);
        }
      });

      this.serialConnection.on('error', (err) => {
        this.vessel.connectionStatus = `Error: ${err.message}`;
        this.emit('connection_status', { connected: false, error: err.message });
      });

      this.serialConnection.on('close', () => {
        this.vessel.connectionStatus = 'Disconnected';
        this.emit('connection_status', { connected: false });
      });

      return { success: true };
    } catch (err) {
      this.vessel.connectionStatus = `Failed: ${err.message}`;
      throw err;
    }
  }

  // =================================================================
  // 2. إدارة الاتصال عبر شبكة الـ UDP (Marine Wi-Fi & NMEA Gateways)
  // =================================================================

  /**
   * الاستماع لبث جمل NMEA الملاحية عبر منفذ UDP محلي (مثلاً 10110 أو 2000)
   */
  connectUDP(port = 10110) {
    this.disconnect();

    try {
      this.udpSocket = dgram.createSocket('udp4');

      this.udpSocket.on('listening', () => {
        const addr = this.udpSocket.address();
        this.vessel.connectionStatus = `UDP Listening on ${addr.address}:${addr.port}`;
        this.vessel.source = `UDP:${addr.port}`;
        this.emit('connection_status', { connected: true, source: `UDP:${addr.port}` });
      });

      this.udpSocket.on('message', (msg) => {
        const text = msg.toString('ascii');
        const lines = text.split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) {
            this.emit('raw_nmea', trimmed);
            this.parseSentence(trimmed);
          }
        }
      });

      this.udpSocket.on('error', (err) => {
        this.vessel.connectionStatus = `UDP Error: ${err.message}`;
        this.emit('connection_status', { connected: false, error: err.message });
      });

      this.udpSocket.bind(port);
      return { success: true, port };
    } catch (err) {
      this.vessel.connectionStatus = `UDP Bind Failed: ${err.message}`;
      throw err;
    }
  }

  // =================================================================
  // 3. إدارة الاتصال عبر شبكة الـ TCP (Marine Wi-Fi & NMEA Gateways)
  // =================================================================

  /**
   * الاتصال بموزع أو راوتر بحري أو بوابة NMEA Wi-Fi عبر TCP Client
   * @param {string} host عنوان IP لجهاز الراوتر أو البوابة (مثلاً 192.168.1.1)
   * @param {number} port رقم المنفذ (افتراضياً 10110 أو 2000)
   */
  connectTCP(host = '192.168.1.1', port = 10110) {
    this.disconnect();

    try {
      this.tcpSocket = new net.Socket();
      this.tcpSocket.setEncoding('ascii');

      this.tcpSocket.connect(parseInt(port, 10), host, () => {
        this.vessel.connectionStatus = `TCP Connected to ${host}:${port}`;
        this.vessel.source = `TCP:${host}:${port}`;
        this.emit('connection_status', { connected: true, source: `TCP:${host}:${port}` });
      });

      let buffer = '';
      this.tcpSocket.on('data', (chunk) => {
        buffer += chunk;
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop(); // الاحتفاظ بالسطر غير المكتمل
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) {
            this.emit('raw_nmea', trimmed);
            this.parseSentence(trimmed);
          }
        }
      });

      this.tcpSocket.on('error', (err) => {
        this.vessel.connectionStatus = `TCP Error: ${err.message}`;
        this.emit('connection_status', { connected: false, error: err.message });
      });

      this.tcpSocket.on('close', () => {
        this.vessel.connectionStatus = 'TCP Disconnected';
        this.emit('connection_status', { connected: false });
      });

      return { success: true, host, port };
    } catch (err) {
      this.vessel.connectionStatus = `TCP Connect Failed: ${err.message}`;
      throw err;
    }
  }

  /**
   * قطع الاتصال بكافة المنافذ والشبكات
   */
  disconnect() {
    if (this.serialConnection) {
      try {
        if (this.serialConnection.isOpen) this.serialConnection.close();
      } catch {}
      this.serialConnection = null;
    }

    if (this.udpSocket) {
      try {
        this.udpSocket.close();
      } catch {}
      this.udpSocket = null;
    }

    if (this.tcpSocket) {
      try {
        this.tcpSocket.destroy();
      } catch {}
      this.tcpSocket = null;
    }

    this.vessel.connectionStatus = 'Disconnected';
    this.vessel.source = 'None';
  }

  // =================================================================
  // 3. محلل جمل NMEA 0183 ومفكك شفرات الـ AIS الحقيقي
  // =================================================================

  /**
   * تحليل جملة NMEA 0183 واحدة والتحقق من الـ Checksum
   */
  parseSentence(sentence) {
    if (!sentence || typeof sentence !== 'string') return;
    const clean = sentence.trim();
    if (!clean.startsWith('$') && !clean.startsWith('!')) return;

    // 1. التحقق من صحة المجموع الاختباري (Checksum Validation)
    const starIndex = clean.indexOf('*');
    if (starIndex !== -1) {
      const payload = clean.substring(1, starIndex);
      const expectedChecksumHex = clean.substring(starIndex + 1, starIndex + 3);
      let calculatedChecksum = 0;
      for (let i = 0; i < payload.length; i++) {
        calculatedChecksum ^= payload.charCodeAt(i);
      }
      const actualHex = calculatedChecksum.toString(16).toUpperCase().padStart(2, '0');
      if (actualHex !== expectedChecksumHex.toUpperCase()) {
        this.stats.checksumRejected++;
        return; // إسقاط الجملة التالفة
      }
    } else {
      // جملة بلا checksum (بعض الأجهزة القديمة) — تُقبل لكن تُسجَّل للمراقبة
      this.stats.noChecksum++;
    }
    this.stats.parsed++;

    const body = clean.slice(1, starIndex !== -1 ? starIndex : clean.length);
    const parts = body.split(',');
    const talkerAndType = parts[0];
    const sentenceType = talkerAndType.slice(-3);

    let updated = false;

    // 2. تحليل جملة RMC (الموقع، السرعة، والاتجاه الأساسي)
    if (sentenceType === 'RMC') {
      const status = parts[2]; // 'A' = Valid, 'V' = Warning/Invalid
      if (status === 'A') {
        const lat = this._nmeaToDecimalLat(parts[3], parts[4]);
        const lon = this._nmeaToDecimalLon(parts[5], parts[6]);
        const speed = parseFloat(parts[7]) || 0.0;
        const cog = parseFloat(parts[8]) || 0.0;

        if (lat !== null && lon !== null) {
          this.vessel.lat = lat;
          this.vessel.lon = lon;
          this.vessel.sog = speed;
          this.vessel.cog = cog;
          if (this.vessel.heading === 0) this.vessel.heading = cog;
          this.vessel.lastFixTime = new Date().toISOString();
          this.vessel.fixQuality = 'GPS Fix Active';
          updated = true;
        }
      } else {
        this.vessel.fixQuality = 'No GPS Fix (Status V)';
      }
    }

    // 3. تحليل جملة GGA (جودة الإشارة والأقمار الصناعية والارتفاع)
    else if (sentenceType === 'GGA') {
      const fixQual = parseInt(parts[6], 10) || 0;
      const sats = parseInt(parts[7], 10) || 0;
      const hdop = parseFloat(parts[8]) || null;

      this.vessel.satellites = sats;
      this.vessel.hdop = hdop;

      if (fixQual > 0) {
        const lat = this._nmeaToDecimalLat(parts[2], parts[3]);
        const lon = this._nmeaToDecimalLon(parts[4], parts[5]);
        if (lat !== null && lon !== null) {
          this.vessel.lat = lat;
          this.vessel.lon = lon;
          this.vessel.lastFixTime = new Date().toISOString();
          this.vessel.fixQuality = fixQual === 1 ? 'GPS Standard' : fixQual === 2 ? 'DGPS' : 'RTK Enhanced';
          updated = true;
        }
      }
    }

    // 4. تحليل جملة DBT و DPT (مقياس العمق الصوتي ومستشعر السونار)
    else if (sentenceType === 'DBT') {
      // $SDDBT,depth_feet,f,depth_meters,M,depth_fathoms,F
      const meters = parseFloat(parts[3]);
      if (!isNaN(meters)) {
        this.vessel.depth = meters;
        updated = true;
      }
    } else if (sentenceType === 'DPT') {
      const meters = parseFloat(parts[1]);
      if (!isNaN(meters)) {
        this.vessel.depth = meters;
        updated = true;
      }
    }

    // 5. تحليل جملة MWV (مستشعر اتجاه وسرعة الرياح)
    else if (sentenceType === 'MWV') {
      // $WIMWV,wind_angle,R,wind_speed,N,A
      const angle = parseFloat(parts[1]);
      let speed = parseFloat(parts[3]);
      const unit = parts[4]; // N = Knots, K = km/h, M = m/s
      const valid = parts[5];

      if (valid === 'A' && !isNaN(angle) && !isNaN(speed)) {
        if (unit === 'K')
          speed = speed * 0.539957; // km/h to knots
        else if (unit === 'M') speed = speed * 1.94384; // m/s to knots

        this.vessel.windAngle = angle;
        this.vessel.windSpeed = speed;
        updated = true;
      }
    }

    // 6. تحليل جملة HDT و HDG (البوصلة الجيروسكوبية الحقيقية والمغناطيسية)
    else if (sentenceType === 'HDT') {
      const hdg = parseFloat(parts[1]);
      if (!isNaN(hdg)) {
        this.vessel.heading = hdg;
        updated = true;
      }
    } else if (sentenceType === 'HDG') {
      const hdg = parseFloat(parts[1]);
      if (!isNaN(hdg)) {
        this.vessel.heading = hdg;
        updated = true;
      }
    }

    // 7. فك شفرة رسائل الـ AIS الحقيقية (!AIVDM و !AIVDO)
    else if (talkerAndType.endsWith('VDM') || talkerAndType.endsWith('VDO')) {
      this._parseAISMessage(parts);
      updated = true;
    }

    if (updated) {
      this._emitLiveTelemetry();
    }
  }

  // =================================================================
  // 4. مفكك رسائل AIS الحقيقي (AIVDM 6-bit Binary Payload Decoder)
  // =================================================================

  _parseAISMessage(parts) {
    // !AIVDM,count,fragment,seq_id,channel,payload,fill_bits*checksum
    if (parts.length < 6) return;

    const count = parseInt(parts[1], 10);
    const fragment = parseInt(parts[2], 10);
    const seqId = parts[3] || 'default';
    const payload = parts[5];
    const fillBits = parseInt(parts[6] || '0', 10);

    let fullPayload = payload;

    // معالجة الرسائل متعددة الأجزاء (Multipart)
    if (count > 1) {
      if (!this.aisMultipartCache.has(seqId)) {
        // حد أقصى للذاكرة: إزاحة أقدم مجموعة عند الاكتظاظ
        if (this.aisMultipartCache.size >= this.maxMultipartEntries) {
          const oldestKey = this.aisMultipartCache.keys().next().value;
          this.aisMultipartCache.delete(oldestKey);
        }
        this.aisMultipartCache.set(seqId, []);
      }
      const frags = this.aisMultipartCache.get(seqId);
      frags[fragment - 1] = payload;

      if (frags.length === count && !frags.includes(undefined)) {
        fullPayload = frags.join('');
        this.aisMultipartCache.delete(seqId);
      } else {
        return; // في انتظار بقية الأجزاء
      }
    }
    this.stats.aisMessages++;

    // تحويل الـ Armored ASCII إلى شريط بايتات ثنائي 6-Bit Binary String
    const bitString = this._payloadToBitString(fullPayload, fillBits);
    if (bitString.length < 38) return;

    const msgType = this._getIntFromBits(bitString, 0, 6);
    const mmsi = String(this._getIntFromBits(bitString, 8, 30));

    // الرسائل من النوع 1 و 2 و 3 (تقارير الموقع للسفن Class A Position Report)
    if (msgType === 1 || msgType === 2 || msgType === 3) {
      if (bitString.length < 168) return;

      const sogRaw = this._getIntFromBits(bitString, 50, 10);
      const sog = sogRaw === 1023 ? 0.0 : sogRaw / 10.0;

      const lonRaw = this._getSignedIntFromBits(bitString, 61, 28);
      const latRaw = this._getSignedIntFromBits(bitString, 89, 27);

      const lon = lonRaw / 600000.0;
      const lat = latRaw / 600000.0;

      const cogRaw = this._getIntFromBits(bitString, 116, 12);
      const cog = cogRaw === 3600 ? 0.0 : cogRaw / 10.0;

      const hdgRaw = this._getIntFromBits(bitString, 128, 9);
      const heading = hdgRaw === 511 ? cog : hdgRaw;

      if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        let target = this.aisTargetsMap.get(mmsi);
        if (!target) {
          // حماية من النمو غير المحدود للخريطة
          if (this.aisTargetsMap.size >= this.maxTargets) {
            const oldestMmsi = this.aisTargetsMap.keys().next().value;
            this.aisTargetsMap.delete(oldestMmsi);
          }
          target = {
            mmsi,
            name: `MMSI ${mmsi}`,
            callsign: '',
            type: 'Vessel',
            length: 0,
            draft: 0
          };
        }

        target.lat = lat;
        target.lon = lon;
        target.sog = sog;
        target.cog = cog;
        target.heading = heading;
        target.lastSeen = Date.now();

        // حساب مصفوفة CPA و TCPA إن كان موقع سفينتنا معروفاً
        if (this.vessel.lat !== null && this.vessel.lon !== null) {
          const dist = this._calculateDistanceNM(this.vessel.lat, this.vessel.lon, target.lat, target.lon);
          const cpaResult = this._calculateCPA(this.vessel, target);
          target.distance = +dist.toFixed(2);
          target.cpa = +cpaResult.cpa.toFixed(2);
          target.tcpa = +cpaResult.tcpa.toFixed(1);

          if (target.cpa < 1.0 && target.tcpa > 0 && target.tcpa < 15) target.status = 'DANGER';
          else if (target.cpa < 2.0 && target.tcpa > 0 && target.tcpa < 30) target.status = 'WARNING';
          else target.status = 'SAFE';
        }

        this.aisTargetsMap.set(mmsi, target);
      }
    }

    // الرسالة من النوع 5 (بيانات السفينة الثابتة واسمها: Static and Voyage Data)
    else if (msgType === 5) {
      if (bitString.length < 420) return;

      const callsign = this._getTextFromBits(bitString, 70, 42).trim();
      const vesselName = this._getTextFromBits(bitString, 112, 120).trim();

      // قد تصل البيانات الثابتة (نوع 5) قبل تقرير الموقع (نوع 1/2/3) —
      // ننشئ هدفاً مؤقتاً حتى لا تُهدر بيانات الاسم والنداء
      let target = this.aisTargetsMap.get(mmsi);
      if (!target) {
        target = {
          mmsi,
          name: `MMSI ${mmsi}`,
          callsign: '',
          type: 'Vessel',
          length: 0,
          draft: 0,
          lastSeen: Date.now()
        };
        this.aisTargetsMap.set(mmsi, target);
      }
      if (vesselName) target.name = vesselName;
      if (callsign) target.callsign = callsign;
    }
  }

  /**
   * تحويل أحرف الـ ASCII المرمزة إلى شريط بتات ثنائي
   */
  _payloadToBitString(payload, fillBits) {
    let bits = '';
    for (let i = 0; i < payload.length; i++) {
      let code = payload.charCodeAt(i) - 48;
      if (code > 40) code -= 8;
      bits += (code & 0x3f).toString(2).padStart(6, '0');
    }
    if (fillBits > 0) {
      bits = bits.slice(0, bits.length - fillBits);
    }
    return bits;
  }

  _getIntFromBits(bits, start, len) {
    return parseInt(bits.substring(start, start + len), 2) || 0;
  }

  _getSignedIntFromBits(bits, start, len) {
    const sub = bits.substring(start, start + len);
    let val = parseInt(sub, 2) || 0;
    if (sub[0] === '1') {
      val -= Math.pow(2, len);
    }
    return val;
  }

  _getTextFromBits(bits, start, len) {
    let str = '';
    for (let i = start; i < start + len; i += 6) {
      let code = this._getIntFromBits(bits, i, 6);
      if (code < 32) code += 64;
      if (code !== 64) str += String.fromCharCode(code);
    }
    return str.replace(/@+$/, '').trim();
  }

  /**
   * حذف أهداف الـ AIS التي انقطعت إشارتها لأكثر من 6 دقائق
   */
  _cleanupStaleAISTargets() {
    const now = Date.now();
    const staleThreshold = 6 * 60 * 1000;
    for (const [mmsi, target] of this.aisTargetsMap.entries()) {
      if (target.lastSeen && now - target.lastSeen > staleThreshold) {
        this.aisTargetsMap.delete(mmsi);
      }
    }
  }

  // =================================================================
  // 5. محاكي الإبحار الاختياري (متاح فقط عند طلب المستخدم الصريح)
  // =================================================================

  startSimulation() {
    if (this.isSimulating) return;
    this.isSimulating = true;
    this.vessel.connectionStatus = 'Simulation Mode Active';
    this.vessel.source = 'Internal Simulator';

    // موقع بداية واقعي في البحر الأحمر
    if (this.vessel.lat === null || this.vessel.lon === null) {
      this.vessel.lat = 27.834;
      this.vessel.lon = 34.321;
      this.vessel.sog = 12.0;
      this.vessel.cog = 195.0;
      this.vessel.heading = 195.0;
      this.vessel.depth = 42.0;
      this.vessel.windSpeed = 14.0;
      this.vessel.windAngle = 35.0;
      this.vessel.fixQuality = 'Simulation Active';
    }

    this.simulationTimer = setInterval(() => {
      this._updateSimulationTick();
    }, 1000);

    this.emit('connection_status', { connected: true, source: 'Simulator' });
  }

  stopSimulation() {
    if (!this.isSimulating) return;
    this.isSimulating = false;
    clearInterval(this.simulationTimer);
    this.simulationTimer = null;
    this.vessel.connectionStatus = 'Disconnected';
    this.vessel.source = 'None';
    this.emit('connection_status', { connected: false });
  }

  controlVessel(controls) {
    if (controls.rudder !== undefined) this.vessel.rudder = Math.max(-30, Math.min(30, controls.rudder));
    if (controls.sog !== undefined) this.vessel.sog = Math.max(0, Math.min(45, controls.sog));
    if (controls.heading !== undefined) this.vessel.heading = (controls.heading + 360) % 360;
  }

  _updateSimulationTick() {
    if (Math.abs(this.vessel.rudder || 0) > 0.1) {
      this.vessel.heading = (this.vessel.heading + this.vessel.rudder * 0.15 + 360) % 360;
      this.vessel.cog = this.vessel.heading;
    }

    const speedKnots = this.vessel.sog;
    const distanceNm = speedKnots / 3600;
    const radHeading = (this.vessel.heading * Math.PI) / 180;

    const deltaLat = (distanceNm * Math.cos(radHeading)) / 60;
    const deltaLon = (distanceNm * Math.sin(radHeading)) / (60 * Math.cos((this.vessel.lat * Math.PI) / 180));

    this.vessel.lat += deltaLat;
    this.vessel.lon += deltaLon;

    this._emitLiveTelemetry();
  }

  // =================================================================
  // 6. بث القياسات اللحظية وحسابات الأمان
  // =================================================================

  _emitLiveTelemetry() {
    const targets = Array.from(this.aisTargetsMap.values());

    let anchorAlert = false;
    let anchorDriftMeters = 0;
    if (this.vessel.anchorWatch && this.vessel.anchorPos && this.vessel.lat && this.vessel.lon) {
      anchorDriftMeters = this._calculateDistanceMeters(
        this.vessel.lat,
        this.vessel.lon,
        this.vessel.anchorPos.lat,
        this.vessel.anchorPos.lon
      );
      if (anchorDriftMeters > this.vessel.anchorRadius) {
        anchorAlert = true;
      }
    }

    const payload = {
      timestamp: Date.now(),
      vessel: { ...this.vessel },
      aisTargets: targets,
      anchorStatus: {
        active: this.vessel.anchorWatch,
        driftMeters: Math.round(anchorDriftMeters),
        radius: this.vessel.anchorRadius,
        alarm: anchorAlert
      }
    };

    this.emit('telemetry', payload);
  }

  toggleAnchorWatch(enabled, radiusMeters = 50) {
    this.vessel.anchorWatch = enabled;
    this.vessel.anchorRadius = radiusMeters;
    if (enabled && this.vessel.lat && this.vessel.lon) {
      this.vessel.anchorPos = { lat: this.vessel.lat, lon: this.vessel.lon };
    } else {
      this.vessel.anchorPos = null;
    }
    return { active: this.vessel.anchorWatch, pos: this.vessel.anchorPos, radius: this.vessel.anchorRadius };
  }

  triggerMOB() {
    this.vessel.mobActive = true;
    this.vessel.mobPos = {
      lat: this.vessel.lat || 0,
      lon: this.vessel.lon || 0,
      time: new Date().toLocaleTimeString('ar-EG')
    };
    this.emit('mob_alarm', this.vessel.mobPos);
    return this.vessel.mobPos;
  }

  clearMOB() {
    this.vessel.mobActive = false;
    this.vessel.mobPos = null;
    return false;
  }

  _nmeaToDecimalLat(degMin, hemisphere) {
    if (!degMin || !hemisphere) return null;
    const deg = parseFloat(degMin.substring(0, 2));
    const min = parseFloat(degMin.substring(2));
    let dec = deg + min / 60.0;
    if (hemisphere.toUpperCase() === 'S') dec = -dec;
    return dec;
  }

  _nmeaToDecimalLon(degMin, hemisphere) {
    if (!degMin || !hemisphere) return null;
    const deg = parseFloat(degMin.substring(0, 3));
    const min = parseFloat(degMin.substring(3));
    let dec = deg + min / 60.0;
    if (hemisphere.toUpperCase() === 'W') dec = -dec;
    return dec;
  }

  _calculateDistanceNM(lat1, lon1, lat2, lon2) {
    const R = 3440.065;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  _calculateDistanceMeters(lat1, lon1, lat2, lon2) {
    return this._calculateDistanceNM(lat1, lon1, lat2, lon2) * 1852;
  }

  _calculateCPA(v1, v2) {
    const rx = (v2.lon - v1.lon) * 60 * Math.cos((v1.lat * Math.PI) / 180);
    const ry = (v2.lat - v1.lat) * 60;

    const v1x = (v1.sog || 0) * Math.sin(((v1.cog || 0) * Math.PI) / 180);
    const v1y = (v1.sog || 0) * Math.cos(((v1.cog || 0) * Math.PI) / 180);

    const v2x = (v2.sog || 0) * Math.sin(((v2.cog || 0) * Math.PI) / 180);
    const v2y = (v2.sog || 0) * Math.cos(((v2.cog || 0) * Math.PI) / 180);

    const vx = v2x - v1x;
    const vy = v2y - v1y;

    const vSq = vx * vx + vy * vy;
    if (vSq < 0.001) {
      return { cpa: Math.sqrt(rx * rx + ry * ry), tcpa: 0 };
    }

    const t = -(rx * vx + ry * vy) / vSq;
    const tcpaMinutes = t * 60;

    let cpaDist = 0;
    if (t < 0) {
      cpaDist = Math.sqrt(rx * rx + ry * ry);
    } else {
      const cpaX = rx + vx * t;
      const cpaY = ry + vy * t;
      cpaDist = Math.sqrt(cpaX * cpaX + cpaY * cpaY);
    }

    return { cpa: cpaDist, tcpa: tcpaMinutes };
  }
}

module.exports = NMEAService;
