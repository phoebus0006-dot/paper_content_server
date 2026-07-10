// logger.js — Injectable logger abstraction

function ConsoleLogger() {
  return {
    debug: function(msg) { console.log('[DEBUG] ' + msg); },
    info: function(msg) { console.log('[INFO] ' + msg); },
    warn: function(msg) { console.warn('[WARN] ' + msg); },
    error: function(msg) { console.error('[ERROR] ' + msg); },
  };
}

function SilentLogger() {
  return {
    debug: function() {},
    info: function() {},
    warn: function() {},
    error: function() {},
  };
}

function MemoryLogger() {
  var entries = [];
  return {
    debug: function(msg) { entries.push({ level: 'debug', msg: msg }); },
    info: function(msg) { entries.push({ level: 'info', msg: msg }); },
    warn: function(msg) { entries.push({ level: 'warn', msg: msg }); },
    error: function(msg) { entries.push({ level: 'error', msg: msg }); },
    entries: function() { return entries; },
    clear: function() { entries = []; },
  };
}

module.exports = { ConsoleLogger: ConsoleLogger, SilentLogger: SilentLogger, MemoryLogger: MemoryLogger };
