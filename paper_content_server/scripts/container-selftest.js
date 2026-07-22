#!/usr/bin/env node
var http = require('http');
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..');
var ec = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (!o) ec = 1; }

// Test in-container checks — only paths that exist in the production image
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
  if (manifest.buildMode === 'development') {
    t('manifest is development build', manifest.dirty === true, 'buildMode=' + manifest.buildMode + ' dirty=' + manifest.dirty);
  } else {
    t('manifest not dirty', !manifest.dirty, '');
  }
} catch(e) {
  t('build manifest exists', false, e.message);
}

// Validate required runtime files
var REQUIRED_FILES = [
  'server.js', 'package.json', 'package-lock.json',
  'lib/schedule.js', 'lib/sequence.js',
  'src/epaper/palette.js', 'src/epaper/epf1.js',
  'src/epaper/image-frame.js', 'src/epaper/frame-validator.js',
  'src/snapshot/snapshot-model.js', 'src/snapshot/snapshot-store.js',
  'src/publication/publication-service.js',
  'src/config/load-config.js',
  'src/admin/admin-state-service.js',
  'src/admin/admin-network-policy.js',
  'src/news/news-title-service.js',
  'src/files/safe-image-path.js',
  'src/images/image-rasterizer-v2.js',
  'src/images/image-recipe-service.js',
  'scripts/validate-frame.js',
];
for (var fi = 0; fi < REQUIRED_FILES.length; fi++) {
  t('required:' + REQUIRED_FILES[fi], fs.existsSync(path.join(ROOT, REQUIRED_FILES[fi])), '');
}

// Check docker-entrypoint.sh at /usr/local/bin/
t('entrypoint at /usr/local/bin/docker-entrypoint.sh', fs.existsSync('/usr/local/bin/docker-entrypoint.sh'), '');
t('entrypoint is executable', (function() { try { var s = fs.statSync('/usr/local/bin/docker-entrypoint.sh'); return s && (s.mode & 0o111) !== 0; } catch(e) { return false; } })(), '');

// Verify critical modules can be loaded
try {
  require('sharp');
  t('sharp module loads', true, '');
} catch(e) {
  t('sharp module loads', false, e.message);
}
try {
  require('mqtt');
  t('mqtt module loads', true, '');
} catch(e) {
  t('mqtt module loads', false, e.message);
}
try {
  var serverMod = require(path.join(ROOT, 'server.js'));
  t('server.js module loads', true, '');
  t('server.js exports handleRequest', typeof serverMod.handleRequest === 'function', '');
  t('server.js exports createApplication', typeof serverMod.createApplication === 'function', '');
} catch(e) {
  t('server.js module loads', false, e.message);
}

// Check health endpoint — must use Promise to wait for result
function checkHealth() {
  return new Promise(function(resolve) {
    var timeoutId;
    try {
      var req = http.get('http://localhost:8787/health/live', function(res) {
        var body = '';
        res.on('data', function(c) { body += c; });
        res.on('end', function() {
          clearTimeout(timeoutId);
          t('health/live returns 200', res.statusCode === 200, 'status=' + res.statusCode);
          try {
            var parsed = JSON.parse(body);
            t('health/live has status', parsed && parsed.status === 'ok', '');
          } catch(e) {
            t('health/live parse', false, e.message);
          }
          resolve();
        });
        res.on('error', function(e) {
          clearTimeout(timeoutId);
          t('health/live endpoint', false, e.message);
          resolve();
        });
      });
      req.on('error', function(e) {
        clearTimeout(timeoutId);
        t('health/live endpoint', false, e.message);
        resolve();
      });
      timeoutId = setTimeout(function() {
        req.destroy();
        t('health/live timeout', false, '');
        resolve();
      }, 5000);
    } catch(e) {
      t('health/live endpoint', false, e.message);
      resolve();
    }
  });
}

checkHealth().then(function() {
  process.exit(ec);
});
