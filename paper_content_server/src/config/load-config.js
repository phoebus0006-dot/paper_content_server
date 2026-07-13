// load-config.js — Centralized configuration loading
// All process.env reads go through this module.

var path = require('path');
var fs = require('fs');

function loadDotEnvFile(filePath) {
  try {
    var text = fs.readFileSync(filePath, 'utf8'), result = {};
    text.split('\n').forEach(function(line) {
      var trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      var eq = trimmed.indexOf('=');
      if (eq < 0) return;
      result[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    });
    return result;
  } catch(e) { return {}; }
}

function readJSONConfig(configPath) {
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch(e) { return {}; }
}

function resolvePath(configured, defaultPath, cwd) {
  var p = configured || defaultPath;
  if (!path.isAbsolute(p)) p = path.join(cwd, p);
  return p;
}

// parseBoolEnv — strict boolean env parser.
// Accepts 'true' / '1' / 'yes' (case-insensitive) as true; everything else is false.
// Used for feature flags which must fail-closed (default false) when unset or malformed.
function parseBoolEnv(raw, fallback) {
  if (raw === undefined || raw === null || raw === '') return !!fallback;
  var v = String(raw).trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

function loadConfig(opts) {
  opts = opts || {};
  var cwd = opts.cwd || process.cwd();

  // Build effective env
  var env;

  if (!opts.env) {
    // Bootstrap path: start from process.env, load .env into process.env
    env = {};
    Object.keys(process.env).forEach(function(k) { env[k] = process.env[k]; });
    var dotenvPath = env.CONFIG_DOTENV_PATH || path.join(cwd, '.env');
    var dotenv = loadDotEnvFile(dotenvPath);
    Object.keys(dotenv).forEach(function(k) {
      if (!process.env[k]) process.env[k] = dotenv[k];
      if (!env[k]) env[k] = dotenv[k];
    });
  } else {
    // Test/custom path: use ONLY opts.env, do NOT load .env, do NOT touch process.env
    env = {};
    Object.keys(opts.env).forEach(function(k) { env[k] = opts.env[k]; });
  }

  // config.json
  var configPath = env.CONFIG_FILE || path.join(cwd, 'config.json');
  var fileConfig = readJSONConfig(configPath);

  var config = {};

  // Resolved config file path — exposed for diagnostics (debug/config endpoint).
  config.configFile = configPath;

  // Server
  config.server = {
    port: Number(env.PORT || fileConfig.port || 8787),
    timezone: String(env.TZ || fileConfig.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'),
    enableDebugRoutes: String(env.ENABLE_DEBUG_ROUTES || '').toLowerCase() === 'true',
    testInstanceId: env.TEST_INSTANCE_ID || '',
  };

  // Panel
  config.panel = {
    index: Number(env.PANEL_INDEX || fileConfig.panelIndex || 49),
    width: 800,
    height: 480,
  };

  // Paths
  var dataDir = resolvePath(env.DATA_DIR || fileConfig.dataDir, 'data', cwd);
  config.paths = {
    dataDir: dataDir,
    feedsFile: resolvePath(env.FEEDS_FILE || fileConfig.feedsFile, 'feeds.json', cwd),
    newsCacheFile: resolvePath(env.NEWS_CACHE_FILE || fileConfig.newsCacheFile, path.join(dataDir, 'news_cache.json'), cwd),
    newsRotationFile: resolvePath(env.NEWS_ROTATION_FILE || fileConfig.newsRotationFile, path.join(dataDir, 'news_rotation_state.json'), cwd),
    libraryStateFile: resolvePath(env.LIBRARY_STATE_FILE || fileConfig.libraryStateFile, path.join(dataDir, 'library_state.json'), cwd),
    imageIndexFile: resolvePath(env.IMAGE_INDEX_FILE || fileConfig.imageIndexFile, path.join(dataDir, 'image_index.json'), cwd),
    lastGoodNewsFile: resolvePath(env.LAST_GOOD_NEWS_FILE || fileConfig.lastGoodNewsFile, path.join(dataDir, 'last_good_news.json'), cwd),
    fallbackStudyDir: resolvePath(env.FALLBACK_STUDY_DIR || fileConfig.fallbackStudyDir, path.join(dataDir, 'fallback_study'), cwd),
    rawImagesDir: resolvePath(env.RAW_IMAGES_DIR || fileConfig.rawImagesDir, path.join(dataDir, 'raw_images'), cwd),
    processedImagesDir: resolvePath(env.PROCESSED_IMAGES_DIR || fileConfig.processedImagesDir, path.join(dataDir, 'processed_images'), cwd),
    importImagesDir: resolvePath(env.IMPORT_IMAGES_DIR || fileConfig.importImagesDir, path.join(dataDir, 'import_images'), cwd),
    imagesDir: resolvePath(env.IMAGE_ROOT || fileConfig.imageRoot || fileConfig.imagesDir, 'images', cwd),
  };

  // Translation
  var provider = String(env.TRANSLATION_PROVIDER || fileConfig.translationProvider || 'none');
  config.translation = {
    provider: provider,
    openaiApiKey: env.OPENAI_API_KEY || '',
    openaiModel: env.OPENAI_MODEL || 'gpt-4o-mini',
    openaiBaseUrl: String(env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    deeplApiKey: env.DEEPL_API_KEY || '',
    deeplApiUrl: env.DEEPL_API_URL || 'https://api-free.deepl.com/v2/translate',
    geminiApiKey: env.GEMINI_API_KEY || '',
    geminiModel: env.GEMINI_MODEL || 'gemini-2.5-flash',
    geminiApiBase: String(env.GEMINI_API_BASE || '').replace(/\/+$/, ''),
  };

  // Photo
  config.photo = {
    quantMode: String(env.PHOTO_QUANT_MODE || fileConfig.photoQuantMode || 'clean').toLowerCase(),
    // Raw DITHERING env value preserved (string). Callers interpret it via
    // ['1','true','yes','on'] membership. Empty when unset.
    dithering: env.DITHERING || '',
  };

  // Render
  config.render = {
    fontStack: '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif',
  };

  // Admin — single source of truth for admin access configuration.
  // server.js and production code read only APP_CONFIG.admin (no direct env reads).
  var adminPolicy = require('../admin/admin-network-policy');
  var adminAccessMode = String(env.ADMIN_ACCESS_MODE || 'token').toLowerCase();
  var adminAllowedCidrsRaw = env.ADMIN_ALLOWED_CIDRS || '';
  var trustProxy = String(env.TRUST_PROXY || 'false').toLowerCase() === 'true';
  var trustedProxyCidrsRaw = env.TRUSTED_PROXY_CIDRS || '';
  var allowHeaderlessWrite = String(env.ADMIN_ALLOW_HEADERLESS_WRITE || env.ALLOW_HEADERLESS_WRITE || 'false').toLowerCase() === 'true';

  var adminAllowedCidrs = adminPolicy.parseCIDRList(adminAllowedCidrsRaw);
  var adminTrustedProxyCidrs = trustedProxyCidrsRaw ? adminPolicy.parseCIDRList(trustedProxyCidrsRaw) : { parsed: [], valid: true, error: null, invalidEntries: [] };

  config.admin = {
    accessMode: adminAccessMode,
    token: env.ADMIN_TOKEN || '',
    allowedCidrsRaw: adminAllowedCidrsRaw,
    allowedCidrs: adminAllowedCidrs,
    trustProxy: trustProxy,
    trustedProxyCidrsRaw: trustedProxyCidrsRaw,
    trustedProxyCidrs: adminTrustedProxyCidrs,
    allowHeaderlessWrite: allowHeaderlessWrite,
  };

  // Debug
  config.debug = {
    enabled: config.server.enableDebugRoutes,
    enableDebugRoutes: config.server.enableDebugRoutes,
  };

  // Lifecycle timeouts (ms). Unified across bootstrap and server.js.
  config.lifecycle = {
    shutdownTimeoutMs: Number(env.BOOTSTRAP_SHUTDOWN_TIMEOUT_MS) || 10000,
    forceExitTimeoutMs: Number(env.PROCESS_FORCE_EXIT_TIMEOUT_MS) || 12000,
  };

  // Process control — force-exit guard for stuck shutdowns. Mirrors
  // lifecycle.forceExitTimeoutMs but lives under `process` so server.js can
  // read it without touching process.env directly.
  config.process = {
    forceExitTimeoutMs: Number(env.PROCESS_FORCE_EXIT_TIMEOUT_MS) || 12000,
  };

  // Feature flags — all default to false (fail-closed). This is the single source
  // of truth for whether a feature is CONFIGURED. Runtime readiness additionally
  // requires the dependency instance to exist (see src/admin/feature-flag-view.js).
  config.features = {
    customLibraryEnabled: parseBoolEnv(env.CUSTOM_LIBRARY_ENABLED, false),
    learningLibraryEnabled: parseBoolEnv(env.LEARNING_LIBRARY_ENABLED, false),
    advancedRenderEnabled: parseBoolEnv(env.R9_ADVANCED_RENDER_ENABLED, false),
    renderShadowEnabled: parseBoolEnv(env.R9_RENDER_SHADOW_ENABLED, false),
    deletePipelineEnabled: parseBoolEnv(env.DELETE_PIPELINE_ENABLED, false),
    mqttEnabled: parseBoolEnv(env.MQTT_ENABLED, false),
  };

  // Safety classifier 配置 — drives safetyClassifierPort / safetyGate.
  // modelPath=null → classifier port is created but not configured (fail-closed).
  // timeout bounds inference calls (forward-compatible: consumed when a real
  // runtime is wired in; the current port accepts but does not enforce it).
  config.safety = {
    modelPath: env.NSFW_MODEL_PATH || null,
    modelType: env.NSFW_MODEL_TYPE || 'tensorflow',
    threshold: parseFloat(env.NSFW_THRESHOLD || '0.5'),
    timeout: parseInt(env.NSFW_MODEL_TIMEOUT || '5000', 10),
    auditFile: env.NSFW_AUDIT_FILE || path.join(dataDir, 'safety-audit.jsonl'),
  };

  // Learning 配置 — Wikimedia source adapter + ingestion policy.
  config.learning = {
    sourceEnabled: parseBoolEnv(env.LEARNING_SOURCE_ENABLED, false),
    sources: ['wikimedia'],
    topics: (env.LEARNING_TOPICS || '').split(',').filter(Boolean),
    relevanceThreshold: parseInt(env.LEARNING_RELEVANCE_THRESHOLD || '1', 10),
    qualityThreshold: parseInt(env.LEARNING_QUALITY_THRESHOLD || '2', 10),
    intervalMs: parseInt(env.LEARNING_INTERVAL_MS || '3600000', 10),
    maxCandidates: parseInt(env.LEARNING_MAX_CANDIDATES || '50', 10),
    maxDownloadBytes: parseInt(env.LEARNING_MAX_DOWNLOAD_BYTES || (20 * 1024 * 1024).toString(), 10),
    requestTimeoutMs: parseInt(env.LEARNING_REQUEST_TIMEOUT_MS || '10000', 10),
    maxPages: parseInt(env.WIKIMEDIA_MAX_PAGES || '10', 10),
    apiUrl: env.WIKIMEDIA_API_URL || 'https://commons.wikimedia.org/w/api.php',
  };

  // MQTT — single source of truth. server.js reads APP_CONFIG.mqtt instead of
  // calling loadMqttConfig(process.env). loadMqttConfig stays available for
  // backward-compatible tests; here we inline the same mapping.
  var mqttEnabled = parseBoolEnv(env.MQTT_ENABLED, false);
  config.mqtt = {
    enabled: mqttEnabled,
    broker: env.MQTT_BROKER || 'mqtt://localhost:1883',
    deviceId: env.MQTT_DEVICE_ID || env.DEVICE_ID || 'epaper-01',
    username: env.MQTT_USERNAME || '',
    password: env.MQTT_PASSWORD || '',
    tls: String(env.MQTT_TLS || '').toLowerCase() === 'true',
    caPath: env.MQTT_CA_PATH || '',
    topicPrefix: env.MQTT_TOPIC_PREFIX || 'epaper',
    willTopic: env.MQTT_WILL_TOPIC || '',
    willMessage: env.MQTT_WILL_MESSAGE || 'offline',
    reconnectDelayMs: Number(env.MQTT_RECONNECT_DELAY_MS) || 5000,
    maxReconnectAttempts: Number(env.MQTT_MAX_RECONNECT_ATTEMPTS) || 0,
  };

  // Upload 配置 — used by custom-library upload route guards.
  config.upload = {
    maxUploadBytes: parseInt(env.MAX_UPLOAD_BYTES || (50 * 1024 * 1024).toString(), 10),
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  };

  // Validate
  var errors = [];
  if (config.translation.provider === 'openai' && !config.translation.openaiApiKey) {
    errors.push('TRANSLATION_PROVIDER=openai but OPENAI_API_KEY is not set');
  }
  if (!config.server.port || config.server.port < 1) {
    errors.push('PORT must be a positive number');
  }
  // Admin validation
  if (adminAccessMode !== 'lan' && adminAccessMode !== 'token') {
    errors.push('ADMIN_ACCESS_MODE must be lan or token (got "' + adminAccessMode + '")');
  }
  if (adminAccessMode === 'lan') {
    if (!adminAllowedCidrs.valid) {
      errors.push('ADMIN_ACCESS_MODE=lan requires ADMIN_ALLOWED_CIDRS to be all valid (invalid: ' + adminAllowedCidrs.invalidEntries.join(', ') + ')');
    }
  }
  if (adminAccessMode === 'token' && !config.admin.token) {
    errors.push('ADMIN_ACCESS_MODE=token requires ADMIN_TOKEN to be set');
  }
  if (trustProxy) {
    if (!trustedProxyCidrsRaw) {
      errors.push('TRUST_PROXY=true requires TRUSTED_PROXY_CIDRS to be set');
    } else if (!adminTrustedProxyCidrs.valid) {
      errors.push('TRUST_PROXY=true requires TRUSTED_PROXY_CIDRS to be all valid (invalid: ' + adminTrustedProxyCidrs.invalidEntries.join(', ') + ')');
    }
  }
  config.errors = errors;
  config.isValid = errors.length === 0;

  return config;
}

module.exports = { loadConfig: loadConfig };
