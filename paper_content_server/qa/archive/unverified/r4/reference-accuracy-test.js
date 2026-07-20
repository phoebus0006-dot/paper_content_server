#!/usr/bin/env node
// R4.2B: Reference accuracy — exact matching, no false positives
var path=require('path'),fs=require('fs'),os=require('os');
var ROOT=path.join(__dirname,'..','..');
var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}

var ARI=require(path.join(ROOT,'src','assets','asset-reference-index')).AssetReferenceIndex;
var SS=require(path.join(ROOT,'src','snapshot','snapshot-store')).SnapshotStore;
var PM=require(path.join(ROOT,'src','snapshot','snapshot-model'));
var PH=require(path.join(ROOT,'src','publication','publication-history')).PublicationHistory;

function mf(){var b=Buffer.alloc(192010);b.write('EPF1',0,'ascii');b.writeUInt16LE(800,4);b.writeUInt16LE(480,6);b[8]=49;b[9]=1;return b;}

var tmpDir=path.join(os.tmpdir(),'r4_refacc_'+Date.now());fs.mkdirSync(tmpDir,{recursive:true});
var lg={info:function(){},warn:function(){},error:function(){}};

async function run(){
  // Create test index with known asset
  fs.mkdirSync(path.join(tmpDir,'fallback_study'),{recursive:true});
  fs.writeFileSync(path.join(tmpDir,'image_index.json'),JSON.stringify([{id:'real_asset_1',url:'http://img.jpg',processedPngPath:'/data/p1.png'}]));
  fs.writeFileSync(path.join(tmpDir,'fallback_study','study_index.json'),JSON.stringify({entries:[{id:'real_asset_2'}]}));
  // Admin override without asset reference
  fs.writeFileSync(path.join(tmpDir,'admin_override.json'),JSON.stringify({mode:'manual-news',createdAt:new Date().toISOString()}));

  var store=SS(path.join(tmpDir,'snap'),path.join(tmpDir,'pub'),lg);await store.ensureDirs();
  var hist=PH(path.join(tmpDir,'h.json'),lg);
  var idx=ARI(tmpDir,store,hist);

  // 1. Matching legacy index → exact reference
  var refs1=await idx.findReferences('real_asset_1');
  t('LEGACY_INDEX_MATCH',refs1.references.some(function(r){return r.type==='legacy_index';}),'');
  t('LEGACY_INDEX_COMPLETE',refs1.complete===true,'');

  // 2. Unrelated asset → no legacy index reference
  var refs2=await idx.findReferences('nonexistent_asset');
  var hasLegacy=refs2.references.some(function(r){return r.type==='legacy_index';});
  t('UNRELATED_NO_LEGACY_REF',!hasLegacy,'');

  // 3. Unrelated active snapshot → no false active reference
  var unrelatedSnap=PM.createSnapshot('news:unrelated',{mode:'news'},mf(),'news');
  var pubSvc=require(path.join(ROOT,'src','publication','publication-service')).PublicationService;
  var ps=pubSvc(store,require(path.join(ROOT,'src','snapshot','snapshot-cache')).SnapshotCache(),
    require(path.join(ROOT,'src','snapshot','pin-store')).PinStore(),
    require(path.join(ROOT,'src','publication','publication-lock')).PublicationLock(),
    {notify:function(){return Promise.resolve();},name:'nop'},null,hist,lg);
  await ps.publish(unrelatedSnap);
  var refs3=await idx.findReferences('some_other_asset');
  var hasActive=refs3.references.some(function(r){return r.type==='active_snapshot';});
  t('UNRELATED_ACTIVE_NO_REF',!hasActive,'');

  // 4. Matching active snapshot → exact reference found
  var matchingSnap=PM.createSnapshot('news:matching',{mode:'news',photoId:'real_asset_1',localPath:'/data/p1.png'},mf(),'news');
  await ps.publish(matchingSnap);
  var refs4=await idx.findReferences('real_asset_1');
  var activeRef=refs4.references.filter(function(r){return r.type==='active_snapshot';});
  t('MATCHING_ACTIVE_REF_FOUND',activeRef.length>=1,'count='+activeRef.length);

  // 5. Admin override WITHOUT asset ref → no override reference
  var refs5=await idx.findReferences('some_random_id');
  var overrideRef=refs5.references.filter(function(r){return r.type==='admin_override';});
  t('UNRELATED_OVERRIDE_NO_REF',overrideRef.length===0,'');

  try{fs.rmdirSync(tmpDir,{recursive:true})}catch(e){}
  console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');
  process.exit(ec);
}
run().catch(function(e){console.log('CRASH: '+e.message);try{fs.rmdirSync(tmpDir,{recursive:true})}catch(e2){}process.exit(1)});
