#!/usr/bin/env node
// learning-ingestion-production-test.js — full chain: source → validate → policy → download → decode → safety → persist
var path = require('path');
var fs = require('fs');
var os = require('os');
var http = require('http');
var crypto = require('crypto');
var ROOT = path.join(__dirname, '..', '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

var IS = require(path.join(ROOT, 'src', 'learning', 'learning-ingestion-service'));
var V = require(path.join(ROOT, 'src', 'learning', 'learning-validator'));
var D = require(path.join(ROOT, 'src', 'learning', 'learning-deduplicator'));
var P = require(path.join(ROOT, 'src', 'learning', 'learning-policy'));
var SR = require(path.join(ROOT, 'src', 'learning', 'learning-source-registry'));
var DL = require(path.join(ROOT, 'src', 'learning', 'learning-downloader'));
var SCHED = require(path.join(ROOT, 'src', 'learning', 'learning-scheduler'));
var NSFW = require(path.join(ROOT, 'src', 'safety', 'nsfw-safety-gate'));

function mkdtemp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
function rmrf(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch(e) {}
}
function startImageServer(pngBuf, pngBuf2) {
  return new Promise(function(resolve) {
    var server = http.createServer(function(req, res) {
      if (req.url.indexOf('/notfound.png') >= 0) {
        res.writeHead(404, {});
        res.end('not found');
      } else if (req.url.indexOf('/badimg.png') >= 0) {
        // 200 + image/png Content-Type,但正文不是真实图像 → sharp decode 失败
        var bad = Buffer.from('not a real png');
        res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': bad.length });
        res.end(bad);
      } else if (req.url.indexOf('/img2.png') >= 0) {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(pngBuf2 || pngBuf);
      } else {
        // /img.png and any other path serve the primary image
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(pngBuf);
      }
    });
    server.listen(0, '127.0.0.1', function() {
      resolve({ server: server, port: server.address().port });
    });
  });
}
function closeServer(s) { return new Promise(function(r) { s.server.close(function() { r(); }); }); }

(async function() {
  // Check sharp availability and generate two distinct PNG images
  var sharpOk = true;
  var pngBuf, pngBuf2, imgW = 100, imgH = 80;
  try {
    var sharp = require('sharp');
    pngBuf = await sharp({
      create: { width: imgW, height: imgH, channels: 3, background: { r: 128, g: 64, b: 200 } },
    }).png().toBuffer();
    // second image: different color + size so sha differs
    pngBuf2 = await sharp({
      create: { width: 120, height: 90, channels: 3, background: { r: 10, g: 200, b: 50 } },
    }).png().toBuffer();
  } catch(e) {
    sharpOk = false;
    imgW = 1; imgH = 1;
    // minimal distinct PNGs (different content) so sha differs
    pngBuf = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    pngBuf2 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwAEAQH/dLiDIgAAAABJRU5ErkJggg==', 'base64');
  }
  t('SHARP_OR_FIXTURE', pngBuf && pngBuf.length > 0, 'png buffer ready');
  t('TWO_DISTINCT_IMAGES', !pngBuf.equals(pngBuf2), 'second image must differ from first');

  var stagingDir = mkdtemp('learn-staging-');
  var assetsDir = mkdtemp('learn-assets-');
  var srv = await startImageServer(pngBuf, pngBuf2);
  var imgUrl = 'http://127.0.0.1:' + srv.port + '/img.png';
  var imgUrl2 = 'http://127.0.0.1:' + srv.port + '/img2.png';

  var expectedSha = crypto.createHash('sha256').update(pngBuf).digest('hex');
  var expectedSha2 = crypto.createHash('sha256').update(pngBuf2).digest('hex');
  var expectedW = sharpOk ? imgW : 0;
  var expectedH = sharpOk ? imgH : 0;

  function buildSvc(repo, opts) {
    opts = opts || {};
    var validator = V.createValidator();
    var dedup = D.createDeduplicator();
    var policy = P.createPolicy();
    var reg = SR.createSourceRegistry();
    // Default safety gate mock: simulates a configured classifier that approves safe content
    // (the real nsfw-safety-gate is fail-closed with no model, which would reject everything)
    var safetyGate = opts.safetyGate || {
      classify: function(filePath, metadata) { return Promise.resolve({ score: 0, category: 'safe', modelVersion: 'test-mock', scores: { safe: 1.0 } }); },
      isSafe: function(classification) { return classification && classification.score !== undefined && classification.score < 0.5; },
      audit: function(entry) { return Promise.resolve(); },
    };
    var downloader = opts.downloader || DL.createLearningDownloader(stagingDir, {}, { allowHttp: true });
    var svc = IS.createIngestionService(reg, validator, dedup, policy, repo, {}, {
      downloader: downloader, safetyGate: safetyGate,
      stagingDir: stagingDir, assetsDir: assetsDir,
      enabled: opts.enabled !== undefined ? opts.enabled : true,
    });
    return { svc: svc, reg: reg, dedup: dedup };
  }

  try {
    // --- Test 1: full chain ACCEPTED ---
    var captured1 = null;
    var repo1 = { create: function(a) { captured1 = a; return Promise.resolve(a.assetId); } };
    var ctx1 = buildSvc(repo1);
    var r1 = await ctx1.svc.ingestOne({
      candidateId: 'wm:1', sourceUrl: imgUrl, source: 'wikimedia',
      title: 'File:test.png', license: 'CC0',
    });
    t('CHAIN_ACCEPTED', r1.status === 'ACCEPTED', JSON.stringify(r1));
    t('CHAIN_HAS_SHA256', r1.sha256 === expectedSha, 'sha=' + r1.sha256);
    t('CHAIN_HAS_ASSET_ID', typeof r1.assetId === 'string' && r1.assetId.indexOf('ast_') === 0, r1.assetId);
    // ACCEPTED 摘要不得泄露内部路径
    t('CHAIN_NO_FINAL_PATH_LEAK', r1.finalPath === undefined, 'finalPath=' + r1.finalPath);
    t('CHAIN_NO_LOCAL_PATH_LEAK', r1.localPath === undefined, 'localPath=' + r1.localPath);
    // 内部资产仍带 localPath(仅持久化层可见)
    t('CHAIN_INTERNAL_LOCAL_PATH_SET', captured1 && typeof captured1.localPath === 'string' && captured1.localPath.indexOf(assetsDir) === 0, captured1 && captured1.localPath);
    t('CHAIN_FINAL_FILE_EXISTS', captured1 && fs.existsSync(captured1.localPath), 'final asset file present');
    t('CHAIN_FINAL_FILE_NOT_TMP_EXT', captured1 && path.extname(captured1.localPath) === '.png', 'ext=' + (captured1 ? path.extname(captured1.localPath) : 'N/A'));
    t('CHAIN_STAGING_EMPTY_AFTER_MOVE', fs.readdirSync(stagingDir).length === 0, 'staging should be empty after move');

    // --- Test 2: duplicate detection (same sourceUrl) ---
    var r2 = await ctx1.svc.ingestOne({
      candidateId: 'wm:1', sourceUrl: imgUrl, source: 'wikimedia',
      title: 'File:test.png', license: 'CC0',
    });
    t('DUPLICATE_DETECTED', r2.status === 'DUPLICATE', JSON.stringify(r2));
    t('DUPLICATE_REASON_CODE', r2.reasonCode === 'DUPLICATE', r2.reasonCode);
    t('DUPLICATE_NO_NEW_FILE', fs.readdirSync(assetsDir).length === 1, 'still only 1 asset');

    // --- Test 3: duplicate by sha256 (different sourceUrl, same content) ---
    // /dup.png serves the same content as /img.png (any non-special path serves pngBuf)
    var dupUrl = 'http://127.0.0.1:' + srv.port + '/dup.png';
    var r3 = await ctx1.svc.ingestOne({
      candidateId: 'wm:99', sourceUrl: dupUrl, source: 'wikimedia',
      title: 'File:dup.png', license: 'CC0',
    });
    t('DUPLICATE_BY_SHA', r3.status === 'DUPLICATE' && r3.reasonCode === 'DUPLICATE_SHA', JSON.stringify(r3));
    t('DUPLICATE_SHA_STAGING_CLEANED', fs.readdirSync(stagingDir).length === 0, 'staging cleaned after sha dup');

    // --- Test 4: repository failure -> cleanup final path ---
    var beforeAssets = fs.readdirSync(assetsDir).length;
    var beforeStaging = fs.readdirSync(stagingDir).length;
    var repoFail = { create: function(a) { return Promise.reject(new Error('disk full')); } };
    var ctx4 = buildSvc(repoFail);
    var r4 = await ctx4.svc.ingestOne({
      candidateId: 'wm:4', sourceUrl: imgUrl, source: 'wikimedia',
      title: 'File:fail.png', license: 'CC0',
    });
    t('REPO_FAIL_REJECTED', r4.status === 'REJECTED', JSON.stringify(r4));
    t('REPO_FAIL_REASON', r4.reason === 'REPOSITORY_WRITE_FAILED', r4.reason);
    t('REPO_FAIL_REASON_CODE', r4.reasonCode === 'REPO_WRITE', r4.reasonCode);
    t('REPO_FAIL_FINAL_CLEANED', fs.readdirSync(assetsDir).length === beforeAssets, 'final file cleaned up after repo failure');
    t('REPO_FAIL_STAGING_CLEAN', fs.readdirSync(stagingDir).length === beforeStaging, 'staging clean after repo failure');

    // --- Test 5: safety gate rejection ---
    var safetyReject = {
      classify: function(filePath, metadata) { return Promise.resolve({ score: 0.9, category: 'nsfw', modelVersion: 'test-mock', scores: { nsfw: 0.9 } }); },
      isSafe: function(classification) { return classification && classification.score !== undefined && classification.score < 0.5; },
    };
    var repo5 = { create: function(a) { return Promise.resolve(a.assetId); } };
    var ctx5 = buildSvc(repo5, { safetyGate: safetyReject });
    var r5 = await ctx5.svc.ingestOne({
      candidateId: 'wm:5', sourceUrl: imgUrl, source: 'wikimedia',
      title: 'File:unsafe.png', license: 'CC0',
    });
    t('SAFETY_REJECTED', r5.status === 'REJECTED' && r5.reasonCode === 'SAFETY', JSON.stringify(r5));
    t('SAFETY_STAGING_CLEANED', fs.readdirSync(stagingDir).length === 0, 'staging cleaned after safety reject');
    t('SAFETY_NO_NEW_ASSET', fs.readdirSync(assetsDir).length === beforeAssets, 'no new asset after safety reject');

    // --- Test 6: download failure (404) ---
    var repo6 = { create: function(a) { return Promise.resolve(a.assetId); } };
    var ctx6 = buildSvc(repo6);
    var r6 = await ctx6.svc.ingestOne({
      candidateId: 'wm:6', sourceUrl: 'http://127.0.0.1:' + srv.port + '/notfound.png',
      source: 'wikimedia', title: 'File:nf.png', license: 'CC0',
    });
    t('DOWNLOAD_FAIL_REJECTED', r6.status === 'REJECTED', JSON.stringify(r6));
    t('DOWNLOAD_FAIL_REASON_CODE', r6.reasonCode === 'DOWNLOAD', r6.reasonCode);
    t('DOWNLOAD_FAIL_STAGING_CLEAN', fs.readdirSync(stagingDir).length === 0, 'staging clean after download fail');

    // --- Test 7: policy rejection (disallowed license) doesn't download ---
    var repo7 = { create: function(a) { return Promise.resolve(a.assetId); } };
    var ctx7 = buildSvc(repo7);
    var r7 = await ctx7.svc.ingestOne({
      candidateId: 'wm:7', sourceUrl: imgUrl, source: 'wikimedia',
      title: 'File:proprietary.png', license: 'PROPRIETARY',
    });
    t('POLICY_REJECTED', r7.status === 'REJECTED' && r7.reasonCode === 'POLICY', JSON.stringify(r7));
    t('POLICY_NO_DOWNLOAD', fs.readdirSync(stagingDir).length === 0, 'no download happened for policy-rejected');

    // --- Test 8: full chain via ingestAll (two distinct images -> both ACCEPTED) ---
    var repo8 = { create: function(a) { return Promise.resolve(a.assetId); } };
    var ctx8 = buildSvc(repo8);
    ctx8.reg.register({
      sourceName: 'mock-wikimedia',
      fetchAll: function() {
        return Promise.resolve([
          { candidateId: 'wm:a', sourceUrl: imgUrl, source: 'wikimedia', title: 'A', license: 'CC0' },
          { candidateId: 'wm:b', sourceUrl: imgUrl2, source: 'wikimedia', title: 'B', license: 'CC0' },
        ]);
      },
    });
    var allResults = await ctx8.svc.ingestAll();
    t('INGEST_ALL_ARRAY', Array.isArray(allResults), '');
    t('INGEST_ALL_LEN', allResults.length === 2, 'got ' + allResults.length);
    t('INGEST_ALL_BOTH_ACCEPTED', allResults.every(function(r) { return r.status === 'ACCEPTED'; }), JSON.stringify(allResults.map(function(r){return r.status;})));
    t('INGEST_ALL_TWO_ASSET_FILES', fs.readdirSync(assetsDir).length === beforeAssets + 2, 'two new assets created');

    // --- Test 9: managed local asset has real decoded metadata ---
    var repo9 = { create: function(a) {
        t('MANAGED_ASSET_SHA256', a.sha256 === expectedSha, 'asset persisted with real sha256');
        t('MANAGED_ASSET_MIME', a.mimeType === 'image/png', 'mime=' + a.mimeType);
        t('MANAGED_ASSET_WIDTH', a.width === expectedW, 'width=' + a.width + ' expected ' + expectedW);
        t('MANAGED_ASSET_HEIGHT', a.height === expectedH, 'height=' + a.height + ' expected ' + expectedH);
        t('MANAGED_ASSET_SAFETY', a.safetyStatus === 'SAFE', '');
        t('MANAGED_ASSET_LIFECYCLE', a.lifecycleStatus === 'SELECTABLE', '');
        t('MANAGED_ASSET_LOCAL_PATH_EXISTS', fs.existsSync(a.localPath), 'localPath exists');
        return Promise.resolve(a.assetId);
      } };
    var ctx9 = buildSvc(repo9);
    var r9 = await ctx9.svc.ingestOne({
      candidateId: 'wm:meta', sourceUrl: imgUrl, source: 'wikimedia',
      title: 'File:meta.png', license: 'CC0',
    });
    t('MANAGED_ASSET_ACCEPTED', r9.status === 'ACCEPTED', JSON.stringify(r9));

    // --- Test 10: decode fail-closed (download OK 但正文非图像 → sharp 失败 → REJECTED) ---
    var beforeDecode = fs.readdirSync(assetsDir).length;
    var repoDec = { create: function(a) { return Promise.resolve(a.assetId); } };
    var ctxDec = buildSvc(repoDec);
    var rDec = await ctxDec.svc.ingestOne({
      candidateId: 'wm:dec', sourceUrl: 'http://127.0.0.1:' + srv.port + '/badimg.png',
      source: 'wikimedia', title: 'File:bad.png', license: 'CC0',
    });
    t('DECODE_FAIL_CLOSED', rDec.status === 'REJECTED' && rDec.reasonCode === 'DECODE', JSON.stringify(rDec));
    t('DECODE_FAIL_STAGING_CLEAN', fs.readdirSync(stagingDir).length === 0, 'staging cleaned after decode fail');
    t('DECODE_FAIL_NO_NEW_ASSET', fs.readdirSync(assetsDir).length === beforeDecode, 'no asset after decode fail');

    // --- Test 11: flag=false → ingestAll 立即 DISABLED,零网络请求(fetchAll 不被调用) ---
    var fetchCount = 0;
    var regDisabled = SR.createSourceRegistry();
    regDisabled.register({
      sourceName: 'mock-disabled',
      fetchAll: function() { fetchCount++; return Promise.resolve([]); },
    });
    var validatorD = V.createValidator();
    var dedupD = D.createDeduplicator();
    var policyD = P.createPolicy();
    var repoD = { create: function(a) { return Promise.resolve(a.assetId); } };
    var svcDisabled = IS.createIngestionService(regDisabled, validatorD, dedupD, policyD, repoD, {}, {
      downloader: DL.createLearningDownloader(stagingDir, {}, { allowHttp: true }),
      safetyGate: {
        classify: function() { return Promise.resolve({ score: 0, category: 'safe' }); },
        isSafe: function() { return true; },
      },
      stagingDir: stagingDir, assetsDir: assetsDir, enabled: false,
    });
    var rDisabled = await svcDisabled.ingestAll();
    t('DISABLED_INGEST_ALL_STATUS', rDisabled && rDisabled.status === 'DISABLED', JSON.stringify(rDisabled));
    t('DISABLED_INGEST_ALL_CANDIDATES', Array.isArray(rDisabled.candidates) && rDisabled.candidates.length === 0, '');
    t('DISABLED_NO_NETWORK', fetchCount === 0, 'fetchAll called ' + fetchCount + ' times (expected 0)');

    // --- Test 12: classifier 未 ready → scheduler 不启动 ---
    var schedCalls = 0;
    var svcSched = { ingestAll: function() { schedCalls++; return Promise.resolve([]); } };
    var logsSched = [];
    var loggerSched = { info: function(m) { logsSched.push(m); }, warn: function(m) { logsSched.push(m); }, error: function() {} };
    var sNotReady = SCHED.createLearningScheduler(svcSched, { enabled: true, intervalMs: 100000 }, loggerSched, {
      classifierReady: function() { return false; },
    });
    sNotReady.start();
    t('CLASSIFIER_NOT_READY_NO_TICK', schedCalls === 0, 'ingestAll should not be called');
    t('CLASSIFIER_NOT_READY_STATUS', sNotReady.getStatus().status === 'SAFETY_CLASSIFIER_NOT_READY', sNotReady.getStatus().status);
    t('CLASSIFIER_NOT_READY_READY_FALSE', sNotReady.getStatus().ready === false, '');
    t('CLASSIFIER_NOT_READY_CLASSIFIER_FIELD', sNotReady.getStatus().classifierReady === false, '');
    t('CLASSIFIER_NOT_READY_LOGGED', logsSched.some(function(m) { return m.indexOf('classifier not ready') >= 0; }), 'logged not ready');
    sNotReady.stop();

    // --- Test 13: classifier ready → scheduler 启动并可 tick ---
    var schedCalls2 = 0;
    var svcSched2 = { ingestAll: function() { schedCalls2++; return Promise.resolve([{ ok: 1 }]); } };
    var sReady = SCHED.createLearningScheduler(svcSched2, { enabled: true, intervalMs: 100000 }, {}, {
      classifierReady: function() { return true; },
    });
    t('CLASSIFIER_READY_BEFORE', sReady.getStatus().ready === true && sReady.getStatus().status === 'IDLE', sReady.getStatus().status);
    sReady.start();
    t('CLASSIFIER_READY_STARTED', sReady.getStatus().enabled === true, '');
    await sReady.tick();
    t('CLASSIFIER_READY_TICK_RAN', schedCalls2 === 1, 'ingestAll called once');
    t('CLASSIFIER_READY_LAST_RUN_AT', sReady.getStatus().lastRunAt !== null, '');
    sReady.stop();

    // --- Test 14: disabled scheduler (enabled=false) status ---
    var sOff = SCHED.createLearningScheduler(svcSched, { enabled: false, intervalMs: 100000 }, {}, {
      classifierReady: function() { return true; },
    });
    sOff.start();
    t('SCHED_DISABLED_STATUS', sOff.getStatus().status === 'DISABLED', sOff.getStatus().status);
    t('SCHED_DISABLED_NO_TICK', schedCalls === 0, 'no tick when disabled');
    sOff.stop();
  } finally {
    await closeServer(srv);
    rmrf(stagingDir);
    rmrf(assetsDir);
  }

  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
})();
