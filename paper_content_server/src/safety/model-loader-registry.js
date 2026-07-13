// model-loader-registry.js — Inference runtime detection & model loader adapter
//
// 诚实的 readiness 模型:
//   detectRuntime() → { available, type, module, version }
//     - 依次尝试 onnxruntime-node / onnxruntime / @tensorflow/tfjs-node
//     - 任一可用 → available=true, type='onnx'|'tensorflow'
//     - 都不可用 → available=false (BLOCKED 状态,不冒充)
//
//   loadModel(modelPath, runtimeInfo) → Promise<{ model, sha256, type, version, inputShape, outputNames }>
//     - runtime 不可用 → reject RUNTIME_NOT_AVAILABLE
//     - 模型文件不存在 → reject MODEL_FILE_NOT_FOUND
//     - 加载失败 → reject <RUNTIME>_LOAD_FAILED
//     - 成功 → resolve model 句柄 + sha256 + 输入 shape + 输出 names
//
//   runSmokeInference(loadedModel, runtimeInfo) → Promise<true>
//     - runtime 不可用 → reject RUNTIME_NOT_AVAILABLE
//     - 模型未加载 → reject MODEL_NOT_LOADED
//     - 生成与模型输入尺寸匹配的测试张量,运行一次推理
//     - 输出概率合法(全在 [0,1] 且和 ≈ 1,或可经 softmax 归一化)→ resolve true
//     - 输出非法或推理抛错 → reject SMOKE_INFERENCE_FAILED
//
//   runRealInference(loadedModel, runtimeInfo, filePath) → Promise<{ scores, rawOutput }>
//     - 真实图像解码(sharp)→ resize 到模型输入尺寸 → 归一化 → 构造 tensor → 推理
//     - 输出映射到 { safe, adult, racy, violence }
//
// 当前环境无 runtime 时:
//   - detectRuntime() → { available: false }
//   - loadModel / runSmokeInference / runRealInference → reject RUNTIME_NOT_AVAILABLE
//   - 这是诚实的 BLOCKED 状态:不下载未知模型,不冒充推理,不返回假分数。

var fs = require('fs');
var crypto = require('crypto');

// 默认输入尺寸(许多 NSFW 模型用 224x224x3)
var DEFAULT_INPUT_SIZE = 224;
var DEFAULT_INPUT_CHANNELS = 3;

// detectRuntime — 探测可用的推理 runtime(同步,因为 require 是同步的)
// 返回 { available, type, module, version }
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

// loadModel — 异步加载模型到 runtime
// 返回 Promise<{ model, sha256, type, version, inputShape, outputNames }>
function loadModel(modelPath, runtimeInfo) {
  if (!runtimeInfo || !runtimeInfo.available) {
    return Promise.reject(new Error('RUNTIME_NOT_AVAILABLE'));
  }
  if (!modelPath || !fs.existsSync(modelPath)) {
    return Promise.reject(new Error('MODEL_FILE_NOT_FOUND: ' + modelPath));
  }

  var sha256 = computeSha256(modelPath);

  if (runtimeInfo.type === 'onnx') {
    return loadOnnxModel(modelPath, runtimeInfo, sha256);
  }
  if (runtimeInfo.type === 'tensorflow') {
    return loadTfjsModel(modelPath, runtimeInfo, sha256);
  }
  return Promise.reject(new Error('UNSUPPORTED_RUNTIME_TYPE: ' + runtimeInfo.type));
}

// loadOnnxModel — ONNX Runtime 异步加载
function loadOnnxModel(modelPath, runtimeInfo, sha256) {
  var ort = runtimeInfo.module;
  var InferenceSession = ort.InferenceSession || (ort.default && ort.default.InferenceSession);
  if (!InferenceSession) {
    return Promise.reject(new Error('ONNX_LOAD_FAILED: InferenceSession not found in module'));
  }
  if (typeof InferenceSession.create !== 'function') {
    return Promise.reject(new Error('ONNX_LOAD_FAILED: InferenceSession.create is not a function'));
  }

  return Promise.resolve()
    .then(function () { return InferenceSession.create(modelPath); })
    .then(function (session) {
      // 提取输入 shape 与输出 names(尽力而为,不同版本 API 可能不同)
      var inputShape = extractOnnxInputShape(session);
      var outputNames = extractOnnxOutputNames(session);
      return {
        model: session,
        sha256: sha256,
        type: 'onnx',
        version: runtimeInfo.version,
        inputShape: inputShape,
        outputNames: outputNames,
      };
    })
    .catch(function (e) {
      if (e && (e.message === 'ONNX_LOAD_FAILED' || e.message === 'RUNTIME_NOT_AVAILABLE')) throw e;
      throw new Error('ONNX_LOAD_FAILED: ' + (e && e.message || e));
    });
}

// extractOnnxInputShape — 从 ONNX session 提取输入 shape
// 不同 onnxruntime-node 版本 API 不同,尽力而为。
function extractOnnxInputShape(session) {
  try {
    if (!session) return null;
    // 较新版本: session.inputMetadata
    if (session.inputMetadata) {
      var names = session.inputNames || Object.keys(session.inputMetadata);
      for (var i = 0; i < names.length; i++) {
        var meta = session.inputMetadata[names[i]];
        if (meta && meta.shape) return meta.shape;
      }
    }
    // 某些版本: session.inputs
    if (Array.isArray(session.inputs) && session.inputs.length > 0) {
      var inp = session.inputs[0];
      if (inp && inp.dims) return inp.dims;
      if (inp && inp.shape) return inp.shape;
    }
  } catch (e) { /* ignore */ }
  return null;
}

// extractOnnxOutputNames — 从 ONNX session 提取输出 names
function extractOnnxOutputNames(session) {
  try {
    if (!session) return null;
    if (Array.isArray(session.outputNames) && session.outputNames.length > 0) {
      return session.outputNames;
    }
    if (Array.isArray(session.outputs)) {
      return session.outputs.map(function (o) { return o && o.name; }).filter(Boolean);
    }
  } catch (e) { /* ignore */ }
  return null;
}

// loadTfjsModel — TensorFlow.js 异步加载
function loadTfjsModel(modelPath, runtimeInfo, sha256) {
  var tf = runtimeInfo.module;
  var uri = 'file://' + modelPath;
  return Promise.resolve()
    .then(function () {
      // 优先尝试 loadGraphModel,fallback 到 loadLayersModel
      if (typeof tf.loadGraphModel === 'function') {
        return tf.loadGraphModel(uri).catch(function () {
          if (typeof tf.loadLayersModel === 'function') return tf.loadLayersModel(uri);
          throw new Error('TFJS_LOAD_FAILED: model load returned null');
        });
      }
      if (typeof tf.loadLayersModel === 'function') return tf.loadLayersModel(uri);
      throw new Error('TFJS_LOAD_FAILED: no load function available');
    })
    .then(function (model) {
      if (!model) throw new Error('TFJS_LOAD_FAILED: model load returned null');
      var inputShape = extractTfjsInputShape(model);
      var outputNames = extractTfjsOutputNames(model);
      return {
        model: model,
        sha256: sha256,
        type: 'tensorflow',
        version: runtimeInfo.version,
        inputShape: inputShape,
        outputNames: outputNames,
      };
    })
    .catch(function (e) {
      if (e && e.message && e.message.indexOf('TFJS_LOAD_FAILED') === 0) throw e;
      throw new Error('TFJS_LOAD_FAILED: ' + (e && e.message || e));
    });
}

function extractTfjsInputShape(model) {
  try {
    if (!model) return null;
    if (Array.isArray(model.inputs) && model.inputs.length > 0) {
      var shape = model.inputs[0].shape;
      if (Array.isArray(shape)) return shape;
    }
    if (model.inputShape && Array.isArray(model.inputShape)) return model.inputShape;
  } catch (e) { /* ignore */ }
  return null;
}

function extractTfjsOutputNames(model) {
  try {
    if (!model) return null;
    if (Array.isArray(model.outputNames) && model.outputNames.length > 0) return model.outputNames;
    if (Array.isArray(model.outputs)) {
      return model.outputs.map(function (o) { return o && o.name; }).filter(Boolean);
    }
  } catch (e) { /* ignore */ }
  return null;
}

// resolveInputDims — 从 inputShape(可能含 null/动态维度)推导 [H, W, C]
// NCHW: [N, C, H, W]; NHWC: [N, H, W, C]
// 动态维度(null/-1/字符串)用默认值替换
function resolveInputDims(inputShape) {
  var shape = inputShape && Array.isArray(inputShape) ? inputShape.slice() : null;
  if (!shape || shape.length === 0) {
    return { height: DEFAULT_INPUT_SIZE, width: DEFAULT_INPUT_SIZE, channels: DEFAULT_INPUT_CHANNELS, layout: 'NHWC' };
  }
  // 替换动态维度
  var cleaned = shape.map(function (d) {
    if (d === null || d === undefined || d < 0 || typeof d === 'string') return null;
    return d;
  });
  // 推断 layout: 4D tensor
  if (cleaned.length === 4) {
    // NCHW or NHWC — 用已知维度判断
    // NCHW: [N, C, H, W] — 第 2 维通常较小(1/3/4)
    // NHWC: [N, H, W, C] — 第 3 维通常较小(1/3/4)
    var dim1 = cleaned[1];
    var dim3 = cleaned[3];
    var layout;
    if (dim3 !== null && (dim3 === 1 || dim3 === 3 || dim3 === 4)) {
      layout = 'NHWC';
      return {
        height: cleaned[1] || DEFAULT_INPUT_SIZE,
        width: cleaned[2] || DEFAULT_INPUT_SIZE,
        channels: dim3,
        layout: layout,
      };
    }
    if (dim1 !== null && (dim1 === 1 || dim1 === 3 || dim1 === 4)) {
      layout = 'NCHW';
      return {
        height: cleaned[2] || DEFAULT_INPUT_SIZE,
        width: cleaned[3] || DEFAULT_INPUT_SIZE,
        channels: dim1,
        layout: layout,
      };
    }
    // 无法判断 — 默认 NHWC
    return {
      height: cleaned[1] || DEFAULT_INPUT_SIZE,
      width: cleaned[2] || DEFAULT_INPUT_SIZE,
      channels: cleaned[3] || DEFAULT_INPUT_CHANNELS,
      layout: 'NHWC',
    };
  }
  if (cleaned.length === 3) {
    // HWC
    return {
      height: cleaned[0] || DEFAULT_INPUT_SIZE,
      width: cleaned[1] || DEFAULT_INPUT_SIZE,
      channels: cleaned[2] || DEFAULT_INPUT_CHANNELS,
      layout: 'HWC',
    };
  }
  return { height: DEFAULT_INPUT_SIZE, width: DEFAULT_INPUT_SIZE, channels: DEFAULT_INPUT_CHANNELS, layout: 'NHWC' };
}

// runSmokeInference — 异步 smoke inference
// 生成与模型输入尺寸匹配的测试张量,运行推理,校验输出。
function runSmokeInference(loadedModel, runtimeInfo) {
  if (!runtimeInfo || !runtimeInfo.available) {
    return Promise.reject(new Error('RUNTIME_NOT_AVAILABLE'));
  }
  if (!loadedModel || !loadedModel.model) {
    return Promise.reject(new Error('MODEL_NOT_LOADED'));
  }

  if (runtimeInfo.type === 'onnx') {
    return runOnnxSmokeInference(loadedModel, runtimeInfo);
  }
  if (runtimeInfo.type === 'tensorflow') {
    return runTfjsSmokeInference(loadedModel, runtimeInfo);
  }
  return Promise.reject(new Error('UNSUPPORTED_RUNTIME_TYPE: ' + runtimeInfo.type));
}

// runOnnxSmokeInference — ONNX smoke inference
function runOnnxSmokeInference(loadedModel, runtimeInfo) {
  var ort = runtimeInfo.module;
  var session = loadedModel.model;
  var inputShape = loadedModel.inputShape;
  var dims = resolveInputDims(inputShape);

  return Promise.resolve()
    .then(function () {
      var inputName = 'input';
      try {
        if (Array.isArray(session.inputNames) && session.inputNames.length > 0) {
          inputName = session.inputNames[0];
        }
      } catch (e) { /* ignore */ }

      // 构造测试张量:全 0.5 灰度
      var totalElements = dims.height * dims.width * dims.channels;
      var data = new Float32Array(totalElements);
      for (var i = 0; i < totalElements; i++) data[i] = 0.5;

      // onnxruntime-node Tensor 构造: new Tensor(type, data, dims)
      var tensorDims;
      if (dims.layout === 'NCHW') {
        tensorDims = [1, dims.channels, dims.height, dims.width];
      } else {
        tensorDims = [1, dims.height, dims.width, dims.channels];
      }
      var TensorCtor = ort.Tensor || (ort.default && ort.default.Tensor);
      if (!TensorCtor) throw new Error('ONNX_SMOKE_FAILED: Tensor constructor not found');
      var tensor = new TensorCtor('float32', data, tensorDims);

      var feeds = {};
      feeds[inputName] = tensor;
      return session.run(feeds);
    })
    .then(function (outputs) {
      var probs = extractOnnxOutputProbabilities(outputs, session);
      if (!validateProbabilities(probs)) {
        // 输出可能未过 softmax — 尝试 softmax 归一化后再校验
        var normalized = softmax(probs);
        if (validateProbabilities(normalized)) return true;
        throw new Error('SMOKE_INFERENCE_FAILED: output not valid probability distribution');
      }
      return true;
    })
    .catch(function (e) {
      if (e && e.message && e.message.indexOf('SMOKE_INFERENCE_FAILED') === 0) throw e;
      if (e && e.message && e.message.indexOf('ONNX_SMOKE_FAILED') === 0) throw e;
      throw new Error('SMOKE_INFERENCE_FAILED: ' + (e && e.message || e));
    });
}

// runTfjsSmokeInference — TFJS smoke inference
function runTfjsSmokeInference(loadedModel, runtimeInfo) {
  var tf = runtimeInfo.module;
  var model = loadedModel.model;
  var inputShape = loadedModel.inputShape;
  var dims = resolveInputDims(inputShape);

  return Promise.resolve()
    .then(function () {
      var totalElements = dims.height * dims.width * dims.channels;
      var data = new Float32Array(totalElements);
      for (var i = 0; i < totalElements; i++) data[i] = 0.5;
      var tensor = tf.tensor3d(data, [dims.height, dims.width, dims.channels]);
      var input = tensor.expandDims(0); // [1, H, W, C]
      var output;
      try {
        output = model.predict(input);
      } finally {
        // 释放输入张量(不释放 output,因为需要读取)
        try { tensor.dispose(); input.dispose(); } catch (e) { /* ignore */ }
      }
      return output;
    })
    .then(function (output) {
      var probs = extractTfjsOutputProbabilities(output, tf);
      try { if (output && typeof output.dispose === 'function') output.dispose(); } catch (e) { /* ignore */ }
      if (!validateProbabilities(probs)) {
        var normalized = softmax(probs);
        if (validateProbabilities(normalized)) return true;
        throw new Error('SMOKE_INFERENCE_FAILED: output not valid probability distribution');
      }
      return true;
    })
    .catch(function (e) {
      if (e && e.message && e.message.indexOf('SMOKE_INFERENCE_FAILED') === 0) throw e;
      throw new Error('SMOKE_INFERENCE_FAILED: ' + (e && e.message || e));
    });
}

// runRealInference — 真实图像推理
// 返回 Promise<{ scores: {safe, adult, racy, violence}, rawOutput: number[] }>
function runRealInference(loadedModel, runtimeInfo, filePath) {
  if (!runtimeInfo || !runtimeInfo.available) {
    return Promise.reject(new Error('RUNTIME_NOT_AVAILABLE'));
  }
  if (!loadedModel || !loadedModel.model) {
    return Promise.reject(new Error('MODEL_NOT_LOADED'));
  }
  if (!filePath || !fs.existsSync(filePath)) {
    return Promise.reject(new Error('IMAGE_FILE_NOT_FOUND: ' + filePath));
  }

  if (runtimeInfo.type === 'onnx') {
    return runOnnxRealInference(loadedModel, runtimeInfo, filePath);
  }
  if (runtimeInfo.type === 'tensorflow') {
    return runTfjsRealInference(loadedModel, runtimeInfo, filePath);
  }
  return Promise.reject(new Error('UNSUPPORTED_RUNTIME_TYPE: ' + runtimeInfo.type));
}

// decodeAndPreprocess — 用 sharp 解码图像并 resize 到模型输入尺寸
// 返回 { data: Float32Array, dims: {height, width, channels, layout} }
function decodeAndPreprocess(filePath, dims) {
  var sharp;
  try { sharp = require('sharp'); }
  catch (e) { return Promise.reject(new Error('SHARP_NOT_AVAILABLE: ' + e.message)); }

  return sharp(filePath)
    .removeAlpha() // 确保只有 RGB 3 通道
    .resize(dims.width, dims.height, { fit: 'fill' })
    .raw()
    .toBuffer()
    .then(function (rawBuffer) {
      // rawBuffer 是 Uint8Array(RGB),归一化到 [0,1]
      var n = rawBuffer.length;
      var data = new Float32Array(n);
      for (var i = 0; i < n; i++) data[i] = rawBuffer[i] / 255.0;
      return { data: data, dims: dims };
    });
}

// runOnnxRealInference — ONNX 真实推理
function runOnnxRealInference(loadedModel, runtimeInfo, filePath) {
  var ort = runtimeInfo.module;
  var session = loadedModel.model;
  var dims = resolveInputDims(loadedModel.inputShape);

  return decodeAndPreprocess(filePath, dims)
    .then(function (preprocessed) {
      var inputName = 'input';
      try {
        if (Array.isArray(session.inputNames) && session.inputNames.length > 0) {
          inputName = session.inputNames[0];
        }
      } catch (e) { /* ignore */ }

      // 如果 layout 是 NCHW,需要 HWC → CHW 转置
      var tensorData = preprocessed.data;
      if (dims.layout === 'NCHW') {
        tensorData = hwcToChw(preprocessed.data, dims.height, dims.width, dims.channels);
      }
      var tensorDims;
      if (dims.layout === 'NCHW') {
        tensorDims = [1, dims.channels, dims.height, dims.width];
      } else {
        tensorDims = [1, dims.height, dims.width, dims.channels];
      }
      var TensorCtor = ort.Tensor || (ort.default && ort.default.Tensor);
      if (!TensorCtor) throw new Error('ONNX_INFERENCE_FAILED: Tensor constructor not found');
      var tensor = new TensorCtor('float32', tensorData, tensorDims);
      var feeds = {};
      feeds[inputName] = tensor;
      return session.run(feeds);
    })
    .then(function (outputs) {
      var probs = extractOnnxOutputProbabilities(outputs, session);
      return { scores: mapOutputToScores(probs), rawOutput: probs };
    })
    .catch(function (e) {
      if (e && e.message && (e.message.indexOf('ONNX_INFERENCE_FAILED') === 0 ||
                             e.message.indexOf('IMAGE_FILE_NOT_FOUND') === 0 ||
                             e.message.indexOf('SHARP_NOT_AVAILABLE') === 0)) throw e;
      throw new Error('ONNX_INFERENCE_FAILED: ' + (e && e.message || e));
    });
}

// runTfjsRealInference — TFJS 真实推理
function runTfjsRealInference(loadedModel, runtimeInfo, filePath) {
  var tf = runtimeInfo.module;
  var model = loadedModel.model;
  var dims = resolveInputDims(loadedModel.inputShape);

  return decodeAndPreprocess(filePath, dims)
    .then(function (preprocessed) {
      var tensor = tf.tensor3d(preprocessed.data, [dims.height, dims.width, dims.channels]);
      var input = tensor.expandDims(0);
      var output;
      try {
        output = model.predict(input);
      } finally {
        try { tensor.dispose(); input.dispose(); } catch (e) { /* ignore */ }
      }
      return output;
    })
    .then(function (output) {
      var probs = extractTfjsOutputProbabilities(output, tf);
      try { if (output && typeof output.dispose === 'function') output.dispose(); } catch (e) { /* ignore */ }
      return { scores: mapOutputToScores(probs), rawOutput: probs };
    })
    .catch(function (e) {
      if (e && e.message && (e.message.indexOf('IMAGE_FILE_NOT_FOUND') === 0 ||
                             e.message.indexOf('SHARP_NOT_AVAILABLE') === 0)) throw e;
      throw new Error('TFJS_INFERENCE_FAILED: ' + (e && e.message || e));
    });
}

// extractOnnxOutputProbabilities — 从 ONNX session.run() 的输出提取概率数组
function extractOnnxOutputProbabilities(outputs, session) {
  if (!outputs) return [];
  // outputs 是 { outputName: Tensor }
  var names = (session && Array.isArray(session.outputNames)) ? session.outputNames : Object.keys(outputs);
  for (var i = 0; i < names.length; i++) {
    var tensor = outputs[names[i]];
    if (tensor && tensor.data) {
      return Array.from(tensor.data);
    }
  }
  // fallback: 取第一个 tensor
  var keys = Object.keys(outputs);
  if (keys.length > 0) {
    var t = outputs[keys[0]];
    if (t && t.data) return Array.from(t.data);
  }
  return [];
}

// extractTfjsOutputProbabilities — 从 TFJS model.predict() 输出提取概率数组
function extractTfjsOutputProbabilities(output, tf) {
  if (!output) return [];
  // output 可能是单个 tensor 或 tensor 数组
  var tensor = Array.isArray(output) ? output[0] : output;
  if (!tensor) return [];
  try {
    var data = tensor.dataSync ? tensor.dataSync() : tensor.data;
    return Array.from(data);
  } catch (e) {
    return [];
  }
}

// hwcToChw — HWC 格式的 Float32Array 转为 CHW 格式
function hwcToChw(hwc, height, width, channels) {
  var chw = new Float32Array(hwc.length);
  for (var c = 0; c < channels; c++) {
    for (var h = 0; h < height; h++) {
      for (var w = 0; w < width; w++) {
        var hwcIdx = (h * width + w) * channels + c;
        var chwIdx = c * height * width + h * width + w;
        chw[chwIdx] = hwc[hwcIdx];
      }
    }
  }
  return chw;
}

// softmax — 对 logits 数组做 softmax 归一化
function softmax(logits) {
  if (!logits || !Array.isArray(logits) || logits.length === 0) return [];
  var maxVal = -Infinity;
  for (var i = 0; i < logits.length; i++) {
    var v = Number(logits[i]);
    if (isNaN(v)) return []; // NaN 输入直接判失败
    if (v > maxVal) maxVal = v;
  }
  if (!isFinite(maxVal)) return [];
  var exps = [];
  var sum = 0;
  for (var j = 0; j < logits.length; j++) {
    var e = Math.exp(Number(logits[j]) - maxVal);
    exps.push(e);
    sum += e;
  }
  if (sum === 0) return [];
  return exps.map(function (e) { return e / sum; });
}

// mapOutputToScores — 将原始输出概率映射到 { safe, adult, racy, violence }
// 适配常见 NSFW 模型输出格式:
//   - 2 类 [sfw, nsfw] → { safe: p[0], adult: p[1], racy: 0, violence: 0 }
//   - 1 类 [nsfw_prob] → { safe: 1-p[0], adult: p[0], racy: 0, violence: 0 }
//   - 5 类 [drawings/hentai/neutral/porn/sexy] (NSFW model by GantMan) →
//       safe = neutral + drawings, adult = porn + hentai, racy = sexy, violence = 0
//   - 4 类 → 直接映射为 [safe, adult, racy, violence]
//   - 其他 → 取最大值作为 unsafe 分数,safe = 1 - max
function mapOutputToScores(probs) {
  var scores = { safe: 0, adult: 0, racy: 0, violence: 0 };
  if (!probs || !Array.isArray(probs) || probs.length === 0) return scores;

  // 校验所有值为有限数
  for (var i = 0; i < probs.length; i++) {
    var n = Number(probs[i]);
    if (isNaN(n) || !isFinite(n)) return scores; // 返回全 0(由调用方校验失败)
  }

  if (probs.length === 1) {
    scores.safe = 1 - clamp01(probs[0]);
    scores.adult = clamp01(probs[0]);
  } else if (probs.length === 2) {
    scores.safe = clamp01(probs[0]);
    scores.adult = clamp01(probs[1]);
  } else if (probs.length === 4) {
    scores.safe = clamp01(probs[0]);
    scores.adult = clamp01(probs[1]);
    scores.racy = clamp01(probs[2]);
    scores.violence = clamp01(probs[3]);
  } else if (probs.length === 5) {
    // NSFW model by GantMan: [drawings, hentai, neutral, porn, sexy]
    scores.safe = clamp01(probs[0]) + clamp01(probs[2]); // drawings + neutral
    scores.adult = clamp01(probs[1]) + clamp01(probs[3]); // hentai + porn
    scores.racy = clamp01(probs[4]); // sexy
    scores.violence = 0;
  } else {
    // 其他:最大值作为 unsafe 分数
    var maxVal = 0;
    for (var k = 1; k < probs.length; k++) {
      if (probs[k] > maxVal) maxVal = probs[k];
    }
    scores.safe = clamp01(probs[0]);
    scores.adult = clamp01(maxVal);
  }

  // 归一化到 [0,1] 且和为 1(防止 scores 之和 > 1)
  var total = scores.safe + scores.adult + scores.racy + scores.violence;
  if (total > 0 && Math.abs(total - 1) > 0.001) {
    scores.safe = scores.safe / total;
    scores.adult = scores.adult / total;
    scores.racy = scores.racy / total;
    scores.violence = scores.violence / total;
  }
  return scores;
}

function clamp01(v) {
  var n = Number(v);
  if (isNaN(n) || !isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

// validateProbabilities — 校验推理输出是否为合法概率分布
// 所有值在 [0,1] 且和 ≈ 1(容差 0.01)
function validateProbabilities(probs) {
  if (!probs || !Array.isArray(probs)) return false;
  if (probs.length === 0) return false;
  var sum = 0;
  for (var i = 0; i < probs.length; i++) {
    var p = Number(probs[i]);
    if (isNaN(p) || !isFinite(p)) return false;
    if (p < 0 || p > 1) return false;
    sum += p;
  }
  return Math.abs(sum - 1) < 0.01;
}

// validateScores — 校验 scores 对象是否合法(无 NaN/Infinity,字段完整)
function validateScores(scores) {
  if (!scores || typeof scores !== 'object') return false;
  var keys = ['safe', 'adult', 'racy', 'violence'];
  for (var i = 0; i < keys.length; i++) {
    var v = scores[keys[i]];
    if (v === undefined || v === null) return false;
    var n = Number(v);
    if (isNaN(n) || !isFinite(n)) return false;
    if (n < 0 || n > 1) return false;
  }
  return true;
}

module.exports = {
  detectRuntime: detectRuntime,
  loadModel: loadModel,
  runSmokeInference: runSmokeInference,
  runRealInference: runRealInference,
  decodeAndPreprocess: decodeAndPreprocess,
  computeSha256: computeSha256,
  validateProbabilities: validateProbabilities,
  validateScores: validateScores,
  mapOutputToScores: mapOutputToScores,
  softmax: softmax,
  resolveInputDims: resolveInputDims,
  DEFAULT_INPUT_SIZE: DEFAULT_INPUT_SIZE,
};
