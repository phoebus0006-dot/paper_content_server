// graceful-shutdown-test.js — real lifecycle verification.
// Covers:
//   Port contract (createMqttClientPort(client).disconnect):
//     REAL_PORT_DISCONNECT_RETURNS_PROMISE
//     REAL_PORT_DISCONNECT_WAITS_FOR_END_CALLBACK
//     END_CALLBACK_ERROR_REJECTS
//     SECOND_DISCONNECT_IDEMPOTENT
//   Bootstrap integration:
//     CONCURRENT_SHUTDOWN_RETURNS_SAME_PROMISE
//     MQTT_CALLBACK_END_AWAITED, MQTT_REJECTION_PROPAGATED, MQTT_THROW_PROPAGATED
//     MQTT_REJECTION_CLEARS_TIMER, HTTP_REJECTION_CLEARS_TIMER
//     SHUTDOWN_TIMEOUT_CAUSES_FAILURE
//   Real subprocess:
//     SIGINT / SIGTERM close HTTP, port can rebind (PORT_REBIND)
// No boolean idempotency — uses shared Promise identity and clearTimeout spy.
var http = require('http');
var net = require('net');
var path = require('path');
var fs = require('fs');
var { spawn } = require('child_process');
var ROOT = path.join(__dirname, '..', '..');
var passed = 0, failed = 0, exitCode = 0;
function check(l, c, d) { if (c) { passed++; console.log('PASS', l + (d ? ' :: ' + d : '')); } else { failed++; exitCode = 1; console.log('FAIL', l + (d ? ' :: ' + d : '')); } }
function getPort() { return new Promise(function(ok) { var s = net.createServer(); s.listen(0, function() { var p = s.address().port; s.close(function() { ok(p); }); }); }); }
function rmDir(p) { try { var e = fs.readdirSync(p); e.forEach(function(f) { var fp = path.join(p, f); if (fs.statSync(fp).isDirectory()) rmDir(fp); else fs.unlinkSync(fp); }); fs.rmdirSync(p); } catch(e) {} }

function fakeLogger() {
  return { info: function() {}, warn: function() {}, error: function() {}, debug: function() {} };
}

function baseEnv(extra) {
  return Object.assign({ PORT: '8799', TRANSLATION_PROVIDER: 'none', TZ: 'UTC', ADMIN_ACCESS_MODE: 'lan', ADMIN_ALLOWED_CIDRS: '127.0.0.0/8' }, extra || {});
}

// ---------------------------------------------------------------------------
// Part A — unit tests against the disconnect port and bootstrap.shutdown().
// ---------------------------------------------------------------------------
var { bootstrap } = require('../../src/app/bootstrap');
var { createMqttClientPort } = require('../../src/mqtt/mqtt-client-port');

// Track setTimeout/clearTimeout so we can assert the shutdown timer is cleared
// on both success and failure paths. Returns { install(), counts(), uninstall() }.
function timerSpy() {
  var origClear = global.clearTimeout;
  var clearCalls = 0;
  function install() { global.clearTimeout = function() { clearCalls++; return origClear.apply(this, arguments); }; }
  function uninstall() { global.clearTimeout = origClear; }
  function counts() { return clearCalls; }
  return { install: install, uninstall: uninstall, counts: counts };
}

async function runPortUnitTests() {
  console.log('=== Part A.1: disconnect port unit tests ===');

  // REAL_PORT_DISCONNECT_RETURNS_PROMISE
  await (async function() {
    var port = createMqttClientPort({ end: function(cb) { setImmediate(cb); } });
    var p = port.disconnect();
    check('REAL_PORT_DISCONNECT_RETURNS_PROMISE', p && typeof p.then === 'function');
    await p;
  })();

  // REAL_PORT_DISCONNECT_WAITS_FOR_END_CALLBACK
  await (async function() {
    var endCalled = false;
    var port = createMqttClientPort({ end: function(cb) { setImmediate(function() { endCalled = true; cb(); }); } });
    await port.disconnect();
    check('REAL_PORT_DISCONNECT_WAITS_FOR_END_CALLBACK', endCalled);
  })();

  // END_CALLBACK_ERROR_REJECTS
  await (async function() {
    var port = createMqttClientPort({ end: function(cb) { setImmediate(function() { cb(new Error('END_FAIL')); }); } });
    var err = null;
    try { await port.disconnect(); } catch(e) { err = e; }
    check('END_CALLBACK_ERROR_REJECTS', !!err && /END_FAIL/.test(err.message));
  })();

  // SECOND_DISCONNECT_IDEMPOTENT — second call returns same Promise and end() runs once
  await (async function() {
    var endCalls = 0;
    var port = createMqttClientPort({ end: function(cb) { endCalls++; setImmediate(cb); } });
    var p1 = port.disconnect();
    var p2 = port.disconnect();
    check('SECOND_DISCONNECT_IDEMPOTENT', p1 === p2);
    await p1;
    check('SECOND_DISCONNECT_IDEMPOTENT_END_ONCE', endCalls === 1, 'endCalls=' + endCalls);
  })();

  // SYNC_END_SUPPORTED — end() with no callback resolves immediately
  await (async function() {
    var called = false;
    var port = createMqttClientPort({ end: function() { called = true; } }); // end.length === 0
    await port.disconnect();
    check('SYNC_END_SUPPORTED', called);
  })();

  // NULL_CLIENT_NOOP — createMqttClientPort(null).disconnect() resolves
  await (async function() {
    var port = createMqttClientPort(null);
    var ok = true;
    try { await port.disconnect(); } catch(e) { ok = false; }
    check('NULL_CLIENT_NOOP', ok);
  })();
}

async function runBootstrapUnitTests() {
  console.log('\n=== Part A.2: bootstrap shutdown integration tests ===');

  // CONCURRENT_SHUTDOWN_RETURNS_SAME_PROMISE
  await (async function() {
    var boot = bootstrap({ env: baseEnv(), cwd: ROOT, listen: false, logger: fakeLogger() });
    var p1 = boot.shutdown();
    var p2 = boot.shutdown();
    check('CONCURRENT_SHUTDOWN_RETURNS_SAME_PROMISE', p1 === p2);
    await p1;
  })();

  // MQTT_CALLBACK_END_AWAITED — bootstrap awaits end(cb) via the port
  await (async function() {
    var endCalled = false;
    var mqttCallback = { end: function(cb) { setImmediate(function() { endCalled = true; cb(); }); } };
    var boot = bootstrap({ env: baseEnv(), cwd: ROOT, listen: false, logger: fakeLogger(), mqttClient: mqttCallback });
    await boot.shutdown();
    check('MQTT_CALLBACK_END_AWAITED', endCalled);
  })();

  // MQTT_REJECTION_PROPAGATED — end callback error → shutdown rejects
  await (async function() {
    var mqttReject = { end: function(cb) { setImmediate(function() { cb(new Error('MQTT_END_FAIL')); }); } };
    var boot = bootstrap({ env: baseEnv(), cwd: ROOT, listen: false, logger: fakeLogger(), mqttClient: mqttReject });
    var err = null;
    try { await boot.shutdown(); } catch(e) { err = e; }
    check('MQTT_REJECTION_PROPAGATED', !!err && /MQTT_END_FAIL/.test(err.message));
  })();

  // MQTT_THROW_PROPAGATED — end() throws synchronously → shutdown rejects
  await (async function() {
    var mqttThrow = { end: function() { throw new Error('THROW'); } };
    var boot = bootstrap({ env: baseEnv(), cwd: ROOT, listen: false, logger: fakeLogger(), mqttClient: mqttThrow });
    var err = null;
    try { await boot.shutdown(); } catch(e) { err = e; }
    check('MQTT_THROW_PROPAGATED', !!err && /THROW/.test(err.message));
  })();

  // MQTT_REJECTION_CLEARS_TIMER — when mqtt end rejects, the shutdown timer
  // must be cleared (no leaked SHUTDOWN_TIMEOUT). Asserted via clearTimeout spy.
  await (async function() {
    var spy = timerSpy();
    var mqttReject = { end: function(cb) { setImmediate(function() { cb(new Error('MQTT_END_FAIL')); }); } };
    var boot = bootstrap({ env: baseEnv({ BOOTSTRAP_SHUTDOWN_TIMEOUT_MS: '50' }), cwd: ROOT, listen: false, logger: fakeLogger(), mqttClient: mqttReject });
    var err = null;
    spy.install();
    try { try { await boot.shutdown(); } catch(e) { err = e; } }
    finally { spy.uninstall(); }
    check('MQTT_REJECTION_CLEARS_TIMER', !!err && /MQTT_END_FAIL/.test(err.message) && spy.counts() >= 1, 'clearCalls=' + spy.counts());
    // Wait beyond the timeout window; ensure no late SHUTDOWN_TIMEOUT surfaces.
    await new Promise(function(r) { setTimeout(r, 180); });
  })();

  // HTTP_REJECTION_CLEARS_TIMER — when server.close rejects, the shutdown
  // timer must be cleared. Uses overrides.server to inject a failing server.
  await (async function() {
    var spy = timerSpy();
    var failingServer = {
      close: function(cb) { setImmediate(function() { cb(new Error('HTTP_CLOSE_FAIL')); }); },
    };
    var mqttOk = { end: function(cb) { setImmediate(cb); } };
    var boot = bootstrap({ env: baseEnv({ BOOTSTRAP_SHUTDOWN_TIMEOUT_MS: '50' }), cwd: ROOT, listen: false, logger: fakeLogger(), server: failingServer, mqttClient: mqttOk });
    var err = null;
    spy.install();
    try { try { await boot.shutdown(); } catch(e) { err = e; } }
    finally { spy.uninstall(); }
    check('HTTP_REJECTION_CLEARS_TIMER', !!err && /HTTP_CLOSE_FAIL/.test(err.message) && spy.counts() >= 1, 'clearCalls=' + spy.counts());
    await new Promise(function(r) { setTimeout(r, 180); });
  })();

  // SHUTDOWN_TIMEOUT_CAUSES_FAILURE — end(cb) never resolves → timeout rejects
  await (async function() {
    var mqttHang = { end: function(cb) { /* never calls cb */ } };
    var boot = bootstrap({ env: baseEnv({ BOOTSTRAP_SHUTDOWN_TIMEOUT_MS: '100' }), cwd: ROOT, listen: false, logger: fakeLogger(), mqttClient: mqttHang });
    var timedOut = false;
    var start = Date.now();
    try { await boot.shutdown(); } catch(e) { timedOut = /SHUTDOWN_TIMEOUT/.test(e.message); }
    var elapsed = Date.now() - start;
    check('SHUTDOWN_TIMEOUT_CAUSES_FAILURE', timedOut && elapsed >= 90 && elapsed < 2000, 'elapsed=' + elapsed);
  })();
}

// ---------------------------------------------------------------------------
// Part B — real subprocess tests: SIGINT / SIGTERM / port rebind / exit code.
// ---------------------------------------------------------------------------
async function waitForServer(port, child) {
  for (var i = 0; i < 40; i++) {
    try {
      await new Promise(function(ok, fail) {
        http.get('http://127.0.0.1:' + port + '/health/live', function(r) { r.resume(); ok(); }).on('error', function(e) { fail(e); });
      });
      return true;
    } catch(e) { await new Promise(function(r) { setTimeout(r, 500); }); }
  }
  return false;
}

function signalTest(signal, label) {
  return new Promise(async function(resolve) {
    var TMPDIR = path.join(ROOT, 'test_shutdown_' + signal + '_' + Date.now());
    try { fs.mkdirSync(TMPDIR, { recursive: true }); } catch(e) {}
    var PORT = await getPort();
    var env = Object.assign({}, process.env, {
      PORT: String(PORT), ADMIN_ACCESS_MODE: 'lan', ADMIN_ALLOWED_CIDRS: '127.0.0.0/8',
      DATA_DIR: TMPDIR, TRANSLATION_PROVIDER: 'none', TZ: 'UTC', MQTT_ENABLED: 'false',
    });
    var child = spawn(process.execPath, [path.join(ROOT, 'server.js')], { env: env, cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    var stderrBuf = '';
    child.stderr.on('data', function(d) { stderrBuf += d.toString(); });

    var ready = await waitForServer(PORT, child);
    check(label + '_SERVER_STARTED', ready);
    if (!ready) { try { child.kill('SIGKILL'); } catch(e) {} rmDir(TMPDIR); resolve(); return; }

    // On Linux/CI this delivers a real POSIX signal that triggers process.on
    // ('SIGINT'/'SIGTERM') in server.js. On Windows, child.kill(signal)
    // terminates the process directly (no signal handler), so exit-code-0
    // cannot be asserted locally — Part A unit tests cover the handler path.
    var isWindows = process.platform === 'win32';
    child.kill(signal);

    var exitCode = null, exitSignal = null;
    var exited = false;
    child.on('exit', function(code, sig) { exitCode = code; exitSignal = sig; exited = true; });

    for (var j = 0; j < 60; j++) {
      await new Promise(function(r) { setTimeout(r, 500); });
      if (exited) break;
    }

    check(label + '_CLOSES_HTTP', exited);
    if (!isWindows) {
      console.log('  [' + label + '] exitCode=' + exitCode + ' signal=' + exitSignal + ' stderr_tail=' + JSON.stringify(stderrBuf.slice(-400)));
      check(label + '_EXIT_CODE_0', exitCode === 0, 'exitCode=' + exitCode);
      check(label + '_NO_SIGNAL_KILL', exitSignal === null || exitSignal === signal);
    } else {
      console.log('  [' + label + '] Windows: exitCode=' + exitCode + ' signal=' + exitSignal + ' (signal-handler exit-code asserted on Linux CI only)');
      check(label + '_PROCESS_EXITED', exited);
    }

    if (!exited) { try { child.kill('SIGKILL'); } catch(e) {} }

    // Verify port can be rebound after shutdown (PORT_REBIND).
    var errorOnRebind = false;
    try {
      await new Promise(function(ok, fail) {
        var s = http.createServer(function() {});
        s.listen(PORT, function() { s.close(function() { ok(); }); });
        s.on('error', function(e) { fail(e); });
      });
    } catch(e) { errorOnRebind = true; }
    check(label + '_PORT_REBIND', !errorOnRebind);

    rmDir(TMPDIR);
    resolve();
  });
}

async function runSignalTests() {
  console.log('\n=== Part B: real subprocess signal tests ===');
  await signalTest('SIGINT', 'SIGINT');
  await signalTest('SIGTERM', 'SIGTERM');
}

(async function() {
  await runPortUnitTests();
  await runBootstrapUnitTests();
  await runSignalTests();
  console.log('\n=== Summary:', passed, 'passed,', failed, 'failed ===');
  process.exit(exitCode);
})().catch(function(e) { console.error('CRASH', e && e.stack || e); process.exit(1); });
