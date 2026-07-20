#!/usr/bin/env node
var path=require('path');var ROOT=path.join(__dirname,'..','..');var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var cfg=require(path.join(ROOT,'src','mqtt','mqtt-config'));
var c=cfg.loadMqttConfig({MQTT_ENABLED:'true',MQTT_BROKER:'mqtt://test:1883',MQTT_DEVICE_ID:'test-dev'});
t('DEFAULT_ENABLED',c.enabled===true,'');t('BROKER',c.broker==='mqtt://test:1883','');t('DEVICE_ID',c.deviceId==='test-dev','');
var c2=cfg.loadMqttConfig({});t('DISABLED_BY_DEFAULT',c2.enabled===false,'');t('DEFAULT_BROKER',c2.broker==='mqtt://localhost:1883','');
console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);
