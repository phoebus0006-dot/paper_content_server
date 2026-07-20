#!/usr/bin/env node
var path=require('path');var ROOT=path.join(__dirname, '..', '..','..');var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var SR=require(path.join(ROOT,'src','learning','learning-source-registry'));
var SP=require(path.join(ROOT,'src','learning','learning-source-port'));
var reg=SR.createSourceRegistry();t('REGISTRY_EXISTS',typeof reg.register==='function','');
var src=SP.createSourcePort({name:'test-src'});reg.register('test',src);
t('GET_SOURCE',reg.get('test')!==null,'');
t('LIST_SOURCES',reg.list().length===1&&reg.list()[0]==='test','');
console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);
