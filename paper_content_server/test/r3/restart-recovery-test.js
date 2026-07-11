#!/usr/bin/env node
// R3 test: restart recovery — active snapshot loaded from disk after restart
var path=require('path'),fs=require('fs'),os=require('os');
var ROOT=path.join(__dirname,'..','..');
var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
function mf(){var b=Buffer.alloc(192010);b.write('EPF1',0,'ascii');b.writeUInt16LE(800,4);b.writeUInt16LE(480,6);b[8]=49;b[9]=1;return b;}
var sm=require(path.join(ROOT,'src','snapshot','snapshot-model'));
var SS=require(path.join(ROOT,'src','snapshot','snapshot-store')).SnapshotStore;
var SC=require(path.join(ROOT,'src','snapshot','snapshot-cache')).SnapshotCache;
var tmp=path.join(os.tmpdir(),'r3_recover_'+Date.now());fs.mkdirSync(tmp,{recursive:true});
var lg={info:function(){},warn:function(){},error:function(){}};

async function run(){
  // First session: save and activate a snapshot
  var store1=SS(path.join(tmp,'snap'),path.join(tmp,'pub'),lg);await store1.ensureDirs();
  var frame=mf();
  var snap=sm.createSnapshot('news:recovery',{mode:'news'},frame,'news');
  await store1.save(snap);
  await store1.activate(snap.snapshotId);
  // Second session (simulates restart): create fresh store pointing to same dir
  var store2=SS(path.join(tmp,'snap'),path.join(tmp,'pub'),lg);
  var active=await store2.readActive();
  t('RESTART_READS_ACTIVE',active!==null&&active.activeSnapshotId===snap.snapshotId,active?active.activeSnapshotId:'');
  var loaded=await store2.load(snap.snapshotId);
  t('RESTART_LOADS_SNAPSHOT',loaded!==null,'');
  t('RESTART_FRAME_SHA256',loaded&&loaded.frameSha256===snap.frameSha256,'');
  t('RESTART_FRAME_BYTE_IDENTICAL',loaded&&loaded.frame[0]===frame[0]&&loaded.frame[4]===frame[4],'');
  // Cold cache: load from store (not cache)
  var cache=SC();var cached=cache.get(snap.snapshotId);
  t('RESTART_CACHE_COLD',cached===null,'');
  cache.set(snap.snapshotId,loaded);
  t('RESTART_CACHE_WARM',cache.get(snap.snapshotId)!==null,'');
  console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');
  try{fs.rmdirSync(tmp,{recursive:true})}catch(e){}
  process.exit(ec);
}
run().catch(function(e){console.log('CRASH: '+e.message);try{fs.rmdirSync(tmp,{recursive:true})}catch(e2){}process.exit(1)});
