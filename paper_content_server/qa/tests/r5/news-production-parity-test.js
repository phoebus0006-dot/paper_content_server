#!/usr/bin/env node
var path=require('path'),fs=require('fs'),os=require('os');var ROOT=path.join(__dirname, '..', '..','..');
var ec=0,pass=0,fail=0;function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
async function run(){var pipeline=require(path.join(ROOT,'src','news','news-pipeline')).createNewsPipeline;var lg={};
var p=pipeline({lastGoodFile:path.join(os.tmpdir(),'r5gp_'+Date.now()+'.json'),provider:'none'},lg);
var r=await p.run([{url:'http://a.com/1',title:'A',description:'Desc with enough content for validation.',source:'S',language:'en'},{url:'http://b.com/2',title:'B',description:'Desc two with enough text for test.',source:'S',language:'en'}]);
t('GOLDEN_RUNS',r.count>0,'');console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);}
run().catch(function(e){console.log('CRASH: '+e.message);process.exit(1)});
