#!/usr/bin/env node
// R4.2A: Stable asset identity — legacy IDs must be deterministic and namespace-scoped
var path=require('path'),crypto=require('crypto');
var ROOT=path.join(__dirname, '..', '..','..');
var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var ast=require(path.join(ROOT,'src','assets','asset-status'));
var adapter=require(path.join(ROOT,'src','assets','legacy-asset-adapter'));

// Same input → same ID
var id1=ast.legacyAssetId('study','img_1','/data/p1.png','http://u.com/1.jpg');
var id2=ast.legacyAssetId('study','img_1','/data/p1.png','http://u.com/1.jpg');
t('SAME_INPUT_SAME_ID',id1===id2,'id='+id1);
t('ID_PREFIX',id1.startsWith('ast_'),'');
t('ID_LENGTH',id1.length===28,'len='+id1.length); // 'ast_' + 24 hex chars

// Different namespace → different ID (even if same legacy ID)
var id3=ast.legacyAssetId('study','img_1');
var id4=ast.legacyAssetId('decorative','img_1');
t('DIFFERENT_NAMESPACE_DIFFERENT_ID',id3!==id4,'');

// Different input → different ID
var id5=ast.legacyAssetId('study','img_2');
t('DIFFERENT_INPUT_DIFFERENT_ID',id1!==id5,'');

// No Date.now/random in legacy adapter
var studyEntry={id:'test1',url:'http://u.com/1.jpg',processedPngPath:'/data/p1.png',safetyStatus:'SAFE',selectable:true};
var a1=adapter.studyToAsset(studyEntry);
var a2=adapter.studyToAsset(studyEntry);
t('ADAPTER_SAME_INPUT_SAME_ID',a1.assetId===a2.assetId,'');
t('ADAPTER_ID_PREFIX',a1.assetId.startsWith('ast_'),'');

// Cross-load same asset
var piEntry={id:'test1',url:'http://u.com/1.jpg',processedPngPath:'/data/p1.png',poolType:'study_frames',safetyStatus:'SAFE',selectable:true};
var piAsset=adapter.photoIndexToAsset(piEntry);
// study adapter and photoIndex with same ns 'study' and same id → different due to different namespace derivation?
// Actually photoIndexToAsset uses ns='study' for study_frames — so id should match for same input
t('CROSS_LOAD_SAME_ID',a1.assetId===piAsset.assetId,'');

console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');
process.exit(ec);
