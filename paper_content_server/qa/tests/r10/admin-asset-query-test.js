#!/usr/bin/env node
var path=require('path');var ROOT=path.join(__dirname, '..', '..','..');var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var AQS=require(path.join(ROOT,'src','admin','admin-query-service'));
var ar={get:function(id){return id==='ast_1'?Promise.resolve({assetId:'ast_1',libraryType:'LEARNING'}):Promise.resolve(null);},list:function(f){return Promise.resolve([{assetId:'ast_1',libraryType:'LEARNING',safetyStatus:'SAFE'}]);}};
var svc=AQS.createAdminQueryService(null,null,ar,{},{});
svc.listAssets({libraryType:'LEARNING'}).then(function(assets){t('ASSET_LIST',assets.length===1&&assets[0].assetId==='ast_1','');
return svc.getAsset('ast_1');}).then(function(asset){
  t('ASSET_GET',asset!==null&&asset.assetId==='ast_1','');
  t('ASSET_NO_FILE_BYTES',asset.localPath===undefined,'');
  return svc.getAsset('nonexistent');
}).then(function(missing){t('ASSET_MISSING',missing===null,'');
  console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);
}).catch(function(e){console.log('CRASH: '+e.message);process.exit(1);});
