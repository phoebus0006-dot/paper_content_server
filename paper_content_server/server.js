const fs = require('fs');
const fsp = fs.promises;
const http = require('http');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const sharp = require('sharp');
const { AdminStateService } = require('./src/admin/admin-state-service');
const { handleAdminRoutes } = require('./src/admin/admin-routes');
const { NewsTitleService } = require('./src/news/news-title-service');
const { SafeImagePath } = require('./src/files/safe-image-path');
const { ImageRasterizer } = require('./src/images/image-rasterizer-v2');
const { ImageRecipeService } = require('./src/images/image-recipe-service');

// R1 bridge — legacy adapter wiring
var R1_loadConfig = require('./src/config/load-config').loadConfig;
var R1_SystemClock = require('./src/infra/clock').SystemClock;
var R1_ConsoleLogger = require('./src/infra/logger').ConsoleLogger;
var R1_JsonStore = require('./src/infra/json-store').JsonStore;
var R1_bootstrap = require('./src/app/bootstrap').bootstrap;
var R1_createApp = require('./src/app/create-app').createApp;
var R1_writeFileAtomic = require('./src/infra/atomic-file').writeFileAtomic;
var R1_createHttpClient = require('./src/infra/http-client').createHttpClient;

var r1Clock = R1_SystemClock();
var r1Logger = R1_ConsoleLogger();
var r1HttpClient = R1_createHttpClient(20000);

// R2 Frame Core
var epaperPalette = require('./src/epaper/palette');
var epaperImageFrame = require('./src/epaper/image-frame');
var epaperEpf1 = require('./src/epaper/epf1');
var epaperFrameValidator = require('./src/epaper/frame-validator');

// R3 Snapshot + Publication Core
var R3_snapshotModel = require('./src/snapshot/snapshot-model');
var R3_SnapshotStore = require('./src/snapshot/snapshot-store').SnapshotStore;
var R3_SnapshotCache = require('./src/snapshot/snapshot-cache').SnapshotCache;
var R3_PinStore = require('./src/snapshot/pin-store').PinStore;
var R3_PublicationLock = require('./src/publication/publication-lock').PublicationLock;
var R3_NoopNotificationPort = require('./src/publication/notification-port').NoopNotificationPort;
var R3_OperatingModeService = require('./src/publication/operating-mode-service').OperatingModeService;
var R3_PublicationHistory = require('./src/publication/publication-history').PublicationHistory;
var R3_PublicationService = require('./src/publication/publication-service').PublicationService;

const ROOT_DIR = __dirname;
const DEFAULT_PORT = 8787;
var BUILD_GIT_SHA = null;
try {
  var bm = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'build-manifest.json'), 'utf8'));
  if (bm && bm.gitSha) BUILD_GIT_SHA = bm.gitSha;
} catch (e) {}
const DEFAULT_PANEL = 49;
const FRAME_WIDTH = 800;
const FRAME_HEIGHT = 480;
const { resolveDisplayMode } = require('./lib/schedule');
const { sortSequenceFrames } = require('./lib/sequence');
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

// ── process.env policy ──────────────────────────────────────────────────────
// server.js MUST NOT read business configuration from process.env directly.
// All business config (PORT, TZ, TRANSLATION_PROVIDER, API keys, MQTT flags,
// photo/dithering, panel index, debug routes, force-exit timeout, etc.) is
// loaded once via load-config into APP_CONFIG and read from there.
//
// Whitelisted exceptions (the ONLY direct process.env reads allowed):
//   - process.env.NODE_ENV — Node.js runtime standard variable, not business
//     configuration. Frameworks/libraries read it to switch between
//     development/production behavior.
//
// The static test test/config/server-no-direct-env-test.js enforces this by
// scanning server.js for `process.env.UPPERCASE_NAME` (excluding NODE_ENV).

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
    // Populate process.env from .env so libraries that read process.env
    // (mqtt, sharp, etc.) still see configured values. This is a write, not a
    // business-config read; load-config remains the single source of truth
    // for server.js's own configuration.
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
const TRANSLATION_PROVIDER = String(APP_CONFIG.translation.provider || DEFAULT_PROVIDER).toLowerCase();
const OPENAI_API_KEY = APP_CONFIG.translation.openaiApiKey || '';
const OPENAI_MODEL = APP_CONFIG.translation.openaiModel || 'gpt-4o-mini';
const OPENAI_BASE_URL = String(APP_CONFIG.translation.openaiBaseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
const DEEPL_API_KEY = APP_CONFIG.translation.deeplApiKey || '';
const DEEPL_API_URL = APP_CONFIG.translation.deeplApiUrl || 'https://api-free.deepl.com/v2/translate';
const GEMINI_API_KEY = APP_CONFIG.translation.geminiApiKey || '';
const GEMINI_API_BASE = String(APP_CONFIG.translation.geminiApiBase || '').replace(/\/+$/, '') || (OPENAI_BASE_URL && TRANSLATION_PROVIDER === 'gemini' ? OPENAI_BASE_URL : '');
const GEMINI_MODEL = APP_CONFIG.translation.geminiModel || 'gemini-2.5-flash';
const PHOTO_QUANT_MODE = String(APP_CONFIG.photo.quantMode || 'clean').toLowerCase();
const DITHERING_ENABLED = PHOTO_QUANT_MODE === 'fs' ? ['1', 'true', 'yes', 'on'].includes(String(APP_CONFIG.photo.dithering ?? '').toLowerCase()) : false;
const PORT = Number(APP_CONFIG.port) > 0 ? Number(APP_CONFIG.port) : options.port;
const TIMEZONE = String(APP_CONFIG.timezone || DEFAULT_TIMEZONE || 'UTC');
const ENABLE_DEBUG_ROUTES = !!(APP_CONFIG.debug && APP_CONFIG.debug.enableDebugRoutes);
// Admin configuration — single source of truth via load-config (APP_CONFIG.admin).
// No direct process.env reads for admin settings in production code.
var adminPolicy = require('./src/admin/admin-network-policy');
var adminCSRF = require('./src/admin/admin-csrf-policy');
const ADMIN_ACCESS_MODE = APP_CONFIG.admin.accessMode;
const ADMIN_TOKEN = APP_CONFIG.admin.token;
const ADM_PARSED_CIDRS = APP_CONFIG.admin.allowedCidrs;
const TRUST_PROXY = APP_CONFIG.admin.trustProxy;
const ADM_TRUSTED_PROXY_CIDRS = APP_CONFIG.admin.trustedProxyCidrs.parsed;
const ADMIN_ALLOW_HEADERLESS_WRITE = APP_CONFIG.admin.allowHeaderlessWrite;
const MQTT_ENABLED = !!(APP_CONFIG.mqtt && APP_CONFIG.mqtt.enabled);

const DATA_DIR = resolveConfiguredPath(APP_CONFIG.dataDir || 'data');
const IMAGES_DIR = resolveConfiguredPath(APP_CONFIG.imageRoot || 'images');
const FEEDS_FILE = resolveConfiguredPath(APP_CONFIG.feedsFile || 'feeds.json');
const NEWS_CACHE_FILE = resolveConfiguredPath(APP_CONFIG.newsCacheFile || path.join(DATA_DIR, 'news_cache.json'));
const NEWS_ROTATION_FILE = resolveConfiguredPath(APP_CONFIG.newsRotationFile || path.join(DATA_DIR, 'news_rotation_state.json'));
const LIBRARY_STATE_FILE = resolveConfiguredPath(APP_CONFIG.libraryStateFile || path.join(DATA_DIR, 'library_state.json'));
const IMAGE_INDEX_FILE = resolveConfiguredPath(APP_CONFIG.imageIndexFile || path.join(DATA_DIR, 'image_index.json'));
const RAW_IMAGES_DIR = resolveConfiguredPath(APP_CONFIG.rawImagesDir || path.join(DATA_DIR, 'raw_images'));
const PROCESSED_IMAGES_DIR = resolveConfiguredPath(APP_CONFIG.processedImagesDir || path.join(DATA_DIR, 'processed_images'));
const IMPORT_IMAGES_DIR = resolveConfiguredPath(APP_CONFIG.importImagesDir || path.join(DATA_DIR, 'import_images'));
const LAST_GOOD_NEWS_FILE = resolveConfiguredPath(APP_CONFIG.lastGoodNewsFile || path.join(DATA_DIR, 'last_good_news.json'));
const FALLBACK_STUDY_DIR = resolveConfiguredPath(APP_CONFIG.fallbackStudyDir || path.join(DATA_DIR, 'fallback_study'));

const runtime = {
  feeds: null,
  feedsLoadedAt: 0,
  newsCache: { version: 1, updatedAt: null, translations: {} },
  newsRotation: { version: 1, updatedAt: null, shown: [] },
  lastGoodNews: null,
  fallbackStudyEntries: null,
  fallbackStudyReady: false,
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
  serverStartTime: Date.now(),
  renderCount: 0,
  nowProvider: null,
  pinNowProvider: null,
  // R3 snapshot/publication services
  snapshotStore: null,
  snapshotCache: null,
  pinStore: null,
  publicationLock: null,
  publicationService: null,
  operatingModeService: null,
  publicationHistory: null,
  // Phase 5+ library/learning/render services
  customLibraryService: null,
  safetyGate: null,
  learningIngestionService: null,
  learningLastIngestAt: null,
  overridePersistence: null,
  safetyClassifierPort: null,
};

async function main() {
  r1Logger.info('Starting NewsPhoto content server via R1 bootstrap');

  // Create MQTT and notification port BEFORE bootstrap — single construction.
  // MQTT config comes from APP_CONFIG.mqtt (single source of truth via
  // load-config); no direct process.env reads here.
  var notificationPort = null;
  var mqttClient = null;
  if (MQTT_ENABLED) {
    try {
      var mqttConfig = APP_CONFIG.mqtt;
      var { createMqttClientPort } = require('./src/mqtt/mqtt-client-port');
      mqttClient = createMqttClientPort(mqttConfig, r1Logger);
      mqttClient.connect().catch(function(e) {
        r1Logger.warn('MQTT connect failed: ' + e.message + ' — HTTP continues');
      });
      var { createMqttNotificationAdapter } = require('./src/mqtt/mqtt-notification-adapter');
      notificationPort = createMqttNotificationAdapter(mqttConfig, mqttClient, r1Logger);
    } catch(e) {
      r1Logger.warn('MQTT initialization failed: ' + e.message + ' — falling back to noop');
    }
  }

  var boot = R1_bootstrap({
    handler: handleRequest,
    env: process.env,
    cwd: ROOT_DIR,
    listen: true,
    port: PORT,
    notificationPort: notificationPort || undefined,
    mqttClient: mqttClient || undefined,
  });

  // Ensure data directories exist
  await ensureDir(DATA_DIR);
  await ensureDir(IMAGES_DIR);

  // Load persisted runtime state
  runtime.feeds = await readJson(FEEDS_FILE, []);
  runtime.newsCache = await readJson(NEWS_CACHE_FILE, { version: 1, updatedAt: null, translations: {} });
  runtime.newsRotation = await readJson(NEWS_ROTATION_FILE, { version: 1, updatedAt: null, shown: [] });
  runtime.libraryState = await readJson(LIBRARY_STATE_FILE, runtime.libraryState);
  runtime.imageIndex = await loadImageIndex();
  runtime.lastGoodNews = await readJson(LAST_GOOD_NEWS_FILE, null);

  // Wire R3 snapshot/publication services from single composition root
  runtime.snapshotStore = boot.deps.snapshotStore;
  runtime.snapshotCache = boot.deps.snapshotCache;
  runtime.pinStore = boot.deps.pinStore;
  runtime.publicationLock = boot.deps.publicationLock;
  runtime.operatingModeService = boot.deps.operatingModeService;
  runtime.publicationHistory = boot.deps.publicationHistory;
  runtime.notificationPort = boot.deps.notificationPort;
  runtime.publicationService = boot.services.publicationService;
  runtime.adminQueryService = boot.services.adminQueryService || null;
  runtime.adminStateService = new AdminStateService({
    operatingModeService: runtime.operatingModeService || null,
    snapshotStore: runtime.snapshotStore || null,
    publicationHistory: runtime.publicationHistory || null,
    mqttClient: runtime.mqttClient || null,
  });
  runtime.newsTitleService = new NewsTitleService();
  runtime.safeImagePath = new SafeImagePath({ rootDir: ROOT_DIR });
  runtime.imageRasterizer = new ImageRasterizer();
  runtime.featureFlagView = boot.services.featureFlagView || null;
  runtime.assetRepository = boot.services.assetRepository || null;
  runtime.customLibraryService = boot.services.customLibraryService || null;
  runtime.safetyGate = boot.services.safetyGate || null;
  runtime.learningIngestionService = boot.services.learningIngestionService || null;
  runtime.learningScheduler = boot.services.learningScheduler || null;
  runtime.assetSelectionService = boot.services.assetSelectionService || null;
  runtime.assetDeleteService = boot.services.assetDeleteService || null;
  runtime.overridePersistence = boot.services.overridePersistence || null;
  runtime.safetyClassifierPort = boot.services.safetyClassifierPort || null;
  runtime.config = boot.config || null;
  runtime.mqttClient = boot.deps.mqttClient || null;
  await runtime.snapshotStore.ensureDirs();

  // V6: initialize the safety classifier async lifecycle (load model + smoke
  // inference). Failure here does NOT block the news service — the classifier
  // stays ready=false and Custom/Learning features stay fail-closed (BLOCKED)
  // via the classifierReady gate in compose-services and the feature-flag view.
  // Logged for diagnostics so operators can see why the classifier is not ready.
  try {
    if (runtime.safetyClassifierPort && typeof runtime.safetyClassifierPort.initialize === 'function') {
      await runtime.safetyClassifierPort.initialize();
    }
  } catch (e) {
    r1Logger.warn('safetyClassifierPort initialize failed: ' + (e && e.message) +
      ' — Custom/Learning stay fail-closed');
  }

  // R3.8: Preload active snapshot into cache on restart
  try {
    var activePtr = await runtime.snapshotStore.readActive();
    if (activePtr && activePtr.activeSnapshotId) {
      var activeSnap = await runtime.snapshotStore.load(activePtr.activeSnapshotId);
      if (activeSnap) {
        runtime.snapshotCache.set(activeSnap.snapshotId, activeSnap);
        r1Logger.info('Restored active snapshot from disk: ' + activeSnap.snapshotId);
      }
    }
  } catch(e) {
    r1Logger.warn('Could not preload active snapshot: ' + e.message);
  }

  // V3: Restore persisted ONE_SHOT / FOCUS_LOCK override on restart.
  // validateOverrideAsync() re-checks the asset is still SAFE + SELECTABLE +
  // local file present. If valid, the operating mode is restored to the same
  // snapshot. If invalid, the override is cleared and the server falls through
  // to AUTO schedule (no silent asset substitution).
  if (runtime.overridePersistence && runtime.assetRepository && runtime.operatingModeService) {
    try {
      var persistedOverride = runtime.overridePersistence.loadOverride();
      if (persistedOverride &&
          (persistedOverride.mode === 'ONE_SHOT_OVERRIDE' ||
           persistedOverride.mode === 'FOCUS_LOCK') &&
          persistedOverride.assetId && persistedOverride.snapshotId) {
        var v3Validation = await runtime.overridePersistence.validateOverrideAsync(
          persistedOverride, runtime.assetRepository
        );
        if (v3Validation.valid) {
          // Restore operating mode; snapshot was already preloaded above.
          if (persistedOverride.mode === 'ONE_SHOT_OVERRIDE') {
            runtime.operatingModeService.enterOneShot(
              persistedOverride.snapshotId,
              persistedOverride.expiresAt || persistedOverride.savedAt
            );
            r1Logger.info('Restored ONE_SHOT override: asset=' + persistedOverride.assetId);
          } else {
            runtime.operatingModeService.enterFocusLock(persistedOverride.snapshotId, {
              libraryType: persistedOverride.libraryType || null,
              theme: persistedOverride.theme || null,
              albumId: persistedOverride.albumId || null,
            });
            r1Logger.info('Restored FOCUS_LOCK override: asset=' + persistedOverride.assetId);
          }
        } else {
          r1Logger.warn('Persisted override invalid on restart (' + v3Validation.reason +
            ') — clearing override, falling through to AUTO schedule');
          runtime.overridePersistence.clearOverride();
        }
      }
    } catch (e) {
      r1Logger.warn('Override restore failed: ' + e.message);
    }
  }

  var server = boot.server;

  var effectiveTimeZone = r1Clock.timezone();
  if (effectiveTimeZone !== TIMEZONE) {
    r1Logger.warn('configured timezone is ' + TIMEZONE + ' but effective is ' + effectiveTimeZone);
  } else {
    r1Logger.info('Timezone: ' + TIMEZONE);
  }

  var state = computeSnapshot(new Date());
  r1Logger.info('Panel ' + state.panelIndex + ': ' + state.panelName + ', ' + state.width + 'x' + state.height);
  r1Logger.info('Default frameId=' + state.frameId);
  r1Logger.info('Content endpoint: http://0.0.0.0:' + PORT + '/api/state.json');
  for (var ipi = 0; ipi < getLocalIPs().length; ipi++) {
    var ip = getLocalIPs()[ipi];
    r1Logger.info('  http://' + ip + ':' + PORT + '/');
    r1Logger.info('  http://' + ip + ':' + PORT + '/api/state.json');
    r1Logger.info('  http://' + ip + ':' + PORT + '/api/frame.bin');
    r1Logger.info('  http://' + ip + ':' + PORT + '/api/news.json');
  }

  function gracefulShutdown(signal) {
    r1Logger.info('Received ' + signal + ', shutting down...');
    var forceExitMs = (APP_CONFIG.process && APP_CONFIG.process.forceExitTimeoutMs) || (boot.config.lifecycle && boot.config.lifecycle.forceExitTimeoutMs) || 12000;
    var forceExit = setTimeout(function() {
      r1Logger.error('Force exit after ' + forceExitMs + 'ms');
      process.exitCode = 1;
      process.exit(1);
    }, forceExitMs);
    // Stop learning scheduler (if running) before tearing down the server
    try {
      if (boot.services && boot.services.learningScheduler) {
        boot.services.learningScheduler.stop();
      }
    } catch(e) { r1Logger.warn('learningScheduler stop failed: ' + e.message); }
    // V6: shutdown the safety classifier async lifecycle (release model handle).
    // Idempotent and non-blocking — failure here is logged but does not prevent
    // the rest of shutdown from proceeding.
    var classifierShutdown = Promise.resolve();
    if (runtime.safetyClassifierPort && typeof runtime.safetyClassifierPort.shutdown === 'function') {
      classifierShutdown = runtime.safetyClassifierPort.shutdown().catch(function(e) {
        r1Logger.warn('safetyClassifierPort shutdown failed: ' + (e && e.message));
      });
    }
    classifierShutdown.then(function() {
      return boot.shutdown();
    }).then(function() {
      clearTimeout(forceExit);
      process.exit(0);
    }).catch(function(e) {
      r1Logger.error('Shutdown failed: ' + e.message);
      clearTimeout(forceExit);
      process.exitCode = 1;
      process.exit(1);
    });
  }

  process.on('SIGINT', function() { gracefulShutdown('SIGINT'); });
  process.on('SIGTERM', function() { gracefulShutdown('SIGTERM'); });
}

function parseArgs(argv, config) {
  const parsed = {
    port: Number(config && config.port) || DEFAULT_PORT,
    panel: Number(config && (config.panelIndex != null ? config.panelIndex : (config.panel && config.panel.index))) || DEFAULT_PANEL,
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
  var result = R1_loadConfig({ cwd: ROOT_DIR });
  if (!result.isValid) {
    r1Logger.error('Config validation failed: ' + result.errors.join('; '));
    // Only hard-exit when run as the entry point. When required by tests for
    // utility functions, log and fall through so the module still loads.
    if (require.main === module) {
      process.exit(1);
    }
  }
  return {
    port: result.server.port,
    panelIndex: result.panel.index,
    panel: result.panel,
    imageRoot: result.paths.imagesDir,
    dataDir: result.paths.dataDir,
    feedsFile: result.paths.feedsFile,
    newsCacheFile: result.paths.newsCacheFile,
    libraryStateFile: result.paths.libraryStateFile,
    newsRotationFile: result.paths.newsRotationFile,
    imageIndexFile: result.paths.imageIndexFile,
    rawImagesDir: result.paths.rawImagesDir,
    processedImagesDir: result.paths.processedImagesDir,
    importImagesDir: result.paths.importImagesDir,
    lastGoodNewsFile: result.paths.lastGoodNewsFile,
    fallbackStudyDir: result.paths.fallbackStudyDir,
    translationProvider: result.translation.provider,
    translation: result.translation,
    photo: result.photo,
    // Backwards-compat scalar dithering flag derived from photo.quantMode + photo.dithering.
    dithering: result.photo.dithering || (result.photo.quantMode === 'fs' ? '1' : '0'),
    timezone: result.server.timezone,
    debug: result.debug,
    mqtt: result.mqtt,
    process: result.process,
    lifecycle: result.lifecycle,
    features: result.features,
    learning: result.learning,
    safety: result.safety,
    upload: result.upload,
    admin: result.admin,
    testInstanceId: result.server.testInstanceId,
    configFile: result.configFile,
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
    var store = R1_JsonStore(filePath);
    return await store.read();
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, data) {
  await R1_writeFileAtomic(filePath, JSON.stringify(data, null, 2) + '\n', { encoding: 'utf8' });
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

async function fetchText(url, timeoutMs) {
  return r1HttpClient.fetchText(url, timeoutMs || 20000);
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

const PROTECTED_ENTITIES = [
  'OpenAI', 'ChatGPT', 'iPhone', 'TikTok', 'NATO', 'GDP', 'CPI', 'IMF',
  'ECB', 'NASA', 'FBI', 'CIA', 'IPO', 'ETF', 'CEO',
];

function normalizeEntitiesAndAcronyms(text) {
  if (!text) return text;
  let s = String(text);
  s = s.replace(/Open\s+AI/g, 'OpenAI');
  s = s.replace(/Chat\s+GPT/g, 'ChatGPT');
  s = s.replace(/N\s+A\s+T\s+O/g, 'NATO');
  return s;
}

function isTextSemanticallyComplete(title, summary, translationStatus) {
  const reasons = [];
  if (!title || !title.trim()) reasons.push('EMPTY_TITLE');

  const tHasChinese = /[\u4e00-\u9fff]/.test(title);
  const sHasChinese = /[\u4e00-\u9fff]/.test(summary);

  if (!tHasChinese && !sHasChinese) {
    if (title && title.trim()) reasons.push('NON_CHINESE_CONTENT');
  }

  // Translated item must have Chinese title
  if ((translationStatus === 'translated' || translationStatus === 'cached') && !tHasChinese) {
    reasons.push('TRANSLATED_TITLE_NOT_CHINESE');
  }

  if (tHasChinese) {
    const chars = [...title];
    if (chars.length < 4) reasons.push('TITLE_TOO_SHORT(' + chars.length + ')');
    const bareName = /^[\u4e00-\u9fff\u00b7·\s]{1,8}$/.test(title);
    if (bareName && chars.length < 8 && title.indexOf('(') < 0 && title.indexOf('（') < 0) {
      reasons.push('TITLE_MAY_BE_FRAGMENT');
    }
    const hangingEnd = /(的|为|在|向|与|和|及|将|以|从|对|把|被|让|给|由|于|关于|成为|进行|宣布|宣布将|认定|推出|属于|位于|进入|使用|要求|开始)$/;
    if (hangingEnd.test(title)) reasons.push('HANGING_END');
  } else if (title && title.trim()) {
    // Non-Chinese title with Chinese summary is suspicious
    if (sHasChinese && translationStatus !== 'original') {
      reasons.push('TITLE_NOT_CHINESE_BUT_SUMMARY_IS');
    }
  }

  if (summary && summary.trim()) {
    const sChars = [...summary];
    const sHasChinese = /[\u4e00-\u9fff]/.test(summary);
    if (sChars.length < 10) reasons.push('SUMMARY_TOO_SHORT');
    if (sChars.length >= 30 && !/[。！？]/.test(sChars[sChars.length - 1])) reasons.push('SUMMARY_NO_END_PUNCT');
    if (/[，；、：,;:]$/.test(summary)) reasons.push('SUMMARY_HANGING_COMMA');
    if (/Photo:|Image:|Credit:|Reuters|AFP|Getty|Bloomberg/i.test(summary)) reasons.push('PHOTO_CREDIT_RESIDUE');
    if (/<[^>]+>/.test(summary)) reasons.push('HTML_RESIDUE');
    // Translated items: summary must be Chinese
    if ((translationStatus === 'translated' || translationStatus === 'cached') && !sHasChinese) {
      reasons.push('TRANSLATED_SUMMARY_NOT_CHINESE');
    }
  }

  return { complete: reasons.length === 0, reasons: reasons };
}

function rewriteNewsTitle(article) {
  let title = String(article.zhTitle || article.title || '');
  if (!title.trim()) return '新闻';

  title = normalizeEntitiesAndAcronyms(title);
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

  const chars = [...title];
  if (chars.length <= 24) {
    const trailMatch = title.match(/(?:^|[^\u4e00-\u9fff])[A-Za-z][a-z]{0,3}$/);
    if (trailMatch && trailMatch.index > 3) {
      const before = title.slice(0, trailMatch.index + 1).trim();
      if ([...before].length >= 8) return before;
    }
    return title;
  }

  const boundaryChars = ['。', '！', '？', '；', '：', '，', '—', '–', '|', '｜'];
  let bestCut = -1, bestScore = -1;

  for (let pos = 24; pos >= 12; pos--) {
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
    const hangingEnd = /(的|为|在|向|与|和|及|将|以|从|对|把|被|让|给|由|于|关于|成为|进行|宣布|宣布将|认定|推出|属于|位于|进入|使用|要求|开始)$/;
    const openQuote = /['"「『""]$/;
    if (!hangingEnd.test(title) && !openQuote.test(title)) return title || '新闻';
  }

  for (let p = 22; p >= 12; p--) {
    const c = chars.slice(0, p).join('').trim();
    const hangingEnd = /(的|为|在|向|与|和|及|将|以|从|对|把|被|让|给|由|于|关于|成为|进行|宣布|宣布将|认定|推出|属于|位于|进入|使用|要求|开始)$/;
    const openQuote = /['"「『""]$/;
    if (!hangingEnd.test(c) && !openQuote.test(c)) return c;
  }

  return chars.slice(0, 20).join('').trim() || '新闻';
}

function rewriteNewsSummary(article) {
  let raw = String(article.zhSummary || article.summary || '');
  if (!raw.trim() && article.rawContent) raw = article.rawContent;
  if (!raw.trim()) return '';

  raw = normalizeEntitiesAndAcronyms(raw);
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
    rc = rc.replace(/^[-–—|•\s]+/g, '').trim();
    if ([...rc].length > totalRawLen + 5) s = rc;
  }

  s = s.replace(/\s{2,}/g, ' ').trim();
  if (!s) return '';

  const chars = [...s];
  const MAX_SUMMARY_LEN = 75;

  if (chars.length <= MAX_SUMMARY_LEN) {
    if (chars.length > 0 && !/[。！？]/.test(chars[chars.length - 1])) {
      return s + '。';
    }
    return s;
  }

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
    if (nextLen <= MAX_SUMMARY_LEN) {
      result += sent;
    } else if ([...result].length >= 40) {
      break;
    } else {
      const needed = 40 - [...result].length;
      const sentChars = [...sent];
      const takeLen = Math.min(needed + 15, sentChars.length);
      const lastComma = Math.max(sent.slice(0, takeLen).lastIndexOf('，'), sent.slice(0, takeLen).lastIndexOf('、'));
      if (lastComma > 3) {
        const part = sentChars.slice(0, lastComma).join('') + '。';
        if ([...result + part].length <= MAX_SUMMARY_LEN) { result += part; break; }
      }
      break;
    }
  }

  if (!result) result = sentences[0] || s;

  const rChars = [...result];
  if (rChars.length > 0 && !/[。！？]/.test(rChars[rChars.length - 1])) {
    result += '。';
  }

  return result;
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

  const stats = { rawCandidates: rawItems.length, deduped: 0, evaluated: 0, pass: 0, softPass: 0, rejectTitle: 0, rejectSummary: 0, rejectSemantic: 0, final: 0, rejects: [] };
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
      const semanticCheck = isTextSemanticallyComplete(result.zhTitle, result.zhSummary, result.translationStatus);
      if (semanticCheck.complete) {
        mainPool.push(result);
      } else {
        stats.rejectSemantic++;
        if (stats.rejects.length < 5) {
          stats.rejects.push({ title: result.zhTitle || result.title || '', source: result.source || '', reason: 'SEMANTIC:' + semanticCheck.reasons.join(',') });
        }
      }
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
      const semanticCheck = isTextSemanticallyComplete(entry.zhTitle, entry.zhSummary, 'original');
      if (semanticCheck.complete) {
        mainPool.push(entry);
      } else {
        stats.rejectSemantic++;
        if (stats.rejects.length < 5) {
          stats.rejects.push({ title: entry.zhTitle || entry.title || '', source: entry.source || '', reason: 'SEMANTIC:' + semanticCheck.reasons.join(',') });
        }
      }
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

  function canonicalUrl(u) {
    if (!u) return '';
    return String(u).replace(/[?#].*$/, '').replace(/\/+$/, '').replace(/^https?:\/\//, '').toLowerCase().trim();
  }

  function normalizeDedupKey(text) {
    return (text || '').replace(/[\s,，。！？、；：""''「『」』（）()【】\[\]\{\}]/g, '').toLowerCase().trim();
  }

  const final = [];
  const sourceCount = new Map();
  const seenUrls = new Set();
  const seenTitles = new Set();

  function isDuplicate(item) {
    const url = canonicalUrl(item.sourceUrl || item.url || '');
    if (url && seenUrls.has(url)) return true;
    const origTitle = normalizeDedupKey(item.originalTitle || item.title || '');
    if (origTitle && seenTitles.has(origTitle)) return true;
    const zhTitle = normalizeDedupKey(item.zhTitle || '');
    if (zhTitle && origTitle && zhTitle !== origTitle && seenTitles.has(zhTitle)) return true;
    return false;
  }

  function markSeen(item) {
    const url = canonicalUrl(item.sourceUrl || item.url || '');
    if (url) seenUrls.add(url);
    const origTitle = normalizeDedupKey(item.originalTitle || item.title || '');
    if (origTitle) seenTitles.add(origTitle);
    const zhTitle = normalizeDedupKey(item.zhTitle || '');
    if (zhTitle) seenTitles.add(zhTitle);
  }

  function tryAdd(items) {
    for (const { item } of items) {
      if (final.length >= NEWS_MAX_ITEMS) break;
      if (isDuplicate(item)) continue;
      const src = item.source || '';
      if ((sourceCount.get(src) || 0) >= 2) continue;
      sourceCount.set(src, (sourceCount.get(src) || 0) + 1);
      markSeen(item);
      final.push(item);
    }
  }

  tryAdd(passItems);
  tryAdd(softPassItems);

  if (final.length < NEWS_MAX_ITEMS) {
    for (const item of mainPool) {
      if (final.length >= NEWS_MAX_ITEMS) break;
      if (isDuplicate(item)) continue;
      const src = item.source || '';
      if ((sourceCount.get(src) || 0) >= 2) continue;
      sourceCount.set(src, (sourceCount.get(src) || 0) + 1);
      markSeen(item);
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

  // Save last-good-news if we have enough items
  if (final.length >= NEWS_MAX_ITEMS) {
    runtime.lastGoodNews = news;
    try { await writeJson(LAST_GOOD_NEWS_FILE, news); } catch(e) { console.log('last-good-news write failed: ' + e.message); }
  }

  // If no items, fall back to last-good-news or built-in placeholder
  if (news.items.length === 0) {
    if (runtime.lastGoodNews && runtime.lastGoodNews.items && runtime.lastGoodNews.items.length >= NEWS_MAX_ITEMS) {
      console.log('live news empty, using last-good-news (' + runtime.lastGoodNews.items.length + ' items)');
      runtime.cachedSnapshots.set(key, runtime.lastGoodNews);
      return runtime.lastGoodNews;
    }
    // Built-in safe placeholder (never show "暂无新闻" with empty items)
    var placeholderItems = [];
    var placeholderSources = ['System', 'Standby', 'Status'];
    for (var pi = 0; pi < NEWS_MAX_ITEMS; pi++) {
      var psrc = placeholderSources[pi % placeholderSources.length];
      placeholderItems.push({
        originalTitle: 'News feed temporarily unavailable',
        originalSummary: 'Waiting for next refresh cycle',
        zhTitle: '新闻源暂时不可用',
        zhSummary: '正在等待下一次刷新。系统将持续自动重试。',
        sourceUrl: '',
        source: psrc,
        category: 'general',
        publishedAt: new Date().toISOString(),
        translationStatus: 'placeholder',
      });
    }
    var fallbackNews = {
      translationProvider: TRANSLATION_PROVIDER,
      translationNotice: '系统启动中',
      updatedAt: new Date().toISOString(),
      items: placeholderItems,
      frameId: 'news:' + sha1('placeholder:' + Date.now()),
      title: 'STANDBY',
      slotKey: snapshot.slotKey || 'standby',
    };
    runtime.cachedSnapshots.set(key, fallbackNews);
    return fallbackNews;
  }

  runtime.cachedSnapshots.set(key, news);
  return news;
}

async function loadImageIndex() {
  try {
    const data = await readJson(IMAGE_INDEX_FILE, []);
    const entries = Array.isArray(data) ? data : data.images || [];
    runtime.imageIndexLoadedAt = Date.now();
    runtime.fullImageIndex = entries;
    return entries;
  } catch (error) {
    console.log(`image index load failed: ${error.message}`);
    return [];
  }
}

var FALLBACK_STUDY_THEMES = [
  { id: 'fb-dialogue-sb', theme: 'dialogue', kind: 'storyboard', title: 'Dialogue Framing - Rule of Thirds', lessonTags: ['rule-of-thirds', 'framing', 'dialogue'] },
  { id: 'fb-wideshot', theme: 'wide_shot', kind: 'shot', title: 'Wide Shot - Establishing Context', lessonTags: ['wide-shot', 'establishing', 'composition'] },
  { id: 'fb-entrance', theme: 'entrance', kind: 'shot', title: 'Entrance Framing - Full Body', lessonTags: ['entrance', 'full-shot', 'balance'] },
  { id: 'fb-night', theme: 'night', kind: 'shot', title: 'Night Scene - Low Key', lessonTags: ['night', 'low-light', 'silhouette'] },
  { id: 'fb-ensemble', theme: 'ensemble', kind: 'shot', title: 'Group Balance - Ensemble', lessonTags: ['ensemble', 'group', 'balance'] },
  { id: 'fb-color', theme: 'color', kind: 'film_still', title: 'Color Harmony - Complementary', lessonTags: ['color', 'harmony', 'palette'] },
  { id: 'fb-dialogue-ms', theme: 'dialogue', kind: 'shot', title: 'Medium Shot - Dialogue', lessonTags: ['medium-shot', 'over-shoulder', 'dialogue'] },
  { id: 'fb-ensemble-sb', theme: 'ensemble', kind: 'storyboard', title: 'Blocking Layout - Storyboard', lessonTags: ['storyboard', 'blocking', 'layout'] },
];

function generateFallbackStudySvg(entry) {
  var boxes = [];
  var bg = '#f5f3ee';
  var gridColor = '#d4c9b8';
  var textColor = '#2c2c2c';
  var accentColor = '#8b7355';
  boxes.push('<rect width="800" height="480" fill="' + bg + '"/>');
  var thirdsLines = [
    { x1: 267, y1: 0, x2: 267, y2: 480 },
    { x1: 533, y1: 0, x2: 533, y2: 480 },
    { x1: 0, y1: 160, x2: 800, y2: 160 },
    { x1: 0, y1: 320, x2: 800, y2: 320 },
  ];
  for (var li = 0; li < thirdsLines.length; li++) {
    var l = thirdsLines[li];
    boxes.push('<line x1="' + l.x1 + '" y1="' + l.y1 + '" x2="' + l.x2 + '" y2="' + l.y2 + '" stroke="' + gridColor + '" stroke-width="1" stroke-dasharray="6,4"/>');
  }
  var cx = [134, 400, 666];
  var cy = [80, 240, 400];
  for (var yi = 0; yi < 3; yi++) {
    for (var xi = 0; xi < 3; xi++) {
      boxes.push('<circle cx="' + cx[xi] + '" cy="' + cy[yi] + '" r="4" fill="' + accentColor + '" opacity="0.5"/>');
    }
  }
  var subjectX = cx[xi - 2];
  var subjectY = cy[yi - 1];
  var frameStyle = 'stroke="' + accentColor + '" stroke-width="2" fill="none" stroke-dasharray="8,4"';
  if (entry.kind === 'storyboard') {
    boxes.push('<rect x="80" y="60" width="280" height="180" ' + frameStyle + '/>');
    boxes.push('<rect x="440" y="60" width="280" height="180" ' + frameStyle + '/>');
    boxes.push('<rect x="80" y="260" width="280" height="180" ' + frameStyle + '/>');
    boxes.push('<rect x="440" y="260" width="280" height="180" ' + frameStyle + '/>');
    boxes.push('<text x="400" y="36" text-anchor="middle" font-family="sans-serif" font-size="18" font-weight="bold" fill="' + textColor + '">' + escapeXml(entry.title) + '</text>');
    boxes.push('<text x="400" y="460" text-anchor="middle" font-family="sans-serif" font-size="11" fill="' + accentColor + '">composition study card · ' + escapeXml(entry.lessonTags.join(' · ')) + '</text>');
  } else {
    // Shot: draw framing rectangle in center
    var fw = 480, fh = 288;
    boxes.push('<rect x="' + ((800 - fw) / 2) + '" y="' + ((480 - fh) / 2) + '" width="' + fw + '" height="' + fh + '" ' + frameStyle + ' rx="4"/>');
    if (entry.theme === 'wide_shot' || entry.theme === 'entrance') {
      boxes.push('<rect x="' + ((800 - fw) / 2) + '" y="' + ((480 - fh) / 2) + '" width="' + (fw / 3) + '" height="' + fh + '" fill="#8b7355" opacity="0.08"/>');
      boxes.push('<rect x="' + ((800 - fw) / 2 + fw * 2 / 3) + '" y="' + ((480 - fh) / 2) + '" width="' + (fw / 3) + '" height="' + fh + '" fill="#8b7355" opacity="0.08"/>');
    }
    boxes.push('<text x="400" y="36" text-anchor="middle" font-family="sans-serif" font-size="18" font-weight="bold" fill="' + textColor + '">' + escapeXml(entry.title) + '</text>');
    boxes.push('<text x="400" y="470" text-anchor="middle" font-family="sans-serif" font-size="11" fill="' + accentColor + '">composition study card · ' + escapeXml(entry.lessonTags.join(' · ')) + '</text>');
  }
  return '<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="800" height="480" viewBox="0 0 800 480">' + boxes.join('') + '</svg>';
}

async function ensureFallbackStudyFrames() {
  if (runtime.fallbackStudyReady) return;
  await ensureDir(FALLBACK_STUDY_DIR);
  var entries = [];
  for (var fbi = 0; fbi < FALLBACK_STUDY_THEMES.length; fbi++) {
    var t = FALLBACK_STUDY_THEMES[fbi];
    var svgStr = generateFallbackStudySvg(t);
    var pngPath = path.join(FALLBACK_STUDY_DIR, t.id + '.png');
    var epfPath = path.join(FALLBACK_STUDY_DIR, t.id + '.epf');
    if (!fs.existsSync(pngPath) || !fs.existsSync(epfPath)) {
      try {
        var { data, info } = await sharp(Buffer.from(svgStr))
          .resize(FRAME_WIDTH, FRAME_HEIGHT, { fit: 'fill' })
          .flatten({ background: '#ffffff' })
          .raw()
          .toBuffer({ resolveWithObject: true });
        var epfBuf = imageToFrameBuffer(data, info.width, info.height, info.channels);
        await fsp.writeFile(pngPath, await sharp(Buffer.from(svgStr)).resize(FRAME_WIDTH, FRAME_HEIGHT, { fit: 'fill' }).flatten({ background: '#ffffff' }).png().toBuffer());
        await fsp.writeFile(epfPath, epfBuf);
        console.log('generated fallback study frame: ' + t.id);
      } catch (genErr) {
        console.log('fallback study frame gen failed ' + t.id + ': ' + genErr.message);
        continue;
      }
    }
    entries.push({
      id: t.id,
      url: 'builtin://fallback/' + t.id,
      title: t.title,
      sourceType: 'fallback',
      source: 'Built-in Study Pack',
      theme: t.theme,
      kind: t.kind,
      poolType: 'study_frames',
      safetyStatus: 'approved',
      rightsStatus: 'known',
      rights: { author: 'Built-in', license: 'CC0', licenseUrl: '', usageTerms: 'Study use', sourcePageUrl: '' },
      lessonTags: t.lessonTags,
      processedPngPath: pngPath,
      epfPath: epfPath,
      width: FRAME_WIDTH,
      height: FRAME_HEIGHT,
      imageName: t.id + '.png',
      createdAt: new Date().toISOString(),
      lastShownAt: null,
      shownCount: 0,
      metadata: { fallback: true, lessonTags: t.lessonTags },
      hash: sha1(t.id),
    });
  }
  runtime.fallbackStudyEntries = entries;
  runtime.fallbackStudyReady = true;
  console.log('fallback study frames ready: ' + entries.length + ' entries');
}

function selectableImages() {
  return (runtime.fullImageIndex || runtime.imageIndex || []).filter(function(e) { return isImageReady(e) && isImageApproved(e); });
}

function studySelectableImages() {
  var realEntries = (runtime.fullImageIndex || runtime.imageIndex || []).filter(isStudySelectable);
  if (realEntries.length > 0) return realEntries;
  if (runtime.fallbackStudyReady && runtime.fallbackStudyEntries) {
    return runtime.fallbackStudyEntries.filter(function(e) { return fs.existsSync(e.processedPngPath); });
  }
  return [];
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

function isImageApproved(entry) {
  return entry && entry.safetyStatus === 'approved';
}

function isStudySelectable(entry) {
  return isImageReady(entry) && isImageApproved(entry) && entry.poolType === 'study_frames';
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

/**
 * selectStudyPhoto — shared pure function used by production selector and tests.
 * Calls updateLibraryStateForPhoto on the study-only selectable subset.
 * Returns { theme, entry, state, kind } or { theme:'NO_STUDY_FRAMES', entry:null }.
 */
function selectStudyPhoto(now, imageIndex, libraryState) {
  const snapshot = selectPhotoSnapshot(now, imageIndex);
  const studyIndex = (imageIndex || []).filter(isStudySelectable);
  const selection = updateLibraryStateForPhoto(snapshot, studyIndex);
  if (!selection.entry) {
    return { theme: 'NO_STUDY_FRAMES', entry: null, kind: 'shot', state: selection.state };
  }
  return selection;
}

async function buildPhotoSnapshot(now) {
  const snapshot = selectPhotoSnapshot(now, runtime.imageIndex || []);
  const selection = updateLibraryStateForPhoto(snapshot, studySelectableImages());
  runtime.libraryState = selection.state;
  await writeJson(LIBRARY_STATE_FILE, runtime.libraryState).catch((error) => {
    console.log(`library state write failed: ${error.message}`);
  });

  if (selection.entry) {
    selection.entry.lastShownAt = new Date().toISOString();
    selection.entry.shownCount = (selection.entry.shownCount || 0) + 1;
    // Persist the full image index (not just the selectable subset) to preserve pending/rejected entries
    await writeJson(IMAGE_INDEX_FILE, runtime.fullImageIndex || runtime.imageIndex || []).catch((error) => {
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

// buildPhotoSnapshotFromAsset — construct a photo snapshot from an explicit
// selected asset (used by ONE_SHOT and FOCUS_LOCK when assetId is provided).
// Bypasses schedule selection; uses the asset's localPath as the image source.
// Returns { snapshot, frame, photo } mirroring getContentForNow so createSnapshot
// receives a proper payload object and EPF1 Buffer.
async function buildPhotoSnapshotFromAsset(asset, now, prefix) {
  var snap = selectPhotoSnapshot(now);
  var assetTheme = (asset.metadata && asset.metadata.theme) || asset.libraryType || 'PHOTO';
  var frameId = (prefix || 'photo:asset') + ':' + asset.assetId + ':' + Date.now().toString(36);
  var photo = {
    mode: 'photo',
    kind: 'shot',
    slotKey: snap.slotKey,
    nextSwitchAt: snap.nextSwitchAt.toISOString(),
    nextSwitchLocal: formatLocalTimeLabel(snap.nextSwitchAt),
    timezone: TIMEZONE,
    frameId: frameId,
    title: assetTheme,
    imageStatus: 'ready',
    imageName: asset.originalName || path.basename(asset.localPath || 'asset'),
    imageSource: asset.sourceType || asset.libraryType || '',
    imageTheme: assetTheme,
    imagePath: asset.localPath,
    epfPath: (asset.metadata && asset.metadata.epfPath) || null,
  };
  // Render the EPF1 frame from the asset's local image file.
  var selection = { entry: null, theme: assetTheme, kind: 'shot' };
  if (photo.imagePath && fs.existsSync(photo.imagePath)) {
    selection.entry = { processedPngPath: photo.imagePath, width: FRAME_WIDTH, height: FRAME_HEIGHT };
  }
  var rawFrame = await renderPhotoFrame(selection, now);
  var frame = buildFrameBuffer(rawFrame);
  runtime.renderCount++;
  return {
    snapshot: {
      panelIndex: options.panel,
      panelName: PANEL_SIZES[options.panel].name,
      width: FRAME_WIDTH,
      height: FRAME_HEIGHT,
      mode: 'photo',
      frameId: frameId,
      title: assetTheme,
      nextSwitchAt: photo.nextSwitchAt,
      nextSwitchLocal: photo.nextSwitchLocal,
      timezone: TIMEZONE,
      timestamp: now.toISOString(),
      imageStatus: 'ready',
      imageName: photo.imageName,
      imageSource: photo.imageSource,
      imageTheme: photo.imageTheme,
      kind: 'shot',
    },
    frame: frame,
    photo: photo,
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

const NEWS_LAYOUT = {
  HEADER_H: 36, FOOTER_H: 18, MARGIN: 14, COL_GAP: 12, ROW_GAP: 8,
  badgeH: 14, badgeFont: 10, titleFont: 24, summaryFont: 18,
};
NEWS_LAYOUT.cardW = Math.floor((FRAME_WIDTH - NEWS_LAYOUT.MARGIN * 2 - NEWS_LAYOUT.COL_GAP) / 2);
NEWS_LAYOUT.cardH = Math.floor((FRAME_HEIGHT - NEWS_LAYOUT.HEADER_H - NEWS_LAYOUT.FOOTER_H - NEWS_LAYOUT.ROW_GAP * 2 - 8) / 3);

function layoutNewsCard(item, opts) {
  opts = opts || NEWS_LAYOUT;
  const titleMax = Math.floor((opts.cardW - 12) / (opts.titleFont * 0.55));
  const sumMax = Math.floor((opts.cardW - 12) / (opts.summaryFont * 0.56));
  const titleText = fitTextWidth(item.zhTitle, titleMax);
  const sumLines = wrapText(item.zhSummary || '', sumMax);
  const badgeH = opts.badgeH || 14;
  const titleY = badgeH + 5 + opts.titleFont; // offset from card top
  const sumStartY = titleY + 5;
  const sumLineH = opts.summaryFont + 2;
  const contentBottom = sumStartY + 3 * sumLineH + opts.summaryFont;
  const overflow = contentBottom > opts.cardH;
  return {
    titleText: titleText,
    titleLines: titleText ? 1 : 0,
    summaryLines: sumLines.slice(0, 3),
    summaryLineCount: Math.min(sumLines.length, 3),
    titleFontSize: opts.titleFont,
    summaryFontSize: opts.summaryFont,
    overflow: overflow,
    titleBounds: { y: titleY, height: opts.titleFont },
    summaryBounds: { y: sumStartY, height: 3 * sumLineH },
  };
}

function renderNewsSvg(news, now) {
  const items = (news.items || []).slice(0, 6);
  if (!items.length) {
    return createSvgHeader(FRAME_WIDTH, FRAME_HEIGHT,
      `<rect width="100%" height="100%" fill="#ffffff"/>
       <text x="20" y="240" font-family="${escapeXml(FONT_STACK)}" font-size="24" fill="#000000">暂无新闻</text>`);
  }

  const L = NEWS_LAYOUT;
  const boxes = [];
  boxes.push(`<rect x="0" y="0" width="${FRAME_WIDTH}" height="${FRAME_HEIGHT}" fill="#ffffff"/>`);

  // Header
  boxes.push(`<rect x="0" y="0" width="${FRAME_WIDTH}" height="${L.HEADER_H}" fill="#000000"/>`);
  boxes.push(`<text x="14" y="25" font-family="${escapeXml(FONT_STACK)}" font-size="16" font-weight="700" fill="#ffffff">简报 NEWS</text>`);
  boxes.push(`<text x="${FRAME_WIDTH - 14}" y="25" text-anchor="end" font-family="${escapeXml(FONT_STACK)}" font-size="12" fill="#ffffff">${escapeXml(formatDateTime(now))}</text>`);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x0 = L.MARGIN + col * (L.cardW + L.COL_GAP);
    const y0 = L.HEADER_H + 4 + row * (L.cardH + L.ROW_GAP);

    const style = categoryStyle(item.category);
    const label = CATEGORY_LABELS[String(item.category || '').toLowerCase()] || item.category || '综合';
    const badgeW = 7 + label.length * 8;

    const layout = layoutNewsCard(item, L);

    // Card background
    boxes.push(`<rect x="${x0 - 2}" y="${y0}" width="${L.cardW}" height="${L.cardH}" fill="#f6f6f6" rx="4"/>`);

    // Row 1: badge + source + time
    boxes.push(`<rect x="${x0 + 2}" y="${y0 + 3}" width="${badgeW}" height="${L.badgeH}" fill="${style.bg}" rx="2"/>`);
    boxes.push(`<text x="${x0 + 2 + badgeW / 2}" y="${y0 + 3 + 11}" text-anchor="middle" font-family="${escapeXml(FONT_STACK)}" font-size="${L.badgeFont}" font-weight="700" fill="${style.text}">${escapeXml(label)}</text>`);
    boxes.push(`<text x="${x0 + 2 + badgeW + 5}" y="${y0 + 3 + 11}" font-family="${escapeXml(FONT_STACK)}" font-size="10" fill="#888888">${escapeXml(truncateText(item.source, 8))}</text>`);
    const timeText = formatDateTime(item.publishedAt).slice(11, 16);
    boxes.push(`<text x="${x0 + L.cardW - 6}" y="${y0 + 3 + 11}" text-anchor="end" font-family="${escapeXml(FONT_STACK)}" font-size="9" fill="#aaaaaa">${escapeXml(timeText)}</text>`);

    // Row 2: title
    boxes.push(`<text x="${x0 + 4}" y="${y0 + 3 + L.badgeH + 5 + L.titleFont}" font-family="${escapeXml(FONT_STACK)}" font-size="${L.titleFont}" font-weight="700" fill="#111111">${escapeXml(layout.titleText)}</text>`);

    // Row 3-5: summary — 3 lines
    for (let li = 0; li < layout.summaryLines.length && li < 3; li++) {
      boxes.push(`<text x="${x0 + 4}" y="${y0 + 3 + L.badgeH + 5 + L.titleFont + 5 + (li + 1) * (L.summaryFont + 2)}" font-family="${escapeXml(FONT_STACK)}" font-size="${L.summaryFont}" fill="#111111">${escapeXml(layout.summaryLines[li])}</text>`);
    }
  }

  // Footer
  boxes.push(`<rect x="0" y="${FRAME_HEIGHT - L.FOOTER_H}" width="${FRAME_WIDTH}" height="${L.FOOTER_H}" fill="#000000"/>`);
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
        .resize(FRAME_WIDTH, FRAME_HEIGHT, { fit: 'contain', kernel: 'lanczos3' })
        .flatten({ background: '#ffffff' })
        .modulate({ brightness: 1.03, saturation: 1.15 })
        .blur(0.5)
        .raw()
        .toBuffer({ resolveWithObject: true })
    : sharp(selection.entry.processedPngPath)
        .resize(FRAME_WIDTH, FRAME_HEIGHT, { fit: 'contain' })
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

function imageToFrameBuffer(raw, width, height, channels) {
  return epaperImageFrame.imageToFrameBuffer(raw, width, height, channels, DITHERING_ENABLED);
}

function buildFrameBuffer(frameImage) {
  return epaperImageFrame.buildFrameBuffer(frameImage);
}

function hexPreview(buf, bytes) {
  return epaperEpf1.hexPreview(buf, bytes || 32);
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

// R3.5: Ensure active snapshot matches current schedule; publish if needed
// R3.7: ONE_SHOT_OVERRIDE — keep pinned snapshot until boundary expiry
async function ensureActiveSnapshotForSchedule(now) {
  if (!runtime.publicationService) return null;
  // R3.7: If operating mode is ONE_SHOT, check expiry first
  if (runtime.operatingModeService) {
    var osMode = runtime.operatingModeService.getMode();
    if (osMode === 'ONE_SHOT_OVERRIDE') {
      if (runtime.operatingModeService.checkExpiry(now)) {
        // BOUNDARY_EXPIRY: exit ONE_SHOT, clear persisted override, fall through to schedule publish
        runtime.operatingModeService.exitOneShot();
        if (runtime.overridePersistence) {
          try { runtime.overridePersistence.clearOverride(); } catch(e) {}
        }
        r1Logger.info('ONE_SHOT expired at boundary, restoring AUTO schedule');
      } else {
        // ONE_SHOT still active — keep current snapshot, no republish
        return await runtime.publicationService.getActive();
      }
    } else if (osMode === 'FOCUS_LOCK') {
      // FOCUS_LOCK persists until explicit DELETE — keep current snapshot
      return await runtime.publicationService.getActive();
    }
  }
  var active = await runtime.publicationService.getActive();
  var schedule = selectPhotoSnapshot(now, runtime.imageIndex || []);
  var scheduleKey = schedule.mode + ':' + (schedule.slotKey || '');
  if (active && active.frameId.indexOf(scheduleKey) === 0) return active;
  var content = await getContentForNow(now);
    var snap = R3_snapshotModel.createSnapshot(content.snapshot.frameId, content.snapshot, content.frame, content.snapshot.mode, { publishReason: 'schedule' });
    await runtime.publicationService.publish(snap);
    return snap;
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

function readBody(req, limit) {
  return new Promise(function(ok, fail) {
    var chunks = [];
    var total = 0;
    req.on('data', function(c) { total += c.length; if (limit && total > limit) { req.destroy(); fail(new Error('too large')); return; } chunks.push(c); });
    req.on('end', function() { ok(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', fail);
  });
}

function respondJson(res, data) {
  var b = Buffer.from(JSON.stringify(data, null, 2));
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': b.length });
  res.end(b);
}
function failJson(res, code, msg) {
  var b = Buffer.from(JSON.stringify({ error: msg }));
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(b);
}
function adminNetworkCheck(req) {
  if (ADMIN_ACCESS_MODE !== 'lan') return true;
  if (!ADM_PARSED_CIDRS.valid) return false;
  var ip = adminPolicy.getRemoteIP(req, TRUST_PROXY, ADM_TRUSTED_PROXY_CIDRS);
  if (!ip) return false;
  return adminPolicy.isAddressAllowed(ip, ADM_PARSED_CIDRS.parsed);
}

function adminCSRFCheck(req) {
  if (ADMIN_ACCESS_MODE !== 'lan') return { allowed: true };
  return adminCSRF.checkCSRF(req, ADMIN_ALLOW_HEADERLESS_WRITE);
}

function adminAuth(req) {
  if (ADMIN_ACCESS_MODE === 'lan') {
    if (!adminNetworkCheck(req)) return false;
    return true;
  }
  if (!ADMIN_TOKEN) return false;
  var auth = req.headers['authorization'] || '';
  return auth === 'Bearer ' + ADMIN_TOKEN;
}
function serveAdminFile(name) {
  var fp = path.join(ROOT_DIR, 'public', 'admin', name);
  if (!fs.existsSync(fp)) return null;
  var c = fs.readFileSync(fp);
  if (name === 'index.html' && ADMIN_ACCESS_MODE === 'lan') {
    c = c.toString().replace(/<div id=["']?login-overlay["']?[\s\S]*?<\/form>\s*<\/div>\s*<\/div>/, '');
  }
  return Buffer.from(c);
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
      const client = clientKey(req);
      if (!runtime.publicationService) { failJson(res, 503, 'SNAPSHOT_SERVICE_UNAVAILABLE'); return; }
      var activeSnap = await ensureActiveSnapshotForSchedule(now);
      runtime.pinStore.pin(client, activeSnap.snapshotId);
      const body = Buffer.from(JSON.stringify({
        ...activeSnap.payload, snapshotId: activeSnap.snapshotId, panelIndex,
        operatingMode: runtime.operatingModeService ? runtime.operatingModeService.getMode() : 'AUTO',
        frameUrl: `${req.headers.host ? `http://${req.headers.host}` : ''}/api/frame.bin?panel=${panelIndex}`,
        frameSha256: activeSnap.frameSha256,
        frameLength: activeSnap.frameLength,
      }, null, 2));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length });
      res.end(body);
      return;
    }

    if (parsed.pathname === '/api/frame.bin') {
      const client = clientKey(req);
      if (!runtime.publicationService) { res.writeHead(503, { 'Content-Type': 'text/plain' }); res.end('SNAPSHOT_SERVICE_UNAVAILABLE'); return; }
      var pinnedId = runtime.pinStore.get(client);
      var frameSnap = null;
      if (pinnedId) { frameSnap = runtime.snapshotCache.get(pinnedId); if (!frameSnap) frameSnap = await runtime.publicationService.loadSnapshot(pinnedId); }
      if (frameSnap) {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': frameSnap.frame.length,
          'X-Frame-Id': frameSnap.frameId, 'X-Frame-Hex-Preview': hexPreview(frameSnap.frame), 'X-Pinned': '1',
          'X-Frame-Mode': frameSnap.mode, 'X-Frame-Slot': frameSnap.payload.slotKey || frameSnap.frameId });
        res.end(frameSnap.frame); return;
      }
      var activeSnap = await runtime.publicationService.getActive();
      if (!activeSnap) activeSnap = await ensureActiveSnapshotForSchedule(now);
      if (activeSnap) {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': activeSnap.frame.length,
          'X-Frame-Id': activeSnap.frameId, 'X-Frame-Hex-Preview': hexPreview(activeSnap.frame),
          'X-Frame-Mode': activeSnap.mode, 'X-Frame-Slot': activeSnap.payload.slotKey || activeSnap.frameId });
        res.end(activeSnap.frame); return;
      }
      res.writeHead(503, { 'Content-Type': 'text/plain' }); res.end('SNAPSHOT_SERVICE_UNAVAILABLE');
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
        const palette = epaperPalette.PALETTE.map(function(c) { return { code: c.code, name: c.name, pixelCount: counts[String(c.code)] || 0 }; });
      palette.push({ code: 4, name: 'orange(unsupported)', pixelCount: counts['4'] || 0 });
      palette.push({ code: 7, name: 'reserved', pixelCount: counts['7'] || 0 });
      const body = Buffer.from(JSON.stringify({ timestamp: now.toISOString(), frameId: photo.frameId, imageName: photo.imageName, width: FRAME_WIDTH, height: FRAME_HEIGHT, totalPixels: FRAME_WIDTH * FRAME_HEIGHT, unsupportedCode4: counts['4'] || 0, palette }, null, 2));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length });
      res.end(body);
      return;
    }

    if (ENABLE_DEBUG_ROUTES && parsed.pathname === '/debug/pin-state.json') {
      const client = clientKey(req);
      var pinnedId = runtime.pinStore ? runtime.pinStore.get(client) : null;
      const body = Buffer.from(JSON.stringify({
        timestamp: now.toISOString(),
        client,
        hasPin: pinnedId !== null,
        snapshotId: pinnedId || null,
        pinStoreSize: runtime.pinStore ? runtime.pinStore.size() : 0,
        renderCount: runtime.renderCount,
        cachedFrames: runtime.cachedFrames.size,
      }, null, 2));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length });
      res.end(body);
      return;
    }
    if (ENABLE_DEBUG_ROUTES && parsed.pathname === '/debug/config') {
      const r = Buffer.from(JSON.stringify({
        DATA_DIR: DATA_DIR,
        NEWS_CACHE_FILE: NEWS_CACHE_FILE,
        LIBRARY_STATE_FILE: LIBRARY_STATE_FILE,
        NEWS_ROTATION_FILE: NEWS_ROTATION_FILE,
        IMAGE_INDEX_FILE: IMAGE_INDEX_FILE,
        FEEDS_FILE: FEEDS_FILE,
        CONFIG_FILE: APP_CONFIG.configFile || path.join(ROOT_DIR, 'config.json'),
      }, null, 2));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': r.length });
      res.end(r);
      return;
    }



    if (ENABLE_DEBUG_ROUTES && parsed.pathname === '/debug/clock') {
      const iso = parsed.searchParams.get('iso');
      if (iso) {
        runtime.nowProvider = () => new Date(iso);
        runtime.pinNowProvider = () => new Date(iso).getTime();
        if (runtime.pinStore && typeof runtime.pinStore.setClock === 'function') {
          runtime.pinStore.setClock({ nowMs: runtime.pinNowProvider });
        }
        const r = Buffer.from(JSON.stringify({ set: true, iso }));
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': r.length });
        res.end(r);
        return;
      }
      if (parsed.searchParams.get('reset') === '1') {
        runtime.nowProvider = null;
        runtime.pinNowProvider = null;
        if (runtime.pinStore && typeof runtime.pinStore.setClock === 'function') {
          runtime.pinStore.setClock(null);
        }
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
    
    if (ENABLE_DEBUG_ROUTES && parsed.pathname === '/test/frame-short-read') {
      var buf = Buffer.alloc(192010, 0xAA);
      buf.write('EPF1', 0, 4, 'ascii');
      buf.writeUInt16LE(800, 4);
      buf.writeUInt16LE(480, 6);
      buf.writeUInt8(49, 8);
      buf.writeUInt8(1, 9);
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': 192010, 'X-Frame-Id': 'test-frame-validation' });
      // Send only first 100000 bytes and close — simulates network truncation
      var partial = buf.slice(0, 100000);
      res.write(partial);
      res.socket.end();
      return;
    }

    if (ENABLE_DEBUG_ROUTES && parsed.pathname === '/test/frame-ok') {
      var fb2 = runtime.cachedFrames.get(clientKey(req));
      var fbAny = runtime.cachedFrames.size > 0 ? Array.from(runtime.cachedFrames.values())[0] : null;
      var buf = fbAny ? fbAny.frame : Buffer.alloc(192010, 0x11);
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': buf.length,
        'X-Frame-Id': 'test-frame-ok',
        'X-Frame-Mode': 'photo',
        'X-Frame-Slot': 'test',
      });
      res.end(buf);
      return;
    }

    if (ENABLE_DEBUG_ROUTES && parsed.pathname === '/test/frame-500') {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
      return;
    }

    if (ENABLE_DEBUG_ROUTES && parsed.pathname === '/test/frame-id-missing') {
      var buf3 = Buffer.alloc(192010, 0x11);
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': buf3.length });
      res.end(buf3);
      return;
    }

    if (ENABLE_DEBUG_ROUTES && parsed.pathname === '/test/frame-id-mismatch') {
      var buf4 = Buffer.alloc(192010, 0x11);
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': buf4.length, 'X-Frame-Id': 'wrong-id' });
      res.end(buf4);
      return;
    }

    if (ENABLE_DEBUG_ROUTES && parsed.pathname === '/test/frame-short') {
      var buf5 = Buffer.alloc(100, 0x11);
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': buf5.length, 'X-Frame-Id': 'test-frame-validation' });
      res.end(buf5);
      return;
    }

    if (ENABLE_DEBUG_ROUTES && parsed.pathname === '/test/frame-bad-magic') {
      var buf6 = Buffer.alloc(192010, 0xFF);
      buf6.write('BAD!', 0, 4, 'ascii');
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': buf6.length, 'X-Frame-Id': 'test-frame-validation' });
      res.end(buf6);
      return;
    }

    if (ENABLE_DEBUG_ROUTES && parsed.pathname === '/test/frame-bad-size') {
      var buf7 = Buffer.alloc(192010, 0x11);
      buf7.write('EPF1', 0, 4, 'ascii');
      buf7.writeUInt16LE(1234, 4);
      buf7.writeUInt16LE(567, 6);
      buf7.writeUInt8(49, 8);
      buf7.writeUInt8(1, 9);
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': buf7.length, 'X-Frame-Id': 'test-frame-validation' });
      res.end(buf7);
      return;
    }

    if (ENABLE_DEBUG_ROUTES && parsed.pathname === '/test/frame-bad-panel') {
      var buf8 = Buffer.alloc(192010, 0x11);
      buf8.write('EPF1', 0, 4, 'ascii');
      buf8.writeUInt16LE(800, 4);
      buf8.writeUInt16LE(480, 6);
      buf8.writeUInt8(99, 8);
      buf8.writeUInt8(1, 9);
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': buf8.length, 'X-Frame-Id': 'test-frame-validation' });
      res.end(buf8);
      return;
    }



    
    if (ENABLE_DEBUG_ROUTES && parsed.pathname === '/debug/test-instance') {
      var insId = APP_CONFIG.testInstanceId || '';
      var r = Buffer.from(JSON.stringify({ instanceId: insId, pid: process.pid }));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': r.length });
      res.end(r);
      return;
    }

    
    // ── Admin routes ──
    if (parsed.pathname === '/admin' || parsed.pathname === '/admin/' ||
        parsed.pathname.startsWith('/admin/') || parsed.pathname.startsWith('/api/admin/')) {
      if (!adminNetworkCheck(req)) { failJson(res, 403, 'ADMIN_NETWORK_DENIED'); return; }
      if (req.method !== 'GET' && req.method !== 'OPTIONS') {
        var csrfResult = adminCSRFCheck(req);
        if (!csrfResult.allowed) {
          // Malformed Origin/Referer headers surface a specific error so the
          // failure is diagnosable; all other CSRF denials collapse to the
          // generic cross-origin rejection code.
          var csrfErr = csrfResult.error;
          if (csrfErr !== 'INVALID_ORIGIN' && csrfErr !== 'INVALID_REFERER') csrfErr = 'ADMIN_CROSS_ORIGIN_DENIED';
          failJson(res, 403, csrfErr);
          return;
        }
      }
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    }
    if (parsed.pathname === '/api/admin/access-mode') {
      respondJson(res, { mode: ADMIN_ACCESS_MODE });
      return;
    }
    if (parsed.pathname === '/admin' || parsed.pathname === '/admin/') {
      var h = serveAdminFile('index.html');
      if (h) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(h); return; }
      res.writeHead(500); res.end('Admin file missing'); return;
    }
    if (parsed.pathname === '/admin/admin.css') {
      var c = serveAdminFile('admin.css');
      if (c) { res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' }); res.end(c); return; }
    }
    if (parsed.pathname === '/admin/admin.js') {
      var j = serveAdminFile('admin.js');
      if (j) { res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' }); res.end(j); return; }
    }

    if (parsed.pathname === '/api/admin/dashboard') {
      if (ADMIN_ACCESS_MODE !== 'lan' && !ADMIN_TOKEN) { failJson(res, 401, 'ADMIN_TOKEN not configured'); return; }
      if (ADMIN_ACCESS_MODE !== 'lan' && !req.headers['authorization']) { failJson(res, 401, 'authorization header missing'); return; }
      if (!adminAuth(req)) { failJson(res, 403, 'forbidden'); return; }
      if (typeof runtime.adminStateService?.getAdminState === 'function') {
        try {
          const st = await runtime.adminStateService.getAdminState();
          respondJson(res, { ...st, deprecated: true, deprecationNotice: 'Use GET /api/admin/state instead' });
        } catch(e) {
          respondJson(res, { status: 'error', error: e.message, deprecated: true });
        }
      } else {
        failJson(res, 503, 'AdminStateService not available');
      }
      return;
    }

    if (parsed.pathname === '/api/admin/news') {
      if (!adminAuth(req)) { failJson(res, 403, 'forbidden'); return; }
      var sel = [];
      try {
        var nw = now;
        var kn = 'news:' + nw.getFullYear() + '-' + String(nw.getMonth()+1).padStart(2,'0') + '-' + String(nw.getDate()).padStart(2,'0') + ':' + Math.floor(nw.getTime() / 900000);
        var ch = runtime.cachedSnapshots.get(kn);
        if (ch && ch.items) sel = ch.items.map(function(it) { return { source: it.source, category: it.category, title: it.zhTitle, summary: it.zhSummary, url: it.sourceUrl, titleLen: (it.zhTitle||'').length, summaryLen: (it.zhSummary||'').length, publishedAt: it.publishedAt, translationStatus: it.translationStatus }; });
      } catch(e) {}
      // Fallback: read from last_good_news.json if in-memory cache is empty
      if (sel.length === 0) {
        try {
          var lgPath = path.join(DATA_DIR, 'last_good_news.json');
          if (fs.existsSync(lgPath)) {
            var lg = JSON.parse(fs.readFileSync(lgPath, 'utf8'));
            if (lg && lg.items) sel = lg.items.map(function(it) { return { source: it.source, category: it.category, title: it.zhTitle || it.originalTitle, summary: it.zhSummary || it.originalSummary, url: it.sourceUrl, titleLen: (it.zhTitle||it.originalTitle||'').length, summaryLen: (it.zhSummary||it.originalSummary||'').length, publishedAt: it.publishedAt, translationStatus: it.translationStatus }; });
          }
        } catch(e) {}
      }
      respondJson(res, { selected: sel, candidates: [] });
      return;
    }

    if (parsed.pathname === '/api/admin/news/draft' && req.method === 'POST') {
      if (!adminAuth(req)) { failJson(res, 403, 'forbidden'); return; }
      try {
        var db = JSON.parse(await readBody(req));
        var di = db.items || db.selected || [];
        if (di.length !== 6) { failJson(res, 400, 'need exactly 6 items, got ' + di.length); return; }
        var nts = runtime.newsTitleService;
        if (!nts) { failJson(res, 503, 'NewsTitleService not available'); return; }
        var su = {}, st = {};
        var processed = [];
        for (var dk = 0; dk < di.length; dk++) {
          var d = di[dk];
          if (!d.title || !d.title.trim()) { failJson(res, 400, 'item ' + (dk+1) + ': title empty'); return; }
          if (!d.summary || !d.summary.trim()) { failJson(res, 400, 'item ' + (dk+1) + ': summary empty'); return; }
          if (!d.url || !d.url.trim()) { failJson(res, 400, 'item ' + (dk+1) + ': URL empty'); return; }
          var un = d.url.toLowerCase().replace(/[?#].*$/, '');
          if (su[un]) { failJson(res, 400, 'duplicate URL: ' + d.url); return; }
          su[un] = true;
          var tResult = await nts.normalizeTitle(d.title, d.summary);
          var tKey = tResult.displayTitle.replace(/[\s]/g, '').toLowerCase().slice(0, 12);
          if (st[tKey]) { failJson(res, 400, 'duplicate title after normalization: ' + d.title); return; }
          st[tKey] = true;
          processed.push({
            source: d.source || '',
            category: d.category || '',
            url: d.url,
            publishedAt: d.publishedAt || null,
            rawTitle: d.title,
            rawSummary: d.summary || '',
            displayTitle: tResult.displayTitle,
            displaySummary: tResult.displaySummary || d.summary || '',
            titleWidthPx: tResult.titleWidthPx || null,
            titleMaxWidthPx: tResult.titleMaxWidthPx || null,
            titleStatus: tResult.titleStatus || 'ok',
            reviewStatus: tResult.titleStatus === 'needs_review' ? 'pending' : 'approved',
            normalizationVersion: tResult.normalizationVersion || '1.0',
          });
        }
        require('fs').writeFileSync(path.join(DATA_DIR, 'admin_news_draft.json'), JSON.stringify({ items: processed }, null, 2));
        respondJson(res, { status: 'ok', count: processed.length, items: processed });
      } catch(e) { failJson(res, 500, e.message); }
      return;
    }

    if (parsed.pathname === '/api/admin/publish/news' && req.method === 'POST') {
      if (!adminAuth(req)) { failJson(res, 403, 'forbidden'); return; }
      var draftPath = path.join(DATA_DIR, 'admin_news_draft.json');
      try {
        var draftData = JSON.parse(fs.readFileSync(draftPath, 'utf8'));
        var draftItems = draftData.items || [];
        var failedItems = [];
        for (var ni = 0; ni < draftItems.length; ni++) {
          var item = draftItems[ni];
          if (item.titleStatus === 'needs_review' || item.reviewStatus === 'pending') {
            failedItems.push({ index: ni, title: item.displayTitle || item.rawTitle, titleStatus: item.titleStatus, reviewStatus: item.reviewStatus });
          }
        }
        if (failedItems.length > 0) {
          failJson(res, 400, 'items need review: ' + JSON.stringify(failedItems));
          return;
        }
      } catch(e) {
        failJson(res, 400, 'cannot read draft: ' + e.message);
        return;
      }
      var fid = 'manual-news:' + Date.now().toString(36);
      var overrideFile = path.join(DATA_DIR, 'admin_override.json');
      var oldOverride = null;
      try { oldOverride = fs.readFileSync(overrideFile, 'utf8'); } catch(e) {}
      var newOverride = JSON.stringify({ mode: 'manual-news', createdAt: new Date().toISOString(), expiresAt: null }, null, 2);
      fs.writeFileSync(overrideFile, newOverride);
      try {
        if (runtime.publicationService && runtime.snapshotStore) {
          var content = await getContentForNow(runtime.nowProvider ? runtime.nowProvider() : new Date());
          var snap = R3_snapshotModel.createSnapshot(content.snapshot.frameId, content.snapshot, content.frame, content.snapshot.mode, { publishReason: 'manual_news' });
          await runtime.publicationService.publish(snap);
        }
      } catch(e) {
        r1Logger.warn('admin/news publish failed, restoring override: ' + e.message);
        if (oldOverride) fs.writeFileSync(overrideFile, oldOverride);
        else try { fs.unlinkSync(overrideFile); } catch(e2) {}
        failJson(res, 500, 'publish failed: ' + e.message);
        return;
      }
      respondJson(res, { frameId: fid });
      return;
    }

    if (parsed.pathname === '/api/admin/publish/photo' && req.method === 'POST') {
      if (!adminAuth(req)) { failJson(res, 403, 'forbidden'); return; }
      var photoId = '';
      try { var pb = JSON.parse(await readBody(req)); photoId = (pb && pb.photoId) || ''; } catch(e) {}
      var imgIdx = [];
      try { imgIdx = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'image_index.json'), 'utf8')); } catch(e) {}
      var foundEntry = null;
      for (var pi2 = 0; pi2 < imgIdx.length; pi2++) {
        if (imgIdx[pi2].id === photoId) { foundEntry = imgIdx[pi2]; break; }
      }
      if (!foundEntry && photoId) { failJson(res, 400, 'unknown photo: ' + photoId); return; }
      if (foundEntry) {
        var approval = require('./src/images/image-approval-adapter').resolveStatus(foundEntry);
        if (approval.safetyStatus !== 'SAFE') { failJson(res, 400, 'photo safety check failed: ' + (approval.safetyStatus)); return; }
        if (approval.reviewStatus !== 'APPROVED') { failJson(res, 400, 'photo review check failed: ' + (approval.reviewStatus)); return; }
        if (approval.lifecycleStatus !== 'SELECTABLE') { failJson(res, 400, 'photo lifecycle check failed: ' + (approval.lifecycleStatus)); return; }
      }
      var fid2 = 'manual-photo:' + Date.now().toString(36);
      var overrideFile = path.join(DATA_DIR, 'admin_override.json');
      var oldOverride = null;
      try { oldOverride = fs.readFileSync(overrideFile, 'utf8'); } catch(e) {}
      var newOverride = JSON.stringify({ mode: 'manual-photo', createdAt: new Date().toISOString(), expiresAt: null }, null, 2);
      fs.writeFileSync(overrideFile, newOverride);
      try {
        if (runtime.publicationService && runtime.snapshotStore) {
          var content = await getContentForNow(runtime.nowProvider ? runtime.nowProvider() : new Date());
          var snap = R3_snapshotModel.createSnapshot(content.snapshot.frameId, content.snapshot, content.frame, content.snapshot.mode, { publishReason: 'manual_photo' });
          await runtime.publicationService.publish(snap);
        }
      } catch(e) {
        r1Logger.warn('admin/photo publish failed, restoring override: ' + e.message);
        if (oldOverride) fs.writeFileSync(overrideFile, oldOverride);
        else try { fs.unlinkSync(overrideFile); } catch(e2) {}
        failJson(res, 500, 'publish failed: ' + e.message);
        return;
      }
      respondJson(res, { frameId: fid2 });
      return;
    }

    // R3.7: ONE_SHOT publication — pin a snapshot until next HH:00/HH:30 boundary
    if (parsed.pathname === '/api/admin/publish/one-shot' && req.method === 'POST') {
      if (!adminAuth(req)) { failJson(res, 403, 'forbidden'); return; }
      if (!runtime.operatingModeService || !runtime.publicationService) {
        failJson(res, 503, 'operating mode service unavailable'); return;
      }
      try {
        var osBody = JSON.parse(await readBody(req) || '{}');
        var contentType = String(osBody.contentType || 'photo').toLowerCase();
        var libraryType = String(osBody.libraryType || 'custom').toLowerCase();
        var assetId = osBody.assetId || '';
        if (contentType !== 'photo' && contentType !== 'news') {
          failJson(res, 400, 'contentType must be "photo" or "news", got: ' + contentType); return;
        }
        var osNow = runtime.nowProvider ? runtime.nowProvider() : new Date();
        var osExpiresAt = computeNextSwitchAt(osNow);
        var osContent;
        if (contentType === 'news') {
          osContent = await buildNewsSnapshot(osNow);
        } else if (assetId) {
          // Explicit asset selection via assetSelectionService
          if (!runtime.assetSelectionService) {
            failJson(res, 400, 'assetSelectionService unavailable — cannot select explicit asset'); return;
          }
          try {
            var osSelection = await runtime.assetSelectionService.selectForOneShot(libraryType, assetId);
            osContent = await buildPhotoSnapshotFromAsset(osSelection.asset, osNow, 'one-shot:photo');
          } catch(selErr) {
            failJson(res, 400, 'asset selection failed: ' + selErr.message); return;
          }
        } else {
          osContent = await buildPhotoSnapshot(osNow);
        }
        var osFrameId = 'one-shot:' + contentType + ':' + Date.now().toString(36);
        var osSnap = R3_snapshotModel.createSnapshot(osFrameId, osContent.snapshot, osContent.frame, contentType, { publishReason: 'one_shot' });
        await runtime.publicationService.publish(osSnap);
        runtime.operatingModeService.enterOneShot(osSnap.snapshotId, osExpiresAt);
        // V3: persist override via overridePersistence (replaces ad-hoc writeFileSync).
        // On restart, validateOverrideAsync() re-checks the asset; if it has been
        // deleted / marked unsafe, the override is cleared (no silent swap).
        if (runtime.overridePersistence) {
          try {
            runtime.overridePersistence.saveOverride({
              mode: 'ONE_SHOT_OVERRIDE',
              assetId: assetId || null,
              snapshotId: osSnap.snapshotId,
              libraryType: libraryType,
              contentType: contentType,
              savedAt: new Date().toISOString(),
              expiresAt: osExpiresAt.toISOString(),
            });
          } catch (e) {
            r1Logger.warn('Failed to persist ONE_SHOT override: ' + e.message);
          }
        }
        respondJson(res, {
          snapshotId: osSnap.snapshotId,
          frameId: osFrameId,
          expiresAt: osExpiresAt.toISOString(),
          operatingMode: 'ONE_SHOT_OVERRIDE',
        });
      } catch(e) {
        r1Logger.warn('one-shot publish failed: ' + e.message);
        failJson(res, 500, 'one-shot publish failed: ' + e.message);
      }
      return;
    }

    // R3.7: FOCUS_LOCK — pin a snapshot until explicit DELETE
    if (parsed.pathname === '/api/admin/focus-lock' && req.method === 'PUT') {
      if (!adminAuth(req)) { failJson(res, 403, 'forbidden'); return; }
      if (!runtime.operatingModeService || !runtime.publicationService) {
        failJson(res, 503, 'operating mode service unavailable'); return;
      }
      try {
        var flBody = JSON.parse(await readBody(req) || '{}');
        var flLibraryType = String(flBody.libraryType || 'custom').toLowerCase();
        var flTheme = flBody.theme || null;
        var flAlbumId = flBody.albumId || null;
        var flNow = runtime.nowProvider ? runtime.nowProvider() : new Date();
        var flContent;
        // Use assetSelectionService to find a matching asset (no schedule fallback)
        if (!runtime.assetSelectionService) {
          failJson(res, 503, 'assetSelectionService unavailable'); return;
        }
        try {
          var flSelection = await runtime.assetSelectionService.selectForFocusLock({
            libraryType: flLibraryType,
            theme: flTheme,
            albumId: flAlbumId,
          });
          flContent = await buildPhotoSnapshotFromAsset(flSelection.asset, flNow, 'focus-lock:photo');
        } catch(selErr) {
          // No matching asset → 404 (no schedule fallback)
          failJson(res, 404, 'no matching asset found: ' + selErr.message); return;
        }
        var flFrameId = 'focus-lock:' + Date.now().toString(36);
        var flSnap = R3_snapshotModel.createSnapshot(flFrameId, flContent.snapshot, flContent.frame, 'photo', { publishReason: 'focus_change' });
        await runtime.publicationService.publish(flSnap);
        runtime.operatingModeService.enterFocusLock(flSnap.snapshotId, {
          libraryType: flLibraryType,
          theme: flTheme,
          albumId: flAlbumId,
          resolvedAssetId: flSelection.assetId,
        });
        // V3: persist override via overridePersistence for restart restore.
        if (runtime.overridePersistence) {
          try {
            runtime.overridePersistence.saveOverride({
              mode: 'FOCUS_LOCK',
              assetId: flSelection.assetId,
              snapshotId: flSnap.snapshotId,
              libraryType: flLibraryType,
              theme: flTheme,
              albumId: flAlbumId,
              savedAt: new Date().toISOString(),
            });
          } catch (e) {
            r1Logger.warn('Failed to persist FOCUS_LOCK override: ' + e.message);
          }
        }
        respondJson(res, {
          snapshotId: flSnap.snapshotId,
          frameId: flFrameId,
          operatingMode: 'FOCUS_LOCK',
          libraryType: flLibraryType,
          theme: flTheme,
          albumId: flAlbumId,
          resolvedAssetId: flSelection.assetId,
        });
      } catch(e) {
        r1Logger.warn('focus-lock enter failed: ' + e.message);
        failJson(res, 500, 'focus-lock failed: ' + e.message);
      }
      return;
    }

    if (parsed.pathname === '/api/admin/focus-lock' && req.method === 'DELETE') {
      if (!adminAuth(req)) { failJson(res, 403, 'forbidden'); return; }
      if (!runtime.operatingModeService || !runtime.publicationService) {
        failJson(res, 503, 'operating mode service unavailable'); return;
      }
      try {
        runtime.operatingModeService.exitFocusLock();
        // V3: clear persisted override via overridePersistence (replaces ad-hoc unlinkSync)
        if (runtime.overridePersistence) {
          try { runtime.overridePersistence.clearOverride(); } catch(e) {}
        }
        // Re-publish current schedule-based snapshot
        if (runtime.snapshotStore) {
          var flRestoreNow = runtime.nowProvider ? runtime.nowProvider() : new Date();
          var flRestoreContent = await getContentForNow(flRestoreNow);
          var flRestoreSnap = R3_snapshotModel.createSnapshot(flRestoreContent.snapshot.frameId, flRestoreContent.snapshot, flRestoreContent.frame, flRestoreContent.snapshot.mode, { publishReason: 'schedule_restore' });
          await runtime.publicationService.publish(flRestoreSnap);
        }
        respondJson(res, { status: 'ok', operatingMode: 'AUTO' });
      } catch(e) {
        r1Logger.warn('focus-lock exit failed: ' + e.message);
        failJson(res, 500, 'focus-lock release failed: ' + e.message);
      }
      return;
    }

    if (parsed.pathname === '/api/admin/rollback' && req.method === 'POST') {
      if (!adminAuth(req)) { failJson(res, 403, 'forbidden'); return; }
      if (runtime.publicationService) {
        try {
          var rbBody = JSON.parse(await readBody(req));
          var rbSnapshotId = rbBody && (rbBody.snapshotId || rbBody.publishId);
          if (!rbSnapshotId) { failJson(res, 400, 'snapshotId required'); return; }
          await runtime.publicationService.rollback(rbSnapshotId);
          respondJson(res, { status: 'ok', snapshotId: rbSnapshotId });
          return;
        } catch (e) {
          failJson(res, 400, 'rollback failed: ' + e.message);
          return;
        }
      }
      var rbId = Date.now().toString(36);
      respondJson(res, { status: 'ok', frameId: 'rollback:' + rbId });
      return;
    }

    if (parsed.pathname === '/api/admin/publish-history') {
      if (!adminAuth(req)) { failJson(res, 403, 'forbidden'); return; }
      if (runtime.publicationHistory) {
        try {
          var r3History = await runtime.publicationHistory.list();
          // Only mark the first (most recent) as active
          if (r3History && r3History.length > 0) {
            r3History[0].status = 'active';
            for (var hi = 1; hi < r3History.length; hi++) {
              r3History[hi].status = 'archived';
            }
          }
          respondJson(res, { history: r3History || [] });
          return;
        } catch(e) {}
      }
      respondJson(res, { history: [] });
      return;
    }

    if (parsed.pathname === '/api/admin/photos') {
      if (!adminAuth(req)) { failJson(res, 403, 'forbidden'); return; }
      var idx = [];
      try { idx = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'image_index.json'), 'utf8')); } catch(e) {}
      respondJson(res, { photos: idx.map(function(e) { return { id: e.id, title: e.title, source: e.source, width: e.width, height: e.height, theme: e.theme, kind: e.kind, poolType: e.poolType || '', safetyStatus: e.safetyStatus || 'pending', createdAt: e.createdAt }; }), uploadAvailable: false, uploadDisabledReason: '安全分类器未就绪，暂不可上传' });
      return;
    }

    if (parsed.pathname === '/api/admin/photos/upload' && req.method === 'POST') {
      if (!adminAuth(req)) { failJson(res, 403, 'forbidden'); return; }
      // Check if photo upload is supported
      var uploadDisabled = true;
      var uploadReason = '安全分类器未就绪，暂不可上传';
      if (uploadDisabled) {
        failJson(res, 503, uploadReason);
        return;
      }
      // TODO: Implement actual file upload handling
      failJson(res, 501, '上传功能尚未实现');
      return;
    }

    if (parsed.pathname === '/api/admin/photo-preview' || parsed.pathname === '/api/admin/photo-eink-preview') {
      if (!adminAuth(req)) { failJson(res, 403, 'forbidden'); return; }
      var pvPhotoId = '';
      try { var pvBody = JSON.parse(await readBody(req)); pvPhotoId = (pvBody && pvBody.photoId) || ''; } catch(e) {}
      if (!pvPhotoId) { failJson(res, 400, 'photoId required'); return; }
      var pvIdx = [];
      try { pvIdx = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'image_index.json'), 'utf8')); } catch(e) {}
      var pvEntry = null;
      for (var pvi = 0; pvi < pvIdx.length; pvi++) {
        if (pvIdx[pvi].id === pvPhotoId) { pvEntry = pvIdx[pvi]; break; }
      }
      if (!pvEntry) { failJson(res, 404, 'photo not found'); return; }
      var pvImgPath = pvEntry.processedPngPath || pvEntry.rawPath || '';
      if (!pvImgPath) { failJson(res, 404, 'no image path'); return; }
      var pvSip = runtime.safeImagePath;
      if (!pvSip || !pvSip.isSafe(pvImgPath)) { failJson(res, 403, 'forbidden'); return; }
      try {
        var pvFullPath = pvSip.resolve(pvImgPath);
        var pvRecipe = { fitMode: 'contain', background: '#ffffff' };
        if (parsed.pathname === '/api/admin/photo-eink-preview') {
          var pvRst = runtime.imageRasterizer;
          var pvResult = await pvRst.rasterize(pvFullPath, pvRecipe, { width: FRAME_WIDTH, height: FRAME_HEIGHT });
          // Send preview PNG (not binary EPF1), with frame metadata in headers
          var pvPNG = await sharp(pvFullPath).resize(FRAME_WIDTH, FRAME_HEIGHT, { fit: 'contain', background: '#ffffff' }).removeAlpha().png().toBuffer();
          res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': pvPNG.length, 'X-Format': 'epf1', 'X-Frame-Sha256': pvResult.hash, 'X-Frame-Length': String(pvResult.frameBuffer.length) });
          res.end(pvPNG);
        } else {
          var pvSvc = new ImageRecipeService();
          var pvResult2 = await pvSvc.processImage(pvFullPath, pvRecipe);
          // Convert raw RGB to PNG for browser display
          var pngBuf = await sharp(pvResult2.buffer, { raw: { width: pvResult2.info.width, height: pvResult2.info.height, channels: pvResult2.info.channels } }).png().toBuffer();
          res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': pngBuf.length, 'X-Source-Hash': pvResult2.sourceHash, 'X-Recipe-Hash': pvResult2.recipeHash, 'X-Processed-Image-Hash': pvResult2.hash });
          res.end(pngBuf);
        }
      } catch(e) {
        failJson(res, 500, 'preview failed: ' + e.message);
      }
      return;
    }

    // Serve individual photo thumbnail/image
    var photoMatch = parsed.pathname.match(/^\/api\/admin\/photos\/([^/]+)\/thumbnail$/);
    if (photoMatch) {
      if (!adminAuth(req)) { failJson(res, 403, 'forbidden'); return; }
      var photoId = photoMatch[1];
      var photoIdx = [];
      try { photoIdx = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'image_index.json'), 'utf8')); } catch(e) {}
      var photoEntry = null;
      for (var pi = 0; pi < photoIdx.length; pi++) {
        if (photoIdx[pi].id === photoId) { photoEntry = photoIdx[pi]; break; }
      }
      if (!photoEntry) { res.writeHead(404); res.end('not found'); return; }
      var imgPath = photoEntry.processedPngPath || photoEntry.rawPath || '';
      if (!imgPath) { res.writeHead(404); res.end('no image path'); return; }
      var sip = runtime.safeImagePath;
      if (!sip || !sip.isSafe(imgPath)) { res.writeHead(403); res.end('forbidden'); return; }
      try {
        var fullImgPath = sip.resolve(imgPath);
        var imgBuf = fs.readFileSync(fullImgPath);
        var ext = path.extname(fullImgPath).toLowerCase();
        var ct = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': ct, 'Cache-Control': 'private, no-store' });
        res.end(imgBuf);
      } catch(e) {
        res.writeHead(500); res.end('read error');
      }
      return;
    }


    if (parsed.pathname === '/api/admin/override' && req.method === 'DELETE') {
      if (!adminAuth(req)) { failJson(res, 403, 'forbidden'); return; }
      // V3: clear persisted override via overridePersistence (replaces ad-hoc unlinkSync)
      if (runtime.overridePersistence) {
        try { runtime.overridePersistence.clearOverride(); } catch(e) {}
      } else {
        try { fs.unlinkSync(path.join(DATA_DIR, 'admin_override.json')); } catch(e) {}
      }
      // Also exit any active operating mode so the schedule can republish
      if (runtime.operatingModeService) {
        try { runtime.operatingModeService.exitOneShot(); } catch(e) {}
        try { runtime.operatingModeService.exitFocusLock(); } catch(e) {}
      }
      // R3.6: Re-publish schedule-based content after clearing override
      if (runtime.publicationService && runtime.snapshotStore) {
        try {
          var content = await getContentForNow(runtime.nowProvider ? runtime.nowProvider() : new Date());
          var snap = R3_snapshotModel.createSnapshot(content.snapshot.frameId, content.snapshot, content.frame, content.snapshot.mode, { publishReason: 'schedule_restore' });
          await runtime.publicationService.publish(snap);
        } catch (e) {
          r1Logger.warn('R3 publish after override clear failed: ' + e.message);
        }
      }
      respondJson(res, { status: 'ok' });
      return;
    }

    // ── Admin read-only query routes (R10: admin-query-service HTTP exposure) ──
    if (parsed.pathname === '/api/admin/system/status') {
      if (!adminAuth(req)) { failJson(res, 403, 'forbidden'); return; }
      if (typeof runtime.adminStateService?.getAdminState === 'function') {
        try {
          const st = await runtime.adminStateService.getAdminState();
          respondJson(res, { ...st, deprecated: true, deprecationNotice: 'Use GET /api/admin/state instead' });
        } catch(e) { failJson(res, 500, 'system status failed (admin state): ' + e.message); }
      } else {
        failJson(res, 503, 'AdminStateService not available');
      }
      return;
    }

    if (parsed.pathname === '/api/admin/publications') {
      if (!adminAuth(req)) { failJson(res, 403, 'forbidden'); return; }
      if (!runtime.adminQueryService) { failJson(res, 503, 'admin query service unavailable'); return; }
      try {
        var pubs = await runtime.adminQueryService.listPublications();
        respondJson(res, { publications: pubs || [] });
      } catch(e) { failJson(res, 500, 'publications query failed: ' + e.message); }
      return;
    }

    if (parsed.pathname.indexOf('/api/admin/publications/') === 0) {
      if (!adminAuth(req)) { failJson(res, 403, 'forbidden'); return; }
      if (!runtime.adminQueryService) { failJson(res, 503, 'admin query service unavailable'); return; }
      var pubSnapshotId = decodeURIComponent(parsed.pathname.slice('/api/admin/publications/'.length));
      if (!pubSnapshotId) { failJson(res, 400, 'snapshotId required'); return; }
      try {
        var pubDetail = await runtime.adminQueryService.getPublication(pubSnapshotId);
        if (!pubDetail) { failJson(res, 404, 'publication not found: ' + pubSnapshotId); return; }
        respondJson(res, pubDetail);
      } catch(e) { failJson(res, 500, 'publication query failed: ' + e.message); }
      return;
    }

    if (parsed.pathname === '/api/admin/assets') {
      if (!adminAuth(req)) { failJson(res, 403, 'forbidden'); return; }
      if (!runtime.adminQueryService) { failJson(res, 503, 'admin query service unavailable'); return; }
      var assetFilter = {};
      if (query.libraryType) assetFilter.libraryType = query.libraryType;
      if (query.safetyStatus) assetFilter.safetyStatus = query.safetyStatus;
      if (query.lifecycleStatus) assetFilter.lifecycleStatus = query.lifecycleStatus;
      if (query.sha256) assetFilter.sha256 = query.sha256;
      try {
        var assets = await runtime.adminQueryService.listAssets(assetFilter);
        respondJson(res, { assets: assets || [] });
      } catch(e) { failJson(res, 500, 'assets query failed: ' + e.message); }
      return;
    }

    if (parsed.pathname.indexOf('/api/admin/assets/') === 0) {
      if (!adminAuth(req)) { failJson(res, 403, 'forbidden'); return; }
      if (!runtime.adminQueryService) { failJson(res, 503, 'admin query service unavailable'); return; }
      var assetId = decodeURIComponent(parsed.pathname.slice('/api/admin/assets/'.length));
      if (!assetId) { failJson(res, 400, 'assetId required'); return; }
      try {
        var assetDetail = await runtime.adminQueryService.getAsset(assetId);
        if (!assetDetail) { failJson(res, 404, 'asset not found: ' + assetId); return; }
        respondJson(res, assetDetail);
      } catch(e) { failJson(res, 500, 'asset query failed: ' + e.message); }
      return;
    }

    if (parsed.pathname === '/api/admin/features') {
      if (!adminAuth(req)) { failJson(res, 403, 'forbidden'); return; }
      var featureFlagsSource = runtime.featureFlagView || (runtime.adminQueryService && runtime.adminQueryService.getFeatureFlags ? runtime.adminQueryService : null);
      if (!featureFlagsSource || typeof featureFlagsSource.getFeatureFlags !== 'function') { failJson(res, 503, 'feature flag view unavailable'); return; }
      try {
        var flags = featureFlagsSource.getFeatureFlags();
        respondJson(res, flags);
      } catch(e) { failJson(res, 500, 'feature flags query failed: ' + e.message); }
      return;
    }

    // ── Library API (R4) — GET / PATCH / DELETE implemented; POST upload deferred ──
    if (parsed.pathname === '/api/admin/library' && req.method === 'GET') {
      if (!adminAuth(req)) { failJson(res, 403, 'forbidden'); return; }
      if (!runtime.assetRepository) { failJson(res, 503, 'asset repository unavailable'); return; }
      var libType = String(query.libraryType || '').toUpperCase();
      if (libType !== 'LEARNING' && libType !== 'CUSTOM') {
        failJson(res, 400, 'libraryType must be "learning" or "custom", got: ' + query.libraryType); return;
      }
      try {
        var libAssets = await runtime.assetRepository.list({ libraryType: libType });
        respondJson(res, { libraryType: libType, assets: libAssets || [] });
      } catch(e) { failJson(res, 500, 'library query failed: ' + e.message); }
      return;
    }

    if (parsed.pathname === '/api/admin/library/custom/upload' && req.method === 'POST') {
      if (!adminAuth(req)) { failJson(res, 403, 'forbidden'); return; }
      // Feature flag gate: customLibraryEnabled must be true (configured in load-config)
      if (!runtime.config || !runtime.config.features || !runtime.config.features.customLibraryEnabled) {
        failJson(res, 503, 'FEATURE_DISABLED: customLibraryEnabled is false'); return;
      }
      if (!runtime.customLibraryService) { failJson(res, 503, 'SAFETY_GATE_REQUIRED: custom library service unavailable'); return; }
      // V3 streaming upload: accept application/octet-stream only.
      // Metadata (original name / mime / size) is passed via headers — no JSON
      // body, no base64, no client-provided file paths. The request stream is
      // piped straight into processUploadStream which writes to quarantine with
      // O_EXCL, enforces maxUploadBytes mid-stream, and runs the full safety
      // chain (decode → classifier → sha256 → dedup → move → audit → repo).
      var contentTypeHdr = String(req.headers['content-type'] || '').toLowerCase();
      if (contentTypeHdr.indexOf('application/octet-stream') !== 0) {
        failJson(res, 415, 'Content-Type must be application/octet-stream (streaming upload)'); return;
      }
      var streamMetadata = {
        originalName: req.headers['x-original-name'] || 'upload.bin',
        mimeType: req.headers['x-mime-type'] || '',
        expectedSize: parseInt(req.headers['content-length'] || '0', 10) || undefined,
      };
      var streamMaxBytes = (runtime.config.upload && runtime.config.upload.maxUploadBytes) || undefined;
      try {
        var streamResult = await runtime.customLibraryService.processUploadStream(
          req, streamMetadata, { maxBytes: streamMaxBytes }
        );
        if (streamResult.status === 'ACCEPTED') {
          res.writeHead(202, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'accepted', assetId: streamResult.assetId }));
        } else if (streamResult.status === 'REJECTED') {
          // TOO_LARGE / DECODE_FAILED / MIME_MISMATCH / NSFW / CLASSIFIER_UNAVAILABLE etc.
          var rejCode = streamResult.reason || 'unknown';
          // CLASSIFIER_UNAVAILABLE / FAIL_CLOSED / FEATURE_NOT_READY is a server-side
          // gate failure (503), not a client input error.
          if (rejCode === 'CLASSIFIER_UNAVAILABLE' || rejCode === 'FAIL_CLOSED' || rejCode === 'FEATURE_NOT_READY') {
            failJson(res, 503, 'upload rejected: ' + rejCode + ' (classifier not ready, fail-closed)');
          } else {
            failJson(res, 400, 'upload rejected: ' + rejCode + (streamResult.error ? ' — ' + streamResult.error : ''));
          }
        } else if (streamResult.status === 'DUPLICATE') {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'duplicate', sha256: streamResult.sha256 }));
        } else if (streamResult.status === 'FEATURE_NOT_READY') {
          failJson(res, 503, 'FEATURE_NOT_READY: classifier not ready, fail-closed');
        } else {
          failJson(res, 500, 'upload error: ' + (streamResult.error || streamResult.status || 'unknown'));
        }
      } catch(e) { failJson(res, 500, 'upload failed: ' + e.message); }
      return;
    }

    if (parsed.pathname === '/api/admin/learning/ingest' && req.method === 'POST') {
      if (!adminAuth(req)) { failJson(res, 403, 'forbidden'); return; }
      // Feature flag gate: learningLibraryEnabled must be true (configured in load-config)
      if (!runtime.config || !runtime.config.features || !runtime.config.features.learningLibraryEnabled) {
        failJson(res, 503, 'FEATURE_DISABLED: learningLibraryEnabled is false'); return;
      }
      // Classifier readiness gate: fail-closed — do not ingest if classifier not ready
      if (runtime.safetyClassifierPort && !runtime.safetyClassifierPort.ready) {
        failJson(res, 503, 'SAFETY_CLASSIFIER_NOT_READY'); return;
      }
      // 触发 learning 摄取(自动 fetch sources → validate → dedup → persist)
      if (!runtime.learningIngestionService) { failJson(res, 503, 'learning ingestion service unavailable'); return; }
      try {
        var ingestResults = await runtime.learningIngestionService.ingestAll();
        var accepted = 0, rejected = 0, duplicate = 0, errored = 0;
        (ingestResults || []).forEach(function(r) {
          if (!r) return;
          if (r.status === 'ACCEPTED') accepted++;
          else if (r.status === 'REJECTED') rejected++;
          else if (r.status === 'DUPLICATE') duplicate++;
          else errored++;
        });
        runtime.learningLastIngestAt = new Date().toISOString();
        respondJson(res, { status: 'ok', total: (ingestResults || []).length, accepted: accepted, rejected: rejected, duplicate: duplicate, errored: errored, results: ingestResults });
      } catch(e) { failJson(res, 500, 'learning ingest failed: ' + e.message); }
      return;
    }

    if (parsed.pathname === '/api/admin/learning/status' && req.method === 'GET') {
      if (!adminAuth(req)) { failJson(res, 403, 'forbidden'); return; }
      // Feature flag gate: learningLibraryEnabled must be true (configured in load-config)
      if (!runtime.config || !runtime.config.features || !runtime.config.features.learningLibraryEnabled) {
        failJson(res, 503, 'FEATURE_DISABLED: learningLibraryEnabled is false'); return;
      }
      // 返回 learning 摄取服务状态 + scheduler status (if available)
      var learningStatus = {
        configured: !!runtime.learningIngestionService,
        lastIngestAt: runtime.learningLastIngestAt || null,
      };
      if (runtime.learningScheduler) {
        learningStatus.scheduler = runtime.learningScheduler.getStatus();
      }
      respondJson(res, learningStatus);
      return;
    }

    if (parsed.pathname.indexOf('/api/admin/library/') === 0 && req.method === 'PATCH') {
      if (!adminAuth(req)) { failJson(res, 403, 'forbidden'); return; }
      if (!runtime.assetRepository) { failJson(res, 503, 'asset repository unavailable'); return; }
      var metaAssetId = decodeURIComponent(parsed.pathname.slice('/api/admin/library/'.length));
      if (!metaAssetId) { failJson(res, 400, 'assetId required'); return; }
      try {
        var metaBody = JSON.parse(await readBody(req) || '{}');
        // Only metadata is patchable; GUARDED_FIELDS enforced by repository
        var metaPatch = { metadata: metaBody.metadata || metaBody };
        await runtime.assetRepository.update(metaAssetId, metaPatch);
        var metaUpdated = await runtime.assetRepository.get(metaAssetId);
        respondJson(res, { status: 'ok', asset: metaUpdated });
      } catch(e) { failJson(res, 500, 'metadata update failed: ' + e.message); }
      return;
    }

    if (parsed.pathname.indexOf('/api/admin/library/') === 0 && req.method === 'DELETE') {
      if (!adminAuth(req)) { failJson(res, 403, 'forbidden'); return; }
      // V3 atomic delete: feature flag must be true; no legacy markTombstoned
      // fallback. Without deletePipelineEnabled the route returns 503
      // FEATURE_DISABLED so callers cannot bypass the reference check / audit.
      if (!runtime.config || !runtime.config.features || !runtime.config.features.deletePipelineEnabled) {
        failJson(res, 503, 'FEATURE_DISABLED: deletePipelineEnabled is false'); return;
      }
      if (!runtime.assetRepository) { failJson(res, 503, 'asset repository unavailable'); return; }
      if (!runtime.assetDeleteService) { failJson(res, 503, 'asset delete service unavailable'); return; }
      var delAssetId = decodeURIComponent(parsed.pathname.slice('/api/admin/library/'.length));
      if (!delAssetId) { failJson(res, 400, 'assetId required'); return; }
      // reason enum (UNSAFE / SUSPICIOUS / POLICY_BLOCKED) — read from body or
      // query (?reason=...). Body takes precedence. Reject invalid reasons
      // with 400 instead of silently defaulting (asset-delete-service validates
      // the enum too, but failing earlier gives a clearer error).
      var delReasonRaw = null;
      try { var drb = JSON.parse(await readBody(req) || '{}'); if (drb && drb.reason) delReasonRaw = drb.reason; } catch(e) {}
      if (!delReasonRaw) delReasonRaw = parsed.searchParams.get('reason') || null;
      var V3_DELETE_REASONS = ['UNSAFE', 'SUSPICIOUS', 'POLICY_BLOCKED'];
      if (!delReasonRaw || V3_DELETE_REASONS.indexOf(String(delReasonRaw).toUpperCase()) < 0) {
        failJson(res, 400, 'reason required (must be one of UNSAFE, SUSPICIOUS, POLICY_BLOCKED)'); return;
      }
      var delReason = String(delReasonRaw).toUpperCase();
      try {
        // Full atomic chain: markBlocked → tombstone → cleanup → audit → markTombstoned
        // (fail-closed: every step rejects on failure; no swallow).
        await runtime.assetDeleteService.deleteAsset(delAssetId, delReason);
        // Invalidate cached frames referencing this asset (best-effort)
        if (runtime.cachedFrames && runtime.cachedFrames.forEach) {
          var toInvalidate = [];
          runtime.cachedFrames.forEach(function(val, key) {
            if (val && val.payload && val.payload.assetId === delAssetId) toInvalidate.push(key);
          });
          toInvalidate.forEach(function(k) { runtime.cachedFrames.delete(k); });
        }
        respondJson(res, { status: 'ok', assetId: delAssetId, reason: delReason, pipeline: 'atomic_delete_chain' });
      } catch(e) {
        var delMsg = e && e.message ? e.message : String(e);
        if (/INVALID_REASON/.test(delMsg)) { failJson(res, 400, delMsg); }
        else if (/Asset not found/.test(delMsg)) { failJson(res, 404, delMsg); }
        else if (/Cannot delete asset|active references/.test(delMsg)) { failJson(res, 409, delMsg); }
        else { failJson(res, 500, 'asset delete failed: ' + delMsg); }
      }
      return;
    }

    if (parsed.pathname === '/health/live') {
      respondJson(res, { status: 'ok', pid: process.pid, uptimeSeconds: Math.floor((Date.now() - runtime.serverStartTime) / 1000) });
      return;
    }

    if (parsed.pathname === '/health/ready') {
      var ready = { status: 'ok' };
      var issues = [];
      if (!runtime.snapshotStore) issues.push('SNAPSHOT_STORE_UNAVAILABLE');
      try {
        var r = fs.existsSync(path.join(DATA_DIR, 'config.json')) || fs.existsSync(path.join(ROOT_DIR, 'config.json'));
        if (!r) issues.push('CONFIG_NOT_FOUND');
      } catch(e) { issues.push('CONFIG_CHECK_FAILED'); }
      if (issues.length > 0) {
        ready.status = 'degraded';
        ready.issues = issues;
      }
      respondJson(res, ready);
      return;
    }

    if (parsed.pathname === '/api/health.json') {
      var uptime = Math.floor((Date.now() - runtime.serverStartTime) / 1000);
      var hSnap = runtime.cachedFrames.size > 0 ? Array.from(runtime.cachedFrames.values())[0].snapshot : null;
      var hNewsCount = 0;
      try {
        var hLgPath = path.join(DATA_DIR, 'last_good_news.json');
        if (fs.existsSync(hLgPath)) { var hLg = JSON.parse(fs.readFileSync(hLgPath, 'utf8')); if (hLg && hLg.items) hNewsCount = hLg.items.length; }
      } catch(e) {}
      var hPhotoCount = 0;
      try {
        var hIdxPath = path.join(DATA_DIR, 'image_index.json');
        if (fs.existsSync(hIdxPath)) { hPhotoCount = JSON.parse(fs.readFileSync(hIdxPath, 'utf8')).length; }
      } catch(e) {}
      respondJson(res, {
        status: 'ok', uptimeSeconds: uptime, timezone: TIMEZONE,
        currentMode: hSnap ? hSnap.mode : null,
        currentSlot: hSnap ? hSnap.slotKey : null,
        frameId: hSnap ? hSnap.frameId : null,
        frameCacheEntries: runtime.cachedFrames.size,
        frameRenderCount: runtime.renderCount,
        newsItemCount: hNewsCount,
        photoCount: hPhotoCount,
        mqttEnabled: !!APP_CONFIG.mqtt && APP_CONFIG.mqtt.enabled,
        translationProvider: (APP_CONFIG.translation && APP_CONFIG.translation.provider) || 'none',
        stateRequestCount: runtime.stateRequestCount || 0,
        frameRequestCount: runtime.frameRequestCount || 0,
        newsRefreshCount: runtime.newsRefreshCount || 0,
        newsRefreshFailureCount: runtime.newsRefreshFailureCount || 0,
        recentError: runtime.recentError || null,
        lastNewsRefreshAt: runtime.lastNewsRefreshAt || null,
        buildSha: BUILD_GIT_SHA,
        manualOverride: runtime.manualOverride || null,
        overrideExpiresAt: runtime.overrideExpiresAt || null,
        lastPublishedAt: runtime.lastPublishedAt || null
      });
      return;
    }

    if (parsed.pathname === '/api/admin/state') {
      if (!adminAuth(req)) { respondJson(res, { error: 'forbidden' }); return; }
      try {
        if (typeof runtime.adminStateService.getAdminState === 'function') {
          const st = await runtime.adminStateService.getAdminState();
          respondJson(res, st);
        } else {
          respondJson(res, { status: 'unavailable', reason: 'AdminStateService not initialized' });
        }
      } catch(e) { respondJson(res, { status: 'error', error: e.message }); }
      return;
    }

res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  } catch (error) {
    const body = Buffer.from(JSON.stringify({ error: error.message }, null, 2));
    r1Logger.error('request failed ' + parsed.pathname + ': ' + (error.stack || error.message));
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
  main().catch(function(error) {
    r1Logger.error('top-level crash: ' + (error.stack || error.message));
    process.exit(1);
  });
}

module.exports = {
  handleRequest: handleRequest,
  main: main,
  runtime: runtime,
  PALETTE: epaperPalette.PALETTE,
  extractTag,
  extractItems,
  parseFeedXml,
  parseJsonFeed,
  buildNewsSnapshot,
  getContentForNow,
  loadAppConfig,
  formatDateTime,
  formatDateTimeWithSeconds,
  formatLocalTimeLabel,
  formatDateParts,
  getWallTime,
  computeNextSwitchAt,
  selectPhotoSnapshot,
  selectStudyPhoto,
  isStudySelectable,
  isImageApproved,
  isImageReady,
  imageToFrameBuffer,
  sortSequenceFrames,
  isTextSemanticallyComplete,
  normalizeEntitiesAndAcronyms,
  rewriteNewsTitle,
  rewriteNewsSummary,
  evaluateNewsItemQuality,
  PROTECTED_ENTITIES,
  renderNewsSvg,
  wrapText,
  layoutNewsCard,
  NEWS_LAYOUT,
};



