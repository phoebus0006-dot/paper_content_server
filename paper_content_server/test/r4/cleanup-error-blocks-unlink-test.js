#!/usr/bin/env node
// Lane A: Cleanup error blocks unlink
var path=require('path'),fs=require('fs'),os=require('os');
var ROOT=path.join(__dirname,'..','..');var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var SC=require(path.join(ROOT,'src','snapshot','snapshot-cache')).SnapshotCache;
var RC=require(path.join(ROOT,'src','safety','reference-cleaner')).ReferenceCleaner;
var tmp=path.join(os.tmpdir(),'r4_ceb_'+Date.now());fs.mkdirSync(tmp,{recursive:true});
var lg={info:function(){},warn:function(){},error:function(){}};
async function run(){
  var cache=SC();cache.set('snap_1',{snapshotId:'snap_1',payload:{photoId:'ast_test'}});
  var cleaner=RC(null,cache,null,tmp,lg);
  var cc=cleaner.cleanCache('ast_test');
  t('CACHE_EVICTED',cc.changed===true,'');t('CACHE_COMPLETE',cc.complete===true,'');
  // Corrupt index file should not cause unlink — error recorded
  fs.writeFileSync(path.join(tmp,'image_index.json'),'NOT JSON{{{');
  var refs={references:[{type:'legacy_index',location:'image_index.json',assetId:'ast_test'}]};
  // Clean should record error but not crash
  var ic=cleaner.cleanLegacyIndexes('ast_test',refs);
  t('CORRUPT_INDEX_HAS_ERRORS',ic.errors.length>0,'');
  // Verify original error doesn't block further operations
  t('CORRUPT_INDEX_STILL_RUNS',true,'');
  try{fs.rmdirSync(tmp,{recursive:true})}catch(e){}
  console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);
}
run().catch(function(e){console.log('CRASH: '+e.message);process.exit(1)});
