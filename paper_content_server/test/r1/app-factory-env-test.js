#!/usr/bin/env node
// R1.10: AppFactory env isolation — verify that creating/closing AppFactory
// instances does not mutate process.env on the specified keys.
// All config must be injectable; no env pollution, no false Config validation ERROR.
var path = require('path');
var http = require('http');
var ROOT = path.join(__dirname, '..', '..');
var ec = 0, pass = 0, fail = 0;
var _appA = null, _appB = null, _srvA = null, _srvB = null;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}

// Set minimal env so server.js module loads cleanly (no Config validation ERROR)
// These are the ONLY process.env writes before server.js require.
// We restore originals at the end.
var ENV_KEYS = [
  'DATA_DIR', 'ADMIN_TOKEN', 'ADMIN_ACCESS_MODE', 'ADMIN_ALLOWED_CIDRS',
  'ADMIN_ALLOW_HEADERLESS_WRITE', 'TRUST_PROXY',
  'MQTT_ENABLED', 'TRANSLATION_PROVIDER', 'FEEDS_FILE', 'IMAGE_INDEX_FILE',
  'LIBRARY_STATE_FILE', 'NEWS_CACHE_FILE', 'NEWS_ROTATION_STATE_FILE',
  'NEWS_ROTATION_FILE', 'NODE_ENV', 'PORT', 'TZ', 'ENABLE_DEBUG_ROUTES',
];

var envOrig = {}, envWasUndefined = {};
ENV_KEYS.forEach(function(k) {
  envWasUndefined[k] = !(k in process.env);
  envOrig[k] = envWasUndefined[k] ? undefined : process.env[k];
});

// Set clean baseline for server.js module load
process.env.ADMIN_ACCESS_MODE = 'lan';
process.env.ADMIN_ALLOWED_CIDRS = '127.0.0.0/8';
process.env.ADMIN_ALLOW_HEADERLESS_WRITE = 'true';
process.env.TRUST_PROXY = 'false';
process.env.TRANSLATION_PROVIDER = 'none';
process.env.TZ = 'UTC';
process.env.PORT = '18787';

// Snapshot env after setup
var envBefore = {};
ENV_KEYS.forEach(function(k) {
  envBefore[k] = k in process.env ? process.env[k] : undefined;
});

// Now require server.js — should log no config error since env is clean
var serverMod = require(path.join(ROOT, 'server.js'));
t('SERVER_MODULE_LOADED', typeof serverMod === 'object' && typeof serverMod.createApplication === 'function', '');
t('SERVER_MODULE_EXPORTS_createApplication', typeof serverMod.createApplication === 'function', '');
t('SERVER_MODULE_EXPORTS_createHandler', typeof serverMod.createHandler === 'function', '');

var appFactory = require(path.join(ROOT, 'src', 'app-factory'));
t('APP_FACTORY_LOADED', typeof appFactory.createApplication === 'function', '');

// Snapshot env keys after requires (should be same as envBefore)
var envAfterRequire = {};
ENV_KEYS.forEach(function(k) {
  envAfterRequire[k] = k in process.env ? process.env[k] : undefined;
});
var requireChanged = false;
ENV_KEYS.forEach(function(k) {
  if (envAfterRequire[k] !== envBefore[k]) { requireChanged = true; t('ENV_REQUIRE_' + k, false, 'was=' + envBefore[k] + ' now=' + envAfterRequire[k]); }
});
if (!requireChanged) t('ENV_AFTER_REQUIRE', true, 'all ' + ENV_KEYS.length + ' keys unchanged');

// Create two AppFactory instances
var appA = appFactory.createApplication({ adminToken: 'env-test-token-a' });
var appB = appFactory.createApplication({ adminToken: 'env-test-token-b' });
t('APP_FACTORY_INSTANCES_CREATED', !!appA && !!appB, '');

// Verify isolated data dirs
t('APP_FACTORY_A_dataDir', typeof appA.dataDir === 'string', appA.dataDir);
t('APP_FACTORY_B_dataDir', typeof appB.dataDir === 'string', appB.dataDir);
t('APP_FACTORY_DATA_DIRS_DIFFER', appA.dataDir !== appB.dataDir, '');

// Verify operating mode isolation
appA.operatingModeService.setMode('LEGACY_ADMIN_OVERRIDE');
t('APP_FACTORY_A_MODE', appA.operatingModeService.getMode() === 'LEGACY_ADMIN_OVERRIDE', '');
t('APP_FACTORY_B_MODE_ISOLATED', appB.operatingModeService.getMode() === 'AUTO', '');

// Env snapshot after creation
var envAfterCreate = {};
ENV_KEYS.forEach(function(k) {
  envAfterCreate[k] = k in process.env ? process.env[k] : undefined;
});
var createChanged = false;
ENV_KEYS.forEach(function(k) {
  if (envAfterCreate[k] !== envBefore[k]) { createChanged = true; t('ENV_CREATE_' + k, false, 'was=' + envBefore[k] + ' now=' + envAfterCreate[k]); }
});
if (!createChanged) t('ENV_AFTER_CREATE', true, 'all ' + ENV_KEYS.length + ' keys unchanged');

// Make concurrent HTTP requests to both instances
function startServer(handler) {
  return new Promise(function(resolve, reject) {
    var srv = http.createServer(handler);
    srv.listen(0, '127.0.0.1', function() { resolve(srv); });
    srv.on('error', reject);
  });
}

function httpGet(url) {
  return new Promise(function(resolve, reject) {
    http.get(url, function(res) {
      var chunks = [];
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() { resolve({ status: res.statusCode, body: Buffer.concat(chunks) }); });
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function runConcurrentRequests() {
  await appA.ensureInitialized();
  await appB.ensureInitialized();

  var fixedNow = new Date('2025-06-15T21:00:00Z');
  appA.runtime.nowProvider = function() { return fixedNow; };
  appB.runtime.nowProvider = function() { return fixedNow; };

  _appA = appA; _appB = appB;
  var srvA = await startServer(appA.app);
  var srvB = await startServer(appB.app);
  _srvA = srvA; _srvB = srvB;
  var urlA = 'http://127.0.0.1:' + srvA.address().port;
  var urlB = 'http://127.0.0.1:' + srvB.address().port;

  t('CONCURRENT_HTTP_A', srvA.address().port > 0, 'port=' + srvA.address().port);
  t('CONCURRENT_HTTP_B', srvB.address().port > 0, 'port=' + srvB.address().port);

  // Fire concurrent requests to both instances
  var tokenA = 'env-test-token-a';
  var tokenB = 'env-test-token-b';

  var results = await Promise.all([
    httpGet(urlA + '/api/state.json'),
    httpGet(urlB + '/api/state.json'),
    httpGet(urlA + '/health/live'),
    httpGet(urlB + '/health/live'),
  ]);

  t('CONCURRENT_A_STATE', results[0].status === 200, 'status=' + results[0].status);
  t('CONCURRENT_B_STATE', results[1].status === 200, 'status=' + results[1].status);
  t('CONCURRENT_A_HEALTH', results[2].status === 200, 'status=' + results[2].status);
  t('CONCURRENT_B_HEALTH', results[3].status === 200, 'status=' + results[3].status);

  // Verify state responses have snapshot IDs
  var stA = JSON.parse(results[0].body.toString());
  var stB = JSON.parse(results[1].body.toString());
  t('CONCURRENT_A_snapshotId', typeof stA.snapshotId === 'string' && stA.snapshotId.length > 0, '');
  t('CONCURRENT_B_snapshotId', typeof stB.snapshotId === 'string' && stB.snapshotId.length > 0, '');
  // Different instances should have different snapshot IDs
  t('CONCURRENT_SNAPSHOT_ISOLATION', stA.snapshotId !== stB.snapshotId, '');

  // Env snapshot after concurrent requests
  var envAfterConcurrent = {};
  ENV_KEYS.forEach(function(k) {
    envAfterConcurrent[k] = k in process.env ? process.env[k] : undefined;
  });
  var concurrentChanged = false;
  ENV_KEYS.forEach(function(k) {
    if (envAfterConcurrent[k] !== envBefore[k]) { concurrentChanged = true; t('ENV_CONCURRENT_' + k, false, 'was=' + envBefore[k] + ' now=' + envAfterConcurrent[k]); }
  });
  if (!concurrentChanged) t('ENV_AFTER_CONCURRENT', true, 'all ' + ENV_KEYS.length + ' keys unchanged');

  // Cleanup servers
  await new Promise(function(r) { srvA.close(r); });
  await new Promise(function(r) { srvB.close(r); });
}

runConcurrentRequests().then(async function() {
  // Close AppFactory instances
  await appA.close();
  await appB.close();

  // Final env snapshot
  var envAfterClose = {};
  ENV_KEYS.forEach(function(k) {
    envAfterClose[k] = k in process.env ? process.env[k] : undefined;
  });
  var closeChanged = false;
  ENV_KEYS.forEach(function(k) {
    if (envAfterClose[k] !== envBefore[k]) { closeChanged = true; t('ENV_CLOSE_' + k, false, 'was=' + envBefore[k] + ' now=' + envAfterClose[k]); }
  });
  if (!closeChanged) t('ENV_AFTER_CLOSE', true, 'all ' + ENV_KEYS.length + ' keys unchanged');

  // Verify every key specifically
  ENV_KEYS.forEach(function(k) {
    var expected = envBefore[k];
    var actual = envAfterClose[k];
    t('ENV_KV_' + k, expected === actual, 'expected=' + expected + ' actual=' + actual);
  });

  // Restore original env
  ENV_KEYS.forEach(function(k) {
    if (envWasUndefined[k]) {
      delete process.env[k];
    } else {
      process.env[k] = envOrig[k];
    }
  });

  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}).catch(function(err) {
  console.log('AppFactory env test error: ' + err.message);
  // Close running servers and apps before restore
  function closeAll() {
    var tasks = [];
    if (_srvA) { try { tasks.push(new Promise(function(r) { _srvA.close(r); })); } catch(e) {} }
    if (_srvB) { try { tasks.push(new Promise(function(r) { _srvB.close(r); })); } catch(e) {} }
    if (_appA && typeof _appA.close === 'function') { try { tasks.push(_appA.close()); } catch(e) {} }
    if (_appB && typeof _appB.close === 'function') { try { tasks.push(_appB.close()); } catch(e) {} }
    return Promise.all(tasks);
  }
  closeAll().then(function() {
    // Restore original env
    ENV_KEYS.forEach(function(k) {
      if (envWasUndefined[k]) delete process.env[k];
      else process.env[k] = envOrig[k];
    });
    console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(1);
  }).catch(function() {
    // Even if close fails, still restore env and exit
    ENV_KEYS.forEach(function(k) {
      if (envWasUndefined[k]) delete process.env[k];
      else process.env[k] = envOrig[k];
    });
    console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
    process.exit(1);
  });
});
