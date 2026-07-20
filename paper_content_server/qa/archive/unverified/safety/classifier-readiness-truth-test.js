#!/usr/bin/env node
// classifier-readiness-truth-test.js — P0-3: classifier readiness 7-level truth.
//
// Truth model under test (src/safety/safety-classifier-port.js):
//   configured         = !!modelPath (path provided)
//   modelExists        = !!modelPath && fs.existsSync(modelPath)
//   runtimeAvailable   = 推理 runtime (onnxruntime/tfjs-node) 已安装
//   loaded             = false (当前无 runtime,不冒充加载)
//   smokeInferencePassed = false (当前无 runtime,不冒充推理)
//   inferenceReady     = loaded && smokeInferencePassed = false
//   ready              = inferenceReady = false until a real inference engine is wired in
//
// Key invariant: even when a user sets NSFW_MODEL_PATH to an existing file,
// `ready` MUST stay false because there is no inference runtime.
// classify() rejects with NO_RUNTIME_AVAILABLE (file exists, no runtime) or
// CLASSIFIER_NOT_READY (no modelPath / file missing). No fake data is returned.
//
// This test verifies the truth propagates end-to-end:
//   1. EXISTING_MODEL_FILE_NOT_READY_WITHOUT_RUNTIME — port.ready=false with a real file
//   2. CUSTOM_NOT_READY_WITH_STUB_CLASSIFIER — customLibrary feature ready=false
//   3. LEARNING_SCHEDULER_NOT_STARTED_WITH_STUB_CLASSIFIER — scheduler does not start
//   4. CLASSIFIER_NOT_READY_NEVER_REPORTS_READY — ready never true across all configs
var path = require('path');
var fs = require('fs');
var os = require('os');
var ROOT = path.join(__dirname, '..', '..');
var { createSafetyClassifierPort } = require(path.join(ROOT, 'src', 'safety', 'safety-classifier-port'));
var FV = require(path.join(ROOT, 'src', 'admin', 'feature-flag-view'));
var SCHED = require(path.join(ROOT, 'src', 'learning', 'learning-scheduler'));

var ec = 0, pass = 0, fail = 0;
function t(n, ok, d) {
  console.log((ok ? 'PASS ' : 'FAIL ') + n + (d ? ': ' + d : ''));
  if (ok) pass++; else { ec = 1; fail++; }
}

var logger = { info: function () {}, warn: function () {}, error: function () {} };

async function run() {
  // ── EXISTING_MODEL_FILE_NOT_READY_WITHOUT_RUNTIME ──
  // A dummy model file exists on disk, but with no runtime (onnxruntime/tfjs-node),
  // the port reports: configured=true, modelExists=true, runtimeAvailable=false,
  // loaded=false, smokeInferencePassed=false, inferenceReady=false, ready=false.
  // classify() rejects with NO_RUNTIME_AVAILABLE (file exists but no runtime).
  var tmpModel = path.join(os.tmpdir(), 'p03-truth-model-' + Date.now() + '-' + process.pid + '.onnx');
  fs.writeFileSync(tmpModel, 'FAKE_MODEL_BYTES');
  try {
    var port = createSafetyClassifierPort({ logger: logger, modelPath: tmpModel });

    t('EXISTING_MODEL_FILE_NOT_READY_WITHOUT_RUNTIME_configured_true',
      port.configured === true, 'configured=' + port.configured);
    t('EXISTING_MODEL_FILE_NOT_READY_WITHOUT_RUNTIME_modelExists_true',
      port.modelExists === true, 'modelExists=' + port.modelExists);
    t('EXISTING_MODEL_FILE_NOT_READY_WITHOUT_RUNTIME_runtimeAvailable_false',
      port.runtimeAvailable === false, 'runtimeAvailable=' + port.runtimeAvailable);
    t('EXISTING_MODEL_FILE_NOT_READY_WITHOUT_RUNTIME_loaded_false',
      port.loaded === false, 'loaded=' + port.loaded);
    t('EXISTING_MODEL_FILE_NOT_READY_WITHOUT_RUNTIME_smokeInferencePassed_false',
      port.smokeInferencePassed === false, 'smokeInferencePassed=' + port.smokeInferencePassed);
    t('EXISTING_MODEL_FILE_NOT_READY_WITHOUT_RUNTIME_inferenceReady_false',
      port.inferenceReady === false, 'inferenceReady=' + port.inferenceReady);
    t('EXISTING_MODEL_FILE_NOT_READY_WITHOUT_RUNTIME_ready_false',
      port.ready === false, 'ready=' + port.ready);

    // classify rejects with NO_RUNTIME_AVAILABLE (file exists but no runtime)
    var classifyErr = null;
    try { await port.classify('/tmp/x.png', { width: 10, height: 10 }); }
    catch (e) { classifyErr = e; }
    t('EXISTING_MODEL_FILE_NOT_READY_WITHOUT_RUNTIME_classify_no_runtime',
      classifyErr !== null && classifyErr.message === 'NO_RUNTIME_AVAILABLE',
      classifyErr ? classifyErr.message : 'no error');
  } finally {
    try { fs.unlinkSync(tmpModel); } catch (e) {}
  }

  // ── CUSTOM_NOT_READY_WITH_STUB_CLASSIFIER ──
  // customLibrary feature flag is ON and the service exists, but the classifier port
  // reports ready=false (stub: configured=true, modelExists=true, ready=false).
  // The feature-flag truth model must surface customLibrary.ready=false with
  // reason=SAFETY_CLASSIFIER_NOT_READY — NOT ready=true based on port.configured.
  var stubPort = createSafetyClassifierPort({
    logger: logger,
    modelPath: path.join(os.tmpdir(), 'p03-stub-' + Date.now() + '-' + process.pid + '.bin'),
  });
  // sanity: the stub port is configured (path provided) but file missing → ready=false
  t('CUSTOM_NOT_READY_WITH_STUB_CLASSIFIER_stub_port_ready_false',
    stubPort.ready === false, 'stub port ready=' + stubPort.ready);

  var flags = FV.getFeatureFlags({
    config: { features: {
      customLibraryEnabled: true,
      learningLibraryEnabled: false,
      mqttEnabled: false,
      advancedRenderEnabled: false,
      renderShadowEnabled: false,
      deletePipelineEnabled: false,
    } },
    customLibraryService: { name: 'custom' },
    safetyClassifierPort: stubPort,
  });
  t('CUSTOM_NOT_READY_WITH_STUB_CLASSIFIER_classifier_ready_false',
    flags.classifier.ready === false, 'classifier.ready=' + flags.classifier.ready);
  t('CUSTOM_NOT_READY_WITH_STUB_CLASSIFIER_custom_ready_false',
    flags.customLibrary.ready === false, 'customLibrary.ready=' + flags.customLibrary.ready);
  t('CUSTOM_NOT_READY_WITH_STUB_CLASSIFIER_custom_reason',
    flags.customLibrary.reason === 'SAFETY_CLASSIFIER_NOT_READY',
    'reason=' + flags.customLibrary.reason);

  // Also verify with a port whose model file DOES exist (configured=true, modelExists=true,
  // runtimeAvailable=false, ready=false) — the most dangerous case: a user dropped a real
  // file at NSFW_MODEL_PATH but no runtime is installed.
  fs.writeFileSync(tmpModel, 'FAKE_MODEL_BYTES');
  try {
    var realFilePort2 = createSafetyClassifierPort({ logger: logger, modelPath: tmpModel });
    t('CUSTOM_NOT_READY_WITH_STUB_CLASSIFIER_realfile_port_configured_true',
      realFilePort2.configured === true, 'configured=' + realFilePort2.configured);
    t('CUSTOM_NOT_READY_WITH_STUB_CLASSIFIER_realfile_modelExists_true',
      realFilePort2.modelExists === true, 'modelExists=' + realFilePort2.modelExists);
    t('CUSTOM_NOT_READY_WITH_STUB_CLASSIFIER_realfile_runtimeAvailable_false',
      realFilePort2.runtimeAvailable === false, 'runtimeAvailable=' + realFilePort2.runtimeAvailable);
    t('CUSTOM_NOT_READY_WITH_STUB_CLASSIFIER_realfile_ready_false',
      realFilePort2.ready === false, 'ready=' + realFilePort2.ready);
    var flagsReal = FV.getFeatureFlags({
      config: { features: {
        customLibraryEnabled: true,
        learningLibraryEnabled: false,
        mqttEnabled: false,
        advancedRenderEnabled: false,
        renderShadowEnabled: false,
        deletePipelineEnabled: false,
      } },
      customLibraryService: { name: 'custom' },
      safetyClassifierPort: realFilePort2,
    });
    t('CUSTOM_NOT_READY_WITH_STUB_CLASSIFIER_realfile_custom_ready_false',
      flagsReal.customLibrary.ready === false, 'ready=' + flagsReal.customLibrary.ready);
    t('CUSTOM_NOT_READY_WITH_STUB_CLASSIFIER_realfile_custom_reason',
      flagsReal.customLibrary.reason === 'SAFETY_CLASSIFIER_NOT_READY',
      'reason=' + flagsReal.customLibrary.reason);
  } finally {
    try { fs.unlinkSync(tmpModel); } catch (e) {}
  }

  // ── LEARNING_SCHEDULER_NOT_STARTED_WITH_STUB_CLASSIFIER ──
  // The learning scheduler must NOT start (and emit zero network requests) when the
  // classifier is not ready. Using the real compose-services gate:
  //   classifierReady: function () { return safetyClassifierPort.ready; }
  // With a stub port (ready=false), start() is a no-op and status=SAFETY_CLASSIFIER_NOT_READY.
  var schedCalls = 0;
  var svc = { ingestAll: function () { schedCalls++; return Promise.resolve([]); } };
  var schedLogs = [];
  var schedLogger = { info: function (m) { schedLogs.push(m); }, warn: function (m) { schedLogs.push(m); }, error: function () {} };
  var stubPortForSched = createSafetyClassifierPort({
    logger: logger,
    modelPath: '/definitely/not/exist/model.onnx',
  });
  t('LEARNING_SCHEDULER_NOT_STARTED_WITH_STUB_CLASSIFIER_port_ready_false',
    stubPortForSched.ready === false, 'port ready=' + stubPortForSched.ready);

  var scheduler = SCHED.createLearningScheduler(svc, { enabled: true, intervalMs: 100000 }, schedLogger, {
    classifierReady: function () { return !!(stubPortForSched && stubPortForSched.ready); },
  });
  scheduler.start();
  t('LEARNING_SCHEDULER_NOT_STARTED_WITH_STUB_CLASSIFIER_no_tick',
    schedCalls === 0, 'ingestAll called ' + schedCalls + ' times (expected 0)');
  var status = scheduler.getStatus();
  t('LEARNING_SCHEDULER_NOT_STARTED_WITH_STUB_CLASSIFIER_status_not_ready',
    status.status === 'SAFETY_CLASSIFIER_NOT_READY', 'status=' + status.status);
  t('LEARNING_SCHEDULER_NOT_STARTED_WITH_STUB_CLASSIFIER_ready_false',
    status.ready === false, 'ready=' + status.ready);
  t('LEARNING_SCHEDULER_NOT_STARTED_WITH_STUB_CLASSIFIER_classifierReady_false',
    status.classifierReady === false, 'classifierReady=' + status.classifierReady);
  t('LEARNING_SCHEDULER_NOT_STARTED_WITH_STUB_CLASSIFIER_logged_not_ready',
    schedLogs.some(function (m) { return m.indexOf('classifier not ready') >= 0; }), 'logged not ready');
  // manual tick still works (does not depend on classifierReady), but start() must not
  // have scheduled any timer-based ticks.
  scheduler.stop();

  // ── CLASSIFIER_NOT_READY_NEVER_REPORTS_READY ──
  // Across every configuration where the classifier is not ready, `ready` MUST be false.
  // There is no path where a port reports ready=true without a real runtime + loaded model
  // + passed smoke inference.
  var anotherModel = path.join(os.tmpdir(), 'p03-never-ready-' + Date.now() + '-' + process.pid + '.onnx');
  fs.writeFileSync(anotherModel, 'FAKE_MODEL_BYTES');
  try {
    var ports = [
      { label: 'no-modelPath', port: createSafetyClassifierPort({ logger: logger }) },
      { label: 'missing-file', port: createSafetyClassifierPort({ logger: logger, modelPath: '/no/such/file.onnx' }) },
      { label: 'existing-file', port: createSafetyClassifierPort({ logger: logger, modelPath: anotherModel }) },
      { label: 'custom-threshold', port: createSafetyClassifierPort({ logger: logger, modelPath: anotherModel, threshold: 0.2 }) },
    ];
    for (var i = 0; i < ports.length; i++) {
      var entry = ports[i];
      // For ports where the model file exists, classify rejects with NO_RUNTIME_AVAILABLE.
      // For ports where the file is missing, classify rejects with CLASSIFIER_NOT_READY.
      // In ALL cases ready must be false.
      if (entry.port.modelExists) {
        var err = null;
        try { await entry.port.classify('/tmp/x.png', { width: 8, height: 8 }); }
        catch (e) { err = e; }
        t('CLASSIFIER_NOT_READY_NEVER_REPORTS_READY_' + entry.label + '_classify_rejects',
          err !== null && err.message === 'NO_RUNTIME_AVAILABLE',
          err ? err.message : 'no error');
      } else {
        var err2 = null;
        try { await entry.port.classify('/tmp/x.png', { width: 8, height: 8 }); }
        catch (e) { err2 = e; }
        t('CLASSIFIER_NOT_READY_NEVER_REPORTS_READY_' + entry.label + '_classify_rejects',
          err2 !== null && err2.message === 'CLASSIFIER_NOT_READY',
          err2 ? err2.message : 'no error');
      }
      t('CLASSIFIER_NOT_READY_NEVER_REPORTS_READY_' + entry.label + '_ready_false',
        entry.port.ready === false, 'ready=' + entry.port.ready);
      t('CLASSIFIER_NOT_READY_NEVER_REPORTS_READY_' + entry.label + '_inferenceReady_false',
        entry.port.inferenceReady === false, 'inferenceReady=' + entry.port.inferenceReady);
      t('CLASSIFIER_NOT_READY_NEVER_REPORTS_READY_' + entry.label + '_loaded_false',
        entry.port.loaded === false, 'loaded=' + entry.port.loaded);
      t('CLASSIFIER_NOT_READY_NEVER_REPORTS_READY_' + entry.label + '_smokeInferencePassed_false',
        entry.port.smokeInferencePassed === false, 'smokeInferencePassed=' + entry.port.smokeInferencePassed);
      t('CLASSIFIER_NOT_READY_NEVER_REPORTS_READY_' + entry.label + '_runtimeAvailable_false',
        entry.port.runtimeAvailable === false, 'runtimeAvailable=' + entry.port.runtimeAvailable);
    }
  } finally {
    try { fs.unlinkSync(anotherModel); } catch (e) {}
  }

  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}

run().catch(function (e) { console.log('CRASH: ' + (e && e.stack || e)); process.exit(1); });
