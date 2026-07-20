#!/usr/bin/env node
// R2: Byte-for-byte parity — new modules vs real golden fixtures from base SHA
// Tests both PAYLOAD (image-to-frame) and FULL FRAME (buildFrameBuffer)
// All golden fixtures generated via INSTRUMENTED_PRODUCTION_EXPORT from base SHA

var path = require('path');
var fs = require('fs');
var crypto = require('crypto');
var sharp = require('sharp');
var ROOT = path.join(__dirname, '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}

var GOLDEN_DIR = path.join(ROOT, 'test', 'fixtures', 'r2', 'golden');
var W = 800, H = 480;

function makeInputForFixture(name) {
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
  return defs[name] || null;
}

async function run() {
  console.log('--- R2: Golden Fixture Parity ---');

  // Load manifest
  var manifestPath = path.join(GOLDEN_DIR, 'manifest.json');
  var manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  t('MANIFEST_EXISTS', !!manifest, manifest.length + ' entries');
  t('GENERATOR_METHOD', manifest[0].generator_method === 'INSTRUMENTED_PRODUCTION_EXPORT', manifest[0].generator_method);

  // Load all golden .epf1 files + manifest data
  var goldenByInput = {};
  manifest.forEach(function(entry) {
    var goldenPath = path.join(GOLDEN_DIR, entry.input_name + '.epf1');
    if (!fs.existsSync(goldenPath)) return;
    goldenByInput[entry.input_name] = {
      frameData: fs.readFileSync(goldenPath),
      frameSha: entry.frame_sha256,
      frameLen: entry.frame_length,
      payloadSha: entry.payload_sha256,
      payloadLen: entry.payload_length,
    };
  });

  // Require new module AFTER reading files (no side effects)
  var epaperImageFrame = require(path.join(ROOT, 'src', 'epaper', 'image-frame'));

  // Generate real-photo input
  var realPhotoInput;
  try {
    var svg = '<svg width="800" height="480"><rect width="800" height="480" fill="#4488cc"/><circle cx="400" cy="240" r="150" fill="#ffcc00" opacity="0.7"/><rect x="100" y="100" width="200" height="280" fill="#ff6644" opacity="0.5"/><rect x="500" y="80" width="200" height="320" fill="#44cc88" opacity="0.5"/></svg>';
    realPhotoInput = await sharp(Buffer.from(svg)).resize(800, 480, { fit: 'fill' }).flatten({ background: '#ffffff' }).raw().toBuffer();
  } catch(e) {
    t('REAL_PHOTO_INPUT', false, e.message);
  }

  var names = Object.keys(goldenByInput).sort();
  var payloadPass = 0, payloadFail = 0;
  var framePass = 0, frameFail = 0;

  // Test 1: PAYLOAD parity — legacy payload == new module payload
  console.log('\n--- PAYLOAD PARITY ---');
  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    var golden = goldenByInput[name];
    var def = makeInputForFixture(name);
    if (!def) {
      if (name === 'real-photo' && realPhotoInput) def = { data: realPhotoInput, ch: 4 };
      else continue;
    }
    var newPayload = epaperImageFrame.imageToFrameBuffer(def.data, W, H, def.ch, false);
    var newPayloadSha = crypto.createHash('sha256').update(newPayload).digest('hex');
    var ok = golden.payloadLen === newPayload.length && golden.payloadSha === newPayloadSha && Buffer.compare ? true : false;
    // Buffer.compare
    // Need a way to get legacy payload. We don't have it directly from the golden .epf1.
    // The .epf1 contains the full frame (header + payload). We need to extract payload.
    // But we don't have a separate legacy payload file anymore.
    // Actually we DO: the legacy payload is the .epf1 minus the 10-byte header.
    var legacyPayload = golden.frameData.slice(10);
    var payloadCompare = Buffer.compare(legacyPayload, newPayload) === 0;
    ok = golden.payloadLen === newPayload.length && payloadCompare;
    if (ok) {
      t('PAYLOAD_' + name + ': len=' + newPayload.length + ' sha256=' + newPayloadSha.slice(0,16) + '...', true);
      payloadPass++;
    } else {
      var legacyPayloadSha = crypto.createHash('sha256').update(legacyPayload).digest('hex');
      t('PAYLOAD_' + name, false, 'LEN ' + golden.payloadLen + '/' + newPayload.length + ' SHA ' + legacyPayloadSha.slice(0,12) + '/' + newPayloadSha.slice(0,12));
      payloadFail++;
    }
  }

  // Test 2: FULL FRAME parity — legacy frame == new module frame
  console.log('\n--- FULL FRAME PARITY ---');
  for (var j = 0; j < names.length; j++) {
    var name = names[j];
    var golden = goldenByInput[name];
    var def = makeInputForFixture(name);
    if (!def) {
      if (name === 'real-photo' && realPhotoInput) def = { data: realPhotoInput, ch: 4 };
      else continue;
    }
    var newPayload = epaperImageFrame.imageToFrameBuffer(def.data, W, H, def.ch, false);
    var newFrame = epaperImageFrame.buildFrameBuffer(newPayload);
    var newFrameSha = crypto.createHash('sha256').update(newFrame).digest('hex');
    var ok = golden.frameLen === newFrame.length && golden.frameSha === newFrameSha && Buffer.compare(golden.frameData, newFrame) === 0;
    if (ok) {
      t('FRAME_' + name + ': len=' + newFrame.length + ' sha256=' + newFrameSha.slice(0,16) + '...', true);
      framePass++;
    } else {
      t('FRAME_' + name, false, 'LEN ' + golden.frameLen + '/' + newFrame.length + ' SHA ' + golden.frameSha.slice(0,12) + '/' + newFrameSha.slice(0,12));
      frameFail++;
    }
  }

  console.log('\n--- SUMMARY ---');
  t('PAYLOAD_PARITY', payloadFail === 0, payloadPass + '/' + (payloadPass + payloadFail) + ' pass');
  t('FULL_FRAME_PARITY', frameFail === 0, framePass + '/' + (framePass + frameFail) + ' pass');

  // Test 3: SERVER WRAPPER parity — server.js wrapper == golden frame
  console.log('\n--- SERVER WRAPPER PARITY ---');
  var serverMod = require(path.join(ROOT, 'server.js'));
  var wrapperPass = 0, wrapperFail = 0;
  for (var k = 0; k < names.length; k++) {
    var name = names[k];
    var golden = goldenByInput[name];
    var def = makeInputForFixture(name);
    if (!def) {
      if (name === 'real-photo' && realPhotoInput) def = { data: realPhotoInput, ch: 4 };
      else continue;
    }
    var sPayload = serverMod.imageToFrameBuffer(def.data, W, H, def.ch);
    var sFrame = epaperImageFrame.buildFrameBuffer(sPayload);
    var sSha = crypto.createHash('sha256').update(sFrame).digest('hex');
    var ok = golden.frameLen === sFrame.length && golden.frameSha === sSha && Buffer.compare(golden.frameData, sFrame) === 0;
    if (ok) {
      t('WRAPPER_' + name + ': len=' + sFrame.length + ' sha256=' + sSha.slice(0,16) + '...', true);
      wrapperPass++;
    } else {
      t('WRAPPER_' + name, false, 'LEN ' + golden.frameLen + '/' + sFrame.length + ' SHA ' + golden.frameSha.slice(0,12) + '/' + sSha.slice(0,12));
      wrapperFail++;
    }
  }
  t('SERVER_WRAPPER_PARITY', wrapperFail === 0, wrapperPass + '/' + (wrapperPass + wrapperFail) + ' pass');

  // Test 4: DITHERED divergence — gradient and real-photo differ with dithering
  console.log('\n--- DITHERED DIVERGENCE ---');
  var ditheredOk = true;
  var ditherNames = ['gradient', 'real-photo'];
  for (var d = 0; d < ditherNames.length; d++) {
    var name = ditherNames[d];
    var def = makeInputForFixture(name);
    if (!def && name === 'real-photo' && realPhotoInput) def = { data: realPhotoInput, ch: 4 };
    if (!def) continue;
    var nonDithered = epaperImageFrame.imageToFrameBuffer(def.data, W, H, def.ch, false);
    var dithered = epaperImageFrame.imageToFrameBuffer(def.data, W, H, def.ch, true);
    var ndSha = crypto.createHash('sha256').update(epaperImageFrame.buildFrameBuffer(nonDithered)).digest('hex');
    var dSha = crypto.createHash('sha256').update(epaperImageFrame.buildFrameBuffer(dithered)).digest('hex');
    var differs = ndSha !== dSha;
    t(name + '_DITHERED', differs, differs ? 'dithered != non-dithered' : 'IDENTICAL');
    if (!differs) ditheredOk = false;
  }
  t('DITHERED_DIFFERS', ditheredOk, '');

  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}

run().catch(function(err) { console.log('FATAL: ' + err.message); process.exit(1); });
