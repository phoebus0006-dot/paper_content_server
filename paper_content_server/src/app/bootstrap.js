// bootstrap.js — Application startup
// Called once at process start. Loads config, creates app, listens.

var path = require('path');
var http = require('http');
var createApp = require('./create-app').createApp;
var loadConfig = require('../config/load-config').loadConfig;
var SystemClock = require('../infra/clock').SystemClock;
var ConsoleLogger = require('../infra/logger').ConsoleLogger;

function bootstrap(overrides) {
  overrides = overrides || {};

  // 1. Load config
  var config = loadConfig({
    env: overrides.env || process.env,
    cwd: overrides.cwd || process.cwd(),
  });

  // 2. Validate config
  if (!config.isValid) {
    console.error('Config validation failed:');
    config.errors.forEach(function(err) { console.error('  - ' + err); });
    process.exit(1);
  }

  // 3. Create infrastructure
  var clock = overrides.clock || new SystemClock();
  var logger = overrides.logger || new ConsoleLogger();

  // 4. Detect if running as main module — for legacy compatibility
  var isMain = overrides.isMain !== undefined ? overrides.isMain : (require.main === module);

  // 5. Create app (without starting server)
  var app = createApp({
    config: config,
    clock: clock,
    logger: logger,
  });

  return {
    config: config,
    clock: clock,
    logger: logger,
    app: app,
    isMain: isMain,
  };
}

module.exports = { bootstrap: bootstrap };
