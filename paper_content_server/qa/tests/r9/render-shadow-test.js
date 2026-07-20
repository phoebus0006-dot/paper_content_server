#!/usr/bin/env node
var path=require('path');var ROOT=path.join(__dirname, '..', '..','..');var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var RS=require(path.join(ROOT,'src','render','render-shadow'));
var shadow=RS.createRenderShadow(
  function(c,p){return Promise.resolve({frame:Buffer.alloc(10),id:'legacy'});},
  function(c,p){return Promise.resolve({frame:Buffer.alloc(10),id:'shadow'});},
  {warn:function(){}});
shadow.run({frameId:'test'},'default').then(function(r){
  t('SHADOW_RETURNS_LEGACY',r.id==='legacy','');
  console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);
}).catch(function(e){console.log('CRASH: '+e.message);process.exit(1);});
