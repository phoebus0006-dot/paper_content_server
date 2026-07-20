#!/usr/bin/env node
// R4.2C: Rollback cannot restore deleted unsafe asset
var path=require('path'),fs=require('fs'),os=require('os');
var ROOT=path.join(__dirname, '..', '..','..');
var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var ARI=require(path.join(ROOT,'src','assets','asset-reference-index')).AssetReferenceIndex;
var SS=require(path.join(ROOT,'src','snapshot','snapshot-store')).SnapshotStore;
var SC=require(path.join(ROOT,'src','snapshot','snapshot-cache')).SnapshotCache;
var PM=require(path.join(ROOT,'src','snapshot','snapshot-model'));
var PH=require(path.join(ROOT,'src','publication','publication-history')).PublicationHistory;
var lg={info:function(){},warn:function(){},error:function(){}};

function mf(){var b=Buffer.alloc(192010);b.write('EPF1',0,'ascii');b.writeUInt16LE(800,4);b.writeUInt16LE(480,6);b[8]=49;b[9]=1;return b;}
var tmpDir=path.join(os.tmpdir(),'r4_rbinv_'+Date.now());fs.mkdirSync(tmpDir,{recursive:true});

async function run(){
  var store=SS(path.join(tmpDir,'snap'),path.join(tmpDir,'pub'),lg);await store.ensureDirs();
  var hist=PH(path.join(tmpDir,'h.json'),lg);
  var pubSvc=require(path.join(ROOT,'src','publication','publication-service')).PublicationService;
  var ps=pubSvc(store,SC(),null,require(path.join(ROOT,'src','publication','publication-lock')).PublicationLock(),
    {notify:function(){return Promise.resolve();},name:'nop'},null,hist,lg);

  // Create history with snapshot containing unsafe asset reference
  var unsafeSnap=PM.createSnapshot('news:unsafe-hist',{mode:'news',photoId:'bad_asset_2'},mf(),'news');
  await ps.publish(unsafeSnap);
  var safeSnap=PM.createSnapshot('news:safe',{mode:'news'},mf(),'news');
  await ps.publish(safeSnap);

  // Rollback to unsafe snapshot (simulating potential restore)
  await ps.rollback(unsafeSnap.snapshotId);
  var active=await ps.getActive();
  t('CAN_ROLLBACK_TO_UNSAFE_HISTORY',active.frameSha256===unsafeSnap.frameSha256,'');

  // Reference index should find it
  var idx=ARI(tmpDir,store,hist);
  var refs=await idx.findReferences('bad_asset_2');
  var historyRefs=refs.references.filter(function(r){return r.type==='active_snapshot'||r.type==='publication_history';});
  t('ROLLBACK_REFERENCE_FOUND',historyRefs.length>=1,'count='+historyRefs.length);

  try{fs.rmdirSync(tmpDir,{recursive:true})}catch(e){}
  console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');
  process.exit(ec);
}
run().catch(function(e){console.log('CRASH: '+e.message);try{fs.rmdirSync(tmpDir,{recursive:true})}catch(e2){}process.exit(1)});
