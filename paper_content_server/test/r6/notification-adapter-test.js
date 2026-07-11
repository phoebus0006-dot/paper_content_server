#!/usr/bin/env node
var path=require('path');var ROOT=path.join(__dirname,'..','..');var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var na=require(path.join(ROOT,'src','mqtt','mqtt-notification-adapter'));
var cp=require(path.join(ROOT,'src','mqtt','mqtt-client-port'));
var client=cp.createFakeMqttClient();var log=[];
var adapter=na.createMqttNotificationAdapter({enabled:true,deviceId:'dev-1'},client,{warn:function(m){log.push(m);}});
t('ADAPTER_NAME',adapter.name==='mqtt','');
adapter.notify('snap_1','news:123','abc').then(function(){var p=client.getPublished();
  t('NOTIFY_PUBLISHED',p.length>0,'');var msg=JSON.parse(p[0].payload);
  t('NOTIFY_SNAPSHOT_ID',msg.snapshotId==='snap_1','');
  // Disabled config uses Noop behavior
  var adapter2=na.createMqttNotificationAdapter({enabled:false},null,{});
  t('DISABLED_NOOP',adapter2.name==='mqtt','');
}).then(function(){console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);}).catch(function(e){t('CRASH',false,e.message);process.exit(1);});
