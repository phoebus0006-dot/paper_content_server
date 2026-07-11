#!/usr/bin/env node
var path=require('path');var ROOT=path.join(__dirname,'..','..');var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var AQS=require(path.join(ROOT,'src','admin','admin-query-service'));
var svc=AQS.createAdminQueryService(
  {readActive:function(){return Promise.resolve({activeSnapshotId:'s1'});},listSnapshots:function(){return Promise.resolve(['s1']);},load:function(id){return Promise.resolve({snapshotId:id});}},
  {list:function(){return Promise.resolve([]);},latest:function(){return Promise.resolve(null);}},
  null,{},{});
svc.getSystemStatus().then(function(s){t('STATUS_RETURNS',s!==null,'');
svc.listPublications().then(function(p){t('PUB_EMPTY',p.length===0,'');
  console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);
});}).catch(function(e){console.log('CRASH: '+e.message);process.exit(1);});
