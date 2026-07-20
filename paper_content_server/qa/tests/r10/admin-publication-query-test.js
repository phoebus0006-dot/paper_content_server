#!/usr/bin/env node
var path=require('path');var ROOT=path.join(__dirname, '..', '..','..');var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var AQS=require(path.join(ROOT,'src','admin','admin-query-service'));
var hist={list:function(){return Promise.resolve([{snapshotId:'s1',frameId:'f1',publishedAt:'2026-01-01T00:00:00Z'}]);},latest:function(){return Promise.resolve({publishedAt:'2026-01-01T00:00:00Z'});}};
var store={load:function(id){if(id==='s1')return Promise.resolve({snapshotId:'s1',frameId:'f1',mode:'news',createdAt:'2026-01-01T00:00:00Z',frameSha256:'abc',frameLength:192010});return Promise.reject(new Error('not found'));}};
var svc=AQS.createAdminQueryService(store,hist,null,{},{});
svc.listPublications().then(function(pubs){t('PUB_LIST',pubs.length===1,'');
return svc.getPublication('s1');}).then(function(pub){
  t('PUB_SNAPSHOT_ID',pub.snapshotId==='s1','');
  t('PUB_FRAME_ID',pub.frameId==='f1','');
  return svc.getPublication('bad');}).then(function(pub2){
  t('PUB_INTEGRITY_ERROR',pub2.integrityError===true,'');
  console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);
}).catch(function(e){console.log('CRASH: '+e.message);process.exit(1);});
