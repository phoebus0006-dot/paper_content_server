#!/usr/bin/env node
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

var CFS = require(path.join(ROOT, 'src', 'custom-library', 'custom-file-store')).createFileStore;
var fs = require('fs');
var os = require('os');
var tmp = path.join(os.tmpdir(), 'r8_dm_' + Date.now());
fs.mkdirSync(tmp, { recursive: true });
var qDir = path.join(tmp, 'quarantine');
var aDir = path.join(tmp, 'assets');
fs.mkdirSync(qDir); fs.mkdirSync(aDir);
var lg = { info: function() {}, warn: function() {}, error: function() {} };

async function run() {
  var store = CFS(qDir, aDir, lg);
  var testFile = path.join(tmp, 'test.png');
  // Create a minimal valid PNG
  var sharp = require('sharp');
  var buf = await sharp({ create: { width: 10, height: 10, channels: 3, background: { r: 255, g: 0, b: 0 } } }).png().toBuffer();
  fs.writeFileSync(testFile, buf);
  var qPath = store.storeQuarantine(testFile);
  var decoded = await store.decodeAndRecompute(qPath);
  t('DECODED_HAS_WIDTH', decoded.width > 0, 'width=' + decoded.width);
  t('DECODED_HAS_HEIGHT', decoded.height > 0, 'height=' + decoded.height);
  t('DECODED_HAS_SHA256', decoded.sha256.length === 64, '');
  t('DECODED_HAS_MIME', decoded.mimeType === 'image/png', decoded.mimeType);
  store.cleanup(qPath);
  try { fs.rmdirSync(tmp, { recursive: true }); } catch(e) {}
  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}
run().catch(function(e) { console.log('CRASH: ' + e.message); process.exit(1); });
