#!/usr/bin/env node
// R5.1: News pipeline parity — behavior unchanged after extraction
var path=require('path');
var ROOT=path.join(__dirname,'..','..');
var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var pipeline=require(path.join(ROOT,'src','news','news-pipeline')).createNewsPipeline;
var p=pipeline({lastGoodFile:''},{info:function(){},warn:function(){},error:function(){}});
t('PIPELINE_EXISTS',typeof p.process==='function','');
var items=[{url:'http://a.com/1',title:'News A',description:'Desc A',source:'Src'},
  {url:'http://b.com/2',title:'News B',description:'Desc B',source:'Src'}];
var result=p.process(items);
t('PIPELINE_COUNT',result.count===2,'');
t('PIPELINE_ITEMS',Array.isArray(result.items)&&result.items.length===2,'');
t('PIPELINE_LAYOUT',result.layout.visibleCards===2,'');
t('PIPELINE_DEDUP',p.process([items[0],items[0]]).count===1,'');
t('LAST_GOOD_EXISTS',typeof p.lastGood.load==='function','');
console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');
process.exit(ec);
