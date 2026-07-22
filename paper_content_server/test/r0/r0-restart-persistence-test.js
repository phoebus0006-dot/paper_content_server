#!/usr/bin/env node
var fs = require('fs');
var path = require('path');
var http = require('http');
var cp = require('child_process');
var os = require('os');
var net = require('net');
var crypto = require('crypto');
var ROOT = path.join(__dirname, '..', '..');

var dataDir = null;
var inst1 = null;
var inst2 = null;

var pass = 0, fail = 0, ec = 0;
function t(name, ok, detail) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ': ' + detail : ''));
  if (ok) pass++; else { fail++; ec = 1; }
}

function findFreePort() {
  return new Promise(function(resolve, reject) {
    var s = net.createServer();
    s.listen(0, '127.0.0.1', function() {
      var port = s.address().port;
      s.close(function() { resolve(port); });
    });
    s.on('error', reject);
  });
}

function makeTmpDir() {
  var d = path.join(os.tmpdir(), 'r0_restart_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6));
  fs.mkdirSync(d, { recursive: true });
  fs.mkdirSync(path.join(d, 'images'), { recursive: true });
  fs.writeFileSync(path.join(d, 'feeds.json'), '[]', 'utf8');
  fs.writeFileSync(path.join(d, 'config.json'), '{}', 'utf8');
  return d;
}

function captureTrackedHashes() {
  var result = {};
  try {
    var files = cp.execSync('git ls-files data/', {cwd: ROOT, encoding: 'utf8', stdio: ['pipe','pipe','ignore']}).trim().split('\n').filter(Boolean);
    files.forEach(function(f) {
      var fp = path.join(ROOT, f);
      try {
        var buf = fs.readFileSync(fp);
        result[f] = crypto.createHash('sha256').update(buf).digest('hex');
      } catch(e) { result[f] = null; }
    });
  } catch(e) {}
  return result;
}

function compareHashes(before, after) {
  var changed = [];
  Object.keys(after).forEach(function(f) {
    if (before[f] !== after[f]) changed.push(f);
  });
  return changed;
}

function waitForSrv(baseUrl, timeout) {
  var deadline = Date.now() + timeout;
  return new Promise(function(resolve, reject) {
    function poll() {
      if (Date.now() > deadline) return reject(new Error('server did not start'));
      var req = http.get(baseUrl + '/api/state.json', function (res) {
        if (res.statusCode === 200) { res.resume(); return resolve(); }
        res.resume(); setTimeout(poll, 200);
      });
      req.on('error', function () { setTimeout(poll, 200); });
      req.end();
    }
    poll();
  });
}

function spawnSrv(tmpDir, port) {
  var env = {
    PORT: String(port),
    DATA_DIR: tmpDir,
    IMAGE_ROOT: path.join(tmpDir, 'images'),
    FEEDS_FILE: path.join(tmpDir, 'feeds.json'),
    NEWS_CACHE_FILE: path.join(tmpDir, 'news_cache.json'),
    LIBRARY_STATE_FILE: path.join(tmpDir, 'library_state.json'),
    NEWS_ROTATION_FILE: path.join(tmpDir, 'news_rotation.json'),
    IMAGE_INDEX_FILE: path.join(tmpDir, 'image_index.json'),
    LAST_GOOD_NEWS_FILE: path.join(tmpDir, 'last_good_news.json'),
    CONFIG_FILE: path.join(tmpDir, 'config.json'),
    ADMIN_ACCESS_MODE: 'token',
    ADMIN_TOKEN: 'test-token-123',
    TRANSLATION_PROVIDER: 'none',
    TZ: 'UTC',
  };
  var child = cp.spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT,
    env: env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', function () {});
  var base = 'http://127.0.0.1:' + port;
  return { child: child, port: port, base: base, dataDir: tmpDir };
}

function stopSrv(inst) {
  return new Promise(function (resolve) {
    if (!inst || !inst.child) return resolve();
    var t = setTimeout(function () { try { inst.child.kill('SIGKILL'); } catch (e) {} resolve(); }, 4000);
    inst.child.on('exit', function () { clearTimeout(t); resolve(); });
    try { inst.child.kill('SIGTERM'); } catch (e) { clearTimeout(t); resolve(); }
  });
}

function request(method, baseUrl, reqPath, body, headers) {
  return new Promise(function (resolve, reject) {
    var url = new URL(baseUrl);
    var opts = {
      method: method,
      hostname: '127.0.0.1',
      port: url.port,
      path: reqPath,
      headers: Object.assign({}, headers || {}),
    };
    var r = http.request(opts, function (res) {
      var data = [];
      res.on('data', function (c) { data.push(c); });
      res.on('end', function () {
        var buf = Buffer.concat(data);
        var parsed = null;
        try { parsed = JSON.parse(buf.toString('utf8')); } catch (e) {}
        resolve({ status: res.statusCode, body: parsed || buf.toString('utf8'), raw: buf, headers: res.headers });
      });
    });
    r.on('error', reject);
    if (body !== undefined && body !== null) {
      var bodyStr = JSON.stringify(body);
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(bodyStr);
      r.write(bodyStr);
    }
    r.end();
  });
}

function makeDraftItems() {
  var items = [];
  for (var i = 1; i <= 6; i++) {
    items.push({
      source: 'Test',
      category: i <= 2 ? 'politics' : (i <= 4 ? 'technology' : 'general'),
      title: '测试新闻标题 ' + i,
      summary: '这是一条测试新闻摘要 ' + i + '，包含足够的中文内容以通过验证。',
      url: 'http://example.com/test/' + i + '?t=' + Date.now(),
      publishedAt: new Date(Date.now() - i * 60000).toISOString(),
    });
  }
  return { items: items };
}

var AUTH = { 'Authorization': 'Bearer test-token-123' };
var WRITE_HEADERS = {
  'Authorization': 'Bearer test-token-123',
  'Origin': '',
  'Referer': '',
  'Content-Type': 'application/json',
};

console.log('=== R0 Restart Persistence Test ===');

async function main() {
  dataDir = makeTmpDir();
  var port = await findFreePort();
  var beforeHashes = captureTrackedHashes();

  WRITE_HEADERS['Origin'] = 'http://127.0.0.1:' + port;
  WRITE_HEADERS['Referer'] = 'http://127.0.0.1:' + port + '/admin/';

  inst1 = null; inst2 = null;
  var publishedFrameId = null, publishedSnapshotId = null, publishedFrameSha256 = null;
  var frame1Buffer = null, frame1XFrameId = null;

  try {
    // --- First boot ---
    inst1 = spawnSrv(dataDir, port);
    try {
      await waitForSrv(inst1.base, 15000);
    } catch (e) {
      t('R0_SRV1_START', false, 'server 1 failed to start');
      await stopSrv(inst1); inst1 = null;
      return;
    }

    // Fetch initial state
    var stateBefore = await request('GET', inst1.base, '/api/state.json', null, AUTH);
    t('R0_17_INITIAL_STATE', stateBefore.status === 200, 'status=' + stateBefore.status);

    // Create draft
    var draftItems = makeDraftItems();
    var draftResp = await request('POST', inst1.base, '/api/admin/news/draft', draftItems, WRITE_HEADERS);
    t('R0_18_DRAFT_CREATED', draftResp.status === 200, 'status=' + draftResp.status +
      ' count=' + (draftResp.body && draftResp.body.count));

    if (draftResp.status !== 200) {
      t('R0_19_DRAFT_APPROVED', false, 'draft failed');
      t('R0_20_NEWS_PUBLISHED', false, 'draft failed');
      t('R0_21_LEGACY_ADMIN_OVERRIDE', false, 'draft failed');
      t('R0_22_FRAMEID_MATCHES_PUBLISHED', false, 'draft failed');
      t('R0_23_STATE_HAS_SNAPSHOT_ID', false, 'draft failed');
      t('R0_24_FRAME_EPF1_192010', false, 'draft failed');
      t('R0_25_RESTART_STATE_PRESERVED', false, 'draft failed');
      t('R0_26_RESTART_FRAME_VALID', false, 'draft failed');
      t('R0_27_OVERRIDE_DELETED', false, 'draft failed');
      t('R0_28_AUTO_RESTORED', false, 'draft failed');
      return;
    }

    // Approve all
    var approveResp = await request('POST', inst1.base, '/api/admin/news/draft/approve-all', {}, WRITE_HEADERS);
    t('R0_19_DRAFT_APPROVED', approveResp.status === 200, 'status=' + approveResp.status +
      ' approved=' + (approveResp.body && approveResp.body.approved));

    if (approveResp.status !== 200) {
      t('R0_20_NEWS_PUBLISHED', false, 'approve failed');
      t('R0_21_LEGACY_ADMIN_OVERRIDE', false, 'approve failed');
      t('R0_22_FRAMEID_MATCHES_PUBLISHED', false, 'approve failed');
      t('R0_23_STATE_HAS_SNAPSHOT_ID', false, 'approve failed');
      t('R0_24_FRAME_EPF1_192010', false, 'approve failed');
      t('R0_25_RESTART_STATE_PRESERVED', false, 'approve failed');
      t('R0_26_RESTART_FRAME_VALID', false, 'approve failed');
      t('R0_27_OVERRIDE_DELETED', false, 'approve failed');
      t('R0_28_AUTO_RESTORED', false, 'approve failed');
      return;
    }

    // Publish news
    var pubResp = await request('POST', inst1.base, '/api/admin/publish/news', {}, WRITE_HEADERS);
    t('R0_20_NEWS_PUBLISHED', pubResp.status === 200, 'status=' + pubResp.status +
      (pubResp.body && pubResp.body.frameId ? ' frameId=' + pubResp.body.frameId : ''));

    if (pubResp.status !== 200) {
      t('R0_21_LEGACY_ADMIN_OVERRIDE', false, 'publish failed: ' + JSON.stringify(pubResp.body));
      t('R0_22_FRAMEID_MATCHES_PUBLISHED', false, 'publish failed');
      t('R0_23_STATE_HAS_SNAPSHOT_ID', false, 'publish failed');
      t('R0_24_FRAME_EPF1_192010', false, 'publish failed');
      t('R0_25_RESTART_STATE_PRESERVED', false, 'publish failed');
      t('R0_26_RESTART_FRAME_VALID', false, 'publish failed');
      t('R0_27_OVERRIDE_DELETED', false, 'publish failed');
      t('R0_28_AUTO_RESTORED', false, 'publish failed');
      return;
    }

    var pubBody = pubResp.body;
    publishedFrameId = pubBody.frameId;
    publishedSnapshotId = pubBody.snapshotId;
    publishedFrameSha256 = pubBody.frameSha256;
    t('R0_20B_PUBLISH_HAS_FRAME_ID', !!publishedFrameId, 'frameId=' + publishedFrameId);
    t('R0_20C_PUBLISH_HAS_SNAPSHOT_ID', !!publishedSnapshotId, 'snapshotId=' + publishedSnapshotId);
    t('R0_20D_PUBLISH_HAS_FRAME_SHA256', !!publishedFrameSha256, 'frameSha256=' + publishedFrameSha256);

    // Verify operatingMode = LEGACY_ADMIN_OVERRIDE
    var stateAfter = await request('GET', inst1.base, '/api/state.json', null, AUTH);
    var stateAfterOk = stateAfter.status === 200 && typeof stateAfter.body === 'object' &&
      stateAfter.body.operatingMode === 'LEGACY_ADMIN_OVERRIDE';
    t('R0_21_LEGACY_ADMIN_OVERRIDE', stateAfterOk, 'status=' + stateAfter.status +
      ' mode=' + (stateAfter.body && stateAfter.body.operatingMode));

    // Verify frameId matches published frame
    var frameIdMatch = stateAfter.body && stateAfter.body.frameId &&
      stateAfter.body.frameId === publishedFrameId;
    t('R0_22_FRAMEID_MATCHES_PUBLISHED', frameIdMatch, 'state.frameId=' +
      (stateAfter.body && stateAfter.body.frameId) + ' published=' + publishedFrameId);

    // Verify snapshotId in state
    t('R0_23_STATE_HAS_SNAPSHOT_ID', !!(stateAfter.body && stateAfter.body.snapshotId),
      'snapshotId=' + (stateAfter.body ? stateAfter.body.snapshotId : ''));

    // Get frame.bin and verify EPF1
    var frameAfter = await request('GET', inst1.base, '/api/frame.bin');
    var frameOk = frameAfter.status === 200 && Buffer.isBuffer(frameAfter.raw) &&
      frameAfter.raw.length === 192010 &&
      frameAfter.raw.slice(0, 4).toString('ascii') === 'EPF1';
    t('R0_24_FRAME_EPF1_192010', frameOk,
      'status=' + frameAfter.status + ' len=' + (frameAfter.raw ? frameAfter.raw.length : '?') +
      ' magic=' + (frameAfter.raw ? frameAfter.raw.slice(0, 4).toString('ascii') : '?'));

    // Save frame1 data for restart comparison
    frame1Buffer = frameAfter.raw;
    frame1XFrameId = frameAfter.headers['x-frame-id'];

    // SIGTERM first server
    await stopSrv(inst1);
    inst1 = null;

    // --- Second boot (restart) with same data dir ---
    inst2 = spawnSrv(dataDir, port);
    try {
      await waitForSrv(inst2.base, 15000);
    } catch (er) {
      t('R0_SRV2_START', false, 'server 2 (restart) failed to start');
      await stopSrv(inst2); inst2 = null;
      return;
    }

    // Verify state preserved after restart
    var stateRestart = await request('GET', inst2.base, '/api/state.json', null, AUTH);
    var restartOk = stateRestart.status === 200 && typeof stateRestart.body === 'object' &&
      stateRestart.body.operatingMode === 'LEGACY_ADMIN_OVERRIDE' &&
      stateRestart.body.frameId === publishedFrameId &&
      stateRestart.body.snapshotId === publishedSnapshotId;
    t('R0_25_RESTART_STATE_PRESERVED', restartOk,
      'mode=' + (stateRestart.body && stateRestart.body.operatingMode) +
      ' frameId=' + (stateRestart.body && stateRestart.body.frameId) +
      ' snapshotId=' + (stateRestart.body && stateRestart.body.snapshotId) +
      ' expected.frameId=' + publishedFrameId +
      ' expected.snapshotId=' + publishedSnapshotId);

    // Verify frame still valid after restart
    var frameRestart = await request('GET', inst2.base, '/api/frame.bin');
    var frameRestartOk = frameRestart.status === 200 && Buffer.isBuffer(frameRestart.raw) &&
      frameRestart.raw.length === 192010 &&
      frameRestart.raw.slice(0, 4).toString('ascii') === 'EPF1';
    t('R0_26_RESTART_FRAME_VALID', frameRestartOk,
      'status=' + frameRestart.status + ' len=' + (frameRestart.raw ? frameRestart.raw.length : '?'));

    // Verify same frame bytes and X-Frame-Id after restart
    var frameBytesMatch = frameRestartOk && frame1Buffer &&
      frameRestart.raw.equals(frame1Buffer);
    t('R0_26B_RESTART_FRAME_BYTES_MATCH', frameBytesMatch, 'len=' +
      (frameRestart.raw ? frameRestart.raw.length : '?') + ' x-frame-id=' + frameRestart.headers['x-frame-id']);

    var xFrameIdMatch = frame1XFrameId && frameRestart.headers['x-frame-id'] === frame1XFrameId;
    t('R0_26C_RESTART_X_FRAME_ID_MATCH', xFrameIdMatch,
      'before=' + frame1XFrameId + ' after=' + frameRestart.headers['x-frame-id']);

    // DELETE /api/admin/override → verify AUTO restored
    var overrideResp = await request('DELETE', inst2.base, '/api/admin/override', null, { 'Authorization': 'Bearer test-token-123' });
    t('R0_27_OVERRIDE_DELETED', overrideResp.status === 200, 'status=' + overrideResp.status +
      ' body=' + (typeof overrideResp.body === 'object' ? JSON.stringify(overrideResp.body) : String(overrideResp.body).slice(0, 100)));

    var stateAuto = await request('GET', inst2.base, '/api/state.json', null, AUTH);
    var autoOk = stateAuto.status === 200 && typeof stateAuto.body === 'object' &&
      stateAuto.body.operatingMode === 'AUTO';
    t('R0_28_AUTO_RESTORED', autoOk,
      'status=' + stateAuto.status + ' mode=' + (stateAuto.body && stateAuto.body.operatingMode));

  } finally {
    if (inst1) await stopSrv(inst1);
    if (inst2) await stopSrv(inst2);
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}
  }

  var afterHashes = captureTrackedHashes();
  var changed = compareHashes(beforeHashes, afterHashes);
  t('R0_29_NO_POLLUTION', changed.length === 0, changed.length ? 'changed: ' + changed.join(',') : 'clean');

  console.log('\n=== R0 Restart Persistence: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}

main().catch(function (e) {
  console.error('ERROR:', e.message);
  if (inst1) { stopSrv(inst1).catch(function(){}); inst1 = null; }
  if (inst2) { stopSrv(inst2).catch(function(){}); inst2 = null; }
  if (dataDir) { try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (ex) {} dataDir = null; }
  console.log('\n=== R0 Restart Persistence: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(1);
});
