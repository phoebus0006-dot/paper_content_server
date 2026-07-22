#!/usr/bin/env node
var path=require('path'),http=require('http'),fs=require('fs'),os=require('os'),net=require('net'),crypto=require('crypto');
var cp=require('child_process');
var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
function s(n,st,d){console.log('STATUS '+n+'='+st+(d?': '+d:''));}
function sha256(buf){return crypto.createHash('sha256').update(buf).digest('hex')}
function fetch(method,p,body,token){
  return new Promise(function(r,e){
    var opt={method:method,hostname:'127.0.0.1',port:PORT,path:p,headers:{}};
    if(token)opt.headers['authorization']='Bearer '+token;
    if(body){var b=Buffer.from(JSON.stringify(body));opt.headers['content-type']='application/json';opt.headers['content-length']=b.length}
    var req=http.request(opt,function(s){var d=[];s.on('data',function(c){d.push(c)});s.on('end',function(){r({s:s.statusCode,b:Buffer.concat(d),h:s.headers})})});
    req.on('error',e);if(body)req.end(b);else req.end();
    req.setTimeout(15000,function(){req.destroy();e(new Error('timeout'))});
  });
}
function findFreePort(){
  return new Promise(function(res,rej){
    var s=net.createServer();s.listen(0,'127.0.0.1',function(){var p=s.address().port;s.close(function(){res(p)})});s.on('error',rej);
  });
}
var PORT,TMPDIR,TOKEN='test-admin-token-123';
var DATA_DIR=path.join(__dirname,'..','..','data');
var TRACKED_FILES=['raw_index.json','image_index.json','library_state.json','news_cache.json','news_rotation_state.json','feeds.json','last_good_news.json'];
async function main(){
  PORT=await findFreePort();
  TMPDIR=path.join(os.tmpdir(),'j-admin-'+Date.now());
  fs.mkdirSync(TMPDIR,{recursive:true});
  var pngSrc=path.join(__dirname,'..','..','resources','fallback-study','fb-color.png');
  var pngDst=path.join(TMPDIR,'fb-color.png');
  fs.copyFileSync(pngSrc,pngDst);
  var BASE='http://127.0.0.1:'+PORT;
  var env=Object.assign({},process.env,{
    PORT:String(PORT),TZ:'Europe/Paris',TRANSLATION_PROVIDER:'none',
    DATA_DIR:TMPDIR,
    FEEDS_FILE:path.join(TMPDIR,'feeds.json'),
    IMAGE_INDEX_FILE:path.join(TMPDIR,'image_index.json'),
    LIBRARY_STATE_FILE:path.join(TMPDIR,'library_state.json'),
    NEWS_CACHE_FILE:path.join(TMPDIR,'news_cache.json'),
    NEWS_ROTATION_FILE:path.join(TMPDIR,'news_rotation_state.json'),
    LAST_GOOD_NEWS_FILE:path.join(TMPDIR,'last_good_news.json'),
    RAW_IMAGES_DIR:path.join(TMPDIR,'raw_images'),
    PROCESSED_IMAGES_DIR:path.join(TMPDIR,'processed_images'),
    IMPORT_IMAGES_DIR:path.join(TMPDIR,'import_images'),
    IMAGE_ROOT:TMPDIR,
    ADMIN_TOKEN:TOKEN,ENABLE_DEBUG_ROUTES:'true'
  });
  var srv=cp.spawn(process.execPath,[path.join(__dirname,'..','..','server.js')],{env:env,cwd:path.join(__dirname,'..','..'),stdio:['ignore','pipe','pipe']});
  var beforeHashes={};
  for(var fi=0;fi<TRACKED_FILES.length;fi++){
    var fp=path.join(DATA_DIR,TRACKED_FILES[fi]);
    try{beforeHashes[TRACKED_FILES[fi]]=sha256(fs.readFileSync(fp))}catch(e){beforeHashes[TRACKED_FILES[fi]]=null}
  }
  await new Promise(function(res,rej){
    var timer=setInterval(function(){http.get(BASE+'/api/state.json',function(r){r.resume();r.on('end',function(){if(r.statusCode===200){clearInterval(timer);res()}})}).on('error',function(){})},2000);
    setTimeout(function(){clearInterval(timer);srv.kill();rej(new Error('timeout'))},60000);
  });
  console.log('--- server ready ---');
  try{
    var noAuth=await fetch('GET','/api/admin/dashboard');t('NO_AUTH_401',noAuth.s===401,'s='+noAuth.s);
    var wrongAuth=await fetch('GET','/api/admin/dashboard',null,'bad-token');t('WRONG_AUTH_403',wrongAuth.s===403,'s='+wrongAuth.s);
    var unknown=await fetch('POST','/api/admin/publish/photo',{photoId:'nonexistent-id'},TOKEN);
    t('UNKNOWN_PHOTO_NON_200',unknown.s!==200,'s='+unknown.s);
    var items6=[];
    for(var gi=0;gi<6;gi++)items6.push({source:'Test',category:'technology',title:'T'+(gi+1),summary:'Summary '+(gi+1)+' with enough text.',url:'http://t'+gi+'.com'});
    var draft=await fetch('POST','/api/admin/news/draft',{items:items6},TOKEN);
    t('DRAFT_200',draft.s===200,'s='+draft.s);
    var pubNoApprove=await fetch('POST','/api/admin/publish/news',{},TOKEN);
    t('PRE_APPROVE_409',pubNoApprove.s===409,'s='+pubNoApprove.s);
    if(pubNoApprove.s===409){
      var pj=JSON.parse(pubNoApprove.b);
      t('NEWS_REVIEW_REQUIRED',pj.error&&pj.error.code==='NEWS_REVIEW_REQUIRED','code='+(pj.error&&pj.error.code));
    }
    var approve=await fetch('POST','/api/admin/news/draft/approve-all',{},TOKEN);
    t('APPROVE_200',approve.s===200,'s='+approve.s);
    var pub=await fetch('POST','/api/admin/publish/news',{},TOKEN);
    t('PUBLISH_200',pub.s===200,'s='+pub.s);
    var firstFrameId=null,firstSnapshotId=null,firstFrameSha=null,firstFrameBytes=null;
    if(pub.s===200){
      var pj=JSON.parse(pub.b);
      firstFrameId=pj.frameId;firstSnapshotId=pj.snapshotId;firstFrameSha=pj.frameSha256;
      t('PUBLISH_HAS_FRAMEID',!!firstFrameId,'fid='+(firstFrameId||'').slice(0,30));
      var st=await fetch('GET','/api/state.json');
      var sj=JSON.parse(st.b);t('STATE_200',st.s===200,'');
      t('STATE_FRAMEID_MATCHES_PUB',sj.frameId===firstFrameId,'');
      t('STATE_SNAPSHOTID_MATCHES_PUB',sj.snapshotId===firstSnapshotId,'');
      t('STATE_OPERATING_MODE',sj.operatingMode==='LEGACY_ADMIN_OVERRIDE','mode='+sj.operatingMode);
      if(sj.items&&sj.items.length===6){
        t('STATE_SIX_ITEMS',true,'');
        for(var si=0;si<6;si++){
          t('ITEM_TITLE_'+si,sj.items[si].originalTitle==='T'+(si+1),'got='+sj.items[si].originalTitle);
          t('ITEM_URL_'+si,sj.items[si].sourceUrl==='http://t'+si+'.com','got='+sj.items[si].sourceUrl);
        }
      }else{
        t('STATE_SIX_ITEMS',false,'count='+((sj.items)||'undefined').length);
      }
      var fb=await fetch('GET','/api/frame.bin');
      t('FRAME_200',fb.s===200,'');
      t('FRAME_192010',fb.b.length===192010,'len='+fb.b.length);
      t('EPF1_MAGIC',fb.b.slice(0,4).toString()==='EPF1','');
      t('DIMS',fb.b.readUInt16LE(4)===800&&fb.b.readUInt16LE(6)===480,'');
      var xid=fb.h['x-frame-id']||'';
      t('FRAME_XID_MATCHES_STATE',xid===sj.frameId,xid.slice(0,20)+' vs '+(sj.frameId||'').slice(0,20));
      t('FRAME_XID_MATCHES_FRAMEID',xid===firstFrameId,'');
      var c4=0;for(var bi=10;bi<fb.b.length;bi++){var h=(fb.b[bi]>>4)&0xF,l=fb.b[bi]&0xF;if(h===4)c4++;if(l===4)c4++}
      t('CODE4_ZERO',c4===0,'c4='+c4);
      firstFrameBytes=Buffer.from(fb.b);
    }
    var items6b=[];
    var secondTitles=['Alpha','Beta','Gamma','Delta','Epsilon','Zeta'];
    var secondCategories=['science','health','sports','business','art','world'];
    var secondSources=['NewsWire','AFP','Reuters','AP','BBC','CNN'];
    var secondUrls=['http://alpha.news','http://beta.news','http://gamma.news','http://delta.news','http://epsilon.news','http://zeta.news'];
    for(var gi=0;gi<6;gi++)items6b.push({source:secondSources[gi],category:secondCategories[gi],title:secondTitles[gi],summary:'Second wave summary item '+(gi+1)+' with enough detail.',url:secondUrls[gi]});
    var draftB=await fetch('POST','/api/admin/news/draft',{items:items6b},TOKEN);
    t('DRAFT_B_200',draftB.s===200,'s='+draftB.s);
    var approveB=await fetch('POST','/api/admin/news/draft/approve-all',{},TOKEN);
    t('APPROVE_B_200',approveB.s===200,'s='+approveB.s);
    var pubB=await fetch('POST','/api/admin/publish/news',{},TOKEN);
    t('PUBLISH_B_200',pubB.s===200,'s='+pubB.s);
    if(pubB.s===200){
      var pjB=JSON.parse(pubB.b);
      t('PUBLISH_B_HAS_FRAMEID',!!pjB.frameId,'fid='+(pjB.frameId||'').slice(0,30));
      if(firstFrameId&&pjB.frameId)t('FRAMEID_DIFFERS',firstFrameId!==pjB.frameId,'');
      if(firstFrameSha&&pjB.frameSha256)t('FRAMESHA_DIFFERS',firstFrameSha!==pjB.frameSha256,'');
      // Call state.json first to update pin to the second snapshot
      await fetch('GET','/api/state.json');
      var fbB=await fetch('GET','/api/frame.bin');
      if(fbB.s===200&&firstFrameBytes){
        t('FRAME_BYTES_DIFFER',!firstFrameBytes.equals(fbB.b),'');
      }
    }
    if(firstSnapshotId){
      var roll=await fetch('POST','/api/admin/rollback',{snapshotId:firstSnapshotId},TOKEN);
      t('ROLLBACK_200',roll.s===200,'s='+roll.s);
      if(roll.s===200&&firstFrameId&&firstFrameSha&&firstFrameBytes){
        var stR=await fetch('GET','/api/state.json');
        var sjR=JSON.parse(stR.b);t('ROLLBACK_STATE_200',stR.s===200,'');
        t('ROLLBACK_STATE_SNAPSHOTID',sjR.snapshotId===firstSnapshotId,'got='+sjR.snapshotId);
        t('ROLLBACK_STATE_FRAMEID',sjR.frameId===firstFrameId,'got='+sjR.frameId);
        t('ROLLBACK_STATE_FRAMESHA256',sjR.frameSha256===firstFrameSha,'');
        var fbR=await fetch('GET','/api/frame.bin');
        t('ROLLBACK_FRAME_200',fbR.s===200,'');
        t('ROLLBACK_XFRAMEID',(fbR.h['x-frame-id']||'')===firstFrameId,'');
        t('ROLLBACK_EPF1',fbR.b.slice(0,4).toString()==='EPF1','');
        t('ROLLBACK_FRAME_192010',fbR.b.length===192010,'len='+fbR.b.length);
        t('ROLLBACK_FRAME_BYTES_MATCH',firstFrameBytes.equals(fbR.b),'');
        t('ROLLBACK_FRAME_SHA256',sha256(fbR.b)===firstFrameSha,'');
      }
    }else{
      t('ROLLBACK_SKIPPED',false,'no firstSnapshotId');
    }
    var photoId='test-photo-1';
    fs.writeFileSync(path.join(TMPDIR,'image_index.json'),JSON.stringify([{id:photoId,processedPngPath:pngDst,safetyStatus:'SAFE',reviewStatus:'APPROVED',theme:'PHOTO',kind:'shot',source:'test',imageName:'fb-color.png'}],null,2));
    var photoPub=await fetch('POST','/api/admin/publish/photo',{photoId:photoId},TOKEN);
    t('PHOTO_PUBLISH_200',photoPub.s===200,'s='+photoPub.s);
    if(photoPub.s===200){
      var ppj=JSON.parse(photoPub.b);
      t('PHOTO_HAS_FRAMEID',!!ppj.frameId,'fid='+(ppj.frameId||'').slice(0,30));
      t('PHOTO_HAS_SNAPSHOTID',!!ppj.snapshotId,'sid='+(ppj.snapshotId||'').slice(0,30));
      t('PHOTO_HAS_FRAMESHA256',!!ppj.frameSha256,'sha='+(ppj.frameSha256||'').slice(0,16));
      var stP=await fetch('GET','/api/state.json');
      var sjP=JSON.parse(stP.b);t('PHOTO_STATE_200',stP.s===200,'');
      t('PHOTO_OPMODE_LEGACY',sjP.operatingMode==='LEGACY_ADMIN_OVERRIDE','mode='+sjP.operatingMode);
      var fbP=await fetch('GET','/api/frame.bin');
      t('PHOTO_FRAME_200',fbP.s===200,'');
      t('PHOTO_XFRAMEID_MATCHES_STATE',(fbP.h['x-frame-id']||'')===sjP.frameId,'');
      t('PHOTO_XFRAMEID_MATCHES_RESPONSE',(fbP.h['x-frame-id']||'')===ppj.frameId,'');
    }
    // --- PHOTO VALIDATION: fail-closed on invalid input ---
    var photoFailState = JSON.parse((await fetch('GET','/api/state.json')).b.toString());
    var noBody = await fetch('POST','/api/admin/publish/photo',{},TOKEN);
    t('PHOTO_NO_BODY_400',noBody.s===400,'s='+noBody.s);
    var emptyId = await fetch('POST','/api/admin/publish/photo',{photoId:''},TOKEN);
    t('PHOTO_EMPTY_ID_400',emptyId.s===400,'s='+emptyId.s);
    var missingFileId = 'test-photo-missing-file';
    fs.writeFileSync(path.join(TMPDIR,'image_index.json'),JSON.stringify([{id:missingFileId,processedPngPath:path.join(TMPDIR,'nonexistent.png'),safetyStatus:'SAFE',reviewStatus:'APPROVED',theme:'PHOTO',kind:'shot',source:'test',imageName:'missing.png'}],null,2));
    var missingFile = await fetch('POST','/api/admin/publish/photo',{photoId:missingFileId},TOKEN);
    t('PHOTO_MISSING_FILE_400',missingFile.s===400,'s='+missingFile.s);
    var badFileId = 'test-photo-bad-file';
    fs.writeFileSync(path.join(TMPDIR,'not-an-image.txt'),'this is not an image file');
    fs.writeFileSync(path.join(TMPDIR,'image_index.json'),JSON.stringify([{id:badFileId,processedPngPath:path.join(TMPDIR,'not-an-image.txt'),safetyStatus:'SAFE',reviewStatus:'APPROVED',theme:'PHOTO',kind:'shot',source:'test',imageName:'not-an-image.txt'}],null,2));
    var badFile = await fetch('POST','/api/admin/publish/photo',{photoId:badFileId},TOKEN);
    t('PHOTO_BAD_FILE_400',badFile.s===400,'s='+badFile.s);
    var photoFailStateAfter = JSON.parse((await fetch('GET','/api/state.json')).b.toString());
    t('PHOTO_FAIL_STATE_SNAPSHOTID_UNCHANGED',photoFailStateAfter.snapshotId===photoFailState.snapshotId,'before='+photoFailState.snapshotId+' after='+photoFailStateAfter.snapshotId);
    // Restore valid entry for remaining tests
    fs.writeFileSync(path.join(TMPDIR,'image_index.json'),JSON.stringify([{id:photoId,processedPngPath:pngDst,safetyStatus:'SAFE',reviewStatus:'APPROVED',theme:'PHOTO',kind:'shot',source:'test',imageName:'fb-color.png'}],null,2));
    console.log('--- NEWS PUBLISH VALIDATION ---');
    var rejAll=await fetch('POST','/api/admin/news/draft/reject-all',{},TOKEN);
    t('REJECT_ALL_200',rejAll.s===200,'s='+rejAll.s);
    var pubRej=await fetch('POST','/api/admin/publish/news',{},TOKEN);
    t('PUBLISH_AFTER_REJECT_409',pubRej.s===409,'s='+pubRej.s);
    var dp=path.join(TMPDIR,'admin_news_draft.json');
    var d5=JSON.parse(fs.readFileSync(dp,'utf8'));
    d5.items=d5.items.slice(0,5);
    fs.writeFileSync(dp,JSON.stringify(d5,null,2));
    var pub5=await fetch('POST','/api/admin/publish/news',{},TOKEN);
    t('PUBLISH_5_ITEMS_400_OR_409',pub5.s===400||pub5.s===409,'s='+pub5.s);
    var items6c=[];
    for(var tc=0;tc<6;tc++)items6c.push({source:'Val',category:'tech',title:'Val'+(tc+1),summary:'Validation item '+(tc+1)+' with enough text.',url:'http://val'+(tc+1)+'.com'});
    var draftC=await fetch('POST','/api/admin/news/draft',{items:items6c},TOKEN);
    t('DRAFT_C_200',draftC.s===200,'s='+draftC.s);
    var approveC=await fetch('POST','/api/admin/news/draft/approve-all',{},TOKEN);
    t('APPROVE_C_200',approveC.s===200,'s='+approveC.s);
    var pubC=await fetch('POST','/api/admin/publish/news',{},TOKEN);
    t('PUBLISH_6_APPROVED_200',pubC.s===200,'s='+pubC.s);

    var delOverride=await fetch('DELETE','/api/admin/override',null,TOKEN);
    t('OVERRIDE_DELETE_200',delOverride.s===200,'s='+delOverride.s);
    if(delOverride.s===200){
      var stD=await fetch('GET','/api/state.json');
      var sjD=JSON.parse(stD.b);t('OVERRIDE_DEL_STATE_200',stD.s===200,'');
      t('OVERRIDE_DEL_AUTO_MODE',sjD.operatingMode==='AUTO','mode='+sjD.operatingMode);
      var fbD=await fetch('GET','/api/frame.bin');
      t('OVERRIDE_DEL_FRAME_200',fbD.s===200,'');
      t('OVERRIDE_DEL_XFRAMEID_MATCHES',(fbD.h['x-frame-id']||'')===sjD.frameId,'');
    }
    s('ONE_SHOT_ROUTE','IMPLEMENTED_NOT_PRODUCTION_VERIFIED','POST /api/admin/publish/one-shot route uses assetSelectionService.selectForOneShot() for strict explicit asset validation (no fallback); override persisted via overridePersistence.saveOverride() with restart validation (validateOverrideAsync re-checks asset safety/selectability/file existence; cleared if invalid); 400 on selection failure; not yet verified on ESP32 true device');
    s('FOCUS_LOCK','IMPLEMENTED_NOT_PRODUCTION_VERIFIED','PUT/DELETE /api/admin/focus-lock route uses assetSelectionService.selectForFocusLock() for strict theme/albumId matching (404 on no match, no schedule fallback); restart-validated same as ONE_SHOT; not yet verified on ESP32 true device');
  }catch(e){t('TEST_FAIL',false,e.message)}
  finally{
    for(var fi=0;fi<TRACKED_FILES.length;fi++){
      var fp=path.join(DATA_DIR,TRACKED_FILES[fi]);
      var afterHash=null;
      try{afterHash=sha256(fs.readFileSync(fp))}catch(e){afterHash=null}
      t('DATA_INTEGRITY_'+TRACKED_FILES[fi].toUpperCase().replace(/\./g,'_'),afterHash===beforeHashes[TRACKED_FILES[fi]],'before='+beforeHashes[TRACKED_FILES[fi]]+' after='+afterHash);
    }
    srv.kill();
    setTimeout(function(){try{fs.rmSync(TMPDIR,{recursive:true,force:true})}catch(e){}console.log('=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec)},1000);
  }
}
main().catch(function(e){console.log('FATAL:'+e.message);srv.kill();process.exit(1)});
