#!/usr/bin/env node
// Lane A: Reference cleaner integration
var path=require('path'),fs=require('fs'),os=require('os');
var ROOT=path.join(__dirname,'..','..');var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var SC=require(path.join(ROOT,'src','snapshot','snapshot-cache')).SnapshotCache;
var RC=require(path.join(ROOT,'src','safety','reference-cleaner')).ReferenceCleaner;
var tmp=path.join(os.tmpdir(),'r4_rcint_'+Date.now());fs.mkdirSync(tmp,{recursive:true});
var lg={info:function(){},warn:function(){},error:function(){}};
async function run(){
  var cache=SC();cache.set('snap_1',{snapshotId:'snap_1',payload:{photoId:'ast_clean'}});
  var cleaner=RC(null,cache,null,tmp,lg);
  var cc=cleaner.cleanCache('ast_clean');
  t('CACHE_EVICTED',cc.cleaned===true,'');
  t('CACHE_GONE',cache.get('snap_1')===null,'');
  var cc2=cleaner.cleanCache('nonexistent');
  t('CACHE_NO_OP',cc2.cleaned===false,'');
  // Legacy index cleanup
  var refs={references:[{type:'legacy_index',location:'image_index.json',assetId:'ast_legacy'}]};
  fs.writeFileSync(path.join(tmp,'image_index.json'),JSON.stringify([{id:'ast_legacy'},{id:'other'}]));
  var ic=cleaner.cleanLegacyIndexes('ast_legacy',refs);
  t('INDEX_CLEANED',ic.legacyIndexCleaned===true,'');
  var idx=JSON.parse(fs.readFileSync(path.join(tmp,'image_index.json'),'utf8'));
  t('INDEX_ENTRY_REMOVED',idx.length===1&&idx[0].id==='other','');
  try{fs.rmdirSync(tmp,{recursive:true})}catch(e){}
  console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);
}
run().catch(function(e){console.log('CRASH: '+e.message);process.exit(1)});
