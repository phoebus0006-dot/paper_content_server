#!/usr/bin/env node
// D-schedule-night-contract: night stability via debug clock injection
var path=require('path'),http=require('http'),fs=require('fs');
var ROOT=path.join(__dirname,'..','..'),PORT=8797,BASE='http://127.0.0.1:'+PORT;
var TMPDIR=path.join(ROOT,'test_night_'+Date.now()),ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
function fetch(method,p,body){
  return new Promise(function(r,e){
    var opt={method:method||'GET',hostname:'127.0.0.1',port:PORT,path:p,headers:{}};
    if(body){var b=Buffer.from(JSON.stringify(body));opt.headers['content-type']='application/json';opt.headers['content-length']=b.length}
    var req=http.request(opt,function(s){var d=[];s.on('data',function(c){d.push(c)});s.on('end',function(){r({s:s.statusCode,b:Buffer.concat(d)})})});
    req.on('error',e);if(body)req.end(b);else req.end();req.setTimeout(10000,function(){req.destroy();e(new Error('timeout'))});
  });
}
fs.mkdirSync(TMPDIR,{recursive:true});
var env=Object.assign({},process.env,{PORT:String(PORT),TZ:'Europe/Paris',TRANSLATION_PROVIDER:'none',DATA_DIR:TMPDIR,ENABLE_DEBUG_ROUTES:'true'});
var cp=require('child_process');
var srv=cp.spawn(process.execPath,[path.join(ROOT,'server.js')],{env:env,cwd:ROOT,stdio:['ignore','pipe','pipe']});
async function main(){
  await new Promise(function(res,rej){
    var timer=setInterval(function(){http.get(BASE+'/api/state.json',function(r){r.resume();r.on('end',function(){if(r.statusCode===200){clearInterval(timer);res()}})}).on('error',function(){})},2000);
    setTimeout(function(){clearInterval(timer);srv.kill();rej(new Error('timeout'))},30000);
  });
  console.log('--- server ready ---');
  try{
    // Set clock to 23:00 Paris time (21:00 UTC)
    await fetch('GET','/debug/clock?iso=2026-07-09T21:00:00.000Z');
    var st23=await fetch('GET','/api/state.json');
    var sj23=JSON.parse(st23.b);
    t('23_MODE_PHOTO',sj23.mode==='photo','mode='+sj23.mode);
    var frameId23=sj23.frameId,imgName23=sj23.imageName||'';
    
    // Set clock to 02:00 Paris time (00:00 UTC)
    await fetch('GET','/debug/clock?iso=2026-07-10T00:00:00.000Z');
    var st02=await fetch('GET','/api/state.json');
    var sj02=JSON.parse(st02.b);
    t('02_MODE_PHOTO',sj02.mode==='photo','mode='+sj02.mode);
    var frameId02=sj02.frameId,imgName02=sj02.imageName||'';
    
    // Same image identity
    t('NIGHT_FRAMEID_STABLE',frameId23===frameId02,'23:'+(frameId23||'').slice(0,30)+' 02:'+(frameId02||'').slice(0,30));
    t('NIGHT_IMAGENAME_STABLE',imgName23===imgName02,'23:'+imgName23+' 02:'+imgName02);
  }catch(e){t('TEST_FAIL',false,e.message)}
  
  // Reset clock
  try{await fetch('GET','/debug/clock?reset=1')}catch(e){}
  srv.kill();setTimeout(function(){try{fs.rmdirSync(TMPDIR,{recursive:true})}catch(e){}console.log('=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec)},1000);
}
main().catch(function(e){console.log('FATAL:'+e.message);srv.kill();process.exit(1)});
