#!/usr/bin/env node
// R4.2B: Reference error semantics — corrupt JSON, missing files, IO errors
var path=require('path'),fs=require('fs'),os=require('os');
var ROOT=path.join(__dirname,'..','..');
var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var ARI=require(path.join(ROOT,'src','assets','asset-reference-index')).AssetReferenceIndex;
var SS=require(path.join(ROOT,'src','snapshot','snapshot-store')).SnapshotStore;

var tmpDir=path.join(os.tmpdir(),'r4_ref_err_'+Date.now());fs.mkdirSync(tmpDir,{recursive:true});
var lg={info:function(){},warn:function(){},error:function(){}};

async function run(){
  fs.mkdirSync(path.join(tmpDir,'fallback_study'),{recursive:true});
  // Corrupt JSON file
  fs.writeFileSync(path.join(tmpDir,'image_index.json'),'NOT VALID JSON{{{');
  fs.writeFileSync(path.join(tmpDir,'fallback_study','study_index.json'),'ALSO BROKEN');

  var store=SS(path.join(tmpDir,'snap'),path.join(tmpDir,'pub'),lg);await store.ensureDirs();
  var idx=ARI(tmpDir,store,null);

  var refs=await idx.findReferences('any_asset');
  // Should NOT crash, should return errors array
  t('RETURNS_WITH_ERRORS',Array.isArray(refs.errors),'');
  t('ERRORS_NOT_EMPTY',refs.errors.length>0,'count='+refs.errors.length);
  t('HAS_INVALID_JSON_ERROR',refs.errors.some(function(e){return e.code==='INVALID_JSON';}),'');
  t('COMPLETE_FLAG',refs.complete!==undefined,'');
  t('REFERENCES_EXIST',Array.isArray(refs.references),'');

  // Missing files (no index at all) should NOT produce errors
  var tmp2=path.join(os.tmpdir(),'r4_ref_empty_'+Date.now());fs.mkdirSync(tmp2,{recursive:true});
  var store2=SS(path.join(tmp2,'snap'),path.join(tmp2,'pub'),lg);await store2.ensureDirs();
  var idx2=ARI(tmp2,store2,null);
  var refs2=await idx2.findReferences('any_asset');
  t('MISSING_FILE_NO_ERROR',refs2.errors.length===0,'');
  t('MISSING_FILE_COMPLETE',refs2.complete===true,'');
  try{fs.rmdirSync(tmp2,{recursive:true})}catch(e){}

  try{fs.rmdirSync(tmpDir,{recursive:true})}catch(e){}
  console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');
  process.exit(ec);
}
run().catch(function(e){console.log('CRASH: '+e.message);try{fs.rmdirSync(tmpDir,{recursive:true})}catch(e2){}process.exit(1)});
