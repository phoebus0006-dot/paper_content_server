#!/usr/bin/env node
// Generate R2 golden .epf1 fixtures from pre-migration production code (R2_BASE_SHA)
// Uses INSTRUMENTED_PRODUCTION_EXPORT: creates a copy of the base SHA's server.js
// with __r2LegacyImageToFrameBuffer and __r2LegacyBuildFrameBuffer exports appended.
// No algorithms are reimplemented; only the real legacy functions are called.

var path = require('path');
var fs = require('fs');
var cp = require('child_process');
var crypto = require('crypto');
var sharp = require('sharp');
var ROOT = path.join(__dirname, '..');
var BASE_SHA = '9990b9f1d2eb7e7955b2be3714f4c79359ab594e';
var GOLDEN_DIR = path.join(ROOT, 'qa', 'fixtures', 'r2', 'golden');
var W = 800, H = 480;

var TMP = path.join(ROOT, 'tmp_r2_golden_' + Date.now());
console.log('Creating worktree at ' + TMP + ' from ' + BASE_SHA);
cp.execSync('git worktree add ' + TMP + ' ' + BASE_SHA, { cwd: ROOT, stdio: 'pipe' });

try {
  // Read legacy server.js from worktree
  var legacyServerPath = path.join(TMP, 'paper_content_server', 'server.js');
  var legacyCode = fs.readFileSync(legacyServerPath, 'utf8');
  var legacySha = crypto.createHash('sha256').update(legacyCode).digest('hex');

  // Create instrumented copy: append exports for the two legacy functions
  var instrumentedCode = legacyCode + '\n\n// --- R2 golden fixture instrumentation ---\n' +
    'module.exports.__r2LegacyImageToFrameBuffer = imageToFrameBuffer;\n' +
    'module.exports.__r2LegacyBuildFrameBuffer = buildFrameBuffer;\n';

  var instrumentedPath = path.join(TMP, 'paper_content_server', 'server_instrumented.js');
  fs.writeFileSync(instrumentedPath, instrumentedCode);

  // Write loader script that uses the instrumented legacy server
  var loaderScript = path.join(TMP, 'paper_content_server', '_golden_loader.js');
  var loaderBody = `
var path = require('path');
var fs = require('fs');
var crypto = require('crypto');
var sharp = require('sharp');

// Load INSTRUMENTED legacy production server.js (pre-migration, from the worktree)
// This gives us both imageToFrameBuffer AND buildFrameBuffer without re-implementing either
var server = require(path.join(__dirname, 'server_instrumented.js'));

var GOLDEN_DIR = ${JSON.stringify(GOLDEN_DIR)};
var W = ${W}, H = ${H};

fs.mkdirSync(GOLDEN_DIR, { recursive: true });

function makeRGB(r, g, b) {
  var buf = Buffer.alloc(W * H * 3);
  for (var i = 0; i < W * H; i++) { buf[i*3] = r; buf[i*3+1] = g; buf[i*3+2] = b; }
  return buf;
}
function makeRGBA(r, g, b, a) {
  var buf = Buffer.alloc(W * H * 4);
  for (var i = 0; i < W * H; i++) { buf[i*4] = r; buf[i*4+1] = g; buf[i*4+2] = b; buf[i*4+3] = a != null ? a : 255; }
  return buf;
}
function makeGradient() {
  var buf = Buffer.alloc(W * H * 3);
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var v = Math.floor((x / W) * 255);
      var off = (y * W + x) * 3;
      buf[off] = v; buf[off+1] = v; buf[off+2] = v;
    }
  }
  return buf;
}
function makeCheckerboard() {
  var buf = Buffer.alloc(W * H * 3);
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var isW = ((x + y) % 2) === 0;
      var v = isW ? 255 : 0;
      var off = (y * W + x) * 3;
      buf[off] = v; buf[off+1] = v; buf[off+2] = v;
    }
  }
  return buf;
}

var manifest = [];
var fixtures = [
  { name: 'solid-black', data: makeRGB(0, 0, 0), ch: 3 },
  { name: 'solid-white', data: makeRGB(255, 255, 255), ch: 3 },
  { name: 'solid-red', data: makeRGB(255, 0, 0), ch: 3 },
  { name: 'solid-blue', data: makeRGB(0, 0, 255), ch: 3 },
  { name: 'solid-green', data: makeRGB(0, 255, 0), ch: 3 },
  { name: 'solid-yellow', data: makeRGB(255, 255, 0), ch: 3 },
  { name: 'checkerboard', data: makeCheckerboard(), ch: 3 },
  { name: 'gradient', data: makeGradient(), ch: 3 },
  { name: 'rgba-solid', data: makeRGBA(0, 0, 0, 255), ch: 4 },
  { name: 'rgba-transparent', data: makeRGBA(255, 0, 0, 50), ch: 4 },
  { name: 'rgba-semi', data: makeRGBA(255, 255, 255, 200), ch: 4 },
];

(async function() {
  try {
    var svg = '<svg width="800" height="480"><rect width="800" height="480" fill="#4488cc"/><circle cx="400" cy="240" r="150" fill="#ffcc00" opacity="0.7"/><rect x="100" y="100" width="200" height="280" fill="#ff6644" opacity="0.5"/><rect x="500" y="80" width="200" height="320" fill="#44cc88" opacity="0.5"/></svg>';
    var realPhotoRaw = await sharp(Buffer.from(svg)).resize(800, 480, { fit: 'fill' }).flatten({ background: '#ffffff' }).raw().toBuffer();
    fixtures.push({ name: 'real-photo', data: realPhotoRaw, ch: 4 });
  } catch(e) { console.log('SKIP real-photo: ' + e.message); }

  for (var f = 0; f < fixtures.length; f++) {
    var fd = fixtures[f];

    // Call the REAL legacy production functions (no reimplementation)
    var legacyPayload = server.__r2LegacyImageToFrameBuffer(fd.data, W, H, fd.ch);
    var legacyFrame = server.__r2LegacyBuildFrameBuffer(legacyPayload);

    var inputSha = crypto.createHash('sha256').update(fd.data).digest('hex');
    var payloadSha = crypto.createHash('sha256').update(legacyPayload).digest('hex');
    var frameSha = crypto.createHash('sha256').update(legacyFrame).digest('hex');

    // Write full frame .epf1
    var filePath = path.join(GOLDEN_DIR, fd.name + '.epf1');
    fs.writeFileSync(filePath, legacyFrame);

    // Write payload-only file for separate verification
    var payloadPath = path.join(GOLDEN_DIR, fd.name + '.payload');
    fs.writeFileSync(payloadPath, legacyPayload);

    manifest.push({
      generated_by_sha: '${BASE_SHA}',
      legacy_server_sha256: '${legacySha}',
      generator_method: 'INSTRUMENTED_PRODUCTION_EXPORT',
      input_name: fd.name,
      input_sha256: inputSha,
      payload_sha256: payloadSha,
      frame_sha256: frameSha,
      payload_length: legacyPayload.length,
      frame_length: legacyFrame.length,
    });
    console.log('Generated ' + fd.name + '.epf1  payload=' + legacyPayload.length + '  frame=' + legacyFrame.length + '  sha256=' + frameSha);
  }

  fs.writeFileSync(path.join(GOLDEN_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('manifest.json written with ' + manifest.length + ' entries');
})().catch(function(e) { console.error('FATAL: ' + e.message); process.exit(1); });
`;
  fs.writeFileSync(loaderScript, loaderBody);

  console.log('Running generator with instrumented legacy server...');
  var nodeModulesPath = path.join(ROOT, 'node_modules');
  var env = Object.assign({}, process.env, {
    NODE_PATH: nodeModulesPath + path.delimiter + (process.env.NODE_PATH || '')
  });
  var result = cp.spawnSync(process.execPath, [loaderScript], {
    cwd: ROOT,
    env: env,
    stdio: 'inherit',
    timeout: 60000,
  });
  if (result.status !== 0) {
    throw new Error('Generator script exited with code ' + result.status);
  }

  // Verify
  var verifyPath = path.join(GOLDEN_DIR, 'manifest.json');
  if (fs.existsSync(verifyPath)) {
    var m = JSON.parse(fs.readFileSync(verifyPath, 'utf8'));
    var allOk = true;
    console.log('\n--- Verification ---');
    m.forEach(function(e) {
      var ok = e.payload_length === 192000 && e.frame_length === 192010;
      console.log((ok ? 'OK' : 'FAIL') + '  ' + e.input_name + '  payload=' + e.payload_length + '  frame=' + e.frame_length + '  sha256=' + e.frame_sha256.slice(0,16) + '...');
      if (!ok) allOk = false;
    });
    if (!allOk) throw new Error('Fixture verification failed: payload or frame length mismatch');
    console.log('\nAll ' + m.length + ' fixtures verified (payload=192000, frame=192010)');
  }

  // Clean up the instrumented file
  fs.unlinkSync(instrumentedPath);
  fs.unlinkSync(loaderScript);
} finally {
  console.log('\nCleaning up worktree...');
  cp.execSync('git worktree remove ' + TMP + ' --force', { cwd: ROOT, stdio: 'pipe' });
  console.log('Done.');
}
