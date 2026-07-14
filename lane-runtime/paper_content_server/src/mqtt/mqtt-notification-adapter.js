// mqtt-notification-adapter.js — MQTT-backed NotificationPort (object contract)
var { createMqttPublisher } = require('./mqtt-publisher');
function createMqttNotificationAdapter(config, client, logger) {
  logger = logger || {};
  var publisher = createMqttPublisher(client, config, logger);
  return {
    notify: function(msg) {
      if (!msg || !msg.snapshotId) return Promise.resolve();
      if (!config.enabled) return Promise.resolve();
      return publisher.publishSnapshot(msg.snapshotId, msg.frameId, msg.frameSha256, msg.reason);
    },
    name: 'mqtt',
  };
}
module.exports = { createMqttNotificationAdapter: createMqttNotificationAdapter };
