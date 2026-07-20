#!/usr/bin/env node
var path=require('path');var ROOT=path.join(__dirname, '..', '..','..');var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var cp=require(path.join(ROOT,'src','mqtt','mqtt-client-port'));
var NA=require(path.join(ROOT,'src','mqtt','mqtt-notification-adapter'));
var fc=cp.createFakeMqttClient();
var adapter=NA.createMqttNotificationAdapter({enabled:true,deviceId:'dev-1'},fc,{});
adapter.notify({snapshotId:'snap_1',frameId:'news:1',frameSha256:'abc123',publishedAt:new Date().toISOString()}).then(function(){
var p=fc.getPublished();t('INTEGRATION_PUBLISHED',p.length>0,'');
var msg=JSON.parse(p[0].payload);t('INTEGRATION_SNAPSHOT_ID',msg.snapshotId==='snap_1','');
t('INTEGRATION_FRAME_ID',msg.frameId==='news:1','');t('INTEGRATION_FRAME_SHA',msg.frameSha256==='abc123','');
t('INTEGRATION_NO_FRAME_BYTES',!msg.hasOwnProperty('frame'),'');}).then(function(){console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);}).catch(function(e){t('CRASH',false,e.message);process.exit(1);});
