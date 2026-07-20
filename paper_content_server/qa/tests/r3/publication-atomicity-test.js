#!/usr/bin/env node
// R3 test: publication atomicity — failures don't leave partial state
var path=require('path'),fs=require('fs'),os=require('os'),crypto=require('crypto');
var ROOT=path.join(__dirname, '..', '..','..');
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
var tmp=path.join(os.tmpdir(),'r3_atomic_'+Date.now());fs.mkdirSync(tmp,{recursive:true});
var lg={info:function(){},warn:function(){},error:function(){}};

async function run(){
  // Failure notification does not reject publish
  var s1=SS(path.join(tmp,'snap1'),path.join(tmp,'pub1'),lg);
  await s1.ensureDirs();
  var ps1=PubSvc(s1,SC(),PS(),PL(),{notify:function(){return Promise.reject(new Error('notif down'));},name:'bad'},null,PH(path.join(tmp,'h1.json'),lg),lg);
  var snap=sm.createSnapshot('news:a',{mode:'news'},mf(),'news');
  var r=await ps1.publish(snap);
  t('NOTIF_FAIL_RETURNS_SNAPSHOTID',r.snapshotId===snap.snapshotId,r.snapshotId);
  t('NOTIF_FAIL_STATUS',r.notificationStatus==='FAILED',r.notificationStatus);
  var a=await s1.readActive();
  t('NOTIF_FAIL_ACTIVE_COMMITTED',a&&a.activeSnapshotId===snap.snapshotId,'');

  // Load and verify integrity after notif failure
  var loaded=await s1.load(snap.snapshotId);
  t('NOTIF_FAIL_LOADABLE',loaded!==null&&loaded.frameSha256===snap.frameSha256,'');

  // Save failure: store.reject
  var s2=SS(path.join(tmp,'snap2'),path.join(tmp,'pub2'),lg);
  await s2.ensureDirs();
  // Try to save empty snapshot should reject
  try{await s2.save(null);t('SAVE_NULL_REJECTED',false,'');}catch(e){t('SAVE_NULL_REJECTED',true,'');}
  // Try to save snapshot with invalid frame (non-Buffer)
  try{var badSnap=sm.createSnapshot('bad:1',{mode:'news'},mf(),'news');await s2.save({snapshotId:badSnap.snapshotId,frame:'not-a-buffer'});t('SAVE_BAD_FRAME',false,'');}catch(e){t('SAVE_BAD_FRAME',true,'');}

  // Activate non-existent throws
  try{await s1.activate('nonexistent');t('ACTIVATE_MISSING',false,'');}catch(e){t('ACTIVATE_MISSING',true,'');}

  console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');
  try{fs.rmdirSync(tmp,{recursive:true})}catch(e){}
  process.exit(ec);
}
run().catch(function(e){console.log('CRASH: '+e.message);try{fs.rmdirSync(tmp,{recursive:true})}catch(e2){}process.exit(1)});
