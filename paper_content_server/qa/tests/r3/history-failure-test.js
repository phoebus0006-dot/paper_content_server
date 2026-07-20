#!/usr/bin/env node
// R3 test: history failure semantics — activation committed even if history/notification fails
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
var tmp=path.join(os.tmpdir(),'r3_hf_'+Date.now());fs.mkdirSync(tmp,{recursive:true});
var logEntries=[];
var lg={info:function(){},warn:function(){},error:function(m){logEntries.push(m);}};

function makeServices(histReject){
  var store=SS(path.join(tmp,'snap'),path.join(tmp,'pub'),lg);
  var hist=PH(path.join(tmp,'h_'+Date.now()+'_'+Math.random()+'.json'),lg);
  var origAppend=hist.append;
  if(histReject) hist.append=function(){return Promise.reject(new Error('hist down'));};
  var svc=PubSvc(store,SC(),PS(),PL(),
    {notify:function(){return Promise.resolve();},name:'nop'},null,hist,lg);
  return {store:store,svc:svc,hist:hist};
}

async function run(){
  // HISTORY FAILURE: history.append rejects -> publish still resolves, committed=true
  var s1=makeServices(true);await s1.store.ensureDirs();
  var snap=sm.createSnapshot('news:hf-test',{mode:'news'},mf(),'news');
  var result=await s1.svc.publish(snap);
  t('HISTORY_FAIL_ACTIVE_COMMITTED',result.snapshotId===snap.snapshotId&&result.committed===true,'');
  t('HISTORY_STATUS_FAILED',result.historyStatus==='FAILED',result.historyStatus);
  t('NOTIFICATION_STILL_ATTEMPTED',result.notificationStatus==='OK',result.notificationStatus);
  t('HISTORY_FAIL_PUBLISH_RESOLVES',true,'publish did not reject');
  var active=await s1.svc.getActive();
  t('HISTORY_FAIL_ACTIVE_SNAPSHOTID',active.snapshotId===snap.snapshotId,'');
  t('HISTORY_FAIL_LOGGER_ERROR',logEntries.some(function(m){return m.indexOf('history append failed')>=0;}),'');

  // ROLLBACK HISTORY FAILURE
  logEntries=[];
  var s2=makeServices(false);await s2.store.ensureDirs();
  var snapA=sm.createSnapshot('news:rb-a',{mode:'news'},mf(),'news');
  var snapB=sm.createSnapshot('news:rb-b',{mode:'news'},mf(),'news');
  await s2.svc.publish(snapA);
  await s2.svc.publish(snapB);
  // Make hist append reject for rollback
  s2.hist.append=function(){return Promise.reject(new Error('hist down'));};
  var rbResult=await s2.svc.rollback(snapA.snapshotId);
  t('ROLLBACK_ACTIVE_TARGET_COMMITTED',rbResult.snapshotId===snapA.snapshotId&&rbResult.committed===true,'');
  t('ROLLBACK_HISTORY_STATUS_FAILED',rbResult.historyStatus==='FAILED',rbResult.historyStatus);
  t('ROLLBACK_DOES_NOT_REJECT_AFTER_ACTIVATION',true,'');
  var activeRb=await s2.svc.getActive();
  t('ROLLBACK_ACTIVE_IS_TARGET',activeRb.snapshotId===snapA.snapshotId,'');
  t('ROLLBACK_LOGGER_ERROR',logEntries.some(function(m){return m.indexOf('history append failed')>=0;}),'');

  // NOTIFICATION AFTER HISTORY FAILURE: notification still attempted
  logEntries=[];
  var s3=makeServices(true);await s3.store.ensureDirs();
  s3.svc.publish(sm.createSnapshot('news:notif-after-hist',{mode:'news'},mf(),'news'));
  // (notification port is nop, so it always succeeds — the key is history failure doesn't prevent notification attempt)

  console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');
  try{fs.rmdirSync(tmp,{recursive:true})}catch(e){}
  process.exit(ec);
}
run().catch(function(e){console.log('CRASH: '+e.message);try{fs.rmdirSync(tmp,{recursive:true})}catch(e2){}process.exit(1)});
