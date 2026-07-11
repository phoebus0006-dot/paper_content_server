// mqtt-notification-adapter.js — R3 NotificationPort backed by MQTT
var { createMqttPublisher } = require('./mqtt-publisher');
function createMqttNotificationAdapter(config, client, logger) {
  logger = logger || {};
  var publisher = createMqttPublisher(client, config, logger);
  return {
    notify: function(snapshotId, frameId, frameSha256) {
      if (!config.enabled) return Promise.resolve();
      return publisher.publishSnapshot(snapshotId, frameId, frameSha256);
    },
    name: 'mqtt',
  };
}
module.exports = { createMqttNotificationAdapter: createMqttNotificationAdapter };
