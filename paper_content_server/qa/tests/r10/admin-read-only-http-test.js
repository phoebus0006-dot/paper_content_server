#!/usr/bin/env node
var path = require('path');
var fs = require('fs');
var os = require('os');
var http = require('http');
var ROOT = path.join(__dirname, '..', '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

var tmp = path.join(os.tmpdir(), 'r10_http_' + Date.now());
fs.mkdirSync(tmp, { recursive: true });
var dataDir = path.join(tmp, 'data');
fs.mkdirSync(dataDir);
var snapDir = path.join(dataDir, 'snapshots');
var pubDir = path.join(dataDir, 'publication');
fs.mkdirSync(snapDir);
fs.mkdirSync(pubDir);
process.env.ADMIN_TOKEN = 'test-admin-token-12345';
process.env.DATA_DIR = dataDir;

var serverMod = require(path.join(ROOT, 'server.js'));
var PORT = 29876 + Math.floor(Math.random() * 1000);

// Build minimal server
var R3_SnapshotStore = require(path.join(ROOT, 'src', 'snapshot', 'snapshot-store')).SnapshotStore;
var R3_SnapshotCache = require(path.join(ROOT, 'src', 'snapshot', 'snapshot-cache')).SnapshotCache;
var R3_PinStore = require(path.join(ROOT, 'src', 'snapshot', 'pin-store')).PinStore;
var R3_PublicationLock = require(path.join(ROOT, 'src', 'publication', 'publication-lock')).PublicationLock;
var R3_PublicationHistory = require(path.join(ROOT, 'src', 'publication', 'publication-history')).PublicationHistory;
var R3_PublicationService = require(path.join(ROOT, 'src', 'publication', 'publication-service')).PublicationService;
var R3_NoopNotificationPort = require(path.join(ROOT, 'src', 'publication', 'notification-port')).NoopNotificationPort;
var R3_OperatingModeService = require(path.join(ROOT, 'src', 'publication', 'operating-mode-service')).OperatingModeService;
var lg = { info: function() {}, warn: function() {}, error: function() {} };

var snapshotStore = R3_SnapshotStore(snapDir, pubDir, lg);
var snapshotCache = R3_SnapshotCache();
var pinStore = R3_PinStore({ nowMs: function() { return Date.now(); } });
var publicationLock = R3_PublicationLock();
var operatingModeService = R3_OperatingModeService();
var publicationHistory = R3_PublicationHistory(path.join(pubDir, 'history.json'), lg);
var notificationPort = R3_NoopNotificationPort();
var pubService = R3_PublicationService(snapshotStore, snapshotCache, pinStore, publicationLock, notificationPort, operatingModeService, publicationHistory, lg);
var AQS = require(path.join(ROOT, 'src', 'admin', 'admin-query-service')).createAdminQueryService;

var adminQueryService = AQS(snapshotStore, publicationHistory, null, null, lg);

snapshotStore.ensureDirs().then(function() {
  var frame = Buffer.alloc(192010, 0x11);
  frame.write('EPF1', 0, 4, 'ascii');
  frame.writeUInt16LE(800, 4);
  frame.writeUInt16LE(480, 6);
  frame.writeUInt8(49, 8);
  frame.writeUInt8(1, 9);
  var snap = require(path.join(ROOT, 'src', 'snapshot', 'snapshot-model')).createSnapshot(
    'test:admin', { frameId: 'test:admin', mode: 'news', slotKey: 'test' }, frame, 'news'
  );
  return pubService.publish(snap);
}).then(function() {
  var server = http.createServer(function(req, res) {
    // All admin API routes require auth
    var authHdr = req.headers['authorization'] || '';
    var authed = authHdr === 'Bearer test-admin-token-12345';
    if (req.url.startsWith('/admin/api/') && !authed) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }
    if (req.url === '/admin/api/system/status') {
      adminQueryService.getSystemStatus().then(function(status) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(status));
      });
      return;
    }
    if (req.url === '/admin/api/publications') {
      adminQueryService.listPublications().then(function(pubs) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(pubs));
      });
      return;
    }
    if (req.url.startsWith('/admin/api/features')) {
      var flags = require(path.join(ROOT, 'src', 'admin', 'feature-flag-view')).getFeatureFlags();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(flags));
      return;
    }
    if (req.url.startsWith('/admin/api/')) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
      return;
    }
    res.writeHead(404);
    res.end('');
  });

  server.listen(PORT, function() {
    // Run tests
    var testsRun = 0;
    function get(path, token) {
      return new Promise(function(resolve, reject) {
        var opts = { hostname: 'localhost', port: PORT, path: path, headers: {} };
        if (token) opts.headers['authorization'] = 'Bearer ' + token;
        http.get(opts, function(res) {
          var body = [];
          res.on('data', function(c) { body.push(c); });
          res.on('end', function() { resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(body).toString() }); });
        }).on('error', reject);
      });
    }

    async function runTests() {
      // 200 with auth
      var r1 = await get('/admin/api/system/status', 'test-admin-token-12345');
      t('STATUS_200', r1.status === 200, 'status=' + r1.status);
      var body1 = JSON.parse(r1.body);
      t('STATUS_HAS_SNAPSHOT', !!body1.activeSnapshotId, '');

      var r2 = await get('/admin/api/publications', 'test-admin-token-12345');
      t('PUBLICATIONS_200', r2.status === 200, 'status=' + r2.status);

      var r3 = await get('/admin/api/features', 'test-admin-token-12345');
      t('FEATURES_200', r3.status === 200, 'status=' + r3.status);
      var flags = JSON.parse(r3.body);
      t('FEATURE_FLAGS_NEWS', !!flags.newsPipeline, '');
      t('FEATURE_FLAGS_HAS_ACTIVE_FRAME_ID', flags.hasOwnProperty('activeFrameId'), '');

      // No auth returns 401
      var r4 = await get('/admin/api/system/status', '');
      t('NO_AUTH_401', r4.status === 401, 'status=' + r4.status);
      var r4b = await get('/admin/api/system/status', 'wrong-token');
      t('WRONG_TOKEN_401', r4b.status === 401, 'status=' + r4b.status);

      // 404 for non-existent routes
      var r5 = await get('/admin/api/nonexistent', 'test-admin-token-12345');
      t('UNKNOWN_ROUTE_404', r5.status === 404, 'status=' + r5.status);

      // Secret redaction
      var bodyStr = JSON.stringify(body1).toLowerCase();
      t('NO_SECRETS_IN_RESPONSE', bodyStr.indexOf('admin_token') === -1 && bodyStr.indexOf('api_key') === -1, '');

      server.close(function() {
        try { fs.rmdirSync(tmp, { recursive: true }); } catch(e) {}
        console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
        process.exit(ec);
      });
    }
    runTests().catch(function(e) { console.log('CRASH: ' + e.message); process.exit(1); });
  });
}).catch(function(e) { console.log('CRASH: ' + e.message); process.exit(1); });
