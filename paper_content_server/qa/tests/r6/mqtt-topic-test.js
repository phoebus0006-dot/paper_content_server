#!/usr/bin/env node
var path=require('path');var ROOT=path.join(__dirname, '..', '..','..');var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var top=require(path.join(ROOT,'src','mqtt','mqtt-topic'));
t('PUB_TOPIC',top.publicationTopic('dev-1')==='epaper/dev-1/publication','');
t('CMD_TOPIC',top.commandTopic('dev-1')==='epaper/dev-1/command','');
t('STATUS_TOPIC',top.statusTopic('dev-1')==='epaper/dev-1/status','');
t('AVAIL_TOPIC',top.availabilityTopic('dev-1')==='epaper/dev-1/availability','');
t('VALID',top.isValidTopic('epaper/dev-1/publication'),'');
t('INVALID_INJECTION',!top.isValidTopic('epaper/dev-1/+/command'),'');
t('INVALID_WILDCARD',!top.isValidTopic('epaper/+/publication'),'');
console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);
