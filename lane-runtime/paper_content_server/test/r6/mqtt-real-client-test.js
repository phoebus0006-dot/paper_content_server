#!/usr/bin/env node
var path=require('path');var ROOT=path.join(__dirname,'..','..');var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var cp=require(path.join(ROOT,'src','mqtt','mqtt-client-port'));
var fc=cp.createFakeMqttClient();fc.connect().then(function(){t('FAKE_CONNECTS',fc.isConnected(),'');
return fc.publish('t','msg');}).then(function(){var p=fc.getPublished();t('FAKE_PUBLISHES',p.length===1&&p[0].topic==='t','');
fc.disconnect();t('FAKE_DISCONNECTS',!fc.isConnected(),'');
t('REAL_CLIENT_EXISTS',typeof cp.createRealMqttClient==='function','');}).then(function(){console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);}).catch(function(e){t('CRASH',false,e.message);process.exit(1);});
