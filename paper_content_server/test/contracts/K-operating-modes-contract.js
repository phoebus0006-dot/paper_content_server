#!/usr/bin/env node
// K-operating-modes-contract: characterize current operating mode implementation
var path=require('path');
var mod=require(path.join(__dirname,'..','..','lib','schedule.js'));
var fs=require('fs');
var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
t('AUTO_RESOLVER',typeof mod.resolveDisplayMode==='function','');
var serverCode=fs.readFileSync(path.join(__dirname,'..','..','server.js'),'utf8');
var hasOverride=serverCode.includes('admin_override.json');
t('ONE_SHOT_OVERRIDE_WRITES',hasOverride,'admin_override.json writes exist');
t('ONE_SHOT_BOUNDARY_EXPIRY',false,'NOT_IMPLEMENTED - expiresAt=null, no HH:00/HH:30 revert');
var hasOneShotRoute=serverCode.includes('/api/admin/publish/one-shot');
t('ONE_SHOT_ROUTE',hasOneShotRoute,'/api/admin/publish/one-shot route');
var hasFocusLock=serverCode.includes('focus_lock')||serverCode.includes('FOCUS_LOCK')||serverCode.includes('focus-lock');
t('FOCUS_LOCK',hasFocusLock,'');
console.log('=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);
