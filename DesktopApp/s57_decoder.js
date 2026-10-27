/**
 * ARN Marine Navigator - S-57 ENC ISO 8211 Binary Vector Chart Parser
 * شركة ARN Technology - تطوير وبرمجة: عبده رجب نصار
 * محلل خرائط المتجهات البحرية الدولية S-57 ENC (.000) الأصلي دون إنترنت (100% Offline)
 */

const fs = require('fs');
const path = require('path');

class S57Decoder {
  constructor(s57DataDir) {
    this.s57DataDir = s57DataDir || path.join(__dirname, '..', 'data', 's57data');
    this.objectClasses = new Map();
    this.attributeCodes = new Map();

    this._loadCatalog();
  }

  _loadCatalog() {
    try {
      // 1. تحميل فهرس أصناف الكائنات S-57
      const objCsvPath = path.join(this.s57DataDir, 's57objectclasses.csv');
      if (fs.existsSync(objCsvPath)) {
        const lines = fs.readFileSync(objCsvPath, 'utf-8').split('\n');
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          // "Code","ObjectClass","Acronym",...
          const parts = line.split(',');
          if (parts.length >= 3) {
            const code = parseInt(parts[0].replace(/"/g, '').trim(), 10);
            const name = parts[1].replace(/"/g, '').trim();
            const acronym = parts[2].replace(/"/g, '').trim();
            if (!isNaN(code) && acronym) {
              this.objectClasses.set(code, { code, name, acronym });
            }
          }
        }
      }

      // 2. تحميل فهرس السمات S-57
      const attrCsvPath = path.join(this.s57DataDir, 's57attributes.csv');
      if (fs.existsSync(attrCsvPath)) {
        const lines = fs.readFileSync(attrCsvPath, 'utf-8').split('\n');
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const parts = line.split(',');
          if (parts.length >= 3) {
            const code = parseInt(parts[0].replace(/"/g, '').trim(), 10);
            const name = parts[1].replace(/"/g, '').trim();
            const acronym = parts[2].replace(/"/g, '').trim();
            if (!isNaN(code) && acronym) {
              this.attributeCodes.set(code, { code, name, acronym });
            }
          }
        }
      }

      console.log(
        `[S-57] Loaded catalog: ${this.objectClasses.size} object classes, ${this.attributeCodes.size} attributes.`
      );
    } catch (err) {
      console.warn('[S-57] Error loading catalog:', err.message);
    }
  }

  /**
   * تحليل ملف S-57 (.000) بالكامل (قراءة متزامنة — للاختبارات)
   */
  parseFile(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    const buf = fs.readFileSync(filePath);
    return this.parseBuffer(buf, filePath);
  }

  /**
   * نسخة غير حاجبة لتحليل ملف S-57 (قراءة غير متزامنة)
   */
  async parseFileAsync(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    const buf = await fs.promises.readFile(filePath);
    return this.parseBuffer(buf, filePath);
  }

  parseBuffer(buf, filePath = 'memory.000') {
    let offset = 0;

    const dspmScale = 50000;
    let comf = 10000000; // الإحداثيات مقسومة على 10,000,000 افتراضياً (1e-7 deg)
    let dsidTitle = path.basename(filePath);
    const dsidEdition = '1';

    // جداول السجلات المتجهة والميزات
    const vectorRecords = new Map(); // RCID -> { type, points: [[lat, lon], ...] }
    const featureRecords = []; // { rcid, objCode, acronym, prim, attributes, spatialRefs }

    const FT = 0x1e; // Field Terminator
    const UT = 0x1f; // Unit Terminator

    // حلقة قراءة سجلات ISO 8211
    while (offset + 24 <= buf.length) {
      // 1. قراءة الـ Leader (24 بايت)
      const recLenStr = buf.toString('ascii', offset, offset + 5);
      const recLen = parseInt(recLenStr, 10);
      if (isNaN(recLen) || recLen < 24 || offset + recLen > buf.length) {
        offset++;
        continue;
      }

      const leaderId = String.fromCharCode(buf[offset + 6]); // 'L' for DDR, 'D' for DR
      const baseAddrStr = buf.toString('ascii', offset + 12, offset + 17);
      const baseAddr = parseInt(baseAddrStr, 10);

      const sizeFieldLength = parseInt(String.fromCharCode(buf[offset + 20]), 10) || 4;
      const sizeFieldPos = parseInt(String.fromCharCode(buf[offset + 21]), 10) || 4;
      const sizeFieldTag = parseInt(String.fromCharCode(buf[offset + 23]), 10) || 4;

      // تجاوز الـ DDR والاكتفاء بقراءة سجلات البيانات DR
      if (leaderId === 'D' && !isNaN(baseAddr) && baseAddr < recLen) {
        // قراءة الفهرس (Directory)
        let dirOffset = offset + 24;
        const dirEnd = offset + baseAddr;
        const entryLen = sizeFieldTag + sizeFieldLength + sizeFieldPos;

        const fields = [];
        while (dirOffset + entryLen <= dirEnd && buf[dirOffset] !== FT) {
          const tag = buf.toString('ascii', dirOffset, dirOffset + sizeFieldTag);
          const fLen = parseInt(
            buf.toString('ascii', dirOffset + sizeFieldTag, dirOffset + sizeFieldTag + sizeFieldLength),
            10
          );
          const fPos = parseInt(
            buf.toString('ascii', dirOffset + sizeFieldTag + sizeFieldLength, dirOffset + entryLen),
            10
          );

          if (!isNaN(fLen) && !isNaN(fPos)) {
            fields.push({ tag, length: fLen, position: fPos });
          }
          dirOffset += entryLen;
        }

        const dataStart = offset + baseAddr;

        // معالجة الحقول
        let curVrid = null;
        let curFrid = null;

        for (const field of fields) {
          const fieldStart = dataStart + field.position;
          const fieldBuf = buf.subarray(fieldStart, fieldStart + field.length);

          // 1. معالجة معلمات الخريطة DSPM
          if (field.tag === 'DSPM') {
            try {
              // COMF و CSCL
              if (fieldBuf.length >= 12) {
                const possibleComf = fieldBuf.readUInt32LE(Math.max(0, fieldBuf.length - 8));
                if (possibleComf >= 1000 && possibleComf <= 100000000) {
                  comf = possibleComf;
                }
              }
            } catch {}
          }

          // 2. معالجة هوية الخريطة DSID
          else if (field.tag === 'DSID') {
            try {
              const text = fieldBuf.toString('ascii');
              const parts = text.split(/\x1F|\x1E/);
              if (parts[0]) dsidTitle = parts[0].replace(/[^a-zA-Z0-9_\-\.]/g, '') || dsidTitle;
            } catch {}
          }

          // 3. معالجة معرّف السجل المتجه VRID
          else if (field.tag === 'VRID') {
            if (fieldBuf.length >= 5) {
              const rcnm = fieldBuf[0]; // 110: VI, 120: VC, 130: VE
              const rcid = fieldBuf.readUInt32LE(1);
              curVrid = { rcnm, rcid, points: [] };
              vectorRecords.set(`${rcnm}_${rcid}`, curVrid);
              vectorRecords.set(rcid, curVrid);
            }
          }

          // 4. معالجة إحداثيات ثنائية الأبعاد SG2D
          else if (field.tag === 'SG2D' && curVrid) {
            // كل نقطة عبارة عن 8 بايت: Int32LE Y (lat), Int32LE X (lon)
            const nCoords = Math.floor(fieldBuf.length / 8);
            for (let c = 0; c < nCoords; c++) {
              const yRaw = fieldBuf.readInt32LE(c * 8);
              const xRaw = fieldBuf.readInt32LE(c * 8 + 4);
              const lat = yRaw / comf;
              const lon = xRaw / comf;
              if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
                curVrid.points.push([lat, lon]);
              }
            }
          }

          // 5. معالجة ميزات الخريطة FRID
          else if (field.tag === 'FRID') {
            if (fieldBuf.length >= 9) {
              const _rcnm = fieldBuf[0];
              const rcid = fieldBuf.readUInt32LE(1);
              const prim = fieldBuf[5]; // 1: Point, 2: Line, 3: Area
              const objCode = fieldBuf.readUInt16LE(7); // OBJL تبدأ من البايت 7 بعد GRUP

              const objInfo = this.objectClasses.get(objCode) || {
                code: objCode,
                name: `Object_${objCode}`,
                acronym: `OBJ_${objCode}`
              };

              curFrid = {
                rcid,
                objCode,
                name: objInfo.name,
                acronym: objInfo.acronym,
                prim,
                attributes: {},
                spatialRefs: []
              };
              featureRecords.push(curFrid);
            }
          }

          // 6. سمات الميزة ATTF
          else if (field.tag === 'ATTF' && curFrid) {
            let aOffset = 0;
            while (aOffset + 2 < fieldBuf.length) {
              const attCode = fieldBuf.readUInt16LE(aOffset);
              aOffset += 2;
              let valEnd = aOffset;
              while (valEnd < fieldBuf.length && fieldBuf[valEnd] !== UT && fieldBuf[valEnd] !== FT) {
                valEnd++;
              }
              const valStr = fieldBuf.toString('ascii', aOffset, valEnd).trim();
              aOffset = valEnd + 1;

              const attrInfo = this.attributeCodes.get(attCode);
              const attrName = attrInfo ? attrInfo.acronym : `ATT_${attCode}`;
              curFrid.attributes[attrName] = valStr;
            }
          }

          // 7. مؤشرات الميزة إلى الإحداثيات المتجهة FSPT
          else if (field.tag === 'FSPT' && curFrid) {
            // كل مؤشر عبارة عن 8 بايت: RCNM (1) + RCID (4) + ORNT (1) + USAG (1) + MASK (1)
            const nPointers = Math.floor(fieldBuf.length / 8);
            for (let p = 0; p < nPointers; p++) {
              const refRcnm = fieldBuf[p * 8];
              const refRcid = fieldBuf.readUInt32LE(p * 8 + 1);
              const ornt = fieldBuf[p * 8 + 5]; // 1: Forward, 2: Reverse
              curFrid.spatialRefs.push({ rcnm: refRcnm, rcid: refRcid, ornt });
            }
          }
        }
      }

      offset += recLen;
    }

    // تجميع الميزات الجغرافية النهائية وحساب الحدود
    let minLon = 180,
      minLat = 90,
      maxLon = -180,
      maxLat = -90;

    const coastlines = [];
    const depthContours = [];
    const depthAreas = [];
    const navAids = [];
    const soundings = [];
    const hazards = [];
    const anchorages = [];

    for (const feat of featureRecords) {
      // استخراج الإحداثيات من السجلات المتجهة المرتبطة
      const points = [];
      for (const ref of feat.spatialRefs) {
        const vRec = vectorRecords.get(`${ref.rcnm}_${ref.rcid}`) || vectorRecords.get(ref.rcid);
        if (vRec && vRec.points && vRec.points.length > 0) {
          if (ref.ornt === 2) {
            points.push(...[...vRec.points].reverse());
          } else {
            points.push(...vRec.points);
          }
        }
      }

      // إذا لم يكن هناك إحداثيات، نتجاوز
      if (points.length === 0) continue;

      // تحديث الحدود الجغرافية
      for (const pt of points) {
        const [lat, lon] = pt;
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }

      const acronym = feat.acronym;

      // 1. اليابسة وخطوط السواحل والشواطئ
      if (acronym === 'LNDARE' || acronym === 'COALNE' || acronym === 'SLCONS' || acronym === 'ISODGR') {
        coastlines.push({
          type: acronym,
          points
        });
      }
      // 2. خطوط الأعماق
      else if (acronym === 'DEPCNT') {
        const depthVal = parseFloat(feat.attributes['VALDCO']) || 0;
        depthContours.push({
          depth: depthVal,
          points
        });
      }
      // 3. مناطق الأعماق
      else if (acronym === 'DEPARE' || acronym === 'DRGARE') {
        const drval1 = parseFloat(feat.attributes['DRVAL1']) || 0;
        const drval2 = parseFloat(feat.attributes['DRVAL2']) || 50;
        depthAreas.push({
          minDepth: drval1,
          maxDepth: drval2,
          points
        });
      }
      // 4. المنارات وعلامات الملاحة
      else if (acronym.startsWith('LIGHTS') || acronym.startsWith('BOY') || acronym.startsWith('BCN')) {
        const firstPt = points[0];
        let aidType = 'buoy';
        if (acronym.startsWith('LIGHTS')) aidType = 'lighthouse';
        else if (acronym.startsWith('BCN')) aidType = 'beacon';

        navAids.push({
          name: feat.attributes['OBJNAM'] || feat.name,
          lat: firstPt[0],
          lon: firstPt[1],
          type: aidType,
          color: feat.attributes['COLOUR'] || '#38bdf8',
          character: feat.attributes['SIGCHR'] || 'Fl'
        });
      }
      // 5. قياسات الأعماق النقطية
      else if (acronym === 'SOUNDG') {
        for (const pt of points) {
          soundings.push({
            lat: pt[0],
            lon: pt[1],
            depth: pt[2] || parseFloat(feat.attributes['DEPTH']) || 0
          });
        }
      }
      // 6. حطام السفن والمخاطر
      else if (acronym === 'WRECKS' || acronym === 'UWTROC' || acronym === 'OBSTRN') {
        const firstPt = points[0];
        hazards.push({
          type: acronym,
          name: feat.attributes['OBJNAM'] || acronym,
          lat: firstPt[0],
          lon: firstPt[1],
          waterLevel: feat.attributes['WATLEV'] || ''
        });
      }
      // 7. مناطق ومراسي المخطاف
      else if (acronym === 'ACHARE' || acronym === 'ACHBRT') {
        anchorages.push({
          name: feat.attributes['OBJNAM'] || 'Anchorage',
          points
        });
      }
    }

    const hasBounds = minLon <= maxLon && minLat <= maxLat;
    const bounds = hasBounds ? [minLon, minLat, maxLon, maxLat] : [0, 0, 0, 0];

    return {
      type: 'S-57',
      filePath,
      name: dsidTitle,
      edition: dsidEdition,
      bounds,
      scale: dspmScale,
      featuresCount: featureRecords.length,
      coastlines,
      depthContours,
      depthAreas,
      navAids,
      soundings,
      hazards,
      anchorages
    };
  }
}

module.exports = S57Decoder;
