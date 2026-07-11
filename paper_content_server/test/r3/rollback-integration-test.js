#!/usr/bin/env node
// R3 test: rollback with integrity validation and byte-for-byte recovery
var path=require('path'),fs=require('fs'),os=require('os'),crypto=require('crypto');
var ROOT=path.join(__dirname,'..','..');
var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
function mf(s){var b=Buffer.alloc(s||16,0xAA);b.write('EPF1',0,'ascii');return b;}
var sm=require(path.join(ROOT,'src','snapshot','snapshot-model'));
var SS=require(path.join(ROOT,'src','snapshot','snapshot-store')).SnapshotStore;
var SC=require(path.join(ROOT,'src','snapshot','snapshot-cache')).SnapshotCache;
var PS=require(path.join(ROOT,'src','snapshot','pin-store')).PinStore;
var PL=require(path.join(ROOT,'src','publication','publication-lock')).PublicationLock;
var PH=require(path.join(ROOT,'src','publication','publication-history')).PublicationHistory;
var PubSvc=require(path.join(ROOT,'src','publication','publication-service')).PublicationService;
var tmp=path.join(os.tmpdir(),'r3_roll_int_'+Date.now());fs.mkdirSync(tmp,{recursive:true});
var lg={info:function(){},warn:function(){},error:function(){}};

async function run(){
  var store=SS(path.join(tmp,'snap'),path.join(tmp,'pub'),lg);await store.ensureDirs();
  var notif={notify:function(){return Promise.resolve();},name:'nop'};
  var hist=PH(path.join(tmp,'h.json'),lg);
  var svc=PubSvc(store,SC(),PS(),PL(),notif,null,hist,lg);
  // Publish original
  var frame1=mf(192010);frame1.write('ORIG',5,'ascii'); // mark original, keep EPF1 at offset 0
  var snap1=sm.createSnapshot('news:original',{mode:'news'},frame1,'news');
  await svc.publish(snap1);
  // Publish updated
  var frame2=mf(192010);frame2.write('UPDT',5,'ascii');
  var snap2=sm.createSnapshot('news:updated',{mode:'news'},frame2,'news');
  await svc.publish(snap2);
  // Rollback to original
  await svc.rollback(snap1.snapshotId);
  var active=await svc.getActive();
  t('ROLLBACK_SNAPSHOTID',active.snapshotId===snap1.snapshotId,'');
  t('ROLLBACK_FRAME_SHA256',active.frameSha256===snap1.frameSha256,'');
  t('ROLLBACK_BYTES_MARKER',active.frame.slice(5,9).toString()==='ORIG','');
  // Rollback to non-existent
  try{await svc.rollback('nonexistent');t('ROLLBACK_NONEXISTENT',false,'');}
  catch(e){t('ROLLBACK_NONEXISTENT_THROWS',true,'');}
  // History has rollback entry
  var entries=await hist.list();
  t('HISTORY_ROLLBACK',entries[0].type==='rollback','');
  t('HISTORY_ROLLBACK_TARGET',entries[0].snapshotId===snap1.snapshotId,'');
  // Load from store also matches
  var loaded=await store.load(snap1.snapshotId);
  t('STORE_LOAD_INTEGRITY',loaded!==null&&loaded.frameSha256===snap1.frameSha256,'');
  console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');
  try{fs.rmdirSync(tmp,{recursive:true})}catch(e){}
  process.exit(ec);
}
run().catch(function(e){console.log('CRASH: '+e.message);try{fs.rmdirSync(tmp,{recursive:true})}catch(e2){}process.exit(1)});
