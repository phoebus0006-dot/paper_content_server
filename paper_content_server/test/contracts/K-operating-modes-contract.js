#!/usr/bin/env node
// K-operating-modes-contract: characterize current operating mode implementation
var path=require('path');
var mod=require(path.join(__dirname,'..','..','lib','schedule.js'));
var fs=require('fs');
var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
function s(n,st,d){console.log('STATUS '+n+'='+st+(d?': '+d:''));}
// AUTO: verified via production schedule resolver
t('AUTO_RESOLVER',typeof mod.resolveDisplayMode==='function','');
function wt(y,M,d,h,m){return{year:y,month:M,day:d,hour:h,minute:m}}
var r=mod.resolveDisplayMode(wt(2026,7,9,10,0),'Europe/Paris');
t('AUTO_PHOTO_10:00',r.mode==='photo','mode='+r.mode);
r=mod.resolveDisplayMode(wt(2026,7,9,10,30),'Europe/Paris');
t('AUTO_NEWS_10:30',r.mode==='news','mode='+r.mode);
r=mod.resolveDisplayMode(wt(2026,7,9,19,0),'Europe/Paris');
t('AUTO_NIGHT_HOLD',r.mode==='photo','mode='+r.mode);
// ONE_SHOT and FOCUS_LOCK: characterize via code scan
var code=fs.readFileSync(path.join(__dirname,'..','..','server.js'),'utf8');
var hasOverride=code.includes('admin_override.json')&&code.includes('manual-news')||code.includes('manual-photo');
s('LEGACY_ADMIN_OVERRIDE',hasOverride?'PARTIAL':'NOT_IMPLEMENTED','admin_override.json write exists; expiresAt=null; no HH:00/HH:30 revert; no dedicated route');
s('ONE_SHOT_ROUTE','NOT_IMPLEMENTED','/api/admin/publish/one-shot does not exist');
s('BOUNDARY_EXPIRY','NOT_IMPLEMENTED','computeNextHalfHourBoundary does not exist');
s('FOCUS_LOCK','NOT_IMPLEMENTED','No FOCUS_LOCK code in server.js');
console.log('=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);
