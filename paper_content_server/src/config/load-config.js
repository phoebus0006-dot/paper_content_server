// load-config.js — Centralized config loader
// All process.env reads must go through this module.

var path = require('path');

function loadDotEnvSync(filePath) {
  try {
    var fs = require('fs');
    var text = fs.readFileSync(filePath, 'utf8');
    text.split('\n').forEach(function(line) {
      var trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      var eq = trimmed.indexOf('=');
      if (eq < 0) return;
      var key = trimmed.slice(0, eq).trim();
      var value = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    });
  } catch(e) {}
}

function readJSONConfig(configPath) {
  try {
    return JSON.parse(require('fs').readFileSync(configPath, 'utf8'));
  } catch(e) { return {}; }
}

function resolvePath(configured, defaultPath) {
  var p = configured || defaultPath;
  if (!path.isAbsolute(p)) p = path.join(process.cwd(), p);
  return p;
}

function loadConfig(overrides) {
  overrides = overrides || {};
  var dotenvPath = overrides.dotenvPath || process.env.CONFIG_DOTENV_PATH || path.join(process.cwd(), '.env');
  loadDotEnvSync(dotenvPath);
  var configPath = overrides.configPath || process.env.CONFIG_FILE || path.join(process.cwd(), 'config.json');
  var fileConfig = readJSONConfig(configPath);
  var env = process.env;
  var config = {};

  config.server = {
    port: Number(overrides.port || env.PORT || fileConfig.port || 8787),
    timezone: String(overrides.timezone || env.TZ || fileConfig.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'),
    enableDebugRoutes: String(overrides.enableDebugRoutes || env.ENABLE_DEBUG_ROUTES || '').toLowerCase() === 'true',
    testInstanceId: env.TEST_INSTANCE_ID || '',
  };
  config.panel = { index: Number(overrides.panelIndex || env.PANEL_INDEX || fileConfig.panelIndex || 49) };
  var dataDir = resolvePath(overrides.dataDir || env.DATA_DIR || fileConfig.dataDir, 'data');
  config.paths = {
    dataDir: dataDir,
    feedsFile: resolvePath(overrides.feedsFile || env.FEEDS_FILE || fileConfig.feedsFile, 'feeds.json'),
    newsCacheFile: resolvePath(overrides.newsCacheFile || env.NEWS_CACHE_FILE || fileConfig.newsCacheFile, path.join(dataDir, 'news_cache.json')),
    newsRotationFile: resolvePath(overrides.newsRotationFile || env.NEWS_ROTATION_FILE || fileConfig.newsRotationFile, path.join(dataDir, 'news_rotation_state.json')),
    libraryStateFile: resolvePath(overrides.libraryStateFile || env.LIBRARY_STATE_FILE || fileConfig.libraryStateFile, path.join(dataDir, 'library_state.json')),
    imageIndexFile: resolvePath(overrides.imageIndexFile || env.IMAGE_INDEX_FILE || fileConfig.imageIndexFile, path.join(dataDir, 'image_index.json')),
    lastGoodNewsFile: resolvePath(overrides.lastGoodNewsFile || env.LAST_GOOD_NEWS_FILE || fileConfig.lastGoodNewsFile, path.join(dataDir, 'last_good_news.json')),
    fallbackStudyDir: resolvePath(overrides.fallbackStudyDir || env.FALLBACK_STUDY_DIR || fileConfig.fallbackStudyDir, path.join(dataDir, 'fallback_study')),
  };
  var provider = String(overrides.translationProvider || env.TRANSLATION_PROVIDER || fileConfig.translationProvider || 'none');
  config.translation = {
    provider: provider,
    openaiApiKey: env.OPENAI_API_KEY || '',
    openaiModel: env.OPENAI_MODEL || 'gpt-4o-mini',
    openaiBaseUrl: String(env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    deeplApiKey: env.DEEPL_API_KEY || '',
    geminiApiKey: env.GEMINI_API_KEY || '',
    geminiModel: env.GEMINI_MODEL || 'gemini-2.5-flash',
  };
  config.photo = { quantMode: String(overrides.photoQuantMode || env.PHOTO_QUANT_MODE || fileConfig.photoQuantMode || 'clean').toLowerCase() };
  config.render = { fontStack: '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif' };
  config.admin = { token: env.ADMIN_TOKEN || '' };
  config.debug = { enabled: config.server.enableDebugRoutes };

  var errors = [];
  if (config.translation.provider === 'openai' && !config.translation.openaiApiKey) {
    errors.push('TRANSLATION_PROVIDER=openai but OPENAI_API_KEY is not set');
  }
  config.errors = errors;
  config.isValid = errors.length === 0;
  return Object.freeze(config);
}

module.exports = { loadConfig };
