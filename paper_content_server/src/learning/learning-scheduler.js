// learning-scheduler.js — Learning library ingestion scheduler
function createLearningScheduler(ingestionService, config, logger) {
  config = config || {};
  logger = logger || {};
  var intervalMs = config.intervalMs || 3600000; // 默认 1 小时
  var enabled = config.enabled || false;  // 默认 false
  var timer = null;
  var running = false;
  var lastRunAt = null;
  var lastResult = null;

  function start() {
    if (!enabled) { logger.info && logger.info('LearningScheduler: disabled, not starting'); return; }
    if (timer) return;  // 防并发:已运行
    timer = setInterval(tick, intervalMs);
    logger.info && logger.info('LearningScheduler: started, interval=' + intervalMs + 'ms');
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  function tick() {
    if (running) { logger.info && logger.info('LearningScheduler: previous run still active, skipping'); return; }
    running = true;
    ingestionService.ingestAll().then(function(results) {
      lastRunAt = new Date().toISOString();
      lastResult = results;
      running = false;
      logger.info && logger.info('LearningScheduler: completed, ' + results.length + ' candidates');
    }).catch(function(e) {
      lastRunAt = new Date().toISOString();
      lastResult = { error: e.message };
      running = false;
      logger.error && logger.error('LearningScheduler: failed: ' + e.message);
    });
  }

  function getStatus() {
    return { enabled: enabled, running: running, lastRunAt: lastRunAt, intervalMs: intervalMs };
  }

  return { start: start, stop: stop, tick: tick, getStatus: getStatus };
}

module.exports = { createLearningScheduler: createLearningScheduler };
