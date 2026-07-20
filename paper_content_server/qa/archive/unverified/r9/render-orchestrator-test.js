#!/usr/bin/env node
var path=require('path');var ROOT=path.join(__dirname,'..','..');var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var ORCH=require(path.join(ROOT,'src','render','render-orchestrator'));
var RP=require(path.join(ROOT,'src','render','renderer-port'));
var rp=RP.createRendererPort();
var orch=ORCH.createRenderOrchestrator(rp,{validate:function(){return true;}},{});
t('ORCH_EXISTS',typeof orch.render==='function','');
console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);
