#!/usr/bin/env node
// production-handler-wiring-test.js — Production Handler Wiring & Fail-Closed Test (R7-08, R7-09, R8-04, R8-05)

var assert = require('assert');
var path = require('path');
var fs = require('fs');

var createProductionBootMod = require('../../src/app/create-production-boot');
var createApplicationMod = require('../../src/app/create-application');
var serverMod = require('../../server.js');

var dataDir = path.join(__dirname, '..', '..', 'qa', 'runtime', 'wiring-test-' + Date.now());
fs.mkdirSync(dataDir, { recursive: true });

var testEnv = Object.assign({}, process.env, {
  DATA_DIR: dataDir,
  ADMIN_TOKEN: 'wiring-test-token',
  NEWS_REFRESH_MINUTES: '5',
  TZ: 'UTC',
});

function createMockRes() {
  var res = {
    statusCode: 0,
    headers: {},
    body: '',
    ended: false,
    writeHead: function(status, headers) {
      res.statusCode = status;
      if (headers) Object.assign(res.headers, headers);
    },
    setHeader: function(k, v) {
      res.headers[k] = v;
    },
    end: function(chunk) {
      if (chunk) res.body += chunk.toString();
      res.ended = true;
    }
  };
  return res;
}

async function runWiringTest() {
  console.log('--- Running Production Handler Wiring Tests (R8-04) ---');

  // 1. Fail closed check
  await assert.rejects(async function() {
    await createProductionBootMod.createProductionBoot({
      env: testEnv,
      cwd: path.join(__dirname, '..', '..'),
      listen: false,
    });
  }, function(err) {
    return err && (err.code === 'PRODUCTION_HANDLER_REQUIRED' || /PRODUCTION_HANDLER_REQUIRED/.test(err.message));
  }, 'createProductionBoot without handler must throw PRODUCTION_HANDLER_REQUIRED');

  // 7.1 Default server wrapper path
  console.log('7.1 Testing Default server wrapper...');
  var prodDefault = await serverMod.createProductionBoot({
    env: testEnv,
    cwd: path.join(__dirname, '..', '..'),
    listen: false,
  });

  assert.ok(prodDefault, 'createProductionBoot must return boot object');
  assert.strictEqual(typeof prodDefault.boot.app.handler, 'function', 'boot.app.handler must be a function');
  assert.strictEqual(prodDefault.runtime, prodDefault.context, 'prodDefault.runtime === prodDefault.context');

  var liveReq = { method: 'GET', url: '/health/live', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
  var liveRes = createMockRes();
  await prodDefault.boot.app.handler(liveReq, liveRes);
  assert.strictEqual(liveRes.statusCode, 200, 'Default handler /health/live status must be 200');
  assert.ok(liveRes.body.includes('ok'), 'Default handler body must include ok');

  var notFoundReq = { method: 'GET', url: '/unknown-route-xyz', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
  var notFoundRes = createMockRes();
  await prodDefault.boot.app.handler(notFoundReq, notFoundRes);
  assert.strictEqual(notFoundRes.statusCode, 404, 'Default handler unknown path must be 404');

  // 7.2 Explicit handlerFactory path
  console.log('7.2 Testing Explicit handlerFactory...');
  var receivedContext = null;
  function customFactory(context) {
    receivedContext = context;
    return function(req, res) {
      res.writeHead(202, { 'Content-Type': 'text/plain' });
      res.end('factory-handler');
    };
  }

  var prodFactory = await serverMod.createProductionBoot({
    env: testEnv,
    cwd: path.join(__dirname, '..', '..'),
    listen: false,
    handlerFactory: customFactory,
  });

  assert.strictEqual(receivedContext, prodFactory.boot.context, 'customFactory receivedContext MUST BE boot.context');
  var factoryRes = createMockRes();
  await prodFactory.boot.app.handler({ method: 'GET', url: '/' }, factoryRes);
  assert.strictEqual(factoryRes.statusCode, 202, 'Explicit handlerFactory status must be 202');
  assert.strictEqual(factoryRes.body, 'factory-handler', 'Explicit handlerFactory body must match');

  // 7.3 Explicit handler path
  console.log('7.3 Testing Explicit handler...');
  var handlerCallCount = 0;
  function customHandler(req, res) {
    handlerCallCount++;
    res.writeHead(204);
    res.end();
  }

  var prodHandler = await serverMod.createProductionBoot({
    env: testEnv,
    cwd: path.join(__dirname, '..', '..'),
    listen: false,
    handler: customHandler,
  });

  assert.strictEqual(typeof prodHandler.boot.app.handler, 'function', 'boot.app.handler must be a function');
  var handlerRes = createMockRes();
  await prodHandler.boot.app.handler({ method: 'GET', url: '/' }, handlerRes);
  assert.strictEqual(handlerRes.statusCode, 204, 'Explicit handler status must be 204');
  assert.strictEqual(handlerCallCount, 1, 'customHandler called exactly once on request');

  // 8. Static AST/Structure Checks on server.js (R8-05)
  console.log('8. Testing Static Structure Checks on server.js...');
  var serverSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'server.js'), 'utf8');

  // Extract main() function source
  var mainStart = serverSrc.indexOf('async function main(');
  var mainEnd = serverSrc.indexOf('// ── Runtime injection', mainStart);
  if (mainEnd < 0) mainEnd = serverSrc.length;
  var mainSrc = serverSrc.substring(mainStart, mainEnd);

  assert.strictEqual(mainSrc.includes('var app = createApplication('), false, 'main() must NOT contain "var app = createApplication("');
  assert.strictEqual(mainSrc.includes('var server = boot.server'), false, 'main() must NOT contain "var server = boot.server"');

  assert.strictEqual(serverSrc.includes('options.handlerFactory || options.handler'), false, 'server.js must NOT contain "options.handlerFactory || options.handler"');

  try { fs.rmdirSync(dataDir, { recursive: true }); } catch (e) {}
  console.log('ALL PRODUCTION HANDLER WIRING TESTS PASSED SUCCESSFULLY.');
}

runWiringTest().catch(function(err) {
  console.error('PRODUCTION HANDLER WIRING TEST FAILED:', err);
  process.exit(1);
});
