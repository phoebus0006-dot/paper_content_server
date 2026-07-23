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
var createMqttClientPort = require('../mqtt/mqtt-client-port').createMqttClientPort;

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
      deviceRegistryService: services.deviceRegistryService,
      newsPipeline: services.newsPipeline,
      adminQueryService: services.adminQueryService,
      featureFlagView: services.featureFlagView,
      renderShadow: services.renderShadow,
    },
  });

  // MQTT disconnect port — wraps mqttClient.end(callback) into a Promise that
  // is idempotent and awaits the broker teardown. When mqttClient is null
  // (MQTT disabled), disconnect() resolves immediately.
  var mqttClientPort = createMqttClientPort(mqttClient);

  var bootState = 'starting';
  var server = null;

  function getState() {
    return bootState;
  }

  function setState(newState) {
    bootState = newState;
  }

  function startListening(port, host) {
    return new Promise(function(resolve, reject) {
      if (!server) {
        server = http.createServer(app.handler);
      }
      var listenPort = port || config.server.port;
      var listenHost = host || '0.0.0.0';
      function onError(err) {
        bootState = 'failed';
        reject(err);
      }
      server.once('error', onError);
      server.listen(listenPort, listenHost, function() {
        server.removeListener('error', onError);
        bootState = 'ready';
        logger.info('NewsPhoto content server listening on port ' + listenPort);
        resolve(server);
      });
    });
  }

  if (overrides.server) {
    // Testability hook: inject a fake server whose close() can fail/hang.
    server = overrides.server;
    bootState = 'ready';
  } else if (overrides.listen) {
    startListening(overrides.port).catch(function(err) {
      logger.error('Failed to listen: ' + err.message);
    });
  }

  // Shared shutdown Promise — concurrent/second calls return the same Promise.
  var shutdownPromise = null;

  function performShutdown() {
    bootState = 'stopping';
    var tasks = [];
    if (server) {
      tasks.push(new Promise(function(resolve, reject) {
        if (!server.listening) { resolve(); return; }
        server.close(function(err) { if (err) reject(err); else resolve(); });
      }));
    }
    tasks.push(mqttClientPort.disconnect());

    var timeoutMs = (config.lifecycle && config.lifecycle.shutdownTimeoutMs) || Number(process.env.BOOTSTRAP_SHUTDOWN_TIMEOUT_MS) || 10000;
    var timer = null;
    var timeoutPromise = new Promise(function(resolve, reject) {
      timer = setTimeout(function() {
        reject(new Error('SHUTDOWN_TIMEOUT'));
      }, timeoutMs);
    });

    // Clear the shutdown timer on BOTH success and failure paths so a late
    // SHUTDOWN_TIMEOUT rejection never surfaces after the race has settled
    // (which would otherwise leak as an unhandled rejection).
    function clearTimer() {
      if (timer) { clearTimeout(timer); timer = null; }
    }

    return Promise.race([
      Promise.all(tasks).then(
        function() { clearTimer(); },
        function(err) { clearTimer(); throw err; }
      ),
      timeoutPromise,
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
    state: bootState,
    getState: getState,
    setState: setState,
    startListening: startListening,
    deps: { clock: clock, logger: logger, stores: stores, httpClient: httpClient, snapshotStore: snapshotStore, snapshotCache: snapshotCache, pinStore: pinStore, publicationLock: publicationLock, operatingModeService: operatingModeService, publicationHistory: publicationHistory, notificationPort: notificationPort, mqttClient: mqttClient },
  };
}

bootstrap.BootstrapError = BootstrapError;

module.exports = { bootstrap: bootstrap, BootstrapError: BootstrapError };
