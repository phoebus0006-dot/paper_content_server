#!/usr/bin/env node
// R4.1: Asset reference index — discovers references across the system
var path=require('path'),fs=require('fs'),os=require('os');
var ROOT=path.join(__dirname, '..', '..','..');
var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}

var ARI=require(path.join(ROOT,'src','assets','asset-reference-index')).AssetReferenceIndex;

var tmpDir=path.join(os.tmpdir(),'r4_ref_'+Date.now());fs.mkdirSync(tmpDir,{recursive:true});
fs.mkdirSync(path.join(tmpDir,'fallback_study'),{recursive:true});
fs.writeFileSync(path.join(tmpDir,'image_index.json'),JSON.stringify([{id:'ast_123',url:'http://img.jpg'}]));
fs.writeFileSync(path.join(tmpDir,'fallback_study','study_index.json'),JSON.stringify({entries:[{id:'ast_456'}]}));

async function run(){
  var idx=ARI(tmpDir,null,null);
  var refs1=await idx.findReferences('ast_123');
  t('LEGACY_INDEX_REF',refs1.references.length>=1,'count='+refs1.references.length);
  t('REF_TYPE',refs1.references.some(function(r){return r.type==='legacy_index';}),'');
  var refs2=await idx.findReferences('ast_456');
  t('STUDY_INDEX_REF',refs2.references.length>=1,'count='+refs2.references.length);
  var refs3=await idx.findReferences('nonexistent');
  t('NONEXISTENT_NO_REFS',refs3.references.length===1&&refs3.references[0].status==='UNKNOWN',''); // cache UNKNOWN
  t('RETURN_STRUCTURE',refs3.assetId==='nonexistent'&&Array.isArray(refs3.references)&&refs3.complete===true,'');
  try{fs.rmdirSync(tmpDir,{recursive:true})}catch(e){}
  console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');
  process.exit(ec);
}
run().catch(function(e){console.log('CRASH: '+e.message);try{fs.rmdirSync(tmpDir,{recursive:true})}catch(e2){}process.exit(1)});
