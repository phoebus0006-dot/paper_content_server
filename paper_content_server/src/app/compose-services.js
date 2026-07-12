// resolveTranslationConfig — maps the provider-specific translation fields from
// load-config into the flat { provider, apiKey, model, baseUrl } shape expected
// by the news pipeline. load-config exposes per-provider fields
// (openaiApiKey/openaiModel/openaiBaseUrl, deeplApiKey/deeplApiUrl,
// geminiApiKey/geminiModel/geminiApiBase); the previous code read non-existent
// config.translation.apiKey/model/baseUrl, so every provider but 'none' ran
// with empty credentials.
function resolveTranslationConfig(translationConfig) {
  var t = translationConfig || {};
  var provider = t.provider || 'none';
  var apiKey = '', model = '', baseUrl = '';
  if (provider === 'openai') {
    apiKey = t.openaiApiKey || '';
    model = t.openaiModel || '';
    baseUrl = t.openaiBaseUrl || '';
  } else if (provider === 'deepl') {
    apiKey = t.deeplApiKey || '';
    baseUrl = t.deeplApiUrl || '';
  } else if (provider === 'gemini') {
    apiKey = t.geminiApiKey || '';
    model = t.geminiModel || '';
    baseUrl = t.geminiApiBase || '';
  }
  return { provider: provider, apiKey: apiKey, model: model, baseUrl: baseUrl };
}

function composeServices(deps) {
  var config = deps.config, clock = deps.clock, logger = deps.logger;
  var stores = deps.stores, httpClient = deps.httpClient;
  var snapshotStore = deps.snapshotStore, snapshotCache = deps.snapshotCache;
  var pinStore = deps.pinStore, publicationLock = deps.publicationLock;
  var operatingModeService = deps.operatingModeService;
  var publicationHistory = deps.publicationHistory;
  var notificationPort = deps.notificationPort;
  var mqttClient = deps.mqttClient;

  var path = require('path');
  var newsPipeline = null;
  var adminQueryService = null;
  var renderShadow = null;

  var PublicationService = require('../publication/publication-service').PublicationService;
  var pubService = PublicationService(
    snapshotStore, snapshotCache, pinStore, publicationLock,
    notificationPort, operatingModeService, publicationHistory, logger
  );

  try {
    var translationConfig = resolveTranslationConfig(config.translation);
    var configObj = {
      lastGoodFile: stores.lastGoodNews ? stores.lastGoodNews._filePath || path.join(config.paths.dataDir, 'last_good_news.json') : path.join(config.paths.dataDir, 'last_good_news.json'),
      provider: translationConfig.provider,
      apiKey: translationConfig.apiKey,
      model: translationConfig.model,
      baseUrl: translationConfig.baseUrl,
    };
    var { createNewsPipeline } = require('../news/news-pipeline');
    newsPipeline = createNewsPipeline(configObj, logger);
  } catch (e) {
    logger.warn('newsPipeline init: ' + e.message);
  }

  try {
    var { createAdminQueryService } = require('../admin/admin-query-service');
    var assetRepository = null;
    try {
      var AssetRepository = require('../assets/asset-repository').AssetRepository;
      assetRepository = AssetRepository(config.paths.dataDir, logger);
    } catch (e) {}
    // Expose assetRepository to server.js for Library API (GET/PATCH/DELETE)
    deps.assetRepository = assetRepository;
    var { getFeatureFlags } = require('../admin/feature-flag-view');
    var featureFlagView = {
      getFeatureFlags: function() {
        return getFeatureFlags({
          mqttClient: mqttClient,
          newsPipeline: newsPipeline,
          renderShadow: renderShadow,
          activeFrameIdProvider: function() {
            try {
              var active = snapshotStore.readActiveSync ? snapshotStore.readActiveSync() : null;
              return active && active.activeFrameId ? active.activeFrameId : null;
            } catch (e) { return null; }
          },
        });
      },
    };
    adminQueryService = createAdminQueryService(
      snapshotStore, publicationHistory, assetRepository, featureFlagView, logger
    );
  } catch (e) {
    logger.warn('adminQueryService init: ' + e.message);
  }

  try {
    var { createRenderShadow } = require('../render/render-shadow');
    renderShadow = createRenderShadow(
      function(content, profileId) { return Promise.resolve(null); },
      function(content, profileId) { return Promise.resolve(null); },
      logger
    );
  } catch (e) {}

  return {
    newsPipeline: newsPipeline,
    publicationService: pubService,
    adminQueryService: adminQueryService,
    featureFlagView: featureFlagView || null,
    assetRepository: assetRepository,
    renderShadow: renderShadow,
  };
}

module.exports = { composeServices: composeServices, resolveTranslationConfig: resolveTranslationConfig };
