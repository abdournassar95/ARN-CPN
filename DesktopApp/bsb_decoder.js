/**
 * ARN Marine Navigator - BSB / KAP Nautical Chart Decoder
 * شركة ARN Technology - تطوير وبرمجة: عبده رجب نصار
 * مفسر خرائط الملاحة النقطية الرسمية بصيغة BSB و KAP
 */

const fs = require('fs');
const path = require('path');

class BSBDecoder {
  constructor(chartPath) {
    if (!fs.existsSync(chartPath)) {
      throw new Error(`ملف الخريطة غير موجود: ${chartPath}`);
    }
    this.chartPath = chartPath;
    this.dir = path.dirname(chartPath);
    this.ext = path.extname(chartPath).toLowerCase();
    this.header = this._parseHeader(chartPath);
  }

  /**
   * قراءة وتفسير ترويسة ملف BSB أو KAP
   */
  _parseHeader(filePath) {
    const fd = fs.openSync(filePath, 'r');
    // ترويسة KAP/BSB تكون في أول 16 إلى 32 كيلوبايت
    const buf = Buffer.alloc(32768);
    const bytesRead = fs.readSync(fd, buf, 0, 32768, 0);
    fs.closeSync(fd);

    const content = buf.toString('ascii', 0, bytesRead);
    const lines = content.split(/\r?\n/);

    const info = {
      name: path.basename(filePath, path.extname(filePath)),
      number: '',
      width: 0,
      height: 0,
      scale: '1:50,000',
      scaleVal: 50000,
      datum: 'WGS84',
      projection: 'MERCATOR',
      refLat: 0.0,
      refLon: 0.0,
      kapFile: '',
      calibrationPoints: [],
      neatline: [],
      bounds: null
    };

    let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('!')) continue;

      // 1. اسم الخريطة NA
      if (line.includes('BSB/NA=')) {
        const match = line.match(/BSB\/NA=([^,]+)/);
        if (match) info.name = match[1].trim();
      } else if (line.startsWith('NA=')) {
        info.name = line.substring(3).trim();
      }

      // 2. رقم الخريطة NU
      if (line.includes('NU=')) {
        const match = line.match(/NU=([0-9A-Za-z_-]+)/);
        if (match) info.number = match[1].trim();
      }

      // 3. المقياس KNP/SC= أو SK=
      if (line.includes('KNP/') && line.includes('SC=')) {
        const match = line.match(/SC=([0-9]+)/);
        if (match) {
          info.scaleVal = parseInt(match[1], 10);
          info.scale = '1:' + info.scaleVal.toLocaleString();
        }
      } else if (line.startsWith('SK=')) {
        info.scaleVal = parseInt(line.substring(3), 10) || 50000;
        info.scale = '1:' + info.scaleVal.toLocaleString();
      }

      // 4. المسند الجيوديسي GD
      if (line.includes('GD=')) {
        const match = line.match(/GD=([^,]+)/);
        if (match) info.datum = match[1].trim();
      }

      // 5. الأبعاد بالبكسل RA
      if (line.includes('RA=')) {
        const match = line.match(/RA=([0-9]+),([0-9]+)/);
        if (match) {
          info.width = parseInt(match[1], 10);
          info.height = parseInt(match[2], 10);
        }
      }

      // 6. حدود الخريطة الدقيقة PLY (Neatline)
      // مثال: PLY/1,45.3267,36.6067 أو PLY=1,45.3267,36.6067
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

      // 7. نقاط المعايرة الجغرافية REF أو CP
      if (line.startsWith('REF/') || line.startsWith('CP=')) {
        const parts = line.substring(4).split(',');
        if (parts.length >= 5) {
          const lat = parseFloat(parts[3]);
          const lon = parseFloat(parts[4]);
          if (!isNaN(lat) && !isNaN(lon)) {
            info.calibrationPoints.push({
              pixelX: parseFloat(parts[1]),
              pixelY: parseFloat(parts[2]),
              lat,
              lon
            });
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
  }

  /**
   * تصدير ملخص الخريطة النقطية للواجهة
   */
  toMetadata() {
    return {
      id: Buffer.from(this.chartPath).toString('base64').slice(-16),
      type: this.ext === '.bsb' ? 'BSB' : 'KAP',
      title: this.header.name || path.basename(this.chartPath),
      chartNumber: this.header.number,
      scale: this.header.scale,
      datum: this.header.datum,
      bounds: this.header.bounds,
      neatline: this.header.neatline,
      path: this.chartPath
    };
  }
}

module.exports = BSBDecoder;
