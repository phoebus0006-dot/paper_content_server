#!/usr/bin/env node
// R4.1: Legacy asset adapter — reads study_frames, image_index, maps to normalized Asset
var path=require('path'),fs=require('fs'),os=require('os');
var ROOT=path.join(__dirname, '..', '..','..');
var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}

var adapter=require(path.join(ROOT,'src','assets','legacy-asset-adapter'));
var am=require(path.join(ROOT,'src','assets','asset-model'));

// Test studyToAsset
var studyEntry={id:'study_1',url:'http://img.jpg',processedPngPath:'/data/p1.png',width:800,height:480,safetyStatus:'SAFE',selectable:true};
var asset=adapter.studyToAsset(studyEntry);
t('STUDY_ASSET',asset!==null,'');
t('STUDY_LIBRARY_TYPE',asset.libraryType==='LEGACY_STUDY','');
t('STUDY_SELECTABLE',am.isSelectable(asset),'');
t('STUDY_SHA256',asset.sha256===null,'');
t('STUDY_METADATA',asset.metadata.legacyId==='study_1','');

// Test study with UNSAFE -> BLOCKED
var unsafeEntry={id:'unsafe_1',url:'http://bad.jpg',safetyStatus:'UNSAFE',selectable:true};
var unsafeAsset=adapter.studyToAsset(unsafeEntry);
t('UNSAFE_STUDY_BLOCKED',unsafeAsset.lifecycleStatus==='BLOCKED','');

// Test study not selectable -> VALIDATED
var pendingEntry={id:'pending_1',url:'http://p.jpg',safetyStatus:'SAFE',selectable:false};
var pendingAsset=adapter.studyToAsset(pendingEntry);
t('PENDING_NOT_SELECTABLE',pendingAsset.lifecycleStatus==='VALIDATED','');

// Test photoIndexToAsset with study_frames poolType
var piEntry={id:'pi_1',url:'http://pi.jpg',processedPngPath:'/data/pi.png',poolType:'study_frames',safetyStatus:'SAFE',selectable:true};
var piAsset=adapter.photoIndexToAsset(piEntry);
t('PHOTO_INDEX_ASSET',piAsset!==null,'');
t('PI_LIBRARY_TYPE',piAsset.libraryType==='LEGACY_STUDY','');
t('PI_SELECTABLE',am.isSelectable(piAsset),'');

// Test photoIndexToAsset with decorative
var decEntry={id:'dec_1',url:'http://dec.jpg',poolType:'decorative_photos',safetyStatus:'SAFE',selectable:true};
var decAsset=adapter.photoIndexToAsset(decEntry);
t('DEC_LIBRARY_TYPE',decAsset.libraryType==='LEGACY_DECORATIVE','');

// Test loadAll from temp data
var tmpDir=path.join(os.tmpdir(),'r4_adapter_'+Date.now());fs.mkdirSync(tmpDir,{recursive:true});
fs.mkdirSync(path.join(tmpDir,'fallback_study'),{recursive:true});
fs.writeFileSync(path.join(tmpDir,'fallback_study','study_index.json'),JSON.stringify({entries:[studyEntry,unsafeEntry]}));
fs.writeFileSync(path.join(tmpDir,'image_index.json'),JSON.stringify([piEntry,decEntry]));
var all=adapter.loadAll(tmpDir);
t('LOAD_ALL_COUNT',all.length===4,'count='+all.length);
var selectableCount=all.filter(function(a){return am.isSelectable(a);}).length;
t('LOAD_ALL_SELECTABLE_COUNT',selectableCount===3,'selectable='+selectableCount);
try{fs.rmdirSync(tmpDir,{recursive:true})}catch(e){}
console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');
process.exit(ec);
