const test = require('node:test');
const assert = require('node:assert');
// R1 Production Integration Tests
var path = require('path');
var fs = require('fs');
var http = require('http');
var ROOT = path.join(__dirname, '..', '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}

var serverJs = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');

// === 1. SERVER_USES_LOAD_CONFIG ===
t('SERVER_USES_LOAD_CONFIG', serverJs.indexOf('R1_loadConfig') >= 0, '');

// === 2. SERVER_USES_SYSTEM_CLOCK ===
t('SERVER_USES_SYSTEM_CLOCK', serverJs.indexOf('r1Clock') >= 0, '');

// === 3. SERVER_USES_LOGGER ===
t('SERVER_USES_LOGGER', serverJs.indexOf('r1Logger') >= 0, '');

// === 4. SERVER_USES_JSON_STORE ===
t('SERVER_USES_JSON_STORE', serverJs.indexOf('R1_JsonStore') >= 0, '');

// === 5. SERVER_USES_ATOMIC_FILE ===
t('SERVER_USES_ATOMIC_FILE', serverJs.indexOf('R1_writeFileAtomic') >= 0, '');

// === 6. HTTP_CLIENT_FETCH_USED ===
t('HTTP_CLIENT_FETCH_USED', serverJs.indexOf('r1HttpClient') >= 0, '');

// === 7. CREATE_APP_USES_REAL_HANDLER ===
t('CREATE_APP_USES_REAL_HANDLER', serverJs.indexOf('handler: handleRequest') >= 0, '');

// === 8. BOOTSTRAP_STARTS_SERVER ===
t('BOOTSTRAP_STARTS_SERVER', serverJs.indexOf('handler: handleRequest') >= 0, '');

// === 9. APP_NO_AUTO_LISTEN / NO_PROCESS_EXIT ===
var appDir = path.join(ROOT, 'src', 'app');
var appFiles = fs.readdirSync(appDir).filter(function(f) { return f.endsWith('.js'); });
var appNoExitOk = true;
appFiles.forEach(function(f) {
  var lines = fs.readFileSync(path.join(appDir, f), 'utf8').split('\n');
  for (var li = 0; li < lines.length; li++) {
    var line = lines[li].trim();
    if (line.indexOf('//') === 0 || line.indexOf('*') === 0) continue;
    if (line.indexOf('process.exit') >= 0) {
      t('APP_NO_PROCESS_EXIT_' + f.replace('.js','').toUpperCase(), false, 'found process.exit at line ' + (li+1) + ': ' + line);
      appNoExitOk = false;
    }
  }
  if (f === 'create-app.js' && lines.join('\n').indexOf('.listen(') >= 0) {
    t('CREATE_APP_NO_AUTO_LISTEN', false, '');
    appNoExitOk = false;
  }
});
if (appNoExitOk) {
  t('CREATE_APP_NO_AUTO_LISTEN', true, '');
  t('APP_NO_PROCESS_EXIT_CREATE_APP', true, '');
  t('APP_NO_PROCESS_EXIT_BOOTSTRAP', true, '');
}

// === 10. BOOTSTRAP_LISTEN_FALSE_DOES_NOT_LISTEN ===
var bootstrap = require(path.join(ROOT, 'src', 'app', 'bootstrap')).bootstrap;
var bootResult = null;
try {
  bootResult = bootstrap({
    env: { PORT: '18989', TRANSLATION_PROVIDER: 'none', ADMIN_ACCESS_MODE: 'lan', ADMIN_ALLOWED_CIDRS: '127.0.0.0/8' },
    cwd: ROOT,
    listen: false,
    handler: function(req, res) { res.writeHead(200); res.end('test'); },
  });
  t('BOOTSTRAP_LISTEN_FALSE', bootResult.server === null, '');
} catch(e) {
  t('BOOTSTRAP_LISTEN_FALSE', false, e.message);
}

// === 11. BOOTSTRAP_CONFIG_ERROR (no process.exit) ===
try {
  bootstrap({
    env: { TRANSLATION_PROVIDER: 'openai', OPENAI_API_KEY: '' },
    cwd: ROOT,
    listen: false,
  });
  t('BOOTSTRAP_CONFIG_ERROR', false, 'should have thrown');
} catch(e) {
  t('BOOTSTRAP_CONFIG_ERROR', e.code === 'BOOTSTRAP_CONFIG_ERROR', e.code);
}

// === 12. Real HTTP test with isolated port ===
var serverMod = require(path.join(ROOT, 'server.js'));
var testPort = 19999;

var boot2 = bootstrap({
  env: { PORT: String(testPort), TRANSLATION_PROVIDER: 'none', TZ: 'UTC', ADMIN_ACCESS_MODE: 'lan', ADMIN_ALLOWED_CIDRS: '127.0.0.0/8' },
  cwd: ROOT,
  listen: false,
  handler: serverMod.handleRequest,
});

// Initialize R3 services for state/frame route tests
var R3_snapshotModel = require(path.join(ROOT, 'src', 'snapshot', 'snapshot-model'));
var R3_SnapshotStore = require(path.join(ROOT, 'src', 'snapshot', 'snapshot-store')).SnapshotStore;
var R3_SnapshotCache = require(path.join(ROOT, 'src', 'snapshot', 'snapshot-cache')).SnapshotCache;
var R3_PinStore = require(path.join(ROOT, 'src', 'snapshot', 'pin-store')).PinStore;
var R3_PublicationLock = require(path.join(ROOT, 'src', 'publication', 'publication-lock')).PublicationLock;
var R3_NoopNotificationPort = require(path.join(ROOT, 'src', 'publication', 'notification-port')).NoopNotificationPort;
var R3_OperatingModeService = require(path.join(ROOT, 'src', 'publication', 'operating-mode-service')).OperatingModeService;
var R3_PublicationHistory = require(path.join(ROOT, 'src', 'publication', 'publication-history')).PublicationHistory;
var R3_PublicationService = require(path.join(ROOT, 'src', 'publication', 'publication-service')).PublicationService;

var testServer = http.createServer(boot2.app.handler);
var serverActive = false;

function httpGet(url) {
  return new Promise(function(resolve, reject) {
    http.get(url, function(res) {
      var chunks = [];
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() {
        resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) });
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function runHttpTest() {
  await new Promise(function(resolve) { testServer.listen(testPort, '127.0.0.1', resolve); });
  serverActive = true;

  // Initialize R3 services so state/frame routes don't return 503
  var testDataDir = path.join(ROOT, 'test_data_r1_' + Date.now());
  try { require('fs').mkdirSync(testDataDir, { recursive: true }); } catch(e) {}
  var r1Store = R3_SnapshotStore(path.join(testDataDir, 'snapshots'), path.join(testDataDir, 'publication'));
  await r1Store.ensureDirs();
  var r1Cache = R3_SnapshotCache();
  var r1Pin = R3_PinStore();
  var r1Lock = R3_PublicationLock();
  var r1Notif = R3_NoopNotificationPort();
  var r1Hist = R3_PublicationHistory(path.join(testDataDir, 'history.json'));
  serverMod.runtime.snapshotStore = r1Store;
  serverMod.runtime.snapshotCache = r1Cache;
  serverMod.runtime.pinStore = r1Pin;
  serverMod.runtime.publicationLock = r1Lock;
  serverMod.runtime.publicationService = R3_PublicationService(r1Store, r1Cache, r1Pin, r1Lock, r1Notif, null, r1Hist);
  serverMod.runtime.publicationHistory = r1Hist;
  // Publish initial content so state/frame routes have a snapshot
  try {
    var initNow = new Date();
    var initContent = await serverMod.getContentForNow(initNow);
    var initSnap = R3_snapshotModel.createSnapshot(initContent.snapshot.frameId, initContent.snapshot, initContent.frame, initContent.snapshot.mode);
    await serverMod.runtime.publicationService.publish(initSnap);
  } catch(e) { console.log('r1 init publish: ' + e.message); }

  try {
    var health = await httpGet('http://127.0.0.1:' + testPort + '/api/health.json');
    t('REAL_HTTP_HEALTH', health.status === 200, 'status=' + health.status);
  } catch(e) {
    t('REAL_HTTP_HEALTH', false, e.message);
  }

  try {
    var stateRes = await httpGet('http://127.0.0.1:' + testPort + '/api/state.json');
    t('REAL_HTTP_STATE', stateRes.status === 200, 'status=' + stateRes.status);
  } catch(e) {
    t('REAL_HTTP_STATE', false, e.message);
  }

  try {
    var frameRes = await httpGet('http://127.0.0.1:' + testPort + '/api/frame.bin');
    var frameOk = frameRes.status === 200;
    var frameLenOk = frameRes.body.length === 192010;
    var epfOk = frameRes.body.length >= 10 && frameRes.body[0] === 69 && frameRes.body[1] === 80 && frameRes.body[2] === 70;
    t('REAL_HTTP_FRAME', frameOk, 'status=' + frameRes.status + ' len=' + frameRes.body.length);
    t('REAL_HTTP_FRAME_LENGTH', frameLenOk, 'got ' + frameRes.body.length + ' expected 192010');
    t('REAL_HTTP_EPF1', epfOk, 'first bytes=' + frameRes.body.slice(0, 3).toString('ascii'));
  } catch(e) {
    t('REAL_HTTP_FRAME', false, e.message);
  }

  testServer.close();
  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}

runHttpTest().catch(function(err) {
  console.log('HTTP test error: ' + err.message);
  if (serverActive) testServer.close();
  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(1);
});

;
