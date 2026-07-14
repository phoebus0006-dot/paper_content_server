// mqtt-config.js — MQTT configuration with defaults disabled
function loadMqttConfig(env) {
  env = env || process.env;
  var enabled = String(env.MQTT_ENABLED || '').toLowerCase() === 'true';
  return {
    enabled: enabled,
    broker: env.MQTT_BROKER || 'mqtt://localhost:1883',
    deviceId: env.MQTT_DEVICE_ID || env.DEVICE_ID || 'epaper-01',
    username: env.MQTT_USERNAME || '',
    password: env.MQTT_PASSWORD || '',
    tls: String(env.MQTT_TLS || '').toLowerCase() === 'true',
    caPath: env.MQTT_CA_PATH || '',
    topicPrefix: env.MQTT_TOPIC_PREFIX || 'epaper',
    willTopic: env.MQTT_WILL_TOPIC || '',
    willMessage: env.MQTT_WILL_MESSAGE || 'offline',
    reconnectDelayMs: Number(env.MQTT_RECONNECT_DELAY_MS) || 5000,
    maxReconnectAttempts: Number(env.MQTT_MAX_RECONNECT_ATTEMPTS) || 0,
  };
}
module.exports = { loadMqttConfig: loadMqttConfig };
