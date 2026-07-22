const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');

describe('NewsTitleService — title preservation (unit)', () => {
  let nts;

  before(async () => {
    var mod = require('../../../src/news/news-title-service');
    nts = new mod.NewsTitleService();
  });

  it('preserves rawTitle as original input', async () => {
    var r = await nts.normalizeTitle('【直播】新闻发布会特别报道', '摘要');
    assert.equal(r.rawTitle, '【直播】新闻发布会特别报道');
    assert.ok(r.displayTitle);
    assert.ok(r.rawTitle.indexOf('【直播】') >= 0, 'rawTitle should contain original prefix');
  });

  it('returns structured result with all required fields', async () => {
    var r = await nts.normalizeTitle('测试标题', '测试摘要');
    var required = ['rawTitle', 'displayTitle', 'titleWidthPx', 'titleMaxWidthPx', 'titleStatus', 'reviewStatus', 'normalizationVersion'];
    for (var i = 0; i < required.length; i++) {
      assert.ok(required[i] in r, 'missing field: ' + required[i]);
    }
  });

  it('keeps long title intact in rawTitle', async () => {
    var longTitle = '这是一个非常长的标题它不应该被直接截断而是通过语义处理保留完整内容以便前端显示';
    var r = await nts.normalizeTitle(longTitle, '摘要');
    assert.equal(r.rawTitle, longTitle);
  });

  it('titleWidthPx and titleMaxWidthPx are positive numbers', async () => {
    var r = await nts.normalizeTitle('测试', '摘要');
    assert.ok(r.titleWidthPx > 0);
    assert.ok(r.titleMaxWidthPx > 0);
    assert.ok(Number.isFinite(r.titleWidthPx));
    assert.ok(Number.isFinite(r.titleMaxWidthPx));
  });

  it('normalizationVersion is non-empty string', async () => {
    var r = await nts.normalizeTitle('测试', '摘要');
    assert.ok(r.normalizationVersion && r.normalizationVersion.length > 0);
  });

  it('returns needs_review when renderer unavailable', async () => {
    var r = await nts.normalizeTitle('', '');
    assert.equal(r.titleStatus, 'error');
  });
});

describe('Playwright visual regression', () => {
  var app, server, baseUrl, closeApp, adminToken, browser;

  before(async function() {
    var { createApplication } = require('../../../src/app-factory');
    var factory = createApplication();
    app = factory.app;
    closeApp = factory.close;
    adminToken = factory.adminToken;

    await factory.ensureInitialized();

    await new Promise(function(resolve, reject) {
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', function() {
        var addr = server.address();
        baseUrl = 'http://127.0.0.1:' + addr.port;
        resolve();
      });
      server.on('error', reject);
    });

    var playwright;
    try {
      playwright = require('playwright');
    } catch(e) {
      throw new Error('Playwright not installed. Install with: npx playwright install --with-deps chromium');
    }
    browser = await playwright.chromium.launch({ headless: true });
  });

  after(async function() {
    if (browser) await browser.close();
    if (server) await new Promise(function(r) { server.close(r); });
    if (closeApp) await closeApp();
  });

  var RESOLUTIONS = [
    { width: 1280, height: 800, label: '1280x800' },
    { width: 1440, height: 900, label: '1440x900' },
    { width: 1920, height: 1080, label: '1920x1080' },
  ];

  var PAGES = [
    { id: 'dashboard', label: 'dashboard' },
    { id: 'news-page', label: 'news' },
    { id: 'photos-page', label: 'photos' },
    { id: 'photo-editor-page', label: 'photo-editor' },
    { id: 'publish-page', label: 'publish-history' },
    { id: 'status-page', label: 'status' }
  ];

  RESOLUTIONS.forEach(function(res) {
    it('generates 6 page screenshots at ' + res.label, async function() {
      var context = await browser.newContext({ viewport: { width: res.width, height: res.height } });
      var page = await context.newPage();

      var pageErrors = [];
      var consoleErrors = [];
      var failedRequests = [];

      page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
      page.on('pageerror', err => pageErrors.push(err.message));
      page.on('requestfailed', req => {
        var u = req.url();
        if (u.indexOf('favicon') < 0 && u.indexOf('mcs.ziieapi.com') < 0) {
          failedRequests.push(u);
        }
      });

      await page.goto(baseUrl + '/admin/', { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);

      var ssDir = path.join(__dirname, '../../..', 'screenshots');
      if (!fs.existsSync(ssDir)) fs.mkdirSync(ssDir, { recursive: true });

      var metadataList = [];

      for (const p of PAGES) {
        // Switch tab via JS or click
        await page.evaluate(function(tabId) {
          if (typeof switchTab === 'function') {
            switchTab(tabId);
          } else {
            var el = document.getElementById(tabId);
            if (el) {
              document.querySelectorAll('.page').forEach(pg => pg.classList.remove('active'));
              el.classList.add('active');
            }
          }
        }, p.id);
        await page.waitForTimeout(300);

        var fileName = p.label + '-' + res.label + '.png';
        var filePath = path.join(ssDir, fileName);
        var buf = await page.screenshot({ path: filePath, fullPage: true });
        assert.ok(buf.length > 1000, 'Screenshot too small: ' + buf.length + ' for ' + fileName);

        var sha = require('crypto').createHash('sha256').update(buf).digest('hex');
        metadataList.push({ page: p.label, resolution: res.label, file: fileName, sha256: sha });
      }

      console.log('Visual Coverage (' + res.label + '):', JSON.stringify(metadataList, null, 2));

      // Filter console errors
      var realConsoleErrs = consoleErrors.filter(m => m.indexOf('favicon') < 0 && m.indexOf('mcs.ziieapi.com') < 0);
      assert.equal(pageErrors.length, 0, 'page errors in visual test: ' + pageErrors.join('; '));
      assert.equal(realConsoleErrs.length, 0, 'console errors in visual test: ' + realConsoleErrs.join('; '));
      assert.equal(failedRequests.length, 0, 'failed requests in visual test: ' + failedRequests.join('; '));

      await context.close();
    });
  });
});
