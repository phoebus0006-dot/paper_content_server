const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function createApplication(options) {
  options = options || {};
  var runId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  var qaDir = path.join(__dirname, '..', 'qa');
  var runtimeDir = path.join(qaDir, 'runtime', runId);
  var dataDir = path.join(runtimeDir, 'data');
  var snapDir = path.join(dataDir, 'snapshots');
  var pubDir = path.join(dataDir, 'publication');

  [dataDir, snapDir, pubDir].forEach(function(d) { fs.mkdirSync(d, { recursive: true }); });

  var adminToken = options.adminToken || 'test-e2e-token';

  fs.writeFileSync(path.join(dataDir, 'feeds.json'), '[]');
  fs.writeFileSync(path.join(dataDir, 'news_cache.json'), JSON.stringify({ version: 1, updatedAt: null, translations: {} }));
  fs.writeFileSync(path.join(dataDir, 'news_rotation_state.json'), JSON.stringify({ version: 1, updatedAt: null, shown: [] }));
  fs.writeFileSync(path.join(dataDir, 'library_state.json'), JSON.stringify({ themeCursor: 0, currentTheme: null, currentImageIndex: 0, remainingThemeSlots: 1, lastSlotKey: null, lastSwitchDate: null, patternIndex: 0, currentKind: null }));
  fs.writeFileSync(path.join(dataDir, 'image_index.json'), '[]');

  var serverMod = require('../server.js');
  var lg = options.logger || { info: function() {}, warn: function() {}, error: function() {} };

  var R3_SnapshotStore = require('../src/snapshot/snapshot-store').SnapshotStore;
  var R3_SnapshotCache = require('../src/snapshot/snapshot-cache').SnapshotCache;
  var R3_PinStore = require('../src/snapshot/pin-store').PinStore;
  var R3_PublicationLock = require('../src/publication/publication-lock').PublicationLock;
  var R3_PublicationHistory = require('../src/publication/publication-history').PublicationHistory;
  var R3_NoopNotificationPort = require('../src/publication/notification-port').NoopNotificationPort;
  var R3_OperatingModeService = require('../src/publication/operating-mode-service').OperatingModeService;
  var R3_PublicationService = require('../src/publication/publication-service').PublicationService;
  var R3_snapshotModel = require('../src/snapshot/snapshot-model');

  var { AdminStateService } = require('../src/admin/admin-state-service');
  var { NewsTitleService } = require('../src/news/news-title-service');
  var { SafeImagePath } = require('../src/files/safe-image-path');
  var { ImageRasterizer } = require('../src/images/image-rasterizer-v2');
  var { ImageRecipeService } = require('../src/images/image-recipe-service');
  var { DeviceRegistryService } = require('../src/devices/device-registry-service');
  var R1_JsonStore = require('../src/infra/json-store').JsonStore;

  var snapshotStore = R3_SnapshotStore(snapDir, pubDir, lg);
  var snapshotCache = R3_SnapshotCache();
  var pinStore = R3_PinStore({ nowMs: function() { return Date.now(); } });
  var publicationLock = R3_PublicationLock();
  var operatingModeService = R3_OperatingModeService();
  var publicationHistory = R3_PublicationHistory(path.join(pubDir, 'history.json'), lg);
  var notificationPort = R3_NoopNotificationPort();

  var overridePersistence = {
    _data: null,
    loadOverride: function() { return this._data; },
    saveOverride: function(d) { this._data = d; },
    clearOverride: function() { this._data = null; },
  };

  var frameCache = new Map();

  var pubService = R3_PublicationService(
    snapshotStore, snapshotCache, pinStore, publicationLock,
    notificationPort, operatingModeService, publicationHistory, lg,
    overridePersistence, frameCache
  );

  var adminStateService = new AdminStateService({
    operatingModeService: operatingModeService,
    snapshotStore: snapshotStore,
    publicationHistory: publicationHistory,
    mqttClient: null,
  });
  var newsTitleService = new NewsTitleService();
  var safeImagePath = new SafeImagePath({ rootDir: path.join(__dirname, '..') });
  var imageRasterizer = new ImageRasterizer();
  var imageRecipeService = new ImageRecipeService();
  var devicesStore = R1_JsonStore(path.join(dataDir, 'devices.json'), { schemaVersion: 1 });
  var loadConfig = require('./config/load-config').loadConfig;
  var appConfig = loadConfig({ env: options.env || process.env, cwd: path.join(__dirname, '..') });
  var deviceRegistryService = options.deviceRegistryService || new DeviceRegistryService({
    jsonStore: devicesStore,
    provisioningEnabled: options.deviceProvisioningEnabled !== undefined ? options.deviceProvisioningEnabled : appConfig.deviceProvisioning.enabled,
    provisioningToken: options.deviceProvisioningToken || appConfig.deviceProvisioning.token,
    clock: options.clock || undefined
  });

  // Build the isolated request context — NOT touching module.exports.runtime.
  // Each createApplication call has its own context with independent services.
  var requestContext = {
    snapshotStore: snapshotStore,
    snapshotCache: snapshotCache,
    pinStore: pinStore,
    publicationLock: publicationLock,
    operatingModeService: operatingModeService,
    publicationHistory: publicationHistory,
    notificationPort: notificationPort,
    publicationService: pubService,
    adminStateService: adminStateService,
    newsTitleService: newsTitleService,
    safeImagePath: safeImagePath,
    imageRasterizer: imageRasterizer,
    overridePersistence: overridePersistence,
    imageRecipeService: imageRecipeService,
    deviceRegistryService: deviceRegistryService,
    config: {
      debug: {
        enableDebugRoutes: (process.env.ENABLE_DEBUG_ROUTES === 'true') || (process.env.ENABLE_TEST_ENDPOINTS === 'true'),
      },
      features: {
        deletePipelineEnabled: false,
        customLibraryEnabled: false,
        learningLibraryEnabled: false,
        renderShadowEnabled: false,
      },
    },
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
    serverStartTime: Date.now(),
    renderCount: 0,
    nowProvider: null,
    pinNowProvider: null,
    customLibraryService: null,
    safetyGate: null,
    learningIngestionService: null,
    learningLastIngestAt: null,
    safetyClassifierPort: null,
    assetRepository: null,
    assetSelectionService: null,
    assetDeleteService: null,
    DATA_DIR: dataDir,
    IMAGE_INDEX_FILE: path.join(dataDir, 'image_index.json'),
    LIBRARY_STATE_FILE: path.join(dataDir, 'library_state.json'),
    NEWS_CACHE_FILE: path.join(dataDir, 'news_cache.json'),
    NEWS_ROTATION_FILE: path.join(dataDir, 'news_rotation_state.json'),
    FEEDS_FILE: path.join(dataDir, 'feeds.json'),
    LAST_GOOD_NEWS_FILE: path.join(dataDir, 'last_good_news.json'),
    FALLBACK_STUDY_DIR: path.join(dataDir, 'fallback_study'),
    TIMEZONE: 'UTC',
    NEWS_REFRESH_MINUTES: 15,
    adminAccessMode: 'token',
    adminToken: adminToken,
    adminAllowedCidrs: { valid: true, parsed: [{ network: 2130706432, mask: 4294967040 }] },
    adminTrustProxy: false,
    adminTrustedProxyCidrs: [],
    adminAllowHeaderlessWrite: false,
  };

  operatingModeService.setMode('AUTO');
  overridePersistence.clearOverride();

  var fixtureImgSrc = path.join(__dirname, '..', 'resources', 'fallback-study', 'fb-color.png');
  var fixtureImgDest = path.join(dataDir, 'fixture-test-image.png');
  var fixtureImgExists = false;
  try {
    var fbBuf = fs.readFileSync(fixtureImgSrc);
    fs.writeFileSync(fixtureImgDest, fbBuf);
    fixtureImgExists = true;
  } catch (e) {
    lg.warn('fixture image copy failed: ' + e.message);
  }

  var fixtureImageId = 'e2e-fixture-image-001';

  function setupFixtureImageIndex() {
    var idx = [];
    if (fixtureImgExists) {
      idx.push({
        id: fixtureImageId,
        title: 'E2E Test Fixture',
        source: 'test',
        sourceType: 'test',
        theme: 'test',
        kind: 'shot',
        poolType: 'study_frames',
        safetyStatus: 'SAFE',
        reviewStatus: 'APPROVED',
        lifecycleStatus: 'SELECTABLE',
        width: 800,
        height: 480,
        processedPngPath: fixtureImgDest,
        rawPath: fixtureImgDest,
        createdAt: new Date().toISOString(),
      });
    }
    fs.writeFileSync(path.join(dataDir, 'image_index.json'), JSON.stringify(idx, null, 2));
  }
  setupFixtureImageIndex();

  var entries = JSON.parse(fs.readFileSync(path.join(dataDir, 'image_index.json'), 'utf8'));
  requestContext.imageIndex = entries;
  requestContext.imageIndexLoadedAt = Date.now();

  var libState = JSON.parse(fs.readFileSync(path.join(dataDir, 'library_state.json'), 'utf8'));
  requestContext.libraryState = libState;

  var initialized = false;
  var initPromise = null;

  function ensureInitialized() {
    if (initialized) return Promise.resolve();
    if (initPromise) return initPromise;
    initPromise = snapshotStore.ensureDirs().then(function() {
      var frame = Buffer.alloc(192010, 0x11);
      frame.write('EPF1', 0, 4, 'ascii');
      frame.writeUInt16LE(800, 4);
      frame.writeUInt16LE(480, 6);
      frame.writeUInt8(49, 8);
      frame.writeUInt8(1, 9);
      var snap = R3_snapshotModel.createSnapshot(
        'photo:e2e-test',
        { frameId: 'photo:e2e-test', mode: 'photo', slotKey: 'e2e-test' },
        frame, 'photo',
        { publishReason: 'e2e_setup' }
      );
      return pubService.publish(snap);
    }).then(function() {
      initialized = true;
    });
    return initPromise;
  }

  var cleanedUp = false;

  function close() {
    if (cleanedUp) return Promise.resolve();
    cleanedUp = true;
    requestContext.cachedFrames = new Map();
    requestContext.cachedSnapshots = new Map();
    return new Promise(function(resolve) {
      try {
        var rmDir = function(dirPath) {
          if (fs.existsSync(dirPath)) {
            fs.readdirSync(dirPath).forEach(function(entry) {
              var fullPath = path.join(dirPath, entry);
              if (fs.lstatSync(fullPath).isDirectory()) {
                rmDir(fullPath);
              } else {
                fs.unlinkSync(fullPath);
              }
            });
            fs.rmdirSync(dirPath);
          }
        };
        rmDir(runtimeDir);
      } catch (e) {
        lg.warn('cleanup warning: ' + e.message);
      }
      resolve();
    });
  }

  // Use the server's createApplication to get the handler — no module-level
  // runtime mutation, no global override, no mutex.
  var app = serverMod.createApplication({ context: requestContext, close: close });

  return {
    app: app.handler,
    runtime: requestContext,
    close: close,
    ensureInitialized: ensureInitialized,
    dataDir: dataDir,
    adminToken: adminToken,
    fixtureImageId: fixtureImageId,
    operatingModeService: operatingModeService,
    overridePersistence: overridePersistence,
  };
}

module.exports = { createApplication: createApplication };
