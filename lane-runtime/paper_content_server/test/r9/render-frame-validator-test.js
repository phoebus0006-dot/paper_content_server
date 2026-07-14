#!/usr/bin/env node
var path=require('path');var ROOT=path.join(__dirname,'..','..');var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var V=require(path.join(ROOT,'src','render','render-result-validator'));
var buf=Buffer.alloc(192010);buf.write('EPF1',0,'ascii');buf.writeUInt16LE(800,4);buf.writeUInt16LE(480,6);buf[8]=49;buf[9]=1;
t('GOOD_FRAME',V.validate({frame:buf}).ok===true,'');
var bad=Buffer.alloc(100);bad.write('BAD!');
t('BAD_FRAME',V.validate({frame:bad}).ok===false,'');
t('NO_FRAME',!V.validate({}).ok,'');
console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);
