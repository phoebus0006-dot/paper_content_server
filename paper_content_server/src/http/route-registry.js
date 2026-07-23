'use strict';

const { RouteResult } = require('./route-result');

const SUPPORTED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

/**
 * Create a route registry that maps method+pattern to handler functions.
 *
 * Pattern syntax:
 *   - Fixed: '/health/live'
 *   - Param: '/api/devices/:deviceId/heartbeat'
 *
 * Each route definition is an object:
 *   { method, pattern, parts, paramNames, handler }
 *
 * @returns {object} Route registry with .get/.post/.put/.patch/.delete/.dispatch
 */
function createRouteRegistry() {
  /** @type {Array<{method:string, parts:string[], paramNames:string[], handler:Function}>} */
  const routes = [];

  /**
   * Register a route.
   *
   * @param {string} method - HTTP method (GET, POST, PUT, PATCH, DELETE)
   * @param {string} pattern - Path pattern, e.g. '/api/foo/:id'
   * @param {Function} handler - Async handler(req, res, context) => Promise<void>
   */
  function addRoute(method, pattern, handler) {
    const upperMethod = method.toUpperCase();
    if (!SUPPORTED_METHODS.includes(upperMethod)) {
      throw new Error(`Unsupported HTTP method: ${method}`);
    }
    if (typeof pattern !== 'string' || !pattern.startsWith('/')) {
      throw new Error(`Invalid route pattern: ${pattern}`);
    }
    if (typeof handler !== 'function') {
      throw new Error(`Route handler must be a function for ${upperMethod} ${pattern}`);
    }

    // Check for duplicate method+pattern
    for (const r of routes) {
      if (r.method === upperMethod && r.pattern === pattern) {
        throw new Error(`Duplicate route: ${upperMethod} ${pattern}`);
      }
    }

    const parts = pattern.split('/').filter(Boolean);
    const paramNames = [];

    for (const part of parts) {
      if (part.startsWith(':')) {
        paramNames.push(part.slice(1));
      }
    }

    routes.push({
      method: upperMethod,
      pattern,
      parts,
      paramNames,
      handler,
    });
  }

  /**
   * Match a method and pathname against registered routes.
   *
   * @param {string} method - HTTP method
   * @param {string} pathname - URL pathname
   * @returns {{ handler: Function, params: object }|null}
   */
  function match(method, pathname) {
    const upperMethod = method.toUpperCase();
    const requestParts = pathname.split('/').filter(Boolean);

    // First pass: exact match for method+path
    for (const route of routes) {
      if (route.method !== upperMethod) continue;
      if (route.parts.length !== requestParts.length) continue;

      const params = {};
      let matched = true;

      for (let i = 0; i < route.parts.length; i++) {
        const routePart = route.parts[i];
        const requestPart = requestParts[i];

        if (routePart.startsWith(':')) {
          params[routePart.slice(1)] = requestPart;
        } else if (routePart !== requestPart) {
          matched = false;
          break;
        }
      }

      if (matched) {
        return { handler: route.handler, params };
      }
    }

    return null;
  }

  /**
   * Check if any route matches the pathname (for 405 detection).
   * @param {string} pathname
   * @returns {boolean}
   */
  function hasPath(pathname) {
    const requestParts = pathname.split('/').filter(Boolean);
    for (const route of routes) {
      if (route.parts.length !== requestParts.length) continue;
      let matched = true;
      for (let i = 0; i < route.parts.length; i++) {
        const rp = route.parts[i];
        const qp = requestParts[i];
        if (!rp.startsWith(':') && rp !== qp) {
          matched = false;
          break;
        }
      }
      if (matched) return true;
    }
    return false;
  }

  /**
   * Dispatch a request to the matching route handler.
   *
   * @param {import('http').IncomingMessage} req
   * @param {import('http').ServerResponse} res
   * @param {object} [context] - Application context passed to handlers
   * @returns {Promise<string>} RouteResult value
   */
  async function dispatch(req, res, context) {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;
    const method = req.method;

    const matched = match(method, pathname);
    if (matched) {
      try {
        await matched.handler(req, res, {
          ...context,
          params: matched.params,
          query: parsedUrl.searchParams,
          pathname,
        });
        return RouteResult.HANDLED;
      } catch (err) {
        // Handler threw — propagate for the caller to handle
        throw err;
      }
    }

    if (hasPath(pathname)) {
      return RouteResult.METHOD_NOT_ALLOWED;
    }

    return RouteResult.NOT_FOUND;
  }

  return {
    get: (pattern, handler) => addRoute('GET', pattern, handler),
    post: (pattern, handler) => addRoute('POST', pattern, handler),
    put: (pattern, handler) => addRoute('PUT', pattern, handler),
    patch: (pattern, handler) => addRoute('PATCH', pattern, handler),
    delete: (pattern, handler) => addRoute('DELETE', pattern, handler),
    addRoute,
    match,
    dispatch,
    _routes: routes, // exposed for testing
  };
}

module.exports = { createRouteRegistry };
