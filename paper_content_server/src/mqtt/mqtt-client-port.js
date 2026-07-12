// mqtt-client-port.js — MQTT client port: real client, fake client, and a
// thin disconnect adapter that turns client.end(callback) into a Promise.
//
// Exports:
//   createRealMqttClient(config, logger) — production client (connect/end/publish/subscribe)
//   createFakeMqttClient()               — in-memory fake for tests
//   createDisconnectPort(client)         — thin adapter: { disconnect } returning a Promise
//   createMqttClientPort(arg, logger)    — polymorphic:
//        * arg has .end  → thin disconnect adapter { disconnect } (Promise, idempotent)
//        * arg is null    → no-op port { disconnect: () => Promise.resolve() }
//        * arg is config  → createRealMqttClient(config, logger)   [server.js path]

function createRealMqttClient(config, logger) {
  logger = logger || {};
  var client = null;
  function connect() {
    try {
      var mqtt = require('mqtt');
      var opts = { clientId: config.deviceId + '_' + Date.now(), clean: true };
      if (config.username) opts.username = config.username;
      if (config.password) opts.password = config.password;
      if (config.tls) { opts.protocol = 'mqtts'; if (config.caPath) opts.ca = require('fs').readFileSync(config.caPath); }
      return new Promise(function(resolve, reject) {
        client = mqtt.connect(config.broker, opts);
        client.on('connect', function() { logger.info && logger.info('MQTT connected'); resolve(); });
        client.on('error', function(e) { logger.error && logger.error('MQTT error: ' + e.message); });
        client.on('close', function() { logger.warn && logger.warn('MQTT disconnected'); });
        client.on('offline', function() { logger.warn && logger.warn('MQTT offline'); });
        setTimeout(function() { if (!client || !client.connected) reject(new Error('MQTT connect timeout')); }, 10000);
      });
    } catch(e) { return Promise.reject(new Error('MQTT client unavailable: ' + e.message)); }
  }
  // end([force], [opts], [callback]) — mqtt.js-compatible. Defaults force=true
  // for shutdown (matches prior client.end(true) behaviour). The callback is
  // invoked once the underlying client has actually closed, so a Promise
  // wrapping end(cb) truly awaits the broker teardown.
  function end(force, opts, cb) {
    if (typeof force === 'function') { cb = force; force = true; }
    else if (typeof opts === 'function') { cb = opts; }
    force = (force === undefined) ? true : !!force;
    if (!client) { if (cb) setImmediate(function() { cb(); }); return; }
    var inner = client;
    client = null;
    if (cb) inner.end(force, cb); else inner.end(force);
  }
  function disconnect() {
    return new Promise(function(resolve, reject) {
      end(function(err) { if (err) reject(err); else resolve(); });
    });
  }
  function publish(topic, payload) {
    if (!client || !client.connected) return Promise.reject(new Error('MQTT not connected'));
    return new Promise(function(resolve, reject) {
      client.publish(topic, payload, { qos: 1, retain: true }, function(err) { if (err) reject(err); else resolve(); });
    });
  }
  function subscribe(topic, handler) {
    if (!client) return Promise.reject(new Error('MQTT not connected'));
    return new Promise(function(resolve) { client.subscribe(topic, function() { client.on('message', handler); resolve(); }); });
  }
  function isConnected() { return client && client.connected; }
  return { connect: connect, disconnect: disconnect, end: end, publish: publish, subscribe: subscribe, isConnected: isConnected };
}

function createFakeMqttClient() {
  var connected = false, subs = {}, published = [], msgHandlers = [];
  function end(cb) {
    connected = false;
    if (cb) setImmediate(function() { cb(); });
  }
  return {
    connect: function() { connected = true; return Promise.resolve(); },
    disconnect: function() {
      return new Promise(function(resolve, reject) {
        end(function(err) { if (err) reject(err); else resolve(); });
      });
    },
    end: end,
    publish: function(topic, payload) { published.push({ topic: topic, payload: payload }); if (msgHandlers.length) msgHandlers.forEach(function(h) { h(topic, payload); }); return Promise.resolve(); },
    subscribe: function(topic, handler) { subs[topic] = true; msgHandlers.push(handler); return Promise.resolve(); },
    isConnected: function() { return connected; },
    getPublished: function() { return published; },
    getSubscriptions: function() { return Object.keys(subs); },
    simulateMessage: function(t, p) { msgHandlers.forEach(function(h) { h(t, p); }); },
  };
}

// Thin disconnect adapter: wraps any client exposing end(callback) and returns
// a { disconnect } port whose disconnect():
//   - returns a Promise that resolves after the client.end callback fires
//   - resolves immediately if end takes no callback (sync) and returns no Promise
//   - rejects if the callback receives an error
//   - is idempotent: the second call returns the SAME Promise (no double end)
function createDisconnectPort(client) {
  var pending = null;
  function disconnect() {
    if (pending) return pending;
    pending = new Promise(function(resolve, reject) {
      if (!client || typeof client.end !== 'function') { resolve(); return; }
      var settled = false;
      function done(err) {
        if (settled) return;
        settled = true;
        if (err) reject(err); else resolve();
      }
      try {
        if (client.end.length >= 1) {
          client.end(done);
        } else {
          var result = client.end();
          if (result && typeof result.then === 'function') {
            result.then(function() { done(); }, done);
          } else {
            done();
          }
        }
      } catch (error) {
        done(error);
      }
    });
    return pending;
  }
  return { disconnect: disconnect };
}

function createMqttClientPort(arg, logger) {
  if (!arg) return { disconnect: function() { return Promise.resolve(); } };
  // A client object (real or fake) exposes end(); a config object does not.
  if (typeof arg.end === 'function') return createDisconnectPort(arg);
  // Backward-compatible path used by server.js: createMqttClientPort(mqttConfig, logger)
  // Preserve the prior fail-fast guard for disabled configs.
  if (!arg.enabled) throw new Error('MQTT disabled');
  return createRealMqttClient(arg, logger);
}

module.exports = {
  createMqttClientPort: createMqttClientPort,
  createDisconnectPort: createDisconnectPort,
  createFakeMqttClient: createFakeMqttClient,
  createRealMqttClient: createRealMqttClient,
};
