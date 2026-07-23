'use strict';

/**
 * Route dispatch result types.
 *
 * HANDLED           — The route matched and produced a response.
 * NOT_FOUND         — No matching route was found.
 * METHOD_NOT_ALLOWED — A route matched the path but not the HTTP method.
 */
const RouteResult = Object.freeze({
  HANDLED: 'HANDLED',
  NOT_FOUND: 'NOT_FOUND',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
});

module.exports = { RouteResult };
