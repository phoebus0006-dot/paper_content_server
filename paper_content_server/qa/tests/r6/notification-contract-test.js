#!/usr/bin/env node
var path=require('path');var ROOT=path.join(__dirname, '..', '..','..');var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var NOP=require(path.join(ROOT,'src','publication','notification-port')).NoopNotificationPort;
var np=NOP();np.notify({snapshotId:'s1',frameId:'f1',frameSha256:'abc',publishedAt:new Date().toISOString()}).then(function(){
t('NOOP_ACCEPTS_OBJECT',true,'');
return np.notify('string_only');}).then(function(){t('NOOP_ACCEPTS_STRING',true,'');
}).then(function(){console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);}).catch(function(e){t('CRASH',false,e.message);process.exit(1);});
