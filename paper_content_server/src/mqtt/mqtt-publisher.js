// mqtt-publisher.js — Publish snapshot notifications via MQTT
var { createPublicationMessage } = require('./mqtt-message');
var { publicationTopic } = require('./mqtt-topic');
function createMqttPublisher(client, config, logger) {
  logger = logger || {};
  function publishSnapshot(snapshotId, frameId, frameSha256) {
    if (!client || !config.enabled) return Promise.resolve('MQTT_DISABLED');
    var msg = createPublicationMessage(config.deviceId, snapshotId, frameId, frameSha256);
    return client.publish(publicationTopic(config.deviceId), JSON.stringify(msg));
  }
  return { publishSnapshot: publishSnapshot };
}
module.exports = { createMqttPublisher: createMqttPublisher };
