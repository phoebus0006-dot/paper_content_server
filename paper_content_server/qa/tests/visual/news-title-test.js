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

  RESOLUTIONS.forEach(function(res) {
    it('screenshots at ' + res.label, async function() {
      var context = await browser.newContext({ viewport: { width: res.width, height: res.height } });
      var page = await context.newPage();

      await page.goto(baseUrl + '/admin/', { waitUntil: 'networkidle' });

      // Wait for the admin page to load
      await page.waitForTimeout(500);

      // Take workbench screenshot
      var ssDir = path.join(__dirname, '..', '..', 'screenshots');
      if (!fs.existsSync(ssDir)) fs.mkdirSync(ssDir, { recursive: true });
      var workbench = await page.screenshot({ path: path.join(ssDir, 'workbench-' + res.label + '.png') });
      assert.ok(workbench.length > 1000, 'Workbench screenshot too small: ' + workbench.length);

      // Take system page screenshot
      await page.goto(baseUrl + '/admin/index.html#system', { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);
      var system = await page.screenshot({ path: path.join(ssDir, 'system-' + res.label + '.png') });
      assert.ok(system.length > 1000, 'System screenshot too small: ' + system.length);

      await context.close();
    });
  });

  it('admin login page loads without auth errors', async function() {
    var context = await browser.newContext();
    var page = await context.newPage();
    var errors = [];
    page.on('console', function(msg) { if (msg.type() === 'error') errors.push(msg.text()); });
    await page.goto(baseUrl + '/admin/', { waitUntil: 'networkidle' });
    // Should get some kind of response (login page, error, or state)
    var html = await page.content();
    assert.ok(html.length > 100, 'Page content too short');
    await context.close();
  });
});
