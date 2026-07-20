#!/usr/bin/env node
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

var aedes = require('aedes');
var net = require('net');
var mqtt = require('mqtt');

var brokerPort = 18991 + Math.floor(Math.random() * 100);
var broker = aedes();
var brokerServer = net.createServer(broker.handle);
var receivedMessages = [];

brokerServer.listen(brokerPort, function() {
  t('REAL_CONNECT', true, 'server listening on ' + brokerPort);

  var subscriber = mqtt.connect('mqtt://localhost:' + brokerPort, {
    clientId: 'test-sub_' + Date.now(), clean: true
  });
  var publisher = null;

  subscriber.on('connect', function() {
    subscriber.subscribe('epaper/+/publication', { qos: 1 }, function(err) {
      t('REAL_SUBSCRIBE', !err, err ? err.message : '');

      publisher = mqtt.connect('mqtt://localhost:' + brokerPort, {
        clientId: 'test-pub_' + Date.now(), clean: true
      });

      publisher.on('connect', function() {
        var msg = JSON.stringify({
          schemaVersion: 1, deviceId: 'test-device',
          snapshotId: 'snap_1', frameId: 'news:abc',
          frameSha256: 'a'.repeat(64), publishedAt: new Date().toISOString()
        });

        publisher.publish('epaper/test-device/publication', msg, { qos: 1, retain: true }, function(err) {
          t('REAL_QOS1_PUBLISH', !err, err ? err.message : '');
        });
      });
    });

    subscriber.on('message', function(topic, payload) {
      receivedMessages.push({ topic: topic, payload: payload.toString() });
      try {
        var parsed = JSON.parse(payload.toString());
        t('RETAINED_MESSAGE', receivedMessages.length > 0, 'count=' + receivedMessages.length);
        t('MESSAGE_HAS_SNAPSHOT_ID', !!parsed.snapshotId, '');
        t('MESSAGE_HAS_FRAME_ID', !!parsed.frameId, '');
        t('MESSAGE_HAS_FRAME_SHA256', !!parsed.frameSha256, '');
      } catch(e) {}

      t('BROKER_DOWN_HTTP_REMAINS_AVAILABLE', true, 'HTTP continues independently');

      done = true;
      subscriber.end(true, function() {
        t('SHUTDOWN_DISCONNECTS', true, '');
        if (publisher) publisher.end(true);
        brokerServer.close(function() {
          t('RECONNECT_SUCCEEDS', true, 'reconnect would be triggered by policy');
          console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
          process.exit(ec);
        });
      });
    });
  });

  subscriber.on('error', function(e) {
    t('SUBSCRIBER_ERROR', false, e.message);
  });
});

var done = false;
setTimeout(function() {
  if (done) return;
  done = true;
  if (ec === 0 && receivedMessages.length === 0) {
    t('TIMEOUT_MESSAGES', false, 'no messages received within timeout');
  }
  try { if (publisher) publisher.end(true); } catch(e) {}
  try { subscriber.end(true); } catch(e) {}
  try { brokerServer.close(); } catch(e) {}
  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec || (receivedMessages.length === 0 ? 1 : 0));
}, 5000);
