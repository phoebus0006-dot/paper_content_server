#!/usr/bin/env node
// R3 test: full EPF1 frame integrity validation via frame-validator
var path=require('path'),fs=require('fs'),os=require('os');
var ROOT=path.join(__dirname,'..','..');
var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
function mf(){var b=Buffer.alloc(192010);b.write('EPF1',0,'ascii');b.writeUInt16LE(800,4);b.writeUInt16LE(480,6);b[8]=49;b[9]=1;return b;}
var sm=require(path.join(ROOT,'src','snapshot','snapshot-model'));
var SS=require(path.join(ROOT,'src','snapshot','snapshot-store')).SnapshotStore;
var SS_ERR=require(path.join(ROOT,'src','snapshot','snapshot-store')).SnapshotIntegrityError;
var tmp=path.join(os.tmpdir(),'r3_fi_'+Date.now());fs.mkdirSync(tmp,{recursive:true});
var lg={info:function(){},warn:function(){},error:function(){}};

async function run(){
  var store=SS(path.join(tmp,'snap'),path.join(tmp,'pub'),lg);await store.ensureDirs();
  // Save valid frame
  var frame=mf();var snap=sm.createSnapshot('news:fi-test',{mode:'news'},frame,'news');
  var sid=snap.snapshotId;await store.save(snap);
  // Load succeeds
  var loaded=await store.load(sid);
  t('VALID_FRAME_LOAD_OK',loaded!==null&&loaded.frameSha256===snap.frameSha256,'');

  // BAD_WIDTH: corrupt width field
  frame=mf();frame.writeUInt16LE(123,4);
  var badW=sm.createSnapshot('bad:w',{mode:'news'},frame,'news');
  try{await store.save(badW);t('BAD_WIDTH_REJECTED',false,'');}
  catch(e){t('BAD_WIDTH_REJECTED',e.code==='SNAPSHOT_INTEGRITY_ERROR'&&e.message.indexOf('Width')>=0,'');}

  // BAD_HEIGHT: corrupt height field
  frame=mf();frame.writeUInt16LE(999,6);
  var badH=sm.createSnapshot('bad:h',{mode:'news'},frame,'news');
  try{await store.save(badH);t('BAD_HEIGHT_REJECTED',false,'');}
  catch(e){t('BAD_HEIGHT_REJECTED',e.code==='SNAPSHOT_INTEGRITY_ERROR'&&e.message.indexOf('Height')>=0,'');}

  // BAD_PANEL: corrupt panel byte
  frame=mf();frame[8]=99;
  var badP=sm.createSnapshot('bad:p',{mode:'news'},frame,'news');
  try{await store.save(badP);t('BAD_PANEL_REJECTED',false,'');}
  catch(e){t('BAD_PANEL_REJECTED',e.code==='SNAPSHOT_INTEGRITY_ERROR'&&e.message.indexOf('Panel')>=0,'');}

  // BAD_VERSION: corrupt version byte
  frame=mf();frame[9]=99;
  var badV=sm.createSnapshot('bad:v',{mode:'news'},frame,'news');
  try{await store.save(badV);t('BAD_VERSION_REJECTED',false,'');}
  catch(e){t('BAD_VERSION_REJECTED',e.code==='SNAPSHOT_INTEGRITY_ERROR'&&e.message.indexOf('Version')>=0,'');}

  // CODE4: set pixel nibble to 4 (code4)
  frame=mf();var px=frame[10];frame[10]=(px&0x0F)|(4<<4);
  var badC4=sm.createSnapshot('bad:c4',{mode:'news'},frame,'news');
  try{await store.save(badC4);t('CODE4_REJECTED',false,'');}
  catch(e){t('CODE4_REJECTED',e.code==='SNAPSHOT_INTEGRITY_ERROR'&&e.message.indexOf('code4')>=0,'');}

  // INVALID_CODE: set pixel nibble to 15 (invalid)
  frame=mf();frame[10]=(frame[10]&0x0F)|(15<<4);
  var badIc=sm.createSnapshot('bad:ic',{mode:'news'},frame,'news');
  try{await store.save(badIc);t('INVALID_CODE_REJECTED',false,'');}
  catch(e){t('INVALID_CODE_REJECTED',e.code==='SNAPSHOT_INTEGRITY_ERROR'&&e.message.indexOf('Invalid codes')>=0,'');}

  // MISSING_FRAME: meta exists but frame file deleted
  var metaF=path.join(tmp,'snap',sid+'.json');var frameF=path.join(tmp,'snap',sid+'.bin');
  t('META_FRAME_EXIST',fs.existsSync(metaF)&&fs.existsSync(frameF),'');
  fs.unlinkSync(frameF);
  try{await store.load(sid);t('MISSING_FRAME_REJECTED',false,'');}
  catch(e){t('MISSING_FRAME_REJECTED',e.code==='SNAPSHOT_INTEGRITY_ERROR'&&e.message.indexOf('frame file missing')>=0,'');}

  // HASH_MISMATCH: tamper frame after save, then verify on load
  frame=mf();var snap2=sm.createSnapshot('news:hash-test',{mode:'news'},frame,'news');
  await store.save(snap2);
  var MetaPath2=path.join(tmp,'snap',snap2.snapshotId+'.json');var meta2=JSON.parse(fs.readFileSync(MetaPath2,'utf8'));
  meta2.frameSha256='0000000000000000000000000000000000000000000000000000000000000000';
  fs.writeFileSync(MetaPath2,JSON.stringify(meta2,null,2)+'\n');
  try{await store.load(snap2.snapshotId);t('HASH_MISMATCH_REJECTED',false,'');}
  catch(e){t('HASH_MISMATCH_REJECTED',e.code==='SNAPSHOT_INTEGRITY_ERROR'&&e.message.indexOf('SHA256')>=0,'');}

  // Snapshot not found returns null (not error)
  var missing=await store.load('nonexistent');
  t('NONEXISTENT_RETURNS_NULL',missing===null,'');

  console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');
  try{fs.rmdirSync(tmp,{recursive:true})}catch(e){}
  process.exit(ec);
}
run().catch(function(e){console.log('CRASH: '+e.message);try{fs.rmdirSync(tmp,{recursive:true})}catch(e2){}process.exit(1)});
