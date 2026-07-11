#!/usr/bin/env node
// Lane A: Rollback rejection — unsafe asset history cannot be rolled back
var path=require('path'),fs=require('fs'),os=require('os');
var ROOT=path.join(__dirname,'..','..');
var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var SS=require(path.join(ROOT,'src','snapshot','snapshot-store')).SnapshotStore;
var SC=require(path.join(ROOT,'src','snapshot','snapshot-cache')).SnapshotCache;
var PM=require(path.join(ROOT,'src','snapshot','snapshot-model'));
var PH=require(path.join(ROOT,'src','publication','publication-history')).PublicationHistory;
var PS=require(path.join(ROOT,'src','publication','publication-service')).PublicationService;
var PL=require(path.join(ROOT,'src','publication','publication-lock')).PublicationLock;
function mf(){var b=Buffer.alloc(192010);b.write('EPF1',0,'ascii');b.writeUInt16LE(800,4);b.writeUInt16LE(480,6);b[8]=49;b[9]=1;return b;}
var tmp=path.join(os.tmpdir(),'r4_rbrej_'+Date.now());fs.mkdirSync(tmp,{recursive:true});
var lg={info:function(){},warn:function(){},error:function(){}};
async function run(){
  var store=SS(path.join(tmp,'snap'),path.join(tmp,'pub'),lg);await store.ensureDirs();
  var hist=PH(path.join(tmp,'h.json'),lg);
  var pubSvc=PS(store,SC(),null,PL(),{notify:function(){return Promise.resolve();},name:'nop'},null,hist,lg);
  // Publish unsafe snapshot, mark history non-restorable
  var unsafeSnap=PM.createSnapshot('news:unsafe-hist',{mode:'news'},mf(),'news');
  await pubSvc.publish(unsafeSnap);
  var safeSnap=PM.createSnapshot('news:safe',{mode:'news'},mf(),'news');
  await pubSvc.publish(safeSnap);
  // Mark history non-restorable
  await hist.update(unsafeSnap.snapshotId,{restorable:false,invalidReason:'UNSAFE_ASSET_DELETED',invalidatedAt:new Date().toISOString()});
  // Rollback to unsafe should fail
  try{await pubSvc.rollback(unsafeSnap.snapshotId);t('ROLLBACK_TO_UNSAFE_REJECTED',false,'');}
  catch(e){t('ROLLBACK_TO_UNSAFE_REJECTED',e.message.indexOf('not restorable')>=0,e.message);}
  // Active snapshot unchanged
  var active=await pubSvc.getActive();
  t('ACTIVE_UNCHANGED_AFTER_REJECTED_ROLLBACK',active.snapshotId===safeSnap.snapshotId,'');
  try{fs.rmdirSync(tmp,{recursive:true})}catch(e){}
  console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');
  process.exit(ec);
}
run().catch(function(e){console.log('CRASH: '+e.message);try{fs.rmdirSync(tmp,{recursive:true})}catch(e2){}process.exit(1)});
