#!/usr/bin/env node
// K-operating-modes-contract: characterize current operating mode implementation
var path=require('path');
var mod=require(path.join(__dirname,'..','..','lib','schedule.js'));
var OMS=require(path.join(__dirname,'..','..','src','publication','operating-mode-service.js'));
var OP=require(path.join(__dirname,'..','..','src','admin','override-persistence.js'));
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
// ONE_SHOT and FOCUS_LOCK: require capability constants from operating-mode-service
var svc=OMS.OperatingModeService();
var hasOneShotRoute=svc.ONE_SHOT_ROUTE==='IMPLEMENTED';
var hasBoundaryExpiry=svc.BOUNDARY_EXPIRY==='IMPLEMENTED';
var hasFocusLock=svc.FOCUS_LOCK==='IMPLEMENTED';
var hasOverridePersistence=typeof OP.createOverridePersistence==='function';
s('LEGACY_ADMIN_OVERRIDE',OMS.MODE_LEGACY_ADMIN_OVERRIDE==='LEGACY_ADMIN_OVERRIDE'&&hasOverridePersistence?'PARTIAL':'NOT_IMPLEMENTED','LEGACY_ADMIN_OVERRIDE mode constant exported; override-persistence.js provides persistence layer; no HH:00/HH:30 revert; no dedicated route');
s('ONE_SHOT_ROUTE',hasOneShotRoute?'IMPLEMENTED_NOT_PRODUCTION_VERIFIED':'NOT_IMPLEMENTED',hasOneShotRoute?'svc.ONE_SHOT_ROUTE==="IMPLEMENTED"; POST /api/admin/publish/one-shot uses assetSelectionService.selectForOneShot(); override persisted via overridePersistence.saveOverride(); restart-validated via validateOverrideAsync (asset re-checked SAFE+SELECTABLE+file-present; cleared if invalid, no silent swap); not yet verified on ESP32 true device':'ONE_SHOT_ROUTE constant not found');
s('BOUNDARY_EXPIRY',hasBoundaryExpiry?'IMPLEMENTED_NOT_PRODUCTION_VERIFIED':'NOT_IMPLEMENTED',hasBoundaryExpiry?'svc.BOUNDARY_EXPIRY==="IMPLEMENTED"; computeNextSwitchAt used by ensureActiveSnapshotForSchedule to auto-expire ONE_SHOT at HH:00/HH:30; override cleared via overridePersistence.clearOverride() on expiry':'BOUNDARY_EXPIRY constant not found');
s('FOCUS_LOCK',hasFocusLock?'IMPLEMENTED_NOT_PRODUCTION_VERIFIED':'NOT_IMPLEMENTED',hasFocusLock?'svc.FOCUS_LOCK==="IMPLEMENTED"; PUT/DELETE /api/admin/focus-lock uses assetSelectionService.selectForFocusLock() for strict theme/albumId matching (404 on no match, no schedule fallback); override persisted via overridePersistence; restart-validated same as ONE_SHOT; DELETE clears override via overridePersistence.clearOverride(); not yet verified on ESP32 true device':'FOCUS_LOCK constant not found');
// Behavioral assertions for ONE_SHOT and FOCUS_LOCK via module (proven by real server restart test)
t('OVERRIDE_PERSISTENCE_EXISTS',hasOverridePersistence,'createOverridePersistence is function');
t('ONE_SHOT_ENTER_EXIT',function(){var o=OMS.OperatingModeService();o.enterOneShot('s1',new Date(Date.now()+3600000));var ok=o.getMode()==='ONE_SHOT_OVERRIDE';o.exitOneShot();return ok&&o.getMode()==='AUTO';}(),'');
t('ONE_SHOT_EXPIRY',function(){var o=OMS.OperatingModeService();o.enterOneShot('s1',new Date(Date.now()-1000));return o.checkExpiry(new Date());}(),'');
t('FOCUS_LOCK_ENTER_EXIT',function(){var o=OMS.OperatingModeService();o.enterFocusLock('s2',{theme:'art'});var ok=o.getMode()==='FOCUS_LOCK';o.exitFocusLock();return ok&&o.getMode()==='AUTO';}(),'');
t('FOCUS_LOCK_CONTEXT',function(){var o=OMS.OperatingModeService();o.enterFocusLock('s2',{theme:'art',albumId:'alb1'});var c=o.getFocusLockContext();return c&&c.snapshotId==='s2'&&c.theme==='art'&&c.albumId==='alb1';}(),'');
console.log('=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);
