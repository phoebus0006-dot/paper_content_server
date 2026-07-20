#!/usr/bin/env node
var path=require('path');var ROOT=path.join(__dirname,'..','..');var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var FV=require(path.join(ROOT,'src','admin','feature-flag-view'));
var flags=FV.getFeatureFlags({ newsPipeline: { /* mock */ } });
t('FLAGS_EXIST',typeof flags==='object','');
t('NEWS_PIPELINE',flags.newsPipeline.configured===true,'');
t('ADMIN_READONLY',flags.adminReadOnly.enabled===true,'');
t('MQTT_DISABLED',flags.mqtt.enabled===false,'');
console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);
