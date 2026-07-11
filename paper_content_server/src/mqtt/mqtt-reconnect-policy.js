// mqtt-reconnect-policy.js — Reconnect with backoff
function createReconnectPolicy(config) {
  var delay = config.reconnectDelayMs || 5000;
  var maxAttempts = config.maxReconnectAttempts || 0;
  var attempts = 0;
  function nextDelay() { attempts++; return Math.min(delay * Math.pow(1.5, attempts - 1), 60000); }
  function canRetry() { return maxAttempts === 0 || attempts < maxAttempts; }
  function reset() { attempts = 0; }
  return { nextDelay: nextDelay, canRetry: canRetry, reset: reset, attempts: function() { return attempts; } };
}
module.exports = { createReconnectPolicy: createReconnectPolicy };
