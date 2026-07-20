#!/usr/bin/env node
// R4.1: Asset domain model — create, freeze, required fields, selectable check
var path=require('path');
var ROOT=path.join(__dirname, '..', '..','..');
var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}

var am=require(path.join(ROOT,'src','assets','asset-model'));
var ast=require(path.join(ROOT,'src','assets','asset-status'));

t('MODULE_EXISTS',typeof am.createAsset==='function','');
t('SCHEMA_VERSION',am.SCHEMA_VERSION===1,'');

// 1. Create valid asset with minimal fields
var asset=am.createAsset({sourceUrl:'http://example.com/img.jpg',libraryType:'LEGACY_STUDY'});
t('ASSET_CREATED',asset!==null,'');
t('ASSET_ID',asset.assetId.startsWith('ast_'),asset.assetId);
t('FROZEN',Object.isFrozen(asset),'');
t('LIBRARY_TYPE',asset.libraryType==='LEGACY_STUDY','');
t('SAFETY_DEFAULT',asset.safetyStatus==='UNKNOWN','');
t('LIFECYCLE_DEFAULT',asset.lifecycleStatus==='DISCOVERED','');
t('SCHEMA_VERSION_FIELD',asset.schemaVersion===1,'');
t('CREATED_AT',/^\d{4}-\d{2}-\d{2}T/.test(asset.createdAt),'');

// 2. Selectable check
var selectable=am.createAsset({sourceUrl:'u',libraryType:'LEARNING',safetyStatus:'SAFE',lifecycleStatus:'SELECTABLE'});
t('SELECTABLE_SAFE',am.isSelectable(selectable),'');
  var unsafeCreated=false;
  try{am.createAsset({sourceUrl:'u',libraryType:'LEARNING',safetyStatus:'UNSAFE',lifecycleStatus:'SELECTABLE'});}catch(e){unsafeCreated=true;}
  t('UNSAFE_SELECTABLE_REJECTED',unsafeCreated,'');
  var blocked=am.createAsset({sourceUrl:'u',libraryType:'LEARNING',safetyStatus:'SAFE',lifecycleStatus:'BLOCKED'});
var blocked=am.createAsset({sourceUrl:'u',libraryType:'LEARNING',safetyStatus:'SAFE',lifecycleStatus:'BLOCKED'});
t('BLOCKED_NOT_SELECTABLE',!am.isSelectable(blocked),'');

// 3. Reject missing sourceUrl/localPath
try{am.createAsset({libraryType:'LEARNING'});t('REJECT_NO_SOURCE',false,'');}
catch(e){t('REJECT_NO_SOURCE',true,e.message);}

// 4. Reject missing libraryType
try{am.createAsset({sourceUrl:'u'});t('REJECT_NO_TYPE',false,'');}
catch(e){t('REJECT_NO_TYPE',true,e.message);}

// 5. Status exports
t('LIFECYCLE_STATUS',ast.LIFECYCLE_STATUS.DISCOVERED==='DISCOVERED','');
t('SAFETY_STATUS',ast.SAFETY_STATUS.SAFE==='SAFE','');

console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');
process.exit(ec);
