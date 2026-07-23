const fs = require('fs');
const path = require('path');

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
  var { bootstrap } = require('./app/bootstrap');
  var R3_snapshotModel = require('../src/snapshot/snapshot-model');

  var testEnv = Object.assign({}, process.env, options.env || {}, { DATA_DIR: dataDir, ADMIN_TOKEN: adminToken });

  var serviceOverrides = Object.assign({}, options.serviceOverrides || {});
  if (options.deviceRegistryService) {
    serviceOverrides.deviceRegistryService = options.deviceRegistryService;
  }

  var boot = bootstrap({
    env: testEnv,
    cwd: path.join(__dirname, '..'),
    clock: options.clock,
    logger: lg,
    listen: false,
    adminToken: adminToken,
    serviceOverrides: serviceOverrides,
  });

  var requestContext = boot.context;

  var snapshotStore = requestContext.snapshotStore;
  var operatingModeService = requestContext.operatingModeService;
  var pubService = requestContext.publicationService;
  var overridePersistence = requestContext.overridePersistence;

  if (operatingModeService && typeof operatingModeService.setMode === 'function') {
    operatingModeService.setMode('AUTO');
  }
  if (overridePersistence && typeof overridePersistence.clearOverride === 'function') {
    overridePersistence.clearOverride();
  }

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
