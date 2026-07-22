const crypto = require('crypto');
const sharp = require('sharp');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const ROOT = path.join(__dirname, '..', '..');

function request(port, method, urlPath, body, authToken) {
  return new Promise(function (resolve, reject) {
    var opts = {
      hostname: '127.0.0.1',
      port: port,
      path: urlPath,
      method: method,
      headers: {},
    };
    if (authToken) opts.headers['Authorization'] = 'Bearer ' + authToken;
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(body));
    }
    var req = http.request(opts, function (r) {
      var d = [];
      r.on('data', function (c) { d.push(c); });
      r.on('end', function () { resolve({ status: r.statusCode, headers: r.headers, body: Buffer.concat(d) }); });
    });
    req.on('error', reject);
    req.setTimeout(15000, function () { req.destroy(); reject(new Error('timeout: ' + method + ' ' + urlPath)); });
    req.end(body !== undefined ? Buffer.from(JSON.stringify(body)) : undefined);
  });
}

async function makeTestImage(filePath, width, height, pixelFn) {
  var ch = 3;
  var buf = Buffer.alloc(width * height * ch);
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      var offset = (y * width + x) * ch;
      var c = pixelFn(x, y, width, height);
      buf[offset] = c[0]; buf[offset + 1] = c[1]; buf[offset + 2] = c[2];
    }
  }
  await sharp(buf, { raw: { width: width, height: height, channels: ch } }).png().toFile(filePath);
}

function writeStateFiles(dir) {
  fs.writeFileSync(path.join(dir, 'feeds.json'), '[]');
  fs.writeFileSync(path.join(dir, 'news_cache.json'), JSON.stringify({ version: 1, updatedAt: null, translations: {} }));
  fs.writeFileSync(path.join(dir, 'news_rotation_state.json'), JSON.stringify({ version: 1, updatedAt: null, shown: [] }));
  fs.writeFileSync(path.join(dir, 'library_state.json'), JSON.stringify({ themeCursor: 0, currentTheme: null, currentImageIndex: 0, remainingThemeSlots: 1, lastSlotKey: null, lastSwitchDate: null, patternIndex: 0, currentKind: null }));
  fs.writeFileSync(path.join(dir, 'image_index.json'), '[]');
}

async function createAssetAndServer(tmpDir, opts) {
  opts = opts || {};
  writeStateFiles(tmpDir);

  var { SafeImagePath } = require(path.join(ROOT, 'src', 'files', 'safe-image-path'));
  var { AssetRepository } = require(path.join(ROOT, 'src', 'assets', 'asset-repository'));
  var { createHandler } = require(path.join(ROOT, 'server.js'));

  var assetsFile = path.join(tmpDir, 'assets.json');
  fs.writeFileSync(assetsFile, JSON.stringify({ schemaVersion: 1, assets: {} }));

  var assetRepo = opts.assetRepo !== undefined ? opts.assetRepo : AssetRepository(assetsFile);
  var origRepoUpdate = opts.origRepoUpdate !== undefined ? opts.origRepoUpdate : null;
  if (assetRepo && origRepoUpdate) {
    assetRepo.update = origRepoUpdate;
  }

  var safeRoot = opts.safeImageRoot || tmpDir;
  var safeImagePath = new SafeImagePath({ rootDir: safeRoot });
  var token = opts.token || ('test-token-' + crypto.randomBytes(4).toString('hex'));

  var testImagePath = opts.testImagePath || path.join(tmpDir, 'test_src.png');

  var assetId = opts.assetId || ('test-asset-' + crypto.randomBytes(4).toString('hex'));

  var asset = null;
  if (opts.skipAsset !== true && assetRepo) {
    var imgBuf = fs.readFileSync(testImagePath);
    var imgMeta = await sharp(imgBuf).metadata();
    var imgHash = crypto.createHash('sha256').update(imgBuf).digest('hex');
    asset = {
      assetId: assetId,
      localPath: testImagePath,
      mimeType: 'image/png',
      width: imgMeta.width,
      height: imgMeta.height,
      sha256: imgHash,
      libraryType: 'custom',
      lifecycleStatus: 'SELECTABLE',
      safetyStatus: 'SAFE',
      reviewStatus: 'APPROVED',
      createdAt: new Date().toISOString(),
    };
    if (opts.assetOverrides) {
      Object.assign(asset, opts.assetOverrides);
    }
    await assetRepo.create(asset);
  }

  var ctx = {
    DATA_DIR: tmpDir,
    IMAGE_INDEX_FILE: path.join(tmpDir, 'image_index.json'),
    LIBRARY_STATE_FILE: path.join(tmpDir, 'library_state.json'),
    NEWS_CACHE_FILE: path.join(tmpDir, 'news_cache.json'),
    NEWS_ROTATION_FILE: path.join(tmpDir, 'news_rotation_state.json'),
    FEEDS_FILE: path.join(tmpDir, 'feeds.json'),
    LAST_GOOD_NEWS_FILE: path.join(tmpDir, 'last_good_news.json'),
    FALLBACK_STUDY_DIR: path.join(tmpDir, 'fallback_study'),
    assetRepository: opts.includeAssetRepo === false ? null : assetRepo,
    safeImagePath: safeImagePath,
    adminAccessMode: 'token',
    adminToken: token,
    serverStartTime: Date.now(),
    cachedFrames: new Map(),
    cachedSnapshots: new Map(),
    renderCount: 0,
    config: {
      paths: {
        dataDir: tmpDir,
        imagesDir: tmpDir,
        rawImagesDir: tmpDir,
        processedImagesDir: tmpDir,
        importImagesDir: tmpDir,
      },
    },
  };
  if (opts.ctxOverrides) Object.assign(ctx, opts.ctxOverrides);

  var handler = createHandler(ctx);
  var server = http.createServer(handler);
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  var port = server.address().port;

  return { server: server, port: port, ctx: ctx, assetRepo: assetRepo, token: token, assetId: assetId, testImagePath: testImagePath, asset: asset };
}

describe('Admin Image Editor', function () {

  it('save-edit without auth returns 403', async function () {
    var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-test-'));
    try {
      var srcPath = path.join(tmpDir, 'src.png');
      await makeTestImage(srcPath, 800, 480, function (x) { return x < 400 ? [255, 0, 0] : [0, 0, 255]; });
      var env = await createAssetAndServer(tmpDir, { testImagePath: srcPath });
      var r = await request(env.port, 'POST', '/api/admin/photos/' + encodeURIComponent(env.assetId) + '/save-edit', { recipe: { flipH: true } });
      assert.equal(r.status, 403);
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
    }
  });

  it('save-edit with missing asset returns 404', async function () {
    var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-test-'));
    try {
      var env = await createAssetAndServer(tmpDir, { skipAsset: true });
      var r = await request(env.port, 'POST', '/api/admin/photos/' + encodeURIComponent('nonexistent-' + crypto.randomBytes(4).toString('hex')) + '/save-edit', { recipe: { flipH: true } }, env.token);
      assert.equal(r.status, 404);
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
    }
  });

  it('save-edit with bad JSON returns 400', async function () {
    var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-test-'));
    try {
      var env = await createAssetAndServer(tmpDir, { skipAsset: true });
      var r = await new Promise(function (resolve, reject) {
        var opts = {
          hostname: '127.0.0.1',
          port: env.port,
          path: '/api/admin/photos/' + encodeURIComponent('some-id') + '/save-edit',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + env.token,
          },
        };
        var req = http.request(opts, function (res) {
          var d = [];
          res.on('data', function (c) { d.push(c); });
          res.on('end', function () { resolve({ status: res.statusCode, body: Buffer.concat(d) }); });
        });
        req.on('error', reject);
        req.write('{invalid json!!!');
        req.end();
      });
      assert.equal(r.status, 400);
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
    }
  });

  it('save-edit repository unavailable returns 503', async function () {
    var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-test-'));
    try {
      var env = await createAssetAndServer(tmpDir, { includeAssetRepo: false, skipAsset: true });
      var r = await request(env.port, 'POST', '/api/admin/photos/' + encodeURIComponent('any-id') + '/save-edit', { recipe: { flipH: true } }, env.token);
      assert.equal(r.status, 503);
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
    }
  });

  it('save-edit flipH=true flips image horizontally with pixel-level assertion', async function () {
    var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-test-'));
    try {
      var srcPath = path.join(tmpDir, 'src.png');
      await makeTestImage(srcPath, 800, 480, function (x) { return x < 400 ? [255, 0, 0] : [0, 0, 255]; });
      var env = await createAssetAndServer(tmpDir, { testImagePath: srcPath });

      var r = await request(env.port, 'POST', '/api/admin/photos/' + encodeURIComponent(env.assetId) + '/save-edit', { recipe: { flipH: true } }, env.token);
      assert.equal(r.status, 200);
      var body = JSON.parse(r.body.toString());
      assert.ok(body.sha256);

      var getR = await request(env.port, 'GET', '/api/admin/library/' + encodeURIComponent(env.assetId) + '/full', undefined, env.token);
      assert.equal(getR.status, 200);
      var pixels = await sharp(getR.body).raw().toBuffer();

      var w = 800;
      var idx10 = (10 * w + 10) * 3;
      assert.ok(pixels[idx10 + 2] > 200, 'pixel(10,10) B channel should be high (blue) after flipH');
      assert.ok(pixels[idx10] < 50, 'pixel(10,10) R channel should be low after flipH');

      var idx790 = (10 * w + 790) * 3;
      assert.ok(pixels[idx790] > 200, 'pixel(790,10) R channel should be high (red) after flipH');
      assert.ok(pixels[idx790 + 2] < 50, 'pixel(790,10) B channel should be low after flipH');
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
    }
  });

  it('save-edit manual-crop produces 800x480 cover image from left half with pixel assertion', async function () {
    var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-test-'));
    try {
      var srcPath = path.join(tmpDir, 'src.png');
      await makeTestImage(srcPath, 800, 480, function (x) { return x < 400 ? [255, 0, 0] : [0, 0, 255]; });
      var env = await createAssetAndServer(tmpDir, { testImagePath: srcPath });

      var r = await request(env.port, 'POST', '/api/admin/photos/' + encodeURIComponent(env.assetId) + '/save-edit', {
        recipe: { mode: 'manual-crop', cropRect: { x: 0, y: 0, width: 400, height: 480 } },
      }, env.token);
      assert.equal(r.status, 200);
      var body = JSON.parse(r.body.toString());
      assert.ok(body.sha256);

      var getR = await request(env.port, 'GET', '/api/admin/library/' + encodeURIComponent(env.assetId) + '/full', undefined, env.token);
      assert.equal(getR.status, 200);
      var meta = await sharp(getR.body).metadata();
      assert.equal(meta.width, 800);
      assert.equal(meta.height, 480);

      var pixels = await sharp(getR.body).raw().toBuffer();
      var w = meta.width;
      var idx10 = (10 * w + 10) * 3;
      assert.ok(pixels[idx10] > 200, 'pixel(10,10) R should be high (left half red stretched)');
      var idx790 = (10 * w + 790) * 3;
      assert.ok(pixels[idx790] > 200, 'pixel(790,10) R should also be high (whole image from left half)');
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
    }
  });

  it('save-edit brightness pixel-level assertion', async function () {
    var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-test-'));
    try {
      var srcPath = path.join(tmpDir, 'src.png');
      await makeTestImage(srcPath, 800, 480, function () { return [128, 128, 128]; });
      var env = await createAssetAndServer(tmpDir, { testImagePath: srcPath });

      var r1 = await request(env.port, 'POST', '/api/admin/photos/' + encodeURIComponent(env.assetId) + '/save-edit', {
        recipe: { brightness: 1 },
      }, env.token);
      assert.equal(r1.status, 200);

      var getR1 = await request(env.port, 'GET', '/api/admin/library/' + encodeURIComponent(env.assetId) + '/full', undefined, env.token);
      assert.equal(getR1.status, 200);
      var p1 = await sharp(getR1.body).raw().toBuffer();
      var avg1 = (p1[0] + p1[1] + p1[2]) / 3;
      assert.ok(avg1 > 200, 'brightness=1 should produce bright pixels (>200 avg, got ' + avg1 + ')');

      var r2 = await request(env.port, 'POST', '/api/admin/photos/' + encodeURIComponent(env.assetId) + '/save-edit', {
        recipe: { brightness: -1 },
      }, env.token);
      assert.equal(r2.status, 200);

      var getR2 = await request(env.port, 'GET', '/api/admin/library/' + encodeURIComponent(env.assetId) + '/full', undefined, env.token);
      assert.equal(getR2.status, 200);
      var p2 = await sharp(getR2.body).raw().toBuffer();
      var avg2 = (p2[0] + p2[1] + p2[2]) / 3;
      assert.ok(avg2 < 50, 'brightness=-1 should produce dark pixels (<50 avg, got ' + avg2 + ')');
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
    }
  });

  it('save-edit contrast pixel-level assertion', async function () {
    var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-test-'));
    try {
      var srcPath = path.join(tmpDir, 'src.png');
      await makeTestImage(srcPath, 800, 480, function (x) {
        var v = 64 + Math.floor((x / 799) * 128);
        return [v, v, v];
      });
      var env = await createAssetAndServer(tmpDir, { testImagePath: srcPath });

      var r1 = await request(env.port, 'POST', '/api/admin/photos/' + encodeURIComponent(env.assetId) + '/save-edit', {
        recipe: { contrast: 1 },
      }, env.token);
      assert.equal(r1.status, 200);

      var getR1 = await request(env.port, 'GET', '/api/admin/library/' + encodeURIComponent(env.assetId) + '/full', undefined, env.token);
      assert.equal(getR1.status, 200);
      var p1 = await sharp(getR1.body).raw().toBuffer();
      var min1 = 255, max1 = 0;
      for (var i = 0; i < p1.length; i += 3) {
        var val = p1[i];
        if (val < min1) min1 = val;
        if (val > max1) max1 = val;
      }
      assert.ok(max1 - min1 > 128, 'contrast=1 should increase range (got ' + (max1 - min1) + ')');

      var r2 = await request(env.port, 'POST', '/api/admin/photos/' + encodeURIComponent(env.assetId) + '/save-edit', {
        recipe: { contrast: -1 },
      }, env.token);
      assert.equal(r2.status, 200);

      var getR2 = await request(env.port, 'GET', '/api/admin/library/' + encodeURIComponent(env.assetId) + '/full', undefined, env.token);
      assert.equal(getR2.status, 200);
      var p2 = await sharp(getR2.body).raw().toBuffer();
      var min2 = 255, max2 = 0;
      for (var j = 0; j < p2.length; j += 3) {
        var v = p2[j];
        if (v < min2) min2 = v;
        if (v > max2) max2 = v;
      }
      assert.ok(max2 - min2 < 128, 'contrast=-1 should decrease range (got ' + (max2 - min2) + ')');
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
    }
  });

  it('neutral recipe preserves non-black output', async function () {
    var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-test-'));
    try {
      var srcPath = path.join(tmpDir, 'src.png');
      await makeTestImage(srcPath, 800, 480, function (x) {
        var v = 64 + Math.floor((x / 799) * 128);
        return [v, v, v];
      });
      var env = await createAssetAndServer(tmpDir, { testImagePath: srcPath });

      var r = await request(env.port, 'POST', '/api/admin/photos/' + encodeURIComponent(env.assetId) + '/save-edit', {
        recipe: {},
      }, env.token);
      assert.equal(r.status, 200);

      var getR = await request(env.port, 'GET', '/api/admin/library/' + encodeURIComponent(env.assetId) + '/full', undefined, env.token);
      assert.equal(getR.status, 200);
      var pixels = await sharp(getR.body).raw().toBuffer();
      var total = 0;
      for (var i = 0; i < Math.min(1000, pixels.length); i++) total += pixels[i];
      assert.ok(total > 0, 'neutral recipe should produce non-black output');
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
    }
  });

  it('forbidden path sibling-prefix returns 403', async function () {
    var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-test-'));
    try {
      var siblingDir = tmpDir + '-extra';
      fs.mkdirSync(siblingDir);
      var trapPath = path.join(siblingDir, 'trap.png');
      await makeTestImage(trapPath, 800, 480, function (x) { return [255, 0, 0]; });

      var env = await createAssetAndServer(tmpDir, { skipAsset: true });

      var { AssetRepository } = require(path.join(ROOT, 'src', 'assets', 'asset-repository'));
      var sidRepo = AssetRepository(path.join(tmpDir, 'assets.json'));
      var assetId = 'sibling-trap-' + crypto.randomBytes(4).toString('hex');
      var imgBuf = fs.readFileSync(trapPath);
      var imgHash = crypto.createHash('sha256').update(imgBuf).digest('hex');
      await sidRepo.create({
        assetId: assetId,
        localPath: trapPath,
        mimeType: 'image/png',
        width: 800,
        height: 480,
        sha256: imgHash,
        libraryType: 'custom',
        lifecycleStatus: 'SELECTABLE',
        safetyStatus: 'SAFE',
        reviewStatus: 'APPROVED',
        createdAt: new Date().toISOString(),
      });

      env.ctx.assetRepository = sidRepo;
      env.assetRepo = sidRepo;

      var r = await request(env.port, 'POST', '/api/admin/photos/' + encodeURIComponent(assetId) + '/save-edit', { recipe: { flipH: true } }, env.token);
      assert.ok(r.status === 403 || r.status === 404, 'sibling-prefix path should be rejected (got ' + r.status + ')');
    } finally {
      try {
        var siblingDir = tmpDir + '-extra';
        if (fs.existsSync(siblingDir)) fs.rmSync(siblingDir, { recursive: true, force: true });
      } catch (e) {}
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
    }
  });

  it('non-image file returns error', async function () {
    var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-test-'));
    try {
      var txtPath = path.join(tmpDir, 'not_an_image.png');
      fs.writeFileSync(txtPath, 'this is not a valid image file content');

      var env = await createAssetAndServer(tmpDir, { skipAsset: true });
      var { AssetRepository } = require(path.join(ROOT, 'src', 'assets', 'asset-repository'));
      var txtRepo = AssetRepository(path.join(tmpDir, 'assets.json'));
      var assetId = 'not-img-' + crypto.randomBytes(4).toString('hex');
      var txtBuf = fs.readFileSync(txtPath);
      var txtHash = crypto.createHash('sha256').update(txtBuf).digest('hex');
      await txtRepo.create({
        assetId: assetId,
        localPath: txtPath,
        mimeType: 'image/png',
        width: 800,
        height: 480,
        sha256: txtHash,
        libraryType: 'custom',
        lifecycleStatus: 'SELECTABLE',
        safetyStatus: 'SAFE',
        reviewStatus: 'APPROVED',
        createdAt: new Date().toISOString(),
      });

      env.ctx.assetRepository = txtRepo;
      env.assetRepo = txtRepo;

      var r = await request(env.port, 'POST', '/api/admin/photos/' + encodeURIComponent(assetId) + '/save-edit', { recipe: { flipH: true } }, env.token);
      assert.ok(r.status >= 400, 'non-image file should return error (got ' + r.status + ')');
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
    }
  });

  it('assetRepository.update reject returns 500 and no orphan .tmp file', async function () {
    var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-test-'));
    try {
      var srcPath = path.join(tmpDir, 'src.png');
      await makeTestImage(srcPath, 800, 480, function () { return [128, 128, 128]; });
      var { AssetRepository } = require(path.join(ROOT, 'src', 'assets', 'asset-repository'));
      var assetsFile = path.join(tmpDir, 'assets.json');
      fs.writeFileSync(assetsFile, JSON.stringify({ schemaVersion: 1, assets: {} }));
      var repo = AssetRepository(assetsFile);
      var origUpdate = repo.update;
      repo.update = function () {
        return Promise.reject(new Error('mock update failure'));
      };
      var env = await createAssetAndServer(tmpDir, { testImagePath: srcPath, assetRepo: repo });

      var r = await request(env.port, 'POST', '/api/admin/photos/' + encodeURIComponent(env.assetId) + '/save-edit', { recipe: { flipH: true } }, env.token);
      assert.equal(r.status, 500);

      var editedDir = path.join(tmpDir, 'edited');
      if (fs.existsSync(editedDir)) {
        var files = fs.readdirSync(editedDir);
        var tmpFiles = files.filter(function (f) { return f.indexOf('.tmp.') >= 0; });
        assert.equal(tmpFiles.length, 0, 'should have no .tmp orphan files');
        var pngFiles = files.filter(function (f) { return f.endsWith('.png'); });
        assert.equal(pngFiles.length, 0, 'output PNG should have been cleaned up');
      }

      var respBody = JSON.parse(r.body.toString());
      assert.ok(!respBody.localPath, 'response should not contain localPath');
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
    }
  });

  it('second edit preserves originalLocalPath', async function () {
    var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-test-'));
    try {
      var srcPath = path.join(tmpDir, 'src.png');
      await makeTestImage(srcPath, 800, 480, function () { return [128, 128, 128]; });
      var env = await createAssetAndServer(tmpDir, { testImagePath: srcPath });

      var r1 = await request(env.port, 'POST', '/api/admin/photos/' + encodeURIComponent(env.assetId) + '/save-edit', {
        recipe: { flipH: true },
      }, env.token);
      assert.equal(r1.status, 200);

      var r2 = await request(env.port, 'POST', '/api/admin/photos/' + encodeURIComponent(env.assetId) + '/save-edit', {
        recipe: { brightness: 0.5 },
      }, env.token);
      assert.equal(r2.status, 200);

      var asset = await env.assetRepo.get(env.assetId);
      assert.ok(asset, 'asset should exist');
      assert.ok(asset.metadata, 'asset should have metadata');
      var origPath = asset.metadata.originalLocalPath;
      assert.ok(origPath, 'originalLocalPath should be set');
      assert.equal(origPath, srcPath, 'originalLocalPath should equal the original test image path');
      assert.notEqual(asset.localPath, srcPath, 'localPath should differ from original after edits');
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
    }
  });

  it('sha256 response matches actual PNG on disk and assetRepository state', async function () {
    var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-test-'));
    try {
      var srcPath = path.join(tmpDir, 'src.png');
      await makeTestImage(srcPath, 800, 480, function (x) { return x < 400 ? [255, 0, 0] : [0, 0, 255]; });
      var env = await createAssetAndServer(tmpDir, { testImagePath: srcPath });

      var r = await request(env.port, 'POST', '/api/admin/photos/' + encodeURIComponent(env.assetId) + '/save-edit', {
        recipe: { flipH: true },
      }, env.token);
      assert.equal(r.status, 200);
      var body = JSON.parse(r.body.toString());
      assert.ok(body.sha256);
      assert.ok(body.width);
      assert.ok(body.height);

      var asset = await env.assetRepo.get(env.assetId);
      assert.ok(asset, 'asset should exist after edit');
      assert.equal(asset.sha256, body.sha256, 'assetRepo sha256 should match response sha256');
      assert.equal(asset.width, 800, 'assetRepo width should be 800');
      assert.equal(asset.height, 480, 'assetRepo height should be 480');
      assert.ok(asset.localPath, 'assetRepo localPath should be set');

      var fileBuf = fs.readFileSync(asset.localPath);
      var fileHash = crypto.createHash('sha256').update(fileBuf).digest('hex');
      assert.equal(fileHash, body.sha256, 'sha256 of file on disk should match response sha256');
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
    }
  });

  it('original source file bytes unchanged after save-edit', async function () {
    var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-test-'));
    try {
      var srcPath = path.join(tmpDir, 'src.png');
      await makeTestImage(srcPath, 800, 480, function (x) { return x < 400 ? [255, 0, 0] : [0, 0, 255]; });

      var origBytes = fs.readFileSync(srcPath);
      var origHash = crypto.createHash('sha256').update(origBytes).digest('hex');

      var env = await createAssetAndServer(tmpDir, { testImagePath: srcPath });

      var r = await request(env.port, 'POST', '/api/admin/photos/' + encodeURIComponent(env.assetId) + '/save-edit', {
        recipe: { flipH: true },
      }, env.token);
      assert.equal(r.status, 200);

      var afterBytes = fs.readFileSync(srcPath);
      var afterHash = crypto.createHash('sha256').update(afterBytes).digest('hex');
      assert.equal(afterHash, origHash, 'original source file should be unchanged after save-edit');
      assert.deepEqual(afterBytes, origBytes, 'original source file bytes should be identical');
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
    }
  });

});
