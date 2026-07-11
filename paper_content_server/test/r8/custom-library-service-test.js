#!/usr/bin/env node
var path=require('path'),fs=require('fs'),os=require('os');var ROOT=path.join(__dirname,'..','..');var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var SVC=require(path.join(ROOT,'src','custom-library','custom-library-service')).createCustomLibraryService;
var tmp=path.join(os.tmpdir(),'r8_svc2_'+Date.now());fs.mkdirSync(tmp,{recursive:true});var src=path.join(tmp,'src.jpg');fs.writeFileSync(src,'img');
var store={storeQuarantine:function(f){var q=path.join(tmp,'q.jpg');try{fs.copyFileSync(f,q);}catch(e){}return q;},moveToAssets:function(q,id){var f=path.join(tmp,id+'.jpg');try{fs.renameSync(q,f);}catch(e){}return f;},cleanup:function(f){try{fs.unlinkSync(f);}catch(e){}}};
var val={validate:function(u){return u&&u.filePath?{ok:true,errors:[]}:{ok:false,errors:['no file']}}};
var dedup={isDuplicate:function(s){return Promise.resolve(false)}};
var ar={create:function(a){return Promise.resolve(a.assetId)}};
var svc=SVC(store,val,dedup,null,ar,{});
(async function(){var r=await svc.processUpload({filePath:src,originalName:'test.jpg',mimeType:'image/jpeg',fileSize:100});
t('ACCEPTED',r.status==='ACCEPTED','');t('HAS_ASSET_ID',r.assetId!==undefined,'');t('HAS_FINAL_PATH',r.finalPath!==undefined,'');
console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);})();