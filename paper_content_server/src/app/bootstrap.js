// bootstrap.js — Application startup orchestrator
// Called once at process start. Loads config, creates app, optionally listens.
// Supports { env, cwd, clock, logger, stores, httpClient, handler, listen } for testing.
// Does NOT process.exit. Does NOT auto-listen unless listen !== false.

var path = require('path');
var http = require('http');
var createApp = require('./create-app').createApp;
var loadConfig = require('../config/load-config').loadConfig;
var SystemClock = require('../infra/clock').SystemClock;
var ConsoleLogger = require('../infra/logger').ConsoleLogger;
var JsonStore = require('../infra/json-store').JsonStore;
var createHttpClient = require('../infra/http-client').createHttpClient;

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

  var app = createApp({
    handler: overrides.handler,
    config: config,
    clock: clock,
    logger: logger,
    stores: stores,
    httpClient: httpClient,
  });

  var server = null;
  if (overrides.listen !== false) {
    server = http.createServer(app.handler);
    server.listen(config.server.port, '0.0.0.0', function() {
      logger.info('NewsPhoto content server listening on port ' + config.server.port);
    });
  }

  return {
    app: app,
    config: config,
    server: server,
    deps: { clock: clock, logger: logger, stores: stores, httpClient: httpClient },
  };
}

bootstrap.BootstrapError = BootstrapError;

module.exports = { bootstrap: bootstrap, BootstrapError: BootstrapError };
