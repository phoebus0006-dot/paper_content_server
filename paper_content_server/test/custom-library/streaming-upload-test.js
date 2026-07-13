#!/usr/bin/env node
// streaming-upload-test.js — 流式上传(processUploadStream)安全测试
// 覆盖:
//   1. 正常图片上传(Readable + 真实小图片)→ ACCEPTED
//   2. Content-Length 预检:expectedSize > maxBytes → REJECTED TOO_LARGE(不创建文件)
//   3. chunked 超限:流式写入超过 maxBytes → REJECTED TOO_LARGE + cleanup
//   4. 无效输入(非 Readable)→ REJECTED INVALID_INPUT
//   5. 无效 JPEG(stream 写入 garbage)→ REJECTED DECODE_FAILED + cleanup
//   6. MIME 伪装(metadata.mimeType='image/jpeg' 但实际 PNG)→ REJECTED MIME_MISMATCH
//   7. aborted upload(inputStream error)→ cleanup
//   8. classifier unavailable(默认 gate 无模型)→ REJECTED CLASSIFIER_UNAVAILABLE
//   9. classifier unsafe(score=0.95)→ REJECTED NSFW
//  10. audit failure → ERROR AUDIT_FAILED + cleanup finalPath
//  11. repository failure → ERROR REPOSITORY_FAILED + cleanup finalPath
//  12. 响应不包含 finalPath / localPath
var path = require('path');
var fs = require('fs');
var os = require('os');
var { Readable } = require('stream');
var ROOT = path.join(__dirname, '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

var CLS = require(path.join(ROOT, 'src', 'custom-library', 'custom-library-service')).createCustomLibraryService;
var CFS = require(path.join(ROOT, 'src', 'custom-library', 'custom-file-store')).createFileStore;
var CV = require(path.join(ROOT, 'src', 'custom-library', 'custom-validator')).createValidator;
var CD = require(path.join(ROOT, 'src', 'custom-library', 'custom-deduplicator')).createDeduplicator;
var NG = require(path.join(ROOT, 'src', 'safety', 'nsfw-safety-gate')).createNsfwSafetyGate;

// 临时目录
var tmp = path.join(os.tmpdir(), 'stream_up_' + Date.now() + '_' + process.pid);
var qDir = path.join(tmp, 'quarantine');
var aDir = path.join(tmp, 'assets');
fs.mkdirSync(qDir, { recursive: true });
fs.mkdirSync(aDir, { recursive: true });
var lg = { info: function () {}, warn: function () {}, error: function () {} };

// 用 sharp 生成真实小图片 buffer
async function makePng(w, h) {
  var sharp = require('sharp');
  return await sharp({ create: { width: w || 8, height: h || 8, channels: 3, background: { r: 1, g: 2, b: 3 } } }).png().toBuffer();
}
async function makeJpg(w, h) {
  var sharp = require('sharp');
  return await sharp({ create: { width: w || 8, height: h || 8, channels: 3, background: { r: 4, g: 5, b: 6 } } }).jpeg().toBuffer();
}

// 将 Buffer 包成 Readable(单 chunk)
function streamFromBuffer(buf) {
  return Readable.from([buf]);
}

// 将多个 Buffer 包成 Readable(多 chunk,用于测试流式超限)
function streamFromChunks(chunks) {
  return Readable.from(chunks);
}

// 推送数据后在中途 emit error 的 stream(模拟 aborted upload)
function makeErrorStream(buf, errMsg) {
  var s = new Readable({ read: function () {} });
  s.push(buf);
  process.nextTick(function () { s.destroy(new Error(errMsg)); });
  return s;
}

// 默认依赖:gate 无 modelPath → fail-closed
function defaultDeps() {
  var store = CFS(qDir, aDir, lg);
  var val = CV();
  var dedup = CD(null);
  var gate = NG({ logger: lg });
  return { store: store, val: val, dedup: dedup, gate: gate };
}

// 每个用例前清空 quarantine/assets,保证隔离(便于断言 leftover)
function resetDirs() {
  fs.readdirSync(qDir).forEach(function (f) { try { fs.unlinkSync(path.join(qDir, f)); } catch (e) {} });
  fs.readdirSync(aDir).forEach(function (f) { try { fs.unlinkSync(path.join(aDir, f)); } catch (e) {} });
}

// 可控的 assetRepository
function makeRepo(opts) {
  opts = opts || {};
  var fail = opts.fail;
  var assets = {};
  return {
    create: function (asset) {
      if (fail) return Promise.reject(new Error('REPO_FORCE_FAIL'));
      assets[asset.assetId] = asset;
      return Promise.resolve(asset.assetId);
    },
    list: function () { return Promise.resolve([]); },
    _assets: assets,
  };
}

// mock safe gate(allow)
function safeGate() {
  return {
    classify: function () { return Promise.resolve({ score: 0.1, category: 'SAFE', modelVersion: 'T1', scores: { safe: 0.9 } }); },
    isSafe: function (c) { return c && c.score < 0.5; },
    audit: function () { return Promise.resolve(); },
  };
}

async function run() {
  // ── 1. 正常图片上传(真实 PNG buffer + Readable stream)→ ACCEPTED ──
  {
    resetDirs();
    var d = defaultDeps();
    var png = await makePng();
    var gate = safeGate();
    var repo = makeRepo();
    var svc = CLS(d.store, d.val, d.dedup, gate, repo, lg);
    var r = await svc.processUploadStream(streamFromBuffer(png), { originalName: 'a.png', mimeType: 'image/png', expectedSize: png.length });
    t('NORMAL_PNG_ACCEPTED', r.status === 'ACCEPTED', r.status + ' ' + JSON.stringify(r));
    t('NORMAL_PNG_HAS_ASSET_ID', !!r.assetId, '');
    t('NORMAL_PNG_NO_FINAL_PATH', r.finalPath === undefined, 'leaked finalPath=' + r.finalPath);
    t('NORMAL_PNG_NO_LOCAL_PATH', r.localPath === undefined, '');
    t('NORMAL_PNG_REPO_HAS_ASSET', !!repo._assets[r.assetId], '');
    var asset = repo._assets[r.assetId];
    t('NORMAL_PNG_REPO_WIDTH', asset && asset.width === 8, 'width=' + (asset && asset.width));
    t('NORMAL_PNG_REPO_MIME', asset && asset.mimeType === 'image/png', '');
    t('NORMAL_PNG_REPO_SHA256', asset && asset.sha256 && asset.sha256.length === 64, '');
    // quarantine 应为空(文件已 move 到 assets)
    t('NORMAL_PNG_QUARANTINE_EMPTY', fs.readdirSync(qDir).length === 0, 'leftover=' + fs.readdirSync(qDir).length);
    // assets 应有 1 个文件
    t('NORMAL_PNG_ASSETS_HAS_ONE', fs.readdirSync(aDir).length === 1, 'assets=' + fs.readdirSync(aDir).length);
  }

  // ── 2. Content-Length 预检:expectedSize > maxBytes → REJECTED TOO_LARGE(不创建文件)──
  {
    resetDirs();
    var d = defaultDeps();
    var png = await makePng();
    var svc = CLS(d.store, d.val, d.dedup, safeGate(), makeRepo(), lg);
    // maxBytes=100,但 expectedSize=9999 → 预检拒绝,不创建任何文件
    var r = await svc.processUploadStream(streamFromBuffer(png), { originalName: 'a.png', mimeType: 'image/png', expectedSize: 9999 }, { maxBytes: 100 });
    t('PRECHECK_TOO_LARGE_REJECTED', r.status === 'REJECTED' && r.reason === 'TOO_LARGE', r.status + ':' + r.reason);
    t('PRECHECK_NO_FILE_CREATED', fs.readdirSync(qDir).length === 0, 'quarantine should be empty');
    t('PRECHECK_NO_ASSET_FILE', fs.readdirSync(aDir).length === 0, 'assets should be empty');
  }

  // ── 3. chunked 超限:流式写入超过 maxBytes → REJECTED TOO_LARGE + cleanup ──
  {
    resetDirs();
    var d = defaultDeps();
    var svc = CLS(d.store, d.val, d.dedup, safeGate(), makeRepo(), lg);
    // expectedSize 小(通过预检),但实际推送超过 maxBytes 的数据
    // 分成多个 chunk,每个 30 字节,maxBytes=100,总共推 150 字节
    var chunk = Buffer.alloc(30, 0xAB);
    var chunks = [chunk, chunk, chunk, chunk, chunk]; // 150 bytes total
    var r = await svc.processUploadStream(streamFromChunks(chunks), { originalName: 'big.bin', expectedSize: 50 }, { maxBytes: 100 });
    t('CHUNKED_TOO_LARGE_REJECTED', r.status === 'REJECTED' && r.reason === 'TOO_LARGE', r.status + ':' + r.reason);
    t('CHUNKED_TOO_LARGE_HAS_BYTES', r.bytesWritten > 100, 'bytesWritten=' + r.bytesWritten);
    t('CHUNKED_TOO_LARGE_HAS_LIMIT', r.limit === 100, 'limit=' + r.limit);
    // cleanup 应删除 partial quarantine 文件
    t('CHUNKED_TOO_LARGE_CLEANED', fs.readdirSync(qDir).length === 0, 'leftover=' + fs.readdirSync(qDir).length);
    t('CHUNKED_TOO_LARGE_NO_ASSET', fs.readdirSync(aDir).length === 0, '');
  }

  // ── 4. 无效输入(非 Readable stream)→ REJECTED INVALID_INPUT ──
  {
    resetDirs();
    var d = defaultDeps();
    var svc = CLS(d.store, d.val, d.dedup, safeGate(), makeRepo(), lg);
    // Buffer 没有 .pipe 方法
    var r1 = await svc.processUploadStream(Buffer.from('not a stream'), { originalName: 'a.png', mimeType: 'image/png' });
    t('NON_STREAM_REJECTED', r1.status === 'REJECTED' && r1.reason === 'INVALID_INPUT', r1.status + ':' + r1.reason);
    // null
    var r2 = await svc.processUploadStream(null, { originalName: 'a.png' });
    t('NULL_STREAM_REJECTED', r2.status === 'REJECTED' && r2.reason === 'INVALID_INPUT', r2.status + ':' + r2.reason);
    // 不创建文件
    t('NON_STREAM_NO_FILE', fs.readdirSync(qDir).length === 0, '');
  }

  // ── 5. 无效 JPEG(stream 写入 garbage)→ REJECTED DECODE_FAILED + cleanup ──
  {
    resetDirs();
    var d = defaultDeps();
    var garbage = Buffer.from('this is definitely not a valid image file content at all');
    var svc = CLS(d.store, d.val, d.dedup, safeGate(), makeRepo(), lg);
    var r = await svc.processUploadStream(streamFromBuffer(garbage), { originalName: 'fake.jpg', mimeType: 'image/jpeg', expectedSize: garbage.length });
    t('GARBAGE_DECODE_FAILED', r.status === 'REJECTED' && r.reason === 'DECODE_FAILED', r.status + ':' + r.reason);
    t('GARBAGE_QUARANTINE_CLEANED', fs.readdirSync(qDir).length === 0, 'leftover=' + fs.readdirSync(qDir).length);
    t('GARBAGE_NO_ASSET', fs.readdirSync(aDir).length === 0, '');
  }

  // ── 6. MIME 伪装(metadata.mimeType='image/jpeg' 但实际 PNG)→ REJECTED MIME_MISMATCH ──
  {
    resetDirs();
    var d = defaultDeps();
    var png = await makePng();
    var svc = CLS(d.store, d.val, d.dedup, safeGate(), makeRepo(), lg);
    var r = await svc.processUploadStream(streamFromBuffer(png), { originalName: 'disguised.jpg', mimeType: 'image/jpeg', expectedSize: png.length });
    t('MIME_SPOOF_REJECTED', r.status === 'REJECTED' && r.reason === 'MIME_MISMATCH', r.status + ':' + r.reason);
    t('MIME_SPOOF_EXPECTED', r.expected === 'image/jpeg', '');
    t('MIME_SPOOF_ACTUAL', r.actual === 'image/png', '');
    t('MIME_SPOOF_QUARANTINE_CLEANED', fs.readdirSync(qDir).length === 0, '');
  }

  // ── 7. aborted upload(inputStream error)→ cleanup ──
  {
    resetDirs();
    var d = defaultDeps();
    var png = await makePng();
    var svc = CLS(d.store, d.val, d.dedup, safeGate(), makeRepo(), lg);
    // stream 推送部分数据后 emit error
    var r = await svc.processUploadStream(makeErrorStream(png, 'CLIENT_DISCONNECTED'), { originalName: 'a.png', mimeType: 'image/png' });
    t('ABORTED_IS_ERROR', r.status === 'ERROR', r.status + ':' + JSON.stringify(r));
    t('ABORTED_HAS_READ_FAILED', /STREAM_READ_FAILED/.test(r.error || ''), 'error=' + r.error);
    // quarantine 应被 cleanup
    t('ABORTED_QUARANTINE_CLEANED', fs.readdirSync(qDir).length === 0, 'leftover=' + fs.readdirSync(qDir).length);
    t('ABORTED_NO_ASSET', fs.readdirSync(aDir).length === 0, '');
  }

  // ── 8. classifier unavailable(默认 gate 无模型)→ REJECTED CLASSIFIER_UNAVAILABLE ──
  {
    resetDirs();
    var d = defaultDeps(); // gate 无 modelPath → fail-closed
    var png = await makePng();
    var svc = CLS(d.store, d.val, d.dedup, d.gate, makeRepo(), lg);
    var r = await svc.processUploadStream(streamFromBuffer(png), { originalName: 'a.png', mimeType: 'image/png', expectedSize: png.length });
    t('CLASSIFIER_UNAVAILABLE_REJECTED', r.status === 'REJECTED' && r.reason === 'CLASSIFIER_UNAVAILABLE', r.status + ':' + r.reason);
    t('CLASSIFIER_UNAVAILABLE_FAIL_CLOSED', r.reasonCode === 'FAIL_CLOSED', 'reasonCode=' + r.reasonCode);
    t('CLASSIFIER_UNAVAILABLE_CLEANED', fs.readdirSync(qDir).length === 0, '');
  }

  // ── 9. classifier unsafe(score=0.95)→ REJECTED NSFW ──
  {
    resetDirs();
    var d = defaultDeps();
    var png = await makePng();
    var gate = {
      classify: function () { return Promise.resolve({ score: 0.95, category: 'NSFW', modelVersion: 'T', scores: { nsfw: 0.95 } }); },
      isSafe: function (c) { return c && c.score < 0.5; },
      audit: function () { return Promise.resolve(); },
    };
    var svc = CLS(d.store, d.val, d.dedup, gate, makeRepo(), lg);
    var r = await svc.processUploadStream(streamFromBuffer(png), { originalName: 'a.png', mimeType: 'image/png', expectedSize: png.length });
    t('UNSAFE_REJECTED', r.status === 'REJECTED' && r.reason === 'NSFW', r.status + ':' + r.reason);
    t('UNSAFE_HAS_CLASSIFICATION', r.classification && r.classification.score === 0.95, '');
    t('UNSAFE_QUARANTINE_CLEANED', fs.readdirSync(qDir).length === 0, '');
  }

  // ── 10. audit failure → ERROR AUDIT_FAILED + cleanup finalPath ──
  {
    resetDirs();
    var d = defaultDeps();
    var png = await makePng();
    var gate = {
      classify: function () { return Promise.resolve({ score: 0.1, category: 'SAFE', modelVersion: 'T', scores: {} }); },
      isSafe: function () { return true; },
      audit: function () { return Promise.reject(new Error('AUDIT_DOWN')); },
    };
    var repo = makeRepo();
    var svc = CLS(d.store, d.val, d.dedup, gate, repo, lg);
    var r = await svc.processUploadStream(streamFromBuffer(png), { originalName: 'a.png', mimeType: 'image/png', expectedSize: png.length });
    t('AUDIT_FAIL_ERROR', r.status === 'ERROR' && r.error === 'AUDIT_FAILED', r.status + ':' + r.error + ' ' + JSON.stringify(r));
    // finalPath 应被清理(assets 目录为空)
    t('AUDIT_FAIL_FINAL_CLEANED', fs.readdirSync(aDir).length === 0, 'leftover=' + fs.readdirSync(aDir).length);
    t('AUDIT_FAIL_QUARANTINE_CLEANED', fs.readdirSync(qDir).length === 0, '');
    // 不应创建资产
    t('AUDIT_FAIL_NO_ASSET', Object.keys(repo._assets).length === 0, '');
  }

  // ── 11. repository failure → ERROR REPOSITORY_FAILED + cleanup finalPath ──
  {
    resetDirs();
    var d = defaultDeps();
    var png = await makePng();
    var gate = safeGate();
    var repo = makeRepo({ fail: true });
    var svc = CLS(d.store, d.val, d.dedup, gate, repo, lg);
    var r = await svc.processUploadStream(streamFromBuffer(png), { originalName: 'a.png', mimeType: 'image/png', expectedSize: png.length });
    t('REPO_FAIL_ERROR', r.status === 'ERROR' && r.error === 'REPOSITORY_FAILED', r.status + ':' + r.error + ' ' + JSON.stringify(r));
    // finalPath 应被清理
    t('REPO_FAIL_FINAL_CLEANED', fs.readdirSync(aDir).length === 0, 'leftover=' + fs.readdirSync(aDir).length);
    t('REPO_FAIL_QUARANTINE_CLEANED', fs.readdirSync(qDir).length === 0, '');
  }

  // ── 12. 响应不包含 finalPath / localPath(已在 1 覆盖,这里独立断言)──
  {
    resetDirs();
    var d = defaultDeps();
    var png = await makePng();
    var jpg = await makeJpg();
    var svc = CLS(d.store, d.val, d.dedup, safeGate(), makeRepo(), lg);
    // PNG
    var rPng = await svc.processUploadStream(streamFromBuffer(png), { originalName: 'a.png', mimeType: 'image/png', expectedSize: png.length });
    var keysPng = Object.keys(rPng);
    t('PNG_NO_FINAL_PATH_KEY', keysPng.indexOf('finalPath') < 0, 'keys=' + keysPng.join(','));
    t('PNG_NO_LOCAL_PATH_KEY', keysPng.indexOf('localPath') < 0, '');
    t('PNG_NO_QUARANTINE_PATH_KEY', keysPng.indexOf('quarantinePath') < 0, '');
    // JPEG
    resetDirs();
    var rJpg = await svc.processUploadStream(streamFromBuffer(jpg), { originalName: 'a.jpg', mimeType: 'image/jpeg', expectedSize: jpg.length });
    var keysJpg = Object.keys(rJpg);
    t('JPG_NO_FINAL_PATH_KEY', keysJpg.indexOf('finalPath') < 0, 'keys=' + keysJpg.join(','));
    t('JPG_NO_LOCAL_PATH_KEY', keysJpg.indexOf('localPath') < 0, '');
    // 即使是错误响应,也不应泄露内部路径
    resetDirs();
    var rErr = await svc.processUploadStream(streamFromBuffer(Buffer.from('garbage')), { originalName: 'a.jpg', mimeType: 'image/jpeg', expectedSize: 7 });
    var keysErr = Object.keys(rErr);
    t('ERR_NO_FINAL_PATH_KEY', keysErr.indexOf('finalPath') < 0 && keysErr.indexOf('localPath') < 0, 'keys=' + keysErr.join(','));
  }

  // ── 13. dedup(额外覆盖:DUPLICATE 状态)──
  {
    resetDirs();
    var d = defaultDeps();
    var png = await makePng();
    var dedup = { isDuplicate: function () { return Promise.resolve(true); } };
    var svc = CLS(d.store, d.val, dedup, safeGate(), makeRepo(), lg);
    var r = await svc.processUploadStream(streamFromBuffer(png), { originalName: 'a.png', mimeType: 'image/png', expectedSize: png.length });
    t('DUPLICATE_STATUS', r.status === 'DUPLICATE', r.status);
    t('DUPLICATE_HAS_SHA', r.sha256 && r.sha256.length === 64, '');
    t('DUPLICATE_QUARANTINE_CLEANED', fs.readdirSync(qDir).length === 0, '');
    t('DUPLICATE_NO_ASSET', fs.readdirSync(aDir).length === 0, '');
  }

  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  // 清理临时目录
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  process.exit(ec);
}
run().catch(function (e) { console.log('CRASH: ' + (e && e.stack || e)); try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (x) {} process.exit(1); });
