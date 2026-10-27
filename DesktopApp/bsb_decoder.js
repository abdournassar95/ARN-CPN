/**
 * ARN Marine Navigator - BSB / KAP Nautical Chart Decoder
 * شركة ARN Technology - تطوير وبرمجة: عبده رجب نصار
 *
 * مفسر خرائط BSB/KAP الكامل:
 *  1) قراءة الترويسة النصية (الإسقاط، نقاط المعايرة REF، الأبعاد RA، لوحة RGB).
 *  2) فك ضغط الصورة النقطية RLE متعدد المستويات (Bitplane RLE) وفق صيغة BSB.
 *  3) ترميز PNG محلي صرف (zlib + CRC) دون أي اعتمادية خارجية.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

class BSBDecoder {
  constructor(chartPath) {
    if (!fs.existsSync(chartPath)) {
      throw new Error(`ملف الخريطة غير موجود: ${chartPath}`);
    }
    this.chartPath = chartPath;
    this.dir = path.dirname(chartPath);
    this.ext = path.extname(chartPath).toLowerCase();

    this.header = this._parseHeader(chartPath);
    this._image = null; // نتيجة فك الصورة مخبأة عند الطلب
  }

  /**
   * قراءة وتفسير ترويسة ملف BSB أو KAP
   */
  _parseHeader(filePath) {
    const fd = fs.openSync(filePath, 'r');
    try {
      // الترويسة عادة أقل من 32KB؛ نوسع القراءة إن لزم حتى نجد فاصل 0x1A
      let buf = Buffer.alloc(32768);
      let bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
      let termIdx = buf.subarray(0, bytesRead).indexOf(0x1a);

      if (termIdx === -1 && bytesRead === buf.length) {
        // توسيع حتى 256KB في الترويسات الطويلة
        const big = Buffer.alloc(262144);
        bytesRead = fs.readSync(fd, big, 0, big.length, 0);
        termIdx = big.subarray(0, bytesRead).indexOf(0x1a);
        buf = big;
      }

      const headerBytes = termIdx >= 0 ? buf.subarray(0, termIdx) : buf.subarray(0, bytesRead);
      const content = headerBytes.toString('latin1');
      const lines = content.split(/\r?\n/);

      const info = {
        name: path.basename(filePath, path.extname(filePath)),
        number: '',
        width: 0,
        height: 0,
        bitDepth: 0,
        palette: [],
        scale: '1:50,000',
        scaleVal: 50000,
        datum: 'WGS84',
        projection: 'MERCATOR',
        refLat: 0.0,
        refLon: 0.0,
        kapFile: '',
        calibrationPoints: [],
        neatline: [],
        rasterOffset: termIdx >= 0 ? termIdx + 1 : bytesRead,
        bounds: null
      };

      let minLon = 180,
        maxLon = -180,
        minLat = 90,
        maxLat = -90;

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith('!')) continue;

        // اسم الخريطة
        if (line.includes('BSB/NA=')) {
          const match = line.match(/BSB\/NA=([^,]+)/);
          if (match) info.name = match[1].trim();
        } else if (line.startsWith('NA=')) {
          info.name = line.substring(3).trim();
        }

        // رقم الخريطة
        if (line.includes('NU=')) {
          const match = line.match(/NU=([0-9A-Za-z_-]+)/);
          if (match) info.number = match[1].trim();
        }

        // المقياس
        if (line.includes('KNP/') && line.includes('SC=')) {
          const match = line.match(/SC=([0-9]+)/);
          if (match) {
            info.scaleVal = parseInt(match[1], 10);
            info.scale = '1:' + info.scaleVal.toLocaleString('en-US');
          }
        } else if (line.startsWith('SK=')) {
          info.scaleVal = parseInt(line.substring(3), 10) || 50000;
          info.scale = '1:' + info.scaleVal.toLocaleString('en-US');
        }

        // المسند الجيوديسي
        if (line.includes('GD=')) {
          const match = line.match(/GD=([^,]+)/);
          if (match) info.datum = match[1].trim();
        }

        // عمق البتات IFI
        if (line.startsWith('IFI=')) {
          info.bitDepth = parseInt(line.substring(4), 10) || 0;
        }

        // أبعاد الصورة RA=cols,rows
        if (line.includes('RA=')) {
          const match = line.match(/RA=([0-9]+),([0-9]+)/);
          if (match) {
            info.width = parseInt(match[1], 10);
            info.height = parseInt(match[2], 10);
          }
        }

        // لوحة الألوان RGB=rrr,ggg,bbb,
        if (line.startsWith('RGB=')) {
          const parts = line.substring(4).split(',');
          if (parts.length >= 3) {
            info.palette.push({
              r: parseInt(parts[0], 10) || 0,
              g: parseInt(parts[1], 10) || 0,
              b: parseInt(parts[2], 10) || 0
            });
          }
        }

        // حدود الخريطة PLY
        if (line.startsWith('PLY/') || line.startsWith('PLY=')) {
          const parts = line.substring(4).split(',');
          if (parts.length >= 3) {
            const lat = parseFloat(parts[1]);
            const lon = parseFloat(parts[2]);
            if (!isNaN(lat) && !isNaN(lon)) {
              info.neatline.push([lat, lon]);
              minLat = Math.min(minLat, lat);
              maxLat = Math.max(maxLat, lat);
              minLon = Math.min(minLon, lon);
              maxLon = Math.max(maxLon, lon);
            }
          }
        }

        // نقاط المعايرة REF/n,px,py,lat,lon,...
        if (line.startsWith('REF/') || line.startsWith('CP=')) {
          const parts = line.substring(4).split(',');
          if (parts.length >= 5) {
            const pixelX = parseFloat(parts[1]);
            const pixelY = parseFloat(parts[2]);
            const lat = parseFloat(parts[3]);
            const lon = parseFloat(parts[4]);
            if (!isNaN(lat) && !isNaN(lon) && !isNaN(pixelX) && !isNaN(pixelY)) {
              info.calibrationPoints.push({ pixelX, pixelY, lat, lon });
              minLat = Math.min(minLat, lat);
              maxLat = Math.max(maxLat, lat);
              minLon = Math.min(minLon, lon);
              maxLon = Math.max(maxLon, lon);
            }
          }
        }
      }

      if (minLon <= maxLon && minLat <= maxLat) {
        info.bounds = [minLon, minLat, maxLon, maxLat];
      }
      return info;
    } finally {
      fs.closeSync(fd);
    }
  }

  /**
   * فك الصورة النقطية RLE متعددة المستويات.
   * يُرجع { width, height, rgba: Buffer, palette }
   */
  decodeImage() {
    if (this._image) return this._image;

    const h = this.header;
    if (!h.width || !h.height) {
      throw new Error('أبعاد الصورة غير معروفة (RA= مفقود في الترويسة).');
    }
    if (!h.bitDepth || h.palette.length === 0) {
      throw new Error('عمق الألوان أو لوحة RGB غير متوفرة في ملف KAP.');
    }

    const buffer = fs.readFileSync(this.chartPath);
    const raster = buffer.subarray(h.rasterOffset);
    const nPlanes = Math.ceil(Math.log2(Math.max(2, h.palette.length)));
    const width = h.width;
    const height = h.height;

    // مصفوفة مؤشرات الألوان لكل بكسل
    const indices = new Uint8Array(width * height);
    let cursor = 0;

    for (let plane = 0; plane < nPlanes; plane++) {
      let rowsDecoded = 0;
      while (rowsDecoded < height && cursor < raster.length) {
        // 1) رقم الصف (1-2 بايت)
        const b1 = raster[cursor++];
        if (b1 & 0x80) {
          const b2 = raster[cursor++] || 0;
          // row = ((b1 & 0x7f) << 7) | (b2 & 0x7f) — 1-based
          // نتجاهل الرقم فعلياً ونعتمد الترتيب التسلسلي مع السماح بإعادة الإرسال
          void (((b1 & 0x7f) << 7) | (b2 & 0x7f));
        }

        // 2) سلسلة أشواط RLE حتى بايت 0x00
        let x = 0;
        let bit = 0;
        while (cursor < raster.length) {
          let run = raster[cursor++];
          if (run === 0) break; // نهاية الصف
          if (run & 0x80) {
            // طول ممتد ببايتين
            const b2 = raster[cursor++] || 0;
            run = ((run & 0x7f) << 7) | (b2 & 0x7f);
          }
          const value = bit & 1;
          const end = Math.min(width, x + run);
          if (value === 1) {
            const shift = nPlanes - 1 - plane;
            for (let i = x; i < end; i++) {
              indices[rowsDecoded * width + i] |= 1 << shift;
            }
          }
          x = end;
          bit++;
        }
        rowsDecoded++;
      }
    }

    // بناء مصفوفة RGBA من اللوحة
    const rgba = Buffer.alloc(width * height * 4);
    for (let i = 0; i < indices.length; i++) {
      const color = h.palette[indices[i]] || { r: 0, g: 0, b: 0 };
      const o = i * 4;
      rgba[o] = color.r;
      rgba[o + 1] = color.g;
      rgba[o + 2] = color.b;
      rgba[o + 3] = 255;
    }

    this._image = { width, height, rgba, palette: h.palette };
    return this._image;
  }

  /**
   * ترميز الصورة المفكوكة كـ DataURL بصيغة PNG (RGBA، 8-bit)
   */
  getImageDataURL() {
    const image = this.decodeImage();
    const png = BSBDecoder.encodePNG(image.rgba, image.width, image.height);
    return `data:image/png;base64,${png.toString('base64')}`;
  }

  /**
   * منشئ PNG أدنوي صرف: IHDR + IDAT (zlib) + IEND مع CRC32
   */
  static encodePNG(rgba, width, height) {
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // color type RGBA
    ihdr[10] = 0; // compression
    ihdr[11] = 0; // filter
    ihdr[12] = 0; // interlace

    // كل سطر مسح يسبقه بايت فلتر (0 = None)
    const raw = Buffer.alloc((width * 4 + 1) * height);
    for (let y = 0; y < height; y++) {
      const rowStart = y * (width * 4 + 1);
      raw[rowStart] = 0;
      rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
    }
    const idatData = zlib.deflateSync(raw, { level: 6 });

    return Buffer.concat([
      signature,
      BSBDecoder._pngChunk('IHDR', ihdr),
      BSBDecoder._pngChunk('IDAT', idatData),
      BSBDecoder._pngChunk('IEND', Buffer.alloc(0))
    ]);
  }

  static _pngChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(BSBDecoder._crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  static _crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i];
      for (let k = 0; k < 8; k++) {
        crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
      }
    }
    return crc ^ 0xffffffff;
  }

  /**
   * ملخص الخريطة للواجهة (بيانات الترويسة فقط)
   */
  toMetadata() {
    return {
      id: Buffer.from(this.chartPath).toString('base64').slice(-16),
      type: this.ext === '.bsb' ? 'BSB' : 'KAP',
      title: this.header.name || path.basename(this.chartPath),
      chartNumber: this.header.number,
      scale: this.header.scale,
      datum: this.header.datum,
      projection: this.header.projection,
      width: this.header.width,
      height: this.header.height,
      bitDepth: this.header.bitDepth,
      hasPalette: this.header.palette.length > 0,
      calibrationPoints: this.header.calibrationPoints,
      bounds: this.header.bounds,
      neatline: this.header.neatline,
      path: this.chartPath
    };
  }
}

module.exports = BSBDecoder;
