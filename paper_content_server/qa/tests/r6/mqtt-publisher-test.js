#!/usr/bin/env node
var path=require('path');var ROOT=path.join(__dirname, '..', '..','..');var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var cp=require(path.join(ROOT,'src','mqtt','mqtt-client-port'));
var mc=cp.createFakeMqttClient();
t('CLIENT_EXISTS',typeof mc.connect==='function','');t('DISCONNECTED',!mc.isConnected(),'');
mc.connect().then(function(){t('CONNECTED',mc.isConnected(),'');return mc.publish('t','p');}).then(function(){
  var p=mc.getPublished();t('PUBLISHED',p.length===1&&p[0].topic==='t','');
  mc.disconnect();t('DISCONNECTED_AFTER',!mc.isConnected(),'');
  var fc2=cp.createFakeMqttClient();t('FAKE_CLIENT_WORKS',typeof fc2.connect==='function','');
}).then(function(){console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);}).catch(function(e){t('CRASH',false,e.message);process.exit(1);});
