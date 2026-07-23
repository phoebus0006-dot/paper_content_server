// build-request-context.js — Single authoritative request context builder
// Derives ALL production configuration strictly from loaded boot.config (R3-06, R4-08).

function buildRequestContext(boot, options) {
  options = options || {};
  var config = boot.config || {};
  var services = boot.services || {};
  var deps = boot.deps || {};
  var paths = config.paths || {};

  var adminConfig = config.admin || {};
  var serverConfig = config.server || {};
  var newsConfig = config.news || {};

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

    // Production settings derived directly from loaded config (R3-06, R4-08)
    TIMEZONE: options.timezone !== undefined ? options.timezone : (serverConfig.timezone || 'UTC'),
    NEWS_REFRESH_MINUTES: options.newsRefreshMinutes !== undefined ? options.newsRefreshMinutes : (newsConfig.refreshMinutes || 15),

    adminAccessMode: options.adminAccessMode !== undefined ? options.adminAccessMode : (adminConfig.accessMode || 'token'),
    adminToken: options.adminToken !== undefined ? options.adminToken : (adminConfig.token || null),
    adminAllowedCidrs: options.adminAllowedCidrs !== undefined ? options.adminAllowedCidrs : (adminConfig.allowedCidrs || { valid: true, parsed: [{ network: 2130706432, mask: 4294967040 }] }),
    adminTrustProxy: options.adminTrustProxy !== undefined ? options.adminTrustProxy : (adminConfig.trustProxy || false),
    adminTrustedProxyCidrs: options.adminTrustedProxyCidrs !== undefined ? options.adminTrustedProxyCidrs : ((adminConfig.trustedProxyCidrs && adminConfig.trustedProxyCidrs.parsed) || []),
    adminAllowHeaderlessWrite: options.adminAllowHeaderlessWrite !== undefined ? options.adminAllowHeaderlessWrite : (adminConfig.allowHeaderlessWrite || false),
  };

  return context;
}

module.exports = { buildRequestContext: buildRequestContext };
