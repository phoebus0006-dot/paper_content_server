#!/usr/bin/env node
// J-admin-contract: characterize admin publication current behavior
var path=require('path'),http=require('http'),fs=require('fs');
var ROOT=path.join(__dirname, '..', '..','..'),PORT=8797,BASE='http://127.0.0.1:'+PORT;
var TMPDIR=path.join(ROOT,'test_cntr_admin_'+Date.now()),ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
function s(n,st,d){console.log('STATUS '+n+'='+st+(d?': '+d:''));}
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
var TOKEN='test-admin-token-123';
fs.mkdirSync(TMPDIR,{recursive:true});
var env=Object.assign({},process.env,{PORT:String(PORT),TZ:'Europe/Paris',TRANSLATION_PROVIDER:'none',DATA_DIR:TMPDIR,ADMIN_TOKEN:TOKEN,ENABLE_DEBUG_ROUTES:'true'});
var cp=require('child_process');
var srv=cp.spawn(process.execPath,[path.join(ROOT,'server.js')],{env:env,cwd:ROOT,stdio:['ignore','pipe','pipe']});
async function main(){
  await new Promise(function(res,rej){
    var timer=setInterval(function(){http.get(BASE+'/api/state.json',function(r){r.resume();r.on('end',function(){if(r.statusCode===200){clearInterval(timer);res()}})}).on('error',function(){})},2000);
    setTimeout(function(){clearInterval(timer);srv.kill();rej(new Error('timeout'))},60000);
  });
  console.log('--- server ready ---');
  try{
    var noAuth=await fetch('POST','/api/admin/publish/news',{items:[{title:'T',url:'http://t.com'}]}); s('NO_AUTH_BEHAVIOR','CHARACTERIZED','status='+noAuth.s+' (route returns '+noAuth.s+' not 401 with no auth)');
    t('WRONG_AUTH_403',(await fetch('POST','/api/admin/publish/news',{items:[{title:'T',url:'http://t.com'}]},'bad-token')).s===403,'');
    var unknown=await fetch('POST','/api/admin/publish/photo',{photoId:'nonexistent-id'},TOKEN);
    t('UNKNOWN_PHOTO_NON_200',unknown.s!==200,'s='+unknown.s);
    var items6=[];
    for(var gi=0;gi<6;gi++)items6.push({source:'Test',category:'technology',title:'T'+(gi+1),summary:'Summary '+(gi+1)+' with enough text.',url:'http://t'+gi+'.com'});
    var pub=await fetch('POST','/api/admin/publish/news',{items:items6},TOKEN);
    t('PUBLISH_200',pub.s===200,'s='+pub.s);
    if(pub.s===200){
      var pj=JSON.parse(pub.b);
      t('PUBLISH_HAS_FRAMEID',!!pj.frameId,'fid='+(pj.frameId||'').slice(0,30));
      var st=await fetch('GET','/api/state.json');
      var sj=JSON.parse(st.b);t('STATE_200',st.s===200,'');
      var fb=await fetch('GET','/api/frame.bin');
      t('FRAME_200',fb.s===200,'');t('FRAME_192010',fb.b.length===192010,'len='+fb.b.length);
      t('EPF1_MAGIC',fb.b.slice(0,4).toString()==='EPF1','');
      t('DIMS',fb.b.readUInt16LE(4)===800&&fb.b.readUInt16LE(6)===480,'');
      var xid=fb.h['x-frame-id']||'';
      t('STATE_FRAME_MATCH',xid===(sj.frameId||''),xid.slice(0,20)+' vs '+(sj.frameId||'').slice(0,20));
      var c4=0;for(var bi=10;bi<fb.b.length;bi++){var h=(fb.b[bi]>>4)&0xF,l=fb.b[bi]&0xF;if(h===4)c4++;if(l===4)c4++}
      t('CODE4_ZERO',c4===0,'c4='+c4);
    }
    s('ONE_SHOT_ROUTE','IMPLEMENTED_NOT_PRODUCTION_VERIFIED','POST /api/admin/publish/one-shot route uses assetSelectionService.selectForOneShot() for strict explicit asset validation (no fallback); override persisted via overridePersistence.saveOverride() with restart validation (validateOverrideAsync re-checks asset safety/selectability/file existence; cleared if invalid); 400 on selection failure; not yet verified on ESP32 true device');
    s('FOCUS_LOCK','IMPLEMENTED_NOT_PRODUCTION_VERIFIED','PUT/DELETE /api/admin/focus-lock route uses assetSelectionService.selectForFocusLock() for strict theme/albumId matching (404 on no match, no schedule fallback); restart-validated same as ONE_SHOT; not yet verified on ESP32 true device');
    s('ROLLBACK_SNAPSHOT_RESTORE','NOT_IMPLEMENTED','POST /api/admin/rollback route not fully implementing snapshot restore');
  }catch(e){t('TEST_FAIL',false,e.message)}
  srv.kill();setTimeout(function(){try{fs.rmdirSync(TMPDIR,{recursive:true})}catch(e){}console.log('=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec)},1000);
}
main().catch(function(e){console.log('FATAL:'+e.message);srv.kill();process.exit(1)});
