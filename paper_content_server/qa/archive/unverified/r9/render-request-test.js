#!/usr/bin/env node
var path=require('path');var ROOT=path.join(__dirname,'..','..');var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var RR=require(path.join(ROOT,'src','render','render-request'));
var rp=require(path.join(ROOT,'src','render','render-profile'));
var req=RR.createRenderRequest({text:'hello'},rp.DEFAULT_PROFILE);
t('REQUEST_EXISTS',req!==null,'');t('REQUEST_ID',req.requestId.startsWith('req_'),'');
t('CONTENT',req.content.text==='hello','');t('PROFILE',req.profile.width===800,'');
console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);
