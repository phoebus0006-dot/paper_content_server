#!/usr/bin/env node
// Generate R2 golden .epf1 fixtures from pre-migration production code (R2_BASE_SHA)
// Uses git worktree to access the real legacy server.js

var path = require('path');
var fs = require('fs');
var cp = require('child_process');
var crypto = require('crypto');
var sharp = require('sharp');
var ROOT = path.join(__dirname, '..');
var BASE_SHA = '9990b9f1d2eb7e7955b2be3714f4c79359ab594e';
var GOLDEN_DIR = path.join(ROOT, 'test', 'fixtures', 'r2', 'golden');
var W = 800, H = 480;

var TMP = path.join(ROOT, 'tmp_r2_golden_' + Date.now());
console.log('Creating worktree at ' + TMP + ' from ' + BASE_SHA);
cp.execSync('git worktree add ' + TMP + ' ' + BASE_SHA, { cwd: ROOT, stdio: 'pipe' });

try {
  // Write a small loader script that bridges the worktree server.js
  var loaderScript = path.join(TMP, 'paper_content_server', '_golden_loader.js');
  var loaderBody = `
var path = require('path');
var fs = require('fs');
var crypto = require('crypto');
var sharp = require('sharp');

// Load legacy production server.js (pre-migration, from the worktree)
var server = require(path.join(__dirname, 'server.js'));

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
function buildFrame(payload) {
  var h = Buffer.alloc(10);
  h.write('EPF1', 0, 4, 'ascii');
  h.writeUInt16LE(W, 4);
  h.writeUInt16LE(H, 6);
  h.writeUInt8(49, 8);
  h.writeUInt8(1, 9);
  return Buffer.concat([h, payload]);
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
    var payload = server.imageToFrameBuffer(fd.data, W, H, fd.ch);
    var frame = buildFrame(payload);
    var inputSha = crypto.createHash('sha256').update(fd.data).digest('hex');
    var outputSha = crypto.createHash('sha256').update(frame).digest('hex');
    var filePath = path.join(GOLDEN_DIR, fd.name + '.epf1');
    fs.writeFileSync(filePath, frame);
    manifest.push({
      generated_by_sha: '${BASE_SHA}',
      generator_command: 'node paper_content_server/_golden_loader.js',
      input_name: fd.name,
      input_sha256: inputSha,
      output_sha256: outputSha,
      output_length: frame.length,
    });
    console.log('Generated ' + fd.name + '.epf1  len=' + frame.length + '  sha256=' + outputSha);
  }

  fs.writeFileSync(path.join(GOLDEN_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('manifest.json written with ' + manifest.length + ' entries');
})().catch(function(e) { console.error('FATAL: ' + e.message); process.exit(1); });
`;
  fs.writeFileSync(loaderScript, loaderBody);

  // Run from CURRENT root so node_modules resolves correctly.
  // The loader script in the worktree requires sharp (finds it via current root's node_modules)
  // and requires server.js from the worktree (finds it via __dirname relative path).
  console.log('Running generator (NODE_PATH set for node_modules resolution)...');
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

  var manifestPath = path.join(GOLDEN_DIR, 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    var m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    console.log('\nGolden fixtures generated: ' + m.length + ' files in ' + GOLDEN_DIR);
    m.forEach(function(e) {
      console.log('  ' + e.input_name + '.epf1  ' + e.output_length + ' bytes  ' + e.output_sha256.slice(0, 16) + '...');
    });
  }
} finally {
  console.log('\nCleaning up worktree...');
  cp.execSync('git worktree remove ' + TMP + ' --force', { cwd: ROOT, stdio: 'pipe' });
  console.log('Done.');
}
