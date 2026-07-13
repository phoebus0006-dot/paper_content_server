#!/usr/bin/env node
var path = require('path');
var fs = require('fs');
var os = require('os');
var ROOT = path.join(__dirname, '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

var CLS = require(path.join(ROOT, 'src', 'custom-library', 'custom-library-service')).createCustomLibraryService;
var lg = { info: function() {}, warn: function() {}, error: function() {} };
var tmp = path.join(os.tmpdir(), 'r8_gate_' + Date.now());
fs.mkdirSync(tmp, { recursive: true });

var store = {
  storeQuarantine: function(buf) { var q = path.join(tmp, 'q.jpg'); fs.writeFileSync(q, buf); return q; },
  decodeAndRecompute: function(q) { return Promise.resolve({ fileSize: 3, sha256: 'abc', mimeType: 'image/png', width: 100, height: 100 }); },
  computeSha256Stream: function(q) { return Promise.resolve('abc123'); },
  moveToAssets: function(q, id) { var f = path.join(tmp, id + '.png'); try { fs.renameSync(q, f); } catch(e) {} return f; },
  cleanup: function(f) { try { fs.unlinkSync(f); } catch(e) {} }
};
var val = { validate: function(u) { return { ok: true }; } };
var dedup = { isDuplicate: function(s) { return Promise.resolve(false); } };
var ar = { create: function(a) { return Promise.resolve(a.assetId); } };

async function run() {
  // No safety gate → ERROR with SAFETY_GATE_MISSING
  var svcNoGate = CLS(store, val, dedup, null, ar, lg);
  var result = await svcNoGate.processUpload({ fileBuffer: Buffer.from('img'), mimeType: 'image/png', width: 100, height: 100 });
  t('NO_SAFETY_GATE_IS_ERROR', result.status === 'ERROR' && result.reason === 'SAFETY_GATE_MISSING', result.status + ':' + result.reason);

  // With safety gate → ACCEPTED
  var svcWithGate = CLS(store, val, dedup,
    { classify: function(p, m) { return Promise.resolve({ score: 0, category: 'safe', modelVersion: 'test', scores: { safe: 1.0 } }); },
      isSafe: function(c) { return true; },
      audit: function(e) { return Promise.resolve(); } },
    ar, lg);
  var result2 = await svcWithGate.processUpload({ fileBuffer: Buffer.from('img'), mimeType: 'image/png', width: 100, height: 100 });
  t('HAS_SAFETY_GATE_PROCEEDS', result2.status === 'ACCEPTED', result2.status);

  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}
run().catch(function(e) { console.log('CRASH: ' + e.message); process.exit(1); });
