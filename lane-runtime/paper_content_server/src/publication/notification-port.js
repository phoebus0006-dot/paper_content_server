// notification-port.js — Notification port interface
function NoopNotificationPort() {
  return { notify: function(msg) { return Promise.resolve(); }, name: 'noop' };
}
module.exports = { NoopNotificationPort: NoopNotificationPort };
