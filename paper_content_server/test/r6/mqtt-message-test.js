#!/usr/bin/env node
var path=require('path');var ROOT=path.join(__dirname,'..','..');var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var msg=require(path.join(ROOT,'src','mqtt','mqtt-message'));
var m=msg.createPublicationMessage('dev-1','snap_1','news:123','abc123');
t('SCHEMA_VERSION',m.schemaVersion===1,'');t('DEVICE_ID',m.deviceId==='dev-1','');
t('SNAPSHOT_ID',m.snapshotId==='snap_1','');t('FRAME_ID',m.frameId==='news:123','');
t('FRAME_SHA',m.frameSha256==='abc123','');t('PUBLISHED_AT',!!m.publishedAt,'');
t('VALID',msg.validateMessage(m),'');t('INVALID_NULL',!msg.validateMessage(null),'');
t('INVALID_NO_SNAPSHOT',!msg.validateMessage({schemaVersion:1,frameId:'x'}),'');
t('NO_FRAME_BYTES',!m.hasOwnProperty('frame'),'');
console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);
