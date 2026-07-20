// mqtt-client-port-test.js — focused unit tests for the disconnect port and
// the module's own fake client. Complements test/app/graceful-shutdown-test.js
// (which tests the port via inline fakes through bootstrap). Here we exercise
// createMqttClientPort against createFakeMqttClient() and the polymorphic
// dispatch (client → adapter, config → real client, null → noop).
var path = require('path');
var ROOT = path.join(__dirname, '..', '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

var cp = require(path.join(ROOT, 'src', 'mqtt', 'mqtt-client-port'));

async function run() {
  // PORT_OVER_FAKE_CLIENT_DISCONNECTS — port wraps the module's fake client and
  // resolves once end(cb) fires; the fake is left disconnected afterwards.
  var fc = cp.createFakeMqttClient();
  await fc.connect();
  t('FAKE_CONNECTED_BEFORE', fc.isConnected());
  var port = cp.createMqttClientPort(fc);
  var p = port.disconnect();
  t('PORT_OVER_FAKE_RETURNS_PROMISE', p && typeof p.then === 'function');
  await p;
  t('PORT_OVER_FAKE_DISCONNECTED', !fc.isConnected());

  // PORT_POLYMORPHIC_NULL_NOOP — createMqttClientPort(null) yields a noop port.
  var noopPort = cp.createMqttClientPort(null);
  var noopOk = true;
  try { await noopPort.disconnect(); } catch(e) { noopOk = false; }
  t('PORT_POLYMORPHIC_NULL_NOOP', noopOk);

  // PORT_POLYMORPHIC_CONFIG_CREATES_REAL — a config object (no .end) routes to
  // createRealMqttClient; a disabled config throws MQTT disabled.
  var realFromConfig = cp.createMqttClientPort({ enabled: true, broker: 'mqtt://localhost:1', deviceId: 'd' });
  t('PORT_POLYMORPHIC_CONFIG_REAL', typeof realFromConfig.connect === 'function' && typeof realFromConfig.end === 'function');
  var threwDisabled = false;
  try { cp.createMqttClientPort({ enabled: false }); } catch(e) { threwDisabled = /disabled/i.test(e.message); }
  t('PORT_POLYMORPHIC_DISABLED_THROWS', threwDisabled);

  // REAL_CLIENT_END_DELEGATES — createRealMqttClient().end(cb) resolves its
  // callback even when never connected (no-op close path).
  var rc = cp.createRealMqttClient({ enabled: true, broker: 'mqtt://localhost:1', deviceId: 'd' }, {});
  var endOk = await new Promise(function(resolve) {
    rc.end(function(err) { resolve(!err); });
  });
  t('REAL_CLIENT_END_NOOP_WHEN_UNCONNECTED', endOk);

  // REAL_CLIENT_DISCONNECT_RETURNS_PROMISE — disconnect() returns a Promise.
  var rc2 = cp.createRealMqttClient({ enabled: true, broker: 'mqtt://localhost:1', deviceId: 'd2' }, {});
  var dp = rc2.disconnect();
  t('REAL_CLIENT_DISCONNECT_RETURNS_PROMISE', dp && typeof dp.then === 'function');
  await dp;

  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}

run().catch(function(e) { console.error('CRASH', e && e.stack || e); process.exit(1); });
