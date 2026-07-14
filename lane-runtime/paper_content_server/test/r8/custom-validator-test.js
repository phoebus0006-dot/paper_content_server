#!/usr/bin/env node
var path=require('path');var ROOT=path.join(__dirname,'..','..');var ec=0,pass=0,fail=0;function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var V=require(path.join(ROOT,'src','custom-library','custom-validator')).createValidator;
var v=V();
var ok=v.validate({filePath:'/t.jpg',originalName:'test.jpg',mimeType:'image/jpeg',fileSize:1024,width:800,height:600});
t('VALID_OK',ok.ok,'');
var big=v.validate({filePath:'/t.jpg',originalName:'big.jpg',mimeType:'image/jpeg',fileSize:999999999,width:99999,height:99999});
t('TOO_LARGE',!big.ok,'');
var bad=v.validate({filePath:'/t.gif',originalName:'bad.gif',mimeType:'image/gif',fileSize:100});
t('BAD_TYPE',!bad.ok,'');
console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);