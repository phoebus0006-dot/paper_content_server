#!/usr/bin/env node
// Lane A: Delete idempotency — already deleted/tombstoned returns cleanly
var path=require('path'),fs=require('fs'),os=require('os');
var ROOT=path.join(__dirname,'..','..');
var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var am=require(path.join(ROOT,'src','assets','asset-model'));
var AR=require(path.join(ROOT,'src','assets','asset-repository')).AssetRepository;
var ARI=require(path.join(ROOT,'src','assets','asset-reference-index')).AssetReferenceIndex;
var SS=require(path.join(ROOT,'src','snapshot','snapshot-store')).SnapshotStore;
var SC=require(path.join(ROOT,'src','snapshot','snapshot-cache')).SnapshotCache;
var TS=require(path.join(ROOT,'src','safety','tombstone-store')).TombstoneStore;
var SAL=require(path.join(ROOT,'src','safety','safety-audit-log')).SafetyAuditLog;
var RC=require(path.join(ROOT,'src','safety','reference-cleaner')).ReferenceCleaner;
var ADS=require(path.join(ROOT,'src','safety','asset-delete-service')).AssetDeleteService;
var tmp=path.join(os.tmpdir(),'r4_idem_'+Date.now());fs.mkdirSync(tmp,{recursive:true});
var img=path.join(tmp,'bad.png');fs.writeFileSync(img,'bad');
var lg={info:function(){},warn:function(){},error:function(){}};
async function run(){
  var repo=AR(path.join(tmp,'repo.json'),lg);
  var store=SS(path.join(tmp,'snap'),path.join(tmp,'pub'),lg);await store.ensureDirs();
  var refIdx=ARI(tmp,store,null);
  var cache=SC();var toms=TS(path.join(tmp,'tombstones'),lg);
  var aud=SAL(path.join(tmp,'audit.log'),lg);
  var cleaner=RC(store,cache,null,tmp,lg);
  var svc=ADS(repo,refIdx,store,cache,null,toms,aud,cleaner,lg,null,null);
  var asset=am.createAsset({assetId:'ast_idem',sourceUrl:'http://bad',libraryType:'LEARNING',safetyStatus:'UNSAFE',lifecycleStatus:'DISCOVERED',localPath:img});
  await repo.create(asset);
  var r1=await svc.deleteUnsafeAsset({assetId:'ast_idem',reason:'UNSAFE',decision:'remove',dryRun:false});
  t('FIRST_DELETE_SUCCEEDS',r1.complete===true||r1.alreadyDeleted===true,'');
  var r2=await svc.deleteUnsafeAsset({assetId:'ast_idem',reason:'UNSAFE',decision:'remove',dryRun:false});
  t('SECOND_DELETE_IDEMPOTENT',r2.alreadyDeleted===true||r2.complete===true,'');
  t('SECOND_NOT_ERROR',r2.error===undefined||r2.complete===true,'');
  // Delete non-existent asset throws
  try{await svc.deleteUnsafeAsset({assetId:'nonexistent',reason:'UNSAFE',dryRun:false});t('NONEXISTENT_ERROR',false,'');}
  catch(e){t('NONEXISTENT_ERROR',true,'');}
  try{fs.rmdirSync(tmp,{recursive:true})}catch(e){}
  console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');
  process.exit(ec);
}
run().catch(function(e){console.log('CRASH: '+e.message);try{fs.rmdirSync(tmp,{recursive:true})}catch(e2){}process.exit(1)});
