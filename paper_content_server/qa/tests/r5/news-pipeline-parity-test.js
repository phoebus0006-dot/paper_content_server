#!/usr/bin/env node
// R5.1: News pipeline parity — behavior unchanged after extraction
var path=require('path'),os=require('os');
var ROOT=path.join(__dirname, '..', '..','..');
var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var pipeline=require(path.join(ROOT,'src','news','news-pipeline')).createNewsPipeline;
var lg={info:function(){},warn:function(){},error:function(){}};
async function run(){
  var p=pipeline({lastGoodFile:path.join(os.tmpdir(),'r5p_'+Date.now()+'.json'),provider:'none'},lg);
  t('PIPELINE_EXISTS',typeof p.run==='function','');
  var items=[{url:'http://a.com/1',title:'News A',description:'Desc A',source:'Src'},
    {url:'http://b.com/2',title:'News B',description:'Desc B',source:'Src'}];
  var result=await p.run(items);
  t('PIPELINE_COUNT',result.count===2,'');
  t('PIPELINE_ITEMS',Array.isArray(result.items)&&result.items.length===2,'');
  t('PIPELINE_LAYOUT',result.layout.visibleCards===2,'');
  t('PIPELINE_DEDUP',(await p.run([items[0],items[0]])).count===1,'');
  t('LAST_GOOD_EXISTS',typeof p.lastGood.load==='function','');
  console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');
  process.exit(ec);
}
run().catch(function(e){console.log('CRASH: '+e.message);process.exit(1)});
