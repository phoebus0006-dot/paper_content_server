#!/usr/bin/env node
var path=require('path');var ROOT=path.join(__dirname, '..', '..','..');var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var rp=require(path.join(ROOT,'src','mqtt','mqtt-reconnect-policy'));
var p=rp.createReconnectPolicy({reconnectDelayMs:1000,maxReconnectAttempts:3});
t('CAN_RETRY',p.canRetry(),'');t('DELAY_1',p.nextDelay()===1000,'');t('DELAY_2',p.nextDelay()===1500,'');t('DELAY_3',p.nextDelay()===2250,'');
t('EXHAUSTED',!p.canRetry(),'');p.reset();t('RESET',p.canRetry(),'');
console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);
