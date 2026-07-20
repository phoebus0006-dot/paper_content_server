#!/usr/bin/env node
// R4.1: Asset repository — create, get, update, list, lifecycle transitions
var path=require('path'),fs=require('fs'),os=require('os');
var ROOT=path.join(__dirname, '..', '..','..');
var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}

var am=require(path.join(ROOT,'src','assets','asset-model'));
var AR=require(path.join(ROOT,'src','assets','asset-repository')).AssetRepository;
var tmp=path.join(os.tmpdir(),'r4_repo_'+Date.now());fs.mkdirSync(tmp,{recursive:true});
var lg={info:function(){},warn:function(){},error:function(){}};

function makeAsset(lifecycle){
  return am.createAsset({sourceUrl:'http://t.com/img.jpg',libraryType:'LEARNING',lifecycleStatus:lifecycle||'DISCOVERED',safetyStatus:'SAFE'});
}

async function run(){
  var repo=AR(path.join(tmp,'repo.json'),lg);
  // 1. Create
  var a=makeAsset();
  var id=await repo.create(a);
  t('CREATE_RETURNS_ID',id===a.assetId,'');
  // 2. Get
  var got=await repo.get(id);
  t('GET_FOUND',got!==null&&got.assetId===id,'');
  t('GET_MATCHES_LIFECYCLE',got.lifecycleStatus==='DISCOVERED','');
  // 3. Get non-existent
  var missing=await repo.get('nope');
  t('GET_MISSING',missing===null,'');
  // 4. Update lifecycle: DISCOVERED -> DOWNLOADED
  await repo.update(id,{lifecycleStatus:'DOWNLOADED'});
  var updated=await repo.get(id);
  t('UPDATE_LIFECYCLE',updated.lifecycleStatus==='DOWNLOADED','');
  // 5. Update lifecycle: DOWNLOADED -> VALIDATED -> SELECTABLE
  await repo.update(id,{lifecycleStatus:'VALIDATED'});
  await repo.update(id,{lifecycleStatus:'SELECTABLE'});
  var selectable=await repo.get(id);
  t('SELECTABLE_STATUS',selectable.lifecycleStatus==='SELECTABLE','');
  t('SELECTABLE_CHECK',am.isSelectable(selectable),'');
  // 6. Block from SELECTABLE
  await repo.markBlocked(id,'policy violation');
  var blocked=await repo.get(id);
  t('BLOCKED_STATUS',blocked.lifecycleStatus==='BLOCKED','');
  t('BLOCKED_REASON',blocked.metadata.blockReason==='policy violation','');
  // 7. Forbidden transition
  try{await repo.update(id,{lifecycleStatus:'SELECTABLE'});t('FORBIDDEN_TRANSITION',false,'');}
  catch(e){t('FORBIDDEN_TRANSITION',true,e.message);}
  // 7b. List with filter (before tombstoning)
  var blockedList=await repo.list({lifecycleStatus:'BLOCKED'});
  t('LIST_FILTER_BLOCKED',blockedList.length===1&&blockedList[0].assetId===id,'');
  // 8. Tombstone
  await repo.markTombstoned(id,'resolved');
  var tomb=await repo.get(id);
  t('TOMBSTONED',tomb.lifecycleStatus==='TOMBSTONED','');
  // 10. List without filter
  var b=makeAsset();await repo.create(b);
  var all=await repo.list();
  t('LIST_ALL',all.length>=2,'');
  // 11. Duplicate create rejects
  try{await repo.create(a);t('DUPLICATE_REJECTED',false,'');}
  catch(e){t('DUPLICATE_REJECTED',true,e.message);}
  // 12. Count
  var cnt=await repo.count();
  t('COUNT',cnt>=2,'');
  console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');
  try{fs.rmdirSync(tmp,{recursive:true})}catch(e){}
  process.exit(ec);
}
run().catch(function(e){console.log('CRASH: '+e.message);try{fs.rmdirSync(tmp,{recursive:true})}catch(e2){}process.exit(1)});
