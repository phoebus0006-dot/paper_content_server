#!/usr/bin/env node
// C-state-frame-contract: HTTP-level state/frame coherence (starts production server)
var path=require('path'),http=require('http'),fs=require('fs'),os=require('os');
var ROOT=path.join(__dirname,'..','..'),PORT=18700+Math.floor(Math.random()*1000),BASE='http://127.0.0.1:'+PORT;
var TMPDIR=path.join(os.tmpdir(),'test_cntr_c_'+Date.now()),ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
function f(p,to){return new Promise(function(r,e){var q=http.get(BASE+p,function(s){var d=[];s.on('data',function(c){d.push(c)});s.on('end',function(){r({s:s.statusCode,b:Buffer.concat(d),h:s.headers})})});q.on('error',e);q.setTimeout(to||15000,function(){q.destroy();e(new Error('timeout'))})})}
fs.mkdirSync(TMPDIR,{recursive:true});
var env=Object.assign({},process.env,{PORT:String(PORT),TZ:'Europe/Paris',TRANSLATION_PROVIDER:'none',DATA_DIR:TMPDIR,FEEDS_FILE:path.join(TMPDIR,'feeds.json'),NEWS_CACHE_FILE:path.join(TMPDIR,'news_cache.json'),LIBRARY_STATE_FILE:path.join(TMPDIR,'library_state.json'),NEWS_ROTATION_FILE:path.join(TMPDIR,'news_rotation_state.json'),IMAGE_INDEX_FILE:path.join(TMPDIR,'image_index.json'),LAST_GOOD_NEWS_FILE:path.join(TMPDIR,'last_good_news.json'),ADMIN_ACCESS_MODE:'lan',ADMIN_ALLOWED_CIDRS:'127.0.0.0/8'});
var cp=require('child_process');
var srv=cp.spawn(process.execPath,[path.join(ROOT,'server.js')],{env:env,cwd:ROOT,stdio:['ignore','pipe','pipe']});
async function main(){
  await new Promise(function(res,rej){
    var timer=setInterval(function(){http.get(BASE+'/api/state.json',function(r){r.resume();r.on('end',function(){if(r.statusCode===200){clearInterval(timer);res()}})}).on('error',function(){})},2000);
    setTimeout(function(){clearInterval(timer);srv.kill();rej(new Error('timeout'))},60000);
  });
  console.log('--- server ready ---');
  try{
    var st=await f('/api/state.json');t('STATE_200',st.s===200,'s='+st.s);
    var sj=JSON.parse(st.b);var fid=sj.frameId||'';t('STATE_HAS_FRAMEID',!!fid,'fid='+fid.slice(0,40));
    var fsha=sj.frameSha256||'';t('STATE_HAS_FRAMESHA256',!!fsha&&fsha.length===64,'sha='+fsha.slice(0,16));
    var fb=await f('/api/frame.bin');t('FRAME_200',fb.s===200,'s='+fb.s);t('FRAME_192010',fb.b.length===192010,'len='+fb.b.length);
    var xid=fb.h['x-frame-id']||'';t('HAS_X_FRAMEID',!!xid,'xid='+xid.slice(0,40));
    t('STATE_FRAME_MATCH',xid===fid,xid.slice(0,20)+' vs '+fid.slice(0,20));
    t('EPF1_MAGIC',fb.b.slice(0,4).toString()==='EPF1','');
    t('DIMS',fb.b.readUInt16LE(4)===800&&fb.b.readUInt16LE(6)===480,'');
    var c4=0;for(var i=10;i<fb.b.length;i++){var h=(fb.b[i]>>4)&0xF,l=fb.b[i]&0xF;if(h===4)c4++;if(l===4)c4++}
    t('CODE4_ZERO',c4===0,'c4='+c4);
  }catch(e){t('TEST_FAIL',false,e.message)}
  srv.kill();setTimeout(function(){try{fs.rmSync(TMPDIR,{recursive:true,force:true})}catch(e){}console.log('=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec)},1000);
}
main().catch(function(e){console.log('FATAL:'+e.message);srv.kill();process.exit(1)});
