#!/usr/bin/env node
// classifier-chain-test.js — Custom Library 全链测试(C5)
//
// 覆盖真实 classifier readiness 与上传流水线的交互:
//   1. 真实安全图片 + classifier 未就绪(无 runtime)→ FEATURE_NOT_READY
//   2. 真实安全图片 + classifier 就绪(mock)→ ACCEPTED (SAFE)
//   3. 无效 JPEG → REJECTED DECODE_FAILED
//   4. 扩展名伪装(PNG 伪装为 JPEG)→ REJECTED MIME_MISMATCH
//   5. 模型不存在(无 modelPath)→ FEATURE_NOT_READY
//   6. 模型文件存在但 runtime 不存在 → FEATURE_NOT_READY (NO_RUNTIME_AVAILABLE)
//   7. audit failure → 不创建资产(rollback finalPath)
//   8. 响应不包含绝对路径(finalPath / quarantinePath / localPath)
//   9. 流式上传:classifier 未就绪 → FEATURE_NOT_READY
//  10. 流式上传:classifier 就绪(mock)→ ACCEPTED (SAFE)
//
// 当前环境无 onnxruntime / tfjs-node,classifier 永远 ready=false。
// 真实 classifier 就绪的路径用 mock gate 覆盖(返回结构化 { decision, scores, ... })。
var path = require('path');
var fs = require('fs');
var os = require('os');
var ROOT = path.join(__dirname, '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

var CLS = require(path.join(ROOT, 'src', 'custom-library', 'custom-library-service')).createCustomLibraryService;
var CFS = require(path.join(ROOT, 'src', 'custom-library', 'custom-file-store')).createFileStore;
var CV = require(path.join(ROOT, 'src', 'custom-library', 'custom-validator')).createValidator;
var CD = require(path.join(ROOT, 'src', 'custom-library', 'custom-deduplicator')).createDeduplicator;
var NG = require(path.join(ROOT, 'src', 'safety', 'nsfw-safety-gate')).createNsfwSafetyGate;
var SCP = require(path.join(ROOT, 'src', 'safety', 'safety-classifier-port')).createSafetyClassifierPort;
var { Readable } = require('stream');

// 临时目录
var tmp = path.join(os.tmpdir(), 'cls_chain_' + Date.now() + '_' + process.pid);
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

function resetDirs() {
  fs.readdirSync(qDir).forEach(function (f) { try { fs.unlinkSync(path.join(qDir, f)); } catch (e) {} });
  fs.readdirSync(aDir).forEach(function (f) { try { fs.unlinkSync(path.join(aDir, f)); } catch (e) {} });
}

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

// mock gate:模拟 classifier 就绪,返回结构化结果
function makeReadyGate(decision) {
  return {
    classify: function () {
      return Promise.resolve({
        modelType: 'mock',
        modelVersion: 'mock_v1',
        modelSha256: 'abc123',
        scores: { safe: decision === 'SAFE' ? 0.95 : 0.05, adult: 0.02, racy: 0.02, violence: 0.01 },
        decision: decision,
        threshold: 0.5,
        inferenceMs: 1,
      });
    },
    isSafe: function (c) { return c && c.decision === 'SAFE'; },
    audit: function () { return Promise.resolve(); },
    configured: true,
    modelVersion: 'mock_v1',
  };
}

// 真实 gate(无 modelPath)→ classifier 未就绪
function realGateNoModel() {
  return NG({ logger: lg });
}

// 真实 gate(modelPath 指向真实文件,但无 runtime)→ classifier 未就绪
function realGateWithFile() {
  var tmpModel = path.join(os.tmpdir(), 'chain-fake-model-' + Date.now() + '-' + process.pid + '.onnx');
  fs.writeFileSync(tmpModel, 'FAKE_MODEL_BYTES');
  return { gate: NG({ logger: lg, modelPath: tmpModel }), cleanup: function () { try { fs.unlinkSync(tmpModel); } catch (e) {} } };
}

async function run() {
  // ── 1. 真实安全图片 + classifier 未就绪(无 modelPath)→ FEATURE_NOT_READY ──
  {
    resetDirs();
    var store = CFS(qDir, aDir, lg);
    var val = CV();
    var dedup = CD(null);
    var gate = realGateNoModel();
    var repo = makeRepo();
    var svc = CLS(store, val, dedup, gate, repo, lg);
    var png = await makePng();
    var r = await svc.processUpload({ fileBuffer: png, originalName: 'safe.png', mimeType: 'image/png' });
    t('SAFE_IMAGE_NOT_READY_FEATURE_NOT_READY', r.status === 'FEATURE_NOT_READY',
      r.status + ':' + r.reason + ':' + r.reasonCode);
    t('SAFE_IMAGE_NOT_READY_REASON', r.reason === 'CLASSIFIER_UNAVAILABLE', '');
    t('SAFE_IMAGE_NOT_READY_REASON_CODE', r.reasonCode === 'CLASSIFIER_NOT_READY', 'reasonCode=' + r.reasonCode);
    t('SAFE_IMAGE_NOT_READY_NO_ASSET', Object.keys(repo._assets).length === 0, '');
    t('SAFE_IMAGE_NOT_READY_QUARANTINE_CLEANED', fs.readdirSync(qDir).length === 0, '');
  }

  // ── 2. 真实安全图片 + classifier 就绪(mock)→ ACCEPTED (SAFE) ──
  {
    resetDirs();
    var store = CFS(qDir, aDir, lg);
    var val = CV();
    var dedup = CD(null);
    var gate = makeReadyGate('SAFE');
    var repo = makeRepo();
    var svc = CLS(store, val, dedup, gate, repo, lg);
    var png = await makePng();
    var r = await svc.processUpload({ fileBuffer: png, originalName: 'safe.png', mimeType: 'image/png' });
    t('SAFE_IMAGE_READY_ACCEPTED', r.status === 'ACCEPTED', r.status + ' ' + JSON.stringify(r));
    t('SAFE_IMAGE_READY_HAS_ASSET_ID', !!r.assetId, '');
    t('SAFE_IMAGE_READY_REPO_HAS_ASSET', !!repo._assets[r.assetId], '');
    t('SAFE_IMAGE_READY_NO_FINAL_PATH', r.finalPath === undefined, '');
  }

  // ── 3. 无效 JPEG (fileBuffer = garbage) → REJECTED DECODE_FAILED ──
  {
    resetDirs();
    var store = CFS(qDir, aDir, lg);
    var val = CV();
    var dedup = CD(null);
    var gate = makeReadyGate('SAFE');
    var svc = CLS(store, val, dedup, gate, makeRepo(), lg);
    var r = await svc.processUpload({ fileBuffer: Buffer.from('not an image at all'), originalName: 'x.jpg', mimeType: 'image/jpeg' });
    t('INVALID_JPEG_REJECTED', r.status === 'REJECTED' && r.reason === 'DECODE_FAILED', r.status + ':' + r.reason);
    t('INVALID_JPEG_QUARANTINE_CLEANED', fs.readdirSync(qDir).length === 0, '');
  }

  // ── 4. 扩展名伪装(originalName='img.jpg' 但 fileBuffer 是 PNG)→ REJECTED MIME_MISMATCH ──
  {
    resetDirs();
    var store = CFS(qDir, aDir, lg);
    var val = CV();
    var dedup = CD(null);
    var gate = makeReadyGate('SAFE');
    var svc = CLS(store, val, dedup, gate, makeRepo(), lg);
    var png = await makePng();
    var r = await svc.processUpload({ fileBuffer: png, originalName: 'img.jpg', mimeType: 'image/jpeg' });
    t('SPOOFED_EXT_REJECTED', r.status === 'REJECTED' && r.reason === 'MIME_MISMATCH', r.status + ':' + r.reason);
    t('SPOOFED_EXT_EXPECTED', r.expected === 'image/jpeg', '');
    t('SPOOFED_EXT_ACTUAL', r.actual === 'image/png', '');
    t('SPOOFED_EXT_QUARANTINE_CLEANED', fs.readdirSync(qDir).length === 0, '');
  }

  // ── 5. 模型不存在(无 modelPath)→ FEATURE_NOT_READY ──
  {
    resetDirs();
    var store = CFS(qDir, aDir, lg);
    var val = CV();
    var dedup = CD(null);
    var gate = realGateNoModel();
    var port = gate.classifierPort;
    t('MODEL_NOT_EXIST_CONFIGURED_FALSE', port.configured === false, 'configured=' + port.configured);
    t('MODEL_NOT_EXIST_MODEL_EXISTS_FALSE', port.modelExists === false, 'modelExists=' + port.modelExists);
    t('MODEL_NOT_EXIST_READY_FALSE', port.ready === false, 'ready=' + port.ready);
    var png = await makePng();
    var svc = CLS(store, val, dedup, gate, makeRepo(), lg);
    var r = await svc.processUpload({ fileBuffer: png, originalName: 'a.png', mimeType: 'image/png' });
    t('MODEL_NOT_EXIST_FEATURE_NOT_READY', r.status === 'FEATURE_NOT_READY', r.status + ':' + r.reasonCode);
    t('MODEL_NOT_EXIST_QUARANTINE_CLEANED', fs.readdirSync(qDir).length === 0, '');
  }

  // ── 6. 模型文件存在但 runtime 不存在 → FEATURE_NOT_READY (NO_RUNTIME_AVAILABLE) ──
  {
    resetDirs();
    var store = CFS(qDir, aDir, lg);
    var val = CV();
    var dedup = CD(null);
    var gateAndCleanup = realGateWithFile();
    var gate = gateAndCleanup.gate;
    var port = gate.classifierPort;
    try {
      t('RUNTIME_NOT_EXIST_CONFIGURED_TRUE', port.configured === true, 'configured=' + port.configured);
      t('RUNTIME_NOT_EXIST_MODEL_EXISTS_TRUE', port.modelExists === true, 'modelExists=' + port.modelExists);
      t('RUNTIME_NOT_EXIST_RUNTIME_AVAILABLE_FALSE', port.runtimeAvailable === false, 'runtimeAvailable=' + port.runtimeAvailable);
      t('RUNTIME_NOT_EXIST_READY_FALSE', port.ready === false, 'ready=' + port.ready);
      var png = await makePng();
      var svc = CLS(store, val, dedup, gate, makeRepo(), lg);
      var r = await svc.processUpload({ fileBuffer: png, originalName: 'a.png', mimeType: 'image/png' });
      t('RUNTIME_NOT_EXIST_FEATURE_NOT_READY', r.status === 'FEATURE_NOT_READY', r.status + ':' + r.reasonCode);
      t('RUNTIME_NOT_EXIST_REASON_CODE', r.reasonCode === 'NO_RUNTIME_AVAILABLE', 'reasonCode=' + r.reasonCode);
      t('RUNTIME_NOT_EXIST_QUARANTINE_CLEANED', fs.readdirSync(qDir).length === 0, '');
    } finally {
      gateAndCleanup.cleanup();
    }
  }

  // ── 7. audit failure → 不创建资产(rollback finalPath)──
  {
    resetDirs();
    var store = CFS(qDir, aDir, lg);
    var val = CV();
    var dedup = CD(null);
    var gate = {
      classify: function () {
        return Promise.resolve({
          modelType: 'mock', modelVersion: 'mock_v1', modelSha256: 'abc',
          scores: { safe: 0.95, adult: 0.02, racy: 0.02, violence: 0.01 },
          decision: 'SAFE', threshold: 0.5, inferenceMs: 1,
        });
      },
      isSafe: function (c) { return c && c.decision === 'SAFE'; },
      audit: function () { return Promise.reject(new Error('AUDIT_DOWN')); },
    };
    var repo = makeRepo();
    var svc = CLS(store, val, dedup, gate, repo, lg);
    var png = await makePng();
    var r = await svc.processUpload({ fileBuffer: png, originalName: 'a.png', mimeType: 'image/png' });
    t('AUDIT_FAIL_NOT_ACCEPTED', r.status !== 'ACCEPTED', 'status=' + r.status);
    t('AUDIT_FAIL_ERROR', r.status === 'ERROR' && r.error === 'AUDIT_FAILED', r.status + ':' + r.error);
    t('AUDIT_FAIL_NO_ASSET', Object.keys(repo._assets).length === 0, 'assets=' + Object.keys(repo._assets).length);
    t('AUDIT_FAIL_FINAL_CLEANED', fs.readdirSync(aDir).length === 0, 'leftover assets=' + fs.readdirSync(aDir).length);
  }

  // ── 8. 响应不包含绝对路径(finalPath / quarantinePath / localPath)──
  {
    resetDirs();
    var store = CFS(qDir, aDir, lg);
    var val = CV();
    var dedup = CD(null);
    // 测试两种路径:FEATURE_NOT_READY 和 ACCEPTED
    var gateNotReady = realGateNoModel();
    var svc1 = CLS(store, val, dedup, gateNotReady, makeRepo(), lg);
    var png = await makePng();
    var r1 = await svc1.processUpload({ fileBuffer: png, originalName: 'a.png', mimeType: 'image/png' });
    var keys1 = Object.keys(r1);
    t('NO_ABS_PATH_FEATURE_NOT_READY_NO_FINAL_PATH', keys1.indexOf('finalPath') < 0, 'keys=' + keys1.join(','));
    t('NO_ABS_PATH_FEATURE_NOT_READY_NO_QUARANTINE_PATH', keys1.indexOf('quarantinePath') < 0, '');
    t('NO_ABS_PATH_FEATURE_NOT_READY_NO_LOCAL_PATH', keys1.indexOf('localPath') < 0, '');

    resetDirs();
    var gate2 = makeReadyGate('SAFE');
    var svc2 = CLS(store, val, dedup, gate2, makeRepo(), lg);
    var png2 = await makePng();
    var r2 = await svc2.processUpload({ fileBuffer: png2, originalName: 'a.png', mimeType: 'image/png' });
    var keys2 = Object.keys(r2);
    t('NO_ABS_PATH_ACCEPTED_NO_FINAL_PATH', keys2.indexOf('finalPath') < 0, 'keys=' + keys2.join(','));
    t('NO_ABS_PATH_ACCEPTED_NO_QUARANTINE_PATH', keys2.indexOf('quarantinePath') < 0, '');
    t('NO_ABS_PATH_ACCEPTED_NO_LOCAL_PATH', keys2.indexOf('localPath') < 0, '');
  }

  // ── 9. 流式上传:classifier 未就绪 → FEATURE_NOT_READY ──
  {
    resetDirs();
    var store = CFS(qDir, aDir, lg);
    var val = CV();
    var dedup = CD(null);
    var gate = realGateNoModel();
    var svc = CLS(store, val, dedup, gate, makeRepo(), lg);
    var png = await makePng();
    var stream = Readable.from([png]);
    var r = await svc.processUploadStream(stream, { originalName: 'a.png', mimeType: 'image/png', expectedSize: png.length });
    t('STREAM_NOT_READY_FEATURE_NOT_READY', r.status === 'FEATURE_NOT_READY', r.status + ':' + r.reasonCode);
    t('STREAM_NOT_READY_QUARANTINE_CLEANED', fs.readdirSync(qDir).length === 0, '');
  }

  // ── 10. 流式上传:classifier 就绪(mock)→ ACCEPTED (SAFE) ──
  {
    resetDirs();
    var store = CFS(qDir, aDir, lg);
    var val = CV();
    var dedup = CD(null);
    var gate = makeReadyGate('SAFE');
    var repo = makeRepo();
    var svc = CLS(store, val, dedup, gate, repo, lg);
    var png = await makePng();
    var stream = Readable.from([png]);
    var r = await svc.processUploadStream(stream, { originalName: 'a.png', mimeType: 'image/png', expectedSize: png.length });
    t('STREAM_READY_ACCEPTED', r.status === 'ACCEPTED', r.status + ' ' + JSON.stringify(r));
    t('STREAM_READY_HAS_ASSET_ID', !!r.assetId, '');
    t('STREAM_READY_REPO_HAS_ASSET', !!repo._assets[r.assetId], '');
    t('STREAM_READY_NO_FINAL_PATH', r.finalPath === undefined, '');
  }

  // ── 11. classifier ready + unsafe content → REJECTED NSFW ──
  {
    resetDirs();
    var store = CFS(qDir, aDir, lg);
    var val = CV();
    var dedup = CD(null);
    var gate = makeReadyGate('UNSAFE');
    var svc = CLS(store, val, dedup, gate, makeRepo(), lg);
    var png = await makePng();
    var r = await svc.processUpload({ fileBuffer: png, originalName: 'a.png', mimeType: 'image/png' });
    t('UNSAFE_READY_REJECTED', r.status === 'REJECTED' && r.reason === 'NSFW', r.status + ':' + r.reason);
    t('UNSAFE_READY_HAS_CLASSIFICATION', r.classification && r.classification.decision === 'UNSAFE', '');
    t('UNSAFE_READY_QUARANTINE_CLEANED', fs.readdirSync(qDir).length === 0, '');
  }

  // ── 12. port 7 级 truth 端到端验证(通过 gate.classifierPort 访问)──
  {
    var gate = realGateNoModel();
    var port = gate.classifierPort;
    t('PORT_TRUTH_CONFIGURED_FALSE', port.configured === false, '');
    t('PORT_TRUTH_MODEL_EXISTS_FALSE', port.modelExists === false, '');
    t('PORT_TRUTH_RUNTIME_AVAILABLE_FALSE', port.runtimeAvailable === false, '');
    t('PORT_TRUTH_LOADED_FALSE', port.loaded === false, '');
    t('PORT_TRUTH_SMOKE_INFERENCE_FALSE', port.smokeInferencePassed === false, '');
    t('PORT_TRUTH_INFERENCE_READY_FALSE', port.inferenceReady === false, '');
    t('PORT_TRUTH_READY_FALSE', port.ready === false, '');

    // 模型文件存在但无 runtime
    var gateAndCleanup = realGateWithFile();
    var port2 = gateAndCleanup.gate.classifierPort;
    try {
      t('PORT_TRUTH_FILE_CONFIGURED_TRUE', port2.configured === true, '');
      t('PORT_TRUTH_FILE_MODEL_EXISTS_TRUE', port2.modelExists === true, '');
      t('PORT_TRUTH_FILE_RUNTIME_AVAILABLE_FALSE', port2.runtimeAvailable === false, '');
      t('PORT_TRUTH_FILE_LOADED_FALSE', port2.loaded === false, '');
      t('PORT_TRUTH_FILE_SMOKE_INFERENCE_FALSE', port2.smokeInferencePassed === false, '');
      t('PORT_TRUTH_FILE_INFERENCE_READY_FALSE', port2.inferenceReady === false, '');
      t('PORT_TRUTH_FILE_READY_FALSE', port2.ready === false, '');
      // 文件存在 ≠ ready:关键不变量
      t('PORT_TRUTH_FILE_EXISTS_NOT_READY', port2.modelExists === true && port2.ready === false, '文件存在但 ready=false');
    } finally {
      gateAndCleanup.cleanup();
    }
  }

  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  process.exit(ec);
}
run().catch(function (e) { console.log('CRASH: ' + (e && e.stack || e)); try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (x) {} process.exit(1); });
