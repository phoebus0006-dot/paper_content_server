#!/usr/bin/env node
var path=require('path');var ROOT=path.join(__dirname, '..', '..','..');var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var cp=require(path.join(ROOT,'src','mqtt','mqtt-client-port'));
var NA=require(path.join(ROOT,'src','mqtt','mqtt-notification-adapter'));
var fc=cp.createFakeMqttClient();
var log=[];
var adapter=NA.createMqttNotificationAdapter({enabled:true,deviceId:'dev-1'},fc,{warn:function(m){log.push(m);}});
t('ADAPTER_NAME',adapter.name==='mqtt','');
adapter.notify({snapshotId:'snap_1',frameId:'news:123',frameSha256:'abc',publishedAt:new Date().toISOString()}).then(function(){
  var p=fc.getPublished();t('NOTIFY_PUBLISHED',p.length>0,'');
  var msg=JSON.parse(p[0].payload);t('NOTIFY_SNAPSHOT_ID',msg.snapshotId==='snap_1','');
  var adapter2=NA.createMqttNotificationAdapter({enabled:false},null,{});
  t('DISABLED_NOOP',adapter2.name==='mqtt','');
}).then(function(){console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);}).catch(function(e){t('CRASH',false,e.message);process.exit(1);});
