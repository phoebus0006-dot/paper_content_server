#!/usr/bin/env node
// R2.9: Byte-for-byte parity test — golden fixtures
// Uses hand-coded legacy reference that mirrors server.js exactly.

var path = require('path');
var crypto = require('crypto');
var ROOT = path.join(__dirname, '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}

var epaperImageFrame = require(path.join(ROOT, 'src', 'epaper', 'image-frame'));
var sharp = require('sharp');
var child_process = require('child_process');

var W = 800, H = 480;
var PAYLOAD_BYTES = Math.ceil((W * H) / 2);

// ---------------------------------------------------------------------------
// LEGACY reference — mirrors server.js's palette + imageToFrameBuffer exactly
var LEGACY_PALETTE = [
  { code: 0, name: 'black', rgb: [0, 0, 0] },
  { code: 1, name: 'white', rgb: [255, 255, 255] },
  { code: 2, name: 'yellow', rgb: [255, 255, 0] },
  { code: 3, name: 'red', rgb: [255, 0, 0] },
  { code: 5, name: 'blue', rgb: [0, 0, 255] },
  { code: 6, name: 'green', rgb: [0, 255, 0] },
];

function legacyNearest(r, g, b) {
  var best = LEGACY_PALETTE[0];
  var bestDist = Number.POSITIVE_INFINITY;
  for (var i = 0; i < LEGACY_PALETTE.length; i++) {
    var c = LEGACY_PALETTE[i];
    var dr = r - c.rgb[0], dg = g - c.rgb[1], db = b - c.rgb[2];
    var dist = dr*dr + dg*dg + db*db;
    if (dist < bestDist) { bestDist = dist; best = c; }
  }
  return best.code;
}

function legacyImageToFrameBuffer(raw, width, height, channels) {
  var output = Buffer.alloc(PAYLOAD_BYTES, 0x11);
  var pixels = new Float32Array(width * height * 3);
  var inputChannels = Math.max(3, Number(channels) || 3);
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      var pi = y * width + x;
      var off = pi * inputChannels;
      var p = pi * 3;
      var r = raw[off] != null ? raw[off] : 255;
      var g = raw[off + 1] != null ? raw[off + 1] : r;
      var b = raw[off + 2] != null ? raw[off + 2] : r;
      if (inputChannels >= 4) {
        var a = raw[off + 3] != null ? raw[off + 3] : 255;
        if (a < 128) { r = 255; g = 255; b = 255; }
      }
      pixels[p] = r; pixels[p+1] = g; pixels[p+2] = b;
    }
  }
  for (var yi = 0; yi < height; yi++) {
    for (var xi = 0; xi < width; xi++) {
      var idx = (yi * width + xi) * 3;
      var code = legacyNearest(pixels[idx], pixels[idx+1], pixels[idx+2]);
      var pi2 = yi * width + xi;
      var bi = Math.floor(pi2 / 2);
      if (pi2 % 2 === 0) {
        output[bi] = (output[bi] & 0x0F) | ((code & 0x0F) << 4);
      } else {
        output[bi] = (output[bi] & 0xF0) | (code & 0x0F);
      }
    }
  }
  return output;
}

function legacyBuildFrame(payload) {
  var h = Buffer.alloc(10);
  h.write('EPF1', 0, 4, 'ascii');
  h.writeUInt16LE(800, 4);
  h.writeUInt16LE(480, 6);
  h.writeUInt8(49, 8);
  h.writeUInt8(1, 9);
  return Buffer.concat([h, payload]);
}

// ---------------------------------------------------------------------------
// Fixture helpers
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
function makeSolidRGBA(r, g, b, a) { return makeRGBA(r, g, b, a); }

// ---------------------------------------------------------------------------
async function run() {
  console.log('--- R2.9: Byte-for-byte parity ---');
  var fixtureDefs = [
    { name: 'solid-black-3ch', data: makeRGB(0, 0, 0), ch: 3 },
    { name: 'solid-white-3ch', data: makeRGB(255, 255, 255), ch: 3 },
    { name: 'solid-red-3ch', data: makeRGB(255, 0, 0), ch: 3 },
    { name: 'solid-blue-3ch', data: makeRGB(0, 0, 255), ch: 3 },
    { name: 'solid-green-3ch', data: makeRGB(0, 255, 0), ch: 3 },
    { name: 'solid-yellow-3ch', data: makeRGB(255, 255, 0), ch: 3 },
    { name: 'gradient', data: makeGradient(), ch: 3 },
    { name: 'checkerboard', data: makeCheckerboard(), ch: 3 },
    { name: 'solid-black-rgba', data: makeSolidRGBA(0, 0, 0, 255), ch: 4 },
    { name: 'solid-red-50pct', data: makeSolidRGBA(255, 0, 0, 50), ch: 4 },
    { name: 'solid-white-200pct', data: makeSolidRGBA(255, 255, 255, 200), ch: 4 },
  ];

  // Add real-photo simulation via sharp
  try {
    var svg = '<svg width="800" height="480"><rect width="800" height="480" fill="#4488cc"/><circle cx="400" cy="240" r="150" fill="#ffcc00" opacity="0.7"/><rect x="100" y="100" width="200" height="280" fill="#ff6644" opacity="0.5"/><rect x="500" y="80" width="200" height="320" fill="#44cc88" opacity="0.5"/></svg>';
    var realPhotoRaw = await sharp(Buffer.from(svg)).resize(800, 480, { fit: 'fill' }).flatten({ background: '#ffffff' }).raw().toBuffer();
    fixtureDefs.push({ name: 'real-photo-sim', data: realPhotoRaw, ch: 4 });
  } catch(e) { console.log('SKIP real-photo-sim: ' + e.message); }

  var fixtures = [];
  var allOk = true;
  var headSha = child_process.execSync('git rev-parse HEAD', {cwd: ROOT}).toString().trim();

  for (var f = 0; f < fixtureDefs.length; f++) {
    var fd = fixtureDefs[f];
    var legacyPayload = legacyImageToFrameBuffer(fd.data, W, H, fd.ch);
    var legacyFrame = legacyBuildFrame(legacyPayload);
    var newPayload = epaperImageFrame.imageToFrameBuffer(fd.data, W, H, fd.ch, false);
    var newFrame = epaperImageFrame.buildFrameBuffer(newPayload);

    var legacyHash = crypto.createHash('sha256').update(legacyFrame).digest('hex');
    var newHash = crypto.createHash('sha256').update(newFrame).digest('hex');
    var inputHash = crypto.createHash('sha256').update(fd.data).digest('hex');
    var same = legacyFrame.length === newFrame.length && legacyHash === newHash && Buffer.compare(legacyFrame, newFrame) === 0;

    fixtures.push({
      name: fd.name,
      legacyLen: legacyFrame.length,
      newLen: newFrame.length,
      legacyHash: legacyHash,
      newHash: newHash,
      inputSha256: inputHash,
      same: same,
    });

    if (same) {
      t(fd.name + ': len=' + legacyFrame.length + ' sha256=' + legacyHash.slice(0,16) + '...', true, '');
    } else {
      t(fd.name + ': len=' + legacyFrame.length + '/' + newFrame.length + ' hash=' + legacyHash.slice(0,12) + '/' + newHash.slice(0,12), false, 'MISMATCH');
      allOk = false;
    }
  }

  console.log('\n--- Golden Fixture Registry ---');
  console.log('generated_by_sha=' + headSha);
  console.log('fixtures=' + fixtures.length);
  for (var g = 0; g < fixtures.length; g++) {
    console.log('  ' + fixtures[g].name + ': input_sha256=' + fixtures[g].inputSha256 + ' output_sha256=' + fixtures[g].newHash + ' len=' + fixtures[g].newLen);
  }

  t('BYTE_PARITY', allOk, allOk ? '' : 'some mismatches');
  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}

run().catch(function(err) { console.log('FATAL: ' + err.message); process.exit(1); });
