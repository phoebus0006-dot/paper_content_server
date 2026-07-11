#!/usr/bin/env node
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

var CLS = require(path.join(ROOT, 'src', 'custom-library', 'custom-library-service')).createCustomLibraryService;
var lg = { info: function() {}, warn: function() {}, error: function() {} };
var fs = require('fs');
var os = require('os');
var tmp = path.join(os.tmpdir(), 'r8_orph_' + Date.now());
fs.mkdirSync(tmp, { recursive: true });

var cleaned = [];

async function run() {
  var svc = CLS(
    { storeQuarantine: function() { return path.join(tmp, 'q_file'); }, decodeAndRecompute: function() { return { sha256: 'abc', mimeType: 'image/png', width: 100, height: 100 }; }, moveToAssets: function() { var f = path.join(tmp, 'moved'); fs.writeFileSync(f, ''); return f; }, cleanup: function(p) { cleaned.push(p); try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch(e) {} } },
    { validate: function() { return { ok: true }; } },
    { isDuplicate: function() { return Promise.resolve(false); } },
    { isSafe: function() { return true; } },
    { create: function() { return Promise.reject(new Error('repo fail')); } },
    lg
  );
  var result = await svc.processUpload({ filePath: '/tmp/upload.png', mimeType: 'image/png', width: 100, height: 100 });
  t('REPOSITORY_FAILURE', result.status === 'ERROR', result.status);
  // The moved file should have been cleaned up
  var movedExists = fs.existsSync(path.join(tmp, 'moved'));
  t('ORPHAN_CLEANED', !movedExists, movedExists ? 'orphan still present' : 'cleaned ok');
  try { fs.rmdirSync(tmp, { recursive: true }); } catch(e) {}
  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}
run().catch(function(e) { console.log('CRASH: ' + e.message); process.exit(1); });
