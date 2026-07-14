#!/usr/bin/env node
var http = require('http');
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..');
var ec = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (!o) ec = 1; }

// Test in-container checks
t('server.js exists', fs.existsSync(path.join(ROOT, 'server.js')), '');
t('package.json exists', fs.existsSync(path.join(ROOT, 'package.json')), '');
t('package-lock.json exists', fs.existsSync(path.join(ROOT, 'package-lock.json')), '');
t('.env not bundled', !fs.existsSync(path.join(ROOT, '.env')), '');
t('data dir not bundled', !fs.existsSync(path.join(ROOT, 'data')), '');

// Check build manifest
try {
  var manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'build-manifest.json'), 'utf8'));
  t('build manifest exists', true, '');
  t('manifest has gitSha', !!manifest.gitSha, '');
  t('manifest has nodeVersion', !!manifest.nodeVersion, '');
  t('manifest not dirty', !manifest.dirty, '');
} catch(e) {
  t('build manifest exists', false, e.message);
}

// Check health endpoint
try {
  var req = http.get('http://localhost:8787/health/live', function(res) {
    var body = '';
    res.on('data', function(c) { body += c; });
    res.on('end', function() {
      t('health/live returns 200', res.statusCode === 200, 'status=' + res.statusCode);
      var parsed = JSON.parse(body);
      t('health/live has status', parsed && parsed.status === 'ok', '');
    });
  });
  req.on('error', function(e) {
    t('health/live endpoint', false, e.message);
  });
  req.setTimeout(5000, function() { req.destroy(); t('health/live timeout', false, ''); });
} catch(e) {
  t('health/live endpoint', false, e.message);
}

process.exit(ec);
