#!/usr/bin/env node
var path=require('path'),fs=require('fs'),os=require('os');
var ROOT=path.join(__dirname,'..','..');var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var pipeline=require(path.join(ROOT,'src','news','news-pipeline')).createNewsPipeline;
var lg={info:function(){},warn:function(){},error:function(){}};
async function run(){
  var tmp=path.join(os.tmpdir(),'r5_http_'+Date.now());fs.mkdirSync(tmp,{recursive:true});
  var p=pipeline({lastGoodFile:path.join(tmp,'lg.json'),provider:'none'},lg);
  var items=[{url:'http://a.com/1',title:'News1',description:'Summary one with enough text content.',source:'SrcA',language:'en'},{url:'http://b.com/2',title:'News2',description:'Summary two with enough text content for test.',source:'SrcB',language:'en'},{url:'http://c.com/3',title:'News3',description:'Summary three with enough detail to pass.',source:'SrcC',language:'zh'},{url:'http://d.com/4',title:'News4',description:'Summary four with enough detail content.',source:'SrcD',language:'en'},{url:'http://e.com/5',title:'News5',description:'Summary five with enough content here.',source:'SrcE',language:'en'},{url:'http://f.com/6',title:'News6',description:'Summary six with enough text for valid.',source:'SrcF',language:'en'}];
  var result=await p.run(items);t('NEWS_COUNT_6',result.count===6,'count='+result.count);
  t('IDENTITY_FIELDS',result.items.every(function(i){return i.articleId&&i.canonicalUrl&&i.normalizedTitle;}),'');
  t('LAST_GOOD_SAVED',result.lastGoodAction==='saved','');
  var result2=await p.run([]);t('FALLBACK_COUNT_6',result2.count===6,'count='+result2.count);
  t('LAYOUT_VISIBLE_6',result.layout.visibleCards===6,'');
  try{fs.rmdirSync(tmp,{recursive:true})}catch(e){}
  console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);
}
run().catch(function(e){console.log('CRASH: '+e.message);process.exit(1)});
