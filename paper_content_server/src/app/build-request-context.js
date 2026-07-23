// build-request-context.js — Single authoritative request context builder
// Derives ALL production configuration strictly from loaded boot.config (R3-06, R4-08, R5-04, R6-05).

function buildRequestContext(boot, options) {
  options = options || {};
  var config = boot.config || {};
  var services = boot.services || {};
  var deps = boot.deps || {};
  var paths = config.paths || {};

  var adminConfig = config.admin;
  var serverConfig = config.server;
  var newsConfig = config.news;

  if (!config.isValid || !adminConfig || !serverConfig || !newsConfig || !paths) {
    var err = new Error('CONFIG_INCOMPLETE');
    err.code = 'CONFIG_INCOMPLETE';
    throw err;
  }

  var timezone = options.timezone !== undefined ? options.timezone : serverConfig.timezone;
  var newsRefreshMinutes = options.newsRefreshMinutes !== undefined ? options.newsRefreshMinutes : newsConfig.refreshMinutes;

  var adminAccessMode = options.adminAccessMode !== undefined ? options.adminAccessMode : adminConfig.accessMode;
  var adminToken = options.adminToken !== undefined ? options.adminToken : adminConfig.token;
  var adminAllowedCidrs = options.adminAllowedCidrs !== undefined ? options.adminAllowedCidrs : adminConfig.allowedCidrs;
  var adminTrustProxy = options.adminTrustProxy !== undefined ? options.adminTrustProxy : adminConfig.trustProxy;
  var adminTrustedProxyCidrs = options.adminTrustedProxyCidrs !== undefined ? options.adminTrustedProxyCidrs : (adminConfig.trustedProxyCidrs && adminConfig.trustedProxyCidrs.parsed);
  var adminAllowHeaderlessWrite = options.adminAllowHeaderlessWrite !== undefined ? options.adminAllowHeaderlessWrite : adminConfig.allowHeaderlessWrite;

  if (timezone === undefined || newsRefreshMinutes === undefined || adminAccessMode === undefined || adminToken === undefined || adminAllowedCidrs === undefined || adminTrustProxy === undefined || adminAllowHeaderlessWrite === undefined) {
    var errConfig = new Error('CONFIG_INCOMPLETE');
    errConfig.code = 'CONFIG_INCOMPLETE';
    throw errConfig;
  }

  var context = {
    snapshotStore: deps.snapshotStore || null,
    snapshotCache: deps.snapshotCache || null,
    pinStore: deps.pinStore || null,
    publicationLock: deps.publicationLock || null,
    operatingModeService: deps.operatingModeService || null,
    publicationHistory: deps.publicationHistory || null,
    notificationPort: deps.notificationPort || null,
    publicationService: services.publicationService || null,
    adminQueryService: services.adminQueryService || null,
    adminStateService: services.adminStateService || null,
    newsTitleService: services.newsTitleService || null,
    safeImagePath: services.safeImagePath || null,
    imageRasterizer: services.imageRasterizer || null,
    imageRecipeService: services.imageRecipeService || null,
    deviceRegistryService: services.deviceRegistryService || null,
    featureFlagView: services.featureFlagView || null,
    assetRepository: services.assetRepository || null,
    customLibraryService: services.customLibraryService || null,
    safetyGate: services.safetyGate || null,
    learningIngestionService: services.learningIngestionService || null,
    learningScheduler: services.learningScheduler || null,
    assetSelectionService: services.assetSelectionService || null,
    assetDeleteService: services.assetDeleteService || null,
    overridePersistence: services.overridePersistence || null,
    safetyClassifierPort: services.safetyClassifierPort || null,
    boot: boot,
    config: config,
    mqttClient: deps.mqttClient || null,
    renderCount: 0,
    serverStartTime: Date.now(),
    cachedFrames: new Map(),
    cachedSnapshots: new Map(),
    feeds: null,
    newsCache: { version: 1, updatedAt: null, translations: {} },
    newsRotation: { version: 1, updatedAt: null, shown: [] },
    lastGoodNews: null,
    fallbackStudyEntries: null,
    fallbackStudyReady: false,
    libraryState: { themeCursor: 0, currentTheme: null, currentImageIndex: 0, remainingThemeSlots: 1, lastSlotKey: null, lastSwitchDate: null, patternIndex: 0, currentKind: null },
    imageIndex: [],
    imageIndexLoadedAt: 0,
    refreshPromise: null,
    lastNewsRefreshAt: 0,
    nowProvider: null,
    pinNowProvider: null,

    // Canonical config-derived paths (R2-07): MUST come from boot.config.paths
    DATA_DIR: paths.dataDir,
    IMAGE_INDEX_FILE: paths.imageIndexFile,
    LIBRARY_STATE_FILE: paths.libraryStateFile,
    NEWS_CACHE_FILE: paths.newsCacheFile,
    NEWS_ROTATION_FILE: paths.newsRotationFile,
    FEEDS_FILE: paths.feedsFile,
    LAST_GOOD_NEWS_FILE: paths.lastGoodNewsFile,
    FALLBACK_STUDY_DIR: paths.fallbackStudyDir,

    // Production settings derived directly from loaded config (R3-06, R4-08, R5-04, R6-05)
    TIMEZONE: timezone,
    NEWS_REFRESH_MINUTES: newsRefreshMinutes,

    adminAccessMode: adminAccessMode,
    adminToken: adminToken,
    adminAllowedCidrs: adminAllowedCidrs,
    adminTrustProxy: adminTrustProxy,
    adminTrustedProxyCidrs: adminTrustedProxyCidrs,
    adminAllowHeaderlessWrite: adminAllowHeaderlessWrite,
  };

  return context;
}

module.exports = { buildRequestContext: buildRequestContext };
