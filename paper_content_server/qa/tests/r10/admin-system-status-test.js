#!/usr/bin/env node
var path=require('path');var ROOT=path.join(__dirname, '..', '..','..');var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var AQS=require(path.join(ROOT,'src','admin','admin-query-service'));
var svc=AQS.createAdminQueryService(
  {readActive:function(){return Promise.resolve({activeSnapshotId:'snap_1'});},listSnapshots:function(){return Promise.resolve(['snap_1']);},load:function(id){return Promise.resolve({snapshotId:id,frameId:'news:a',mode:'news',createdAt:'2026-01-01T00:00:00Z',frameSha256:'abc',frameLength:192010});}},
  {list:function(){return Promise.resolve([{publishedAt:'2026-01-01T00:00:00Z'}]);},latest:function(){return Promise.resolve({publishedAt:'2026-01-01T00:00:00Z'});}},
  null,{},{});
svc.getSystemStatus().then(function(s){
  t('STATUS_HAS_SNAPSHOT_ID',s.activeSnapshotId==='snap_1','');
  t('STATUS_HAS_LAST_PUB',s.lastPublicationAt==='2026-01-01T00:00:00Z','');
  t('STATUS_HAS_SNAPSHOT_COUNT',s.snapshotCount===1,'');
  console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);
}).catch(function(e){console.log('CRASH: '+e.message);process.exit(1);});
