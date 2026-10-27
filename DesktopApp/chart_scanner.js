/**
 * ARN Marine Navigator - Local Chart Scanner Engine
 * شركة ARN Technology - تطوير وبرمجة: عبده رجب نصار
 * فاحص ومفهرس الخرائط الملاحية المحلية بمختلف أنواعها
 */

const fs = require('fs');
const path = require('path');
const BSBDecoder = require('./bsb_decoder');

class ChartScanner {
  constructor() {
    // الصيغ التي يملك التطبيق مفسرات فعلية لها فقط
    this.supportedExtensions = new Set([
      '.000',
      '.001',
      '.002',
      '.003', // S-57 ENC Vector Cells
      '.bsb',
      '.kap', // BSB/KAP Raster Nautical Charts
      '.mbtiles' // Offline Map Tiles SQLite
    ]);
    // صيغ مكتشفة للعرض فقط بدون مفسر بعد (لا تُفهرس كخرائط جاهزة)
    this.unsupportedExtensions = new Set(['.tif', '.tiff', '.geotiff']);
  }

  /**
   * فحص مجلد بالكامل واستخراج كافة ملفات الخرائط المدعومة
   */
  async scanDirectory(dirPath, maxDepth = 4) {
    if (!fs.existsSync(dirPath)) {
      throw new Error(`مسار المجلد غير موجود: ${dirPath}`);
    }

    const results = {
      rootPath: dirPath,
      scanTime: new Date().toISOString(),
      summary: {
        totalCharts: 0,
        s57Count: 0,
        bsbCount: 0,
        mbtilesCount: 0,
        geotiffCount: 0,
        cm93Count: 0
      },
      charts: []
    };

    await this._crawl(dirPath, 0, maxDepth, results);
    results.summary.totalCharts = results.charts.length;
    return results;
  }

  async _crawl(currentPath, currentDepth, maxDepth, results) {
    if (currentDepth > maxDepth) return;

    let entries = [];
    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true });
    } catch (e) {
      console.warn(`تعذر قراءة المجلد: ${currentPath}`, e.message);
      return;
    }

    // التحقق أولاً من وجود مجلد CM93 أو ملفات C-MAP العالمية
    const isCm93Folder =
      entries.some((e) => e.isDirectory() && e.name.toUpperCase() === 'CM93') ||
      currentPath.toUpperCase().endsWith('CM93') ||
      entries.some(
        (e) => e.isFile() && (e.name.toUpperCase().endsWith('.EXD') || e.name.toUpperCase() === 'CHRLIST.BIN')
      );

    if (isCm93Folder && !results.charts.some((c) => c.type === 'CM93' && c.path === currentPath)) {
      const exdFiles = entries.filter((e) => e.isFile() && e.name.toUpperCase().endsWith('.EXD')).map((e) => e.name);
      let editionDate = '2013-05-01';
      if (exdFiles.length > 0) {
        exdFiles.sort().reverse();
        const raw = exdFiles[0].replace(/\.EXD/i, '');
        if (raw.length === 8) {
          editionDate = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
        }
      }

      const cellDirs = entries.filter((e) => e.isDirectory() && /^\d{8}$/.test(e.name));

      results.charts.push({
        id: `cm93_global_database`,
        name: `قاعدة خرائط المتجهات العالمية CM93 (إصدار ${editionDate})`,
        fileName: 'CM93 Worldwide Database',
        type: 'CM93',
        path: currentPath,
        scale: '1:3,500 - 1:3,000,000 (Z/A/B/C/D/E/F/G)',
        format: 'CM93 v2 Vector ENC',
        cellsCount: cellDirs.length || 144,
        edition: editionDate,
        isWorldwide: true,
        // صادقة: المجلد مكتشف فقط ولا يوجد مفسر EXD حتى الآن
        status: 'Detected — renderer not implemented yet',
        renderable: false,
        bounds: [-180, -85, 180, 85]
      });
      results.summary.cm93Count++;
      return; // مجلد CM93 وحدة عالمية موحدة لا تحتاج للغوص في آلاف الملفات الفرعية
    }

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        await this._crawl(fullPath, currentDepth + 1, maxDepth, results);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();

        if (this.supportedExtensions.has(ext)) {
          const chartMeta = this._parseChartMetadata(fullPath, entry.name, ext);
          if (chartMeta) {
            results.charts.push(chartMeta);
            if (chartMeta.type === 'S-57') results.summary.s57Count++;
            else if (chartMeta.type === 'BSB' || chartMeta.type === 'KAP') results.summary.bsbCount++;
            else if (chartMeta.type === 'MBTiles') results.summary.mbtilesCount++;
            else if (chartMeta.type === 'GeoTIFF') results.summary.geotiffCount++;
          }
        }
      }
    }
  }

  /**
   * استخراج بيانات الخريطة الوصفية والإحداثيات الجغرافية
   */
  _parseChartMetadata(filePath, fileName, ext) {
    let stats;
    try {
      stats = fs.statSync(filePath);
    } catch {
      return null;
    }

    const baseInfo = {
      id: Buffer.from(filePath)
        .toString('base64')
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(-16),
      name: fileName,
      fileName: fileName,
      path: filePath,
      sizeBytes: stats.size,
      sizeFormatted: (stats.size / (1024 * 1024)).toFixed(2) + ' MB',
      lastModified: stats.mtime.toISOString()
    };

    // 1. خرائط BSB و KAP النقطية
    if (ext === '.bsb' || ext === '.kap') {
      try {
        const decoder = new BSBDecoder(filePath);
        const meta = decoder.toMetadata();
        return {
          ...baseInfo,
          type: ext === '.bsb' ? 'BSB' : 'KAP',
          chartFamily: 'Raster Nautical',
          title: meta.title,
          scale: meta.scale || '1:50,000',
          datum: meta.datum || 'WGS84',
          bounds: meta.bounds,
          neatline: meta.neatline,
          renderable: true,
          status: 'Ready for Raster Decode'
        };
      } catch {
        return {
          ...baseInfo,
          type: ext === '.bsb' ? 'BSB' : 'KAP',
          chartFamily: 'Raster Nautical',
          scale: 'N/A',
          renderable: false,
          status: 'Header parse failed'
        };
      }
    }

    // 2. خرائط S-57 ENC
    if (['.000', '.001', '.002', '.003'].includes(ext)) {
      return {
        ...baseInfo,
        type: 'S-57',
        chartFamily: 'Vector ENC',
        edition: ext.replace('.', ''),
        scale: this._inferENCScale(fileName),
        renderable: true,
        status: 'Ready for Vector Rendering'
      };
    }

    // 3. خرائط MBTiles
    if (ext === '.mbtiles') {
      return {
        ...baseInfo,
        type: 'MBTiles',
        chartFamily: 'Offline Tile Package',
        format: 'SQLite Tiles',
        renderable: true,
        status: 'Ready for Tile Stacking'
      };
    }

    // ملاحظة: GeoTIFF لا يمر عبر supportedExtensions بعد (لا مفسر بعد)،
    // وإن وصل هنا يُوسم بوضوح كغير مدعوم بدل حالة "جاهز" المضللة.
    if (['.tif', '.tiff', '.geotiff'].includes(ext)) {
      return {
        ...baseInfo,
        type: 'GeoTIFF',
        chartFamily: 'Georeferenced Raster',
        status: 'Unsupported — decoder not implemented',
        renderable: false
      };
    }

    return null;
  }

  _inferENCScale(fileName) {
    if (fileName.length >= 8) {
      const bandChar = fileName.charAt(2);
      switch (bandChar) {
        case '1':
          return 'Overview (1:1,500,000+)';
        case '2':
          return 'General (1:350,000 - 1:1,500,000)';
        case '3':
          return 'Coastal (1:90,000 - 1:350,000)';
        case '4':
          return 'Approach (1:22,000 - 1:90,000)';
        case '5':
          return 'Harbour (1:4,000 - 1:22,000)';
        case '6':
          return 'Berthing (< 1:4,000)';
      }
    }
    return 'Coastal / Standard';
  }
}

module.exports = ChartScanner;
