#!/usr/bin/env node
// R1 Production Integration Tests — real child process, no module require pollution
var cp = require('child_process');
var path = require('path');
var fs = require('fs');
var os = require('os');
var http = require('http');
var ROOT = path.join(__dirname, '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}

// Capture pre-test git state for pollution detection
var preTestGitHash = null;
try { preTestGitHash = cp.execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim(); } catch(e) {}
var preTestStatus = null;
try { preTestStatus = cp.execSync('git status --porcelain data/', { cwd: ROOT, encoding: 'utf8' }).trim(); } catch(e) {}

function httpRequest(url, opts) {
  opts = opts || {};
  var method = opts.method || 'GET';
  var headers = opts.headers || {};
  var body = opts.body || null;
  return new Promise(function(resolve, reject) {
    var u = new URL(url);
    var reqOpts = {
      method: method, hostname: u.hostname, port: u.port, path: u.pathname + (u.search || ''), headers: headers, timeout: 10000,
    };
    var req = http.request(reqOpts, function(res) {
      var chunks = [];
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() { resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }); });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', function() { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

function waitForHealth(url, maxRetries, interval) {
  return new Promise(function(resolve, reject) {
    var attempts = 0;
    function poll() {
      attempts++;
      httpRequest(url).then(function(res) {
        if (res.status === 200) { resolve(); return; }
        if (attempts >= maxRetries) { reject(new Error('health check failed after ' + attempts + ' attempts, status=' + res.status)); return; }
        setTimeout(poll, interval);
      }).catch(function(err) {
        if (attempts >= maxRetries) { reject(new Error('health check error after ' + attempts + ' attempts: ' + err.message)); return; }
        setTimeout(poll, interval);
      });
    }
    poll();
  });
}

function findFreePort() {
  return new Promise(function(resolve, reject) {
    var srv = require('net').createServer();
    srv.listen(0, '127.0.0.1', function() {
      var port = srv.address().port;
      srv.close(function() { resolve(port); });
    });
    srv.on('error', reject);
  });
}

function createTempDataDir() {
  var tmpBase = path.join(os.tmpdir(), 'r1-prod-test-' + Date.now().toString(36));
  fs.mkdirSync(tmpBase, { recursive: true });
  var dataDir = path.join(tmpBase, 'data');
  var snapDir = path.join(dataDir, 'snapshots');
  var pubDir = path.join(dataDir, 'publication');
  var fbDir = path.join(dataDir, 'fallback_study');
  [dataDir, snapDir, pubDir, fbDir].forEach(function(d) { fs.mkdirSync(d, { recursive: true }); });
  fs.writeFileSync(path.join(dataDir, 'feeds.json'), '[]');
  fs.writeFileSync(path.join(dataDir, 'news_cache.json'), JSON.stringify({ version: 1, updatedAt: null, translations: {} }));
  fs.writeFileSync(path.join(dataDir, 'news_rotation_state.json'), JSON.stringify({ version: 1, updatedAt: null, shown: [] }));
  fs.writeFileSync(path.join(dataDir, 'library_state.json'), JSON.stringify({ themeCursor: 0, currentTheme: null, currentImageIndex: 0, remainingThemeSlots: 1, lastSlotKey: null, lastSwitchDate: null, patternIndex: 0, currentKind: null }));
  fs.writeFileSync(path.join(dataDir, 'image_index.json'), '[]');
  fs.writeFileSync(path.join(dataDir, 'active.json'), JSON.stringify({ activeSnapshotId: null, frameSha256: null }));
  // Copy fallback study images so photo builds have resources
  var srcFb = path.join(ROOT, 'resources', 'fallback-study');
  if (fs.existsSync(srcFb)) {
    try { fs.readdirSync(srcFb).forEach(function(f) { fs.copyFileSync(path.join(srcFb, f), path.join(fbDir, f)); }); } catch(e) {}
  }
  return { tmpBase: tmpBase, dataDir: dataDir };
}

function cleanupTempDir(tmpBase) {
  if (!tmpBase || !fs.existsSync(tmpBase)) return;
  try {
    function rmDir(d) {
      if (fs.existsSync(d)) {
        fs.readdirSync(d).forEach(function(e) { var fp = path.join(d, e); if (fs.lstatSync(fp).isDirectory()) rmDir(fp); else fs.unlinkSync(fp); });
        fs.rmdirSync(d);
      }
    }
    rmDir(tmpBase);
  } catch(e) { console.log('cleanup warning: ' + e.message); }
}

var _tmpGlobal = null, _serverProc = null, _serverProc2 = null;

async function runTests() {
  // ── Setup ──
  var port = await findFreePort();
  var tmp = createTempDataDir();
  _tmpGlobal = tmp;
  var adminToken = 'r1-test-secret-token-2024';
  // Use token mode for strict auth testing
  var env = Object.assign({}, process.env, {
    PORT: String(port),
    DATA_DIR: tmp.dataDir,
    FEEDS_FILE: path.join(tmp.dataDir, 'feeds.json'),
    IMAGE_INDEX_FILE: path.join(tmp.dataDir, 'image_index.json'),
    LIBRARY_STATE_FILE: path.join(tmp.dataDir, 'library_state.json'),
    NEWS_CACHE_FILE: path.join(tmp.dataDir, 'news_cache.json'),
    NEWS_ROTATION_FILE: path.join(tmp.dataDir, 'news_rotation_state.json'),
    TRANSLATION_PROVIDER: 'none',
    TZ: 'UTC',
    ADMIN_ACCESS_MODE: 'token',
    ADMIN_TOKEN: adminToken,
    ADMIN_ALLOW_HEADERLESS_WRITE: 'true',
    TRUST_PROXY: 'false',
    ENABLE_DEBUG_ROUTES: 'true',
  });

  console.log('Spawning server on port ' + port + ' with DATA_DIR=' + tmp.dataDir);
  var serverProc = cp.spawn(process.execPath, ['server.js'], {
    cwd: ROOT, env: env, stdio: ['pipe', 'pipe', 'pipe'],
  });
  _serverProc = serverProc;
  var serverStdout = '', serverStderr = '';
  serverProc.stdout.on('data', function(d) { serverStdout += d.toString(); });
  serverProc.stderr.on('data', function(d) { serverStderr += d.toString(); });

  var serverExited = false;
  var serverExitCode = null;
  serverProc.on('exit', function(code) { serverExited = true; serverExitCode = code; });

  // ── Wait for health ──
  var healthUrl = 'http://127.0.0.1:' + port + '/api/health.json';
  try {
    await waitForHealth(healthUrl, 30, 1000);
    t('SERVER_HEALTHY', true, '');
  } catch(e) {
    t('SERVER_HEALTHY', false, e.message + '\nstdout:' + serverStdout.slice(-500) + '\nstderr:' + serverStderr.slice(-500));
    throw new Error('server failed to start');
  }

  // ── 1. Health endpoint ──
  try {
    var healthRes = await httpRequest(healthUrl);
    t('HEALTH_LIVE_STATUS', healthRes.status === 200, 'status=' + healthRes.status);
    var healthParsed = JSON.parse(healthRes.body.toString());
    t('HEALTH_LIVE_BODY_status', healthParsed.status === 'ok', 'got=' + healthParsed.status);
    t('HEALTH_LIVE_BODY_uptimeSeconds', typeof healthParsed.uptimeSeconds === 'number' && healthParsed.uptimeSeconds >= 0, 'uptimeSeconds=' + healthParsed.uptimeSeconds);
    t('HEALTH_LIVE_BODY_timezone', healthParsed.timezone === 'UTC', 'timezone=' + healthParsed.timezone);
  } catch(e) {
    t('HEALTH_ENDPOINT', false, e.message);
  }

  // ── 2. Ready endpoint ──
  try {
    var readyRes = await httpRequest('http://127.0.0.1:' + port + '/health/ready');
    t('READY_STATUS', readyRes.status === 200, 'status=' + readyRes.status);
    var readyParsed = JSON.parse(readyRes.body.toString());
    t('READY_BODY_status', readyParsed.status === 'ok', 'got=' + readyParsed.status);
  } catch(e) {
    t('READY_ENDPOINT', false, e.message);
  }

  // ── 3. State endpoint ──
  try {
    var stateRes = await httpRequest('http://127.0.0.1:' + port + '/api/state.json');
    t('STATE_STATUS', stateRes.status === 200, 'status=' + stateRes.status);
    var stateParsed = JSON.parse(stateRes.body.toString());
    t('STATE_BODY_snapshotId', typeof stateParsed.snapshotId === 'string' && stateParsed.snapshotId.length > 0, 'snapshotId=' + stateParsed.snapshotId);
    t('STATE_BODY_operatingMode', stateParsed.operatingMode === 'AUTO', 'mode=' + stateParsed.operatingMode);
    t('STATE_BODY_frameLength', stateParsed.frameLength === 192010, 'frameLength=' + stateParsed.frameLength);
    t('STATE_BODY_frameUrl', typeof stateParsed.frameUrl === 'string' && stateParsed.frameUrl.indexOf('/api/frame.bin') > 0, '');
  } catch(e) {
    t('STATE_ENDPOINT', false, e.message);
  }

  // ── 4. Frame endpoint (192010 bytes, EPF1 magic) ──
  try {
    var frameRes = await httpRequest('http://127.0.0.1:' + port + '/api/frame.bin');
    t('FRAME_STATUS', frameRes.status === 200, 'status=' + frameRes.status);
    t('FRAME_LENGTH_192010', frameRes.body.length === 192010, 'got ' + frameRes.body.length + ' expected 192010');
    var magic = frameRes.body.slice(0, 4).toString('ascii');
    t('FRAME_EPF1_MAGIC', magic === 'EPF1', 'magic=' + magic);
    // Verify frame header fields
    t('FRAME_WIDTH_800', frameRes.body.readUInt16LE(4) === 800, 'width=' + frameRes.body.readUInt16LE(4));
    t('FRAME_HEIGHT_480', frameRes.body.readUInt16LE(6) === 480, 'height=' + frameRes.body.readUInt16LE(6));
    t('FRAME_PANEL_49', frameRes.body.readUInt8(8) === 49, 'panel=' + frameRes.body.readUInt8(8));
    t('FRAME_BPP_1', frameRes.body.readUInt8(9) === 1, 'bpp=' + frameRes.body.readUInt8(9));
    t('FRAME_HAS_X_FRAME_ID', !!frameRes.headers['x-frame-id'], 'x-frame-id=' + frameRes.headers['x-frame-id']);
  } catch(e) {
    t('FRAME_ENDPOINT', false, e.message);
  }

  // ── 5. Admin auth: correct Bearer token must return 200 ──
  try {
    var adminStateOk = await httpRequest('http://127.0.0.1:' + port + '/api/admin/state', {
      headers: { 'Authorization': 'Bearer ' + adminToken },
    });
    t('ADMIN_STATE_AUTHORIZED', adminStateOk.status === 200, 'status=' + adminStateOk.status);
    var adminStateParsed = JSON.parse(adminStateOk.body.toString());
    t('ADMIN_STATE_HAS_active', !!adminStateParsed.active, '');
    t('ADMIN_STATE_active_operatingMode', adminStateParsed.active && adminStateParsed.active.operatingMode === 'AUTO', 'mode=' + (adminStateParsed.active && adminStateParsed.active.operatingMode));
    t('ADMIN_STATE_active_contentMode', adminStateParsed.active && (adminStateParsed.active.contentMode === 'photo' || adminStateParsed.active.contentMode === 'news'), 'contentMode=' + (adminStateParsed.active && adminStateParsed.active.contentMode));
    t('ADMIN_STATE_active_snapshotId', adminStateParsed.active && typeof adminStateParsed.active.snapshotId === 'string' && adminStateParsed.active.snapshotId.length > 0, 'snapshotId=' + (adminStateParsed.active && adminStateParsed.active.snapshotId));
  } catch(e) {
    t('ADMIN_STATE', false, e.message);
  }

  // ── 6. Admin auth: missing token must return 401/403 ──
  try {
    var noTokenRes = await httpRequest('http://127.0.0.1:' + port + '/api/admin/state', {});
    t('ADMIN_NO_TOKEN_REJECTED', noTokenRes.status === 401 || noTokenRes.status === 403, 'status=' + noTokenRes.status);
  } catch(e) {
    t('ADMIN_NO_TOKEN', false, e.message);
  }

  // ── 6b. Admin auth: wrong token must return 401/403 ──
  try {
    var wrongTokenRes = await httpRequest('http://127.0.0.1:' + port + '/api/admin/state', {
      headers: { 'Authorization': 'Bearer wrong-token-xyz' },
    });
    t('ADMIN_WRONG_TOKEN_REJECTED', wrongTokenRes.status === 401 || wrongTokenRes.status === 403, 'status=' + wrongTokenRes.status);
  } catch(e) {
    t('ADMIN_WRONG_TOKEN', false, e.message);
  }

  // ── 7. No-asset photo one-shot (must include Bearer token in token mode) ──
  var oneShotSnapshotId = null;
  var oneShotExpiresAt = null;
  try {
    var osBody = JSON.stringify({ contentType: 'photo' });
    var osRes = await httpRequest('http://127.0.0.1:' + port + '/api/admin/publish/one-shot', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(osBody),
        'Authorization': 'Bearer ' + adminToken,
      },
      body: osBody,
    });
    t('ONE_SHOT_STATUS', osRes.status === 200, 'status=' + osRes.status);
    var osParsed = JSON.parse(osRes.body.toString());
    t('ONE_SHOT_snapshotId', typeof osParsed.snapshotId === 'string' && osParsed.snapshotId.length > 0, 'snapshotId=' + osParsed.snapshotId);
    t('ONE_SHOT_frameId_prefix', osParsed.frameId && osParsed.frameId.indexOf('one-shot:photo:') === 0, 'frameId=' + osParsed.frameId);
    t('ONE_SHOT_operatingMode', osParsed.operatingMode === 'ONE_SHOT_OVERRIDE', 'mode=' + osParsed.operatingMode);
    oneShotSnapshotId = osParsed.snapshotId;
    oneShotExpiresAt = osParsed.expiresAt;
  } catch(e) {
    t('ONE_SHOT', false, e.message);
  }

  // ── 8. Verify one-shot frame via frame.bin (after one-shot, frame should still be 192010 EPF1) ──
  try {
    var osFrameRes = await httpRequest('http://127.0.0.1:' + port + '/api/frame.bin');
    t('OS_FRAME_STATUS', osFrameRes.status === 200, 'status=' + osFrameRes.status);
    t('OS_FRAME_LENGTH_192010', osFrameRes.body.length === 192010, 'got ' + osFrameRes.body.length + ' expected 192010');
    var osMagic = osFrameRes.body.slice(0, 4).toString('ascii');
    t('OS_FRAME_EPF1', osMagic === 'EPF1', 'magic=' + osMagic);
  } catch(e) {
    t('OS_FRAME', false, e.message);
  }

  // ── 9. Access-mode endpoint (token mode) ──
  try {
    var amRes = await httpRequest('http://127.0.0.1:' + port + '/api/admin/access-mode');
    t('ACCESS_MODE_STATUS', amRes.status === 200, 'status=' + amRes.status);
    var amParsed = JSON.parse(amRes.body.toString());
    t('ACCESS_MODE_mode', amParsed.mode === 'token', 'mode=' + amParsed.mode);
  } catch(e) {
    t('ACCESS_MODE', false, e.message);
  }

  // ── 9b. Check stderr/stdout for top-level crash / Unhandled / TypeError ──
  var crashPatterns = ['top-level crash', 'Unhandled', 'TypeError', 'ReferenceError', 'uncaughtException'];
  var foundCrash = false;
  crashPatterns.forEach(function(p) {
    if (serverStderr.indexOf(p) >= 0 || serverStdout.indexOf(p) >= 0) {
      foundCrash = true;
      t('NO_CRASH:' + p, false, 'found in output');
    }
  });
  if (!foundCrash) t('NO_CRASH_PATTERNS', true, '');

  // ── 10. SIGTERM — graceful shutdown ──
  console.log('Sending SIGTERM...');
  var sigtermCode = null;
  var sigtermSignal = null;
  var sigtermPromise = new Promise(function(resolve) {
    var timeout = setTimeout(function() {
      t('SIGTERM_EXIT', false, 'timeout waiting for exit');
      if (!serverExited) { try { serverProc.kill('SIGKILL'); } catch(e) {} }
      resolve();
    }, 10000);
    serverProc.on('exit', function(code, signal) {
      clearTimeout(timeout);
      sigtermCode = code;
      sigtermSignal = signal;
      serverExited = true;
      serverExitCode = code;
      resolve();
    });
  });
  serverProc.kill('SIGTERM');
  await sigtermPromise;

  // On Windows, SIGTERM terminates the process; exit event may give code=null.
  // On POSIX, exit code 0 with 'SIGTERM' signal.
  if (process.platform === 'win32') {
    t('SIGTERM_EXIT_CODE', sigtermCode === null || sigtermCode === 1 || sigtermCode === 0, 'code=' + sigtermCode);
  } else {
    t('SIGTERM_EXIT_CODE', sigtermCode === 0 || sigtermCode === null, 'code=' + sigtermCode);
    t('SIGTERM_EXIT_SIGNAL', sigtermSignal === 'SIGTERM' || sigtermSignal === null || sigtermCode === 0, 'signal=' + sigtermSignal);
  }

  // ── 11. Verify data files persisted ──
  t('DATA_library_state_json', fs.existsSync(path.join(tmp.dataDir, 'library_state.json')), '');
  t('DATA_image_index_json', fs.existsSync(path.join(tmp.dataDir, 'image_index.json')), '');
  t('DATA_publication_dir', fs.existsSync(path.join(tmp.dataDir, 'publication')), '');

  // Read persisted state from actual snapshot store locations
  var persistedPubDir = path.join(tmp.dataDir, 'publication');
  var pubFiles = fs.existsSync(persistedPubDir) ? fs.readdirSync(persistedPubDir) : [];
  t('DATA_publication_nonempty', pubFiles.length > 0, 'files=' + pubFiles.length);
  var activeSnapshotFile = path.join(persistedPubDir, 'active-snapshot.json');
  t('DATA_active_snapshot_json', fs.existsSync(activeSnapshotFile), '');
  if (fs.existsSync(activeSnapshotFile)) {
    var persistedActive = JSON.parse(fs.readFileSync(activeSnapshotFile, 'utf8'));
    t('DATA_active_has_snapshotId', typeof persistedActive.activeSnapshotId === 'string' && persistedActive.activeSnapshotId.length > 0, 'activeSnapshotId=' + persistedActive.activeSnapshotId);
  }

  // ── 12. Restart with same data dir ──
  console.log('Restarting with same DATA_DIR...');
  var serverProc2 = cp.spawn(process.execPath, ['server.js'], {
    cwd: ROOT, env: env, stdio: ['pipe', 'pipe', 'pipe'],
  });
  _serverProc2 = serverProc2;
  var serverStdout2 = '', serverStderr2 = '';
  serverProc2.stdout.on('data', function(d) { serverStdout2 += d.toString(); });
  serverProc2.stderr.on('data', function(d) { serverStderr2 += d.toString(); });

  try {
    await waitForHealth(healthUrl, 30, 1000);
    t('RESTART_HEALTHY', true, '');
  } catch(e) {
    t('RESTART_HEALTHY', false, e.message);
  }

  // ── 13. Verify restart preserved ONE_SHOT override state ──
  try {
    var restartState = await httpRequest('http://127.0.0.1:' + port + '/api/state.json');
    t('RESTART_STATE_STATUS', restartState.status === 200, 'status=' + restartState.status);
    var restartParsed = JSON.parse(restartState.body.toString());
    t('RESTART_STATE_snapshotId', typeof restartParsed.snapshotId === 'string' && restartParsed.snapshotId.length > 0, 'snapshotId=' + restartParsed.snapshotId);
    t('RESTART_STATE_operatingMode', restartParsed.operatingMode === 'ONE_SHOT_OVERRIDE', 'mode=' + restartParsed.operatingMode + ' (expected ONE_SHOT_OVERRIDE)');
    // SnapshotId must match the one-shot publish response exactly (no-asset restore via SnapshotStore)
    t('RESTART_STATE_snapshotId_matches_oneshot', restartParsed.snapshotId === oneShotSnapshotId, 'expected=' + oneShotSnapshotId + ' got=' + restartParsed.snapshotId);
  } catch(e) {
    t('RESTART_STATE', false, e.message);
  }

  // ── 14. Verify frame after restart ──
  try {
    var restartFrame = await httpRequest('http://127.0.0.1:' + port + '/api/frame.bin');
    t('RESTART_FRAME_STATUS', restartFrame.status === 200, 'status=' + restartFrame.status);
    t('RESTART_FRAME_LENGTH', restartFrame.body.length === 192010, 'got ' + restartFrame.body.length);
    t('RESTART_FRAME_EPF1', restartFrame.body.slice(0, 4).toString('ascii') === 'EPF1', '');
  } catch(e) {
    t('RESTART_FRAME', false, e.message);
  }

  // ── 15. Shutdown server 2 ──
  console.log('Sending SIGTERM to second instance...');
  var srv2Exited = false;
  await new Promise(function(resolve) {
    var timeout = setTimeout(function() {
      if (!srv2Exited) { try { serverProc2.kill('SIGKILL'); } catch(e) {} }
      resolve();
    }, 10000);
    serverProc2.on('exit', function(code, signal) {
      srv2Exited = true;
      clearTimeout(timeout);
      if (process.platform === 'win32') {
        t('SRV2_EXIT_CODE', code === null || code === 1 || code === 0, 'code=' + code);
      } else {
        t('SRV2_EXIT_CODE', code === 0 || code === null, 'code=' + code);
        t('SRV2_EXIT_SIGNAL', signal === 'SIGTERM' || signal === null || code === 0, 'signal=' + signal);
      }
      resolve();
    });
    serverProc2.kill('SIGTERM');
  });

  // ── 16. Verify data files after restart cycle ──
  try {
    var pubFiles = fs.existsSync(path.join(tmp.dataDir, 'publication')) ? fs.readdirSync(path.join(tmp.dataDir, 'publication')) : [];
    t('DATA_PUB_FILES_AFTER_RESTART', pubFiles.length > 0, 'files=' + pubFiles.length);
    // Compare with snapshot before restart (unconditional — will fail if oneShotSnapshotId is null/empty)
    var snapMetaFile = path.join(tmp.dataDir, 'snapshots', (oneShotSnapshotId || '') + '.json');
    var snapBinFile = path.join(tmp.dataDir, 'snapshots', (oneShotSnapshotId || '') + '.bin');
    t('DATA_SNAPSHOT_META_PRESERVED', fs.existsSync(snapMetaFile), '');
    t('DATA_SNAPSHOT_FRAME_PRESERVED', fs.existsSync(snapBinFile), '');
  } catch(e) {
    t('DATA_VERIFY', false, e.message);
  }

  // ── 17. (cleanup moved to outer finally) ──

  // ── 18. Verify repo pollution ──
  try {
    var postTestStatus = cp.execSync('git status --porcelain data/', { cwd: ROOT, encoding: 'utf8' }).trim();
    t('REPO_DATA_NO_POLLUTION', postTestStatus === preTestStatus, postTestStatus ? 'changed: ' + postTestStatus : 'clean');
    var postTestHash = cp.execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
    t('REPO_HASH_UNCHANGED', postTestHash === preTestGitHash, '');
  } catch(e) {
    t('REPO_POLLUTION_CHECK', false, e.message);
  }

  // ── Summary (printed by outer handler) ──
}

function forceKill(proc) {
  if (!proc || proc.exitCode !== null || proc.killed) return Promise.resolve();
  return new Promise(function(resolve) {
    var to = setTimeout(function() { try { proc.kill('SIGKILL'); } catch(e) {} resolve(); }, 3000);
    proc.on('exit', function() { clearTimeout(to); resolve(); });
    try { proc.kill('SIGTERM'); } catch(e) { clearTimeout(to); resolve(); }
  });
}

async function finalCleanup() {
  await forceKill(_serverProc);
  await forceKill(_serverProc2);
  if (_tmpGlobal) cleanupTempDir(_tmpGlobal.tmpBase);
}

runTests().then(async function() {
  await finalCleanup();
  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}).catch(async function(err) {
  console.log('Test error: ' + err.message);
  await finalCleanup();
  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(1);
});
