#!/usr/bin/env node

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const sharp = require('sharp');

const { imageToFrameBuffer } = require('../server.js');

const ROOT_DIR = path.join(__dirname, '..');

function loadJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const equalsIndex = line.indexOf('=');
    if (equalsIndex < 0) continue;
    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadDotEnv(path.join(ROOT_DIR, '.env'));

const APP_CONFIG = loadJson(path.join(ROOT_DIR, 'config.json'), {});
const DATA_DIR = path.isAbsolute(APP_CONFIG.dataDir || 'data') ? APP_CONFIG.dataDir : path.join(ROOT_DIR, APP_CONFIG.dataDir || 'data');
const RAW_IMAGES_DIR = path.join(DATA_DIR, 'raw_images');
const PROCESSED_IMAGES_DIR = path.join(DATA_DIR, 'processed_images');
const RAW_INDEX_FILE = path.join(DATA_DIR, 'raw_index.json');
const IMAGE_INDEX_FILE = path.join(DATA_DIR, 'image_index.json');

const TARGET_WIDTH = 800;
const TARGET_HEIGHT = 480;
const MIN_FILE_SIZE_BYTES = 40000;
const MAX_WHITE_PIXEL_RATIO = 0.65;

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

const { JsonStore } = require('../src/infra/json-store');

async function readJson(filePath, fallback) {
  const store = JsonStore(filePath);
  return store.readOrDefault(fallback);
}

async function writeJson(filePath, data) {
  const tempPath = `${filePath}.tmp`;
  await fsp.writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fsp.rename(tempPath, filePath);
}

function mergeImageIndex(local, currentOnDisk) {
  const latest = Array.isArray(currentOnDisk) ? currentOnDisk : [];
  const latestById = new Map(latest.map((entry) => [entry.id, entry]));
  const merged = [];
  for (const entry of local) {
    const existing = latestById.get(entry.id);
    if (existing) {
      merged.push({
        ...entry,
        lastShownAt: existing.lastShownAt ?? entry.lastShownAt ?? null,
        shownCount: Math.max(Number(existing.shownCount) || 0, Number(entry.shownCount) || 0),
      });
      latestById.delete(entry.id);
    } else {
      merged.push(entry);
    }
  }
  for (const entry of latestById.values()) {
    merged.push(entry);
  }
  return merged;
}

function resolveRawPath(rawPath) {
  if (path.isAbsolute(rawPath)) return rawPath;
  return path.join(ROOT_DIR, rawPath);
}

function parseArgs(argv) {
  const args = { limit: 0 };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--limit' && argv[i + 1]) {
      args.limit = Number(argv[i + 1]) || 0;
      i++;
    } else if (arg.startsWith('--limit=')) {
      args.limit = Number(arg.slice(8)) || 0;
    }
  }
  return args;
}

async function isQualityImage(rawPath, rawEntry) {
  try {
    const stats = fs.statSync(rawPath);
    if (stats.size < MIN_FILE_SIZE_BYTES) {
      return { ok: false, reason: `too-small ${stats.size} bytes` };
    }

    const { data, info } = await sharp(rawPath)
      .resize(400, 240, { fit: 'fill' })
      .flatten({ background: '#ffffff' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const total = info.width * info.height;
    let nearWhite = 0, nearBlack = 0, midTone = 0;
    let sumR = 0, sumG = 0, sumB = 0;
    let edgePixels = 0, edgeSamples = 0;
    const pixelCount = Math.min(total, 16000);
    const step = Math.max(1, Math.floor(total / pixelCount));

    for (let y = 0; y < info.height; y += Math.max(1, Math.floor(info.height / Math.sqrt(pixelCount)))) {
      for (let x = 0; x < info.width; x += Math.max(1, Math.floor(info.width / Math.sqrt(pixelCount)))) {
        const i = (y * info.width + x) * 3;
        if (i + 2 >= data.length) continue;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        sumR += r; sumG += g; sumB += b;
        if (r > 240 && g > 240 && b > 240) nearWhite++;
        else if (r < 30 && g < 30 && b < 30) nearBlack++;
        else if (r > 30 || g > 30 || b > 30) midTone++;

        // Edge detection: compare with right neighbor
        if (x + 1 < info.width) {
          const ni = (y * info.width + (x + 1)) * 3;
          if (ni + 2 < data.length) {
            const dr = Math.abs(r - data[ni]);
            const dg = Math.abs(g - data[ni + 1]);
            const db = Math.abs(b - data[ni + 2]);
            const brightnessDiff = (dr + dg + db) / 3;
            if (brightnessDiff > 60) edgePixels++;
            edgeSamples++;
          }
        }
      }
    }

    const sampled = Math.ceil(total / step);
    const whiteRatio = nearWhite / sampled;
    const blackRatio = nearBlack / sampled;
    const midRatio = midTone / sampled;
    const avgR = sumR / sampled, avgG = sumG / sampled, avgB = sumB / sampled;

    let variance = 0;
    for (let i = 0; i < total * 3; i += step * 3) {
      const r = data[i] - avgR, g = data[i + 1] - avgG, b = data[i + 2] - avgB;
      variance += (r * r + g * g + b * b) / 3;
    }
    variance /= sampled;
    const stdDev = Math.sqrt(variance);

    if (whiteRatio > 0.60) {
      return { ok: false, reason: `mostly-white ${(whiteRatio * 100).toFixed(0)}%` };
    }
    if (blackRatio > 0.40 && midRatio < 0.15) {
      return { ok: false, reason: `text-heavy-black ${(blackRatio * 100).toFixed(0)}%` };
    }
    if (whiteRatio + blackRatio > 0.50 && midRatio < 0.25) {
      return { ok: false, reason: `binary-text ${((whiteRatio + blackRatio) * 100).toFixed(0)}%` };
    }
    if (stdDev < 28) {
      return { ok: false, reason: `low-contrast stdDev=${stdDev.toFixed(0)}` };
    }

    return { ok: true };
  } catch {
    return { ok: true };
  }
}

async function processImage(rawEntry, imageIndex) {
  const existing = imageIndex.find((entry) => entry.id === rawEntry.id);
  if (existing) {
    return { status: 'skipped', reason: 'already-processed' };
  }

  const rawPath = resolveRawPath(rawEntry.rawPath);
  if (!fs.existsSync(rawPath)) {
    return { status: 'failed', reason: 'raw-file-missing' };
  }

  const quality = await isQualityImage(rawPath, rawEntry);
  if (!quality.ok) {
    return { status: 'skipped', reason: `quality:${quality.reason}` };
  }

  let pipeline;
  try {
    pipeline = sharp(rawPath)
      .rotate()
      .resize(TARGET_WIDTH, TARGET_HEIGHT, { fit: 'cover', position: 'centre' })
      .modulate({ brightness: 1.05 })
      .sharpen({ sigma: 0.5, flat: 1, jagged: 2 })
      .flatten({ background: '#ffffff' });
  } catch (error) {
    return { status: 'failed', reason: `pipeline: ${error.message}` };
  }

  const processedPngPath = path.join(PROCESSED_IMAGES_DIR, `${rawEntry.id}.png`);
  const epfPath = path.join(PROCESSED_IMAGES_DIR, `${rawEntry.id}.epf`);

  let processedBuffer;
  try {
    processedBuffer = await pipeline.png().toBuffer();
    await fsp.writeFile(processedPngPath, processedBuffer);
  } catch (error) {
    return { status: 'failed', reason: `png-save: ${error.message}` };
  }

  try {
    const { data, info } = await sharp(processedPngPath)
      .resize(TARGET_WIDTH, TARGET_HEIGHT, { fit: 'fill' })
      .flatten({ background: '#ffffff' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    if (info.width !== TARGET_WIDTH || info.height !== TARGET_HEIGHT) {
      return { status: 'failed', reason: `bad-dimensions ${info.width}x${info.height}` };
    }

    const payload = imageToFrameBuffer(data, info.width, info.height, info.channels);
    const header = Buffer.alloc(10);
    header.write('EPF1', 0, 4, 'ascii');
    header.writeUInt16LE(TARGET_WIDTH, 4);
    header.writeUInt16LE(TARGET_HEIGHT, 6);
    header.writeUInt8(49, 8);
    header.writeUInt8(1, 9);
    await fsp.writeFile(epfPath, Buffer.concat([header, payload]));
  } catch (error) {
    return { status: 'failed', reason: `epf: ${error.message}` };
  }

  const entry = {
    id: rawEntry.id,
    url: rawEntry.url,
    title: rawEntry.title || '',
    sourceType: rawEntry.sourceType || 'unknown',
    source: rawEntry.source || rawEntry.sourceType || 'unknown',
    theme: rawEntry.theme || 'cinematic',
    kind: rawEntry.kind || 'shot',
    hash: rawEntry.hash,
    rawPath: rawEntry.rawPath,
    processedPngPath: path.relative(ROOT_DIR, processedPngPath),
    epfPath: path.relative(ROOT_DIR, epfPath),
    width: TARGET_WIDTH,
    height: TARGET_HEIGHT,
    imageName: path.basename(processedPngPath),
    createdAt: new Date().toISOString(),
    lastShownAt: null,
    shownCount: 0,
    metadata: rawEntry.metadata || {},
    safetyStatus: rawEntry.safetyStatus || 'pending',
    poolType: rawEntry.poolType || 'decorative_photos',
  };
  imageIndex.push(entry);
  return { status: 'processed', id: entry.id, path: processedPngPath };
}

async function main() {
  await ensureDir(DATA_DIR);
  await ensureDir(RAW_IMAGES_DIR);
  await ensureDir(PROCESSED_IMAGES_DIR);

  const rawIndex = await readJson(RAW_INDEX_FILE, []);
  let imageIndex = await readJson(IMAGE_INDEX_FILE, []);
  if (!Array.isArray(imageIndex)) imageIndex = [];

  const args = parseArgs(process.argv);
  const entries = Array.isArray(rawIndex) ? rawIndex : [];
  const pending = entries.filter((entry) => entry && entry.status !== 'failed' && !imageIndex.some((img) => img.id === entry.id));
  const limited = args.limit > 0 ? pending.slice(0, args.limit) : pending;

  const results = { processed: 0, skipped: 0, failed: 0 };
  for (const rawEntry of limited) {
    const result = await processImage(rawEntry, imageIndex);
    if (result.status === 'processed') results.processed++;
    else if (result.status === 'skipped') results.skipped++;
    else results.failed++;
    console.log(`${result.status}: ${rawEntry.id} ${result.reason || ''}`);
  }

  const latestOnDisk = await readJson(IMAGE_INDEX_FILE, []);
  const merged = mergeImageIndex(imageIndex, latestOnDisk);
  await writeJson(IMAGE_INDEX_FILE, merged);
  console.log(`process done: ${results.processed} processed, ${results.skipped} skipped, ${results.failed} failed (pending ${pending.length}, limited ${limited.length})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
