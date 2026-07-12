// create-app.js — Application factory
// Does NOT auto-start server. Does NOT process.exit.
// Returns { app, services, handler } for testability.
// Services can be injected via dependencies.services; fallback fields remain null.

function createApp(dependencies) {
  dependencies = dependencies || {};
  var config = dependencies.config || {};
  var clock = dependencies.clock;
  var logger = dependencies.logger || console;
  var stores = dependencies.stores || {};
  var httpClient = dependencies.httpClient;

  var injection = dependencies.services || {};

  var services = {
    config: config,
    clock: clock,
    logger: logger,
    stores: stores,
    httpClient: httpClient,
    newsPipeline: injection.newsPipeline || null,
    publicationService: injection.publicationService || null,
    snapshotStore: injection.snapshotStore || null,
    snapshotCache: injection.snapshotCache || null,
    pinStore: injection.pinStore || null,
    publicationLock: injection.publicationLock || null,
    operatingModeService: injection.operatingModeService || null,
    publicationHistory: injection.publicationHistory || null,
    adminQueryService: injection.adminQueryService || null,
    notificationPort: injection.notificationPort || null,
    mqttClient: injection.mqttClient || null,
    renderShadow: injection.renderShadow || null,
  };

  var realHandler = dependencies.handler || dependencies.legacyHandler;

  var handler = function(req, res) {
    if (typeof realHandler === 'function') {
      realHandler(req, res);
    } else {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('createApp: no handler configured');
    }
  };

  return {
    app: { handler: handler, services: services },
    handler: handler,
    services: services,
  };
}

module.exports = { createApp: createApp };
