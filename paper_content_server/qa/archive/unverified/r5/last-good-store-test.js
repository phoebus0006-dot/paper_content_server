#!/usr/bin/env node
// R5.1: Last-good store test
var path=require('path'),fs=require('fs'),os=require('os');
var ROOT=path.join(__dirname,'..','..');
var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var LGS=require(path.join(ROOT,'src','news','last-good-store')).LastGoodStore;
var tmp=path.join(os.tmpdir(),'r5_lg_'+Date.now());fs.mkdirSync(tmp,{recursive:true});
var lg=LGS(path.join(tmp,'lg.json'));

async function run(){
  var loaded=await lg.load();
  t('LOAD_EMPTY',loaded===null,'');
  var news={items:[{title:'Test'}],version:1};
  await lg.save(news);
  var read=await lg.load();
  t('SAVE_LOAD',read!==null&&read.items[0].title==='Test','');
  await lg.clear();
  var afterClear=await lg.load();
  t('CLEAR',afterClear!==null&&afterClear.items.length===0,'');
  try{fs.rmdirSync(tmp,{recursive:true})}catch(e){}
  console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');
  process.exit(ec);
}
run().catch(function(e){console.log('CRASH: '+e.message);try{fs.rmdirSync(tmp,{recursive:true})}catch(e2){}process.exit(1)});
