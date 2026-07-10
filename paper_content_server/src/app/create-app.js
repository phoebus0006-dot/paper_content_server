// create-app.js — Application factory
// Does NOT auto-start server. Does NOT process.exit.
// Returns { handler, services } for testability.

var http = require('http');

function createApp(dependencies) {
  var config = dependencies.config || {};
  var clock = dependencies.clock;
  var logger = dependencies.logger || console;
  var stores = dependencies.stores || {};
  var httpClient = dependencies.httpClient;
  var translator = dependencies.translator;

  // Placeholder for future injected services
  var services = {
    config: config,
    clock: clock,
    logger: logger,
    stores: stores,
    httpClient: httpClient,
    translator: translator,
  };

  // Request handler — delegates to the actual server.js handleRequest
  // In R1, this wraps the existing server rather than rewriting it.
  // Full migration happens in later phases.
  var handler = function(req, res) {
    // Legacy path: server.js owns the full handler
    // In R1, we just pass through to the existing server
    if (typeof dependencies.legacyHandler === 'function') {
      dependencies.legacyHandler(req, res);
    } else {
      res.writeHead(500);
      res.end('createApp: no handler configured');
    }
  };

  return {
    handler: handler,
    services: services,
  };
}

module.exports = { createApp: createApp };
