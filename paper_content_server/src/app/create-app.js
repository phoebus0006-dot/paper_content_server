// create-app.js — Application factory
// Does NOT auto-start server. Does NOT process.exit.
// Returns { app, services, handler } for testability.

function createApp(dependencies) {
  dependencies = dependencies || {};
  var config = dependencies.config || {};
  var clock = dependencies.clock;
  var logger = dependencies.logger || console;
  var stores = dependencies.stores || {};
  var httpClient = dependencies.httpClient;

  var services = {
    config: config,
    clock: clock,
    logger: logger,
    stores: stores,
    httpClient: httpClient,
    newsPipeline: null,
    publicationService: null,
    snapshotStore: null,
    adminQueryService: null,
    notificationPort: null,
    mqttClient: null,
    renderShadow: null,
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
