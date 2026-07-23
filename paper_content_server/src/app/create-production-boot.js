// create-production-boot.js — Production Boot Composition Module (R6-01, R7-01, R7-06)

var bootstrap = require('./bootstrap').bootstrap;

async function createProductionBoot(options) {
  options = options || {};

  if (!options.handler && typeof options.handlerFactory !== 'function') {
    var errReq = new Error('PRODUCTION_HANDLER_REQUIRED');
    errReq.code = 'PRODUCTION_HANDLER_REQUIRED';
    throw errReq;
  }

  var env = options.env || process.env;
  var cwd = options.cwd || process.cwd();
  var logger = options.logger;
  var listen = options.listen !== undefined ? options.listen : false;
  var port = options.port;
  var notificationPort = options.notificationPort;
  var mqttClient = options.mqttClient;
  var serviceOverrides = options.serviceOverrides || options.services;

  var boot = bootstrap({
    env: env,
    cwd: cwd,
    logger: logger,
    listen: listen,
    port: port,
    notificationPort: notificationPort,
    mqttClient: mqttClient,
    serviceOverrides: serviceOverrides,
    contextOptions: options.contextOptions,
    handler: options.handler,
    handlerFactory: options.handlerFactory,
    requireHandler: true,
  });

  if (!boot || !boot.app || typeof boot.app.handler !== 'function') {
    var errInv = new Error('PRODUCTION_HANDLER_INVALID');
    errInv.code = 'PRODUCTION_HANDLER_INVALID';
    throw errInv;
  }

  return {
    boot: boot,
    context: boot.context,
    runtime: boot.context,
    services: boot.services,
    app: boot.app,
  };
}

module.exports = {
  createProductionBoot: createProductionBoot,
};
