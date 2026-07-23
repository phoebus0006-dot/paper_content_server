'use strict';

/**
 * Unit tests for the route registry (src/http/route-registry.js).
 *
 * Covers:
 *   Fixed path matching
 *   Path parameters (:param)
 *   Query parameters
 *   Async handlers
 *   Method-based dispatch (GET / POST etc.)
 *   404 (NOT_FOUND)
 *   405 (METHOD_NOT_ALLOWED)
 *   Handler exception propagation
 *   Handler already sent response
 *   Duplicate route rejection
 *   Invalid route definition rejection
 */

const assert = require('assert');
const { EventEmitter } = require('events');
const { Writable } = require('stream');

// ── Mock helpers ---------------------------------------------------------

function mockReq(method, url, host) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = { host: host || 'localhost' };
  return req;
}

function mockRes() {
  const chunks = [];
  const res = new Writable({
    write(chunk, encoding, cb) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      cb();
    },
  });
  res.statusCode = 200;
  res.headers = {};
  res.headersSent = false;
  res._writableEnded = false;
  res.destroyed = false;

  Object.defineProperty(res, 'writableEnded', {
    get() { return res._writableEnded; },
    configurable: true,
  });

  res.writeHead = function (status, headers) {
    res.statusCode = status;
    if (headers) {
      Object.assign(res.headers, Object.keys(headers).reduce((acc, k) => {
        acc[k.toLowerCase()] = headers[k];
        return acc;
      }, {}));
    }
    res.headersSent = true;
  };

  const origEnd = res.end.bind(res);
  res.end = function (data) {
    if (data) {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      chunks.push(buf);
    }
    res._writableEnded = true;
    res.body = Buffer.concat(chunks);
    origEnd();
  };

  return res;
}

// ── Tests -----------------------------------------------------------------

function testFixedPath() {
  const { createRouteRegistry } = require('../../src/http/route-registry');
  const routes = createRouteRegistry();

  let called = false;
  routes.get('/health/live', (req, res) => {
    called = true;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
  });

  const req = mockReq('GET', '/health/live');
  const res = mockRes();

  return routes.dispatch(req, res).then((result) => {
    assert.strictEqual(result, 'HANDLED');
    assert.strictEqual(called, true);
    assert.strictEqual(res.statusCode, 200);
  });
}

function testPathParam() {
  const { createRouteRegistry } = require('../../src/http/route-registry');
  const routes = createRouteRegistry();

  let capturedParams = null;
  routes.get('/api/devices/:deviceId/heartbeat', (req, res, ctx) => {
    capturedParams = ctx.params;
    res.writeHead(200);
    res.end();
  });

  const req = mockReq('GET', '/api/devices/esp32-001/heartbeat');
  const res = mockRes();

  return routes.dispatch(req, res).then((result) => {
    assert.strictEqual(result, 'HANDLED');
    assert.deepStrictEqual(capturedParams, { deviceId: 'esp32-001' });
  });
}

function testQueryParamsInContext() {
  const { createRouteRegistry } = require('../../src/http/route-registry');
  const routes = createRouteRegistry();

  let capturedQuery = null;
  routes.get('/api/frame.bin', (req, res, ctx) => {
    capturedQuery = ctx.query;
    res.writeHead(200);
    res.end();
  });

  const req = mockReq('GET', '/api/frame.bin?panel=49&debug=1');
  const res = mockRes();

  return routes.dispatch(req, res).then(() => {
    assert.ok(capturedQuery);
    assert.strictEqual(capturedQuery.get('panel'), '49');
    assert.strictEqual(capturedQuery.get('debug'), '1');
  });
}

function testAsyncHandler() {
  const { createRouteRegistry } = require('../../src/http/route-registry');
  const routes = createRouteRegistry();

  routes.get('/api/async', async (req, res) => {
    const data = await Promise.resolve({ async: true });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  });

  const req = mockReq('GET', '/api/async');
  const res = mockRes();

  return routes.dispatch(req, res).then((result) => {
    assert.strictEqual(result, 'HANDLED');
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body.toString());
    assert.strictEqual(body.async, true);
  });
}

function testMethodDispatch() {
  const { createRouteRegistry } = require('../../src/http/route-registry');
  const routes = createRouteRegistry();

  let getCalled = false;
  let postCalled = false;

  routes.get('/api/items', (req, res) => { getCalled = true; res.writeHead(200); res.end(); });
  routes.post('/api/items', (req, res) => { postCalled = true; res.writeHead(201); res.end(); });

  const req1 = mockReq('GET', '/api/items');
  const res1 = mockRes();
  return routes.dispatch(req1, res1).then(() => {
    assert.strictEqual(getCalled, true);
    assert.strictEqual(postCalled, false);

    const req2 = mockReq('POST', '/api/items');
    const res2 = mockRes();
    return routes.dispatch(req2, res2);
  }).then(() => {
    assert.strictEqual(postCalled, true);
  });
}

function testNotFound() {
  const { createRouteRegistry } = require('../../src/http/route-registry');
  const routes = createRouteRegistry();

  routes.get('/health/live', (req, res) => { res.writeHead(200); res.end(); });

  const req = mockReq('GET', '/unknown/path');
  const res = mockRes();

  return routes.dispatch(req, res).then((result) => {
    assert.strictEqual(result, 'NOT_FOUND');
  });
}

function testMethodNotAllowed() {
  const { createRouteRegistry } = require('../../src/http/route-registry');
  const routes = createRouteRegistry();

  routes.get('/api/items', (req, res) => { res.writeHead(200); res.end(); });

  const req = mockReq('POST', '/api/items');
  const res = mockRes();

  return routes.dispatch(req, res).then((result) => {
    assert.strictEqual(result, 'METHOD_NOT_ALLOWED');
  });
}

function testHandlerException() {
  const { createRouteRegistry } = require('../../src/http/route-registry');
  const routes = createRouteRegistry();

  routes.get('/api/error', async (req, res) => {
    throw new Error('handler blew up');
  });

  const req = mockReq('GET', '/api/error');
  const res = mockRes();

  return routes.dispatch(req, res).then(
    () => { throw new Error('expected exception but got HANDLED'); },
    (err) => {
      assert.strictEqual(err.message, 'handler blew up');
    }
  );
}

function testHandlerAlreadySentResponse() {
  const { createRouteRegistry } = require('../../src/http/route-registry');
  const routes = createRouteRegistry();

  routes.get('/api/early', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('early');
    return 'already-sent';
  });

  const req = mockReq('GET', '/api/early');
  const res = mockRes();

  return routes.dispatch(req, res).then((result) => {
    assert.strictEqual(result, 'HANDLED');
  });
}

function testDuplicateRoute() {
  const { createRouteRegistry } = require('../../src/http/route-registry');
  const routes = createRouteRegistry();

  routes.get('/api/dup', () => {});
  assert.throws(
    () => routes.get('/api/dup', () => {}),
    /Duplicate route/
  );
}

function testInvalidRouteDefinition() {
  const { createRouteRegistry } = require('../../src/http/route-registry');

  // Test that createRouteRegistry itself is exposed
  const routes = createRouteRegistry();

  // Invalid pattern (doesn't start with /)
  assert.throws(
    () => routes.get('invalid', () => {}),
    /Invalid route pattern/
  );

  // Invalid handler
  assert.throws(
    () => routes.get('/test', 'not a function'),
    /Route handler must be a function/
  );

  // Check addRoute with unsupported method
  assert.throws(
    () => routes.addRoute('OPTIONS', '/test', () => {}),
    /Unsupported HTTP method/
  );
}

function testPutPatchDelete() {
  const { createRouteRegistry } = require('../../src/http/route-registry');
  const routes = createRouteRegistry();

  let putCalled = false;
  let patchCalled = false;
  let deleteCalled = false;

  routes.put('/api/resource/:id', (req, res, ctx) => { putCalled = true; res.writeHead(200); res.end(); });
  routes.patch('/api/resource/:id', (req, res, ctx) => { patchCalled = true; res.writeHead(200); res.end(); });
  routes.delete('/api/resource/:id', (req, res, ctx) => { deleteCalled = true; res.writeHead(200); res.end(); });

  const res1 = mockRes();
  return routes.dispatch(mockReq('PUT', '/api/resource/1'), res1).then(() => {
    assert.strictEqual(putCalled, true);
    const res2 = mockRes();
    return routes.dispatch(mockReq('PATCH', '/api/resource/2'), res2);
  }).then(() => {
    assert.strictEqual(patchCalled, true);
    const res3 = mockRes();
    return routes.dispatch(mockReq('DELETE', '/api/resource/3'), res3);
  }).then(() => {
    assert.strictEqual(deleteCalled, true);
  });
}

// ── Runner ---------------------------------------------------------------

async function run() {
  let passed = 0;
  let failed = 0;

  const tests = [
    testFixedPath,
    testPathParam,
    testQueryParamsInContext,
    testAsyncHandler,
    testMethodDispatch,
    testNotFound,
    testMethodNotAllowed,
    testHandlerException,
    testHandlerAlreadySentResponse,
    testDuplicateRoute,
    testInvalidRouteDefinition,
    testPutPatchDelete,
  ];

  for (const test of tests) {
    try {
      await test();
      console.log('PASS ' + test.name);
      passed++;
    } catch (err) {
      console.log('FAIL ' + test.name + ': ' + err.message);
      failed++;
    }
  }

  console.log(`\n=== route-registry: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('route-registry test crashed:', err);
  process.exit(1);
});
