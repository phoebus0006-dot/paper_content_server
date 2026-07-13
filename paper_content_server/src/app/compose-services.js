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
  var learningScheduler = null;
  var safetyGate = null;
  var safetyClassifierPort = null;
  var assetSelectionService = null;
  var assetDeleteService = null;
  var features = (config && config.features) || {};

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
  // Store file = dataDir/assets.json (JsonStore requires a file path, not a dir).
  // Without this, reads/writes fail with EISDIR and upload/delete/selection
  // routes cannot persist or query assets.
  var assetRepository = null;
  try {
    var AssetRepository = require('../assets/asset-repository').AssetRepository;
    assetRepository = AssetRepository(path.join(config.paths.dataDir, 'assets.json'), logger);
  } catch (e) { logger.warn('assetRepository init: ' + e.message); }
  // Expose assetRepository to server.js for Library API (GET/PATCH/DELETE)
  deps.assetRepository = assetRepository;

  // --- safetyClassifierPort: real NSFW classifier port (fail-closed when no model) ---
  // Pass-through config.safety fields (modelPath/modelType/threshold/auditFile).
  // ready = configured = !!modelPath && fs.existsSync(modelPath); without a real
  // model the classifier is created but never ready, so customLibrary/learning
  // features stay fail-closed (BLOCKED) end-to-end.
  try {
    var { createSafetyClassifierPort } = require('../safety/safety-classifier-port');
    safetyClassifierPort = createSafetyClassifierPort({
      logger: logger,
      modelPath: (config.safety && config.safety.modelPath) || null,
      modelType: (config.safety && config.safety.modelType) || 'tensorflow',
      threshold: (config.safety && config.safety.threshold) != null ? config.safety.threshold : 0.5,
      auditFile: (config.safety && config.safety.auditFile) || null,
    });
  } catch (e) { logger.warn('safetyClassifierPort init: ' + e.message); }

  // --- safetyGate: NSFW safety gate — delegates to classifier port, fail-closed ---
  try {
    var { createNsfwSafetyGate } = require('../safety/nsfw-safety-gate');
    safetyGate = createNsfwSafetyGate({
      logger: logger,
      classifierPort: safetyClassifierPort,
      modelPath: (config.safety && config.safety.modelPath) || null,
      threshold: (config.safety && config.safety.threshold) != null ? config.safety.threshold : 0.5,
    });
  } catch (e) { logger.warn('safetyGate init: ' + e.message); }

  // --- customLibraryService: secure upload + decode + safety + dedup + persist ---
  // Gated by config.features.customLibraryEnabled — when false, no service is
  // created and the upload route returns 503 FEATURE_DISABLED.
  if (features.customLibraryEnabled && assetRepository && safetyGate) {
    try {
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
    } catch (e) { logger.warn('customLibraryService init: ' + e.message); }
  }

  // --- learningIngestionService + scheduler: Wikimedia adapter + downloader + policy ---
  // Gated by config.features.learningLibraryEnabled — when false, no service is
  // created and the ingest route returns 503 FEATURE_DISABLED.
  if (features.learningLibraryEnabled && assetRepository) {
    try {
      var { createIngestionService } = require('../learning/learning-ingestion-service');
      var { createPolicy } = require('../learning/learning-policy');
      var { createSourceRegistry } = require('../learning/learning-source-registry');
      var { createValidator: createLearningValidator } = require('../learning/learning-validator');
      var { createDeduplicator: createLearningDeduplicator } = require('../learning/learning-deduplicator');
      var { createLearningDownloader } = require('../learning/learning-downloader');
      var { createLearningScheduler } = require('../learning/learning-scheduler');
      var { createWikimediaSourceAdapter } = require('../learning/wikimedia-source-adapter');

      var learningSourceRegistry = createSourceRegistry();
      learningSourceRegistry.register(createWikimediaSourceAdapter(config.learning || {}));

      var learningPolicy = createPolicy(config.learning || {});
      var learningValidator = createLearningValidator();
      var learningDeduplicator = createLearningDeduplicator();

      var stagingDir = (config.paths && config.paths.stagingDir) || path.join(config.paths.dataDir, 'staging');
      var learningAssetsDir = path.join(config.paths.dataDir, 'learning_assets');
      try { fs.mkdirSync(stagingDir, { recursive: true }); } catch (e) {}
      try { fs.mkdirSync(learningAssetsDir, { recursive: true }); } catch (e) {}
      var learningDownloader = createLearningDownloader(stagingDir, logger);

      learningIngestionService = createIngestionService(
        learningSourceRegistry, learningValidator, learningDeduplicator,
        learningPolicy, assetRepository, logger,
        {
          downloader: learningDownloader, safetyGate: safetyGate,
          stagingDir: stagingDir, assetsDir: learningAssetsDir,
          enabled: config.features.learningLibraryEnabled,
          maxDownloadBytes: (config.learning && config.learning.maxDownloadBytes) || null,
        }
      );

      // classifierReady gate: scheduler will not start (and emit zero network
      // requests) until safetyClassifierPort.ready === true. With no real model
      // loaded, the scheduler stays IDLE + SAFETY_CLASSIFIER_NOT_READY.
      learningScheduler = createLearningScheduler(learningIngestionService, {
        enabled: config.features.learningLibraryEnabled,
        intervalMs: (config.learning && config.learning.intervalMs) || 3600000,
      }, logger, {
        classifierReady: function () { return !!(safetyClassifierPort && safetyClassifierPort.ready); },
      });
      learningScheduler.start();
    } catch (e) { logger.warn('learningIngestionService init: ' + e.message); }
  }

  // --- renderShadow: real EPF1 rasterizers for analysis/comparison/sequence ---
  // Gated by config.features.renderShadowEnabled — when false, no shadow is
  // created and the render route uses the legacy renderer only.
  if (features.renderShadowEnabled) {
    try {
      var { createRenderShadow } = require('../render/render-shadow');
      var { createAnalysisCardRenderer } = require('../render/analysis-card-renderer');
      var { createComparisonPairRenderer } = require('../render/comparison-pair-renderer');
      var { createSequence2x2Renderer } = require('../render/sequence-2x2-renderer');
      var analysisRenderer = createAnalysisCardRenderer();
      var comparisonRenderer = createComparisonPairRenderer();
      var sequenceRenderer = createSequence2x2Renderer();
      function renderWithLayouts(content, profileId) {
        if (analysisRenderer.canRender(content)) return analysisRenderer.render(content, profileId);
        if (comparisonRenderer.canRender(content)) return comparisonRenderer.render(content, profileId);
        if (sequenceRenderer.canRender(content)) return sequenceRenderer.render(content, profileId);
        return Promise.resolve(null);
      }
      renderShadow = createRenderShadow(renderWithLayouts, renderWithLayouts, logger, { disable: false });
    } catch (e) { logger.warn('renderShadow init: ' + e.message); }
  }

  // --- assetSelectionService: validates assets for ONE_SHOT / FOCUS_LOCK ---
  // No feature flag — this is a read-only validation service with no side effects.
  if (assetRepository) {
    try {
      var { createAssetSelectionService } = require('../admin/asset-selection-service');
      assetSelectionService = createAssetSelectionService(assetRepository, snapshotStore, logger);
    } catch (e) { logger.warn('assetSelectionService init: ' + e.message); }
  }

  // --- assetDeleteService: full delete chain (reference check → tombstone → cleanup → audit) ---
  // Gated by config.features.deletePipelineEnabled — when false, the DELETE route
  // falls back to the legacy markTombstoned-only path.
  if (features.deletePipelineEnabled && assetRepository) {
    try {
      var { createAssetDeleteService } = require('../assets/asset-delete-service');
      var { AssetReferenceIndex } = require('../assets/asset-reference-index');
      var { TombstoneStore } = require('../safety/tombstone-store');
      var { SafetyAuditLog } = require('../safety/safety-audit-log');
      var { ReferenceCleaner } = require('../safety/reference-cleaner');

      // referenceIndex adapter: AssetReferenceIndex.findReferences → getReferences(assetId) → refs[]
      var refIndex = AssetReferenceIndex(config.paths.dataDir, snapshotStore, publicationHistory, null);
      var referenceIndexAdapter = {
        getReferences: function (assetId) {
          return refIndex.findReferences(assetId).then(function (result) {
            return (result && result.references) || [];
          });
        },
      };

      // tombstoneStore adapter: TombstoneStore.write(record) → record(assetId, data)
      var tombstoneDir = path.join(config.paths.dataDir, 'tombstones');
      try { fs.mkdirSync(tombstoneDir, { recursive: true }); } catch (e) {}
      var tombstoneStoreRaw = TombstoneStore(tombstoneDir, logger);
      var tombstoneStoreAdapter = {
        record: function (assetId, data) {
          return tombstoneStoreRaw.write(Object.assign({ assetId: assetId }, data || {}));
        },
      };

      // safetyAuditLog adapter: SafetyAuditLog.append(entry) → record(entry)
      var auditLogFile = path.join(config.paths.dataDir, 'safety-audit.log');
      var auditLogRaw = SafetyAuditLog(auditLogFile, logger);
      var safetyAuditLogAdapter = { record: function (entry) { return auditLogRaw.append(entry); } };

      // referenceCleaner adapter: cleanCache + cleanLegacyIndexes → cleanForAsset(assetId)
      var referenceCleanerRaw = ReferenceCleaner(snapshotStore, snapshotCache, publicationHistory, config.paths.dataDir, logger);
      var referenceCleanerAdapter = {
        cleanForAsset: function (assetId) {
          try { referenceCleanerRaw.cleanCache(assetId); } catch (e) {}
          try { referenceCleanerRaw.cleanLegacyIndexes(assetId, null); } catch (e) {}
          return Promise.resolve();
        },
      };

      assetDeleteService = createAssetDeleteService(
        assetRepository, referenceIndexAdapter, tombstoneStoreAdapter,
        safetyAuditLogAdapter, referenceCleanerAdapter, logger
      );
    } catch (e) { logger.warn('assetDeleteService init: ' + e.message); }
  }

  // --- overridePersistence: persists ONE_SHOT / FOCUS_LOCK state across restarts ---
  // stateFile = dataDir/admin_override.json (replaces ad-hoc fs.writeFileSync in
  // server.js routes). validateOverrideAsync() verifies the asset is still
  // SAFE + SELECTABLE + file-present on restart before restoring the override.
  var overridePersistence = null;
  try {
    var { createOverridePersistence } = require('../admin/override-persistence');
    overridePersistence = createOverridePersistence(
      path.join(config.paths.dataDir, 'admin_override.json'),
      logger
    );
  } catch (e) { logger.warn('overridePersistence init: ' + e.message); }

  // --- adminQueryService + featureFlagView (references services above) ---
  var featureFlagView = null;
  try {
    var { createAdminQueryService } = require('../admin/admin-query-service');
    var { getFeatureFlags } = require('../admin/feature-flag-view');
    featureFlagView = {
      getFeatureFlags: function() {
        return getFeatureFlags({
          config: config,
          mqttClient: mqttClient,
          newsPipeline: newsPipeline,
          customLibraryService: customLibraryService,
          learningIngestionService: learningIngestionService,
          renderShadow: renderShadow,
          assetDeleteService: assetDeleteService,
          safetyClassifierPort: safetyClassifierPort,
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
    safetyGate: safetyGate,
    safetyClassifierPort: safetyClassifierPort,
    customLibraryService: customLibraryService,
    learningIngestionService: learningIngestionService,
    learningScheduler: learningScheduler,
    assetSelectionService: assetSelectionService,
    assetDeleteService: assetDeleteService,
    overridePersistence: overridePersistence,
  };
}

module.exports = { composeServices: composeServices, resolveTranslationConfig: resolveTranslationConfig };
