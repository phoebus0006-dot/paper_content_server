#!/usr/bin/env node
var path=require('path'),fs=require('fs'),os=require('os');
var ROOT=path.join(__dirname,'..','..');var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var ARI=require(path.join(ROOT,'src','assets','asset-reference-index')).AssetReferenceIndex;
var SS=require(path.join(ROOT,'src','snapshot','snapshot-store')).SnapshotStore;
var PH=require(path.join(ROOT,'src','publication','publication-history')).PublicationHistory;
var tmp=path.join(os.tmpdir(),'r4_href_'+Date.now());fs.mkdirSync(tmp,{recursive:true});
var lg={info:function(){},warn:function(){},error:function(){}};
async function run(){
  var store=SS(path.join(tmp,'snap'),path.join(tmp,'pub'),lg);await store.ensureDirs();
  var hist=PH(path.join(tmp,'h.json'),lg);
  await hist.append({id:'hist_entry_1',snapshotId:'snap_test',type:'test',assetId:'ast_123'});
  var idx=ARI(tmp,store,hist);
  var refs=await idx.findReferences('ast_123');
  var histRefs=refs.references.filter(function(r){return r.type==='publication_history';});
  t('HISTORY_REF_FOUND',histRefs.length>0,'');
  t('HISTORY_SNAPSHOT_ID',histRefs[0].snapshotId==='snap_test','');
  t('HISTORY_ASSET_ID',histRefs[0].assetId==='ast_123','');
  t('HISTORY_ENTRY_ID',histRefs[0].historyEntryId==='hist_entry_1','');
  try{fs.rmdirSync(tmp,{recursive:true})}catch(e){}
  console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');
  process.exit(ec);
}
run().catch(function(e){console.log('CRASH: '+e.message);process.exit(1)});