#!/usr/bin/env node
var path=require('path');var ROOT=path.join(__dirname, '..', '..','..');var ec=0,pass=0,fail=0;function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var cm=require(path.join(ROOT,'src','custom-library','custom-upload-model'));
var u=cm.createUpload({filePath:'/tmp/test.jpg',originalName:'test.jpg',mimeType:'image/jpeg',fileSize:1024});
t('UPLOAD_EXISTS',u!==null,'');t('UPLOAD_ID',u.uploadId.startsWith('up_'),'');t('FROZEN',Object.isFrozen(u),'');t('STATUS',u.status==='PENDING','');
try{cm.createUpload({});t('REJECT_NO_FILEPATH',false,'');}catch(e){t('REJECT_NO_FILEPATH',true,'');}
console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);