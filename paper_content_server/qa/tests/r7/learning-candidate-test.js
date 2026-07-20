#!/usr/bin/env node
var path=require('path');var ROOT=path.join(__dirname, '..', '..','..');var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var cm=require(path.join(ROOT,'src','learning','learning-candidate-model'));
var c=cm.createCandidate({sourceUrl:'http://img.jpg',source:'test'});
t('CANDIDATE_EXISTS',c!==null,'');t('CANDIDATE_ID',c.candidateId.startsWith('cand_'),'');
t('FROZEN',Object.isFrozen(c),'');t('SOURCE_URL',c.sourceUrl==='http://img.jpg','');
try{cm.createCandidate({});t('REJECT_NO_SOURCE',false,'');}catch(e){t('REJECT_NO_SOURCE',true,'');}
console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);
