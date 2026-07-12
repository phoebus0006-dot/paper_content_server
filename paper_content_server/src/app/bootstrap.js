// bootstrap.js — Application startup orchestrator
// Called once at process start. Loads config, creates app, optionally listens.
// Supports { env, cwd, clock, logger, stores, httpClient, handler, listen } for testing.
// Does NOT process.exit. Does NOT auto-listen unless listen !== false.

var path = require('path');
var http = require('http');
var createApp = require('./create-app').createApp;
var composeServices = require('./compose-services').composeServices;
var loadConfig = require('../config/load-config').loadConfig;
var SystemClock = require('../infra/clock').SystemClock;
var ConsoleLogger = require('../infra/logger').ConsoleLogger;
var JsonStore = require('../infra/json-store').JsonStore;
var createHttpClient = require('../infra/http-client').createHttpClient;

var R3_SnapshotStore = require('../snapshot/snapshot-store').SnapshotStore;
var R3_SnapshotCache = require('../snapshot/snapshot-cache').SnapshotCache;
var R3_PinStore = require('../snapshot/pin-store').PinStore;
var R3_PublicationLock = require('../publication/publication-lock').PublicationLock;
var R3_OperatingModeService = require('../publication/operating-mode-service').OperatingModeService;
var R3_PublicationHistory = require('../publication/publication-history').PublicationHistory;
var R3_NoopNotificationPort = require('../publication/notification-port').NoopNotificationPort;

function BootstrapError(message, config) {
  this.message = message;
  this.code = 'BOOTSTRAP_CONFIG_ERROR';
  this.config = config || null;
}

function bootstrap(overrides) {
  overrides = overrides || {};

  var config = loadConfig({
    env: overrides.env,
    cwd: overrides.cwd || process.cwd(),
  });

  if (!config.isValid) {
    var errMsg = 'Config validation failed: ' + config.errors.join('; ');
    throw new BootstrapError(errMsg, config);
  }

  var clock = overrides.clock || SystemClock();
  var logger = overrides.logger || ConsoleLogger();
  var httpClient = overrides.httpClient || createHttpClient(20000);

  var stores = overrides.stores || {};
  if (!stores.newsCache) stores.newsCache = JsonStore(config.paths.newsCacheFile);
  if (!stores.newsRotation) stores.newsRotation = JsonStore(config.paths.newsRotationFile);
  if (!stores.libraryState) stores.libraryState = JsonStore(config.paths.libraryStateFile);
  if (!stores.imageIndex) stores.imageIndex = JsonStore(config.paths.imageIndexFile);
  if (!stores.lastGoodNews) stores.lastGoodNews = JsonStore(config.paths.lastGoodNewsFile);

  var snapshotStore = R3_SnapshotStore(
    path.join(config.paths.dataDir, 'snapshots'),
    path.join(config.paths.dataDir, 'publication'),
    logger
  );
  var snapshotCache = R3_SnapshotCache();
  var pinStore = R3_PinStore({ nowMs: clock.nowMs });
  var publicationLock = R3_PublicationLock();
  var operatingModeService = R3_OperatingModeService();
  var publicationHistory = R3_PublicationHistory(
    path.join(config.paths.dataDir, 'publication', 'history.json'),
    logger
  );
  var notificationPort = overrides.notificationPort || R3_NoopNotificationPort();
  var mqttClient = overrides.mqttClient || null;

  var services = composeServices({
    config: config, clock: clock, logger: logger,
    stores: stores, httpClient: httpClient,
    snapshotStore: snapshotStore, snapshotCache: snapshotCache,
    pinStore: pinStore, publicationLock: publicationLock,
    operatingModeService: operatingModeService,
    publicationHistory: publicationHistory,
    notificationPort: notificationPort,
    mqttClient: mqttClient,
  });

  var app = createApp({
    handler: overrides.handler,
    config: config,
    clock: clock,
    logger: logger,
    stores: stores,
    httpClient: httpClient,
    services: {
      snapshotStore: snapshotStore,
      snapshotCache: snapshotCache,
      pinStore: pinStore,
      publicationLock: publicationLock,
      operatingModeService: operatingModeService,
      publicationHistory: publicationHistory,
      notificationPort: notificationPort,
      publicationService: services.publicationService,
      newsPipeline: services.newsPipeline,
      adminQueryService: services.adminQueryService,
      featureFlagView: services.featureFlagView,
      renderShadow: services.renderShadow,
    },
  });

  var server = null;
  if (overrides.listen) {
    var listenPort = overrides.port || config.server.port;
    server = http.createServer(app.handler);
    server.listen(listenPort, '0.0.0.0', function() {
      logger.info('NewsPhoto content server listening on port ' + listenPort);
    });
  }

  // Shared shutdown Promise — concurrent/second calls return the same Promise.
  var shutdownPromise = null;

  function disconnectMqtt(client) {
    if (!client || typeof client.disconnect !== 'function') {
      return Promise.resolve();
    }
    return new Promise(function(resolve, reject) {
      var settled = false;
      function done(err) {
        if (settled) return;
        settled = true;
        if (err) reject(err);
        else resolve();
      }
      try {
        var result;
        if (client.disconnect.length >= 1) {
          result = client.disconnect(done);
        } else {
          result = client.disconnect();
        }
        if (result && typeof result.then === 'function') {
          result.then(function() { done(); }, done);
        } else if (client.disconnect.length < 1) {
          done();
        }
      } catch (error) {
        done(error);
      }
    });
  }

  function performShutdown() {
    var tasks = [];
    if (server) {
      tasks.push(new Promise(function(resolve, reject) {
        server.close(function(err) { if (err) reject(err); else resolve(); });
      }));
    }
    tasks.push(disconnectMqtt(mqttClient));

    var timeoutMs = (config.lifecycle && config.lifecycle.shutdownTimeoutMs) || Number(process.env.BOOTSTRAP_SHUTDOWN_TIMEOUT_MS) || 10000;
    var timeout = null;
    function timeoutReject() {
      return new Promise(function(resolve, reject) {
        timeout = setTimeout(function() {
          reject(new Error('SHUTDOWN_TIMEOUT'));
        }, timeoutMs);
      });
    }

    return Promise.race([
      Promise.all(tasks).then(function() { if (timeout) clearTimeout(timeout); }),
      timeoutReject(),
    ]);
  }

  function shutdown() {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = performShutdown();
    return shutdownPromise;
  }

  return {
    app: app,
    config: config,
    server: server,
    services: services,
    shutdown: shutdown,
    deps: { clock: clock, logger: logger, stores: stores, httpClient: httpClient, snapshotStore: snapshotStore, snapshotCache: snapshotCache, pinStore: pinStore, publicationLock: publicationLock, operatingModeService: operatingModeService, publicationHistory: publicationHistory, notificationPort: notificationPort, mqttClient: mqttClient },
  };
}

bootstrap.BootstrapError = BootstrapError;

module.exports = { bootstrap: bootstrap, BootstrapError: BootstrapError };
