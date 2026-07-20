#!/usr/bin/env node
// R3 test: state/frame endpoint serve same snapshot via PublicationService
var path=require('path'),fs=require('fs'),os=require('os');
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
var tmp=path.join(os.tmpdir(),'r3_sf_'+Date.now());fs.mkdirSync(tmp,{recursive:true});
var lg={info:function(){},warn:function(){},error:function(){}};

async function run(){
  var store=SS(path.join(tmp,'snap'),path.join(tmp,'pub'),lg);await store.ensureDirs();
  var svc=PubSvc(store,SC(),PS(),PL(),{notify:function(){return Promise.resolve();},name:'nop'},null,PH(path.join(tmp,'h.json'),lg),lg);
  var frame=mf();var snap=sm.createSnapshot('news:panel',{mode:'news'},frame,'news');
  var pubResult=await svc.publish(snap);
  // getActive returns same snapshot
  var active=await svc.getActive();
  t('ACTIVE_MATCHES_PUBLISHED',active.snapshotId===snap.snapshotId,'');
  t('ACTIVE_FRAME_REF',active.frame===frame,'same frame buffer');
  t('ACTIVE_FRAME_SHA256',active.frameSha256===snap.frameSha256,'');
  // Load snapshot also returns same frame bytes
  var loaded=await svc.loadSnapshot(snap.snapshotId);
  t('LOADED_FRAME_MATCH',loaded.frameSha256===snap.frameSha256,'');
  t('LOADED_PAYLOAD',loaded.payload.mode==='news','');
  // Active snapshot and loadSnapshot agree
  t('ACTIVE_LOADED_AGREE',active.snapshotId===loaded.snapshotId&&active.frameSha256===loaded.frameSha256,'');
  console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');
  try{fs.rmdirSync(tmp,{recursive:true})}catch(e){}
  process.exit(ec);
}
run().catch(function(e){console.log('CRASH: '+e.message);try{fs.rmdirSync(tmp,{recursive:true})}catch(e2){}process.exit(1)});
