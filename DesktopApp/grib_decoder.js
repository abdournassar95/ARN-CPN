/**
 * ARN Marine Navigator - GRIB1 Offline Weather File Decoder
 * شركة ARN Technology - تطوير وبرمجة: عبده رجب نصار
 *
 * محلل حقيقي لملفات GRIB الإصدار 1 (WMO FM 92-VOL I.2):
 *  - Section 0 مؤشر الملف، Section 1 PDS تعريف المنتج،
 *  - Section 2 GDS شبكة خطوط عرض/طول (Lat/Lon Grid نوع 0)،
 *  - Section 3 BMS خريطة البتات (اختياري)، Section 4 BDS البيانات المضغوطة بسيطاً،
 *  - Section 5 النهاية 7777.
 *
 * GRIB2 غير مدعوم في هذا الإصدار ويُرفض بخطأ صريح بدل أي محاكاة مضللة.
 */

const fs = require('fs');

// مختصر أشهر رموز جدول WMO Table-2 المستخدمة في ملفات الطقس البحري
const WMO_PARAM_TABLE = {
  1: { name: 'PRMSL', label: 'الضغط الجوي عند مستوى سطح البحر', unit: 'Pa' },
  11: { name: 'TMP', label: 'درجة الحرارة', unit: 'K' },
  17: { name: 'ICE', label: 'تركيز الجليد البحري', unit: 'fraction' },
  20: { name: 'RH', label: 'الرطوبة النسبية', unit: '%' },
  33: { name: 'UGRD', label: 'مركبة الرياح الشرقية U', unit: 'm/s' },
  34: { name: 'VGRD', label: 'مركبة الرياح الشمالية V', unit: 'm/s' },
  61: { name: 'HGT', label: 'ارتفاع الجهد الأرضي', unit: 'm' },
  65: { name: 'WATR', label: 'المياه المتراكمة', unit: 'kg/m²' },
  80: { name: 'WAVH', label: 'ارتفاع الموج الكبير', unit: 'm' },
  83: { name: 'WVSP', label: 'ذروة زمن الموج', unit: 's' },
  101: { name: 'SST', label: 'حرارة سطح البحر', unit: 'K' }
};

class GribDecoder {
  /**
   * تحليل ملف GRIB من مسار على القرص
   */
  static parseFile(filePath) {
    const buffer = fs.readFileSync(filePath);
    return GribDecoder.parseBuffer(buffer);
  }

  /**
   * تحليل محتوى GRIB من Buffer. يدعم ملفاً يحتوي عدة رسائل (messages)
   * ويُرجع مصفوفة شبكات مرتبة حسب ظهورها.
   */
  static parseBuffer(buffer) {
    if (!buffer || buffer.length < 8) {
      throw new Error('ملف GRIB فارغ أو تالف.');
    }

    const grids = [];
    let offset = 0;

    while (offset + 8 <= buffer.length) {
      // المؤشر: 'GRIB' + طول محجوزان (3 بايتات) + رقم الإصدار
      if (buffer.toString('ascii', offset, offset + 4) !== 'GRIB') {
        // البحث عن بداية الرسالة التالية عند تجميع عدة رسائل
        const next = buffer.indexOf('GRIB', offset + 1);
        if (next === -1) break;
        offset = next;
        continue;
      }

      const edition = buffer[offset + 7];
      const totalLength = GribDecoder._readUInt24BE(buffer, offset + 4);

      if (edition === 2) {
        throw new Error('صيغة GRIB2 غير مدعومة في هذا الإصدار — يرجى تصدير الملف بصيغة GRIB1.');
      }
      if (edition !== 1) {
        throw new Error(`إصدار GRIB غير مدعوم: ${edition}`);
      }
      if (!totalLength || offset + totalLength > buffer.length) {
        throw new Error('طول رسالة GRIB غير صالح.');
      }

      grids.push(GribDecoder._parseMessage1(buffer, offset, totalLength));
      offset += totalLength;
    }

    if (grids.length === 0) {
      throw new Error('لم يتم العثور على أي رسالة GRIB1 صالحة في الملف.');
    }
    return grids;
  }

  static _parseMessage1(buffer, start, totalLength) {
    let pos = start + 8; // بعد المؤشر
    const end = start + totalLength;

    // ---- Section 1: Product Definition Section (PDS) ----
    // ترتيب القسم: 3 بايت طول + بايت رقم القسم
    if (buffer[pos + 3] !== 1) {
      throw new Error('بنية GRIB1 غير متوقعة: القسم 1 مفقود.');
    }
    const pdsLen = GribDecoder._readUInt24BE(buffer, pos);
    const pds = buffer.subarray(pos, pos + pdsLen);
    const parameterCode = pds[8];
    const levelType = pds[9];
    const levelValue = pds[10];
    const year = pds[24] === 0 ? pds[12] + 1900 : (pds[24] - 1) * 100 + pds[12];
    const month = pds[13];
    const day = pds[14];
    const hour = pds[15];
    const decimalScale = GribDecoder._readInt16BE(pds, 27); // octets 28-29
    const flags = pds[7];
    const hasGDS = !!(flags & 0x80);
    const hasBMS = !!(flags & 0x40);
    pos += pdsLen;

    // ---- Section 2: Grid Description Section (GDS) ----
    let grid = null;
    if (hasGDS) {
      if (buffer[pos + 3] !== 2) {
        throw new Error('بنية GRIB1 غير متوقعة: القسم 2 مفقود رغم الإشارة إليه.');
      }
      const gdsLen = GribDecoder._readUInt24BE(buffer, pos);
      const gds = buffer.subarray(pos, pos + gdsLen);
      grid = GribDecoder._parseLatLonGDS(gds);
      pos += gdsLen;
    } else {
      throw new Error('الملف لا يحتوي وصف شبكة (GDS) — غير مدعوم.');
    }

    // ---- Section 3: Bit Map Section (BMS) اختياري ----
    if (hasBMS) {
      if (buffer[pos + 3] !== 3) {
        throw new Error('بنية GRIB1 غير متوقعة: القسم 3 مفقود رغم الإشارة إليه.');
      }
      const bmsLen = GribDecoder._readUInt24BE(buffer, pos);
      // خريطة بتات بسيطة (قيمة 0) مطلوبة لهذا المحلل
      const bmsIndicator = buffer[pos + 5];
      if (bmsIndicator !== 0) {
        throw new Error('خرائط البتات المعقدة في BMS غير مدعومة.');
      }
      pos += bmsLen;
    }

    // ---- Section 4: Binary Data Section (BDS) ----
    if (buffer[pos + 3] !== 4) {
      throw new Error('بنية GRIB1 غير متوقعة: قسم البيانات 4 مفقود.');
    }
    const bdsLen = GribDecoder._readUInt24BE(buffer, pos);
    const bds = buffer.subarray(pos, pos + bdsLen);

    const bdsFlags = bds[4];
    const isGridPoint = !(bdsFlags & 0x80);
    const isSimplePacking = !(bdsFlags & 0x40);
    const usesIbmFloat = !!(bdsFlags & 0x20);
    if (!isGridPoint || !isSimplePacking) {
      throw new Error('الضغط المعقد أو التوافقيات الكروية في GRIB1 غير مدعومة.');
    }

    const binaryScale = GribDecoder._readInt16BE(bds, 5); // octets 6-7
    const referenceValue = GribDecoder._readIBMFloat(bds, 7); // octets 8-11
    const bitsPerValue = bds[11];
    const dataOffset = 12; // البيانات تبدأ عند octet 13 (مؤشر صفري 12)

    const pointCount = grid.ni * grid.nj;
    const rawValues = GribDecoder._unpackSimpleValues(bds, dataOffset, pointCount, bitsPerValue);

    // إعادة البناء: Y = (R + X · 2^E) · 10^D
    const binFactor = Math.pow(2, binaryScale);
    const decFactor = Math.pow(10, decimalScale);
    const values = new Float64Array(pointCount);
    for (let i = 0; i < pointCount; i++) {
      values[i] = (referenceValue + rawValues[i] * binFactor) * decFactor;
    }

    // تطبيع اتجاه الشبكة إلى شمال→جنوب، غرب→شرق
    const canonical = GribDecoder._canonicalize(values, grid);

    // ---- Section 5: النهاية '7777' ----
    pos += bdsLen;
    if (pos + 4 <= end && buffer.toString('ascii', pos, pos + 4) !== '7777') {
      // متسامح: بعض المولدات تضيف حشواً، لا نفشل القراءة
    }

    const paramInfo = WMO_PARAM_TABLE[parameterCode] || {
      name: `PARAM_${parameterCode}`,
      label: `معامل WMO رقم ${parameterCode}`,
      unit: 'unknown'
    };

    return {
      edition: 1,
      parameterCode,
      parameter: paramInfo.name,
      label: paramInfo.label,
      unit: paramInfo.unit,
      levelType,
      levelValue,
      referenceTime: new Date(Date.UTC(year, month - 1, day, hour)),
      ni: grid.ni,
      nj: grid.nj,
      lat0: grid.lat0,
      lon0: grid.lon0,
      lat1: grid.lat1,
      lon1: grid.lon1,
      dLat: grid.dLat,
      dLon: grid.dLon,
      scanMode: grid.scanMode,
      usesIbmFloat,
      values: canonical
    };
  }

  static _parseLatLonGDS(gds) {
    const representationType = gds[5];
    if (representationType !== 0) {
      throw new Error(`نوع الشبكة ${representationType} غير مدعوم — فقط شبكات Lat/Lon (نوع 0).`);
    }
    const ni = gds.readUInt16BE(6); // octets 7-8
    const nj = gds.readUInt16BE(8); // octets 9-10
    const lat0 = GribDecoder._readInt24BE(gds, 10) / 1000;
    const lon0 = GribDecoder._readInt24BE(gds, 13) / 1000;
    const lat1 = GribDecoder._readInt24BE(gds, 17) / 1000;
    const lon1 = GribDecoder._readInt24BE(gds, 20) / 1000;
    const dLat = GribDecoder._readInt16BE(gds, 23) / 1000;
    const dLon = GribDecoder._readInt16BE(gds, 25) / 1000;
    const scanMode = gds[27];

    return { ni, nj, lat0, lon0, lat1, lon1, dLat: Math.abs(dLat), dLon: Math.abs(dLon), scanMode };
  }

  /**
   * تطبيع اتجاه تخزين الشبكة وفق أعلام وضع المسح (scanMode)
   * الإخراج دائماً: الصف 0 عند lat1 (الشمال)، الأعمدة غرب→شرق
   */
  static _canonicalize(values, grid) {
    const { ni, nj, scanMode } = grid;
    const northToSouth = !(scanMode & 0x80); // البت 1: 0 = الشمال أولاً
    const westToEast = !(scanMode & 0x40); // البت 2: 0 = الغرب أولاً
    if (northToSouth && westToEast) return values;

    const out = new Float64Array(values.length);
    for (let j = 0; j < nj; j++) {
      const srcRow = northToSouth ? j : nj - 1 - j;
      for (let i = 0; i < ni; i++) {
        const srcCol = westToEast ? i : ni - 1 - i;
        out[j * ni + i] = values[srcRow * ni + srcCol];
      }
    }
    return out;
  }

  /**
   * فك قيم بسيطة كل منها bitsPerValue بت، بترتيب MSB أولاً
   */
  static _unpackSimpleValues(buffer, dataOffset, count, bitsPerValue) {
    const values = new Uint32Array(count);
    if (bitsPerValue === 0) return values;

    let bitPos = dataOffset * 8;
    for (let i = 0; i < count; i++) {
      let value = 0;
      for (let b = 0; b < bitsPerValue; b++) {
        const byteIndex = bitPos >> 3;
        const bitIndex = 7 - (bitPos & 7);
        if (byteIndex < buffer.length) {
          value = (value << 1) | ((buffer[byteIndex] >> bitIndex) & 1);
        }
        bitPos++;
      }
      values[i] = value;
    }
    return values;
  }

  /**
   * قراءة قيمة IBM System/360 float (32 بت):
   * إشارة (1) + أس (7، أساس 16، فائض 64) + الجزء العشري (24 بت)
   */
  static _readIBMFloat(buffer, offset) {
    const b0 = buffer[offset];
    const sign = b0 & 0x80 ? -1 : 1;
    const exponent = b0 & 0x7f;
    const mantissa = ((buffer[offset + 1] << 16) >>> 0) + ((buffer[offset + 2] << 8) >>> 0) + buffer[offset + 3];
    if (mantissa === 0 && exponent === 0) return 0;
    return sign * mantissa * Math.pow(16, exponent - 64 - 6);
  }

  static _readUInt24BE(buffer, offset) {
    return (buffer[offset] << 16) | (buffer[offset + 1] << 8) | buffer[offset + 2];
  }

  static _readInt24BE(buffer, offset) {
    const unsigned = GribDecoder._readUInt24BE(buffer, offset);
    return unsigned & 0x800000 ? unsigned - 0x1000000 : unsigned;
  }

  static _readInt16BE(buffer, offset) {
    const unsigned = buffer.readUInt16BE(offset);
    return unsigned & 0x8000 ? unsigned - 0x10000 : unsigned;
  }
}

module.exports = GribDecoder;
