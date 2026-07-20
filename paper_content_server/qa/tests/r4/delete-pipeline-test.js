#!/usr/bin/env node
// R4.2C: Delete pipeline — block, verify references, cannot delete SAFE
var path=require('path'),fs=require('fs'),os=require('os');
var ROOT=path.join(__dirname, '..', '..','..');
var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var scl=require(path.join(ROOT,'src','safety','safety-decision'));
var am=require(path.join(ROOT,'src','assets','asset-model'));

// canDelete checks
var safeAsset=am.createAsset({sourceUrl:'http://safe.img',libraryType:'LEARNING',safetyStatus:'SAFE',lifecycleStatus:'SELECTABLE'});
var unsafeAsset=am.createAsset({sourceUrl:'http://bad.img',libraryType:'LEARNING',safetyStatus:'UNSAFE',lifecycleStatus:'DISCOVERED'});
var suspiciousAsset=am.createAsset({sourceUrl:'http://sus.img',libraryType:'LEARNING',safetyStatus:'SUSPICIOUS',lifecycleStatus:'DISCOVERED'});
var tombstonedAsset=am.createAsset({sourceUrl:'http://del.img',libraryType:'LEARNING',safetyStatus:'UNSAFE',lifecycleStatus:'TOMBSTONED'});

t('CAN_DELETE_UNSAFE',scl.canDelete(unsafeAsset,'UNSAFE'),'');
t('CAN_DELETE_SUSPICIOUS',scl.canDelete(suspiciousAsset,'SUSPICIOUS'),'');
t('CAN_DELETE_POLICY_BLOCKED',scl.canDelete(unsafeAsset,'POLICY_BLOCKED'),'');
t('CANNOT_DELETE_SAFE',!scl.canDelete(safeAsset,'UNSAFE'),'');
t('CANNOT_DELETE_TOMBSTONED',!scl.canDelete(tombstonedAsset,'UNSAFE'),'');
t('CANNOT_DELETE_INVALID_REASON',!scl.canDelete(unsafeAsset,'INVALID_REASON'),'');

// assertCanDelete throws for invalid cases
try{scl.assertCanDelete(safeAsset,'UNSAFE');t('ASSERT_SAFE_REJECTED',false,'');}
catch(e){t('ASSERT_SAFE_REJECTED',true,e.message);}
try{scl.assertCanDelete(unsafeAsset,'INVALID');t('ASSERT_INVALID_REASON',false,'');}
catch(e){t('ASSERT_INVALID_REASON',true,e.message);}

console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');
process.exit(ec);
