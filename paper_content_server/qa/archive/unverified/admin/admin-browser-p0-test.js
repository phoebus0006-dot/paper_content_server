#!/usr/bin/env node
// admin-browser-p0-test.js — Real browser test (Playwright/Chromium) that
// verifies the admin page does NOT white-screen in LAN mode and that
// critical UI elements render without console/page errors.
//
// This is the L5 test that catches the P0:
//   "Cannot read properties of null (reading 'addEventListener') at admin.js:35"
// which the L3 (HTTP-only) admin-ui-no-login-test.js missed.
//
// Requirements:
//   - Playwright npm package (devDependency)
//   - Chromium browser (installed via `npx playwright install chromium`)
//
// Environment:
//   ADMIN_BASE_URL — override target URL (default: starts a local LAN-mode server)

var path = require('path');
var fs = require('fs');
var { spawn } = require('child_process');
var ROOT = path.join(__dirname, '..', '..');

var passed = 0, failed = 0, exitCode = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log('PASS ' + name + (detail ? ' : ' + detail : '')); }
  else { failed++; exitCode = 1; console.log('FAIL ' + name + (detail ? ' : ' + detail : '')); }
}

async function main() {
  var playwright;
  try {
    playwright = require('playwright');
  } catch (e) {
    console.log('SKIP: playwright not installed — run `npm install --save-dev playwright && npx playwright install chromium`');
    process.exit(0); // skip, not fail
  }

  var baseUrl = process.env.ADMIN_BASE_URL;
  var server = null;
  var tmpDir = null;

  if (!baseUrl) {
    // Start a local server in LAN mode
    var PORT = 18910;
    tmpDir = path.join(require('os').tmpdir(), 'admin-p0-test-' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });
    // minimal images dir so server doesn't crash
    fs.mkdirSync(path.join(tmpDir, 'images'), { recursive: true });

    var env = Object.assign({}, process.env, {
      PORT: String(PORT),
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
    server = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
      env: env, cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe']
    });
    var stderr = '';
    server.stderr.on('data', function(d) { stderr += d.toString(); });

    // Wait for server
    var http = require('http');
    var ready = false;
    for (var i = 0; i < 30; i++) {
      try {
        await new Promise(function(ok, fail) {
          var r = http.get('http://127.0.0.1:' + PORT + '/health/live', function(res) {
            res.resume();
            res.on('end', function() { ok(); });
          });
          r.on('error', fail);
          r.setTimeout(1000, function() { r.destroy(); fail(new Error('timeout')); });
        });
        ready = true;
        break;
      } catch (e) {
        await new Promise(function(r) { setTimeout(r, 1000); });
      }
    }
    if (!ready) {
      console.log('FAIL: local server did not start. stderr:');
      console.log(stderr);
      if (server) server.kill();
      process.exit(1);
    }
    baseUrl = 'http://127.0.0.1:' + PORT;
    console.log('Local server started at ' + baseUrl);
  }

  console.log('=== Admin Browser P0 Test (Playwright/Chromium) ===');
  console.log('Target: ' + baseUrl + '/admin');

  var browser = null;
  try {
    browser = await playwright.chromium.launch({ headless: true });
    var context = await browser.newContext();
    var page = await context.newPage();

    // Collect console + page errors
    var consoleErrors = [];
    var pageErrors = [];
    var failedRequests = [];
    page.on('console', function(msg) {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', function(err) {
      pageErrors.push(err.message);
    });
    page.on('requestfailed', function(req) {
      var url = req.url();
      // Ignore favicon and browser-extension noise
      if (url.indexOf('favicon') >= 0 || url.indexOf('mcs.ziieapi.com') >= 0 ||
          url.indexOf('content_main.js') >= 0 || url.indexOf('33402') >= 0 ||
          url.indexOf('61620') >= 0) return;
      failedRequests.push(url + ' : ' + (req.failure() && req.failure().errorText));
    });

    // Navigate to /admin and wait for network idle
    var response = await page.goto(baseUrl + '/admin', { waitUntil: 'networkidle', timeout: 15000 });
    check('ADMIN_HTTP_200', response && response.status() === 200, 'status=' + (response && response.status()));

    // Wait a bit for JS init
    await page.waitForTimeout(2000);

    // === P0 CHECK: no "Cannot read properties of null" error ===
    var nullErrors = pageErrors.filter(function(m) {
      return m.indexOf("Cannot read properties of null") >= 0 ||
             m.indexOf("addEventListener") >= 0 && m.indexOf("null") >= 0;
    });
    check('P0_NO_NULL_ADD_EVENT_LISTENER', nullErrors.length === 0,
      nullErrors.length ? nullErrors[0] : 'no null-addEventListener errors');

    // === Page not blank ===
    var bodyText = await page.evaluate(function() { return document.body.innerText; });
    check('PAGE_NOT_BLANK', bodyText && bodyText.trim().length > 0,
      'text_length=' + (bodyText ? bodyText.trim().length : 0));

    // === #app visible (LAN mode: app should be visible, not display:none) ===
    var appVisible = await page.evaluate(function() {
      var el = document.getElementById('app');
      if (!el) return false;
      return el.style.display !== 'none' && getComputedStyle(el).display !== 'none';
    });
    check('APP_VISIBLE_IN_LAN_MODE', appVisible);

    // === Critical UI elements visible ===
    var criticalElements = [
      { id: 'app', label: 'app container' },
      { id: 'dashboard', label: 'dashboard page' },
      { id: 'dash-mode', label: 'dashboard mode' },
      { id: 'news-page', label: 'news page tab' },
      { id: 'photos-page', label: 'photos page tab' },
      { id: 'publish-page', label: 'publish page tab' },
      { id: 'status-page', label: 'status page tab' },
      { id: 'photo-upload-form', label: 'photo upload form' },
      { id: 'news-list', label: 'news list container' },
      { id: 'photo-grid', label: 'photo grid container' },
      { id: 'publish-history-list', label: 'publish history list' }
    ];
    for (var i = 0; i < criticalElements.length; i++) {
      var el = criticalElements[i];
      var exists = await page.evaluate(function(id) {
        return document.getElementById(id) !== null;
      }, el.id);
      check('ELEMENT_EXISTS_' + el.id, exists, el.label);
    }

    // === Sidebar nav links present ===
    var navCount = await page.evaluate(function() {
      return document.querySelectorAll('.sidebar nav a').length;
    });
    check('SIDEBAR_NAV_LINKS_PRESENT', navCount >= 5, 'count=' + navCount);

    // === Tab switching works (critical action) ===
    try {
      await page.click('a[data-tab="news-page"]');
      await page.waitForTimeout(300);
      var newsActive = await page.evaluate(function() {
        var el = document.getElementById('news-page');
        return el && el.classList.contains('active');
      });
      check('TAB_SWITCH_TO_NEWS_WORKS', newsActive);

      await page.click('a[data-tab="status-page"]');
      await page.waitForTimeout(300);
      var statusActive = await page.evaluate(function() {
        var el = document.getElementById('status-page');
        return el && el.classList.contains('active');
      });
      check('TAB_SWITCH_TO_STATUS_WORKS', statusActive);

      // Back to dashboard
      await page.click('a[data-tab="dashboard"]');
      await page.waitForTimeout(300);
    } catch (e) {
      check('TAB_SWITCH_WORKS', false, 'tab switch threw: ' + e.message);
    }

    // === Console errors ===
    // Filter out favicon and extension noise
    var realConsoleErrors = consoleErrors.filter(function(m) {
      return m.indexOf('favicon') < 0 && m.indexOf('mcs.ziieapi.com') < 0;
    });
    check('CONSOLE_ERRORS_ZERO', realConsoleErrors.length === 0,
      realConsoleErrors.length ? realConsoleErrors.join('; ') : '');

    // === Page errors (uncaught exceptions) ===
    check('PAGE_ERRORS_ZERO', pageErrors.length === 0,
      pageErrors.length ? pageErrors.join('; ') : '');

    // === Failed required requests ===
    var requiredFailed = failedRequests.filter(function(r) {
      return r.indexOf('/api/admin/') >= 0 || r.indexOf('/admin/') >= 0 || r.indexOf('/health/') >= 0;
    });
    check('REQUIRED_FAILED_REQUESTS_ZERO', requiredFailed.length === 0,
      requiredFailed.length ? requiredFailed.join('; ') : '');

    // === Access mode fetched successfully ===
    // Check that dash-uptime was populated (proves loadDashboard() ran without throwing)
    var dashUptime = await page.evaluate(function() {
      var el = document.getElementById('dash-uptime');
      return el ? el.textContent : null;
    });
    check('DASHBOARD_LOAD_RAN', dashUptime !== null && dashUptime !== '',
      'dash-uptime="' + dashUptime + '"');

    // === Take screenshot for evidence ===
    var screenshotPath = path.join(ROOT, 'test', 'admin', 'admin-lan-mode-screenshot.png');
    try {
      await page.screenshot({ path: screenshotPath, fullPage: true });
      check('SCREENSHOT_PROVIDED', fs.existsSync(screenshotPath), screenshotPath);
    } catch (e) {
      check('SCREENSHOT_PROVIDED', false, 'screenshot failed: ' + e.message);
    }

    // === Reload test — clear errors and verify page reloads cleanly ===
    consoleErrors.length = 0;
    pageErrors.length = 0;
    failedRequests.length = 0;
    await page.goto(baseUrl + '/admin', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1500);
    var reloadPageErrors = pageErrors.filter(function(m) { return m.indexOf('favicon') < 0; });
    check('RELOAD_NO_NEW_ERRORS', reloadPageErrors.length === 0,
      reloadPageErrors.length ? reloadPageErrors.join('; ') : '');

  } catch (e) {
    console.log('CRASH: ' + e.message);
    console.log(e.stack);
    exitCode = 1;
    failed++;
  } finally {
    if (browser) await browser.close();
    if (server) server.kill();
    if (tmpDir) {
      try { var rm = require('child_process'); rm.spawnSync('rm', ['-rf', tmpDir]); } catch(e) {}
    }
  }

  console.log('\n=== Summary: ' + passed + ' passed, ' + failed + ' failed ===');
  process.exit(exitCode);
}

main().catch(function(e) {
  console.error('FATAL', e);
  process.exit(1);
});
