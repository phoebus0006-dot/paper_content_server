#!/usr/bin/env node
// R4.2C: Active asset delete — dry-run detects active reference
var path=require('path'),fs=require('fs'),os=require('os');
var ROOT=path.join(__dirname,'..','..');var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var am=require(path.join(ROOT,'src','assets','asset-model'));
var AR=require(path.join(ROOT,'src','assets','asset-repository')).AssetRepository;
var ARI=require(path.join(ROOT,'src','assets','asset-reference-index')).AssetReferenceIndex;
var SS=require(path.join(ROOT,'src','snapshot','snapshot-store')).SnapshotStore;
var SC=require(path.join(ROOT,'src','snapshot','snapshot-cache')).SnapshotCache;
var PM=require(path.join(ROOT,'src','snapshot','snapshot-model'));
var PH=require(path.join(ROOT,'src','publication','publication-history')).PublicationHistory;
var PS=require(path.join(ROOT,'src','publication','publication-service')).PublicationService;
var PL=require(path.join(ROOT,'src','publication','publication-lock')).PublicationLock;
var NP=require(path.join(ROOT,'src','publication','notification-port')).NoopNotificationPort;
var TS=require(path.join(ROOT,'src','safety','tombstone-store')).TombstoneStore;
var SAL=require(path.join(ROOT,'src','safety','safety-audit-log')).SafetyAuditLog;
var RC=require(path.join(ROOT,'src','safety','reference-cleaner')).ReferenceCleaner;
var ADS=require(path.join(ROOT,'src','safety','asset-delete-service')).AssetDeleteService;
function mf(){var b=Buffer.alloc(192010);b.write('EPF1',0,'ascii');b.writeUInt16LE(800,4);b.writeUInt16LE(480,6);b[8]=49;b[9]=1;return b;}
var tmp=path.join(os.tmpdir(),'r4_actdel_'+Date.now());fs.mkdirSync(tmp,{recursive:true});
var lg={info:function(){},warn:function(){},error:function(){}};
async function run(){
  var repo=AR(path.join(tmp,'repo.json'),lg);
  var store=SS(path.join(tmp,'snap'),path.join(tmp,'pub'),lg);await store.ensureDirs();
  var refIdx=ARI(tmp,store,null);
  var toms=TS(path.join(tmp,'tombstones'),lg);var aud=SAL(path.join(tmp,'audit.log'),lg);
  var cache=SC();var cleaner=RC(store,cache,null,tmp,lg);
  var hist=PH(path.join(tmp,'h.json'),lg);
  var assetId='bad_asset_1';
  var unsafeSnap=PM.createSnapshot('news:unsafe',{mode:'news',photoId:assetId,localPath:'/data/bad.png'},mf(),'news');
  var pubSvc=PS(store,cache,null,PL(),NP(),null,hist,lg);
  await pubSvc.publish(unsafeSnap);
  var active=await pubSvc.getActive();
  t('ACTIVE_CONTAINS_UNSAFE',active&&active.payload.photoId==='bad_asset_1','');
  var asset=am.createAsset({assetId:assetId,sourceUrl:'http://bad.img',libraryType:'LEARNING',safetyStatus:'UNSAFE',lifecycleStatus:'DISCOVERED',localPath:'/data/bad.png'});
  await repo.create(asset);
  var svc=ADS(repo,refIdx,store,cache,hist,toms,aud,cleaner,lg,null,null);
  var result=await svc.deleteUnsafeAsset({assetId:asset.assetId,reason:'UNSAFE',decision:'remove',dryRun:true});
  t('DRY_RUN_DETECTS_ACTIVE',result.replacementRequired===true,'');
  t('DRY_RUN_HAS_REFERENCES',Array.isArray(result.references),'');
  t('DRY_RUN_COMPLETE',result.wouldBlock===true,'');
  try{fs.rmdirSync(tmp,{recursive:true})}catch(e){}
  console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');
  process.exit(ec);
}
run().catch(function(e){console.log('CRASH: '+e.message);try{fs.rmdirSync(tmp,{recursive:true})}catch(e2){}process.exit(1)});