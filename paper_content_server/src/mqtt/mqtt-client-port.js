// mqtt-client-port.js — Real MQTT client (production) and fake client (testing)
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
  function disconnect() { if (client) { client.end(true); client = null; } }
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
  return { connect: connect, disconnect: disconnect, publish: publish, subscribe: subscribe, isConnected: isConnected };
}

function createFakeMqttClient() {
  var connected = false, subs = {}, published = [], msgHandlers = [];
  return {
    connect: function() { connected = true; return Promise.resolve(); },
    disconnect: function() { connected = false; return Promise.resolve(); },
    publish: function(topic, payload) { published.push({ topic: topic, payload: payload }); if (msgHandlers.length) msgHandlers.forEach(function(h) { h(topic, payload); }); return Promise.resolve(); },
    subscribe: function(topic, handler) { subs[topic] = true; msgHandlers.push(handler); return Promise.resolve(); },
    isConnected: function() { return connected; },
    getPublished: function() { return published; },
    getSubscriptions: function() { return Object.keys(subs); },
    simulateMessage: function(t, p) { msgHandlers.forEach(function(h) { h(t, p); }); },
  };
}

// createMqttClientPort — only creates real client, no fake fallback in production
function createMqttClientPort(config, logger) {
  if (!config || !config.enabled) throw new Error('MQTT disabled');
  return createRealMqttClient(config, logger);
}
module.exports = { createMqttClientPort: createMqttClientPort, createFakeMqttClient: createFakeMqttClient, createRealMqttClient: createRealMqttClient };
