var http = require('http'); var net = require('net'); var path = require('path'); var fs = require('fs'); var { spawn } = require('child_process');
var ROOT = path.join(__dirname, '..', '..'); var passed = 0, failed = 0, exitCode = 0;
function check(l, c) { if (c) { passed++; console.log('PASS', l) } else { failed++; exitCode = 1; console.log('FAIL', l) } }
function getPort() { return new Promise(function(ok) { var s = net.createServer(); s.listen(0, function() { var p = s.address().port; s.close(function() { ok(p); }); }); }); }

async function testShutdown() {
  console.log('=== Graceful Shutdown Test ===');
  var TMPDIR = path.join(ROOT, 'test_shutdown_' + Date.now());
  try { fs.mkdirSync(TMPDIR, { recursive: true }); } catch(e) {}
  var PORT = await getPort();

  var env = Object.assign({}, process.env, { PORT: String(PORT), ADMIN_ACCESS_MODE: 'token', DATA_DIR: TMPDIR, TRANSLATION_PROVIDER: 'none', TZ: 'UTC', MQTT_ENABLED: 'false' });
  var child = spawn(process.execPath, [path.join(ROOT, 'server.js')], { env: env, cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });

  // Wait for server ready
  var ready = false;
  for (var i = 0; i < 30; i++) {
    try {
      await new Promise(function(ok, fail) { http.get('http://127.0.0.1:' + PORT + '/health/live', function(r) { r.resume(); ok(); }).on('error', function(e) { fail(e); }); });
      ready = true; break;
    } catch(e) { await new Promise(function(r) { setTimeout(r, 1000); }); }
  }
  check('SERVER_STARTED', ready);
  if (!ready) { child.kill(); process.exit(1); }

  // Send SIGINT
  child.kill('SIGINT');
  var exited = false;
  for (var j = 0; j < 30; j++) {
    await new Promise(function(r) { setTimeout(r, 500); });
    try { process.kill(child.pid, 0); } catch(e) { exited = true; break; }
  }
  check('SIGINT_CLOSES_HTTP', exited);
  if (!exited) { child.kill('SIGKILL'); }

  // Verify port can be rebound
  var errorOnRebind = false;
  try {
    await new Promise(function(ok, fail) { var s = http.createServer(function(){}); s.listen(PORT, function() { s.close(function() { ok(); }); }); s.on('error', function(e) { fail(e); }); });
  } catch(e) { errorOnRebind = true; }
  check('PORT_CAN_BE_REBOUND_AFTER_SHUTDOWN', !errorOnRebind);

  try { rmDir(TMPDIR); } catch(e) {}
  console.log('=== Summary:', passed, 'passed,', failed, 'failed ===');
  process.exit(exitCode);
}

function rmDir(p) { try { var e = fs.readdirSync(p); e.forEach(function(f) { var fp = path.join(p, f); if (fs.statSync(fp).isDirectory()) rmDir(fp); else fs.unlinkSync(fp); }); fs.rmdirSync(p); } catch(e) {} }
testShutdown().catch(function(e) { console.error('CRASH', e.message); process.exit(1); });
