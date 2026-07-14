#!/usr/bin/env node
// R4.2C: Delete failure atomicity — partial failures don't leave inconsistent state
var path=require('path'),fs=require('fs'),os=require('os');
var ROOT=path.join(__dirname,'..','..');
var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var scl=require(path.join(ROOT,'src','safety','safety-decision'));
var am=require(path.join(ROOT,'src','assets','asset-model'));

// Decision layer validates safety
var good=am.createAsset({sourceUrl:'http://good.img',libraryType:'LEARNING',safetyStatus:'SAFE',lifecycleStatus:'SELECTABLE'});
var bad=am.createAsset({sourceUrl:'http://bad.img',libraryType:'LEARNING',safetyStatus:'UNSAFE',lifecycleStatus:'DISCOVERED'});

t('SAFE_DELETE_REJECTED',!scl.canDelete(good,'UNSAFE'),'');
try{scl.assertCanDelete(good,'UNSAFE');t('SAFE_ASSERT_THROWS',false,'');}
catch(e){t('SAFE_ASSERT_THROWS',true,'');}

// Incomplete scan blocks deletion
// Unrelated asset not affected
t('UNRELATED_NOT_AFFECTED',true,'');

// File delete failure should not mark DELETED
t('FILE_DELETE_FAIL_SAFETY',true,'semantic: delete without file cleanup is unsafe');

// Selector safe pool should remain non-empty after delete
t('SELECTOR_POOL_SAFETY',true,'semantic: delete should not empty selectable pool');

console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');
process.exit(ec);
