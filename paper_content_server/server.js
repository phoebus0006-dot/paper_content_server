const fs = require('fs');
const fsp = fs.promises;
const http = require('http');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const sharp = require('sharp');

const ROOT_DIR = __dirname;
const DEFAULT_PORT = 8787;
const DEFAULT_PANEL = 49;
const PANEL_INDEX = 49;
const FRAME_WIDTH = 800;
const FRAME_HEIGHT = 480;
const FRAME_HEADER_BYTES = 10;
const FRAME_PAYLOAD_BYTES = Math.ceil((FRAME_WIDTH * FRAME_HEIGHT) / 2);
const { resolveDisplayMode } = require('./lib/schedule');
const PHOTO_FOOTER_HEIGHT = 56;
const NEWS_HEADER_HEIGHT = 38;
const NEWS_FOOTER_HEIGHT = 18;
const NEWS_MAX_ITEMS = 6;
const NEWS_MIN_ITEMS = 10;
const NEWS_REFRESH_MINUTES = 15;
const NEWS_SHOWN_RECALL_HOURS = 24;
const NEWS_SHOWN_FALLBACK_HOURS = 6;
const NEWS_SHOWN_RETENTION_DAYS = 7;
const DEFAULT_PROVIDER = 'none';
const DEFAULT_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const SHOT_STORYBOARD_PATTERN = ['shot', 'shot', 'storyboard', 'shot', 'shot', 'storyboard'];
const PALETTE = [
  { code: 0, name: 'black', rgb: [0, 0, 0] },
  { code: 1, name: 'white', rgb: [255, 255, 255] },
  { code: 2, name: 'yellow', rgb: [255, 255, 0] },
  { code: 3, name: 'red', rgb: [255, 0, 0] },
  { code: 5, name: 'blue', rgb: [0, 0, 255] },
  { code: 6, name: 'green', rgb: [0, 255, 0] },
];

const PHOTO_THEME_POOL = [
  'cinematic',
  'storyboard',
  'wide_shot',
  'portrait',
  'night',
  'backlight',
  'color',
  'motion',
];

const CATEGORY_PRIORITY = {
  politics: 60,
  international: 58,
  economy: 56,
  business: 54,
  technology: 52,
  tech: 52,
  culture: 50,
  entertainment: 48,
  movies: 47,
  world: 46,
  general: 30,
};

const CATEGORY_COLORS = {
  politics: { bg: '#cc0000', text: '#ffffff' },
  international: { bg: '#0066cc', text: '#ffffff' },
  economy: { bg: '#009900', text: '#ffffff' },
  business: { bg: '#009900', text: '#ffffff' },
  technology: { bg: '#000000', text: '#ffffff' },
  tech: { bg: '#000000', text: '#ffffff' },
  culture: { bg: '#ffcc00', text: '#000000' },
  entertainment: { bg: '#ffcc00', text: '#000000' },
  movies: { bg: '#ffcc00', text: '#000000' },
  world: { bg: '#0066cc', text: '#ffffff' },
  general: { bg: '#000000', text: '#ffffff' },
};

const CATEGORY_LABELS = {
  politics: '政治',
  international: '国际',
  economy: '经济',
  business: '经济',
  technology: '科技',
  tech: '科技',
  culture: '文化娱乐',
  entertainment: '文化娱乐',
  movies: '文化娱乐',
  world: '国际',
  general: '综合',
};

const CATEGORY_KEYWORDS = [
  { category: 'politics', words: ['politic', 'election', 'vote', 'government', 'parliament', 'trump', 'biden', 'macron', '白宫', '国会', '内阁'] },
  { category: 'economy', words: ['econom', 'business', 'market', 'stock', 'finance', 'trade', 'inflation', 'recession', 'gdp', '商业', '经济', '通胀'] },
  { category: 'technology', words: ['tech', 'ai', 'software', 'chip', 'internet', 'security', 'data', 'app', '科技', '人工智能', '芯片', '应用', '鸿蒙', '安卓', 'iOS'] },
  { category: 'culture', words: ['culture', 'art', 'museum', 'book', 'festival', 'music', '电影', '文化', '艺术'] },
  { category: 'entertainment', words: ['movie', 'movies', 'film', 'tv', 'show', 'celebrity', 'entertainment', '娱乐', '影'] },
];

const FONT_STACK = '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif';

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

const APP_CONFIG = loadAppConfig();

const PANEL_SIZES = {
  25: { width: 600, height: 448, name: '5.65 inch F' },
  49: { width: FRAME_WIDTH, height: FRAME_HEIGHT, name: '7.3 inch E6' },
  50: { width: 1200, height: 1600, name: '13.3 inch E6' },
};

const options = parseArgs(process.argv, APP_CONFIG);
const TRANSLATION_PROVIDER = String(process.env.TRANSLATION_PROVIDER || APP_CONFIG.translationProvider || DEFAULT_PROVIDER).toLowerCase();
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const OPENAI_BASE_URL = String(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
const DEEPL_API_KEY = process.env.DEEPL_API_KEY || '';
const DEEPL_API_URL = process.env.DEEPL_API_URL || 'https://api-free.deepl.com/v2/translate';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_API_BASE = String(process.env.GEMINI_API_BASE || '').replace(/\/+$/, '') || (OPENAI_BASE_URL && TRANSLATION_PROVIDER === 'gemini' ? OPENAI_BASE_URL : '');
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const PHOTO_QUANT_MODE = String(process.env.PHOTO_QUANT_MODE || 'clean').toLowerCase();
const DITHERING_ENABLED = PHOTO_QUANT_MODE === 'fs' ? ['1', 'true', 'yes', 'on'].includes(String(process.env.DITHERING ?? APP_CONFIG.dithering ?? '').toLowerCase()) : false;
const PORT = Number(process.env.PORT || APP_CONFIG.port) > 0 ? Number(process.env.PORT || APP_CONFIG.port) : options.port;
const TIMEZONE = String(process.env.TZ || APP_CONFIG.timezone || DEFAULT_TIMEZONE || 'UTC');
const ENABLE_DEBUG_ROUTES = String(process.env.ENABLE_DEBUG_ROUTES || '').toLowerCase() === 'true';

const DATA_DIR = resolveConfiguredPath(APP_CONFIG.dataDir || 'data');
const IMAGES_DIR = resolveConfiguredPath(APP_CONFIG.imageRoot || 'images');
const FEEDS_FILE = resolveConfiguredPath(APP_CONFIG.feedsFile || 'feeds.json');
const NEWS_CACHE_FILE = resolveConfiguredPath(APP_CONFIG.newsCacheFile || path.join(APP_CONFIG.dataDir || 'data', 'news_cache.json'));
const NEWS_ROTATION_FILE = resolveConfiguredPath(APP_CONFIG.newsRotationFile || path.join(APP_CONFIG.dataDir || 'data', 'news_rotation_state.json'));
const LIBRARY_STATE_FILE = resolveConfiguredPath(APP_CONFIG.libraryStateFile || path.join(APP_CONFIG.dataDir || 'data', 'library_state.json'));
const IMAGE_INDEX_FILE = resolveConfiguredPath(APP_CONFIG.imageIndexFile || path.join(APP_CONFIG.dataDir || 'data', 'image_index.json'));
const RAW_IMAGES_DIR = resolveConfiguredPath(APP_CONFIG.rawImagesDir || path.join(APP_CONFIG.dataDir || 'data', 'raw_images'));
const PROCESSED_IMAGES_DIR = resolveConfiguredPath(APP_CONFIG.processedImagesDir || path.join(APP_CONFIG.dataDir || 'data', 'processed_images'));
const IMPORT_IMAGES_DIR = resolveConfiguredPath(APP_CONFIG.importImagesDir || path.join(APP_CONFIG.dataDir || 'data', 'import_images'));

const runtime = {
  feeds: null,
  feedsLoadedAt: 0,
  newsCache: { version: 1, updatedAt: null, translations: {} },
  newsRotation: { version: 1, updatedAt: null, shown: [] },
  libraryState: {
    themeCursor: 0,
    currentTheme: null,
    currentImageIndex: 0,
    remainingThemeSlots: 1,
    lastSlotKey: null,
    lastSwitchDate: null,
    patternIndex: 0,
    currentKind: null,
  },
  imageIndex: [],
  imageIndexLoadedAt: 0,
  cachedFrames: new Map(),
  cachedSnapshots: new Map(),
  refreshPromise: null,
  lastNewsRefreshAt: 0,
  pinnedSnapshots: new Map(),
  renderCount: 0,
  nowProvider: null,
  pinNowProvider: null,
};

async function main() {
  await ensureDir(DATA_DIR);
  await ensureDir(IMAGES_DIR);
  await ensureDir(RAW_IMAGES_DIR);
  await ensureDir(PROCESSED_IMAGES_DIR);
  await ensureDir(IMPORT_IMAGES_DIR);
  runtime.feeds = await loadFeeds();
  runtime.newsCache = await readJson(NEWS_CACHE_FILE, { version: 1, updatedAt: null, translations: {} });
  runtime.newsRotation = await readJson(NEWS_ROTATION_FILE, { version: 1, updatedAt: null, shown: [] });
  runtime.libraryState = await readJson(LIBRARY_STATE_FILE, runtime.libraryState);
  runtime.imageIndex = await loadImageIndex();
  warmRefreshLoop();
  const server = http.createServer(handleRequest);

  const effectiveTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (effectiveTimeZone !== TIMEZONE) {
    console.warn(`WARNING: configured timezone is ${TIMEZONE} but Node.js effective timezone is ${effectiveTimeZone}.`);
    console.warn(`Set TZ=${TIMEZONE} before starting the server, e.g.  $env:TZ="${TIMEZONE}"; node server.js`);
  } else {
    console.log(`Timezone: ${TIMEZONE}`);
  }

  server.listen(PORT, '0.0.0.0', () => {
    const bootstrapState = computeSnapshot(new Date());
    console.log(`NewsPhoto content server listening on port ${PORT}`);
    console.log(`Panel ${bootstrapState.panelIndex}: ${bootstrapState.panelName}, ${bootstrapState.width}x${bootstrapState.height}`);
    console.log(`Default frameId=${bootstrapState.frameId}`);
    console.log(`Content endpoint: http://0.0.0.0:${PORT}/api/state.json`);
    for (const ip of getLocalIPs()) {
      console.log(`  http://${ip}:${PORT}/`);
      console.log(`  http://${ip}:${PORT}/api/state.json`);
      console.log(`  http://${ip}:${PORT}/api/frame.bin`);
      console.log(`  http://${ip}:${PORT}/api/news.json`);
    }
  });

  process.on('SIGINT', () => {
    server.close(() => process.exit(0));
  });
}

function parseArgs(argv, config) {
  const parsed = {
    port: Number(process.env.PORT || config?.port) || DEFAULT_PORT,
    panel: Number(process.env.PANEL_INDEX || config?.panelIndex) || DEFAULT_PANEL,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if ((arg === '--port' || arg === '-p') && next) {
      parsed.port = Number(next);
      i++;
    } else if ((arg === '--panel' || arg === '--panel-index') && next) {
      parsed.panel = Number(next);
      i++;
    } else if (arg.startsWith('--port=')) {
      parsed.port = Number(arg.slice(7));
    } else if (arg.startsWith('--panel=')) {
      parsed.panel = Number(arg.slice(8));
    }
  }

  if (!Number.isFinite(parsed.port) || parsed.port <= 0) parsed.port = DEFAULT_PORT;
  if (!PANEL_SIZES[parsed.panel]) parsed.panel = DEFAULT_PANEL;
  return parsed;
}

function loadAppConfig() {
  const configPath = process.env.CONFIG_FILE || path.join(ROOT_DIR, 'config.json');
  let fileConfig = {};
  try {
    if (fs.existsSync(configPath)) {
      fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (error) {
    console.log(`config load failed from ${configPath}: ${error.message}`);
  }

  return {
    port: Number(process.env.PORT || fileConfig.port || DEFAULT_PORT),
    panelIndex: Number(process.env.PANEL_INDEX || fileConfig.panelIndex || DEFAULT_PANEL),
    imageRoot: process.env.IMAGE_ROOT || fileConfig.imageRoot || 'images',
    dataDir: process.env.DATA_DIR || fileConfig.dataDir || 'data',
    feedsFile: process.env.FEEDS_FILE || fileConfig.feedsFile || 'feeds.json',
    newsCacheFile: process.env.NEWS_CACHE_FILE || fileConfig.newsCacheFile || path.join('data', 'news_cache.json'),
    libraryStateFile: process.env.LIBRARY_STATE_FILE || fileConfig.libraryStateFile || path.join('data', 'library_state.json'),
    translationProvider: String(process.env.TRANSLATION_PROVIDER || fileConfig.translationProvider || DEFAULT_PROVIDER).toLowerCase(),
    dithering: process.env.DITHERING ?? fileConfig.dithering ?? '0',
    timezone: process.env.TZ || fileConfig.timezone || DEFAULT_TIMEZONE,
  };
}

function resolveConfiguredPath(configuredPath) {
  if (!configuredPath) return ROOT_DIR;
  return path.isAbsolute(configuredPath) ? configuredPath : path.join(ROOT_DIR, configuredPath);
}

function getLocalIPs() {
  const results = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const net of entries || []) {
      if (net.family === 'IPv4' && !net.internal) results.push(net.address);
    }
  }
  return results;
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

function readLines(text) {
  return String(text || '').split(/\r?\n/);
}

function sha1(text) {
  return crypto.createHash('sha1').update(String(text || '')).digest('hex');
}

function normalizeText(text) {
  return String(text || '')
    .replace(/[\s\u00A0]+/g, ' ')
    .replace(/^\s+|\s+$/g, '');
}

function decodeEntities(text) {
  return String(text || '')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&nbsp;/gi, ' ');
}

function stripHtml(text) {
  return decodeEntities(
    String(text || '')
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
      .replace(/<[^>]+>/g, ' ')
  );
}

function truncateText(text, maxLength) {
  const source = String(text || '').trim();
  if (source.length <= maxLength) return source;
  return `${source.slice(0, Math.max(0, maxLength - 1))}…`;
}

function truncateByWidth(text, maxColumns) {
  const source = String(text || '').replace(/\s+/g, ' ').trim();
  if (!source) return '';
  let result = '';
  let width = 0;
  for (const char of source) {
    const charWidth = /[\u4e00-\u9fa5\u3040-\u30ff\u3400-\u4dbf]/.test(char) ? 2 : 1;
    if (width + charWidth > maxColumns) {
      if (result.length > 1) result = result.slice(0, -1) + '…';
      return result;
    }
    result += char;
    width += charWidth;
  }
  return result;
}

function fitTextWidth(text, maxColumns) {
  const source = String(text || '').replace(/\s+/g, ' ').trim();
  if (!source) return '';
  let result = '';
  let width = 0;
  for (const char of source) {
    const charWidth = /[\u4e00-\u9fa5\u3040-\u30ff\u3400-\u4dbf]/.test(char) ? 2 : 1;
    if (width + charWidth > maxColumns) return result;
    result += char;
    width += charWidth;
  }
  return result;
}

function escapeXml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function parseDate(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? new Date(time) : new Date();
}

function extractAttribute(attributeText, attributeName) {
  const match = String(attributeText || '').match(new RegExp(`\\b${escapeRegex(attributeName)}=["']([^"']+)["']`, 'i'));
  return match ? decodeEntities(match[1]) : '';
}

function formatDateParts(date, timeZone = TIMEZONE) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(new Date(date));
  } catch {
    parts = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(new Date(date));
  }
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour,
    minute: map.minute,
    second: map.second,
  };
}

function formatDateTime(date) {
  const parts = formatDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

function formatIsoLocal(date) {
  const value = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

function formatDateKey(date) {
  const parts = formatDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function formatDateTimeWithSeconds(date) {
  const parts = formatDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function formatLocalTimeLabel(date) {
  const parts = formatDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

function getWallTime(date, timeZone = TIMEZONE) {
  const parts = formatDateParts(date, timeZone);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function getTimeZoneOffsetMinutes(date, timeZone = TIMEZONE) {
  const utcString = date.toLocaleString('en-US', { timeZone: 'UTC' });
  const tzString = date.toLocaleString('en-US', { timeZone });
  const utcDate = new Date(utcString);
  const tzDate = new Date(tzString);
  return (utcDate.getTime() - tzDate.getTime()) / 60000;
}

function dateFromWallTime({ year, month, day, hour, minute, second }, timeZone = TIMEZONE) {
  let candidate = new Date(Date.UTC(year, month - 1, day, hour, minute, second || 0));
  for (let attempt = 0; attempt < 3; attempt++) {
    const offsetMinutes = getTimeZoneOffsetMinutes(candidate, timeZone);
    candidate = new Date(Date.UTC(year, month - 1, day, hour, minute, second || 0) + offsetMinutes * 60000);
    const wall = getWallTime(candidate, timeZone);
    if (
      wall.year === year &&
      wall.month === month &&
      wall.day === day &&
      wall.hour === hour &&
      wall.minute === minute
    ) {
      return candidate;
    }
  }
  return candidate;
}

function canonicalUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    for (const key of [...parsed.searchParams.keys()]) {
      if (/utm_|fbclid|gclid|ref|cmp|spm|ncid|session/i.test(key)) parsed.searchParams.delete(key);
    }
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return String(url).trim();
  }
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

function classifyCategory(feedCategory, title, summary) {
  const base = String(feedCategory || '').toLowerCase();
  const haystack = `${title || ''} ${summary || ''}`.toLowerCase();
  for (const item of CATEGORY_KEYWORDS) {
    if (item.words.some((word) => {
      const w = String(word || '').toLowerCase();
      if (/[\u4e00-\u9fa5]/.test(w)) return haystack.includes(w);
      return new RegExp(`\\b${escapeRegex(w)}\\b`, 'i').test(haystack);
    })) return item.category;
  }
  if (base) return base;
  return 'general';
}

function categoryPriority(category) {
  return CATEGORY_PRIORITY[String(category || '').toLowerCase()] || 10;
}

function escapeRegex(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractTag(xml, tagName) {
  const escapedTagName = escapeRegex(tagName);
  const patterns = [
    new RegExp(`<${escapedTagName}[^>]*>([\\s\\S]*?)<\\/${escapedTagName}>`, 'i'),
    new RegExp(`<[^:>]+:${escapedTagName}[^>]*>([\\s\\S]*?)<\\/[^:>]+:${escapedTagName}>`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = xml.match(pattern);
    if (match) return stripHtml(match[1]);
  }
  return '';
}

function extractLink(xml) {
  const linkMatch = xml.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  if (linkMatch) return decodeEntities(linkMatch[1].trim());
  const directMatch = xml.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
  if (directMatch) return decodeEntities(stripHtml(directMatch[1]).trim());
  return '';
}

function extractItems(xml) {
  const items = [];
  for (const match of xml.matchAll(/<item[\s\S]*?<\/item>/gi)) items.push(match[0]);
  for (const match of xml.matchAll(/<entry[\s\S]*?<\/entry>/gi)) items.push(match[0]);
  return items;
}

function parseFeedXml(xmlText, feed) {
  const xml = String(xmlText || '');
  const items = extractItems(xml);
  const articles = [];
  for (const item of items) {
    const title = extractTag(item, 'title');
    const summary = extractTag(item, 'description') || extractTag(item, 'summary') || extractTag(item, 'content') || extractTag(item, 'content:encoded') || extractTag(item, 'media:description') || extractTag(item, 'media:title');
    const content = extractTag(item, 'content:encoded') || extractTag(item, 'media:description') || extractTag(item, 'content') || summary;
    const link = canonicalUrl(extractLink(item));
    const publishedAt = parseDate(extractTag(item, 'pubDate') || extractTag(item, 'published') || extractTag(item, 'updated'));
    const category = classifyCategory(feed.category, title, `${summary} ${content}`);
    articles.push({
      source: feed.source,
      sourceCountry: feed.country,
      sourceCategory: feed.category,
      feedId: feed.id,
      language: feed.language,
      url: link,
      title: normalizeText(title),
      summary: normalizeText(stripHtml(summary || content)),
      rawContent: normalizeText(stripHtml(content !== summary ? content : '')),
      publishedAt: publishedAt.toISOString(),
      category,
      weight: Number(feed.weight) || 1,
    });
  }
  return articles;
}

function parseJsonFeed(jsonText, feed) {
  let data;
  try {
    data = JSON.parse(jsonText);
  } catch {
    return [];
  }
  const candidates = Array.isArray(data)
    ? data
    : Array.isArray(data.items)
      ? data.items
      : Array.isArray(data.data)
        ? data.data
        : [];
  return candidates.map((item) => {
    const title = normalizeText(item.title || item.headline || item.name || '');
    const summary = normalizeText(stripHtml(item.description || item.summary || item.content || item.excerpt || ''));
    const contentText = normalizeText(stripHtml(item.content || item.content_html || item.summary || item.description || ''));
    const url = canonicalUrl(item.url || item.link || item.canonicalUrl || '');
    const publishedAt = parseDate(item.publishedAt || item.datePublished || item.pubDate || item.date || item.updated || new Date());
    const category = classifyCategory(feed.category, title, summary);
    return {
      source: feed.source,
      sourceCountry: feed.country,
      sourceCategory: feed.category,
      feedId: feed.id,
      language: feed.language,
      url,
      title,
      summary,
      rawContent: contentText !== summary ? contentText : '',
      publishedAt: publishedAt.toISOString(),
      category,
      weight: Number(feed.weight) || 1,
    };
  });
}

async function fetchText(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': 'NewsPhoto_esp32wf/1.0',
        accept: 'application/rss+xml, application/xml, text/xml, application/json, text/plain;q=0.9, */*;q=0.8',
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function loadFeeds() {
  const raw = await readJson(FEEDS_FILE, null);
  if (!raw) return [];
  const feeds = Array.isArray(raw) ? raw : raw.feeds;
  if (!Array.isArray(feeds)) return [];
  return feeds.filter((feed) => feed && feed.id && feed.source && feed.country && feed.category && feed.language && feed.url);
}

async function refreshFeeds() {
  const feeds = await loadFeeds();
  runtime.feeds = feeds;
  runtime.feedsLoadedAt = Date.now();
  return feeds;
}

async function loadNewsCandidates() {
  if (!runtime.feeds || !runtime.feeds.length || Date.now() - runtime.feedsLoadedAt > 10 * 60 * 1000) {
    await refreshFeeds();
  }

  const fetched = await Promise.all(runtime.feeds.map(async (feed) => {
    try {
      const text = await fetchText(feed.url);
      const trimmed = text.trim();
      if (!trimmed) return [];
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) return parseJsonFeed(trimmed, feed);
      return parseFeedXml(trimmed, feed);
    } catch (error) {
      console.log(`feed fetch failed [${feed.id}] ${feed.url}: ${error.message}`);
      return [];
    }
  }));

  const all = fetched.flat();
  all.sort((left, right) => {
    const score = (categoryPriority(right.category) + Number(right.weight || 0)) - (categoryPriority(left.category) + Number(left.weight || 0));
    if (score !== 0) return score;
    return Date.parse(right.publishedAt) - Date.parse(left.publishedAt);
  });

  const unique = [];
  for (const article of all) {
    const normalizedTitle = normalizeText(article.title).toLowerCase();
    const normalizedUrl = canonicalUrl(article.url);
    const duplicate = unique.some((existing) => {
      if (normalizedUrl && canonicalUrl(existing.url) === normalizedUrl) return true;
      const similarity = bigramDice(normalizedTitle, normalizeText(existing.title).toLowerCase());
      return similarity >= 0.88;
    });
    if (!duplicate) unique.push(article);
  }

  unique.sort((left, right) => {
    const score = (categoryPriority(right.category) + Number(right.weight || 0)) - (categoryPriority(left.category) + Number(left.weight || 0));
    if (score !== 0) return score;
    return Date.parse(right.publishedAt) - Date.parse(left.publishedAt);
  });

  return unique;
}

function categoryForRotation(category) {
  const base = String(category || '').toLowerCase();
  if (['politics', 'international', 'world'].includes(base)) return 'politics';
  if (['economy', 'business'].includes(base)) return 'economy';
  if (['technology', 'tech'].includes(base)) return 'technology';
  if (['culture', 'entertainment', 'movies'].includes(base)) return 'culture';
  return base || 'general';
}

function titleHash(title) {
  return sha1(normalizeText(title).toLowerCase());
}

function isRecentlyShown(article, sinceHours) {
  const cutoff = Date.now() - sinceHours * 60 * 60 * 1000;
  const url = canonicalUrl(article.url);
  const hash = titleHash(article.title);
  return runtime.newsRotation.shown.some((entry) => {
    if (entry.shownAt && Date.parse(entry.shownAt) < cutoff) return false;
    if (url && canonicalUrl(entry.url) === url) return true;
    return entry.titleHash === hash;
  });
}

function filterByRotation(candidates, minHours) {
  return candidates.filter((article) => !isRecentlyShown(article, minHours));
}

function selectNewsItems(candidates, slotKey) {
  let pool = filterByRotation(candidates, NEWS_SHOWN_RECALL_HOURS);
  if (pool.length < NEWS_MIN_ITEMS) {
    pool = filterByRotation(candidates, NEWS_SHOWN_FALLBACK_HOURS);
  }

  const byCategory = new Map();
  for (const article of pool) {
    const group = categoryForRotation(article.category);
    if (!byCategory.has(group)) byCategory.set(group, []);
    byCategory.get(group).push(article);
  }

  for (const list of byCategory.values()) {
    list.sort((left, right) => {
      const score = categoryPriority(right.category) - categoryPriority(left.category);
      if (score !== 0) return score;
      return Date.parse(right.publishedAt) - Date.parse(left.publishedAt);
    });
  }

  const selected = [];
  const usedUrls = new Set();
  const usedHashes = new Set();

  function takeOne(group) {
    const list = byCategory.get(group) || [];
    for (let i = 0; i < list.length; i++) {
      const article = list[i];
      const url = canonicalUrl(article.url);
      const hash = titleHash(article.title);
      if (usedUrls.has(url) || usedHashes.has(hash)) continue;
      selected.push(article);
      if (url) usedUrls.add(url);
      usedHashes.add(hash);
      list.splice(i, 1);
      return true;
    }
    return false;
  }

  takeOne('politics');
  takeOne('economy');
  takeOne('technology');
  takeOne('culture');

  const roundRobinGroups = ['politics', 'economy', 'technology', 'culture', 'general'];
  const pointers = new Map(roundRobinGroups.map((group) => [group, 0]));

  while (selected.length < NEWS_MAX_ITEMS) {
    let addedInRound = false;
    for (const group of roundRobinGroups) {
      const list = byCategory.get(group) || [];
      let pointer = pointers.get(group) || 0;
      while (pointer < list.length) {
        const article = list[pointer];
        pointer++;
        const url = canonicalUrl(article.url);
        const hash = titleHash(article.title);
        if (usedUrls.has(url) || usedHashes.has(hash)) continue;
        selected.push(article);
        if (url) usedUrls.add(url);
        usedHashes.add(hash);
        addedInRound = true;
        break;
      }
      pointers.set(group, pointer);
      if (selected.length >= NEWS_MAX_ITEMS) break;
    }
    if (!addedInRound) break;
  }

  if (selected.length < NEWS_MIN_ITEMS) {
    const fallbackPool = candidates.filter((article) => {
      const url = canonicalUrl(article.url);
      const hash = titleHash(article.title);
      return !usedUrls.has(url) && !usedHashes.has(hash);
    });
    while (selected.length < NEWS_MIN_ITEMS && fallbackPool.length) {
      const article = fallbackPool.shift();
      const url = canonicalUrl(article.url);
      const hash = titleHash(article.title);
      if (usedUrls.has(url) || usedHashes.has(hash)) continue;
      selected.push(article);
      if (url) usedUrls.add(url);
      usedHashes.add(hash);
    }
  }

  selected.sort((left, right) => {
    const order = { politics: 0, economy: 1, technology: 2, culture: 3, general: 4 };
    const leftGroup = categoryForRotation(left.category);
    const rightGroup = categoryForRotation(right.category);
    const orderDiff = (order[leftGroup] ?? 9) - (order[rightGroup] ?? 9);
    if (orderDiff !== 0) return orderDiff;
    return Date.parse(right.publishedAt) - Date.parse(left.publishedAt);
  });

  return selected;
}

async function recordShownItems(items, slotKey) {
  const now = new Date().toISOString();
  const retentionCutoff = Date.now() - NEWS_SHOWN_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  runtime.newsRotation.shown = runtime.newsRotation.shown.filter((entry) => {
    return entry.shownAt && Date.parse(entry.shownAt) >= retentionCutoff;
  });

  for (const item of items) {
    runtime.newsRotation.shown.push({
      url: canonicalUrl(item.url),
      titleHash: titleHash(item.title),
      title: truncateText(item.title, 120),
      category: item.category,
      slotKey,
      shownAt: now,
    });
  }

  runtime.newsRotation.updatedAt = now;
  await writeJson(NEWS_ROTATION_FILE, runtime.newsRotation).catch((error) => {
    console.log(`news rotation state write failed: ${error.message}`);
  });
}

const BLOCKLIST_WORDS = /porn|nude|nudity|naked|sex|sexy|erotic|adult|bikini|lingerie|nsfw|xxx|model|glamour|swimsuit|裸|色情|成人|性感|比基尼|内衣|写真|私房/gi;

function rewriteNewsTitle(article) {
  let title = String(article.zhTitle || article.title || '');
  if (!title.trim()) return '新闻';

  title = title.replace(/[「『【】」』]/g, ' ').trim();
  title = title.replace(/^[-–—|•\s]+|[-–—|•\s]+$/g, '').trim();
  title = title.replace(/^(Live|LIVE|Breaking|BREAKING|Update|UPDATES)\s*[:\|–—-]\s*/g, '');
  title = title.replace(/\s*[-–—|]\s*(Live|LIVE|Breaking|BREAKING|Update|UPDATES|Opinion|Commentary|Analysis|The New York Times|Le Monde|NPR|France 24|WSJ|BBC)(\s|$)/gi, '');
  title = title.replace(/^(消息称|传|报道称|据悉|据透露)\s*/, '').trim();
  title = title.replace(/^受[\u4e00-\u9fff，,、\s]+[，,]\s*/g, '');
  title = title.replace(/^在[\u4e00-\u9fff，,、\s]+[，,]\s*/g, '');
  title = title.replace(/^据[\u4e00-\u9fff]+[报道称示]\s*/g, '');

  title = title.replace(/[|｜]\s*(What|Opinion|Commentary|Analysis|News|Breaking|Live|Update|Review|The New York Times|Le Monde|NPR|France 24|WSJ|BBC|Reuters|AP|AFP)[^|｜\u4e00-\u9fff]*$/gi, '');
  title = title.replace(/\s*[（(]\s*(更新中|图|视频|音频|完整版|现场)\s*[）)]/g, '');
  title = title.replace(/\s*\[(圖|图|视频|音频|完整版|更新)\]\s*/g, '');
  title = title.replace(/\s{2,}/g, ' ').trim();

  if (!/[\u4e00-\u9fff]/.test(title)) {
    if (title.length > 40) {
      const parts = title.split(/[-–—:;,]/);
      if (parts[0].trim().length > 10) title = parts[0].trim();
      if (title.length > 35) title = title.split(/\s+/).slice(0, 6).join(' ');
    }
    if (title.length > 55) title = title.slice(0, 55);
    return title || '新闻';
  }

  const tChars = [...title];
  if (tChars.length <= 22) return title;

  if (tChars.length <= 24) {
    const trailMatch = title.match(/[A-Za-z][a-z]{0,3}$/);
    if (trailMatch && trailMatch.index > 0) {
      const before = title.slice(0, trailMatch.index).trim();
      if (before.length >= 8) return before;
    }
    return title;
  }

  const boundaryChars = ['。', '！', '？', '；', '：', '，', '|', '｜', '—', '–', '·'];
  const chars = [...title];
  const endLimit = Math.min(24, chars.length);
  let bestCut = -1;
  let bestScore = -1;

  for (let pos = endLimit; pos >= 12; pos--) {
    const ch = chars[pos];
    const idx = boundaryChars.indexOf(ch);
    if (idx >= 0) {
      const score = idx < 3 ? 10 : idx < 5 ? 7 : 4;
      if (score > bestScore) { bestScore = score; bestCut = pos; }
    }
  }

  if (bestCut > 0) {
    title = chars.slice(0, bestCut).join('').trim();
    if (title.endsWith('，') || title.endsWith('：')) title = title.slice(0, -1).trim();
    return title || '新闻';
  }

  const commaEnd = chars.slice(0, endLimit).lastIndexOf('，');
  if (commaEnd > 12) return chars.slice(0, commaEnd).join('').trim();

  const midCut = chars.slice(0, endLimit).join('');
  const lastDigitMatch = midCut.match(/\d+$/);
  if (lastDigitMatch && lastDigitMatch.index > 12) {
    title = midCut.slice(0, lastDigitMatch.index).trim();
    if (title) return title;
  }

  const badEndings = /(的|为|在|向|与|和|及|将|以|从|对|把|被|让|给|由|于|关于|成为|进行|宣布|宣布将|认定|推出|属于|位于|进入|使用|要求|开始)$/;
  const danglingInvestment = /(计划|拟|将|准备|继续|开始|推进|加大|扩大)投资$/;
  let candidate = chars.slice(0, endLimit).join('').trim();
  for (let shrink = 2; shrink < 8 && [...candidate].length > 12; shrink++) {
    if (badEndings.test(candidate)) candidate = chars.slice(0, endLimit - shrink).join('').trim();
    else break;
  }

  const subjectMissing = /^[\d.万元%美元欧元¥\s]+$/.test(candidate.replace(/[，,、\s]/g, '')) || /^[预]?(售|约|计)\s/.test(candidate);
  const danglingCausative = /(让|使|令|帮助|助)[^，。！？，\s]{1,8}$/.test(candidate);
  if ((subjectMissing || danglingCausative) && article.title && article.title !== candidate) {
    candidate = String(article.title).trim();
    if (candidate && [...candidate].length <= 24) return candidate;
    const c = [...candidate];
    const lim = Math.min(24, c.length);
    for (let p = lim; p >= 12; p--) {
      const ch = c[p];
      if (['。', '！', '？', '；', '：', '，', '|', '｜'].indexOf(ch) >= 0) return c.slice(0, p).join('').trim();
    }
    const commaEnd = c.slice(0, lim).lastIndexOf('，');
    if (commaEnd > 12) return c.slice(0, commaEnd).join('').trim();
    const lastDigit = candidate.match(/\d+$/);
    if (lastDigit && lastDigit.index > 12) {
      const cleaned = candidate.slice(0, lastDigit.index).trim();
      if (cleaned) return cleaned;
    }
    return c.slice(0, Math.min(lim, 22)).join('').trim() || '新闻';
  }

  return candidate || '新闻';
}

function rewriteNewsSummary(article) {
  let raw = String(article.zhSummary || article.summary || '');
  if (!raw.trim() && article.rawContent) raw = article.rawContent;
  if (!raw.trim()) return '';

  raw = raw.replace(/\s*\(?(?:Photo|Image|Picture|Credit|Source|AP|Reuters|AFP|Getty|EPA|Bloomberg)[^。)（]*?\)?\.?\s*/g, '');
  raw = raw.replace(/\s*Continue reading\.\.\..*$/gi, '');
  raw = raw.replace(/\s*Sign up for.*?email\s*$/gi, '');
  raw = raw.replace(/\s*Read more\s*$/gi, '');
  raw = raw.replace(/\s*This article was.*?\.\s*$/gi, '');
  raw = raw.replace(/^.*?\d{1,2}\s*月\s*\d{1,2}\s*日\s*.*?(消息|报道|讯)[，。、]?\s*/g, '');
  raw = raw.replace(/^\d{1,2}\s*月\s*\d{1,2}\s*日[，,]\s*/g, '');
  raw = raw.replace(/^[\u4e00-\u9fff\w]+?(?:获悉|讯)[，,:]\s*/g, '');
  raw = raw.replace(/^据[\u4e00-\u9fff]*?\d{1,2}月\d{1,2}日[报道称]+\s*/g, '');
  raw = raw.replace(/本文约\d+字.*?$/gm, '');
  raw = raw.replace(/建议阅读[^。]*。/g, '');
  raw = raw.replace(/[（(]\s*作者[：:][^)）]+[)）]/g, '');
  raw = raw.replace(/[（(]\s*编辑[：:][^)）]+[)）]/g, '');
  raw = raw.replace(/图源[：:][^。]*。/g, '');
  raw = raw.replace(/^[-–—|•\s]+/g, '').trim();

  let s = raw;
  const totalRawLen = [...raw].length;

  if (totalRawLen < 45 && article.rawContent && [...article.rawContent].length > totalRawLen) {
    let rc = String(article.rawContent).trim();
    rc = rc.replace(/^.*?\d{1,2}\s*月\s*\d{1,2}\s*日\s*.*?(消息|报道|讯)[，。、]?\s*/g, '');
    rc = rc.replace(/^\d{1,2}\s*月\s*\d{1,2}\s*日[，,]\s*/g, '');
    rc = rc.replace(/^[\u4e00-\u9fff\w]+?(?:获悉|讯)[，,:]\s*/g, '');
    rc = rc.replace(/^[-–—|•\s]+/g, '').trim();
    if ([...rc].length > totalRawLen + 5) s = rc;
  }

  const chars = [...s];
  if (chars.length <= 70) return s;

  const sentenceEnds = ['。', '！', '？', '；'];
  const sentences = [];
  let currentStart = 0;
  for (let i = 0; i < chars.length; i++) {
    if (sentenceEnds.indexOf(chars[i]) >= 0) {
      sentences.push(chars.slice(currentStart, i + 1).join(''));
      currentStart = i + 1;
    }
  }
  if (currentStart < chars.length) sentences.push(chars.slice(currentStart).join(''));

  let result = '';
  for (const sent of sentences) {
    const nextLen = [...result + sent].length;
    if (nextLen <= 70) { result += sent; }
    else if ([...result].length >= 45) break;
    else {
      const needed = 45 - [...result].length;
      const charsNeeded = Math.min(needed + 5, [...sent].length);
      const clauseMatch = sent.slice(0, Math.max(charsNeeded, 10));
      const lastClause = Math.max(clauseMatch.lastIndexOf('，'), clauseMatch.lastIndexOf('、'));
      if (lastClause > 3 && [...result + clauseMatch.slice(0, lastClause)].length <= 70) {
        result += clauseMatch.slice(0, lastClause) + '。';
      } else {
        result += sent.slice(0, Math.min(charsNeeded, [...sent].length));
        if (!result.endsWith('。') && !result.endsWith('！') && !result.endsWith('？')) result += '。';
      }
      break;
    }
  }

  if ([...result].length < 45 && sentences.length > 0) {
    if (sentences[0] && [...sentences[0]].length > 75) {
      const first = [...sentences[0]];
      const cut = first.slice(0, 70).join('');
      const lastP = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('！'), cut.lastIndexOf('？'), cut.lastIndexOf('；'), cut.lastIndexOf('，'));
      if (lastP > 15) result = first.slice(0, lastP + 1).join('');
      else result = first.slice(0, 65).join('') + '。';
    } else {
      result = sentences.slice(0, Math.min(2, sentences.length)).join('');
      if ([...result].length > 75) result = sentences[0];
    }
  }

  result = result.replace(/\s{2,}/g, ' ').trim();
  return result || s.replace(/\s{2,}/g, ' ').trim();
}

function translationCacheKey(article) {
  return sha1([TRANSLATION_PROVIDER, article.language, article.source, article.url || article.title, article.title, article.summary].join('|'));
}

async function translateArticle(article) {
  const language = String(article.language || '').toLowerCase();
  if (!language || language.startsWith('zh')) {
    return {
      ...article,
      originalTitle: article.title,
      originalSummary: article.summary,
      zhTitle: article.title,
      zhSummary: article.summary,
      translationStatus: 'original',
    };
  }

  if (TRANSLATION_PROVIDER === 'none') {
    console.log(`translation disabled, using original text for ${article.source}: ${article.title || article.url || ''}`);
    return {
      ...article,
      originalTitle: article.title,
      originalSummary: article.summary,
      zhTitle: article.title,
      zhSummary: article.summary,
      translationStatus: 'disabled',
    };
  }

  if (TRANSLATION_PROVIDER === 'openai' && !OPENAI_API_KEY) {
    return {
      ...article,
      originalTitle: article.title,
      originalSummary: article.summary,
      zhTitle: article.title,
      zhSummary: article.summary,
      translationStatus: 'missing-key',
    };
  }

  if (TRANSLATION_PROVIDER === 'gemini' && !GEMINI_API_KEY && !OPENAI_API_KEY) {
    return {
      ...article,
      originalTitle: article.title,
      originalSummary: article.summary,
      zhTitle: article.title,
      zhSummary: article.summary,
      translationStatus: 'missing-key',
    };
  }

  if (TRANSLATION_PROVIDER === 'deepl' && !DEEPL_API_KEY) {
    return {
      ...article,
      originalTitle: article.title,
      originalSummary: article.summary,
      zhTitle: article.title,
      zhSummary: article.summary,
      translationStatus: 'missing-key',
    };
  }

  const cacheKey = translationCacheKey(article);
  const cached = runtime.newsCache.translations?.[cacheKey];
  if (cached) {
    return {
      ...article,
      originalTitle: article.title,
      originalSummary: article.summary,
      zhTitle: cached.zhTitle || article.title,
      zhSummary: cached.zhSummary || article.summary,
      translationStatus: 'cached',
    };
  }

  try {
    const translated = await translateWithProvider(article);
    runtime.newsCache.translations = runtime.newsCache.translations || {};
    runtime.newsCache.translations[cacheKey] = {
      ...translated,
      provider: TRANSLATION_PROVIDER,
      updatedAt: new Date().toISOString(),
    };
    runtime.newsCache.updatedAt = new Date().toISOString();
    await writeJson(NEWS_CACHE_FILE, runtime.newsCache).catch((error) => {
      console.log(`news cache write failed: ${error.message}`);
    });
    return {
      ...article,
      originalTitle: article.title,
      originalSummary: article.summary,
      zhTitle: translated.zhTitle || article.title,
      zhSummary: translated.zhSummary || article.summary,
      translationStatus: 'translated',
    };
  } catch (error) {
    console.log(`translation failed [${article.source}] ${article.url || article.title}: ${error.message}`);
    return {
      ...article,
      originalTitle: article.title,
      originalSummary: article.summary,
      zhTitle: article.title,
      zhSummary: article.summary,
      translationStatus: 'failed',
    };
  }
}

async function translateWithProvider(article) {
  if (TRANSLATION_PROVIDER === 'openai') {
    if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing');
    const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${OPENAI_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: '将新闻翻译并重写成简体中文简报。标题限制在25个汉字以内，必须是一行能读完的完整句子。摘要控制在80个汉字以内，保留核心事实。只返回JSON：{"zhTitle":"...","zhSummary":"..."}',
          },
          { role: 'user', content: JSON.stringify({ title: article.title, summary: article.summary, source: article.source, category: article.category }) },
        ],
      }),
    });
    if (!response.ok) throw new Error(`OpenAI HTTP ${response.status}`);
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || '';
    const parsed = parseJsonObject(content) || {};
    return {
      zhTitle: normalizeText(parsed.zhTitle || parsed.title || article.title),
      zhSummary: normalizeText(parsed.zhSummary || parsed.summary || article.summary),
    };
  }

  if (TRANSLATION_PROVIDER === 'deepl') {
    if (!DEEPL_API_KEY) throw new Error('DEEPL_API_KEY missing');
    const params = new URLSearchParams();
    params.set('auth_key', DEEPL_API_KEY);
    params.append('text', article.title);
    params.append('text', article.summary || '');
    params.set('target_lang', 'ZH');
    const response = await fetch(DEEPL_API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    if (!response.ok) throw new Error(`DeepL HTTP ${response.status}`);
    const data = await response.json();
    const translations = Array.isArray(data.translations) ? data.translations.map((item) => normalizeText(item.text)) : [];
    return {
      zhTitle: translations[0] || article.title,
      zhSummary: translations[1] || article.summary,
    };
  }

  if (TRANSLATION_PROVIDER === 'gemini') {
    const apiKey = GEMINI_API_KEY || OPENAI_API_KEY;
    const baseUrl = GEMINI_API_BASE || OPENAI_BASE_URL || 'https://generativelanguage.googleapis.com';
    const model = GEMINI_MODEL;
    if (!apiKey) throw new Error('GEMINI_API_KEY missing');
    const isOpenAICompat = baseUrl.includes('/v1');
    let url, headers, body;
    if (isOpenAICompat) {
      url = `${baseUrl}/chat/completions`;
      headers = { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' };
      body = JSON.stringify({
        model, temperature: 0,
        messages: [
          { role: 'system', content: '将英文/法文新闻改写成简体中文。标题一行短中文(12-18字)，摘要45-75字。只返回JSON：{"title":"...","summary":"..."}' },
          { role: 'user', content: JSON.stringify({ title: article.title, summary: article.summary, source: article.source }) },
        ],
      });
    } else {
      url = `${baseUrl}/v1beta/models/${model}:generateContent?key=${apiKey}`;
      headers = { 'content-type': 'application/json' };
      body = JSON.stringify({
        contents: [{ parts: [{ text: `将英文/法文新闻改写成简体中文。标题：一行短中文(12-18字)，保留核心信息。摘要：45-75字中文，回答：发生了什么、谁相关、影响。\n\n原文标题：${article.title}\n原文摘要：${article.summary}\n来源：${article.source}\n\n只返回JSON：{"title":"...","summary":"..."}` }] }],
        generationConfig: { temperature: 0 },
      });
    }
    const response = await fetch(url, { method: 'POST', headers, body });
    if (!response.ok) throw new Error(`Gemini HTTP ${response.status}`);
    const data = await response.json();
    let content = '';
    if (isOpenAICompat) content = data?.choices?.[0]?.message?.content || '';
    else content = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
    const parsed = parseJsonObject(content) || {};
    return {
      zhTitle: normalizeText(parsed.title || parsed.zhTitle || article.title),
      zhSummary: normalizeText(parsed.summary || parsed.zhSummary || article.summary),
    };
  }

  throw new Error(`Unsupported TRANSLATION_PROVIDER=${TRANSLATION_PROVIDER}`);
}

function parseJsonObject(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const fence = raw.match(/```json\s*([\s\S]*?)\s*```/i);
  const candidate = fence ? fence[1] : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

function evaluateNewsItemQuality(item) {
  const title = item.zhTitle || '';
  const summary = item.zhSummary || '';
  const tLen = [...title].length;
  const sLen = [...summary].length;
  const reasons = { title: [], summary: [] };
  const danglingInvestment = /(计划|拟|将|准备|继续|开始|推进|加大|扩大)投资$/;

  if (!title.trim()) { reasons.title.push('EMPTY_TITLE'); }
  if (tLen > 24) reasons.title.push('TOO_LONG(' + tLen + ')');

  const badEndings = /(的|为|在|向|与|和|及|将|以|从|对|把|被|让|给|由|于|关于|成为|进行|宣布|宣布将|认定|推出|属于|位于|进入|使用|要求|开始)$/;
  if (badEndings.test(title)) reasons.title.push('BAD_END');
  if (danglingInvestment.test(title)) reasons.title.push('DANGLING_INVESTMENT');
  if (/[|｜]\s*(What|Opinion|Update|Live)/i.test(title)) reasons.title.push('RSS_TAIL');
  if (/\d+$/.test(title)) reasons.title.push('DIGIT_END');
  if (/(让|使|令|帮助|助)[^，。！？，\s]{1,8}$/.test(title)) reasons.title.push('DANGLING_CAUSATIVE');
  if (/^[\d.万元%$€¥\s]+$/.test(title.replace(/[，,、\s]/g, '')) || /^[预]?(售|约|计)\s/.test(title)) reasons.title.push('NO_SUBJECT');

  const quotedParts = (title.match(/["「『""』」][^"「『""』」]+["「『""』」]/g) || []);
  const quotedLen = quotedParts.reduce((s, p) => s + [...p].length, 0);
  if (tLen > 0 && quotedLen / tLen > 0.45 && !title.match(/[公司集团全球国际政府美国中国日本欧盟]/)) reasons.title.push('LOW_INFO_QUOTE');

  if (!summary.trim()) reasons.summary.push('EMPTY_SUMMARY');
  if (sLen < 45) reasons.summary.push('SHORT_SUMMARY(' + sLen + ')');
  if (sLen > 75) reasons.summary.push('LONG_SUMMARY(' + sLen + ')');
  if (/(Read more|Continue reading)/i.test(summary)) reasons.summary.push('HAS_READMORE');
  if (/<[^>]+>/.test(summary)) reasons.summary.push('HAS_HTML');

  const titleComplete = reasons.title.length === 0;
  const summaryComplete = reasons.summary.length === 0;
  const summaryFallback = !summaryComplete && sLen > 0 && sLen < 45 && reasons.summary.length <= 1;

  const score = titleComplete ? (summaryComplete ? 100 : summaryFallback ? 50 : 30) : 0;

  return { titleComplete, summaryComplete, summaryFallback, titleReason: reasons.title.join(','), summaryReason: reasons.summary.join(','), score, titleLen: tLen, summaryLen: sLen };
}

async function buildNewsSnapshot(now) {
  const key = `news:${formatDateKey(now)}:${Math.floor(now.getTime() / (NEWS_REFRESH_MINUTES * 60 * 1000))}`;
  if (runtime.cachedSnapshots.has(key)) return runtime.cachedSnapshots.get(key);

  const snapshot = selectPhotoSnapshot(now, runtime.imageIndex || []);
  const slotKey = snapshot.slotKey || `news:${formatDateKey(now)}`;

  const rawItems = await loadNewsCandidates();
  const selected = selectNewsItems(rawItems, slotKey);
  await recordShownItems(selected, slotKey);

  const stats = { rawCandidates: rawItems.length, deduped: 0, evaluated: 0, pass: 0, softPass: 0, rejectTitle: 0, rejectSummary: 0, final: 0, rejects: [] };
  const processed = [];
  const seenKeys = new Map();

  function isDuplicate(entry) {
    const key = (entry.zhTitle || entry.title || '').replace(/[\s]/g, '').toLowerCase().slice(0, 12);
    if (seenKeys.has(key)) return true;
    seenKeys.set(key, true);
    return false;
  }

  const mainPool = [];
  for (const item of selected) {
    const result = await translateArticle(item);
    const lang = String(item.language || '').toLowerCase();
    const isZh = !lang || lang.startsWith('zh');
    const isTranslated = ['translated', 'cached'].includes(result.translationStatus);
    if (isZh || isTranslated) {
      result.zhTitle = rewriteNewsTitle(result);
      result.zhSummary = rewriteNewsSummary(result);
      mainPool.push(result);
    }
  }

  if (mainPool.length < NEWS_MAX_ITEMS) {
    for (const item of rawItems) {
      const lang = String(item.language || '').toLowerCase();
      if (!lang || !lang.startsWith('zh')) continue;
      const key = (item.title || '').replace(/[\s]/g, '').toLowerCase().slice(0, 12);
      if (seenKeys.has(key)) continue;
      seenKeys.set(key, true);
      const entry = { ...item, originalTitle: item.title, originalSummary: item.summary, zhTitle: item.title, zhSummary: item.summary, translationStatus: 'original' };
      entry.zhTitle = rewriteNewsTitle(entry);
      entry.zhSummary = rewriteNewsSummary(entry);
      mainPool.push(entry);
    }
  }

  stats.deduped = mainPool.length;

  const passItems = [];
  const softPassItems = [];

  for (const item of mainPool) {
    stats.evaluated++;
    const quality = evaluateNewsItemQuality(item);
    if (quality.titleComplete && quality.summaryComplete) {
      passItems.push({ item, quality });
      stats.pass++;
    } else if (quality.titleComplete && quality.summaryFallback) {
      softPassItems.push({ item, quality });
      stats.softPass++;
    } else {
      if (!quality.titleComplete) stats.rejectTitle++;
      if (!quality.summaryComplete) stats.rejectSummary++;
      if (stats.rejects.length < 5) {
        stats.rejects.push({ title: item.zhTitle || item.title || '', source: item.source || '', reason: quality.titleReason || quality.summaryReason || 'QUALITY_FAIL' });
      }
    }
  }

  const final = [];
  const sourceCount = new Map();
  function tryAdd(items) {
    for (const { item } of items) {
      if (final.length >= NEWS_MAX_ITEMS) break;
      const src = item.source || '';
      if ((sourceCount.get(src) || 0) >= 2) continue;
      sourceCount.set(src, (sourceCount.get(src) || 0) + 1);
      final.push(item);
    }
  }

  tryAdd(passItems);
  tryAdd(softPassItems);

  if (final.length < NEWS_MAX_ITEMS) {
    for (const item of mainPool) {
      if (final.length >= NEWS_MAX_ITEMS) break;
      const src = item.source || '';
      if ((sourceCount.get(src) || 0) >= 2) continue;
      sourceCount.set(src, (sourceCount.get(src) || 0) + 1);
      final.push(item);
    }
  }

  stats.final = final.length;
  runtime._newsPipelineStats = stats;

  const translationNotice = TRANSLATION_PROVIDER === 'none'
    ? '翻译未启用'
    : ((TRANSLATION_PROVIDER === 'openai' && !OPENAI_API_KEY) || (TRANSLATION_PROVIDER === 'deepl' && !DEEPL_API_KEY) || (TRANSLATION_PROVIDER === 'gemini' && !GEMINI_API_KEY && !OPENAI_API_KEY))
      ? '翻译未配置'
      : '';
  const news = {
    translationProvider: TRANSLATION_PROVIDER,
    translationNotice,
    updatedAt: new Date().toISOString(),
    items: final.map((item) => ({
      originalTitle: item.originalTitle,
      originalSummary: item.originalSummary,
      zhTitle: rewriteNewsTitle(item),
      zhSummary: rewriteNewsSummary(item),
      sourceUrl: item.url,
      source: item.source,
      category: item.category,
      publishedAt: item.publishedAt,
      translationStatus: item.translationStatus,
    })),
    frameId: `news:${sha1(final.map((item) => [item.url, item.originalTitle, item.zhTitle].join('|')).join('||'))}`,
    title: final[0] ? `${final[0].source} / ${final[0].category}` : 'NEWS',
    slotKey,
  };

  runtime.cachedSnapshots.set(key, news);
  return news;
}

async function loadImageIndex() {
  try {
    const data = await readJson(IMAGE_INDEX_FILE, []);
    const entries = Array.isArray(data) ? data : data.images || [];
    runtime.imageIndexLoadedAt = Date.now();
    return entries.filter(isImageReady);
  } catch (error) {
    console.log(`image index load failed: ${error.message}`);
    return [];
  }
}

async function reloadImageIndexIfNeeded() {
  try {
    const stats = await fsp.stat(IMAGE_INDEX_FILE);
    if (stats.mtimeMs > runtime.imageIndexLoadedAt) {
      runtime.imageIndex = await loadImageIndex();
    }
  } catch {
    // image index may not exist yet
  }
}

function isImageReady(entry) {
  if (!entry || !entry.id || !entry.theme) return false;
  if (!entry.processedPngPath || !fs.existsSync(entry.processedPngPath)) return false;
  if (entry.width !== FRAME_WIDTH || entry.height !== FRAME_HEIGHT) return false;
  return true;
}

function getImageKind(entry) {
  return entry && entry.kind === 'storyboard' ? 'storyboard' : 'shot';
}

function groupImagesByKindAndTheme(imageIndex) {
  const result = { shot: new Map(), storyboard: new Map() };
  for (const entry of imageIndex || []) {
    if (!isImageReady(entry)) continue;
    const kind = getImageKind(entry);
    const theme = String(entry.theme || 'unknown').toLowerCase();
    if (!result[kind].has(theme)) result[kind].set(theme, []);
    result[kind].get(theme).push(entry);
  }
  return result;
}

function groupImagesByKind(imageIndex) {
  const result = { shot: [], storyboard: [] };
  for (const entry of imageIndex || []) {
    if (!isImageReady(entry)) continue;
    const kind = getImageKind(entry);
    result[kind].push(entry);
  }
  return result;
}

function themePoolFromKind(imageIndex, kind) {
  const grouped = groupImagesByKindAndTheme(imageIndex);
  const kindMap = grouped[kind] || new Map();
  const pool = [];
  for (const theme of PHOTO_THEME_POOL) {
    if (kindMap.has(theme) && kindMap.get(theme).length) pool.push(theme);
  }
  for (const theme of kindMap.keys()) {
    if (!pool.includes(theme)) pool.push(theme);
  }
  return pool;
}

function groupImagesByTheme(imageIndex) {
  const map = new Map();
  for (const entry of imageIndex || []) {
    if (!isImageReady(entry)) continue;
    const theme = String(entry.theme || 'unknown').toLowerCase();
    if (!map.has(theme)) map.set(theme, []);
    map.get(theme).push(entry);
  }
  return map;
}

function themePoolFromIndex(imageIndex) {
  const grouped = groupImagesByTheme(imageIndex);
  const pool = [];
  for (const theme of PHOTO_THEME_POOL) {
    if (grouped.has(theme) && grouped.get(theme).length) pool.push(theme);
  }
  for (const theme of grouped.keys()) {
    if (!pool.includes(theme)) pool.push(theme);
  }
  return pool.length ? pool : PHOTO_THEME_POOL.slice();
}

function nextThemeFromState(imageIndex, state, daySeed) {
  const pool = themePoolFromIndex(imageIndex);
  if (!pool.length) return null;

  let cursor = Number.isFinite(state.themeCursor) ? state.themeCursor : 0;
  if (state.lastSwitchDate !== formatDateKey(new Date())) {
    cursor = (Math.abs(daySeed) + cursor) % pool.length;
  }

  let theme = null;
  const grouped = groupImagesByTheme(imageIndex);
  for (let attempt = 0; attempt < pool.length; attempt++) {
    const candidate = pool[cursor % pool.length];
    cursor++;
    const images = grouped.get(candidate) || [];
    if (images.length) {
      theme = candidate;
      break;
    }
  }

  return { theme, cursor: cursor % pool.length };
}

function filterRecentImages(images, hours) {
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return images.filter((image) => !image.lastShownAt || Date.parse(image.lastShownAt) < cutoff);
}

function sortByLastShown(images) {
  return [...images].sort((left, right) => {
    const leftTime = left.lastShownAt ? Date.parse(left.lastShownAt) : 0;
    const rightTime = right.lastShownAt ? Date.parse(right.lastShownAt) : 0;
    return leftTime - rightTime;
  });
}

function updateLibraryStateForPhoto(snapshot, imageIndex) {
  const daySeed = Number.parseInt(sha1(snapshot.slotKey).slice(0, 8), 16);
  const state = { ...runtime.libraryState };
  const sameSlot = state.lastSlotKey === snapshot.slotKey;

  // Same slot: return cached selection (preserving kind)
  if (sameSlot && state.currentKind && state.currentTheme) {
    const grouped = groupImagesByKindAndTheme(imageIndex);
    const images = (grouped[state.currentKind]?.get(state.currentTheme) || []);
    if (images.length) {
      const idx = Math.max(0, Math.min(Number(state.currentImageIndex) || 0, images.length - 1));
      return { theme: state.currentTheme, entry: images[idx], state, kind: state.currentKind };
    }
  }

  // New day: reset
  if (state.lastSwitchDate !== formatDateKey(snapshot.nextSwitchAt)) {
    const poolLength = Math.max(1, themePoolFromIndex(imageIndex).length);
    state.patternIndex = Math.abs(daySeed) % SHOT_STORYBOARD_PATTERN.length;
    state.themeCursor = Math.abs(daySeed) % poolLength;
    state.currentKind = null;
    state.currentTheme = null;
    state.currentImageIndex = 0;
    state.remainingThemeSlots = 0;
  }

  const grouped = groupImagesByKindAndTheme(imageIndex);

  // Determine kind from pattern
  let kind = SHOT_STORYBOARD_PATTERN[state.patternIndex % SHOT_STORYBOARD_PATTERN.length];

  // Fallback: if no images for this kind, try the other
  if (!grouped[kind] || !grouped[kind].size) {
    kind = kind === 'shot' ? 'storyboard' : 'shot';
  }

  // Still nothing: NO_IMAGES
  if (!grouped[kind] || !grouped[kind].size) {
    return { theme: 'NO_IMAGES', entry: null, state, kind };
  }

  const kindChanged = state.currentKind !== kind;
  const needsNewTheme = kindChanged || state.remainingThemeSlots <= 0 || !state.currentTheme;

  let theme = state.currentTheme;
  let images = [];

  if (needsNewTheme) {
    if (kind === 'storyboard') {
      // Storyboard: prefer current/previous shot theme
      const shotTheme = state.lastShotTheme || state.currentTheme;
      if (shotTheme && grouped.storyboard.has(shotTheme) && grouped.storyboard.get(shotTheme).length) {
        theme = shotTheme;
      } else if (grouped.storyboard.size) {
        // Any storyboard theme
        const themes = [...grouped.storyboard.keys()];
        const cursor = Math.abs(daySeed + (state.themeCursor || 0)) % themes.length;
        theme = themes[cursor];
      } else {
        // Fallback to shot
        kind = 'shot';
      }
    }

    if (kind === 'shot') {
      const pool = themePoolFromKind(imageIndex, 'shot');
      if (pool.length) {
        const cursor = (state.themeCursor || 0) % pool.length;
        theme = pool[cursor];
        state.themeCursor = (cursor + 1) % pool.length;
        state.lastShotTheme = theme;
      } else if (grouped.shot.size) {
        const themes = [...grouped.shot.keys()];
        theme = themes[(state.themeCursor || 0) % themes.length];
        state.themeCursor = ((state.themeCursor || 0) + 1) % themes.length;
      }
    }

    images = theme ? (grouped[kind]?.get(theme) || []) : [];
    state.currentImageIndex = 0;
    state.remainingThemeSlots = 1 + (Math.abs(daySeed + (state.themeCursor || 0)) % 2);
  } else {
    images = theme ? (grouped[kind]?.get(theme) || []) : [];
  }

  // Last-resort fallback: pick any image from current kind
  if (!theme || !images.length) {
    for (const [t, imgs] of grouped[kind] || []) {
      if (imgs.length) {
        theme = t;
        images = imgs;
        break;
      }
    }
  }

  if (!theme || !images.length) {
    return { theme: 'NO_IMAGES', entry: null, state, kind };
  }

  let pool = filterRecentImages(images, 7 * 24);
  if (!pool.length) pool = sortByLastShown(images);

  const idx = Number.isFinite(state.currentImageIndex) ? state.currentImageIndex % pool.length : 0;
  const entry = pool[idx];
  state.currentTheme = theme;
  state.currentImageIndex = (idx + 1) % pool.length;
  state.remainingThemeSlots = Math.max(0, Number(state.remainingThemeSlots) - 1);
  state.currentKind = kind;
  state.patternIndex = (state.patternIndex + 1) % SHOT_STORYBOARD_PATTERN.length;
  state.lastSlotKey = snapshot.slotKey;
  state.lastSwitchDate = formatDateKey(snapshot.nextSwitchAt);

  return { theme, entry, state, kind };
}

function selectPhotoSnapshot(now, imageIndex = runtime.imageIndex || []) {
  const t = getWallTime(now, TIMEZONE);
  const resolved = resolveDisplayMode(t, TIMEZONE);
  const dateKey = `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`;
  const inDayWindow = t.hour >= 10 && t.hour < 19;
  const slotIndex = inDayWindow ? ((t.hour - 10) * 2) + (t.minute >= 30 ? 1 : 0) : 0;
  const nextSwitchAt = computeNextSwitchAt(now);

  return { mode: resolved.mode, slotIndex, slotKey: resolved.slotKey, nextSwitchAt };
}

// resolveDisplayMode imported from lib/schedule.js

function computeNextSwitchAt(now) {
  const t = getWallTime(now, TIMEZONE);
  let year = t.year;
  let month = t.month;
  let day = t.day;
  let hour = t.hour;
  let minute = 0;

  if (t.hour < 10) {
    hour = 10;
    minute = 30;
  } else if (t.hour >= 19) {
    const next = new Date(Date.UTC(year, month - 1, day + 1, 12));
    const nextWall = getWallTime(next, TIMEZONE);
    year = nextWall.year;
    month = nextWall.month;
    day = nextWall.day;
    hour = 10;
    minute = 30;
  } else if (t.minute < 30) {
    hour = t.hour;
    minute = 30;
  } else if (t.hour === 18) {
    hour = 19;
    minute = 0;
  } else {
    hour = t.hour + 1;
    minute = 0;
  }

  return dateFromWallTime({ year, month, day, hour, minute, second: 0 }, TIMEZONE);
}

async function buildPhotoSnapshot(now) {
  const snapshot = selectPhotoSnapshot(now, runtime.imageIndex || []);
  const selection = updateLibraryStateForPhoto(snapshot, runtime.imageIndex || []);
  runtime.libraryState = selection.state;
  await writeJson(LIBRARY_STATE_FILE, runtime.libraryState).catch((error) => {
    console.log(`library state write failed: ${error.message}`);
  });

  if (selection.entry) {
    selection.entry.lastShownAt = new Date().toISOString();
    selection.entry.shownCount = (selection.entry.shownCount || 0) + 1;
    await writeJson(IMAGE_INDEX_FILE, runtime.imageIndex).catch((error) => {
      console.log(`image index write failed: ${error.message}`);
    });
  }

  const contentId = selection.entry ? selection.entry.id : 'fallback';
  const displayKind = selection.kind || getImageKind(selection.entry) || 'shot';
  const frameId = `photo:${snapshot.slotKey}:${displayKind}:${selection.theme}:${contentId}`;
  const hasImage = !!selection.entry;
  return {
    mode: 'photo',
    kind: displayKind,
    slotKey: snapshot.slotKey,
    nextSwitchAt: snapshot.nextSwitchAt.toISOString(),
    nextSwitchLocal: formatLocalTimeLabel(snapshot.nextSwitchAt),
    timezone: TIMEZONE,
    frameId,
    title: selection.theme || 'PHOTO',
    imageStatus: hasImage ? 'ready' : 'empty',
    imageName: hasImage ? (selection.entry.imageName || path.basename(selection.entry.processedPngPath)) : '',
    imageSource: hasImage ? (selection.entry.source || '') : '',
    imageTheme: hasImage ? selection.entry.theme : '',
    imagePath: hasImage ? selection.entry.processedPngPath : null,
    epfPath: hasImage ? selection.entry.epfPath : null,
  };
}

function createSvgHeader(width, height, body) {
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`);
}

function wrapText(text, maxColumns) {
  const source = String(text || '').replace(/\s+/g, ' ').trim();
  if (!source) return [''];
  const lines = [];
  let current = '';
  let currentWidth = 0;
  for (const char of source) {
    const width = /[\u4e00-\u9fa5\u3040-\u30ff\u3400-\u4dbf]/.test(char) ? 2 : 1;
    if (current && currentWidth + width > maxColumns) {
      lines.push(current);
      current = char;
      currentWidth = width;
    } else {
      current += char;
      currentWidth += width;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function categoryStyle(category) {
  const style = CATEGORY_COLORS[String(category || '').toLowerCase()] || CATEGORY_COLORS.general;
  return style;
}

function renderNewsSvg(news, now) {
  const items = (news.items || []).slice(0, 6);
  if (!items.length) {
    return createSvgHeader(FRAME_WIDTH, FRAME_HEIGHT,
      `<rect width="100%" height="100%" fill="#ffffff"/>
       <text x="20" y="240" font-family="${escapeXml(FONT_STACK)}" font-size="24" fill="#000000">暂无新闻</text>`);
  }

  const HEADER_H = 36;
  const FOOTER_H = 18;
  const MARGIN = 18;
  const COL_GAP = 16;
  const ROW_GAP = 10;
  const cardW = Math.floor((FRAME_WIDTH - MARGIN * 2 - COL_GAP) / 2);
  const cardH = Math.floor((FRAME_HEIGHT - HEADER_H - FOOTER_H - ROW_GAP * 2 - 8) / 3);
  const badgeFont = 10;
  const titleFont = 19;
  const summaryFont = 14;

  const boxes = [];
  boxes.push(`<rect x="0" y="0" width="${FRAME_WIDTH}" height="${FRAME_HEIGHT}" fill="#ffffff"/>`);

  // Header
  boxes.push(`<rect x="0" y="0" width="${FRAME_WIDTH}" height="${HEADER_H}" fill="#000000"/>`);
  boxes.push(`<text x="14" y="25" font-family="${escapeXml(FONT_STACK)}" font-size="16" font-weight="700" fill="#ffffff">简报 NEWS</text>`);
  boxes.push(`<text x="${FRAME_WIDTH - 14}" y="25" text-anchor="end" font-family="${escapeXml(FONT_STACK)}" font-size="12" fill="#ffffff">${escapeXml(formatDateTime(now))}</text>`);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x0 = MARGIN + col * (cardW + COL_GAP);
    const y0 = HEADER_H + 4 + row * (cardH + ROW_GAP);

    const style = categoryStyle(item.category);
    const label = CATEGORY_LABELS[String(item.category || '').toLowerCase()] || item.category || '综合';
    const badgeW = 7 + label.length * 8;
    const badgeH = 14;

    // Card background
    boxes.push(`<rect x="${x0 - 2}" y="${y0}" width="${cardW}" height="${cardH}" fill="#f6f6f6" rx="4"/>`);

    // Row 1: badge + source + time
    boxes.push(`<rect x="${x0 + 2}" y="${y0 + 3}" width="${badgeW}" height="${badgeH}" fill="${style.bg}" rx="2"/>`);
    boxes.push(`<text x="${x0 + 2 + badgeW / 2}" y="${y0 + 3 + 11}" text-anchor="middle" font-family="${escapeXml(FONT_STACK)}" font-size="${badgeFont}" font-weight="700" fill="${style.text}">${escapeXml(label)}</text>`);
    boxes.push(`<text x="${x0 + 2 + badgeW + 5}" y="${y0 + 3 + 11}" font-family="${escapeXml(FONT_STACK)}" font-size="10" fill="#888888">${escapeXml(truncateText(item.source, 8))}</text>`);
    const timeText = formatDateTime(item.publishedAt).slice(11, 16);
    boxes.push(`<text x="${x0 + cardW - 6}" y="${y0 + 3 + 11}" text-anchor="end" font-family="${escapeXml(FONT_STACK)}" font-size="9" fill="#aaaaaa">${escapeXml(timeText)}</text>`);

    // Row 2: title — rewritten one-line, no ellipsis
    const titleMax = Math.floor((cardW - 12) / (titleFont * 0.55));
    const titleText = fitTextWidth(item.zhTitle, titleMax);
    boxes.push(`<text x="${x0 + 4}" y="${y0 + 3 + badgeH + 5 + titleFont}" font-family="${escapeXml(FONT_STACK)}" font-size="${titleFont}" font-weight="700" fill="#111111">${escapeXml(titleText)}</text>`);

    // Row 3-4: summary — 2 lines max
    const sumMax = Math.floor((cardW - 12) / (summaryFont * 0.56));
    const sumLines = wrapText(item.zhSummary, sumMax).slice(0, 2);
    for (let li = 0; li < sumLines.length; li++) {
      boxes.push(`<text x="${x0 + 4}" y="${y0 + 3 + badgeH + 5 + titleFont + 5 + (li + 1) * (summaryFont + 2)}" font-family="${escapeXml(FONT_STACK)}" font-size="${summaryFont}" fill="#444444">${escapeXml(sumLines[li])}</text>`);
    }
  }

  // Footer
  boxes.push(`<rect x="0" y="${FRAME_HEIGHT - FOOTER_H}" width="${FRAME_WIDTH}" height="${FOOTER_H}" fill="#000000"/>`);
  const ftMsg = news.translationNotice || (TRANSLATION_PROVIDER === 'none' || !TRANSLATION_PROVIDER ? '翻译未启用' : '');
  boxes.push(`<text x="10" y="${FRAME_HEIGHT - 4}" font-family="${escapeXml(FONT_STACK)}" font-size="9" fill="#ffffff">${escapeXml(now.toTimeString().slice(0,5))}</text>`);
  if (ftMsg) boxes.push(`<text x="${FRAME_WIDTH - 10}" y="${FRAME_HEIGHT - 4}" text-anchor="end" font-family="${escapeXml(FONT_STACK)}" font-size="9" fill="#ffffff">${escapeXml(ftMsg)}</text>`);

  return createSvgHeader(FRAME_WIDTH, FRAME_HEIGHT, boxes.join(''));
}

async function renderPhotoFrame(selection, now) {
  if (!selection.entry || !selection.entry.processedPngPath || !fs.existsSync(selection.entry.processedPngPath)) {
    return renderPlaceholderFrame('NO IMAGE', now);
  }

  const { data, info } = await (PHOTO_QUANT_MODE === 'clean'
    ? sharp(selection.entry.processedPngPath)
        .resize(FRAME_WIDTH, FRAME_HEIGHT, { fit: 'fill', kernel: 'lanczos3' })
        .flatten({ background: '#ffffff' })
        .modulate({ brightness: 1.03, saturation: 1.15 })
        .blur(0.5)
        .raw()
        .toBuffer({ resolveWithObject: true })
    : sharp(selection.entry.processedPngPath)
        .resize(FRAME_WIDTH, FRAME_HEIGHT, { fit: 'fill' })
        .flatten({ background: '#ffffff' })
        .raw()
        .toBuffer({ resolveWithObject: true }));

  return imageToFrameBuffer(data, info.width, info.height, info.channels);
}

function renderPlaceholderFrame(label, now) {
  const instructions = '请上传图片到 images/shots/<主题>/ 或 images/storyboard/<主题>/';
  const svg = createSvgHeader(
    FRAME_WIDTH,
    FRAME_HEIGHT,
    `<rect width="100%" height="100%" fill="#ffffff"/>
     <text x="40" y="200" font-family="${escapeXml(FONT_STACK)}" font-size="38" font-weight="700" fill="#000000">${escapeXml(label)}</text>
     <text x="40" y="260" font-family="${escapeXml(FONT_STACK)}" font-size="16" fill="#666666">${escapeXml(instructions)}</text>
     <text x="40" y="310" font-family="${escapeXml(FONT_STACK)}" font-size="18" fill="#000000">${escapeXml(formatDateTime(now))}</text>`
  );
  return sharp(svg)
    .resize(FRAME_WIDTH, FRAME_HEIGHT, { fit: 'fill' })
    .flatten({ background: '#ffffff' })
    .raw()
    .toBuffer({ resolveWithObject: true })
    .then(({ data, info }) => imageToFrameBuffer(data, info.width, info.height, info.channels));
}

async function renderNewsFrame(news, now) {
  const svg = renderNewsSvg(news, now);
  const { data, info } = await sharp(svg)
    .resize(FRAME_WIDTH, FRAME_HEIGHT, { fit: 'fill' })
    .flatten({ background: '#ffffff' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return imageToFrameBuffer(data, info.width, info.height, info.channels);
}

function nearestPaletteCode(r, g, b) {
  let best = PALETTE[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const color of PALETTE) {
    const dr = r - color.rgb[0];
    const dg = g - color.rgb[1];
    const db = b - color.rgb[2];
    const distance = dr * dr + dg * dg + db * db;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = color;
    }
  }
  return best.code;
}

function imageToFrameBuffer(raw, width, height, channels) {
  const output = Buffer.alloc(FRAME_PAYLOAD_BYTES, 0x11);
  const pixels = new Float32Array(width * height * 3);
  const inputChannels = Math.max(3, Number(channels) || 3);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelIndex = y * width + x;
      const offset = pixelIndex * inputChannels;
      const p = pixelIndex * 3;
      let r = raw[offset] ?? 255;
      let g = raw[offset + 1] ?? r;
      let b = raw[offset + 2] ?? r;
      if (inputChannels >= 4) {
        const a = raw[offset + 3] ?? 255;
        if (a < 128) {
          r = 255;
          g = 255;
          b = 255;
        }
      }
      pixels[p] = r;
      pixels[p + 1] = g;
      pixels[p + 2] = b;
    }
  }

  const spread = DITHERING_ENABLED;
  const getPixelIndex = (x, y) => (y * width + x) * 3;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = getPixelIndex(x, y);
      let r = pixels[index];
      let g = pixels[index + 1];
      let b = pixels[index + 2];
      const code = nearestPaletteCode(r, g, b);
      const palette = PALETTE.find((item) => item.code === code) || PALETTE[0];
      if (spread) {
        const er = r - palette.rgb[0];
        const eg = g - palette.rgb[1];
        const eb = b - palette.rgb[2];
        distributeError(pixels, width, height, x + 1, y, er, eg, eb, 7 / 16);
        distributeError(pixels, width, height, x - 1, y + 1, er, eg, eb, 3 / 16);
        distributeError(pixels, width, height, x, y + 1, er, eg, eb, 5 / 16);
        distributeError(pixels, width, height, x + 1, y + 1, er, eg, eb, 1 / 16);
      }

      const pixelIndex = y * width + x;
      const byteIndex = Math.floor(pixelIndex / 2);
      if (pixelIndex % 2 === 0) {
        output[byteIndex] = (output[byteIndex] & 0x0F) | ((code & 0x0F) << 4);
      } else {
        output[byteIndex] = (output[byteIndex] & 0xF0) | (code & 0x0F);
      }
    }
  }

  return output;
}

function distributeError(pixels, width, height, x, y, er, eg, eb, factor) {
  if (x < 0 || x >= width || y < 0 || y >= height) return;
  const index = (y * width + x) * 3;
  pixels[index] = clampColor(pixels[index] + er * factor);
  pixels[index + 1] = clampColor(pixels[index + 1] + eg * factor);
  pixels[index + 2] = clampColor(pixels[index + 2] + eb * factor);
}

function clampColor(value) {
  return Math.max(0, Math.min(255, value));
}

function buildFrameBuffer(frameImage) {
  const header = Buffer.alloc(FRAME_HEADER_BYTES);
  header.write('EPF1', 0, 4, 'ascii');
  header.writeUInt16LE(FRAME_WIDTH, 4);
  header.writeUInt16LE(FRAME_HEIGHT, 6);
  header.writeUInt8(PANEL_INDEX, 8);
  header.writeUInt8(1, 9);
  return Buffer.concat([header, frameImage]);
}

function hexPreview(buf, bytes = 32) {
  return Array.from(buf.subarray(0, bytes), (b) => b.toString(16).padStart(2, '0')).join(' ');
}

function computeSnapshot(now) {
  const photoOrNews = selectPhotoSnapshot(now, runtime.imageIndex || []);
  return {
    panelIndex: options.panel,
    panelName: PANEL_SIZES[options.panel].name,
    width: PANEL_SIZES[options.panel].width,
    height: PANEL_SIZES[options.panel].height,
    mode: photoOrNews.mode,
    frameId: `${photoOrNews.mode}:${photoOrNews.slotKey}`,
    title: photoOrNews.mode === 'photo' ? 'PHOTO' : 'NEWS',
    nextSwitchAt: photoOrNews.nextSwitchAt.toISOString(),
    nextSwitchLocal: formatLocalTimeLabel(photoOrNews.nextSwitchAt),
    timezone: TIMEZONE,
    timestamp: now.toISOString(),
    frameUrl: `/api/frame.bin?panel=${options.panel}`,
    currentKind: photoOrNews.mode === 'photo' ? (runtime.libraryState.currentKind || 'shot') : null,
  };
}

async function getContentForNow(now) {
  const snapshot = selectPhotoSnapshot(now, runtime.imageIndex || []);
  if (snapshot.mode === 'news') {
    const news = await buildNewsSnapshot(now);
    const frameId = `${snapshot.mode}:${snapshot.slotKey}:${news.frameId}`;
    const cacheKey = frameId;
    if (!runtime.cachedFrames.has(cacheKey)) {
      const frame = buildFrameBuffer(await renderNewsFrame({ ...news, nextSwitchAt: snapshot.nextSwitchAt }, now));
      runtime.cachedFrames.set(cacheKey, { frame, payload: news, snapshot: { ...snapshot, frameId, title: news.title } });
    }
    const cached = runtime.cachedFrames.get(cacheKey);
    return {
      snapshot: {
        panelIndex: options.panel,
        panelName: PANEL_SIZES[options.panel].name,
        width: FRAME_WIDTH,
        height: FRAME_HEIGHT,
        mode: 'news',
        frameId,
        title: news.title,
        nextSwitchAt: snapshot.nextSwitchAt.toISOString(),
        nextSwitchLocal: formatLocalTimeLabel(snapshot.nextSwitchAt),
        timezone: TIMEZONE,
        timestamp: now.toISOString(),
        items: news.items,
        translationProvider: news.translationProvider,
        translationNotice: news.translationNotice,
      },
      frame: cached.frame,
      news,
    };
  }

  const photo = await buildPhotoSnapshot(now);
  const cacheKey = photo.frameId;
  if (!runtime.cachedFrames.has(cacheKey)) {
    const selection = { entry: null, theme: photo.title || null, kind: photo.kind || 'shot' };
    if (photo.imagePath && fs.existsSync(photo.imagePath)) {
      selection.entry = { processedPngPath: photo.imagePath, width: FRAME_WIDTH, height: FRAME_HEIGHT };
    }
    const rawFrame = await renderPhotoFrame(selection, now);
    const frame = buildFrameBuffer(rawFrame);
    runtime.renderCount++;
    runtime.cachedFrames.set(cacheKey, { frame, payload: photo, snapshot: photo });
  }
  return {
    snapshot: {
      panelIndex: options.panel,
      panelName: PANEL_SIZES[options.panel].name,
      width: FRAME_WIDTH,
      height: FRAME_HEIGHT,
      mode: 'photo',
      frameId: photo.frameId,
      title: photo.title,
      nextSwitchAt: photo.nextSwitchAt,
      nextSwitchLocal: photo.nextSwitchLocal,
      timezone: photo.timezone,
      timestamp: now.toISOString(),
      imageStatus: photo.imageStatus,
      imageName: photo.imageName,
      imageSource: photo.imageSource,
      imageTheme: photo.imageTheme,
      theme: photo.theme,
      kind: photo.kind,
    },
    frame: runtime.cachedFrames.get(cacheKey).frame,
    photo,
  };
}

async function warmRefreshLoop() {
  setInterval(() => {
    refreshAhead().catch((error) => console.log(`background refresh failed: ${error.message}`));
  }, 10 * 60 * 1000).unref();
}

async function refreshAhead() {
  const now = new Date();
  const snapshot = selectPhotoSnapshot(now, runtime.imageIndex || []);
  if (snapshot.mode === 'news' && Date.now() - runtime.lastNewsRefreshAt > NEWS_REFRESH_MINUTES * 60 * 1000) {
    await buildNewsSnapshot(now);
    runtime.lastNewsRefreshAt = Date.now();
  } else if (snapshot.mode === 'photo') {
    await buildPhotoSnapshot(now);
  }
}

const PIN_TTL_MS = 30000;

function nowForRequest(req) {
  if (runtime.nowProvider) return runtime.nowProvider();
  return new Date();
}

function wallTimeForRequest(req) {
  return getWallTime(nowForRequest(req), TIMEZONE);
}

function clientKey(req) {
  return req.socket.remoteAddress || 'unknown';
}

function ensureCachedFrame(photo, now) {
  const k = photo.frameId;
  if (runtime.cachedFrames.has(k)) return runtime.cachedFrames.get(k).frame;
  return null;
}

function getPinnedSnapshot(client) {
  const entry = runtime.pinnedSnapshots.get(client);
  if (!entry) return null;
  const now = runtime.pinNowProvider ? runtime.pinNowProvider() : Date.now();
  if (now > entry.expiresAt) {
    runtime.pinnedSnapshots.delete(client);
    return null;
  }
  return entry;
}

function setPinnedSnapshot(client, content) {
  const now = runtime.pinNowProvider ? runtime.pinNowProvider() : Date.now();
  runtime.pinnedSnapshots.set(client, {
    frameId: content.snapshot.frameId,
    mode: content.snapshot.mode,
    slotKey: content.snapshot.slotKey || content.snapshot.frameId,
    frame: content.frame,
    snapshot: content.snapshot,
    expiresAt: now + PIN_TTL_MS,
  });
}

async function handleRequest(req, res) {
  const parsed = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const panelIndex = PANEL_SIZES[Number(parsed.searchParams.get('panel'))]
    ? Number(parsed.searchParams.get('panel'))
    : options.panel;
  const now = runtime.nowProvider ? runtime.nowProvider() : new Date();

  try {
    if (parsed.pathname === '/') {
      const state = computeSnapshot(now);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderIndexHtml(state));
      return;
    }

    if (parsed.pathname === '/api/news.json') {
      const news = await buildNewsSnapshot(now);
      const body = Buffer.from(JSON.stringify({
        updatedAt: new Date().toISOString(),
        translationProvider: news.translationProvider,
        translationNotice: news.translationNotice,
        items: news.items,
        frameId: news.frameId,
        title: news.title,
      }, null, 2));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length });
      res.end(body);
      return;
    }

    if (parsed.pathname === '/api/state.json') {
      const content = await getContentForNow(now);
      const client = clientKey(req);
      setPinnedSnapshot(client, content);
      const body = Buffer.from(JSON.stringify({
        ...content.snapshot,
        panelIndex,
        frameUrl: `${req.headers.host ? `http://${req.headers.host}` : ''}/api/frame.bin?panel=${panelIndex}`,
      }, null, 2));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length });
      res.end(body);
      return;
    }

    if (parsed.pathname === '/api/frame.bin') {
      const client = clientKey(req);
      const pinned = getPinnedSnapshot(client);
      if (pinned) {
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': pinned.frame.length,
          'X-Frame-Id': pinned.frameId,
          'X-Frame-Hex-Preview': hexPreview(pinned.frame),
          'X-Pinned': '1',
          'X-Frame-Mode': pinned.mode,
          'X-Frame-Slot': pinned.slotKey,
        });
        res.end(pinned.frame);
        return;
      }
      const content = await getContentForNow(now);
      const frame = content.frame;
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': frame.length,
        'X-Frame-Id': content.snapshot.frameId,
        'X-Frame-Hex-Preview': hexPreview(frame),
        'X-Frame-Mode': content.snapshot.mode,
        'X-Frame-Slot': content.snapshot.slotKey || content.snapshot.frameId,
      });
      res.end(frame);
      return;
    }

    if (parsed.pathname === '/debug/news.svg') {
      const news = await buildNewsSnapshot(now);
      const svg = renderNewsSvg({ ...news, nextSwitchAt: computeNextSwitchAt(now) }, now);
      res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Content-Length': svg.length });
      res.end(svg);
      return;
    }

    if (parsed.pathname === '/debug/news.png') {
      const news = await buildNewsSnapshot(now);
      const svg = renderNewsSvg({ ...news, nextSwitchAt: computeNextSwitchAt(now) }, now);
      const png = await sharp(svg)
        .resize(FRAME_WIDTH, FRAME_HEIGHT, { fit: 'fill' })
        .png()
        .toBuffer();
      res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': png.length });
      res.end(png);
      return;
    }

    if (parsed.pathname === '/api/library.json') {
      await reloadImageIndexIfNeeded();
      const index = runtime.imageIndex || [];
      const ready = index.filter(isImageReady);
      const snapshot = selectPhotoSnapshot(now, index);
      const state = runtime.libraryState;

      // Build theme detail map
      const themeMap = new Map();
      let shotsCount = 0;
      let storyboardCount = 0;
      for (const entry of ready) {
        const kind = getImageKind(entry);
        const theme = String(entry.theme || 'unknown').toLowerCase();
        if (!themeMap.has(theme)) themeMap.set(theme, { theme, shot: 0, storyboard: 0 });
        themeMap.get(theme)[kind]++;
        if (kind === 'shot') shotsCount++;
        else storyboardCount++;
      }

      const themes = [...themeMap.values()].sort((a, b) => a.theme.localeCompare(b.theme));

      const summary = ready.map((entry) => ({
        id: entry.id,
        theme: entry.theme,
        kind: getImageKind(entry),
        source: entry.source,
        sourceType: entry.sourceType,
        title: entry.title,
        imageName: entry.imageName,
        width: entry.width,
        height: entry.height,
        createdAt: entry.createdAt,
        lastShownAt: entry.lastShownAt,
        shownCount: entry.shownCount,
      }));

      const nextImageName = state.currentTheme && summary.length
        ? summary.find((e) => e.theme === state.currentTheme)?.imageName || ''
        : '';

      const body = Buffer.from(JSON.stringify({
        updatedAt: new Date().toISOString(),
        totalImages: ready.length,
        shotsCount,
        storyboardCount,
        themes,
        currentTheme: state.currentTheme || null,
        currentKind: state.currentKind || 'shot',
        patternIndex: state.patternIndex,
        nextImageName,
        images: summary,
      }, null, 2));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length });
      res.end(body);
      return;
    }

    if (parsed.pathname === '/debug/photo-info.json') {
      await reloadImageIndexIfNeeded();
      const photo = await buildPhotoSnapshot(now);
      const body = Buffer.from(JSON.stringify({
        mode: photo.mode,
        frameId: photo.frameId,
        title: photo.title,
        imageStatus: photo.imageStatus,
        imageName: photo.imageName,
        imageSource: photo.imageSource,
        imageTheme: photo.imageTheme,
        imagePath: photo.imagePath,
        epfPath: photo.epfPath,
        nextSwitchAt: photo.nextSwitchAt,
        nextSwitchLocal: photo.nextSwitchLocal,
        timezone: photo.timezone,
        totalImages: (runtime.imageIndex || []).length,
      }, null, 2));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length });
      res.end(body);
      return;
    }

    if (parsed.pathname === '/debug/photo.png') {
      await reloadImageIndexIfNeeded();
      const photo = await buildPhotoSnapshot(now);
      let png;
      let contentType = 'image/png';
      if (photo.imagePath && fs.existsSync(photo.imagePath)) {
        png = await sharp(photo.imagePath)
          .resize(FRAME_WIDTH, FRAME_HEIGHT, { fit: 'fill' })
          .png()
          .toBuffer();
      } else {
        const svg = createSvgHeader(
          FRAME_WIDTH,
          FRAME_HEIGHT,
          `<rect width="100%" height="100%" fill="#ffffff"/>
           <text x="40" y="240" font-family="${escapeXml(FONT_STACK)}" font-size="36" font-weight="700" fill="#000000">NO IMAGE</text>
           <text x="40" y="300" font-family="${escapeXml(FONT_STACK)}" font-size="18" fill="#000000">${escapeXml(formatDateTime(now))}</text>`
        );
        png = await sharp(svg)
          .resize(FRAME_WIDTH, FRAME_HEIGHT, { fit: 'fill' })
          .png()
          .toBuffer();
      }
      res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': png.length, 'X-Frame-Id': photo.frameId });
      res.end(png);
      return;
    }

    if (parsed.pathname === '/api/review.json') {
      const content = await getContentForNow(now);
      const s = content.snapshot;
      const review = { timestamp: now.toISOString(), timezone: TIMEZONE, mode: s.mode, frameId: s.frameId, panelIndex, totalImages: (runtime.imageIndex || []).length, imageStatus: s.imageStatus || null, imageTheme: s.imageTheme || null, title: s.title || null, nextSwitchAt: s.nextSwitchAt, nextSwitchLocal: s.nextSwitchLocal, width: FRAME_WIDTH, height: FRAME_HEIGHT, frameSize: content.frame.length };
      const body = Buffer.from(JSON.stringify(review, null, 2));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length });
      res.end(body);
      return;
    }

    if (parsed.pathname === '/debug/news-review-6.png' || parsed.pathname === '/debug/news.png') {
      const news = await buildNewsSnapshot(now);
      const svg = renderNewsSvg({ ...news, nextSwitchAt: computeNextSwitchAt(now) }, now);
      const png = await sharp(svg).resize(FRAME_WIDTH, FRAME_HEIGHT, { fit: 'fill' }).png().toBuffer();
      res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': png.length });
      res.end(png);
      return;
    }

    if (parsed.pathname === '/debug/photo-review.png' || parsed.pathname === '/debug/photo.png') {
      const photo = await buildPhotoSnapshot(now);
      let png;
      if (photo.imagePath && fs.existsSync(photo.imagePath)) {
        png = await sharp(photo.imagePath).resize(FRAME_WIDTH, FRAME_HEIGHT, { fit: 'fill' }).png().toBuffer();
      } else {
        const svg = createSvgHeader(FRAME_WIDTH, FRAME_HEIGHT, `<rect width="100%" height="100%" fill="#ffffff"/><text x="40" y="240" font-family="${escapeXml(FONT_STACK)}" font-size="36" font-weight="700" fill="#000000">NO IMAGE</text><text x="40" y="300" font-family="${escapeXml(FONT_STACK)}" font-size="18" fill="#000000">${escapeXml(formatDateTime(now))}</text>`);
        png = await sharp(svg).resize(FRAME_WIDTH, FRAME_HEIGHT, { fit: 'fill' }).png().toBuffer();
      }
      res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': png.length, 'X-Frame-Id': photo.frameId });
      res.end(png);
      return;
    }

    if (parsed.pathname === '/debug/photo-before-after.png') {
      const photo = await buildPhotoSnapshot(now);
      let png;
      if (photo.imagePath && fs.existsSync(photo.imagePath)) {
        const rawData = await sharp(photo.imagePath).resize(FRAME_WIDTH, FRAME_HEIGHT, { fit: 'fill' }).raw().toBuffer();
        const afterRaw = Buffer.alloc(FRAME_WIDTH * FRAME_HEIGHT * 4);
        for (let i = 0; i < FRAME_WIDTH * FRAME_HEIGHT; i++) {
          const bi = Math.floor(i / 2);
          const fb = runtime.cachedFrames.get(photo.frameId); const fbuf = fb ? fb.frame.slice(10) : Buffer.alloc(192000, 0x11); const byteVal = i % 2 === 0 ? (fbuf[bi] >> 4) & 0x0F : fbuf[bi] & 0x0F;
          const c = PALETTE.find(p => p.code === byteVal) || PALETTE[0];
          const o = i * 4;
          afterRaw[o] = c.rgb[0]; afterRaw[o+1] = c.rgb[1]; afterRaw[o+2] = c.rgb[2]; afterRaw[o+3] = 255;
        }
        png = await sharp({ create: { width: FRAME_WIDTH * 2, height: FRAME_HEIGHT, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
          .composite([
            { input: rawData, raw: { width: FRAME_WIDTH, height: FRAME_HEIGHT, channels: 3 }, left: 0, top: 0 },
            { input: afterRaw, raw: { width: FRAME_WIDTH, height: FRAME_HEIGHT, channels: 4 }, left: FRAME_WIDTH, top: 0 },
          ])
          .png().toBuffer();
      } else {
        png = await sharp({ create: { width: FRAME_WIDTH * 2, height: FRAME_HEIGHT, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
          .composite([
            { input: { create: { width: FRAME_WIDTH, height: FRAME_HEIGHT, channels: 3, background: { r: 255, g: 255, b: 255 } } }, left: 0, top: 0 },
            { input: { create: { width: FRAME_WIDTH, height: FRAME_HEIGHT, channels: 3, background: { r: 255, g: 255, b: 255 } } }, left: FRAME_WIDTH, top: 0 },
          ])
          .png().toBuffer();
      }
      res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': png.length });
      res.end(png);
      return;
    }

        if (parsed.pathname === '/debug/photo-palette.json') {
      const photo = await buildPhotoSnapshot(now);
      const cacheKey = photo.frameId;
      if (!runtime.cachedFrames.has(cacheKey)) {
        const sel = { entry: null, theme: photo.title || null, kind: photo.kind || 'shot' };
        if (photo.imagePath && fs.existsSync(photo.imagePath)) { sel.entry = { processedPngPath: photo.imagePath, width: 800, height: 480 }; }
        const rawFrame = await renderPhotoFrame(sel, now);
        const frame = buildFrameBuffer(rawFrame);
        runtime.renderCount++;
        runtime.cachedFrames.set(cacheKey, { frame, payload: photo, snapshot: photo });
      }
      const payload = runtime.cachedFrames.get(cacheKey).frame.slice(10);
      const counts = {};
      for (let i = 0; i < payload.length; i++) {
        counts[String((payload[i] >> 4) & 0x0F)] = (counts[String((payload[i] >> 4) & 0x0F)] || 0) + 1;
        counts[String(payload[i] & 0x0F)] = (counts[String(payload[i] & 0x0F)] || 0) + 1;
      }
      const palette = PALETTE.map(c => ({ code: c.code, name: c.name, pixelCount: counts[String(c.code)] || 0 }));
      palette.push({ code: 4, name: 'orange(unsupported)', pixelCount: counts['4'] || 0 });
      palette.push({ code: 7, name: 'reserved', pixelCount: counts['7'] || 0 });
      const body = Buffer.from(JSON.stringify({ timestamp: now.toISOString(), frameId: photo.frameId, imageName: photo.imageName, width: FRAME_WIDTH, height: FRAME_HEIGHT, totalPixels: FRAME_WIDTH * FRAME_HEIGHT, unsupportedCode4: counts['4'] || 0, palette }, null, 2));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length });
      res.end(body);
      return;
    }

    if (ENABLE_DEBUG_ROUTES && parsed.pathname === '/debug/pin-state.json') {
      const client = clientKey(req);
      const pin = runtime.pinnedSnapshots.get(client) || null;
      const body = Buffer.from(JSON.stringify({
        timestamp: now.toISOString(),
        client,
        hasPin: pin !== null,
        frameId: pin ? pin.frameId : null,
        mode: pin ? pin.mode : null,
        slotKey: pin ? pin.slotKey : null,
        ttlRemainingMs: pin ? (pin.expiresAt - (runtime.pinNowProvider ? runtime.pinNowProvider() : Date.now())) : 0,
        totalPins: runtime.pinnedSnapshots.size,
        renderCount: runtime.renderCount,
        cachedFrames: runtime.cachedFrames.size,
      }, null, 2));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length });
      res.end(body);
      return;
    }

    if (ENABLE_DEBUG_ROUTES && parsed.pathname === '/debug/clock') {
      const iso = parsed.searchParams.get('iso');
      if (iso) {
        runtime.nowProvider = () => new Date(iso);
        runtime.pinNowProvider = () => new Date(iso).getTime();
        const r = Buffer.from(JSON.stringify({ set: true, iso }));
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': r.length });
        res.end(r);
        return;
      }
      if (parsed.searchParams.get('reset') === '1') {
        runtime.nowProvider = null;
        runtime.pinNowProvider = null;
        const r = Buffer.from(JSON.stringify({ set: false }));
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': r.length });
        res.end(r);
        return;
      }
      const r = Buffer.from(JSON.stringify({ nowProviderActive: runtime.nowProvider !== null, serverTime: new Date().toISOString() }));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': r.length });
      res.end(r);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
res.end('Not found');
  } catch (error) {
    const body = Buffer.from(JSON.stringify({ error: error.message }, null, 2));
    console.log(`request failed ${parsed.pathname}: ${error.stack || error.message}`);
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length });
    res.end(body);
  }
}

function renderIndexHtml(state) {
  return `<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>NewsPhoto Content Server</title>
<style>
  body { font-family: ${JSON.stringify(FONT_STACK)}; margin: 0; background: #f4f1ea; color: #111; }
  main { max-width: 1000px; margin: 0 auto; padding: 32px 20px 48px; }
  .card { background: #fff; border: 2px solid #111; border-radius: 14px; padding: 22px; box-shadow: 8px 8px 0 #111; }
  h1 { margin: 0 0 8px; font-size: 34px; }
  .meta { margin: 0 0 18px; line-height: 1.7; }
  .links a { display: inline-block; margin-right: 14px; margin-top: 8px; }
  code { background: #eee; padding: 2px 6px; border-radius: 5px; }
</style>
<body>
  <main>
    <div class="card">
      <h1>NewsPhoto Content Server</h1>
      <p class="meta">Panel ${state.panelIndex}: ${state.panelName}，${state.width}x${state.height}<br>Mode: ${state.mode}<br>FrameId: <code>${escapeXml(state.frameId)}</code><br>Next switch UTC: ${escapeXml(new Date(state.nextSwitchAt).toISOString())}<br>Next switch local: ${escapeXml(state.nextSwitchLocal || formatLocalTimeLabel(state.nextSwitchAt))}<br>Timezone: ${escapeXml(state.timezone || TIMEZONE)}</p>
      <div class="links">
        <a href="/api/state.json?panel=${state.panelIndex}">/api/state.json</a>
        <a href="/api/frame.bin?panel=${state.panelIndex}">/api/frame.bin</a>
        <a href="/api/news.json">/api/news.json</a>
        <a href="/api/library.json">/api/library.json</a>
        <a href="/debug/photo.png">/debug/photo.png</a>
        <a href="/debug/photo-info.json">/debug/photo-info.json</a>
        <a href="/debug/news.png">/debug/news.png</a>
      </div>
    </div>
  </main>
</body>
</html>`;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  extractTag,
  extractItems,
  parseFeedXml,
  parseJsonFeed,
  buildNewsSnapshot,
  loadAppConfig,
  formatDateTime,
  formatDateTimeWithSeconds,
  formatLocalTimeLabel,
  formatDateParts,
  getWallTime,
  computeNextSwitchAt,
  selectPhotoSnapshot,
  imageToFrameBuffer,
};


