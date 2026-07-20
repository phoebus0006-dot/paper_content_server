#!/usr/bin/env node
var path=require('path');var ROOT=path.join(__dirname, '..', '..','..');var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var D=require(path.join(ROOT,'src','custom-library','custom-deduplicator')).createDeduplicator;
var calledWith=null;var fakeRepo={list:function(f){calledWith=f;return Promise.resolve(f.sha256==='dup'?[{assetId:'ast_dup'}]:[]);}};
var d=D(fakeRepo);
(async function(){
var r=await d.isDuplicate('dup');t('DUP_FOUND',r===true,'');
t('CALLED_WITH_DUP',calledWith&&calledWith.sha256==='dup','');
var r2=await d.isDuplicate('new');t('DUP_NOT_FOUND',r2===false,'');
t('CALLED_WITH_NEW',calledWith&&calledWith.sha256==='new','');
console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);})();