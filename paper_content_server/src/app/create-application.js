// create-application.js — Single authoritative application creator (R5-03, R6-02)

function createHandler(ctx) {
  var serverMod = require('../../server');
  return function(req, res) {
    return serverMod.handleRequest(req, res, ctx);
  };
}

function createApplication(options) {
  if (!options || !options.context) {
    var err = new Error('CANONICAL_CONTEXT_REQUIRED');
    err.code = 'CANONICAL_CONTEXT_REQUIRED';
    throw err;
  }

  return {
    handler: createHandler(options.context),
    context: options.context,
    close: typeof options.close === 'function' ? options.close : function() {
      return Promise.resolve();
    }
  };
}

module.exports = {
  createApplication: createApplication,
  createHandler: createHandler,
};
