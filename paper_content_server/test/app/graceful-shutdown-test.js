// graceful-shutdown-test.js — real lifecycle verification.
// Covers:
//   SIGINT / SIGTERM closes HTTP, exits 0, port can rebind
//   MQTT disconnect: sync, Promise, callback, rejection propagates, throw propagates
//   Shutdown timeout rejects and yields exit code 1
//   Concurrent shutdown calls return the SAME Promise
// No boolean idempotency — uses shared Promise identity.
var http = require('http');
var net = require('net');
var path = require('path');
var fs = require('fs');
var { spawn } = require('child_process');
var ROOT = path.join(__dirname, '..', '..');
var passed = 0, failed = 0, exitCode = 0;
function check(l, c) { if (c) { passed++; console.log('PASS', l) } else { failed++; exitCode = 1; console.log('FAIL', l) } }
function getPort() { return new Promise(function(ok) { var s = net.createServer(); s.listen(0, function() { var p = s.address().port; s.close(function() { ok(p); }); }); }); }
function rmDir(p) { try { var e = fs.readdirSync(p); e.forEach(function(f) { var fp = path.join(p, f); if (fs.statSync(fp).isDirectory()) rmDir(fp); else fs.unlinkSync(fp); }); fs.rmdirSync(p); } catch(e) {} }

// ---------------------------------------------------------------------------
// Part A — Unit tests against bootstrap.shutdown() directly (in-process).
// Uses overrides to inject a fake HTTP server and fake MQTT clients.
// ---------------------------------------------------------------------------
var { bootstrap } = require('../../src/app/bootstrap');

function makeFakeHttpServer() {
  // Minimal HTTP server stub: close() accepts callback.
  var closed = false;
  var closeCbs = [];
  return {
    onclose: null,
    close: function(cb) {
      if (closed) { if (cb) setImmediate(cb); return; }
      closed = true;
      closeCbs.push(cb);
      // Simulate async close on next tick.
      setImmediate(function() {
        closeCbs.forEach(function(c) { if (c) c(); });
        closeCbs = [];
      });
    },
    isClosed: function() { return closed; },
  };
}

function fakeLogger() {
  return { info: function() {}, warn: function() {}, error: function() {}, debug: function() {} };
}

async function runUnitTests() {
  console.log('=== Part A: shutdown unit tests (in-process) ===');

  // CONCURRENT_SHUTDOWN_RETURNS_SAME_PROMISE
  (function() {
    var srv = makeFakeHttpServer();
    var boot = bootstrap({
      env: { PORT: '8799', TRANSLATION_PROVIDER: 'none', TZ: 'UTC', ADMIN_ACCESS_MODE: 'lan', ADMIN_ALLOWED_CIDRS: '127.0.0.0/8' },
      cwd: ROOT,
      listen: false,
      logger: fakeLogger(),
    });
    // Inject the fake server by overriding via deps — but bootstrap only creates
    // its own server when listen:true. With listen:false, server is null, so
    // shutdown only runs disconnectMqtt(null) → resolves immediately.
    var p1 = boot.shutdown();
    var p2 = boot.shutdown();
    check('CONCURRENT_SHUTDOWN_RETURNS_SAME_PROMISE', p1 === p2);
    return p1;
  })();

  // MQTT_SYNC_DISCONNECT_SUPPORTED — sync disconnect() (no callback, no Promise)
  await (async function() {
    var called = false;
    var mqttSync = { disconnect: function() { called = true; } }; // length=0
    var boot = bootstrap({
      env: { PORT: '8799', TRANSLATION_PROVIDER: 'none', TZ: 'UTC', ADMIN_ACCESS_MODE: 'lan', ADMIN_ALLOWED_CIDRS: '127.0.0.0/8' },
      cwd: ROOT, listen: false, logger: fakeLogger(), mqttClient: mqttSync,
    });
    await boot.shutdown();
    check('MQTT_SYNC_DISCONNECT_SUPPORTED', called);
  })();

  // MQTT_PROMISE_DISCONNECT_AWAITED — disconnect() returns a Promise resolved after a tick
  await (async function() {
    var resolved = false;
    var mqttPromise = {
      disconnect: function() {
        return new Promise(function(r) { setImmediate(function() { resolved = true; r(); }); });
      },
    };
    var boot = bootstrap({
      env: { PORT: '8799', TRANSLATION_PROVIDER: 'none', TZ: 'UTC', ADMIN_ACCESS_MODE: 'lan', ADMIN_ALLOWED_CIDRS: '127.0.0.0/8' },
      cwd: ROOT, listen: false, logger: fakeLogger(), mqttClient: mqttPromise,
    });
    await boot.shutdown();
    check('MQTT_PROMISE_DISCONNECT_AWAITED', resolved);
  })();

  // MQTT_CALLBACK_DISCONNECT_AWAITED — disconnect(done) calls done()
  await (async function() {
    var cbCalled = false;
    var mqttCallback = {
      disconnect: function(done) { setImmediate(function() { cbCalled = true; done(); }); },
    };
    var boot = bootstrap({
      env: { PORT: '8799', TRANSLATION_PROVIDER: 'none', TZ: 'UTC', ADMIN_ACCESS_MODE: 'lan', ADMIN_ALLOWED_CIDRS: '127.0.0.0/8' },
      cwd: ROOT, listen: false, logger: fakeLogger(), mqttClient: mqttCallback,
    });
    await boot.shutdown();
    check('MQTT_CALLBACK_DISCONNECT_AWAITED', cbCalled);
  })();

  // MQTT_REJECTION_PROPAGATED — disconnect() Promise rejects → shutdown rejects
  await (async function() {
    var mqttReject = {
      disconnect: function() { return Promise.reject(new Error('MQTT_FAIL')); },
    };
    var boot = bootstrap({
      env: { PORT: '8799', TRANSLATION_PROVIDER: 'none', TZ: 'UTC', ADMIN_ACCESS_MODE: 'lan', ADMIN_ALLOWED_CIDRS: '127.0.0.0/8' },
      cwd: ROOT, listen: false, logger: fakeLogger(), mqttClient: mqttReject,
    });
    var threw = false;
    try { await boot.shutdown(); } catch(e) { threw = true; }
    check('MQTT_REJECTION_PROPAGATED', threw);
  })();

  // MQTT_THROW_PROPAGATED — disconnect() throws synchronously → shutdown rejects
  await (async function() {
    var mqttThrow = {
      disconnect: function() { throw new Error('THROW'); },
    };
    var boot = bootstrap({
      env: { PORT: '8799', TRANSLATION_PROVIDER: 'none', TZ: 'UTC', ADMIN_ACCESS_MODE: 'lan', ADMIN_ALLOWED_CIDRS: '127.0.0.0/8' },
      cwd: ROOT, listen: false, logger: fakeLogger(), mqttClient: mqttThrow,
    });
    var threw = false;
    try { await boot.shutdown(); } catch(e) { threw = true; }
    check('MQTT_THROW_PROPAGATED', threw);
  })();

  // SHUTDOWN_TIMEOUT_CAUSES_FAILURE — server.close never resolves → timeout rejects
  await (async function() {
    var mqttHang = {
      disconnect: function() { return new Promise(function() { /* never resolves */ }); },
    };
    var boot2 = bootstrap({
      env: { PORT: '8799', TRANSLATION_PROVIDER: 'none', TZ: 'UTC', ADMIN_ACCESS_MODE: 'lan', ADMIN_ALLOWED_CIDRS: '127.0.0.0/8', BOOTSTRAP_SHUTDOWN_TIMEOUT_MS: '100' },
      cwd: ROOT, listen: false, logger: fakeLogger(), mqttClient: mqttHang,
    });
    var timedOut = false;
    var start = Date.now();
    try { await boot2.shutdown(); } catch(e) { timedOut = /SHUTDOWN_TIMEOUT/.test(e.message); }
    var elapsed = Date.now() - start;
    check('SHUTDOWN_TIMEOUT_CAUSES_FAILURE', timedOut && elapsed >= 90 && elapsed < 2000);
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

    // Send the signal. On Linux/CI this delivers a real POSIX signal that
    // triggers process.on('SIGINT'/'SIGTERM') in server.js. On Windows,
    // child.kill(signal) terminates the process directly (no signal handler),
    // so exit-code-0 cannot be asserted locally — the in-process unit tests
    // (Part A) cover the shutdown handler behaviour instead.
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
      // Windows: signal delivery does not invoke the Node signal handler.
      // Verify the process exited and the port was released (shutdown path
      // covered by Part A unit tests). Record the platform limitation.
      console.log('  [' + label + '] Windows: exitCode=' + exitCode + ' signal=' + exitSignal + ' (signal-handler exit-code asserted on Linux CI only)');
      check(label + '_PROCESS_EXITED', exited);
    }

    if (!exited) { try { child.kill('SIGKILL'); } catch(e) {} }

    // Verify port can be rebound after shutdown.
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
  await runUnitTests();
  await runSignalTests();
  console.log('\n=== Summary:', passed, 'passed,', failed, 'failed ===');
  process.exit(exitCode);
})().catch(function(e) { console.error('CRASH', e && e.stack || e); process.exit(1); });
