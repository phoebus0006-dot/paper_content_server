#!/usr/bin/env node
// R9: Render profile test
var path=require('path');var ROOT=path.join(__dirname,'..','..');var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var rp=require(path.join(ROOT,'src','render','render-profile'));
t('DEFAULT_EXISTS',rp.DEFAULT_PROFILE!==null,'');
t('WIDTH_800',rp.DEFAULT_PROFILE.width===800,'');
t('HEIGHT_480',rp.DEFAULT_PROFILE.height===480,'');
t('PANEL_49',rp.DEFAULT_PROFILE.panel===49,'');
t('GET_PROFILE',rp.getProfile('default-v1')!==null,'');
t('UNKNOWN_PROFILE',rp.getProfile('unknown')===null,'');
console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);
