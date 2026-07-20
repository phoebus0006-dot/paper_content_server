#!/usr/bin/env node
var path=require('path'),fs=require('fs'),os=require('os');var ROOT=path.join(__dirname, '..', '..','..');var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var SC=require(path.join(ROOT,'src','snapshot','snapshot-cache')).SnapshotCache;
var RC=require(path.join(ROOT,'src','safety','reference-cleaner')).ReferenceCleaner;
var tmp=path.join(os.tmpdir(),'r4_aco_'+Date.now());fs.mkdirSync(tmp,{recursive:true});
var lg={info:function(){},warn:function(){},error:function(){}};
async function run(){
  var cache=SC();cache.set('s1',{snapshotId:'s1',payload:{photoId:'ast_aco'}});
  var cleaner=RC(null,cache,null,tmp,lg);
  var cc=cleaner.cleanCache('ast_aco');
  t('CACHE_EVICTED',cc.changed===true,'');t('CACHE_COMPLETE',cc.complete===true,'');
  t('CACHE_GONE',cache.get('s1')===null,'');
  try{fs.rmdirSync(tmp,{recursive:true})}catch(e){}
  console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);
}
run().catch(function(e){console.log('CRASH: '+e.message);process.exit(1)});
