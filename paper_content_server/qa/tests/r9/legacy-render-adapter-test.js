#!/usr/bin/env node
var path=require('path');var ROOT=path.join(__dirname, '..', '..','..');var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var LRA=require(path.join(ROOT,'src','render','legacy-render-adapter'));
t('LRA_EXISTS',typeof LRA.createLegacyRenderAdapter==='function','');
console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);
