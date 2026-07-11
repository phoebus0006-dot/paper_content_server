#!/usr/bin/env node
// R2: Byte-for-byte parity — new modules vs real golden fixtures from base SHA
// Tests image-to-frame WITHOUT dithering (matches legacy behavior)

var path = require('path');
var fs = require('fs');
var crypto = require('crypto');
var sharp = require('sharp');
var ROOT = path.join(__dirname, '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}

var epaperImageFrame = require(path.join(ROOT, 'src', 'epaper', 'image-frame'));
var GOLDEN_DIR = path.join(ROOT, 'test', 'fixtures', 'r2', 'golden');
var W = 800, H = 480;

// Verify manifest
var manifestPath = path.join(GOLDEN_DIR, 'manifest.json');
var manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
var headSha = require('child_process').execSync('git rev-parse HEAD', {cwd: ROOT}).toString().trim();
t('MANIFEST_EXISTS', !!manifest, manifest.length + ' entries');
t('MANIFEST_GENERATED_BY_LEGACY', manifest[0].generated_by_sha === '9990b9f1d2eb7e7955b2be3714f4c79359ab594e', manifest[0].generated_by_sha);

function makeInputFromGolden(name) {
  // Re-create the input buffer that would have generated the golden fixture
  // Same helper logic as the original generator
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
  var defs = {
    'solid-black': { data: makeRGB(0, 0, 0), ch: 3 },
    'solid-white': { data: makeRGB(255, 255, 255), ch: 3 },
    'solid-red': { data: makeRGB(255, 0, 0), ch: 3 },
    'solid-blue': { data: makeRGB(0, 0, 255), ch: 3 },
    'solid-green': { data: makeRGB(0, 255, 0), ch: 3 },
    'solid-yellow': { data: makeRGB(255, 255, 0), ch: 3 },
    'checkerboard': { data: makeCheckerboard(), ch: 3 },
    'gradient': { data: makeGradient(), ch: 3 },
    'rgba-solid': { data: makeRGBA(0, 0, 0, 255), ch: 4 },
    'rgba-transparent': { data: makeRGBA(255, 0, 0, 50), ch: 4 },
    'rgba-semi': { data: makeRGBA(255, 255, 255, 200), ch: 4 },
  };
  return defs[name];
}

async function run() {
  console.log('--- R2: Golden Fixture Parity ---');

  // 1. Load all golden .epf1 files + manifest
  var goldenFrames = {};
  for (var m = 0; m < manifest.length; m++) {
    var entry = manifest[m];
    var goldenPath = path.join(GOLDEN_DIR, entry.input_name + '.epf1');
    if (!fs.existsSync(goldenPath)) {
      t('GOLDEN_FILE_' + entry.input_name, false, 'file not found: ' + goldenPath);
      continue;
    }
    goldenFrames[entry.input_name] = {
      data: fs.readFileSync(goldenPath),
      sha256: entry.output_sha256,
      length: entry.output_length,
    };
  }

  // 2. Generate real-photo input using sharp
  var realPhotoInput;
  try {
    var svg = '<svg width="800" height="480"><rect width="800" height="480" fill="#4488cc"/><circle cx="400" cy="240" r="150" fill="#ffcc00" opacity="0.7"/><rect x="100" y="100" width="200" height="280" fill="#ff6644" opacity="0.5"/><rect x="500" y="80" width="200" height="320" fill="#44cc88" opacity="0.5"/></svg>';
    realPhotoInput = await sharp(Buffer.from(svg)).resize(800, 480, { fit: 'fill' }).flatten({ background: '#ffffff' }).raw().toBuffer();
  } catch(e) {
    t('REAL_PHOTO_INPUT', false, e.message);
  }

  // 3. For each golden fixture, generate new module output (dithering=false) and compare
  var allGoldenOk = true;
  var goldenNames = Object.keys(goldenFrames).sort();
  for (var g = 0; g < goldenNames.length; g++) {
    var name = goldenNames[g];
    var golden = goldenFrames[name];
    var def = makeInputFromGolden(name);
    if (!def) {
      if (name === 'real-photo' && realPhotoInput) {
        def = { data: realPhotoInput, ch: 4 };
      } else {
        t('GOLDEN_' + name + '_INPUT', false, 'no input definition');
        continue;
      }
    }
    var newPayload = epaperImageFrame.imageToFrameBuffer(def.data, W, H, def.ch, false);
    var newFrame = epaperImageFrame.buildFrameBuffer(newPayload);
    var newSha = crypto.createHash('sha256').update(newFrame).digest('hex');
    var same = golden.length === newFrame.length && golden.sha256 === newSha && Buffer.compare(golden.data, newFrame) === 0;
    if (same) {
      t(name + ': len=' + golden.length + ' sha256=' + golden.sha256.slice(0,16) + '...', true);
    } else {
      t(name, false, 'LEN ' + golden.length + '/' + newFrame.length + ' SHA ' + golden.sha256.slice(0,12) + '/' + newSha.slice(0,12));
      allGoldenOk = false;
    }
  }
  t('GOLDEN_PARITY', allGoldenOk, allGoldenOk ? 'all ' + goldenNames.length + ' fixtures match' : '');

  // 4. Dithered output: verify dithering actually changes output for gradient/real-photo
  // Solid-color and checkerboard fixtures have zero error so dithering has no effect
  var ditheredNames = ['gradient', 'real-photo'];
  var ditheredAllOk = true;
  for (var d = 0; d < ditheredNames.length; d++) {
    var name = ditheredNames[d];
    var def = makeInputFromGolden(name);
    if (!def && name === 'real-photo' && realPhotoInput) def = { data: realPhotoInput, ch: 4 };
    if (!def) continue;
    var nonDithered = epaperImageFrame.imageToFrameBuffer(def.data, W, H, def.ch, false);
    var dithered = epaperImageFrame.imageToFrameBuffer(def.data, W, H, def.ch, true);
    var ndFrame = epaperImageFrame.buildFrameBuffer(nonDithered);
    var dFrame = epaperImageFrame.buildFrameBuffer(dithered);
    var ndSha = crypto.createHash('sha256').update(ndFrame).digest('hex');
    var dSha = crypto.createHash('sha256').update(dFrame).digest('hex');
    var differs = ndSha !== dSha;
    t(name + '_DITHERED', differs, differs ? 'dithered differs from non-dithered' : 'IDENTICAL');
    if (!differs) ditheredAllOk = false;
  }
  t('DITHERED_DIFFERS', ditheredAllOk, ditheredAllOk ? 'gradient and real-photo differ with dithering' : '');

  var totalFixtures = Object.keys(goldenFrames).length;
  console.log('\n--- Server Wrapper Parity ---');
  // 5. Production wrapper test: require server.js and call through it
  var serverOk = true;
  var env = Object.assign({}, process.env, { PORT: '0', DITHERING: '0', PHOTO_QUANT_MODE: 'clean', TRANSLATION_PROVIDER: 'none', DATA_DIR: path.join(ROOT, 'tmp_r2_wrapper_' + Date.now()) });
  var serverMod = require(path.join(ROOT, 'server.js'));
  for (var s = 0; s < goldenNames.length; s++) {
    var name = goldenNames[s];
    var golden = goldenFrames[name];
    var def = makeInputFromGolden(name);
    if (!def) {
      if (name === 'real-photo' && realPhotoInput) def = { data: realPhotoInput, ch: 4 };
      else continue;
    }
    var payload = serverMod.imageToFrameBuffer(def.data, W, H, def.ch);
    var frame = epaperImageFrame.buildFrameBuffer(payload);
    var sSha = crypto.createHash('sha256').update(frame).digest('hex');
    var sOk = golden.length === frame.length && golden.sha256 === sSha && Buffer.compare(golden.data, frame) === 0;
    if (sOk) {
      t('SERVER_WRAPPER_' + name + ': len=' + golden.length + ' sha256=' + golden.sha256.slice(0,16) + '...', true);
    } else {
      t('SERVER_WRAPPER_' + name, false, 'LEN ' + golden.length + '/' + frame.length + ' SHA ' + golden.sha256.slice(0,12) + '/' + sSha.slice(0,12));
      serverOk = false;
    }
  }
  t('SERVER_WRAPPER_PARITY', serverOk, serverOk ? 'all ' + totalFixtures + ' wrappers match' : '');

  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}

run().catch(function(err) { console.log('FATAL: ' + err.message); process.exit(1); });
