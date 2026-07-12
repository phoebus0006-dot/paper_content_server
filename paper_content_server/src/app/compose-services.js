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
  var fs = require('fs');
  var newsPipeline = null;
  var adminQueryService = null;
  var renderShadow = null;
  var customLibraryService = null;
  var learningIngestionService = null;
  var safetyGate = null;

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

  // --- assetRepository: asset persistence (shared by library + admin) ---
  var assetRepository = null;
  try {
    var AssetRepository = require('../assets/asset-repository').AssetRepository;
    assetRepository = AssetRepository(config.paths.dataDir, logger);
  } catch (e) { logger.warn('assetRepository init: ' + e.message); }
  // Expose assetRepository to server.js for Library API (GET/PATCH/DELETE)
  deps.assetRepository = assetRepository;

  // --- safetyGate: NSFW safety gate for custom uploads ---
  try {
    var { createNsfwSafetyGate } = require('../safety/nsfw-safety-gate');
    safetyGate = createNsfwSafetyGate({ logger: logger });
  } catch (e) { logger.warn('safetyGate init: ' + e.message); }

  // --- customLibraryService: upload + decode + safety + dedup + persist ---
  try {
    if (assetRepository && safetyGate) {
      var { createCustomLibraryService } = require('../custom-library/custom-library-service');
      var { createFileStore } = require('../custom-library/custom-file-store');
      var { createValidator: createCustomValidator } = require('../custom-library/custom-validator');
      var { createDeduplicator: createCustomDeduplicator } = require('../custom-library/custom-deduplicator');
      var quarantineDir = path.join(config.paths.dataDir, 'custom_uploads', 'quarantine');
      var customAssetsDir = path.join(config.paths.dataDir, 'custom_uploads', 'assets');
      try { fs.mkdirSync(quarantineDir, { recursive: true }); } catch (e) {}
      try { fs.mkdirSync(customAssetsDir, { recursive: true }); } catch (e) {}
      var customFileStore = createFileStore(quarantineDir, customAssetsDir, logger);
      var customValidator = createCustomValidator();
      var customDeduplicator = createCustomDeduplicator(assetRepository);
      customLibraryService = createCustomLibraryService(
        customFileStore, customValidator, customDeduplicator, safetyGate, assetRepository, logger
      );
    }
  } catch (e) { logger.warn('customLibraryService init: ' + e.message); }

  // --- learningIngestionService: fetch + validate + dedup + persist ---
  try {
    if (assetRepository) {
      var { createIngestionService } = require('../learning/learning-ingestion-service');
      var { createPolicy } = require('../learning/learning-policy');
      var { createSourceRegistry } = require('../learning/learning-source-registry');
      var { createValidator: createLearningValidator } = require('../learning/learning-validator');
      var { createDeduplicator: createLearningDeduplicator } = require('../learning/learning-deduplicator');
      var learningPolicy = createPolicy({});
      var learningSourceRegistry = createSourceRegistry();
      var learningValidator = createLearningValidator();
      var learningDeduplicator = createLearningDeduplicator();
      learningIngestionService = createIngestionService(
        learningSourceRegistry, learningValidator, learningDeduplicator,
        learningPolicy, assetRepository, logger
      );
    }
  } catch (e) { logger.warn('learningIngestionService init: ' + e.message); }

  // --- renderShadow: shadow dual-run for R9 rendering comparison ---
  try {
    var { createRenderShadow } = require('../render/render-shadow');
    var { createAnalysisCardRenderer } = require('../render/analysis-card-renderer');
    var { createComparisonPairRenderer } = require('../render/comparison-pair-renderer');
    var { createSequence2x2Renderer } = require('../render/sequence-2x2-renderer');
    var analysisRenderer = createAnalysisCardRenderer();
    var comparisonRenderer = createComparisonPairRenderer();
    var sequenceRenderer = createSequence2x2Renderer();
    renderShadow = createRenderShadow(
      function(content, profileId) {
        // 按优先级顺序尝试渲染器
        if (analysisRenderer.canRender(content)) return analysisRenderer.render(content, profileId);
        if (comparisonRenderer.canRender(content)) return comparisonRenderer.render(content, profileId);
        if (sequenceRenderer.canRender(content)) return sequenceRenderer.render(content, profileId);
        return Promise.resolve(null);
      },
      function(content, profileId) {
        // 预览渲染
        if (analysisRenderer.canRender(content)) return analysisRenderer.render(content, profileId);
        return Promise.resolve(null);
      },
      logger
    );
  } catch (e) { logger.warn('renderShadow init: ' + e.message); }

  // --- adminQueryService + featureFlagView (references services above) ---
  var featureFlagView = null;
  try {
    var { createAdminQueryService } = require('../admin/admin-query-service');
    var { getFeatureFlags } = require('../admin/feature-flag-view');
    featureFlagView = {
      getFeatureFlags: function() {
        return getFeatureFlags({
          mqttClient: mqttClient,
          newsPipeline: newsPipeline,
          customLibraryService: customLibraryService,
          learningIngestionService: learningIngestionService,
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

  return {
    newsPipeline: newsPipeline,
    publicationService: pubService,
    adminQueryService: adminQueryService,
    featureFlagView: featureFlagView || null,
    assetRepository: assetRepository,
    renderShadow: renderShadow,
    customLibraryService: customLibraryService,
    safetyGate: safetyGate,
    learningIngestionService: learningIngestionService,
  };
}

module.exports = { composeServices: composeServices, resolveTranslationConfig: resolveTranslationConfig };
