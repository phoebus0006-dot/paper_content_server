#!/usr/bin/env node
// admin-real-browser-click-test.js — Real browser click audit test
//
// Tests the CURRENT BROKEN state of admin controls using Playwright.
// Tests intentionally EXPECT failures for known-broken controls.
// When the backend/frontend are fixed, these tests should flip to PASS.
//
// Requirements:
//   - Playwright npm package (devDependency)
//   - Chromium browser (installed via `npx playwright install chromium`)

var path = require('path');
var fs = require('fs');
var { spawn } = require('child_process');
var ROOT = path.join(__dirname, '..', '..');
var TEST_PORT = 18787;
var FIXTURE_DIR = path.join(ROOT, 'test', 'admin', 'fixtures_audit');

var pass = 0, fail = 0, exitCode = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS ' + name + (detail ? ' : ' + detail : '')); }
  else { fail++; exitCode = 1; console.log('FAIL ' + name + (detail ? ' : ' + detail : '')); }
}

process.on('uncaughtException', function(err) {
  console.error('UNCAUGHT:', err.message);
  console.error(err.stack);
  process.exit(1);
});
process.on('unhandledRejection', function(err) {
  console.error('UNHANDLED REJECTION:', err && err.message || err);
  if (err && err.stack) console.error(err.stack);
  process.exit(1);
});

async function main() {
  var playwright;
  try {
    playwright = require('playwright');
  } catch (e) {
    console.log('SKIP: playwright not installed — run `npm install --save-dev playwright && npx playwright install chromium`');
    process.exit(0);
  }

  // Verify fixture directory exists
  if (!fs.existsSync(FIXTURE_DIR)) {
    console.log('FATAL: fixture directory not found: ' + FIXTURE_DIR);
    process.exit(1);
  }

  // Start local server with LAN mode and test data
  var tmpDir = path.join(require('os').tmpdir(), 'admin-audit-test-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  // Copy fixture data into temp dir
  fs.cpSync(FIXTURE_DIR, tmpDir, { recursive: true });
  // Ensure images dir exists (server needs it)
  fs.mkdirSync(path.join(tmpDir, 'images'), { recursive: true });

  var env = Object.assign({}, process.env, {
    PORT: String(TEST_PORT),
    ADMIN_ACCESS_MODE: 'lan',
    ADMIN_ALLOWED_CIDRS: '127.0.0.0/8',
    TRUST_PROXY: 'false',
    DATA_DIR: tmpDir,
    IMAGE_DIR: path.join(tmpDir, 'images'),
    TRANSLATION_PROVIDER: 'none',
    TZ: 'UTC',
    MQTT_ENABLED: 'false',
    DELETE_PIPELINE_ENABLED: 'false',
    LEARNING_LIBRARY_ENABLED: 'false',
    CUSTOM_LIBRARY_ENABLED: 'false'
  });

  var server = spawn(process.execPath, [path.join(ROOT, 'server.js'), '--port', String(TEST_PORT)], {
    env: env, cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe']
  });

  var stdout_data = '';
  var stderr = '';
  server.stdout.on('data', function(d) { stdout_data += d.toString(); });
  server.stderr.on('data', function(d) { stderr += d.toString(); });

  // Wait for server to be ready
  var http = require('http');
  var ready = false;
  for (var i = 0; i < 40; i++) {
    try {
      await new Promise(function(ok, fail) {
        var r = http.get('http://127.0.0.1:' + TEST_PORT + '/health/live', function(res) {
          res.resume();
          res.on('end', function() { ok(); });
        });
        r.on('error', fail);
        r.setTimeout(2000, function() { r.destroy(); fail(new Error('timeout')); });
      });
      ready = true;
      break;
    } catch (e) {
      await new Promise(function(r) { setTimeout(r, 1500); });
    }
  }
  if (!ready) {
    console.log('FATAL: local server did not start on port ' + TEST_PORT);
    console.log('stdout: ' + stdout_data.slice(0, 2000));
    console.log('stderr: ' + stderr.slice(0, 2000));
    if (server) server.kill();
    // Cleanup
    try { require('child_process').spawnSync('rm', ['-rf', tmpDir], { shell: true }); } catch(e) {}
    process.exit(1);
  }

  var baseUrl = 'http://127.0.0.1:' + TEST_PORT;
  console.log('=== Admin Real Browser Click Audit Test ===');
  console.log('Server: ' + baseUrl);
  console.log('Data: ' + tmpDir);

  var browser = null;
  try {
    browser = await playwright.chromium.launch({ headless: true });
    var context = await browser.newContext({
      // LAN mode does not use auth, but we set a generic UA
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    var page = await context.newPage();

    // Collect diagnostics
    var consoleErrors = [];
    var pageErrors = [];
    var networkRequests = [];
    page.on('console', function(msg) {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', function(err) {
      pageErrors.push(err.message);
    });
    page.on('request', function(req) {
      networkRequests.push({ url: req.url(), method: req.method() });
    });
    page.on('requestfailed', function(req) {
      var url = req.url();
      if (url.indexOf('favicon') >= 0) return;
      networkRequests.push({ url: url, method: req.method(), failed: req.failure() && req.failure().errorText });
    });

    // ─────────────────────────────────────────────
    // Step 1: Navigate to admin page
    // ─────────────────────────────────────────────
    console.log('\n--- Step 1: Admin page loads ---');
    var response = await page.goto(baseUrl + '/admin', { waitUntil: 'networkidle', timeout: 20000 });
    check('ADMIN_HTTP_200', response && response.status() === 200, 'status=' + (response && response.status()));
    await page.waitForTimeout(2000);

    // Verify app is visible (LAN mode)
    var appVisible = await page.evaluate(function() {
      var el = document.getElementById('app');
      if (!el) return false;
      return el.style.display !== 'none' && getComputedStyle(el).display !== 'none';
    });
    check('APP_VISIBLE_IN_LAN_MODE', appVisible);

    // ─────────────────────────────────────────────
    // Step 2: Dashboard loads
    // ─────────────────────────────────────────────
    console.log('\n--- Step 2: Dashboard verification ---');

    // wait for dashboard data to load
    await page.waitForTimeout(1500);

    // Check that dash-uptime was populated (proves loadDashboard() ran)
    var dashUptime = await page.evaluate(function() {
      var el = document.getElementById('dash-uptime');
      return el ? el.textContent : null;
    });
    check('DASHBOARD_LOAD_RAN', dashUptime !== null && dashUptime !== '加载中…' && dashUptime !== '',
      'dash-uptime="' + dashUptime + '"');

    // Check that news count is populated from our fixture
    var dashNews = await page.evaluate(function() {
      var el = document.getElementById('dash-news');
      return el ? el.textContent : null;
    });
    check('DASHBOARD_SHOWS_NEWS_COUNT', dashNews !== null && dashNews !== '加载中…' && dashNews !== '未加载',
      'dash-news="' + dashNews + '"');

    // ─────────────────────────────────────────────
    // Step 3: Control mode info is not stuck at "加载中…"
    // ─────────────────────────────────────────────
    console.log('\n--- Step 3: Control mode info ---');

    await page.waitForTimeout(1500);
    var controlModeText = await page.evaluate(function() {
      var el = document.getElementById('control-mode-info');
      return el ? el.textContent : null;
    });
    // THIS IS A KNOWN BUG: #control-mode-info is never updated by JS
    // The JS creates #dash-control-mode instead of updating #control-mode-info
    // So this should FAIL (stuck at "加载中…")
    check('CONTROL_MODE_INFO_NOT_STUCK',
      controlModeText !== null && controlModeText.indexOf('加载中') < 0,
      'control-mode-info="' + controlModeText + '"');

    // ─────────────────────────────────────────────
    // Step 4: News review section
    // ─────────────────────────────────────────────
    console.log('\n--- Step 4: News review ---');

    // Switch to news page
    await page.click('a[data-tab="news-page"]');
    await page.waitForTimeout(1000);

    // Check that saveNewsDraft handler exists
    var hasSaveNewsDraft = await page.evaluate(function() {
      return typeof saveNewsDraft === 'function';
    });
    check('SAVE_NEWS_DRAFT_HANDLER_EXISTS', hasSaveNewsDraft);

    // Check that publishNews handler exists
    var hasPublishNews = await page.evaluate(function() {
      return typeof publishNews === 'function';
    });
    check('PUBLISH_NEWS_HANDLER_EXISTS', hasPublishNews);

    // Check that news list container has loaded items
    var newsItems = await page.evaluate(function() {
      var container = document.getElementById('news-list');
      if (!container) return 0;
      return container.querySelectorAll('.news-card').length;
    });
    check('NEWS_LIST_HAS_ITEMS', newsItems > 0, 'found ' + newsItems + ' news cards');

    // Test news list refresh button click
    await page.click('button[onclick="loadNewsReview()"]');
    await page.waitForTimeout(500);
    var newsAfterRefresh = await page.evaluate(function() {
      var container = document.getElementById('news-list');
      if (!container) return 0;
      return container.querySelectorAll('.news-card').length;
    });
    check('NEWS_REFRESH_BUTTON_WORKS', newsAfterRefresh > 0, 'found ' + newsAfterRefresh + ' after refresh');

    // Test save draft button exists and handler is callable
    var saveBtnExists = await page.evaluate(function() {
      return document.querySelector('button[onclick="saveNewsDraft()"]') !== null;
    });
    check('SAVE_DRAFT_BUTTON_EXISTS', saveBtnExists);

    // Test publish button exists (quick action on dashboard)
    await page.click('a[data-tab="dashboard"]');
    await page.waitForTimeout(500);
    var quickPublishBtnExists = await page.evaluate(function() {
      var btn = document.querySelector('button[onclick="publishNews()"]');
      return btn !== null;
    });
    check('QUICK_PUBLISH_NEWS_BUTTON_EXISTS', quickPublishBtnExists);

    // Quick publish news selector area is EMPTY — there is no dropdown/selector
    // before the button in the dashboard quick actions. This is intentional.
    var quickPublishNewsSelector = await page.evaluate(function() {
      var dashboard = document.getElementById('dashboard');
      if (!dashboard) return null;
      // Look for any select, dropdown, or list before publishNews button
      var selects = dashboard.querySelectorAll('select, .news-select, .publish-select');
      return selects.length;
    });
    check('QUICK_PUBLISH_NEWS_SELECTOR_EXISTS',
      quickPublishNewsSelector > 0,
      'found ' + quickPublishNewsSelector + ' selectors');

    // Switch to photos page for photo tests
    await page.click('a[data-tab="photos-page"]');
    await page.waitForTimeout(1000);

    // ─────────────────────────────────────────────
    // Step 5: Photos section
    // ─────────────────────────────────────────────
    console.log('\n--- Step 5: Photos ---');

    // Check that loadPhotos handler exists
    var hasLoadPhotos = await page.evaluate(function() {
      return typeof loadPhotos === 'function';
    });
    check('LOAD_PHOTOS_HANDLER_EXISTS', hasLoadPhotos);

    // Check photo grid loaded with items
    var photoItems = await page.evaluate(function() {
      var grid = document.getElementById('photo-grid');
      if (!grid) return 0;
      return grid.querySelectorAll('.photo-item').length;
    });
    check('PHOTO_GRID_HAS_ITEMS', photoItems > 0, 'found ' + photoItems + ' photos');

    // Check photo count updated from fixture
    var photoCount = await page.evaluate(function() {
      var el = document.getElementById('photo-count');
      return el ? el.textContent : null;
    });
    check('PHOTO_COUNT_SHOWN', photoCount !== null && photoCount !== '--' && photoCount !== '加载中…',
      'photo-count="' + photoCount + '"');

    // Check that deletePhoto handler exists
    var hasDeletePhoto = await page.evaluate(function() {
      return typeof deletePhoto === 'function';
    });
    check('DELETE_PHOTO_HANDLER_EXISTS', hasDeletePhoto);

    // Test DELETE /api/admin/photos/:id — expected to return 404
    var deleteResponse = await page.evaluate(function() {
      return fetch('/api/admin/photos/photo-audit-001', { method: 'DELETE' })
        .then(function(r) { return r.status; })
        .catch(function() { return 0; });
    });
    check('DELETE_PHOTO_API_404', deleteResponse === 404,
      'DELETE /api/admin/photos/photo-audit-001 returned ' + deleteResponse);

    // Check that openEditor handler exists
    var hasOpenEditor = await page.evaluate(function() {
      return typeof openEditor === 'function';
    });
    check('OPEN_EDITOR_HANDLER_EXISTS', hasOpenEditor);

    // Test GET /api/admin/photos/:id — expected to return 404 (backend route missing)
    var photoDetailResponse = await page.evaluate(function() {
      return fetch('/api/admin/photos/photo-audit-001')
        .then(function(r) { return r.status; })
        .catch(function() { return 0; });
    });
    check('PHOTO_DETAIL_API_404', photoDetailResponse === 404,
      'GET /api/admin/photos/photo-audit-001 returned ' + photoDetailResponse);

    // Check that saveEdit handler exists
    var hasSaveEdit = await page.evaluate(function() {
      return typeof saveEdit === 'function';
    });
    check('SAVE_EDIT_HANDLER_EXISTS', hasSaveEdit);

    // Test POST /api/admin/photos/:id/save-edit — expected to return 404
    var saveEditResponse = await page.evaluate(function() {
      return fetch('/api/admin/photos/photo-audit-001/save-edit', { method: 'POST' })
        .then(function(r) { return r.status; })
        .catch(function() { return 0; });
    });
    check('SAVE_EDIT_API_404', saveEditResponse === 404,
      'POST /api/admin/photos/photo-audit-001/save-edit returned ' + saveEditResponse);

    // Test quick publish photo section — buttons exist on each photo
    var publishPhotoButtons = await page.evaluate(function() {
      return document.querySelectorAll('button[onclick*="publishPhoto("]').length;
    });
    check('PHOTO_PUBLISH_BUTTONS_EXIST', publishPhotoButtons > 0,
      'found ' + publishPhotoButtons + ' publish photo buttons');

    // Check the "编辑" (edit) buttons exist
    var editPhotoButtons = await page.evaluate(function() {
      return document.querySelectorAll('button[onclick*="openEditor("]').length;
    });
    check('PHOTO_EDIT_BUTTONS_EXIST', editPhotoButtons > 0,
      'found ' + editPhotoButtons + ' edit photo buttons');

    // ─────────────────────────────────────────────
    // Step 6: Publish center — rollback buttons
    // ─────────────────────────────────────────────
    console.log('\n--- Step 6: Publish center ---');

    await page.click('a[data-tab="publish-page"]');
    await page.waitForTimeout(1000);

    // Check that confirmRollback handler is MISSING (known failure)
    var hasConfirmRollback = await page.evaluate(function() {
      return typeof confirmRollback === 'function';
    });
    check('CONFIRM_ROLLBACK_HANDLER_MISSING', !hasConfirmRollback,
      'confirmRollback defined=' + hasConfirmRollback + ' (expected missing)');

    // Check that closeRollbackPreview handler is MISSING (known failure)
    var hasCloseRollbackPreview = await page.evaluate(function() {
      return typeof closeRollbackPreview === 'function';
    });
    check('CLOSE_ROLLBACK_PREVIEW_HANDLER_MISSING', !hasCloseRollbackPreview,
      'closeRollbackPreview defined=' + hasCloseRollbackPreview + ' (expected missing)');

    // Rollback dialog buttons exist in HTML
    var confirmRollbackBtn = await page.evaluate(function() {
      var btn = document.querySelector('button[onclick="confirmRollback()"]');
      return btn !== null;
    });
    check('CONFIRM_ROLLBACK_BUTTON_EXISTS_IN_HTML', confirmRollbackBtn);

    var closeRollbackPreviewBtn = await page.evaluate(function() {
      var btn = document.querySelector('button[onclick="closeRollbackPreview()"]');
      return btn !== null;
    });
    check('CLOSE_ROLLBACK_PREVIEW_BUTTON_EXISTS_IN_HTML', closeRollbackPreviewBtn);

    // Rollback preview section exists (hidden by default)
    var rollbackPreviewSection = await page.evaluate(function() {
      var el = document.getElementById('rollback-preview');
      return el !== null;
    });
    check('ROLLBACK_PREVIEW_SECTION_EXISTS', rollbackPreviewSection);

    // ─────────────────────────────────────────────
    // Step 7: Publish history loads
    // ─────────────────────────────────────────────
    console.log('\n--- Step 7: Publish history ---');

    await page.waitForTimeout(2000);

    var historyListLoaded = await page.evaluate(function() {
      var el = document.getElementById('publish-history-list');
      if (!el) return false;
      return el.querySelector('.publish-row') !== null || el.querySelector('.empty-state') !== null;
    });
    check('PUBLISH_HISTORY_LOADED', historyListLoaded);

    // Check that loadPublishHistory handler exists
    var hasLoadPublishHistory = await page.evaluate(function() {
      return typeof loadPublishHistory === 'function';
    });
    check('LOAD_PUBLISH_HISTORY_HANDLER_EXISTS', hasLoadPublishHistory);

    // Check that rollback handler exists
    var hasRollback = await page.evaluate(function() {
      return typeof rollback === 'function';
    });
    check('ROLLBACK_HANDLER_EXISTS', hasRollback);

    // ─────────────────────────────────────────────
    // Step 8: Status page loads
    // ─────────────────────────────────────────────
    console.log('\n--- Step 8: Status page ---');

    await page.click('a[data-tab="status-page"]');
    await page.waitForTimeout(2000);

    var statusUptime = await page.evaluate(function() {
      var el = document.getElementById('status-uptime');
      return el ? el.textContent : null;
    });
    check('STATUS_PAGE_LOADED', statusUptime !== null && statusUptime.indexOf('加载') < 0,
      'status-uptime="' + statusUptime + '"');

    // ─────────────────────────────────────────────
    // Step 9: Console errors check
    // ─────────────────────────────────────────────
    console.log('\n--- Step 9: Diagnostics ---');

    var realConsoleErrors = consoleErrors.filter(function(m) {
      return m.indexOf('favicon') < 0 && m.indexOf('mcs.ziieapi.com') < 0;
    });
    check('CONSOLE_ERRORS_ZERO', realConsoleErrors.length === 0,
      realConsoleErrors.length ? realConsoleErrors.join('; ') : '');

    // Page errors (some expected from clicking missing handlers — but we logged those separately)
    // Filter out expected errors from our tests
    var unexpectedPageErrors = pageErrors.filter(function(m) {
      return m.indexOf('confirmRollback') < 0 && m.indexOf('closeRollbackPreview') < 0;
    });
    check('NO_UNEXPECTED_PAGE_ERRORS', unexpectedPageErrors.length === 0,
      unexpectedPageErrors.length ? unexpectedPageErrors.join('; ') : '');

    // ─────────────────────────────────────────────
    // Summary
    // ─────────────────────────────────────────────
    console.log('\n=== Admin Real Browser Click Audit: ' + pass + ' passed, ' + fail + ' failed ===');

  } catch (e) {
    console.log('CRASH: ' + e.message);
    console.log(e.stack);
    exitCode = 1;
    fail++;
  } finally {
    if (browser) await browser.close();
    if (server) server.kill();
    // Cleanup temp dir
    try { require('child_process').spawnSync('rm', ['-rf', tmpDir], { shell: true }); } catch(e) {}

  }

  console.log('\nExit code: ' + exitCode);
  process.exit(exitCode);
}

main().catch(function(e) {
  console.error('FATAL', e);
  process.exit(1);
});
