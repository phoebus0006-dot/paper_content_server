var path = require('path');
var fs = require('fs');
var http = require('http');
var spawn = require('child_process').spawn;
var playwright = require('playwright');

var ROOT = path.join(__dirname, '..', '..');
var FIXTURE_DIR = path.join(ROOT, 'test', 'admin', 'fixtures_audit');
var TEST_PORT = 18787;
var BASE_URL = 'http://127.0.0.1:' + TEST_PORT;

var pass = 0, fail = 0;
function check(name, ok, msg) {
  if (ok) { pass++; console.log('PASS ' + name + (msg ? ' : ' + msg : '')); }
  else { fail++; console.log('FAIL ' + name + (msg ? ' : ' + msg : '')); }
}

async function waitForServer(url, maxRetry, interval) {
  for (var i = 0; i < maxRetry; i++) {
    try {
      await new Promise(function(ok, fail) {
        var r = http.get(url, function(res) {
          res.resume();
          res.on('end', ok);
        });
        r.on('error', fail);
        r.setTimeout(3000, function() { r.destroy(); fail(new Error('timeout')); });
      });
      return true;
    } catch (e) {
      await new Promise(function(r) { setTimeout(r, interval); });
    }
  }
  return false;
}

async function main() {
  console.log('=== Admin Integration Browser Tests ===\n');

  // Setup temp data
  var tmpDir = path.join(require('os').tmpdir(), 'admin-int-test-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  // Copy fixtures
  try {
    var items = fs.readdirSync(FIXTURE_DIR);
    items.forEach(function(item) {
      var src = path.join(FIXTURE_DIR, item);
      var dst = path.join(tmpDir, item);
      if (fs.statSync(src).isDirectory()) {
        fs.mkdirSync(dst, { recursive: true });
        fs.readdirSync(src).forEach(function(f) {
          fs.copyFileSync(path.join(src, f), path.join(dst, f));
        });
      } else {
        fs.copyFileSync(src, dst);
      }
    });
    fs.mkdirSync(path.join(tmpDir, 'images'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'publication'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'snapshots'), { recursive: true });
  } catch(e) {
    console.log('FIXTURE COPY ERROR: ' + e.message);
  }

  console.log('Data directory: ' + tmpDir);
  console.log('Fixture directory: ' + FIXTURE_DIR);

  // Start server
  var env = Object.assign({}, process.env, {
    PORT: String(TEST_PORT),
    DATA_DIR: tmpDir,
    IMAGE_DIR: path.join(tmpDir, 'images'),
    ADMIN_ACCESS_MODE: 'lan',
    ADMIN_ALLOWED_CIDRS: '127.0.0.0/8',
    TRANSLATION_PROVIDER: 'none',
    MQTT_ENABLED: 'false'
  });

  var server = spawn(process.execPath, [path.join(ROOT, 'server.js'), '--port', String(TEST_PORT)], {
    env: env, cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe']
  });

  var serverOut = '';
  var serverErr = '';
  server.stdout.on('data', function(d) { serverOut += d; });
  server.stderr.on('data', function(d) { serverErr += d; });

  var serverReady = await waitForServer(BASE_URL + '/health/live', 30, 2000);
  if (!serverReady) {
    console.log('SERVER START FAILED on port ' + TEST_PORT);
    console.log('stdout:', serverOut.slice(-500));
    console.log('stderr:', serverErr.slice(-500));
    try { server.kill(); } catch(e) {}
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch(e) {}
    process.exit(1);
  }
  console.log('Server started on port ' + TEST_PORT);

  // HTTP-level tests first
  console.log('\n--- HTTP API Tests ---');

  // Test dashboard API
  try {
    var dashResp = await fetch(BASE_URL + '/api/admin/dashboard');
    var dashData = await dashResp.json();
    check('DASHBOARD_API_OK', dashResp.status === 200, 'status=' + dashResp.status);
  } catch(e) {
    check('DASHBOARD_API_OK', false, e.message);
  }

  // Test news API
  try {
    var newsResp = await fetch(BASE_URL + '/api/admin/news');
    check('NEWS_API_OK', newsResp.status === 200, 'status=' + newsResp.status);
    if (newsResp.status === 200) {
      var newsData = await newsResp.json();
      check('NEWS_API_HAS_DATA', newsData && Array.isArray(newsData.selected) && newsData.selected.length > 0,
        'count=' + (newsData.selected ? newsData.selected.length : 'N/A'));
    }
  } catch(e) {
    check('NEWS_API_OK', false, e.message);
  }

  // Test photos API
  try {
    var photosResp = await fetch(BASE_URL + '/api/admin/photos');
    check('PHOTOS_API_OK', photosResp.status === 200, 'status=' + photosResp.status);
    if (photosResp.status === 200) {
      var photosData = await photosResp.json();
      check('PHOTOS_API_HAS_DATA', photosData && Array.isArray(photosData.photos) && photosData.photos.length > 0,
        'count=' + (photosData.photos ? photosData.photos.length : 'N/A'));
    }
  } catch(e) {
    check('PHOTOS_API_OK', false, e.message);
  }

  // Test photo detail API
  try {
    // Get first photo ID from the list
    var pd = await (await fetch(BASE_URL + '/api/admin/photos')).json();
    var photoId = pd.photos && pd.photos[0] && pd.photos[0].id;
    if (photoId) {
      var detailResp = await fetch(BASE_URL + '/api/admin/photos/' + encodeURIComponent(photoId));
      check('PHOTO_DETAIL_API', detailResp.status === 200, 'status=' + detailResp.status);
      if (detailResp.status === 200) {
        var detail = await detailResp.json();
        check('PHOTO_DETAIL_HAS_TITLE', detail && detail.photo && detail.photo.title, 'title=' + (detail.photo ? detail.photo.title : 'N/A'));
      }
    }
  } catch(e) {
    check('PHOTO_DETAIL_API', false, e.message);
  }

  // Test photo palette API (requires id and actual image file)
  try {
    var pData = await (await fetch(BASE_URL + '/api/admin/photos')).json();
    var pId = pData.photos && pData.photos[0] && pData.photos[0].id;
    if (pId) {
      var palResp = await fetch(BASE_URL + '/api/admin/photo-palette?id=' + encodeURIComponent(pId));
      // Palette requires actual image file on disk (not in fixture); accept 404 or 200
      check('PHOTO_PALETTE_API', palResp.status === 200 || palResp.status === 404,
        'status=' + palResp.status + ' id=' + pId);
    } else {
      check('PHOTO_PALETTE_API', false, 'no photo id available');
    }
  } catch(e) {
    check('PHOTO_PALETTE_API', false, e.message);
  }

  // Test control mode API
  try {
    var cmResp = await fetch(BASE_URL + '/api/admin/control-mode');
    check('CONTROL_MODE_API_OK', cmResp.status === 200, 'status=' + cmResp.status);
    if (cmResp.status === 200) {
      var cm = await cmResp.json();
      check('CONTROL_MODE_HAS_MODE', cm && cm.mode, 'mode=' + (cm.mode || cm.status));
    }
  } catch(e) {
    check('CONTROL_MODE_API_OK', false, e.message);
  }

  // Test publish history API
  try {
    var histResp = await fetch(BASE_URL + '/api/admin/publish-history');
    check('PUBLISH_HISTORY_API_OK', histResp.status === 200, 'status=' + histResp.status);
  } catch(e) {
    check('PUBLISH_HISTORY_API_OK', false, e.message);
  }

  // Test 404 for non-existent photo
  try {
    var notFoundResp = await fetch(BASE_URL + '/api/admin/photos/nonexistent-id-12345');
    check('PHOTO_DETAIL_404', notFoundResp.status === 404, 'status=' + notFoundResp.status);
  } catch(e) {
    check('PHOTO_DETAIL_404', false, e.message);
  }

  // Test non-2xx does not return success
  try {
    var errorResp = await fetch(BASE_URL + '/api/admin/photos/nonexistent-id-12345');
    if (errorResp.status >= 400) {
      try {
        var errorJson = await errorResp.json();
        check('ERROR_RESPONSE_STRUCTURED', errorJson.status === 'error' || errorJson.error, 
          'status=' + errorResp.status + ' body=' + JSON.stringify(errorJson).slice(0,100));
      } catch(e) {
        check('ERROR_RESPONSE_STRUCTURED', false, 'non-json error body');
      }
    }
  } catch(e) {
    check('ERROR_RESPONSE_STRUCTURED', false, e.message);
  }

  // Browser tests
  var browser = null;
  try {
    browser = await playwright.chromium.launch({ headless: true });
    var context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });
    var page = await context.newPage();

    var consoleErrors = [];
    var pageErrors = [];
    page.on('console', function(msg) {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', function(err) {
      pageErrors.push(err.message);
    });

    console.log('\n--- Browser Tests ---');

    // Navigate to admin
    var response = await page.goto(BASE_URL + '/admin', { waitUntil: 'networkidle', timeout: 30000 });
    check('ADMIN_PAGE_LOADS', response && response.status() === 200, 'http=' + (response && response.status()));
    await page.waitForTimeout(2000);

    // Dashboard should load — check for the dashboard tab being active
    var dashTabActive = await page.evaluate(function() {
      var a = document.querySelector('a[data-tab="dashboard"]');
      return a !== null;
    });
    check('DASHBOARD_TAB_EXISTS', dashTabActive);

    // Check dashboard content area
    var dashContent = await page.evaluate(function() {
      var d = document.getElementById('dashboard');
      return d ? d.style.display !== 'none' && d.className.indexOf('hidden') < 0 : false;
    });
    check('DASHBOARD_CONTENT_VISIBLE', dashContent);

    // Dashboard stats populated
    var uptimeEl = await page.evaluate(function() {
      var el = document.getElementById('dash-uptime');
      return el ? el.textContent : null;
    });
    check('DASHBOARD_UPTIME', uptimeEl !== null && uptimeEl !== '加载中…' && uptimeEl !== '',
      'uptime="' + (uptimeEl || '') + '"');

    // Control mode info not stuck at loading
    await page.waitForTimeout(1500);
    var controlModeText = await page.evaluate(function() {
      var el = document.getElementById('control-mode-info');
      return el ? el.textContent : null;
    });
    check('CONTROL_MODE_NOT_STUCK',
      controlModeText === null || (controlModeText.indexOf('加载中') < 0),
      'text="' + (controlModeText || 'null') + '"');

    var pageHasErrors = consoleErrors.length > 0 || pageErrors.length > 0;
    if (pageHasErrors) {
      console.log('  [INFO] Console errors: ' + JSON.stringify(consoleErrors.slice(0, 5)));
      console.log('  [INFO] Page errors: ' + JSON.stringify(pageErrors.slice(0, 5)));
    }
    check('NO_PAGE_ERRORS', !pageHasErrors, pageHasErrors ? (consoleErrors.length + ' console, ' + pageErrors.length + ' page errors') : 'clean');

    // Test news quick publish selector
    var newsSelectExists = await page.evaluate(function() {
      var sel = document.getElementById('quick-news-select');
      return sel !== null;
    });
    check('NEWS_SELECTOR_EXISTS', newsSelectExists);

    var newsBtnExists = await page.evaluate(function() {
      var btn = document.getElementById('btn-quick-publish-news');
      return btn !== null;
    });
    check('NEWS_PUBLISH_BUTTON_EXISTS', newsBtnExists);

    // Switch to news page
    await page.click('a[data-tab="news-page"]');
    await page.waitForTimeout(1500);

    var newsListVisible = await page.evaluate(function() {
      var l = document.getElementById('news-list');
      return l !== null;
    });
    check('NEWS_LIST_CONTAINER', newsListVisible);

    // Check handler existence
    var handlers = await page.evaluate(function() {
      return {
        saveNewsDraft: typeof saveNewsDraft === 'function',
        publishNews: typeof publishNews === 'function',
        loadNewsReview: typeof loadNewsReview === 'function',
        confirmRollback: typeof confirmRollback === 'function',
        closeRollbackPreview: typeof closeRollbackPreview === 'function'
      };
    });
    check('SAVE_NEWS_DRAFT_HANDLER', handlers.saveNewsDraft);
    check('PUBLISH_NEWS_HANDLER', handlers.publishNews);
    check('LOAD_NEWS_REVIEW_HANDLER', handlers.loadNewsReview);
    check('CONFIRM_ROLLBACK_HANDLER', handlers.confirmRollback);
    check('CLOSE_ROLLBACK_PREVIEW_HANDLER', handlers.closeRollbackPreview);

    // Switch to photos page
    await page.click('a[data-tab="photos-page"]');
    await page.waitForTimeout(1500);

    var photoGridVisible = await page.evaluate(function() {
      var g = document.getElementById('photo-grid');
      return g !== null;
    });
    check('PHOTO_GRID_CONTAINER', photoGridVisible);

    var photoHandlers = await page.evaluate(function() {
      return {
        loadPhotos: typeof loadPhotos === 'function',
        deletePhoto: typeof deletePhoto === 'function',
        openEditor: typeof openEditor === 'function',
        populatePhotoSelector: typeof populatePhotoSelector === 'function'
      };
    });
    check('LOAD_PHOTOS_HANDLER', photoHandlers.loadPhotos);
    check('DELETE_PHOTO_HANDLER', photoHandlers.deletePhoto);
    check('OPEN_EDITOR_HANDLER', photoHandlers.openEditor);
    check('POPULATE_PHOTO_SELECTOR', photoHandlers.populatePhotoSelector);

    // Test photo selector
    var photoSelectExists = await page.evaluate(function() {
      var sel = document.getElementById('quick-photo-select');
      return sel !== null;
    });
    check('PHOTO_SELECTOR_EXISTS', photoSelectExists);

    var photoPublishBtnExists = await page.evaluate(function() {
      var btn = document.getElementById('btn-quick-publish-photo');
      return btn !== null;
    });
    check('PHOTO_PUBLISH_BUTTON_EXISTS', photoPublishBtnExists);

    // Switch to publish center
    await page.click('a[data-tab="publish-page"]');
    await page.waitForTimeout(1500);

    var pubHistoryListVisible = await page.evaluate(function() {
      var h = document.getElementById('publish-history-list');
      return h !== null;
    });
    check('PUBLISH_HISTORY_CONTAINER', pubHistoryListVisible);

    // Test rollback preview exists
    var rollbackPreview = await page.evaluate(function() {
      var rp = document.getElementById('rollback-preview');
      return rp !== null;
    });
    check('ROLLBACK_PREVIEW_EXISTS', rollbackPreview);

    var rollbackPreviewContent = await page.evaluate(function() {
      var rp = document.getElementById('rollback-preview-content');
      return rp !== null;
    });
    check('ROLLBACK_PREVIEW_CONTENT_EXISTS', rollbackPreviewContent);

    // Test the api function handles non-2xx
    var apiHasOkCheck = await page.evaluate(function() {
      var src = window.api ? api.toString() : '';
      return src.indexOf('.ok') >= 0 || src.indexOf('!r.ok') >= 0 || src.indexOf('!res.ok') >= 0;
    });
    check('API_CHECKS_OK', apiHasOkCheck);

    if (browser) await browser.close();
  } catch(e) {
    console.log('BROWSER TEST ERROR: ' + e.message);
    if (e.stack) console.log(e.stack);
    if (browser) try { await browser.close(); } catch(e2) {}
  }

  // Cleanup
  try { server.kill('SIGTERM'); } catch(e) {}
  await new Promise(function(r) { setTimeout(r, 1000); });
  try { server.kill('SIGKILL'); } catch(e) {}
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch(e) {}

  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(function(err) {
  console.log('FATAL: ' + err.message);
  console.log(err.stack);
  process.exit(1);
});
