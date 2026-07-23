// create-production-boot.js — Production Boot Composition Module (R6-01)

var bootstrap = require('./bootstrap').bootstrap;

async function createProductionBoot(options) {
  options = options || {};
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
    handlerFactory: options.handlerFactory,
  });

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
