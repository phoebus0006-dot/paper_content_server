// build-request-context.js — Single authoritative request context builder
// Constructs the canonical request context for server.js (production) and app-factory.js (test)
// ensuring 100% service identity parity and config path consistency.

function buildRequestContext(boot, options) {
  options = options || {};
  var config = boot.config || {};
  var services = boot.services || {};
  var deps = boot.deps || {};
  var paths = config.paths || {};

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
    TIMEZONE: 'UTC',
    NEWS_REFRESH_MINUTES: 15,
    adminAccessMode: options.adminAccessMode || 'token',
    adminToken: options.adminToken || (config.admin && config.admin.token) || null,
    adminAllowedCidrs: options.adminAllowedCidrs || { valid: true, parsed: [{ network: 2130706432, mask: 4294967040 }] },
    adminTrustProxy: false,
    adminTrustedProxyCidrs: [],
    adminAllowHeaderlessWrite: false,
  };

  return context;
}

module.exports = { buildRequestContext: buildRequestContext };
