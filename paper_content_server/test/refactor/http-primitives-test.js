'use strict';

/**
 * Unit tests for HTTP primitive modules:
 *   src/http/request-url.js
 *   src/http/response.js
 *   src/http/body-reader.js
 *   src/http/route-result.js
 */

const assert = require('assert');
const { EventEmitter } = require('events');
const { Writable } = require('stream');

// ── request-url ----------------------------------------------------------

function testRequestUrl() {
  const { parseRequestUrl, getQueryParam } = require('../../src/http/request-url');

  // Basic pathname parsing
  {
    const r = parseRequestUrl('/health/live', 'localhost:8787');
    assert.strictEqual(r.pathname, '/health/live');
    assert.strictEqual(r.host, 'localhost:8787');
  }

  // Query parameters
  {
    const r = parseRequestUrl('/api/frame.bin?panel=49&debug=1', 'example.com');
    assert.strictEqual(r.pathname, '/api/frame.bin');
    assert.strictEqual(getQueryParam(r.searchParams, 'panel'), '49');
    assert.strictEqual(getQueryParam(r.searchParams, 'debug'), '1');
    assert.strictEqual(getQueryParam(r.searchParams, 'missing'), null);
  }

  // No query
  {
    const r = parseRequestUrl('/api/state.json');
    assert.strictEqual(r.pathname, '/api/state.json');
    assert.strictEqual(r.searchParams.toString(), '');
  }

  // Root path
  {
    const r = parseRequestUrl('/');
    assert.strictEqual(r.pathname, '/');
  }

  // Host fallback
  {
    const r = parseRequestUrl('/test');
    assert.strictEqual(r.host, 'localhost');
  }

  console.log('PASS request-url: all cases');
}

// ── response -------------------------------------------------------------

function testResponse() {
  const {
    sendJson, sendText, sendBuffer, sendNoContent,
    sendRedirect, sendError, isFinished,
  } = require('../../src/http/response');

  // sendJson
  {
    const res = createMockRes();
    sendJson(res, 200, { hello: 'world' });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.headers['content-type'], 'application/json; charset=utf-8');
    const parsed = JSON.parse(res.body.toString());
    assert.deepStrictEqual(parsed, { hello: 'world' });
  }

  // sendJson with error status
  {
    const res = createMockRes();
    sendJson(res, 400, { error: 'bad request' });
    assert.strictEqual(res.statusCode, 400);
    const parsed = JSON.parse(res.body.toString());
    assert.strictEqual(parsed.error, 'bad request');
  }

  // sendText
  {
    const res = createMockRes();
    sendText(res, 200, 'hello');
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.toString(), 'hello');
    assert.strictEqual(res.headers['content-type'], 'text/plain; charset=utf-8');
  }

  // sendBuffer
  {
    const res = createMockRes();
    const buf = Buffer.from([0x00, 0x01, 0x02]);
    sendBuffer(res, 200, buf, { 'X-Custom': 'value' });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.headers['content-type'], 'application/octet-stream');
    assert.strictEqual(res.headers['x-custom'], 'value');
    assert.deepStrictEqual(res.body, buf);
  }

  // sendNoContent
  {
    const res = createMockRes();
    sendNoContent(res);
    assert.strictEqual(res.statusCode, 204);
    assert.strictEqual(res.body.length, 0);
  }

  // sendRedirect
  {
    const res = createMockRes();
    sendRedirect(res, 302, '/new-location');
    assert.strictEqual(res.statusCode, 302);
    assert.strictEqual(res.headers['location'], '/new-location');
  }

  // sendError
  {
    const res = createMockRes();
    sendError(res, 404, 'not found');
    assert.strictEqual(res.statusCode, 404);
    const parsed = JSON.parse(res.body.toString());
    assert.strictEqual(parsed.error, 'not found');
  }

  // isFinished — false initially
  {
    const res = createMockRes();
    assert.strictEqual(isFinished(res), false);
  }

  // isFinished — true after end
  {
    const res = createMockRes();
    res.end();
    assert.strictEqual(isFinished(res), true);
  }

  // Double-write protection
  {
    const res = createMockRes();
    sendJson(res, 200, { first: true });
    const firstBody = res.body.toString();
    sendJson(res, 200, { second: true }); // should be no-op
    assert.strictEqual(res.body.toString(), firstBody, 'second write must be no-op');
  }

  console.log('PASS response: all cases');
}

// ── body-reader ----------------------------------------------------------

function testBodyReader() {
  const { readBody, readJsonBody } = require('../../src/http/body-reader');

  // Read empty body
  {
    const req = createMockReq('');
    return readBody(req).then((body) => {
      assert.strictEqual(body, '');
    });
  }

  // Read small body
  {
    const req = createMockReq('hello');
    return readBody(req).then((body) => {
      assert.strictEqual(body, 'hello');
    });
  }

  // Read JSON body
  {
    const req = createMockReq(JSON.stringify({ a: 1 }));
    return readJsonBody(req).then((data) => {
      assert.deepStrictEqual(data, { a: 1 });
    });
  }

  // Empty JSON body returns {}
  {
    const req = createMockReq('');
    return readJsonBody(req).then((data) => {
      assert.deepStrictEqual(data, {});
    });
  }
}

// ── route-result ---------------------------------------------------------

function testRouteResult() {
  const { RouteResult } = require('../../src/http/route-result');

  assert.strictEqual(RouteResult.HANDLED, 'HANDLED');
  assert.strictEqual(RouteResult.NOT_FOUND, 'NOT_FOUND');
  assert.strictEqual(RouteResult.METHOD_NOT_ALLOWED, 'METHOD_NOT_ALLOWED');

  // Ensure frozen
  assert.throws(() => { RouteResult.NEW_VALUE = 'test'; }, /TypeError|not writable/);

  console.log('PASS route-result: all cases');
}

// ── Helpers --------------------------------------------------------------

function createMockRes() {
  const chunks = [];
  const res = new Writable({
    write(chunk, encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      callback();
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

  const origWriteHead = res.writeHead || function (status, headers) {
    res.statusCode = status;
    if (headers) Object.assign(res.headers, headers);
    res.headersSent = true;
  };

  res.writeHead = function (status, headers) {
    res.statusCode = status;
    if (headers) Object.assign(res.headers, Object.keys(headers).reduce((acc, k) => {
      acc[k.toLowerCase()] = headers[k];
      return acc;
    }, {}));
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

  res.getHeader = (name) => res.headers[name.toLowerCase()];
  res.setHeader = (name, value) => { res.headers[name.toLowerCase()] = value; };

  return res;
}

function createMockReq(body) {
  const req = new EventEmitter();
  req.headers = {
    'content-type': 'application/json',
  };
  req.method = 'POST';
  // Simulate the body being sent asynchronously
  if (body && body.length > 0) {
    process.nextTick(() => {
      req.emit('data', Buffer.from(body));
      req.emit('end');
    });
  } else {
    process.nextTick(() => {
      req.emit('end');
    });
  }
  return req;
}

// ── Run ------------------------------------------------------------------

async function run() {
  try {
    testRequestUrl();
    testResponse();
    testRouteResult();
    await testBodyReader();
    console.log('\n=== http-primitives: all passed ===');
    process.exit(0);
  } catch (err) {
    console.error('FAIL http-primitives:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

run();
