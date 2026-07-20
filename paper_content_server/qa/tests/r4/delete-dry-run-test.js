#!/usr/bin/env node
// R4.2C: Delete dry-run — should not modify any data
var path=require('path'),fs=require('fs'),os=require('os');
var ROOT=path.join(__dirname, '..', '..','..');
var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var am=require(path.join(ROOT,'src','assets','asset-model'));
var AR=require(path.join(ROOT,'src','assets','asset-repository')).AssetRepository;
var ARI=require(path.join(ROOT,'src','assets','asset-reference-index')).AssetReferenceIndex;
var SS=require(path.join(ROOT,'src','snapshot','snapshot-store')).SnapshotStore;
var SCL=require(path.join(ROOT,'src','safety','safety-decision'));
var ADS=require(path.join(ROOT,'src','safety','asset-delete-service')).AssetDeleteService;
var TS=require(path.join(ROOT,'src','safety','tombstone-store')).TombstoneStore;
var SAL=require(path.join(ROOT,'src','safety','safety-audit-log')).SafetyAuditLog;
var RC=require(path.join(ROOT,'src','safety','reference-cleaner')).ReferenceCleaner;

var tmpDir=path.join(os.tmpdir(),'r4_dryrun_'+Date.now());fs.mkdirSync(tmpDir,{recursive:true});
var lg={info:function(){},warn:function(){},error:function(){}};

async function run(){
  var repo=AR(path.join(tmpDir,'repo.json'),lg);
  var store=SS(path.join(tmpDir,'snap'),path.join(tmpDir,'pub'),lg);await store.ensureDirs();
  var refIdx=ARI(tmpDir,store,null);
  var toms=TS(path.join(tmpDir,'tombstones'),lg);
  var aud=SAL(path.join(tmpDir,'audit.log'),lg);
  var cleaner=RC(store,null,null,lg);
  var svc=ADS(repo,refIdx,store,null,null,toms,aud,cleaner,lg);

  // Create an UNSAFE asset
  var asset=am.createAsset({sourceUrl:'http://bad.img',libraryType:'LEARNING',safetyStatus:'UNSAFE',lifecycleStatus:'DISCOVERED'});
  await repo.create(asset);
  var preCount=await repo.count();
  t('DRY_RUN_PRE_COUNT',preCount===1,'');

  var result=await svc.deleteUnsafeAsset({assetId:asset.assetId,reason:'UNSAFE',decision:'remove',dryRun:true});
  t('DRY_RUN_COMPLETE',result.complete===true,'');
  t('DRY_RUN_WOULD_BLOCK',result.wouldBlock===true,'');
  t('DRY_RUN_DRY_RUN_FLAG',result.dryRun===true,'');
  t('DRY_RUN_REPLACEMENT_REQUIRED',result.replacementRequired!==undefined,'');

  // Verify no data was modified
  var postCount=await repo.count();
  t('DRY_RUN_COUNT_UNCHANGED',postCount===preCount,'');
  var postAsset=await repo.get(asset.assetId);
  t('DRY_RUN_LIFECYCLE_UNCHANGED',postAsset.lifecycleStatus==='DISCOVERED','still DISCOVERED');

  // Audit log should have dry-run entry
  var audit=await aud.readAll();
  t('DRY_RUN_AUDIT_EXISTS',audit.length===1&&audit[0].dryRun===true,'');

  try{fs.rmdirSync(tmpDir,{recursive:true})}catch(e){}
  console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');
  process.exit(ec);
}
run().catch(function(e){console.log('CRASH: '+e.message);try{fs.rmdirSync(tmpDir,{recursive:true})}catch(e2){}process.exit(1)});
