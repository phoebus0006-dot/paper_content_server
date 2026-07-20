#!/usr/bin/env node
var path=require('path'),fs=require('fs'),os=require('os');var ROOT=path.join(__dirname,'..','..');var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var SVC=require(path.join(ROOT,'src','custom-library','custom-library-service')).createCustomLibraryService;
var lg={info:function(){},warn:function(){},error:function(){}};
var tmp=path.join(os.tmpdir(),'r8_svc2_'+Date.now());fs.mkdirSync(tmp,{recursive:true});
var store={
  storeQuarantine:function(buf){var q=path.join(tmp,'q.jpg');fs.writeFileSync(q,buf);return q;},
  decodeAndRecompute:function(q){return Promise.resolve({fileSize:3,sha256:'abc',mimeType:'image/jpeg',width:1,height:1});},
  computeSha256Stream:function(q){return Promise.resolve('abc123');},
  moveToAssets:function(q,id){var f=path.join(tmp,id+'.jpg');try{fs.renameSync(q,f);}catch(e){}return f;},
  cleanup:function(f){try{fs.unlinkSync(f);}catch(e){}}
};
var val={validate:function(u){return u&&u.fileSize!=null?{ok:true,errors:[]}:{ok:false,errors:['no file']}}};
var dedup={isDuplicate:function(s){return Promise.resolve(false)}};
var safetyGate={classify:function(p,m){return Promise.resolve({score:0,category:'safe',modelVersion:'test',scores:{safe:1.0}});},isSafe:function(c){return true},audit:function(e){return Promise.resolve();}};
var ar={create:function(a){return Promise.resolve(a.assetId)}};
var svc=SVC(store,val,dedup,safetyGate,ar,lg);
(async function(){
  var r=await svc.processUpload({fileBuffer:Buffer.from('img'),originalName:'test.jpg',mimeType:'image/jpeg'});
  t('ACCEPTED',r.status==='ACCEPTED',r.status||r.reason||r.error);
  t('HAS_ASSET_ID',r.assetId!==undefined,'');
  t('NO_FINAL_PATH',r.finalPath===undefined,'should not leak finalPath');
  console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);
})();
