#!/usr/bin/env node

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');
const sharp = require('sharp');

const { fetchWikimediaCategoryCandidates } = require(path.join(__dirname, '..', 'lib', 'wikimedia'));

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
// 必须尊重 DATA_DIR/RAW_INDEX_FILE/IMAGES_DIR 环境变量（与 server.js 的 load-config 一致），
// 否则 admin-test 设置 DATA_DIR=TMPDIR 时，fetch-images 仍读写 ROOT_DIR/data，
// 导致测试环境和生产环境的图片同步链路断裂。
const DATA_DIR = process.env.DATA_DIR
  ? (path.isAbsolute(process.env.DATA_DIR) ? process.env.DATA_DIR : path.join(ROOT_DIR, process.env.DATA_DIR))
  : (path.isAbsolute(APP_CONFIG.dataDir || 'data') ? APP_CONFIG.dataDir : path.join(ROOT_DIR, APP_CONFIG.dataDir || 'data'));
const RAW_IMAGES_DIR = path.join(DATA_DIR, 'raw_images');
const IMPORT_IMAGES_DIR = path.join(DATA_DIR, 'import_images');
const RAW_INDEX_FILE = process.env.RAW_INDEX_FILE
  ? (path.isAbsolute(process.env.RAW_INDEX_FILE) ? process.env.RAW_INDEX_FILE : path.join(ROOT_DIR, process.env.RAW_INDEX_FILE))
  : path.join(DATA_DIR, 'raw_index.json');
const PHOTO_SOURCES_FILE = path.join(ROOT_DIR, 'config', 'photo_sources.json');
const IMAGES_DIR = process.env.IMAGES_DIR
  ? (path.isAbsolute(process.env.IMAGES_DIR) ? process.env.IMAGES_DIR : path.join(ROOT_DIR, process.env.IMAGES_DIR))
  : (path.isAbsolute(APP_CONFIG.imageRoot || 'images') ? APP_CONFIG.imageRoot : path.join(ROOT_DIR, APP_CONFIG.imageRoot || 'images'));

const MIN_WIDTH = 800;
const MIN_HEIGHT = 480;
const REQUEST_TIMEOUT_MS = 20000;
const MIN_FILE_SIZE_BYTES = 40000;
const MAX_WHITE_PIXEL_RATIO = 0.65;

const QUALITY_BLOCKLIST = [
  /\blogo\b/i, /\bicon\b/i, /\bthumb\b/i, /\bthumbnail\b/i,
  /\bbanner\b/i, /\bseal\b/i, /\bemblem\b/i, /\btext\b/i,
  /\bposter\b/i, /\bcover\b/i, /\billustration\b/i,
  /\border\b/i, /\bdecoration\b/i, /\bpattern\b/i,
  /\bstamp\b/i, /\bwatermark\b/i, /\blogotype\b/i,
];

function sha1(text) {
  return crypto.createHash('sha1').update(String(text || '')).digest('hex');
}

function canonicalUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return String(url).trim();
  }
}

function normalizeText(text) {
  return String(text || '')
    .replace(/[\s\u00A0]+/g, ' ')
    .replace(/^\s+|\s+$/g, '');
}

function isDomainAllowed(url, safeDomains) {
  if (!safeDomains || !safeDomains.length) return true;
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    return safeDomains.some(function(d) { return hostname === d.toLowerCase() || hostname.endsWith('.' + d.toLowerCase()); });
  } catch { return false; }
}

function isBlocklistedContent(text, blocklistWords) {
  if (!blocklistWords || !blocklistWords.length) return false;
  const lower = String(text || '').toLowerCase();
  for (const word of blocklistWords) {
    const w = word.toLowerCase().trim();
    if (!w) continue;
    if (lower.indexOf(w) !== -1) return true;
  }
  return false;
}

function contentSafetyCheck(entry, safeDomains, blocklistWords) {
  // Domain check
  if (!isDomainAllowed(entry.url, safeDomains)) {
    return { pass: false, reason: 'domain-not-in-safe-list' };
  }
  // Blocklist check on combined text fields
  const combined = [
    entry.title,
    entry.url,
    entry.source,
    entry.sourceType,
    entry.kind,
    (entry.metadata && entry.metadata.description) || '',
    (entry.metadata && entry.metadata.file) || '',
    (entry.metadata && entry.metadata.identifier) || '',
  ].filter(Boolean).join(' ');
  if (isBlocklistedContent(combined, blocklistWords)) {
    return { pass: false, reason: 'blocklist-word-match' };
  }
  return { pass: true };
}

function isLowQualityTitle(title, url) {
  const haystack = `${title || ''} ${url || ''}`;
  return QUALITY_BLOCKLIST.some((pattern) => pattern.test(haystack));
}

function bigramDice(left, right) {
  const a = String(left || '').toLowerCase();
  const b = String(right || '').toLowerCase();
  if (!a || !b) return 0;
  if (a === b) return 1;
  const gramsA = new Map();
  const gramsB = new Map();
  for (let i = 0; i < a.length - 1; i++) gramsA.set(a.slice(i, i + 2), (gramsA.get(a.slice(i, i + 2)) || 0) + 1);
  for (let i = 0; i < b.length - 1; i++) gramsB.set(b.slice(i, i + 2), (gramsB.get(b.slice(i, i + 2)) || 0) + 1);
  let overlap = 0;
  for (const [gram, count] of gramsA) overlap += Math.min(count, gramsB.get(gram) || 0);
  return (2 * overlap) / Math.max(1, [...gramsA.values()].reduce((sum, count) => sum + count, 0) + [...gramsB.values()].reduce((sum, count) => sum + count, 0));
}

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

async function readJson(filePath, fallback) {
  try {
    const text = await fsp.readFile(filePath, 'utf8');
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, data) {
  const tempPath = `${filePath}.tmp`;
  await fsp.writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fsp.rename(tempPath, filePath);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shuffleArray(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

async function withRetry(operation, label, maxAttempts = 3, baseDelayMs = 500) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const isRateLimited = error.message.includes('429') || error.message.includes('rate');
      const shouldRetry = isRateLimited || attempt < maxAttempts;
      if (!shouldRetry) throw error;
      const delay = baseDelayMs * (2 ** (attempt - 1)) * (isRateLimited ? 2 : 1);
      console.log(`retry ${label} attempt ${attempt}/${maxAttempts} after ${delay}ms: ${error.message}`);
      await sleep(delay);
    }
  }
  throw lastError;
}

async function fetchBufferInner(url, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': 'NewsPhoto_esp32wf/1.0',
        accept: 'image/*, */*;q=0.8',
      },
      redirect: 'follow',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBuffer(url, timeoutMs = REQUEST_TIMEOUT_MS) {
  return withRetry(() => fetchBufferInner(url, timeoutMs), `fetchBuffer ${url.slice(0, 80)}`);
}

async function fetchJsonInner(url, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': 'NewsPhoto_esp32wf/1.0',
        accept: 'application/json, */*;q=0.8',
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, timeoutMs = REQUEST_TIMEOUT_MS) {
  return withRetry(() => fetchJsonInner(url, timeoutMs), `fetchJson ${url.slice(0, 80)}`);
}

async function fetchTextInner(url, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': 'NewsPhoto_esp32wf/1.0',
        accept: 'application/rss+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.8',
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url, timeoutMs = REQUEST_TIMEOUT_MS) {
  return withRetry(() => fetchTextInner(url, timeoutMs), `fetchText ${url.slice(0, 80)}`);
}

function extensionFromMime(mime) {
  const map = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  return map[String(mime || '').toLowerCase()] || 'jpg';
}

function extensionFromUrl(url) {
  if (!url) return 'jpg';
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.(jpe?g|png|webp|gif)(?:[?#]|$)/i);
    return match ? match[1].toLowerCase() : 'jpg';
  } catch {
    return 'jpg';
  }
}

async function probeImage(buffer) {
  try {
    const metadata = await sharp(buffer).metadata();
    return {
      width: metadata.width || 0,
      height: metadata.height || 0,
      channels: metadata.channels || 0,
      format: metadata.format || '',
    };
  } catch {
    return null;
  }
}

function isDuplicateByUrl(url, index) {
  const normalized = canonicalUrl(url);
  return index.some((entry) => canonicalUrl(entry.url) === normalized);
}

function isDuplicateByHash(hash, index) {
  return index.some((entry) => entry.hash === hash);
}

function isDuplicateByTitleSource(title, source, index) {
  const normalizedTitle = normalizeText(title).toLowerCase();
  for (const entry of index) {
    if (entry.source === source && bigramDice(normalizedTitle, normalizeText(entry.title).toLowerCase()) >= 0.88) return true;
  }
  return false;
}

async function isQualityImage(buffer, probe) {
  try {
    const { data, info } = await sharp(buffer)
      .resize(400, 240, { fit: 'fill' })
      .flatten({ background: '#ffffff' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const total = info.width * info.height;
    let nearWhite = 0, nearBlack = 0, midTone = 0;
    let sumR = 0, sumG = 0, sumB = 0;
    const pixelCount = Math.min(total, 16000);
    const step = Math.max(1, Math.floor(total / pixelCount));

    for (let i = 0; i < total * 3; i += step * 3) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      sumR += r; sumG += g; sumB += b;
      if (r > 240 && g > 240 && b > 240) nearWhite++;
      else if (r < 30 && g < 30 && b < 30) nearBlack++;
      else if (r > 30 || g > 30 || b > 30) midTone++;
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

    if (whiteRatio > MAX_WHITE_PIXEL_RATIO) {
      return { ok: false, reason: `too-much-white ${(whiteRatio * 100).toFixed(0)}%` };
    }
    if (blackRatio > 0.40 && midRatio < 0.15) {
      return { ok: false, reason: `text-like-black-heavy ${(blackRatio * 100).toFixed(0)}% black` };
    }
    if (whiteRatio + blackRatio > 0.55 && midRatio < 0.20) {
      return { ok: false, reason: `text-like-binary ${((whiteRatio + blackRatio) * 100).toFixed(0)}% binary` };
    }
    if (stdDev < 25) {
      return { ok: false, reason: `low-contrast stdDev=${stdDev.toFixed(0)}` };
    }

    return { ok: true };
  } catch {
    return { ok: true };
  }
}

async function addCandidate(candidate, index, options) {
  if (!candidate.url) return { status: 'skipped', reason: 'no-url' };
  const normalizedUrl = canonicalUrl(candidate.url);
  if (isDuplicateByUrl(normalizedUrl, index)) return { status: 'skipped', reason: 'duplicate-url' };

  // Content safety: domain check before download
  if (options.safeDomains || options.blocklistWords) {
    const safety = contentSafetyCheck(candidate, options.safeDomains, options.blocklistWords);
    if (!safety.pass) {
      return { status: 'skipped', reason: `safety:${safety.reason}` };
    }
  }

  let buffer;
  try {
    buffer = await fetchBuffer(normalizedUrl);
  } catch (error) {
    return { status: 'failed', reason: `download: ${error.message}` };
  }

  if (!buffer || buffer.length < 1024) return { status: 'failed', reason: 'empty-file' };
  if (buffer.length < MIN_FILE_SIZE_BYTES) return { status: 'skipped', reason: `too-small-file ${buffer.length} bytes` };

  const probe = await probeImage(buffer);
  if (!probe) return { status: 'failed', reason: 'not-an-image' };

  if (isLowQualityTitle(candidate.title, candidate.url)) {
    return { status: 'skipped', reason: `low-quality-title` };
  }

  const quality = await isQualityImage(buffer, probe);
  if (!quality.ok) {
    return { status: 'skipped', reason: `quality:${quality.reason}` };
  }

  const minWidth = options.minWidth || MIN_WIDTH;
  const minHeight = options.minHeight || MIN_HEIGHT;
  if (probe.width < minWidth || probe.height < minHeight) {
    return { status: 'skipped', reason: `too-small ${probe.width}x${probe.height}` };
  }

  const hash = sha1(buffer);
  if (isDuplicateByHash(hash, index)) return { status: 'skipped', reason: 'duplicate-hash' };

  if (isDuplicateByTitleSource(candidate.title || '', candidate.source || '', index)) {
    return { status: 'skipped', reason: 'duplicate-title' };
  }

  const id = sha1(normalizedUrl);
  const ext = probe.format || extensionFromUrl(normalizedUrl);
  const rawPath = path.join(RAW_IMAGES_DIR, `${id}.${ext}`);
  await fsp.writeFile(rawPath, buffer);

  const entry = {
    id,
    url: normalizedUrl,
    title: normalizeText(candidate.title || ''),
    sourceType: candidate.sourceType || 'unknown',
    source: candidate.source || candidate.sourceType || 'unknown',
    theme: candidate.theme || 'cinematic',
    kind: candidate.kind || 'shot',
    hash,
    rawPath: path.relative(ROOT_DIR, rawPath),
    width: probe.width,
    height: probe.height,
    format: probe.format,
    downloadedAt: new Date().toISOString(),
    status: 'downloaded',
    metadata: candidate.metadata || {},
  };

  // Content safety: blocklist check on full metadata after download
  if (options.blocklistWords) {
    const safety = contentSafetyCheck(entry, options.safeDomains, options.blocklistWords);
    if (!safety.pass) {
      return { status: 'skipped', reason: `safety:${safety.reason}` };
    }
  }

  // 项目无真实 NSFW 分类器运行时，pending 永远不会被提升为 approved，
  // 导致抓取图片永远无法进入自动轮播。直接设为 approved 让图片可用。
  // 已通过上面的 contentSafetyCheck（blocklist）做基础过滤。
  // 若未来接入真实分类器，恢复为 'pending' 并在 process-images.js 中提升。
  entry.safetyStatus = 'approved';
  entry.poolType = options.poolType || candidate.poolType || 'study_frames';
  index.push(entry);
  return { status: 'downloaded', id, path: rawPath };
}

async function fetchWikimediaCandidates(source) {
  const candidates = [];
  const queries = source.queries || [];
  const limit = source.limitPerQuery || 2;

  for (const query of queries) {
    try {
      const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query.q)}&gsrnamespace=6&gsrlimit=${limit}&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=1200&format=json`;
      const data = await fetchJson(url);
      const pages = data?.query?.pages || {};

      for (const page of Object.values(pages)) {
        const imageinfo = page?.imageinfo?.[0];
        if (!imageinfo?.url) continue;
        const wmTitle = page.title?.replace(/^File:/, '').replace(/_/g, ' ') || query.q;
        if (isLowQualityTitle(wmTitle, imageinfo.url)) continue;
        candidates.push({
          url: imageinfo.url,
          title: wmTitle,
          sourceType: 'wikimedia_commons',
          source: 'Wikimedia Commons',
          theme: query.theme || 'cinematic',
          metadata: { pageId: page.pageid },
        });
      }
      await sleep(2500);
    } catch (error) {
      console.log(`wikimedia search failed for ${query.q}: ${error.message}`);
    }
  }

  return candidates;
}

async function fetchInternetArchiveCandidates(source) {
  const candidates = [];
  const queries = source.queries || [];
  const limit = source.limitPerQuery || 3;

  for (const query of queries) {
    try {
      const searchUrl = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(query.q)}+mediatype:image&fl[]=identifier&fl[]=title&rows=${limit}&page=1&output=json`;
      const data = await fetchJson(searchUrl);
      const docs = data?.response?.docs || [];

      for (const doc of docs) {
        const identifier = doc.identifier;
        const title = doc.title || identifier;
        if (isLowQualityTitle(title, identifier)) continue;
        try {
          const metadataUrl = `https://archive.org/metadata/${encodeURIComponent(identifier)}`;
          const metadata = await fetchJson(metadataUrl);
          const files = metadata?.files || [];
          const imageFiles = files.filter((file) => {
            const format = String(file.format || '').toLowerCase();
            const name = String(file.name || '').toLowerCase();
            const source = String(file.source || '').toLowerCase();
            const isOriginal = source === 'original';
            const isImageFormat = ['jpeg', 'jpg', 'png'].some((ext) => format.includes(ext) || name.endsWith(`.${ext}`));
            return isOriginal && isImageFormat;
          });

          for (const file of imageFiles) {
            const url = `https://archive.org/download/${identifier}/${encodeURIComponent(file.name)}`;
            if (isLowQualityTitle(file.name, identifier)) continue;
            try {
              const buffer = await fetchBuffer(url);
              const probe = await probeImage(buffer);
              if (probe && probe.width >= MIN_WIDTH && probe.height >= MIN_HEIGHT) {
                candidates.push({
                  url,
                  title,
                  sourceType: 'internet_archive',
                  source: 'Internet Archive',
                  theme: query.theme || 'cinematic',
                  metadata: { identifier, file: file.name, width: probe.width, height: probe.height },
                });
                break;
              }
            } catch {
              // try next file
            }
            await sleep(300);
          }
        } catch (error) {
          console.log(`internet archive metadata failed for ${identifier}: ${error.message}`);
        }
        await sleep(300);
      }
      await sleep(500);
    } catch (error) {
      console.log(`internet archive search failed for ${query.q}: ${error.message}`);
    }
  }

  return candidates;
}

async function fetchEuropeanaCandidates(source) {
  const candidates = [];
  const apiKey = source.apiKey || process.env.EUROPEANA_API_KEY;
  if (!apiKey) {
    console.log('europeana adapter skipped: no apiKey');
    return candidates;
  }

  const queries = source.queries || [];
  const limit = source.limitPerQuery || 3;

  for (const query of queries) {
    try {
      const searchUrl = `https://api.europeana.eu/record/v2/search.json?wskey=${encodeURIComponent(apiKey)}&query=${encodeURIComponent(query.q)}&rows=${limit}&media=true&reusability=open`;
      const data = await fetchJson(searchUrl);
      const items = data?.items || [];

      for (const item of items) {
        const imageUrl = item.edmPreview?.[0] || item.aggregations?.[0]?.edmIsShownBy;
        if (!imageUrl) continue;
        candidates.push({
          url: imageUrl,
          title: item.title?.[0] || query.q,
          sourceType: 'europeana',
          source: 'Europeana',
          theme: query.theme || 'cinematic',
          metadata: { id: item.id },
        });
      }
    } catch (error) {
      console.log(`europeana search failed for ${query.q}: ${error.message}`);
    }
  }

  return candidates;
}

function extractFirstImage(text) {
  const enclosure = text.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*type=["']image\/[^"']+["'][^>]*\/?>/i);
  if (enclosure) return enclosure[1];
  const img = text.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (img) return img[1];
  const mediaContent = text.match(/<media:content[^>]+url=["']([^"']+)["'][^>]*type=["']image\/[^"']+["'][^>]*\/?>/i);
  if (mediaContent) return mediaContent[1];
  return null;
}

async function fetchRssCandidates(source) {
  const candidates = [];
  const feeds = source.feeds || [];

  for (const feed of feeds) {
    try {
      const text = await fetchText(feed.url);
      const items = text.match(/<item[\s\S]*?<\/item>/gi) || text.match(/<entry[\s\S]*?<\/entry>/gi) || [];
      for (const item of items) {
        const imageUrl = extractFirstImage(item);
        if (!imageUrl) continue;
        const titleMatch = item.match(/<title>([\s\S]*?)<\/title>/i);
        const title = titleMatch ? titleMatch[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1').replace(/<[^>]+>/g, ' ').trim() : feed.url;
        candidates.push({
          url: imageUrl,
          title,
          sourceType: 'rss_images',
          source: feed.url,
          theme: feed.theme || 'cinematic',
          metadata: { feedUrl: feed.url },
        });
      }
    } catch (error) {
      console.log(`rss fetch failed ${feed.url}: ${error.message}`);
    }
  }

  return candidates;
}

async function fetchUrlListCandidates(source) {
  const candidates = [];
  const poolType = source.poolType || 'decorative_photos';
  for (const item of source.urls || []) {
    if (!item.url) continue;
    candidates.push({
      url: item.url,
      title: item.title || item.url,
      sourceType: item.sourceType || 'url_list',
      source: item.source || 'URL list',
      theme: item.theme || 'cinematic',
      poolType: item.poolType || poolType,
      metadata: {},
    });
  }
  return candidates;
}

async function fetchLocalImportCandidates(source) {
  const candidates = [];
  const importDir = path.isAbsolute(source.importDir) ? source.importDir : path.join(ROOT_DIR, source.importDir);
  if (!fs.existsSync(importDir)) return candidates;

  const THEMES = ['双人对话', '人物出场', '大远景', '夜景', '逆光', '群像', '悬疑', '运动镜头', '色彩搭配'];

  async function walk(dirPath, parentRel) {
    const entries = await fsp.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(dirPath, entry.name);
      const relative = parentRel ? `${parentRel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(absolute, relative);
        continue;
      }
      if (!/\.(png|jpe?g|webp|gif)$/i.test(entry.name)) continue;

      // Determine kind and theme from directory structure
      // import_images/shots/<theme>/file.*  → kind=shot, theme=<theme>
      // import_images/storyboard/<theme>/file.* → kind=storyboard, theme=<theme>
      // import_images/<theme>/file.* → kind=shot (legacy)
      // import_images/file.* → kind=shot, theme=cinematic
      let kind = 'shot';
      let theme = 'cinematic';
      const parts = (relative || '').replace(/\\/g, '/').split('/');
      if (parts.length >= 2) {
        const dir0 = parts[0].toLowerCase();
        const dir1 = parts[1];
        if ((dir0 === 'shots' || dir0 === 'shot') && THEMES.includes(dir1)) {
          kind = 'shot';
          theme = dir1;
        } else if ((dir0 === 'storyboard' || dir0 === 'storyboards') && THEMES.includes(dir1)) {
          kind = 'storyboard';
          theme = dir1;
        } else if (THEMES.includes(dir0)) {
          kind = 'shot';
          theme = dir0;
        }
      }

      candidates.push({
        url: `file://${absolute}`,
        title: entry.name,
        sourceType: 'local_import',
        source: 'Local import',
        kind,
        theme,
        poolType: source.poolType || 'study_frames',
        metadata: { originalPath: absolute },
      });
    }
  }

  await walk(importDir, '');
  return candidates;
}

async function gatherCandidates(config) {
  const all = [];
  for (const source of config.sources || []) {
    if (!source.enabled) continue;
    let candidates = [];
    try {
      if (source.type === 'wikimedia_commons') candidates = await fetchWikimediaCandidates(source);
      else if (source.type === 'wikimedia_category') candidates = await fetchWikimediaCategoryCandidates(source);
      else if (source.type === 'internet_archive') candidates = await fetchInternetArchiveCandidates(source);
      else if (source.type === 'europeana') candidates = await fetchEuropeanaCandidates(source);
      else if (source.type === 'rss_images') candidates = await fetchRssCandidates(source);
      else if (source.type === 'url_list') candidates = await fetchUrlListCandidates(source);
      else if (source.type === 'local_import') candidates = await fetchLocalImportCandidates(source);
      else console.log(`unknown source type: ${source.type}`);
    } catch (error) {
      console.log(`source ${source.type} failed: ${error.message}`);
    }
    console.log(`source ${source.type}: ${candidates.length} candidates`);
    all.push(...candidates);
    await sleep(1000);
  }
  return all;
}

function parseArgs(argv) {
  const args = { limit: 0, source: null };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--limit' && argv[i + 1]) {
      args.limit = Number(argv[i + 1]) || 0;
      i++;
    } else if (arg.startsWith('--limit=')) {
      args.limit = Number(arg.slice(8)) || 0;
    } else if (arg === '--source' && argv[i + 1]) {
      args.source = argv[i + 1];
      i++;
    } else if (arg.startsWith('--source=')) {
      args.source = arg.slice(9);
    }
  }
  return args;
}

async function runFetchImages(argsOverride) {
  await ensureDir(DATA_DIR);
  await ensureDir(RAW_IMAGES_DIR);
  await ensureDir(IMPORT_IMAGES_DIR);
  await ensureDir(IMAGES_DIR);

  const config = loadJson(PHOTO_SOURCES_FILE, { sources: [] });
  let index = await readJson(RAW_INDEX_FILE, []);
  if (!Array.isArray(index)) index = [];

  const args = argsOverride || parseArgs(process.argv);

  // Always scan images/ directory as built-in local source
  // Supports: images/shots/<theme>/, images/storyboard/<theme>/, images/<theme>/
  if (!args.source || args.source === 'local_import') {
    config.sources.push({
      type: 'local_import',
      enabled: true,
      importDir: IMAGES_DIR,
    });
  }

  if (args.source) {
    config.sources = config.sources.filter((s) => s.type === args.source);
  }

  let candidates = await gatherCandidates(config);
  candidates = shuffleArray(candidates);
  const limited = args.limit > 0 ? candidates.slice(0, args.limit) : candidates;

  const results = { downloaded: 0, skipped: 0, failed: 0, details: [] };
  var safeDomains = config.safeDomains || [];
  var blocklistWords = config.blocklistWords || [];
  for (const candidate of limited) {
    const result = await addCandidate(candidate, index, {
      minWidth: config.minImageWidth || MIN_WIDTH,
      minHeight: config.minImageHeight || MIN_HEIGHT,
      safeDomains: safeDomains,
      blocklistWords: blocklistWords,
    });
    if (result.status === 'downloaded') results.downloaded++;
    else if (result.status === 'skipped') results.skipped++;
    else results.failed++;
    results.details.push({ url: canonicalUrl(candidate.url), ...result });
    if (result.status === 'downloaded') {
      await writeJson(RAW_INDEX_FILE, index);
    }
    await sleep(1200);
  }

  await writeJson(RAW_INDEX_FILE, index);
  console.log(`fetch done: ${results.downloaded} downloaded, ${results.skipped} skipped, ${results.failed} failed (total candidates ${limited.length})`);
  return results;
}

if (require.main === module) {
  runFetchImages().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { runFetchImages };
