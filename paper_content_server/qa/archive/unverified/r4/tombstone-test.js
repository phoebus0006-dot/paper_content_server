#!/usr/bin/env node
// R4.2C: Tombstone contains no image bytes, only metadata
var path=require('path'),fs=require('fs'),os=require('os');
var ROOT=path.join(__dirname,'..','..');
var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var TS=require(path.join(ROOT,'src','safety','tombstone-store')).TombstoneStore;
var tmpDir=path.join(os.tmpdir(),'r4_tomb_'+Date.now());fs.mkdirSync(tmpDir,{recursive:true});
var lg={info:function(){},warn:function(){},error:function(){}};

async function run(){
  var store=TS(path.join(tmpDir,'tombstones'),lg);
  var record={assetId:'ast_del_001',reason:'UNSAFE',decision:'remove',deletedAt:new Date().toISOString(),
    originalSha256:'abc123',sourceType:'web',libraryType:'LEARNING',referencesCleaned:5,auditId:'aud_001'};
  await store.write(record);

  // Read back
  var read=await store.read('ast_del_001');
  t('TOMBSTONE_EXISTS',read!==null,'');
  t('TOMBSTONE_ASSET_ID',read.assetId==='ast_del_001','');
  t('TOMBSTONE_REASON',read.reason==='UNSAFE','');
  t('TOMBSTONE_NO_IMAGE_BYTES',read.imageBytes===undefined,'');
  t('TOMBSTONE_NO_SENSITIVE_DATA',read.token===undefined&&read.password===undefined,'');

  // List
  var list=await store.list();
  t('TOMBSTONE_LIST',list.length===1&&list[0]==='ast_del_001','');

  // Non-existent
  var missing=await store.read('nonexistent');
  t('TOMBSTONE_MISSING',missing===null,'');

  // Reject empty assetId
  try{await store.write({reason:'test'});t('TOMBSTONE_REQUIRES_ID',false,'');}
  catch(e){t('TOMBSTONE_REQUIRES_ID',true,e.message);}

  try{fs.rmdirSync(tmpDir,{recursive:true})}catch(e){}
  console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');
  process.exit(ec);
}
run().catch(function(e){console.log('CRASH: '+e.message);try{fs.rmdirSync(tmpDir,{recursive:true})}catch(e2){}process.exit(1)});
