#!/usr/bin/env node
// v3-production-path-test.js — V3 production path integration tests
//
// Verifies the V3 integration wiring end-to-end through real HTTP:
//   1. Feature flag gating (flags off → 503 FEATURE_DISABLED)
//   2. Streaming upload (octet-stream → processUploadStream → fail-closed at classifier gate)
//   3. Atomic delete (reason enum, 400 on invalid reason, 503 when flag off)
//   4. ONE_SHOT strict asset selection (400 on missing/non-existent asset)
//   5. FOCUS_LOCK strict selection (404 on no match, no schedule fallback)
//   6. Restart persistence (override file written → loaded on restart → validated)
//   7. Three renderer EPF1 output (analysis/comparison/sequence produce 192010 frames)
//   8. CSRF / CIDR regression (admin auth still enforced)
//
// All tests use a real spawned server.js with V3 feature flags configured via env.
// The classifier has no real model (NSFW_MODEL_PATH unset), so customLibrary/learning
// are BLOCKED (fail-closed) — this is the expected V3 truth.
var http = require('http');
var crypto = require('crypto');
var { spawn } = require('child_process');
var path = require('path');
var fs = require('fs');

var ROOT = path.join(__dirname, '..', '..');
var SRV = path.join(ROOT, 'server.js');
var ec = 0, pass = 0, fail = 0;
var TOKEN = 'v3-test-token-' + crypto.randomBytes(4).toString('hex');

function t(n, ok, d) {
  console.log((ok ? 'PASS ' : 'FAIL ') + n + (d ? ': ' + d : ''));
  if (ok) pass++; else { ec = 1; fail++; }
}

function makeTmpDir(label) {
  var d = path.join(ROOT, 'test_v3_' + label + '_' + Date.now().toString(36));
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function makeEnv(dataDir, extra) {
  return Object.assign({}, process.env, {
    TZ: 'Europe/Paris',
    TRANSLATION_PROVIDER: 'none',
    PHOTO_QUANT_MODE: 'clean',
    ENABLE_DEBUG_ROUTES: 'true',
    ADMIN_ACCESS_MODE: 'token',
    ADMIN_TOKEN: TOKEN,
    DATA_DIR: dataDir,
  }, extra || {});
}

function spawnSrv(dataDir, instanceId, port, envOverrides) {
  port = port || (8800 + Math.floor(Math.random() * 200));
  var env = makeEnv(dataDir, envOverrides || {});
  env.TEST_INSTANCE_ID = instanceId;
  env.PORT = String(port);
  var child = spawn(process.execPath, [SRV], { env: env, cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  var stderrBuf = [];
  child.stderr.on('data', function (d) { stderrBuf.push(d); process.stdout.write('[SRV-' + instanceId + '] ' + d.toString().slice(0, 300)); });
  var exited = false;
  child.on('exit', function () { exited = true; });
  child.on('error', function () { exited = true; });
  return { child: child, port: port, base: 'http://127.0.0.1:' + port, exited: function () { return exited; }, stderr: function () { return Buffer.concat(stderrBuf).toString(); } };
}

function stopServer(server, label) {
  return new Promise(function (resolve) {
    if (!server.child || server.child.exitCode !== null || server.child.signalCode !== null) { resolve(); return; }
    var force = setTimeout(function () { try { server.child.kill('SIGKILL'); } catch (e) {} }, 4000);
    server.child.once('exit', function () { clearTimeout(force); resolve(); });
    try { server.child.kill(); } catch (e) {}
  });
}

function waitForSrv(base, instanceId, timeout) {
  return new Promise(function (resolve) {
    var start = Date.now();
    async function attempt() {
      if (Date.now() - start > (timeout || 30000)) return resolve(null);
      try {
        var r = await getJson(base + '/api/state.json', 3000);
        if (r.s !== 200) { setTimeout(attempt, 500); return; }
        resolve(r);
      } catch (e) { setTimeout(attempt, 500); }
    }
    attempt();
  });
}

function getJson(url, ms) {
  return new Promise(function (ok, fail) {
    var req = http.get(url, function (r) {
      var d = []; r.on('data', function (c) { d.push(c); });
      r.on('end', function () { ok({ s: r.statusCode, b: Buffer.concat(d), h: r.headers }); });
    });
    req.on('error', fail);
    req.setTimeout(ms || 5000, function () { req.destroy(); fail(new Error('timeout: ' + url)); });
  });
}

function request(method, port, urlPath, body, token, headers) {
  return new Promise(function (ok, fail) {
    var opts = { hostname: '127.0.0.1', port: port, path: urlPath, method: method, headers: {} };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    if (headers) Object.keys(headers).forEach(function (k) { opts.headers[k] = headers[k]; });
    if (body) {
      if (Buffer.isBuffer(body)) {
        opts.headers['content-type'] = 'application/octet-stream';
        opts.headers['content-length'] = body.length;
      } else {
        var j = JSON.stringify(body);
        opts.headers['content-type'] = 'application/json';
        opts.headers['content-length'] = Buffer.byteLength(j);
        body = Buffer.from(j);
      }
    }
    var req = http.request(opts, function (r) {
      var d = []; r.on('data', function (c) { d.push(c); });
      r.on('end', function () { ok({ s: r.statusCode, b: Buffer.concat(d), h: r.headers }); });
    });
    req.on('error', fail);
    req.setTimeout(15000, function () { req.destroy(); fail(new Error('timeout: ' + method + ' ' + urlPath)); });
    req.end(body || undefined);
  });
}

// makePng — generate a valid PNG via sharp for seeded asset files.
// (Hand-crafted minimal PNGs can be rejected by sharp's libspng decoder.)
async function makePng(w, h) {
  var sharp = require('sharp');
  return await sharp({ create: { width: w || 8, height: h || 8, channels: 3, background: { r: 1, g: 2, b: 3 } } }).png().toBuffer();
}

// PNG_1x1 — minimal 1x1 PNG (70 bytes). Used for streaming upload tests where
// the content is irrelevant (upload fails at classifier gate regardless).
var PNG_1x1 = Buffer.from([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
  0x0D, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x62, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
]);

function copyFixtureData(dstDir) {
  var src = path.join(ROOT, 'data');
  ['image_index.json', 'news_cache.json', 'library_state.json', 'news_rotation_state.json'].forEach(function (f) {
    var s = path.join(src, f);
    if (fs.existsSync(s)) { try { fs.copyFileSync(s, path.join(dstDir, f)); } catch (e) {} }
  });
}

// seedAsset — writes a minimal asset store JSON to dataDir/assets.json so
// assetSelectionService / assetDeleteService can find a pre-existing asset.
function seedAsset(dataDir, assetId, libraryType, localPath) {
  var storeFile = path.join(dataDir, 'assets.json');
  var data = { schemaVersion: 1, assets: {} };
  if (fs.existsSync(storeFile)) {
    try { data = JSON.parse(fs.readFileSync(storeFile, 'utf8')); } catch (e) {}
  }
  data.assets[assetId] = {
    assetId: assetId,
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    libraryType: libraryType,
    sourceType: 'upload',
    sourceUrl: null,
    localPath: localPath,
    sha256: crypto.randomBytes(32).toString('hex'),
    mimeType: 'image/png',
    width: 1, height: 1,
    safetyStatus: 'SAFE',
    lifecycleStatus: 'SELECTABLE',
    metadata: {},
  };
  // schemaVersion must be 1 to match AssetRepository.SCHEMA_VERSION
  data.schemaVersion = 1;
  fs.writeFileSync(storeFile, JSON.stringify(data, null, 2));
}

async function main() {
  console.log('=== V3 Production Path Integration Test ===\n');
  console.log('RUN_ID: ' + Date.now().toString(36));

  // ════════════════════════════════════════════════════════════════════════
  // SECTION 1: Flags OFF → 503 FEATURE_DISABLED for all V3 routes
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n--- SECTION 1: Feature flags OFF → 503 FEATURE_DISABLED ---');
  {
    var dir1 = makeTmpDir('flagsoff');
    copyFixtureData(dir1);
    var srv1 = spawnSrv(dir1, 'flagsoff', 8810);
    var ready1 = await waitForSrv(srv1.base, 'flagsoff', 25000);
    t('S1_SERVER_READY', !!ready1, ready1 ? 'ok' : 'timeout');

    if (ready1) {
      // Upload with flags off → 503
      var upOff = await request('POST', srv1.port, '/api/admin/library/custom/upload', PNG_1x1, TOKEN, {
        'content-type': 'application/octet-stream',
        'x-original-name': 'test.png',
        'x-mime-type': 'image/png',
      });
      t('S1_UPLOAD_FLAG_OFF_503', upOff.s === 503, 'http=' + upOff.s + ' body=' + upOff.b.toString().slice(0, 100));
      t('S1_UPLOAD_FLAG_OFF_FEATURE_DISABLED', /FEATURE_DISABLED/i.test(upOff.b.toString()), '');

      // Delete with flags off → 503
      var delOff = await request('DELETE', srv1.port, '/api/admin/library/test-asset', { reason: 'UNSAFE' }, TOKEN);
      t('S1_DELETE_FLAG_OFF_503', delOff.s === 503, 'http=' + delOff.s);
      t('S1_DELETE_FLAG_OFF_FEATURE_DISABLED', /FEATURE_DISABLED/i.test(delOff.b.toString()), '');

      // Learning ingest with flags off → 503
      var ingestOff = await request('POST', srv1.port, '/api/admin/learning/ingest', {}, TOKEN);
      t('S1_LEARNING_FLAG_OFF_503', ingestOff.s === 503, 'http=' + ingestOff.s);

      // Learning status with flags off → 503
      var lstatusOff = await request('GET', srv1.port, '/api/admin/learning/status', null, TOKEN);
      t('S1_LEARNING_STATUS_FLAG_OFF_503', lstatusOff.s === 503, 'http=' + lstatusOff.s);
    }
    await stopServer(srv1, 'flagsoff');
  }

  // ════════════════════════════════════════════════════════════════════════
  // SECTION 2: Flags ON, no classifier model → fail-closed + feature truth
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n--- SECTION 2: Flags ON, no classifier → fail-closed + truth model ---');
  var dir2 = makeTmpDir('flagson');
  copyFixtureData(dir2);
  var port2 = 8820;
  var env2 = makeEnv(dir2, {
    CUSTOM_LIBRARY_ENABLED: 'true',
    LEARNING_LIBRARY_ENABLED: 'true',
    DELETE_PIPELINE_ENABLED: 'true',
    R9_RENDER_SHADOW_ENABLED: 'true',
    R9_ADVANCED_RENDER_ENABLED: 'true',
    // NSFW_MODEL_PATH deliberately unset → classifier not ready → fail-closed
    MAX_UPLOAD_BYTES: '1048576',
    LEARNING_MAX_DOWNLOAD_BYTES: '5242880',
    LEARNING_INTERVAL_MS: '3600000',
  });
  env2.PORT = String(port2);
  env2.TEST_INSTANCE_ID = 'flagson';
  var srv2 = { child: spawn(process.execPath, [SRV], { env: env2, cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }), port: port2, base: 'http://127.0.0.1:' + port2, exited: function () { return false; } };
  srv2.child.stderr.on('data', function (d) { process.stdout.write('[flagson] ' + d.toString().slice(0, 200)); });
  var ready2 = await waitForSrv(srv2.base, 'flagson', 30000);
  t('S2_SERVER_READY', !!ready2, ready2 ? 'ok' : 'timeout');

  if (ready2) {
    // 2a. Feature truth model — classifier not ready → customLibrary/learning ready=false
    var features = await request('GET', port2, '/api/admin/features', null, TOKEN);
    t('S2_FEATURES_200', features.s === 200, 'http=' + features.s);
    if (features.s === 200) {
      var fj = JSON.parse(features.b.toString());
      t('S2_CUSTOM_LIBRARY_CONFIGURED', fj.customLibrary && fj.customLibrary.configured === true, '');
      t('S2_CUSTOM_LIBRARY_NOT_READY', fj.customLibrary && fj.customLibrary.ready === false, 'ready=' + (fj.customLibrary && fj.customLibrary.ready));
      t('S2_CUSTOM_LIBRARY_REASON_CLASSIFIER', fj.customLibrary && /SAFETY_CLASSIFIER_NOT_READY/i.test(fj.customLibrary.reason || ''), 'reason=' + (fj.customLibrary && fj.customLibrary.reason));
      t('S2_LEARNING_NOT_READY', fj.learning && fj.learning.ready === false, '');
      t('S2_LEARNING_REASON_CLASSIFIER', fj.learning && /SAFETY_CLASSIFIER_NOT_READY/i.test(fj.learning.reason || ''), '');
      t('S2_DELETE_PIPELINE_READY', fj.deletePipeline && fj.deletePipeline.ready === true, 'deletePipeline should be ready (no classifier dep)');
      t('S2_CLASSIFIER_NOT_READY', fj.classifier && fj.classifier.ready === false, '');
      t('S2_CLASSIFIER_REASON_NO_MODEL', fj.classifier && /NO_MODEL_CONFIGURED|CLASSIFIER_PORT/i.test(fj.classifier.reason || ''), 'reason=' + (fj.classifier && fj.classifier.reason));
    }

    // 2b. Streaming upload — octet-stream accepted at HTTP layer,
    //     fails-closed at classifier gate (503 CLASSIFIER_UNAVAILABLE)
    var upOn = await request('POST', port2, '/api/admin/library/custom/upload', PNG_1x1, TOKEN, {
      'content-type': 'application/octet-stream',
      'x-original-name': 'test.png',
      'x-mime-type': 'image/png',
      'content-length': PNG_1x1.length,
    });
    t('S2_STREAMING_UPLOAD_FAIL_CLOSED', upOn.s === 503 || upOn.s === 400, 'http=' + upOn.s + ' body=' + upOn.b.toString().slice(0, 120));
    t('S2_STREAMING_UPLOAD_CLASSIFIER_GATE', /CLASSIFIER_UNAVAILABLE|FAIL_CLOSED|classifier/i.test(upOn.b.toString()), '');

    // 2c. Streaming upload — wrong Content-Type → 415
    var upBadCt = await request('POST', port2, '/api/admin/library/custom/upload', { fileBuffer: 'dGVzdA==' }, TOKEN, {
      'content-type': 'application/json',
    });
    t('S2_UPLOAD_WRONG_CT_415', upBadCt.s === 415, 'http=' + upBadCt.s);

    // 2d. Delete — no reason → 400
    var delNoReason = await request('DELETE', port2, '/api/admin/library/no-such-asset', {}, TOKEN);
    t('S2_DELETE_NO_REASON_400', delNoReason.s === 400, 'http=' + delNoReason.s);
    t('S2_DELETE_NO_REASON_MSG', /reason required/i.test(delNoReason.b.toString()), '');

    // 2e. Delete — invalid reason → 400
    var delBadReason = await request('DELETE', port2, '/api/admin/library/no-such-asset', { reason: 'BAD_REASON' }, TOKEN);
    t('S2_DELETE_BAD_REASON_400', delBadReason.s === 400, 'http=' + delBadReason.s);

    // 2f. Delete — valid reason, asset not found → 404
    var delNotFound = await request('DELETE', port2, '/api/admin/library/no-such-asset', { reason: 'UNSAFE' }, TOKEN);
    t('S2_DELETE_NOT_FOUND_404', delNotFound.s === 404, 'http=' + delNotFound.s + ' body=' + delNotFound.b.toString().slice(0, 100));

    // 2g. ONE_SHOT — non-existent asset → 400
    var osBad = await request('POST', port2, '/api/admin/publish/one-shot', {
      contentType: 'photo', libraryType: 'CUSTOM', assetId: 'no-such-asset',
    }, TOKEN);
    t('S2_ONESHOT_BAD_ASSET_400', osBad.s === 400, 'http=' + osBad.s + ' body=' + osBad.b.toString().slice(0, 100));

    // 2h. FOCUS_LOCK — no matching assets → 404
    var flNoMatch = await request('PUT', port2, '/api/admin/focus-lock', {
      libraryType: 'CUSTOM', theme: 'nonexistent-theme',
    }, TOKEN);
    t('S2_FOCUS_LOCK_NO_MATCH_404', flNoMatch.s === 404, 'http=' + flNoMatch.s + ' body=' + flNoMatch.b.toString().slice(0, 100));

    // 2i. Learning ingest — service exists but no classifier → ingest runs but
    //     candidates fail at safety gate (or source adapter returns empty).
    //     Either way, the route should return 200 with results array.
    var ingestOn = await request('POST', port2, '/api/admin/learning/ingest', {}, TOKEN);
    t('S2_LEARNING_INGEST_200', ingestOn.s === 200, 'http=' + ingestOn.s + ' body=' + ingestOn.b.toString().slice(0, 150));

    // 2j. Learning status — scheduler should report SAFETY_CLASSIFIER_NOT_READY
    var lstatus = await request('GET', port2, '/api/admin/learning/status', null, TOKEN);
    t('S2_LEARNING_STATUS_200', lstatus.s === 200, 'http=' + lstatus.s);
    if (lstatus.s === 200) {
      var lsj = JSON.parse(lstatus.b.toString());
      t('S2_LEARNING_SCHEDULER_NOT_READY', lsj.scheduler && lsj.scheduler.status === 'SAFETY_CLASSIFIER_NOT_READY', 'status=' + (lsj.scheduler && lsj.scheduler.status));
      t('S2_LEARNING_SCHEDULER_CLASSIFIER_READY_FALSE', lsj.scheduler && lsj.scheduler.classifierReady === false, '');
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // SECTION 3: ONE_SHOT + FOCUS_LOCK with pre-seeded asset + restart restore
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n--- SECTION 3: ONE_SHOT + FOCUS_LOCK with pre-seeded asset ---');
  var dir3 = makeTmpDir('selection');
  copyFixtureData(dir3);
  // Seed a real asset file + asset store entry
  var assetFile = path.join(dir3, 'seeded_asset.png');
  fs.writeFileSync(assetFile, await makePng(8, 8));
  seedAsset(dir3, 'seeded-asset-001', 'custom', assetFile);
  var port3 = 8830;
  var env3 = makeEnv(dir3, {
    CUSTOM_LIBRARY_ENABLED: 'true',
    DELETE_PIPELINE_ENABLED: 'true',
  });
  env3.PORT = String(port3);
  env3.TEST_INSTANCE_ID = 'selection';
  var srv3 = { child: spawn(process.execPath, [SRV], { env: env3, cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }), port: port3, base: 'http://127.0.0.1:' + port3, exited: function () { return false; } };
  srv3.child.stderr.on('data', function (d) { process.stdout.write('[selection] ' + d.toString().slice(0, 200)); });
  var ready3 = await waitForSrv(srv3.base, 'selection', 25000);
  t('S3_SERVER_READY', !!ready3, ready3 ? 'ok' : 'timeout');

  if (ready3) {
    // 3a. ONE_SHOT with valid pre-seeded asset → 200 + override saved
    var osOk = await request('POST', port3, '/api/admin/publish/one-shot', {
      contentType: 'photo', libraryType: 'CUSTOM', assetId: 'seeded-asset-001',
    }, TOKEN);
    t('S3_ONESHOT_VALID_200', osOk.s === 200, 'http=' + osOk.s + ' body=' + osOk.b.toString().slice(0, 150));
    if (osOk.s === 200) {
      var osj = JSON.parse(osOk.b.toString());
      t('S3_ONESHOT_HAS_SNAPSHOT_ID', !!osj.snapshotId, '');
      t('S3_ONESHOT_MODE', osj.operatingMode === 'ONE_SHOT_OVERRIDE', 'mode=' + osj.operatingMode);
    }
    // Verify override file written
    var overrideFile = path.join(dir3, 'admin_override.json');
    t('S3_OVERRIDE_FILE_WRITTEN', fs.existsSync(overrideFile), '');
    if (fs.existsSync(overrideFile)) {
      var ovj = JSON.parse(fs.readFileSync(overrideFile, 'utf8'));
      t('S3_OVERRIDE_MODE_ONESHOT', ovj.mode === 'ONE_SHOT_OVERRIDE', 'mode=' + ovj.mode);
      t('S3_OVERRIDE_HAS_ASSET_ID', ovj.assetId === 'seeded-asset-001', 'assetId=' + ovj.assetId);
      t('S3_OVERRIDE_HAS_SNAPSHOT_ID', !!ovj.snapshotId, '');
    }

    // 3b. State should show ONE_SHOT_OVERRIDE
    var stAfter = await getJson(srv3.base + '/api/state.json', 5000);
    if (stAfter.s === 200) {
      var stj = JSON.parse(stAfter.b.toString());
      t('S3_STATE_ONESHOT_MODE', stj.operatingMode === 'ONE_SHOT_OVERRIDE', 'mode=' + stj.operatingMode);
    }

    // 3c. Restart — stop server, restart with same data dir, verify override restored
    await stopServer(srv3, 'selection');

    var port3b = 8831;
    var env3b = makeEnv(dir3, {
      CUSTOM_LIBRARY_ENABLED: 'true',
      DELETE_PIPELINE_ENABLED: 'true',
    });
    env3b.PORT = String(port3b);
    env3b.TEST_INSTANCE_ID = 'selection-restart';
    var srv3b = { child: spawn(process.execPath, [SRV], { env: env3b, cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }), port: port3b, base: 'http://127.0.0.1:' + port3b, exited: function () { return false; } };
    var restartLogs = [];
    srv3b.child.stderr.on('data', function (d) { restartLogs.push(d.toString()); });
    srv3b.child.stdout.on('data', function (d) { restartLogs.push(d.toString()); });
    var ready3b = await waitForSrv(srv3b.base, 'selection-restart', 25000);
    t('S3_RESTART_READY', !!ready3b, ready3b ? 'ok' : 'timeout');

    if (ready3b) {
      // After restart, operating mode should be restored to ONE_SHOT_OVERRIDE
      var stRestart = await getJson(srv3b.base + '/api/state.json', 5000);
      if (stRestart.s === 200) {
        var stRj = JSON.parse(stRestart.b.toString());
        t('S3_RESTART_RESTORED_ONESHOT', stRj.operatingMode === 'ONE_SHOT_OVERRIDE', 'mode=' + stRj.operatingMode);
      }
      // Log should mention override restore
      var logText = restartLogs.join('');
      t('S3_RESTART_LOG_MENTIONS_RESTORE', /Restored ONE_SHOT override/i.test(logText), 'log snippet: ' + logText.slice(-300).replace(/\n/g, ' '));
    }
    await stopServer(srv3b, 'selection-restart');

    // 3d. FOCUS_LOCK with pre-seeded asset (new server, no override)
    var dir3c = makeTmpDir('focuslock');
    copyFixtureData(dir3c);
    var assetFile2 = path.join(dir3c, 'seeded_asset.png');
    fs.writeFileSync(assetFile2, await makePng(8, 8));
    seedAsset(dir3c, 'fl-asset-001', 'custom', assetFile2);
    var port3c = 8832;
    var env3c = makeEnv(dir3c, { CUSTOM_LIBRARY_ENABLED: 'true', DELETE_PIPELINE_ENABLED: 'true' });
    env3c.PORT = String(port3c);
    env3c.TEST_INSTANCE_ID = 'focuslock';
    var srv3c = { child: spawn(process.execPath, [SRV], { env: env3c, cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }), port: port3c, base: 'http://127.0.0.1:' + port3c, exited: function () { return false; } };
    srv3c.child.stderr.on('data', function (d) { process.stdout.write('[focuslock] ' + d.toString().slice(0, 200)); });
    var ready3c = await waitForSrv(srv3c.base, 'focuslock', 25000);

    if (ready3c) {
      var flOk = await request('PUT', port3c, '/api/admin/focus-lock', {
        libraryType: 'CUSTOM',
      }, TOKEN);
      t('S3_FOCUS_LOCK_VALID_200', flOk.s === 200, 'http=' + flOk.s + ' body=' + flOk.b.toString().slice(0, 150));
      if (flOk.s === 200) {
        var flj = JSON.parse(flOk.b.toString());
        t('S3_FOCUS_LOCK_MODE', flj.operatingMode === 'FOCUS_LOCK', 'mode=' + flj.operatingMode);
        t('S3_FOCUS_LOCK_HAS_ASSET_ID', !!flj.resolvedAssetId, 'assetId=' + flj.resolvedAssetId);
      }
      // Verify override file
      var flOverride = path.join(dir3c, 'admin_override.json');
      t('S3_FOCUS_LOCK_OVERRIDE_WRITTEN', fs.existsSync(flOverride), '');
      if (fs.existsSync(flOverride)) {
        var floj = JSON.parse(fs.readFileSync(flOverride, 'utf8'));
        t('S3_FOCUS_LOCK_OVERRIDE_MODE', floj.mode === 'FOCUS_LOCK', 'mode=' + floj.mode);
      }
      // Exit focus lock via DELETE
      var flExit = await request('DELETE', port3c, '/api/admin/focus-lock', null, TOKEN);
      t('S3_FOCUS_LOCK_EXIT_200', flExit.s === 200, 'http=' + flExit.s);
      // Override file should be cleared
      t('S3_FOCUS_LOCK_OVERRIDE_CLEARED', !fs.existsSync(flOverride), 'override file still exists after exit');
    }
    await stopServer(srv3c, 'focuslock');
  }

  // Stop srv2 if still running
  if (srv2 && !srv2.exited()) { await stopServer(srv2, 'flagson'); }

  // ════════════════════════════════════════════════════════════════════════
  // SECTION 4: Three renderer EPF1 (direct module test)
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n--- SECTION 4: Renderer EPF1 output (direct module test) ---');
  {
    try {
      var { createAnalysisCardRenderer } = require(path.join(ROOT, 'src', 'render', 'analysis-card-renderer'));
      var { createComparisonPairRenderer } = require(path.join(ROOT, 'src', 'render', 'comparison-pair-renderer'));
      var { createSequence2x2Renderer } = require(path.join(ROOT, 'src', 'render', 'sequence-2x2-renderer'));

      var analysisRenderer = createAnalysisCardRenderer();
      var comparisonRenderer = createComparisonPairRenderer();
      var sequenceRenderer = createSequence2x2Renderer();

      // Analysis card
      var analysisContent = {
        frameId: 'test:analysis:1',
        mode: 'analysis',
        title: 'Test Analysis',
        summary: 'Test summary for analysis card renderer',
        dataPoints: [{ label: 'Test', value: '42' }],
      };
      if (analysisRenderer.canRender(analysisContent)) {
        var ar = await analysisRenderer.render(analysisContent, 'test-profile');
        t('S4_ANALYSIS_EPF1_MAGIC', ar && ar.frame && ar.frame.slice(0, 4).toString() === 'EPF1', 'magic=' + (ar && ar.frame && ar.frame.slice(0, 4).toString()));
        t('S4_ANALYSIS_FRAME_192010', ar && ar.frame && ar.frame.length === 192010, 'len=' + (ar && ar.frame && ar.frame.length));
      } else {
        t('S4_ANALYSIS_CAN_RENDER', false, 'analysis renderer cannot render test content');
      }

      // Comparison pair
      var comparisonContent = {
        frameId: 'test:comparison:1',
        mode: 'comparison',
        items: [
          { title: 'Left', summary: 'Left summary' },
          { title: 'Right', summary: 'Right summary' },
        ],
      };
      if (comparisonRenderer.canRender(comparisonContent)) {
        var cr = await comparisonRenderer.render(comparisonContent, 'test-profile');
        t('S4_COMPARISON_EPF1_MAGIC', cr && cr.frame && cr.frame.slice(0, 4).toString() === 'EPF1', '');
        t('S4_COMPARISON_FRAME_192010', cr && cr.frame && cr.frame.length === 192010, 'len=' + (cr && cr.frame && cr.frame.length));
      } else {
        t('S4_COMPARISON_CAN_RENDER', false, 'comparison renderer cannot render test content');
      }

      // Sequence 2x2
      var sequenceContent = {
        frameId: 'test:sequence:1',
        mode: 'sequence',
        items: [
          { title: 'Item 1', summary: 'Summary 1' },
          { title: 'Item 2', summary: 'Summary 2' },
          { title: 'Item 3', summary: 'Summary 3' },
          { title: 'Item 4', summary: 'Summary 4' },
        ],
      };
      if (sequenceRenderer.canRender(sequenceContent)) {
        var sr = await sequenceRenderer.render(sequenceContent, 'test-profile');
        t('S4_SEQUENCE_EPF1_MAGIC', sr && sr.frame && sr.frame.slice(0, 4).toString() === 'EPF1', '');
        t('S4_SEQUENCE_FRAME_192010', sr && sr.frame && sr.frame.length === 192010, 'len=' + (sr && sr.frame && sr.frame.length));
      } else {
        t('S4_SEQUENCE_CAN_RENDER', false, 'sequence renderer cannot render test content');
      }
    } catch (e) {
      t('S4_RENDERERS_LOADABLE', false, 'renderer require failed: ' + e.message);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // SECTION 5: CSRF / CIDR regression (admin auth still enforced)
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n--- SECTION 5: CSRF / admin auth regression ---');
  {
    var dir5 = makeTmpDir('csrf');
    copyFixtureData(dir5);
    var port5 = 8840;
    var env5 = makeEnv(dir5, {
      DELETE_PIPELINE_ENABLED: 'true',
      CUSTOM_LIBRARY_ENABLED: 'true',
    });
    env5.PORT = String(port5);
    env5.TEST_INSTANCE_ID = 'csrf';
    var srv5 = { child: spawn(process.execPath, [SRV], { env: env5, cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }), port: port5, base: 'http://127.0.0.1:' + port5, exited: function () { return false; } };
    srv5.child.stderr.on('data', function (d) { process.stdout.write('[csrf] ' + d.toString().slice(0, 150)); });
    var ready5 = await waitForSrv(srv5.base, 'csrf', 25000);
    t('S5_SERVER_READY', !!ready5, ready5 ? 'ok' : 'timeout');

    if (ready5) {
      // No auth token → 403
      var noAuth = await request('POST', port5, '/api/admin/publish/one-shot', {
        contentType: 'photo', libraryType: 'CUSTOM', assetId: 'x',
      }, null);
      t('S5_NO_AUTH_403', noAuth.s === 403, 'http=' + noAuth.s);

      // Wrong token → 403
      var wrongAuth = await request('POST', port5, '/api/admin/publish/one-shot', {
        contentType: 'photo', libraryType: 'CUSTOM', assetId: 'x',
      }, 'wrong-token');
      t('S5_WRONG_AUTH_403', wrongAuth.s === 403, 'http=' + wrongAuth.s);

      // Delete without auth → 403
      var delNoAuth = await request('DELETE', port5, '/api/admin/library/x', { reason: 'UNSAFE' }, null);
      t('S5_DELETE_NO_AUTH_403', delNoAuth.s === 403, 'http=' + delNoAuth.s);

      // Upload without auth → 403
      var upNoAuth = await request('POST', port5, '/api/admin/library/custom/upload', PNG_1x1, null, {
        'content-type': 'application/octet-stream',
      });
      t('S5_UPLOAD_NO_AUTH_403', upNoAuth.s === 403, 'http=' + upNoAuth.s);

      // State endpoint is public (no auth needed)
      var statePub = await getJson(srv5.base + '/api/state.json', 5000);
      t('S5_STATE_PUBLIC_200', statePub.s === 200, 'http=' + statePub.s);
    }
    await stopServer(srv5, 'csrf');
  }

  // ════════════════════════════════════════════════════════════════════════
  // SECTION 6: Restart restore — invalid override cleared
  // ════════════════════════════════════════════════════════════════════════
  console.log('\n--- SECTION 6: Restart restore — invalid override cleared ---');
  {
    var dir6 = makeTmpDir('invalid-override');
    copyFixtureData(dir6);
    // Write an override for a non-existent asset
    var badOverride = {
      mode: 'FOCUS_LOCK',
      assetId: 'deleted-asset-999',
      snapshotId: 'snap-nonexistent',
      libraryType: 'CUSTOM',
      savedAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(dir6, 'admin_override.json'), JSON.stringify(badOverride, null, 2));

    var port6 = 8850;
    var env6 = makeEnv(dir6, { CUSTOM_LIBRARY_ENABLED: 'true', DELETE_PIPELINE_ENABLED: 'true' });
    env6.PORT = String(port6);
    env6.TEST_INSTANCE_ID = 'invalid-override';
    var srv6 = { child: spawn(process.execPath, [SRV], { env: env6, cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }), port: port6, base: 'http://127.0.0.1:' + port6, exited: function () { return false; } };
    var logs6 = [];
    srv6.child.stderr.on('data', function (d) { logs6.push(d.toString()); });
    var ready6 = await waitForSrv(srv6.base, 'invalid-override', 25000);
    t('S6_SERVER_READY', !!ready6, ready6 ? 'ok' : 'timeout');

    if (ready6) {
      // Invalid override should be cleared (asset doesn't exist)
      var logText6 = logs6.join('');
      t('S6_INVALID_OVERRIDE_LOGGED', /Persisted override invalid|clearing override/i.test(logText6), 'log: ' + logText6.slice(-300).replace(/\n/g, ' '));
      // Override file should be cleared
      t('S6_INVALID_OVERRIDE_CLEARED', !fs.existsSync(path.join(dir6, 'admin_override.json')), 'override file still exists');
      // Mode should be AUTO (not FOCUS_LOCK)
      var st6 = await getJson(srv6.base + '/api/state.json', 5000);
      if (st6.s === 200) {
        var st6j = JSON.parse(st6.b.toString());
        t('S6_MODE_AUTO_AFTER_INVALID', st6j.operatingMode === 'AUTO', 'mode=' + st6j.operatingMode);
      }
    }
    await stopServer(srv6, 'invalid-override');
  }

  // Cleanup
  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}

main().catch(function (e) {
  console.log('FATAL: ' + e.message + '\n' + e.stack);
  process.exit(1);
});
