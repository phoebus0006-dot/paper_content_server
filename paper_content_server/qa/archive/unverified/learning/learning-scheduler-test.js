#!/usr/bin/env node
// learning-scheduler-test.js — start/stop, concurrency guard, flag-off, getStatus
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

var SCHED = require(path.join(ROOT, 'src', 'learning', 'learning-scheduler'));

(async function() {
  // --- Flag off: disabled scheduler does not start ---
  var calls = 0;
  var svc = { ingestAll: function() { calls++; return Promise.resolve([]); } };
  var logs = [];
  var logger = { info: function(m) { logs.push(m); }, error: function() {} };
  var s = SCHED.createLearningScheduler(svc, { enabled: false, intervalMs: 50 }, logger);
  s.start();
  t('FLAG_OFF_NO_TICK', calls === 0, 'ingestAll not called');
  t('FLAG_OFF_STATUS_ENABLED_FALSE', s.getStatus().enabled === false, '');
  t('FLAG_OFF_STATUS_RUNNING_FALSE', s.getStatus().running === false, '');
  t('FLAG_OFF_LOGGED_DISABLED', logs.some(function(m) { return m.indexOf('disabled') >= 0; }), 'logged disabled');

  // --- start/stop and getStatus ---
  var calls2 = 0;
  var svc2 = { ingestAll: function() { calls2++; return Promise.resolve([{ ok: 1 }]); } };
  var s2 = SCHED.createLearningScheduler(svc2, { enabled: true, intervalMs: 100000 }, {});
  t('BEFORE_START_NOT_RUNNING', s2.getStatus().running === false, '');
  s2.start();
  t('STARTED_ENABLED', s2.getStatus().enabled === true, '');
  t('STARTED_INTERVAL', s2.getStatus().intervalMs === 100000, '');
  // manual tick
  await s2.tick();
  t('TICK_RAN_INGEST', calls2 === 1, 'ingestAll called once');
  t('TICK_LAST_RUN_AT_SET', s2.getStatus().lastRunAt !== null, '');
  t('TICK_NOT_RUNNING_AFTER', s2.getStatus().running === false, '');
  s2.stop();
  // after stop, timer cleared; manual tick still works
  calls2 = 0;
  await s2.tick();
  t('TICK_AFTER_STOP_STILL_WORKS', calls2 === 1, 'tick works even after stop (manual)');

  // --- Concurrency guard: previous run still active -> skip ---
  var calls3 = 0;
  var resolveFirst;
  var svc3 = {
    ingestAll: function() {
      calls3++;
      return new Promise(function(resolve) { resolveFirst = resolve; });
    },
  };
  var logs3 = [];
  var logger3 = { info: function(m) { logs3.push(m); }, error: function() {} };
  var s3 = SCHED.createLearningScheduler(svc3, { enabled: true, intervalMs: 100000 }, logger3);
  // first tick starts running (hangs on promise)
  s3.tick();
  t('CONCURRENT_FIRST_RUNNING', s3.getStatus().running === true, '');
  t('CONCURRENT_FIRST_CALL_COUNT', calls3 === 1, '');
  // second tick while running -> skipped
  s3.tick();
  t('CONCURRENT_SKIP_SECOND', calls3 === 1, 'second tick skipped');
  t('CONCURRENT_LOG_SKIP', logs3.some(function(m) { return m.indexOf('previous run still active') >= 0; }), 'logged skip');
  // resolve first run
  resolveFirst([{ ok: 1 }]);
  // let microtask drain
  await new Promise(function(r) { setTimeout(r, 10); });
  t('CONCURRENT_DONE_RUNNING_FALSE', s3.getStatus().running === false, '');
  t('CONCURRENT_LAST_RUN_AT', s3.getStatus().lastRunAt !== null, '');

  // --- ingestAll rejection: error path ---
  var svc4 = { ingestAll: function() { return Promise.reject(new Error('boom')); } };
  var errs4 = [];
  var logger4 = { info: function() {}, error: function(m) { errs4.push(m); } };
  var s4 = SCHED.createLearningScheduler(svc4, { enabled: true, intervalMs: 100000 }, logger4);
  // tick() is fire-and-forget; allow the internal promise to settle before asserting
  s4.tick();
  await new Promise(function(r) { setTimeout(r, 20); });
  t('ERROR_NOT_RUNNING', s4.getStatus().running === false, '');
  t('ERROR_LAST_RUN_AT_SET', s4.getStatus().lastRunAt !== null, '');
  t('ERROR_LOGGED', errs4.some(function(m) { return m.indexOf('failed') >= 0; }), 'logged failure');

  // --- start() idempotency: calling start twice doesn't create two timers ---
  var svc5 = { ingestAll: function() { return Promise.resolve([]); } };
  var s5 = SCHED.createLearningScheduler(svc5, { enabled: true, intervalMs: 50000 }, {});
  s5.start();
  s5.start(); // should be a no-op (guard)
  t('START_IDEMPOTENT', s5.getStatus().enabled === true, '');
  s5.stop();
  t('STOP_CLEAN', s5.getStatus().running === false, '');

  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
})();
