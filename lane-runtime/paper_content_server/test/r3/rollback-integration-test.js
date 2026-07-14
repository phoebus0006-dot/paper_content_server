#!/usr/bin/env node
// R3 test: rollback with integrity validation and byte-for-byte recovery
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
var tmp=path.join(os.tmpdir(),'r3_roll_int_'+Date.now());fs.mkdirSync(tmp,{recursive:true});
var lg={info:function(){},warn:function(){},error:function(){}};

async function run(){
  var store=SS(path.join(tmp,'snap'),path.join(tmp,'pub'),lg);await store.ensureDirs();
  var notif={notify:function(){return Promise.resolve();},name:'nop'};
  var hist=PH(path.join(tmp,'h.json'),lg);
  var svc=PubSvc(store,SC(),PS(),PL(),notif,null,hist,lg);
  // Publish original
  // Mark with valid palette codes (0,1,2,3,5,6 are valid)
  var frame1=mf();frame1[10]=0x11;frame1[11]=0x22;frame1[12]=0x33;frame1[13]=0x55; // marks "1223" with valid codes
  var snap1=sm.createSnapshot('news:original',{mode:'news'},frame1,'news');
  await svc.publish(snap1);
  // Publish updated
  var frame2=mf();frame2[10]=0x66;frame2[11]=0x55;frame2[12]=0x11;frame2[13]=0x22; // marks "6512" with valid codes
  var snap2=sm.createSnapshot('news:updated',{mode:'news'},frame2,'news');
  await svc.publish(snap2);
  // Rollback to original
  await svc.rollback(snap1.snapshotId);
  var active=await svc.getActive();
  t('ROLLBACK_SNAPSHOTID',active.snapshotId===snap1.snapshotId,'');
  t('ROLLBACK_FRAME_SHA256',active.frameSha256===snap1.frameSha256,'');
  t('ROLLBACK_BYTES_MARKER',active.frame[10]===0x11&&active.frame[11]===0x22&&active.frame[12]===0x33&&active.frame[13]===0x55,'');
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
