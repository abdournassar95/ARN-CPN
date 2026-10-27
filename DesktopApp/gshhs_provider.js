/**
 * ARN Marine Navigator - Global Offline Coastline & Shoreline Provider
 * شركة ARN Technology - تطوير وبرمجة: عبده رجب نصار
 * مزود خطوط السواحل والشواطئ البحرية العالمية الحقيقية بنظام GSHHS الأصلي (100% Offline)
 */

const fs = require('fs');
const path = require('path');

class GSHHSProvider {
  constructor(dataPath) {
    this.dataPath = dataPath || path.join(__dirname, '..', 'data', 'gshhs', 'poly-c-1.dat');
    this.isReady = false;
    this.fd = null;
    this.cellCache = new Map();
    this.maxCachedCells = 512; // حد لحماية الذاكرة (إزاحة LRU)

    this._initReader();
  }

  _initReader() {
    try {
      if (!fs.existsSync(this.dataPath)) {
        console.warn('[GSHHS] File not found:', this.dataPath);
        return;
      }

      this.fd = fs.openSync(this.dataPath, 'r');
      const headerBuf = Buffer.alloc(28);
      fs.readSync(this.fd, headerBuf, 0, 28, 0);

      this.magic = headerBuf.readInt32LE(0);
      this.res = headerBuf.readInt32LE(4);
      this.ver = headerBuf.readInt32LE(8);
      this.minX = headerBuf.readInt32LE(12);
      this.minY = headerBuf.readInt32LE(16);
      this.maxX = headerBuf.readInt32LE(20);
      this.maxY = headerBuf.readInt32LE(24);

      this.dx = this.maxX - this.minX; // 360
      this.dy = this.maxY - this.minY; // 180

      const tableSize = this.dx * this.dy * 4;
      const tableBuf = Buffer.alloc(tableSize);
      fs.readSync(this.fd, tableBuf, 0, tableSize, 28);
      this.offsets = new Int32Array(tableBuf.buffer, tableBuf.byteOffset, this.dx * this.dy);

      this.isReady = true;
      console.log(`[GSHHS] Successfully loaded binary database: ${this.dx}x${this.dy} cells.`);
    } catch (err) {
      console.error('[GSHHS] Initialization error:', err.message);
    }
  }

  /**
   * قراءة إحداثيات Double بنظام Word-Swapped المستخدم في GSHHS OpenCPN
   */
  _readWordSwappedDouble(buf, offset) {
    const swap = Buffer.alloc(8);
    buf.copy(swap, 0, offset + 4, offset + 8);
    buf.copy(swap, 4, offset + 0, offset + 4);
    return swap.readDoubleLE(0) / 1e6;
  }

  /**
   * استخراج مضلعات خلية جغرافية 1° × 1° محددة
   */
  getPolygonsForCell(x, y) {
    if (!this.isReady || !this.fd) return [];
    if (x < 0 || x >= this.dx || y < 0 || y >= this.dy) return [];

    const cellKey = `${x}_${y}`;
    if (this.cellCache.has(cellKey)) {
      return this.cellCache.get(cellKey);
    }

    const idx = x * this.dy + y;
    const offset = this.offsets[idx];

    // إذا كانت القيمة أقل من بداية المضلعات فهي مجرد كود نوع (1 = محيط، 2 = يابسة كاملة)
    if (offset < 259248) {
      this.cellCache.set(cellKey, []);
      return [];
    }

    const polys = [];
    let curOffset = offset;
    const hdr = Buffer.alloc(16);
    const swap = Buffer.alloc(8);

    try {
      while (true) {
        fs.readSync(this.fd, hdr, 0, 16, curOffset);
        const polyType = hdr.readInt32LE(0);
        const npts = hdr.readInt32LE(8);
        if (polyType === 0 || npts <= 0 || npts > 15000) break;

        curOffset += 16;
        const ptBuf = Buffer.alloc(npts * 16);
        fs.readSync(this.fd, ptBuf, 0, ptBuf.length, curOffset);
        curOffset += npts * 16;

        const pts = [];
        for (let i = 0; i < npts; i++) {
          const off = i * 16;
          // Longitude
          ptBuf.copy(swap, 0, off + 4, off + 8);
          ptBuf.copy(swap, 4, off + 0, off + 4);
          let lon = swap.readDoubleLE(0) / 1e6;
          if (lon > 180) lon -= 360; // Normalize [0..360] -> [-180..180]

          // Latitude
          ptBuf.copy(swap, 0, off + 12, off + 16);
          ptBuf.copy(swap, 4, off + 8, off + 12);
          const lat = swap.readDoubleLE(0) / 1e6;

          pts.push([lat, lon]);
        }

        polys.push({
          type: polyType,
          points: pts
        });
      }
    } catch {
      // End of cell or boundary reached
    }

    // إزاحة أقدم خلية عند تجاوز السقف (Map تحتفظ بترتيب الإدراج)
    if (this.cellCache.size >= this.maxCachedCells) {
      const oldestKey = this.cellCache.keys().next().value;
      this.cellCache.delete(oldestKey);
    }
    this.cellCache.set(cellKey, polys);
    return polys;
  }

  /**
   * استخراج كافة خطوط السواحل ضمن نطاق جغرافي محدد [minLon, minLat, maxLon, maxLat]
   */
  getCoastlinesForBounds(minLon, minLat, maxLon, maxLat) {
    if (!this.isReady) return [];

    // تحويل خطوط الطول إلى نطاق 0..360 للبحث في فهرس الخلايا
    let startX = Math.floor(minLon < 0 ? minLon + 360 : minLon);
    let endX = Math.ceil(maxLon < 0 ? maxLon + 360 : maxLon);
    let startY = Math.floor(minLat - this.minY);
    let endY = Math.ceil(maxLat - this.minY);

    startX = Math.max(0, Math.min(this.dx - 1, startX));
    endX = Math.max(0, Math.min(this.dx - 1, endX));
    startY = Math.max(0, Math.min(this.dy - 1, startY));
    endY = Math.max(0, Math.min(this.dy - 1, endY));

    const result = [];
    const handleXRange = (x1, x2) => {
      for (let x = x1; x <= x2; x++) {
        for (let y = startY; y <= endY; y++) {
          const cellPolys = this.getPolygonsForCell(x, y);
          for (const poly of cellPolys) {
            result.push(poly);
          }
        }
      }
    };

    if (startX <= endX) {
      handleXRange(startX, endX);
    } else {
      // يمتد عبر خط التاريخ الدولي (180/-180)
      handleXRange(startX, this.dx - 1);
      handleXRange(0, endX);
    }

    return result;
  }

  close() {
    if (this.fd) {
      try {
        fs.closeSync(this.fd);
      } catch {}
      this.fd = null;
    }
  }
}

module.exports = GSHHSProvider;
