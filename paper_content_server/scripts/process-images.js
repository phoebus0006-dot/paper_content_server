#!/usr/bin/env node
// process-images.js — 把 raw_index.json 中 status='downloaded' 的条目
// 用 sharp 处理成 800x480 PNG，写入 processed_images/，再追加到 image_index.json。
//
// 必须存在：server.js 的 /api/admin/content-sync/photos 路由通过
//   const { runProcessImages } = require('./scripts/process-images.js')
// 调用本模块。之前该文件不存在，导致图片同步链路 100% 失效——抓取的图永远
// 只在 raw_index.json，image_index.json 永远为空（除上传），admin 图片库
// 看不到任何抓取的图片。

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

let sharp;
try { sharp = require('sharp'); } catch (e) { sharp = null; }

const ROOT_DIR = path.join(__dirname, '..');
const APP_CONFIG = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'config.json'), 'utf8')); } catch { return {}; }
})();
// 必须尊重 DATA_DIR/RAW_INDEX_FILE/IMAGE_INDEX_FILE 环境变量（与 server.js 的 load-config 一致）。
// 之前直接读 config.json 忽略 env，导致 admin-test 设置 DATA_DIR=TMPDIR 时，
// process-images 写 ROOT_DIR/data/image_index.json，server 读 TMPDIR/image_index.json → 永远空。
const DATA_DIR = process.env.DATA_DIR
  ? (path.isAbsolute(process.env.DATA_DIR) ? process.env.DATA_DIR : path.join(ROOT_DIR, process.env.DATA_DIR))
  : (path.isAbsolute(APP_CONFIG.dataDir || 'data') ? (APP_CONFIG.dataDir || 'data') : path.join(ROOT_DIR, APP_CONFIG.dataDir || 'data'));
const RAW_INDEX_FILE = process.env.RAW_INDEX_FILE
  ? (path.isAbsolute(process.env.RAW_INDEX_FILE) ? process.env.RAW_INDEX_FILE : path.join(ROOT_DIR, process.env.RAW_INDEX_FILE))
  : path.join(DATA_DIR, 'raw_index.json');
const IMAGE_INDEX_FILE = process.env.IMAGE_INDEX_FILE
  ? (path.isAbsolute(process.env.IMAGE_INDEX_FILE) ? process.env.IMAGE_INDEX_FILE : path.join(ROOT_DIR, process.env.IMAGE_INDEX_FILE))
  : path.join(DATA_DIR, 'image_index.json');
const PROCESSED_DIR = path.join(DATA_DIR, 'processed_images');

const FRAME_WIDTH = Number(APP_CONFIG.frameWidth) || 800;
const FRAME_HEIGHT = Number(APP_CONFIG.frameHeight) || 480;

function sha1(buf) { return crypto.createHash('sha1').update(buf).digest('hex'); }

async function readJson(filePath, fallback) {
  try { return JSON.parse(await fsp.readFile(filePath, 'utf8')); } catch { return fallback; }
}

async function writeJsonAtomic(filePath, data) {
  const tmp = filePath + '.tmp.' + process.pid + '.' + crypto.randomBytes(4).toString('hex');
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fsp.rename(tmp, filePath);
}

async function runProcessImages(argsOverride) {
  const args = argsOverride || {};
  if (!sharp) {
    const err = new Error('sharp module not available');
    err.code = 'SHARP_MISSING';
    throw err;
  }
  await fsp.mkdir(PROCESSED_DIR, { recursive: true });

  const rawIndex = await readJson(RAW_INDEX_FILE, []);
  if (!Array.isArray(rawIndex)) return { processed: 0, newIds: [], skipped: 'raw-index-invalid' };

  let imageIndex = await readJson(IMAGE_INDEX_FILE, []);
  if (!Array.isArray(imageIndex)) imageIndex = [];

  const existingIds = new Set(imageIndex.map((e) => e && e.id).filter(Boolean));
  const results = { processed: 0, newIds: [], failed: 0, skipped: 0 };

  // limit=0 表示不限制；正数限制本次处理条数
  const limit = (args && typeof args.limit === 'number' && args.limit > 0) ? args.limit : 0;
  let processed = 0;

  for (const raw of rawIndex) {
    if (!raw || !raw.id || !raw.rawPath) { results.skipped++; continue; }
    if (existingIds.has(raw.id)) { results.skipped++; continue; }
    if (limit > 0 && processed >= limit) break;

    const rawAbs = path.isAbsolute(raw.rawPath) ? raw.rawPath : path.join(ROOT_DIR, raw.rawPath);
    if (!fs.existsSync(rawAbs)) { results.failed++; continue; }

    const processedPngPath = path.join(PROCESSED_DIR, raw.id + '.png');
    try {
      const buf = await sharp(rawAbs)
        .rotate()
        .resize(FRAME_WIDTH, FRAME_HEIGHT, { fit: 'cover', position: 'centre' })
        .modulate({ brightness: 1.05 })
        .sharpen({ sigma: 0.5, flat: 1, jagged: 2 })
        .flatten({ background: '#ffffff' })
        .png()
        .toBuffer();
      await fsp.writeFile(processedPngPath, buf);

      imageIndex.push({
        id: raw.id,
        rawPath: path.relative(ROOT_DIR, rawAbs).replace(/\\/g, '/'),
        processedPngPath: path.relative(ROOT_DIR, processedPngPath).replace(/\\/g, '/'),
        status: 'processed',
        addedAt: new Date().toISOString(),
        createdAt: raw.downloadedAt || new Date().toISOString(),
        title: raw.title || raw.id,
        source: raw.source || 'unknown',
        sourceType: raw.sourceType || 'unknown',
        theme: raw.theme || 'cinematic',
        kind: raw.kind || 'shot',
        poolType: raw.poolType || 'study_frames',
        safetyStatus: raw.safetyStatus || 'approved',
        width: FRAME_WIDTH,
        height: FRAME_HEIGHT,
        hash: raw.hash || sha1(buf),
        url: raw.url || '',
      });
      existingIds.add(raw.id);
      results.processed++;
      results.newIds.push(raw.id);
      processed++;
    } catch (e) {
      console.log('process failed for ' + raw.id + ': ' + e.message);
      results.failed++;
    }
  }

  if (results.processed > 0) {
    await writeJsonAtomic(IMAGE_INDEX_FILE, imageIndex);
  }
  console.log('process done: ' + results.processed + ' processed, ' + results.skipped + ' skipped, ' + results.failed + ' failed');
  return results;
}

module.exports = { runProcessImages };

if (require.main === module) {
  runProcessImages().catch((e) => { console.error('process-images failed:', e); process.exit(1); });
}
