// create-application.js — Single authoritative application creator (R5-03, R6-02, R7-05)

function createApplication(options) {
  if (!options || !options.context) {
    var errCtx = new Error('CANONICAL_CONTEXT_REQUIRED');
    errCtx.code = 'CANONICAL_CONTEXT_REQUIRED';
    throw errCtx;
  }

  if (typeof options.handler !== 'function') {
    var errH = new Error('HANDLER_REQUIRED');
    errH.code = 'HANDLER_REQUIRED';
    throw errH;
  }

  return {
    handler: options.handler,
    context: options.context,
    close: typeof options.close === 'function' ? options.close : function() {
      return Promise.resolve();
    }
  };
}

module.exports = {
  createApplication: createApplication,
};
