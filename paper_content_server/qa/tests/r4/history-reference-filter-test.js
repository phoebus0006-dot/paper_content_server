#!/usr/bin/env node
// Lane A: History reference filter — only correct ref types updated
var path=require('path'),fs=require('fs'),os=require('os');
var ROOT=path.join(__dirname, '..', '..','..');var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var ARI=require(path.join(ROOT,'src','assets','asset-reference-index')).AssetReferenceIndex;
var SS=require(path.join(ROOT,'src','snapshot','snapshot-store')).SnapshotStore;
var PH=require(path.join(ROOT,'src','publication','publication-history')).PublicationHistory;
var tmp=path.join(os.tmpdir(),'r4_hfil_'+Date.now());fs.mkdirSync(tmp,{recursive:true});
var lg={info:function(){},warn:function(){},error:function(){}};
async function run(){
  var store=SS(path.join(tmp,'snap'),path.join(tmp,'pub'),lg);await store.ensureDirs();
  var hist=PH(path.join(tmp,'h.json'),lg);
  await hist.append({id:'h1',snapshotId:'snap_hist',type:'test',assetId:'ast_h'});
  var idx=ARI(tmp,store,hist);
  var refs=await idx.findReferences('ast_h');
  var histRefs=refs.references.filter(function(r){return r.type==='publication_history';});
  t('HIST_REF_HAS_SNAPSHOTID',histRefs.length>0&&histRefs[0].snapshotId==='snap_hist','');
  // Should not have matched cache, active, or legacy by accident
  var wrongRefs=refs.references.filter(function(r){return r.type!=='publication_history'&&r.type!=='cache';});
  t('NO_WRONG_REF_TYPES',wrongRefs.length===0,'count='+wrongRefs.length);
  try{fs.rmdirSync(tmp,{recursive:true})}catch(e){}
  console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);
}
run().catch(function(e){console.log('CRASH: '+e.message);process.exit(1)});
