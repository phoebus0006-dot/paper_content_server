#!/usr/bin/env node
var path=require('path');var ROOT=path.join(__dirname,'..','..');var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var pipeline=require(path.join(ROOT,'src','news','news-pipeline')).createNewsPipeline;
var lg={info:function(){},warn:function(){},error:function(){}};
async function run(){
  var p=pipeline({lastGoodFile:path.join(require('os').tmpdir(),'r5_tg_'+Date.now()+'.json'),provider:'none'},lg);
  var items=[{url:'http://a.com/1',title:'English Title',description:'English description for test.',source:'Src',language:'en'}];
  var r=await p.run(items);t('TRANSLATION_STATUS',r.items[0].translationStatus==='pending'||r.items[0].translationStatus==='skipped','');
  t('TRANSLATION_PROVIDER',r.translationProvider==='none','');
  var zhItem=[{url:'http://zh.com/1',title:'中文标题',description:'中文摘要。',source:'SrcZH',language:'zh'}];
  var r2=await p.run(zhItem);t('ZH_SKIPPED',r2.items[0].translationStatus==='skipped','');
  console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);
}
run().catch(function(e){console.log('CRASH: '+e.message);process.exit(1)});
