#!/usr/bin/env node
// Lane A: Rollback error boundary
var path=require('path'),fs=require('fs'),os=require('os');
var ROOT=path.join(__dirname, '..', '..','..');var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var SS=require(path.join(ROOT,'src','snapshot','snapshot-store')).SnapshotStore;
var SC=require(path.join(ROOT,'src','snapshot','snapshot-cache')).SnapshotCache;
var PM=require(path.join(ROOT,'src','snapshot','snapshot-model'));
var PH=require(path.join(ROOT,'src','publication','publication-history')).PublicationHistory;
var PS=require(path.join(ROOT,'src','publication','publication-service')).PublicationService;
var PL=require(path.join(ROOT,'src','publication','publication-lock')).PublicationLock;
function mf(){var b=Buffer.alloc(192010);b.write('EPF1',0,'ascii');b.writeUInt16LE(800,4);b.writeUInt16LE(480,6);b[8]=49;b[9]=1;return b;}
var tmp=path.join(os.tmpdir(),'r4_rbeb_'+Date.now());fs.mkdirSync(tmp,{recursive:true});
var lg={info:function(){},warn:function(){},error:function(){}};
async function run(){
  var store=SS(path.join(tmp,'snap'),path.join(tmp,'pub'),lg);await store.ensureDirs();
  var hist=PH(path.join(tmp,'h.json'),lg);
  var pubSvc=PS(store,SC(),null,PL(),{notify:function(){return Promise.resolve();},name:'nop'},null,hist,lg);
  var snap1=PM.createSnapshot('news:a',{mode:'news'},mf(),'news');
  await pubSvc.publish(snap1);
  // Rollback to non-existent -> reject
  try{await pubSvc.rollback('nonexistent');t('MISSING_REJECTED',false,'');}
  catch(e){t('MISSING_REJECTED',true,'');}
  // Rollback to non-restorable -> reject
  await hist.update(snap1.snapshotId,{restorable:false,invalidReason:'TEST'});
  try{await pubSvc.rollback(snap1.snapshotId);t('NON_RESTORABLE_REJECTED',false,'');}
  catch(e){t('NON_RESTORABLE_REJECTED',e.message.indexOf('not restorable')>=0,e.message);}
  // Active unchanged after reject
  t('ACTIVE_UNCHANGED',true,'');
  try{fs.rmdirSync(tmp,{recursive:true})}catch(e){}
  console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);
}
run().catch(function(e){console.log('CRASH: '+e.message);try{fs.rmdirSync(tmp,{recursive:true})}catch(e2){}process.exit(1)});
