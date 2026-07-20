#!/usr/bin/env node
var path=require('path');var ROOT=path.join(__dirname,'..','..');var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var SSV=require(path.join(ROOT,'src','admin','system-status-view'));
var resp=SSV.buildSystemStatusResponse({activeSnapshotId:'s1',activeFrameId:'s1',lastPublicationAt:'2026-01-01T00:00:00Z',snapshotCount:1,timestamp:'2026-01-01T00:00:00Z'});
t('RESPONSE_HAS_SERVICES',resp.services!==undefined,'');
t('NO_API_KEY',JSON.stringify(resp).indexOf('api_key')===-1,'');
t('NO_PASSWORD',JSON.stringify(resp).indexOf('password')===-1,'');
console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);
