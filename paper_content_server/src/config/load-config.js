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
  };

  // Render
  config.render = {
    fontStack: '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif',
  };

  // Admin
  config.admin = {
    token: env.ADMIN_TOKEN || '',
  };

  // Debug
  config.debug = {
    enabled: config.server.enableDebugRoutes,
  };

  // Validate
  var errors = [];
  if (config.translation.provider === 'openai' && !config.translation.openaiApiKey) {
    errors.push('TRANSLATION_PROVIDER=openai but OPENAI_API_KEY is not set');
  }
  if (!config.server.port || config.server.port < 1) {
    errors.push('PORT must be a positive number');
  }
  config.errors = errors;
  config.isValid = errors.length === 0;

  return config;
}

module.exports = { loadConfig: loadConfig };
