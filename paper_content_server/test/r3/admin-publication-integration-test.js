#!/usr/bin/env node
// R3 test: admin publish and rollback integration via simulated routes
var path=require('path'),fs=require('fs'),os=require('os'),crypto=require('crypto');
var ROOT=path.join(__dirname,'..','..');
var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
function mf(){var b=Buffer.alloc(192010);b.write('EPF1',0,'ascii');b.writeUInt16LE(800,4);b.writeUInt16LE(480,6);b[8]=49;b[9]=1;return b;}
var sm=require(path.join(ROOT,'src','snapshot','snapshot-model'));
var SS=require(path.join(ROOT,'src','snapshot','snapshot-store')).SnapshotStore;
var SC=require(path.join(ROOT,'src','snapshot','snapshot-cache')).SnapshotCache;
var PS=require(path.join(ROOT,'src','snapshot','pin-store')).PinStore;
var PL=require(path.join(ROOT,'src','publication','publication-lock')).PublicationLock;
var PH=require(path.join(ROOT,'src','publication','publication-history')).PublicationHistory;
var PubSvc=require(path.join(ROOT,'src','publication','publication-service')).PublicationService;
var tmp=path.join(os.tmpdir(),'r3_admin_int_'+Date.now());fs.mkdirSync(tmp,{recursive:true});
var lg={info:function(){},warn:function(){},error:function(){}};

async function run(){
  var store=SS(path.join(tmp,'snap'),path.join(tmp,'pub'),lg);await store.ensureDirs();
  var notif={notify:function(){return Promise.resolve();},name:'nop'};
  var hist=PH(path.join(tmp,'h.json'),lg);
  var svc=PubSvc(store,SC(),PS(),PL(),notif,null,hist,lg);
  // Publish first snapshot (like admin/news)
  var snap1=sm.createSnapshot('manual-news:abc',{mode:'news',title:'Manual News'},mf(),'news');
  await svc.publish(snap1);
  // Publish second snapshot (like admin/photo)
  var snap2=sm.createSnapshot('manual-photo:xyz',{mode:'photo',title:'Manual Photo'},mf(),'photo');
  await svc.publish(snap2);
  // Active snapshot is now snap2
  var active=await svc.getActive();
  t('ACTIVE_IS_LATEST',active.snapshotId===snap2.snapshotId,'');
  // Rollback to snap1
  await svc.rollback(snap1.snapshotId);
  var activeRb=await svc.getActive();
  t('ROLLBACK_TO_SNAP1',activeRb.snapshotId===snap1.snapshotId,'');
  t('ROLLBACK_FRAME_MATCH',activeRb.frameSha256===snap1.frameSha256,'');
  // History contains both publishes and rollback
  var entries=await hist.list();
  t('HISTORY_COUNT',entries.length===3,'');
  t('HISTORY_ROLLBACK_ENTRY',entries[0].type==='rollback','');
  // Second rollback: byte-for-byte match
  var loaded1=await store.load(snap1.snapshotId);
  t('ROLLBACK_BYTE_MATCH',loaded1!==null&&loaded1.frame[0]===snap1.frame[0]&&loaded1.frame[4]===snap1.frame[4],'');
  console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');
  try{fs.rmdirSync(tmp,{recursive:true})}catch(e){}
  process.exit(ec);
}
run().catch(function(e){console.log('CRASH: '+e.message);try{fs.rmdirSync(tmp,{recursive:true})}catch(e2){}process.exit(1)});
