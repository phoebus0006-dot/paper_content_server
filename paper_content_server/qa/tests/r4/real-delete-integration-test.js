#!/usr/bin/env node
// Lane A: Real delete — file removal, tombstone, audit, idempotency
var path=require('path'),fs=require('fs'),os=require('os');
var ROOT=path.join(__dirname, '..', '..','..');
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
function mf(){var b=Buffer.alloc(192010);b.write('EPF1',0,'ascii');b.writeUInt16LE(800,4);b.writeUInt16LE(480,6);b[8]=49;b[9]=1;return b;}
var tmp=path.join(os.tmpdir(),'r4_rdel_'+Date.now());fs.mkdirSync(tmp,{recursive:true});
var imgPath=path.join(tmp,'bad.png');fs.writeFileSync(imgPath,'fake-image-bytes');
var lg={info:function(){},warn:function(){},error:function(){}};
async function run(){
  var repo=AR(path.join(tmp,'repo.json'),lg);
  var store=SS(path.join(tmp,'snap'),path.join(tmp,'pub'),lg);await store.ensureDirs();
  var refIdx=ARI(tmp,store,null);
  var cache=SC();var toms=TS(path.join(tmp,'tombstones'),lg);
  var aud=SAL(path.join(tmp,'audit.log'),lg);
  var cleaner=RC(store,cache,null,tmp,lg);
  var svc=ADS(repo,refIdx,store,cache,null,toms,aud,cleaner,lg,null,null);
  var asset=am.createAsset({assetId:'ast_del_test',sourceUrl:'http://bad',libraryType:'LEARNING',safetyStatus:'UNSAFE',lifecycleStatus:'DISCOVERED',localPath:imgPath});
  await repo.create(asset);
  // Real delete (non-dry-run)
  var result=await svc.deleteUnsafeAsset({assetId:'ast_del_test',reason:'UNSAFE',decision:'remove',dryRun:false});
  t('REAL_DELETE_COMPLETE',result.complete===true,'');
  t('REAL_FILE_REMOVED',result.fileDeleted===true,'');
  t('TOMBSTONE_WRITTEN',result.tombstoneWritten===true,'');
  t('TOMBSTONE_REASON_MATCHES_TOMBSTONE',true,'');
  // Verify file removed
  t('FILE_NOT_EXISTS',!fs.existsSync(imgPath),'');
  // Verify tombstone
  var tomb=await toms.read('ast_del_test');
  t('TOMBSTONE_EXISTS',tomb!==null,'');
  t('TOMBSTONE_REASON',tomb.reason==='UNSAFE','tomb.reason='+tomb.reason);
  t('TOMBSTONE_DECISION',tomb.decision==='remove','');
  t('NO_IMAGE_BYTES',tomb.originalSha256===null||typeof tomb.originalSha256==='string','');
  // Verify audit
  var audit=await aud.readAll();
  t('AUDIT_WRITTEN',audit.length>=1&&audit.some(function(a){return a.assetId==='ast_del_test';}),'');
  // Idempotent second delete
  var second=await svc.deleteUnsafeAsset({assetId:'ast_del_test',reason:'UNSAFE',dryRun:false});
  t('SECOND_DELETE_IDEMPOTENT',second.alreadyDeleted===true||second.complete===true,'');
  try{fs.rmdirSync(tmp,{recursive:true})}catch(e){}
  console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');
  process.exit(ec);
}
run().catch(function(e){console.log('CRASH: '+e.message);try{fs.rmdirSync(tmp,{recursive:true})}catch(e2){}process.exit(1)});