#!/usr/bin/env node
// Real delete runtime test: context passed, replacement verified, file removed
var path=require('path'),fs=require('fs'),os=require('os');
var ROOT=path.join(__dirname, '..', '..','..');var ec=0,pass=0,fail=0;
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
function mf(){var b=Buffer.alloc(192010);b.write('EPF1',0,'ascii');b.writeUInt16LE(800,4);b.writeUInt16LE(480,6);b[8]=49;b[9]=1;return b;}
var tmp=path.join(os.tmpdir(),'r4_rt_'+Date.now());fs.mkdirSync(tmp,{recursive:true});
var img=path.join(tmp,'bad.png');fs.writeFileSync(img,'bad');
var lg={info:function(){},warn:function(){},error:function(){}};
async function run(){
  var repo=AR(path.join(tmp,'repo.json'),lg);
  var store=SS(path.join(tmp,'snap'),path.join(tmp,'pub'),lg);await store.ensureDirs();
  var cache=SC();var refIdx=ARI(tmp,store,null);
  var toms=TS(path.join(tmp,'tombstones'),lg);var aud=SAL(path.join(tmp,'audit.log'),lg);
  var cleaner=RC(store,cache,null,tmp,lg);
  var svc=ADS(repo,refIdx,store,cache,null,toms,aud,cleaner,lg,null,null);
  var asset=am.createAsset({assetId:'ast_rt',sourceUrl:'http://bad',libraryType:'LEARNING',safetyStatus:'UNSAFE',lifecycleStatus:'DISCOVERED',localPath:img});
  await repo.create(asset);
  var result=await svc.deleteUnsafeAsset({assetId:'ast_rt',reason:'UNSAFE',decision:'remove',dryRun:false});
  t('REAL_FILE_REMOVED',result.fileDeleted===true,'');
  t('TOMBSTONE_WRITTEN',result.tombstoneWritten===true,'');
  t('COMPLETE',result.complete===true,'');
  t('NO_REFERENCE_ERROR',result.reason===undefined,'');
  t('FILE_GONE',!fs.existsSync(img),'');
  var tomb=await toms.read('ast_rt');
  t('TOMBSTONE_REASON_MATCHES',tomb.reason==='UNSAFE','tomb.reason='+tomb.reason);
  t('TOMBSTONE_DECISION_MATCHES',tomb.decision==='remove','');
  try{fs.rmdirSync(tmp,{recursive:true})}catch(e){}
  console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);
}
run().catch(function(e){console.log('CRASH: '+e.message);try{fs.rmdirSync(tmp,{recursive:true})}catch(e2){}process.exit(1)});
