#!/usr/bin/env node
var path=require('path');var ROOT=path.join(__dirname, '..', '..','..');var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var CS=require(path.join(ROOT,'src','custom-library','custom-selector')).createCustomSelector;
var ar={list:function(f){return Promise.resolve(f.libraryType==='CUSTOM'&&f.safetyStatus==='SAFE'&&f.lifecycleStatus==='SELECTABLE'?[{assetId:'ast_custom'}]:[]);}};
var sel=CS(ar);
(async function(){var c=await sel.selectCandidates();t('SELECTOR_RETURNS',Array.isArray(c),'');t('SELECTOR_FILTERS',c.length>0,'');
console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);})();