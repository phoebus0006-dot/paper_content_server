#!/usr/bin/env node
// D-schedule-night-contract: night image stability via production HTTP path
var path=require('path'),http=require('http'),fs=require('fs');
var ROOT=path.join(__dirname,'..','..'),PORT=8797,BASE='http://127.0.0.1:'+PORT;
var TMPDIR=path.join(ROOT,'test_cntr_night_'+Date.now()),ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
function f(p,to){return new Promise(function(r,e){var q=http.get(BASE+p,function(s){var d=[];s.on('data',function(c){d.push(c)});s.on('end',function(){r({s:s.statusCode,b:Buffer.concat(d),h:s.headers})})});q.on('error',e);q.setTimeout(to||15000,function(){q.destroy();e(new Error('timeout'))})})}
fs.mkdirSync(TMPDIR,{recursive:true});
var env=Object.assign({},process.env,{PORT:String(PORT),TZ:'Europe/Paris',TRANSLATION_PROVIDER:'none',DATA_DIR:TMPDIR});
var cp=require('child_process');
var srv=cp.spawn(process.execPath,[path.join(ROOT,'server.js')],{env:env,cwd:ROOT,stdio:['ignore','pipe','pipe']});
async function main(){
  await new Promise(function(res,rej){
    var timer=setInterval(function(){http.get(BASE+'/api/state.json',function(r){r.resume();r.on('end',function(){if(r.statusCode===200){clearInterval(timer);res()}})}).on('error',function(){})},2000);
    setTimeout(function(){clearInterval(timer);srv.kill();rej(new Error('timeout'))},60000);
  });
  console.log('--- server ready ---');
  try{
    var st23=await f('/api/state.json?time='+new Date('2026-07-09T23:00:00Z').getTime());
    var sj23=JSON.parse(st23.b);
    var st02=await f('/api/state.json?time='+new Date('2026-07-10T02:00:00Z').getTime());
    var sj02=JSON.parse(st02.b);
    t('NIGHT_23_MODE_PHOTO',sj23.mode==='photo','mode='+sj23.mode);
    t('NIGHT_02_MODE_PHOTO',sj02.mode==='photo','mode='+sj02.mode);
    t('NIGHT_IMAGE_STABLE',sj23.frameId===sj02.frameId,'23:'+sj23.frameId.slice(0,30)+' 02:'+sj02.frameId.slice(0,30));
    t('NIGHT_IMAGE_NAME_SAME',sj23.imageName===sj02.imageName,'23:'+sj23.imageName+' 02:'+sj02.imageName);
  }catch(e){t('TEST_FAIL',false,e.message)}
  srv.kill();setTimeout(function(){try{fs.rmdirSync(TMPDIR,{recursive:true})}catch(e){}console.log('=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec)},1000);
}
main().catch(function(e){console.log('FATAL:'+e.message);srv.kill();process.exit(1)});
