// notification-port.js — Notification port interface
// NoopNotificationPort: used when no external notification mechanism is configured.
// MQTT, WebSocket, and other notification ports are NOT_IMPLEMENTED.

function NoopNotificationPort() {
  return {
    notify: function(snapshotId) {
      return Promise.resolve();
    },
    name: 'noop',
  };
}

module.exports = { NoopNotificationPort: NoopNotificationPort };
