#!/usr/bin/env node
// R3 test: snapshot corruption detection — corrupt meta/frame/hash
var path=require('path'),fs=require('fs'),os=require('os');
var ROOT=path.join(__dirname,'..','..');
var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
function mf(s){var b=Buffer.alloc(s||16,0xAA);b.write('EPF1',0,'ascii');return b;}
var sm=require(path.join(ROOT,'src','snapshot','snapshot-model'));
var SS=require(path.join(ROOT,'src','snapshot','snapshot-store')).SnapshotStore;
var tmp=path.join(os.tmpdir(),'r3_corrupt_'+Date.now());fs.mkdirSync(tmp,{recursive:true});
var lg={info:function(){},warn:function(){},error:function(){}};

async function run(){
  var store=SS(path.join(tmp,'snap'),path.join(tmp,'pub'),lg);await store.ensureDirs();
  // Save valid snapshot
  var frame=mf(192010);
  var snap=sm.createSnapshot('news:corrupt-test',{mode:'news'},frame,'news');
  await store.save(snap);
  var sid=snap.snapshotId;
  // 1. Corrupt metadata: wrong frameSha256
  var metaP=path.join(tmp,'snap',sid+'.json');
  var meta=JSON.parse(fs.readFileSync(metaP,'utf8'));
  meta.frameSha256='0000000000000000000000000000000000000000000000000000000000000000';
  fs.writeFileSync(metaP,JSON.stringify(meta,null,2)+'\n');
  try{await store.load(sid);t('CORRUPT_HASH',false,'');}
  catch(e){t('CORRUPT_HASH',e.code==='SNAPSHOT_INTEGRITY_ERROR',e.code);}
  // 2. Corrupt frame: change bytes
  meta.frameSha256=snap.frameSha256;fs.writeFileSync(metaP,JSON.stringify(meta,null,2)+'\n');
  var frameP=path.join(tmp,'snap',sid+'.bin');
  var buf=fs.readFileSync(frameP);buf[100]=0xFF;fs.writeFileSync(frameP,buf);
  try{await store.load(sid);t('CORRUPT_FRAME',false,'');}
  catch(e){t('CORRUPT_FRAME',e.code==='SNAPSHOT_INTEGRITY_ERROR',e.code);}
  // 3. Missing frame file
  fs.unlinkSync(frameP);
  var loaded=await store.load(sid);
  t('MISSING_FRAME',loaded===null,'');
  // 4. Invalid EPF1 magic
  fs.writeFileSync(frameP,Buffer.alloc(192010,0xFF));
  try{await store.load(sid);t('INVALID_MAGIC',false,'');}
  catch(e){t('INVALID_MAGIC',e.code==='SNAPSHOT_INTEGRITY_ERROR',e.code);}
  console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');
  try{fs.rmdirSync(tmp,{recursive:true})}catch(e){}
  process.exit(ec);
}
run().catch(function(e){console.log('CRASH: '+e.message);try{fs.rmdirSync(tmp,{recursive:true})}catch(e2){}process.exit(1)});
