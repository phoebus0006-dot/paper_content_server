#!/usr/bin/env node
// Lane A: Active replacement test
var path=require('path'),fs=require('fs'),os=require('os');
var ROOT=path.join(__dirname, '..', '..','..');
var ec=0,pass=0,fail=0;
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
var tmp=path.join(os.tmpdir(),'r4_actrep_'+Date.now());fs.mkdirSync(tmp,{recursive:true});
var img=path.join(tmp,'bad.png');fs.writeFileSync(img,'bad');
var lg={info:function(){},warn:function(){},error:function(){}};
async function run(){
  var repo=AR(path.join(tmp,'repo.json'),lg);
  var store=SS(path.join(tmp,'snap'),path.join(tmp,'pub'),lg);await store.ensureDirs();
  var cache=SC();var hist=PH(path.join(tmp,'h.json'),lg);
  var pubSvc=PS(store,cache,null,PL(),NP(),null,hist,lg);
  var refIdx=ARI(tmp,store,hist);
  var toms=TS(path.join(tmp,'tombstones'),lg);var aud=SAL(path.join(tmp,'audit.log'),lg);
  var cleaner=RC(store,cache,hist,tmp,lg);
  var unsafeSnap=PM.createSnapshot('news:unsafe',{mode:'news',photoId:'ast_bad_1',localPath:'/data/bad.png'},mf(),'news');
  await pubSvc.publish(unsafeSnap);
  var asset=am.createAsset({assetId:'ast_bad_1',sourceUrl:'http://bad',libraryType:'LEARNING',safetyStatus:'UNSAFE',lifecycleStatus:'DISCOVERED',localPath:img});
  await repo.create(asset);
  var safeSnap=PM.createSnapshot('news:safe',{mode:'news'},mf(),'news');
  var svc=ADS(repo,refIdx,store,cache,hist,toms,aud,cleaner,lg,
    function(a){return Promise.resolve(safeSnap);},
    function(r){return pubSvc.publish(r);}
  );
  var result=await svc.deleteUnsafeAsset({assetId:'ast_bad_1',reason:'UNSAFE',decision:'remove',dryRun:false});
  t('ACTIVE_REPLACEMENT_COMPLETE',result.complete===true,'');
  t('ACTIVE_REPLACEMENT_PUBLISHED',result.activeReplaced===true,'');
  var active=await pubSvc.getActive();
  t('ACTIVE_NO_LONGER_REFERENCES_TARGET',active&&active.payload.photoId!=='ast_bad_1','');
  t('ACTIVE_DELETES_FILE',result.fileDeleted===true,'');
  try{fs.rmdirSync(tmp,{recursive:true})}catch(e){}
  console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');
  process.exit(ec);
}
run().catch(function(e){console.log('CRASH: '+e.message);try{fs.rmdirSync(tmp,{recursive:true})}catch(e2){}process.exit(1)});
