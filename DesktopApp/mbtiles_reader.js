/**
 * ARN Marine Navigator - Offline MBTiles Reader (Cross-Platform WASM)
 * شركة ARN Technology - تطوير وبرمجة: عبده رجب نصار
 * قارئ حزم الرقع الملاحية المحلية المجمعة بصيغة SQLite MBTiles عبر WebAssembly
 */

const fsp = require('fs').promises;
const fs = require('fs');
let initSqlJs = null;
try {
  initSqlJs = require('sql.js');
} catch (e) {
  console.warn('sql.js is not installed, MBTiles reading will be limited:', e.message);
}

let sqlInstancePromise = null;
function getSQLInstance() {
  if (!sqlInstancePromise && initSqlJs) {
    sqlInstancePromise = initSqlJs();
  }
  return sqlInstancePromise;
}

class MBTilesReader {
  constructor(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`ملف MBTiles غير موجود: ${filePath}`);
    }
    this.filePath = filePath;
    this.db = null;
    this.metadata = {
      name: 'Nautical MBTiles Package',
      format: 'png',
      minzoom: 0,
      maxzoom: 18,
      bounds: [-180, -85, 180, 85], // [minLon, minLat, maxLon, maxLat]
      center: [0, 0, 8]
    };
  }

  /**
   * تهيئة قاعدة البيانات عبر WebAssembly SQL Engine
   */
  async init() {
    if (this.db) return this;

    const SQL = await getSQLInstance();
    if (!SQL) {
      console.warn('تعذر تحميل محرك SQL.js WebAssembly');
      return this;
    }

    try {
      // قراءة غير حاجبة لمسار الأحداث الرئيسي مع الملفات الكبيرة
      const fileBuffer = await fsp.readFile(this.filePath);
      this.db = new SQL.Database(fileBuffer);
      this._loadMetadata();
    } catch (e) {
      console.warn(`تعذر فتح ملف MBTiles (${this.filePath}):`, e.message);
      throw e;
    }
    return this;
  }

  /**
   * استخراج البيانات الوصفية لحزمة الخريطة
   */
  _loadMetadata() {
    if (!this.db) return;

    try {
      const res = this.db.exec('SELECT name, value FROM metadata');
      if (res && res.length > 0 && res[0].values) {
        for (const [name, val] of res[0].values) {
          const value = String(val);
          if (name === 'name') this.metadata.name = value;
          else if (name === 'format') this.metadata.format = value.toLowerCase();
          else if (name === 'minzoom') this.metadata.minzoom = parseInt(value, 10);
          else if (name === 'maxzoom') this.metadata.maxzoom = parseInt(value, 10);
          else if (name === 'bounds') {
            this.metadata.bounds = value.split(',').map((v) => parseFloat(v.trim()));
          } else if (name === 'center') {
            this.metadata.center = value.split(',').map((v) => parseFloat(v.trim()));
          }
        }
      }
    } catch (e) {
      console.warn(`تعذر استعلام البيانات الوصفية: ${this.filePath}`, e.message);
    }
  }

  /**
   * استخراج رقعة محددة وفق معيار XYZ مع التحويل من معيار TMS الخاص بـ MBTiles
   * @param {number} z مستوى التكبير Zoom Level
   * @param {number} x رقم العمود Tile X
   * @param {number} y رقم الصف Tile Y (معيار Slippy Map)
   * @returns {Uint8Array|null} مصفوفة بايتات الصورة
   */
  getTile(z, x, y) {
    if (!this.db) return null;

    // في معيار MBTiles، المحور Y مقلوب (TMS Standard: tmsY = 2^z - 1 - y)
    const tmsY = (1 << z) - 1 - y;

    try {
      const stmt = this.db.prepare(
        'SELECT tile_data FROM tiles WHERE zoom_level = :z AND tile_column = :x AND tile_row = :y'
      );
      stmt.bind({ ':z': z, ':x': x, ':y': tmsY });
      if (stmt.step()) {
        const row = stmt.get();
        stmt.free();
        return row[0]; // Uint8Array
      }
      stmt.free();
    } catch (e) {
      console.error(`خطأ أثناء قراءة الرقعة z=${z}, x=${x}, y=${y}:`, e.message);
    }
    return null;
  }

  /**
   * استرجاع الرقعة بصيغة DataURL مناسبة للعرض الفوري على المتصفح
   */
  getTileDataURL(z, x, y) {
    const tileBytes = this.getTile(z, x, y);
    if (!tileBytes) return null;

    const mime = this.metadata.format === 'jpg' || this.metadata.format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const base64 = Buffer.from(tileBytes).toString('base64');
    return `data:${mime};base64,${base64}`;
  }

  close() {
    if (this.db) {
      try {
        this.db.close();
      } catch {}
      this.db = null;
    }
  }
}

module.exports = MBTilesReader;
