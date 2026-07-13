// model-loader-registry.js — Inference runtime detection & model loader adapter
//
// 诚实的 readiness 模型:
//   detectRuntime() → { available, type, module, version }
//     - 依次尝试 onnxruntime-node / onnxruntime / @tensorflow/tfjs-node
//     - 任一可用 → available=true, type='onnx'|'tensorflow'
//     - 都不可用 → available=false (BLOCKED 状态,不冒充)
//
//   loadModel(modelPath, runtimeInfo) → { model, sha256, type, version } | throws
//     - runtime 不可用 → throw RUNTIME_NOT_AVAILABLE
//     - 模型文件不存在 → throw MODEL_FILE_NOT_FOUND
//     - 加载失败 → throw <RUNTIME>_LOAD_FAILED
//     - 成功 → 返回 model 句柄 + sha256(用于 modelSha256 / modelVersion)
//
//   runSmokeInference(loadedModel, runtimeInfo) → true | throws
//     - runtime 不可用 → throw RUNTIME_NOT_AVAILABLE
//     - 模型未加载 → throw MODEL_NOT_LOADED
//     - 生成 1x1(或 8x8)测试图,运行一次推理
//     - 输出概率合法(全在 [0,1] 且和 ≈ 1)→ true
//     - 输出非法或推理抛错 → throw SMOKE_INFERENCE_FAILED
//
// 当前环境无 runtime 时:
//   - detectRuntime() → { available: false }
//   - loadModel / runSmokeInference → throw RUNTIME_NOT_AVAILABLE
//   - 这是诚实的 BLOCKED 状态:不下载未知模型,不冒充推理,不返回假分数。
//
// 将来安装 onnxruntime-node 或 @tensorflow/tfjs-node 后,只需补全
// runOnnxSmokeInference / runTfjsSmokeInference 的实际推理逻辑(当前为
// scaffolding,因为无 runtime 无法验证)。detectRuntime 会自动检测到 runtime,
// port 会据此设置 runtimeAvailable=true 并尝试 loadModel + smoke inference。

var fs = require('fs');
var crypto = require('crypto');

// detectRuntime — 探测可用的推理 runtime
// 返回 { available, type, module, version }
//   available: boolean — 是否有可用 runtime
//   type: 'onnx' | 'tensorflow' | null
//   module: runtime 模块句柄 | null
//   version: runtime 版本字符串 | null
function detectRuntime() {
  // 1. onnxruntime-node (ONNX Runtime 官方 Node.js binding)
  try {
    var ort = require('onnxruntime-node');
    return {
      available: true,
      type: 'onnx',
      module: ort,
      version: (ort && ort.version) || 'unknown',
    };
  } catch (e) { /* onnxruntime-node not installed */ }

  // 2. onnxruntime (umbrella package, 某些项目用这个名称)
  try {
    var ort2 = require('onnxruntime');
    return {
      available: true,
      type: 'onnx',
      module: ort2,
      version: (ort2 && ort2.version) || 'unknown',
    };
  } catch (e) { /* onnxruntime not installed */ }

  // 3. @tensorflow/tfjs-node (TensorFlow.js Node.js binding)
  try {
    var tf = require('@tensorflow/tfjs-node');
    return {
      available: true,
      type: 'tensorflow',
      module: tf,
      version: (tf && tf.version && (tf.version.tfjs || tf.version)) || 'unknown',
    };
  } catch (e) { /* @tensorflow/tfjs-node not installed */ }

  // 无可用 runtime — 诚实的 BLOCKED 状态
  return { available: false, type: null, module: null, version: null };
}

// computeSha256 — 计算模型文件的 SHA256(用于 modelSha256 / modelVersion)
function computeSha256(filePath) {
  var hash = crypto.createHash('sha256');
  var data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest('hex');
}

// loadModel — 加载模型到 runtime
// 返回 { model, sha256, type, version } 或 throw
function loadModel(modelPath, runtimeInfo) {
  if (!runtimeInfo || !runtimeInfo.available) {
    throw new Error('RUNTIME_NOT_AVAILABLE');
  }
  if (!modelPath || !fs.existsSync(modelPath)) {
    throw new Error('MODEL_FILE_NOT_FOUND: ' + modelPath);
  }

  var sha256 = computeSha256(modelPath);

  if (runtimeInfo.type === 'onnx') {
    var ort = runtimeInfo.module;
    var InferenceSession = ort.InferenceSession || (ort.default && ort.default.InferenceSession);
    if (!InferenceSession) {
      throw new Error('ONNX_LOAD_FAILED: InferenceSession not found in module');
    }
    var session;
    try {
      // ONNX Runtime Node.js: InferenceSession.create(filePath) 返回 Promise
      // 同步路径下用 createSync(如果可用),否则标记为 async-load-required
      if (typeof InferenceSession.create === 'function') {
        // async API — port 层应在初始化时 await
        session = InferenceSession.create(modelPath);
      } else if (typeof InferenceSession === 'function') {
        session = new InferenceSession(modelPath);
      } else {
        throw new Error('InferenceSession is not constructable');
      }
    } catch (e) {
      throw new Error('ONNX_LOAD_FAILED: ' + e.message);
    }
    return { model: session, sha256: sha256, type: 'onnx', version: runtimeInfo.version };
  }

  if (runtimeInfo.type === 'tensorflow') {
    var tf = runtimeInfo.module;
    var model;
    try {
      // tfjs-node: loadGraphModel / loadLayersModel 返回 Promise
      var uri = 'file://' + modelPath;
      if (modelPath.endsWith('.json')) {
        model = tf.loadGraphModel(uri);
      } else {
        model = tf.loadGraphModel(uri);
      }
    } catch (e) {
      throw new Error('TFJS_LOAD_FAILED: ' + e.message);
    }
    return { model: model, sha256: sha256, type: 'tensorflow', version: runtimeInfo.version };
  }

  throw new Error('UNSUPPORTED_RUNTIME_TYPE: ' + runtimeInfo.type);
}

// runSmokeInference — 启动 smoke inference(用一张小测试图)
// 返回 true(通过)或 throw(失败)
// smoke inference 的目的是:确认模型真的能推理,而不是加载后静默坏掉。
function runSmokeInference(loadedModel, runtimeInfo) {
  if (!runtimeInfo || !runtimeInfo.available) {
    throw new Error('RUNTIME_NOT_AVAILABLE');
  }
  if (!loadedModel || !loadedModel.model) {
    throw new Error('MODEL_NOT_LOADED');
  }

  if (runtimeInfo.type === 'onnx') {
    return runOnnxSmokeInference(loadedModel, runtimeInfo);
  }
  if (runtimeInfo.type === 'tensorflow') {
    return runTfjsSmokeInference(loadedModel, runtimeInfo);
  }
  throw new Error('UNSUPPORTED_RUNTIME_TYPE: ' + runtimeInfo.type);
}

// runOnnxSmokeInference — ONNX runtime smoke inference
// 生成 1x1xHxWx3 测试张量,运行推理,校验输出概率。
// 当前为 scaffolding:无 onnxruntime 时不会到达此路径。
function runOnnxSmokeInference(loadedModel, runtimeInfo) {
  var ort = runtimeInfo.module;
  var session = loadedModel.model;
  // session 可能是 Promise(异步加载),这里做 best-effort 同步检查
  // 实际实现需要 await session,然后用 ort.Tensor 构造输入,运行 session.run()
  // 输出校验:所有概率在 [0,1] 且和 ≈ 1
  // 因当前无 onnxruntime,保留接口框架,到达时抛 NOT_IMPLEMENTED
  throw new Error('ONNX_SMOKE_INFERENCE_NOT_IMPLEMENTED');
}

// runTfjsSmokeInference — TensorFlow.js smoke inference
// 生成 1xHxWx3 tensor,运行 model.predict,校验输出概率。
// 当前为 scaffolding:无 tfjs-node 时不会到达此路径。
function runTfjsSmokeInference(loadedModel, runtimeInfo) {
  var tf = runtimeInfo.module;
  var model = loadedModel.model;
  // model 可能是 Promise(异步加载),实际实现需要 await model
  // 构造 tf.tensor3d(1x8x8x3),运行 model.predict(tensor)
  // 输出校验:所有概率在 [0,1] 且和 ≈ 1
  // 因当前无 tfjs-node,保留接口框架,到达时抛 NOT_IMPLEMENTED
  throw new Error('TFJS_SMOKE_INFERENCE_NOT_IMPLEMENTED');
}

// validateProbabilities — 校验推理输出是否为合法概率分布
// 所有值在 [0,1] 且和 ≈ 1(容差 0.01)
function validateProbabilities(probs) {
  if (!probs || !Array.isArray(probs)) return false;
  var sum = 0;
  for (var i = 0; i < probs.length; i++) {
    var p = Number(probs[i]);
    if (isNaN(p) || p < 0 || p > 1) return false;
    sum += p;
  }
  return Math.abs(sum - 1) < 0.01;
}

module.exports = {
  detectRuntime: detectRuntime,
  loadModel: loadModel,
  runSmokeInference: runSmokeInference,
  computeSha256: computeSha256,
  validateProbabilities: validateProbabilities,
};
