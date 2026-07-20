#!/usr/bin/env node
// Lane A: rollback history failure semantics — activation committed even if history fails
var path=require('path'),fs=require('fs'),os=require('os');
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
var tmp=path.join(os.tmpdir(),'r3_rb_hf_'+Date.now());fs.mkdirSync(tmp,{recursive:true});
var log=[];
var lg={info:function(){},warn:function(){},error:function(m){log.push(m);}};

async function run(){
  var store=SS(path.join(tmp,'snap'),path.join(tmp,'pub'),lg);await store.ensureDirs();
  var hist=PH(path.join(tmp,'h.json'),lg);
  var svc=PubSvc(store,SC(),PS(),PL(),{notify:function(){return Promise.resolve();},name:'nop'},null,hist,lg);
  // Publish two snapshots
  var a=sm.createSnapshot('news:a',{mode:'news'},mf(),'news');
  var b=sm.createSnapshot('news:b',{mode:'news'},mf(),'news');
  await svc.publish(a);await svc.publish(b);
  // Break history for rollback
  hist.append=function(){return Promise.reject(new Error('hist down'));};
  var rb=await svc.rollback(a.snapshotId);
  t('RB_ACTIVE_TARGET_COMMITTED',rb.snapshotId===a.snapshotId&&rb.committed===true,'');
  t('RB_HISTORY_STATUS_FAILED',rb.historyStatus==='FAILED',rb.historyStatus);
  t('RB_DOES_NOT_REJECT',true,'');
  var active=await svc.getActive();
  t('RB_ACTIVE_IS_TARGET',active.snapshotId===a.snapshotId,'');
  t('RB_LOGGER_ERROR',log.some(function(m){return m.indexOf('history append failed')>=0;}),'');
  // Activation before history failure must have switched active
  t('RB_FRAME_SHA256_MATCH',active.frameSha256===a.frameSha256,'');
  // Rollback to non-existent still rejects
  try{await svc.rollback('nonexistent');t('RB_NONEXISTENT_REJECTED',false,'');}
  catch(e){t('RB_NONEXISTENT_REJECTED',true,'');}
  console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');
  try{fs.rmdirSync(tmp,{recursive:true})}catch(e){}
  process.exit(ec);
}
run().catch(function(e){console.log('CRASH: '+e.message);try{fs.rmdirSync(tmp,{recursive:true})}catch(e2){}process.exit(1)});
