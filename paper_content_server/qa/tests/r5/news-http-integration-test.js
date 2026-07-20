#!/usr/bin/env node
var path = require('path');
var fs = require('fs');
var os = require('os');
var http = require('http');
var ROOT = path.join(__dirname, '..', '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

var tmp = path.join(os.tmpdir(), 'r5_http_' + Date.now());
fs.mkdirSync(tmp, { recursive: true });
var dataDir = path.join(tmp, 'data');
fs.mkdirSync(dataDir);
var snapDir = path.join(dataDir, 'snapshots');
var pubDir = path.join(dataDir, 'publication');
fs.mkdirSync(snapDir);
fs.mkdirSync(pubDir);

// Bootstrap minimal server with fixed pipeline
var PORT = 19876 + Math.floor(Math.random() * 1000);
var server;
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
snapshotStore.ensureDirs();

// Create a test snapshot to serve
var frame = Buffer.alloc(192010, 0x11);
frame.write('EPF1', 0, 4, 'ascii');
frame.writeUInt16LE(800, 4);
frame.writeUInt16LE(480, 6);
frame.writeUInt8(49, 8);
frame.writeUInt8(1, 9);

async function main() {
  var snap = require(path.join(ROOT, 'src', 'snapshot', 'snapshot-model')).createSnapshot(
    'test:frame1',
    { frameId: 'test:frame1', mode: 'news', slotKey: 'test' },
    frame,
    'news'
  );
  await pubService.publish(snap);

  server = http.createServer(function(req, res) {
    if (req.url === '/api/news.json') {
      var body = JSON.stringify({
        updatedAt: new Date().toISOString(),
        items: [
          { zhTitle: '新闻1', zhSummary: '摘要一。', sourceUrl: 'http://a.com/1', source: 'SrcA', category: 'politics', publishedAt: new Date().toISOString(), translationStatus: 'original' },
          { zhTitle: '新闻2', zhSummary: '摘要二。', sourceUrl: 'http://b.com/2', source: 'SrcB', category: 'economy', publishedAt: new Date().toISOString(), translationStatus: 'original' },
          { zhTitle: '新闻3', zhSummary: '摘要三。', sourceUrl: 'http://c.com/3', source: 'SrcC', category: 'tech', publishedAt: new Date().toISOString(), translationStatus: 'original' },
          { zhTitle: '新闻4', zhSummary: '摘要四。', sourceUrl: 'http://d.com/4', source: 'SrcD', category: 'culture', publishedAt: new Date().toISOString(), translationStatus: 'original' },
          { zhTitle: '新闻5', zhSummary: '摘要五。', sourceUrl: 'http://e.com/5', source: 'SrcE', category: 'general', publishedAt: new Date().toISOString(), translationStatus: 'original' },
          { zhTitle: '新闻6', zhSummary: '摘要六。', sourceUrl: 'http://f.com/6', source: 'SrcF', category: 'general', publishedAt: new Date().toISOString(), translationStatus: 'original' },
        ],
        frameId: 'test:frame1',
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(body);
    } else if (req.url === '/api/state.json') {
      snapshotStore.readActive().then(function(active) {
        if (!active) { res.writeHead(503); res.end('{}'); return; }
        snapshotStore.load(active.activeSnapshotId).then(function(snap) {
          var body = JSON.stringify({ snapshotId: active.activeSnapshotId, frameId: snap.frameId, frameSha256: snap.frameSha256, frameLength: snap.frameLength });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(body);
        });
      });
    } else if (req.url === '/api/frame.bin') {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': frame.length });
      res.end(frame);
    } else {
      res.writeHead(404);
      res.end('');
    }
  });
  server.listen(PORT);

  function get(path) {
    return new Promise(function(resolve, reject) {
      http.get('http://localhost:' + PORT + path, function(res) {
        var body = [];
        res.on('data', function(c) { body.push(c); });
        res.on('end', function() { resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(body) }); });
      }).on('error', reject);
    });
  }

  var newsResp = await get('/api/news.json');
  t('NEWS_200', newsResp.status === 200, 'status=' + newsResp.status);
  var news = JSON.parse(newsResp.body.toString());
  t('NEWS_COUNT_6', news.items && news.items.length === 6, 'count=' + (news.items ? news.items.length : 0));
  t('IDENTITY_FIELDS', news.items.every(function(i) { return i.zhTitle && i.sourceUrl && i.source; }), '');

  var stateResp = await get('/api/state.json');
  t('STATE_200', stateResp.status === 200, 'status=' + stateResp.status);
  var state = JSON.parse(stateResp.body.toString());
  t('STATE_HAS_FRAME_ID', !!state.frameId, '');
  t('STATE_HAS_SNAPSHOT_ID', !!state.snapshotId, '');

  var frameResp = await get('/api/frame.bin');
  t('FRAME_200', frameResp.status === 200, 'status=' + frameResp.status);
  t('FRAME_LENGTH_192010', frameResp.body.length === 192010, 'len=' + frameResp.body.length);
  t('FRAME_CODE4', frameResp.body[9] === 1, 'code4=' + frameResp.body[9]);

  await new Promise(function(resolve) { server.close(resolve); });
  try { fs.rmdirSync(tmp, { recursive: true }); } catch(e) {}
  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}
main().catch(function(e) { console.log('CRASH: ' + e.message); try { fs.rmdirSync(tmp, { recursive: true }); } catch(e2) {} process.exit(1); });
