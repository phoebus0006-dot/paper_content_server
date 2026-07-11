#!/usr/bin/env node
var path=require('path');var ROOT=path.join(__dirname,'..','..');var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var D=require(path.join(ROOT,'src','learning','learning-deduplicator'));
var d=D.createDeduplicator();
t('FIRST_UNIQUE',!d.isDuplicate({sourceUrl:'http://a.com/1'}),'');
t('SECOND_DUPLICATE_URL',d.isDuplicate({sourceUrl:'http://a.com/1'}),'');
t('UNIQUE_SHA',!d.isDuplicate({sha256:'abc',sourceUrl:'http://b.com'}),'');
// Same sha256 should be duplicate
t('SHA_DUPLICATE',d.isDuplicate({sha256:'abc',sourceUrl:'http://c.com'}),'');
console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);
