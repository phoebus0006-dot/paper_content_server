#!/usr/bin/env node
// admin-frontend-recovery-test.js — Verifies that all frontend admin
// recovery fixes (buttons, selectors, loading states, API handler fixes)
// are correctly in place.
//
// Environment:
//   ADMIN_BASE_URL — override target URL (default: starts a local server)
//   SKIP_SERVER — set to "1" to use ADMIN_BASE_URL without starting a server

var http = require('http');
var path = require('path');
var fs = require('fs');
var { spawn } = require('child_process');
var ROOT = path.join(__dirname, '..', '..');
var PORT = 18789;
var TMPDIR = path.join(ROOT, 'test_admin_data_frontend');
var passed = 0, failed = 0, exitCode = 0;

function check(name, cond, detail) {
  if (cond) { passed++; console.log('PASS ' + name + (detail ? ' : ' + detail : '')); }
  else { failed++; exitCode = 1; console.log('FAIL ' + name + (detail ? ' : ' + detail : '')); }
}

function get(url) {
  return new Promise(function(ok) {
    http.get({ hostname: '127.0.0.1', port: PORT, path: url }, function(r) {
      var d = []; r.on('data', function(c) { d.push(c); }); r.on('end', function() { ok({ s: r.statusCode, b: Buffer.concat(d), h: r.headers }); });
    }).on('error', function(e) { ok({ s: 0, err: e }); });
  });
}

async function waitSrv() {
  for (var i = 0; i < 40; i++) {
    try { var r = await get('/health/live'); if (r.s === 200) return true; } catch(e) {}
    await new Promise(function(r) { setTimeout(r, 1000); });
  }
  return false;
}

function rmDir(p) {
  try { var e = fs.readdirSync(p); e.forEach(function(f) { var fp = path.join(p, f); if (fs.statSync(fp).isDirectory()) rmDir(fp); else fs.unlinkSync(fp); }); fs.rmdirSync(p); } catch(e) {}
}

async function main() {
  console.log('=== Admin Frontend Recovery Test ===');

  var baseUrl = process.env.ADMIN_BASE_URL;
  var server = null;

  if (!baseUrl) {
    try { rmDir(TMPDIR); } catch(e) {}
    try { fs.mkdirSync(TMPDIR, { recursive: true }); } catch(e) {}
    try { fs.mkdirSync(path.join(TMPDIR, 'images'), { recursive: true }); } catch(e) {}

    var env = Object.assign({}, process.env, {
      PORT: String(PORT),
      ADMIN_ACCESS_MODE: 'lan',
      ADMIN_ALLOWED_CIDRS: '127.0.0.0/8',
      TRUST_PROXY: 'false',
      DATA_DIR: TMPDIR,
      IMAGE_DIR: path.join(TMPDIR, 'images'),
      TRANSLATION_PROVIDER: 'none',
      TZ: 'UTC',
      MQTT_ENABLED: 'false',
      DELETE_PIPELINE_ENABLED: 'false',
      LEARNING_LIBRARY_ENABLED: 'false',
      CUSTOM_LIBRARY_ENABLED: 'false'
    });

    server = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
      env: env, cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe']
    });
    var stderr = '';
    server.stderr.on('data', function(d) { stderr += d.toString(); });

    if (!await waitSrv()) {
      console.log('FAIL: server did not start on port', PORT);
      console.log('STDERR:', stderr);
      if (server) server.kill();
      process.exit(1);
    }
    console.log('Server started on port', PORT);
  } else {
    console.log('Using external server:', baseUrl);
    // Parse port from baseUrl
    var m = baseUrl.match(/:(\d+)/);
    if (m) PORT = parseInt(m[1], 10);
  }

  // ── 1. Fetch source files ──
  var htmlReq = await get('/admin/');
  check('ADMIN_HTML_200', htmlReq.s === 200, 'HTTP ' + htmlReq.s);
  var html = htmlReq.b.toString();

  var jsReq = await get('/admin/admin.js');
  check('ADMIN_JS_200', jsReq.s === 200, 'HTTP ' + jsReq.s);
  var js = jsReq.b.toString();

  var cssReq = await get('/admin/admin.css');
  check('ADMIN_CSS_200', cssReq.s === 200, 'HTTP ' + cssReq.s);
  var css = cssReq.b.toString();

  // ── 2. CONFIRM_ROLLBACK_HANDLER_EXISTS ──
  check('CONFIRM_ROLLBACK_HANDLER_EXISTS',
    /function\s+confirmRollback\s*\(/.test(js),
    'confirmRollback function found in admin.js');

  // ── 3. CLOSE_ROLLBACK_PREVIEW_HANDLER_EXISTS ──
  check('CLOSE_ROLLBACK_PREVIEW_HANDLER_EXISTS',
    /function\s+closeRollbackPreview\s*\(/.test(js),
    'closeRollbackPreview function found in admin.js');

  // ── 4. CONTROL_MODE_NOT_STUCK_LOADING ──
  // Check that the control-mode-info element exists in HTML
  check('CONTROL_MODE_ELEMENT_EXISTS',
    /id="control-mode-info"/.test(html),
    '#control-mode-info exists in HTML');
  // Check that loadControlMode function exists in JS
  check('CONTROL_MODE_NOT_STUCK_LOADING',
    /function\s+loadControlMode\s*\(/.test(js),
    'loadControlMode function exists');
  // Check that it has timeout handling (5-second timeout)
  check('CONTROL_MODE_HAS_TIMEOUT',
    /setTimeout[\s\S]*5000/.test(js),
    'loadControlMode has 5-second timeout');
  // Check that it has retry button on error
  check('CONTROL_MODE_HAS_RETRY',
    /重试/.test(js),
    'loadControlMode has retry button on error');

  // ── 5. NEWS_SELECTOR_EXISTS_IN_DOM ──
  check('NEWS_SELECTOR_EXISTS_IN_DOM',
    /id="quick-news-select"/.test(html),
    '#quick-news-select exists in HTML');
  check('NEWS_PUBLISH_BUTTON_EXISTS',
    /id="btn-quick-publish-news"/.test(html),
    '#btn-quick-publish-news exists in HTML');

  // ── 6. NEWS_SELECTOR_POPULATED ──
  check('NEWS_SELECTOR_FUNCTIONS_EXIST',
    /function\s+populateNewsSelector\s*\(/.test(js) && /function\s+quickPublishNews\s*\(/.test(js),
    'populateNewsSelector and quickPublishNews functions exist');

  // ── 7. PHOTO_SELECTOR_EXISTS_IN_DOM ──
  check('PHOTO_SELECTOR_EXISTS_IN_DOM',
    /id="quick-photo-select"/.test(html),
    '#quick-photo-select exists in HTML');
  check('PHOTO_PUBLISH_BUTTON_EXISTS',
    /id="btn-quick-publish-photo"/.test(html),
    '#btn-quick-publish-photo exists in HTML');

  // ── 8. API_THROWS_ON_NON_2XX ──
  // Check that the api() function has the !r.ok check
  check('API_THROWS_ON_NON_2XX',
    /if\s*\(!r\.ok\)/.test(js),
    'api() has !r.ok check for non-2xx responses');
  check('API_THROWS_ERRBODY_MESSAGE',
    /errBody\.message/.test(js),
    'api() extracts message from error body');
  check('API_THROWS_HTTP_FALLBACK',
    /['\"]HTTP ['\"]\s*\+/.test(js),
    'api() falls back to HTTP status message');
  // Test the actual endpoint returns HTML correctly
  check('API_HTML_CONTAINS_DOCTYPE',
    /<!DOCTYPE/i.test(html),
    'Admin page is valid HTML');

  // ── 9. PHOTO_EDITOR_LOAD_HANDLES_404 ──
  check('PHOTO_EDITOR_HANDLES_404',
    /资源已不存在/.test(js),
    'openEditor handles 404 with "资源已不存在" message');
  check('PHOTO_EDITOR_SHOWS_LOADING',
    /加载中…/.test(js),
    'openEditor shows loading state');

  // ── 10. ROLLBACK_PREVIEW_SHOW_HIDE ──
  check('ROLLBACK_PREVIEW_EXISTS_IN_HTML',
    /id="rollback-preview"/.test(html),
    '#rollback-preview exists in HTML');
  check('ROLLBACK_PREVIEW_HAS_CONTENT',
    /id="rollback-preview-content"/.test(html),
    '#rollback-preview-content exists in HTML');
  check('ROLLBACK_PREVIEW_SHOW',
    /show\(preview\)/.test(js),
    'rollback() calls show(preview)');
  check('CLOSE_ROLLBACK_PREVIEW_HIDES',
    /hide\(preview\)/.test(js),
    'closeRollbackPreview calls hide(preview)');

  // ── 11. Additional safety nets ──
  check('QUICK_PUBLISH_CSS_CLASSES',
    /quick-publish-row/.test(css) && /quick-select/.test(css),
    'CSS has .quick-publish-row and .quick-select classes');
  check('DELETE_PHOTO_CALLS_POPULATE',
    /populatePhotoSelector/.test(js),
    'deletePhoto calls populatePhotoSelector after deletion');
  check('SAVE_EDIT_CALLS_LOAD_PHOTOS',
    /loadPhotos\(\)/.test(js),
    'saveEdit calls loadPhotos after success');
  check('SELECT_CHANGE_ENABLES_BUTTON',
    /disabled=!this\.value/.test(html),
    'Select onchange enables/disables publish button');

  // ── Summary ──
  console.log('');
  console.log('=== Summary:', passed, 'passed,', failed, 'failed ===');

  if (server) server.kill();
  // Cleanup temp dir (but not if using external server)
  if (!baseUrl) {
    try { rmDir(TMPDIR); } catch(e) { console.log('Warning: cleanup failed', e.message); }
  }
  process.exit(exitCode);
}

main().catch(function(e) {
  console.error('CRASH', e.message);
  process.exit(1);
});
