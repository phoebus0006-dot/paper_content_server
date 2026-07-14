#!/usr/bin/env node
// R3.3b: NoopNotificationPort — noop notification interface

var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}

var NoopNotificationPort = require(path.join(ROOT, 'src', 'publication', 'notification-port')).NoopNotificationPort;

var port = NoopNotificationPort();
t('PORT_EXISTS', typeof port.notify === 'function', '');
t('PORT_NAME', port.name === 'noop', '');

// Notify returns a resolved promise
port.notify('snap_test_123').then(function() {
  t('NOTIFY_RESOLVES', true, '');
}).catch(function() {
  t('NOTIFY_RESOLVES', false, 'NOOP should never reject');
}).then(function() {
  // Multiple calls
  return Promise.all([
    port.notify('a'),
    port.notify('b'),
    port.notify('c'),
  ]);
}).then(function() {
  t('NOTIFY_MULTIPLE', true, '');

  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}).catch(function(err) {
  console.log('CRASH: ' + err.message);
  process.exit(1);
});
