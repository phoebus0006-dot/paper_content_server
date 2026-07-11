// mqtt-client-port.js — MQTT client port interface (fake implementation for testing)
function createFakeMqttClient() {
  var connected = false, subs = {}, published = [];
  return {
    connect: function() { connected = true; return Promise.resolve(); },
    disconnect: function() { connected = false; return Promise.resolve(); },
    publish: function(topic, payload) { published.push({ topic: topic, payload: payload }); return Promise.resolve(); },
    subscribe: function(topic, handler) { subs[topic] = handler; return Promise.resolve(); },
    isConnected: function() { return connected; },
    getPublished: function() { return published; },
    getSubscriptions: function() { return Object.keys(subs); },
  };
}
function createMqttClientPort(config) {
  if (!config || !config.enabled) return null;
  return createFakeMqttClient();
}
module.exports = { createMqttClientPort: createMqttClientPort, createFakeMqttClient: createFakeMqttClient };
