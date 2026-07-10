#!/usr/bin/env node
// G-photo-contract: production selectStudyPhoto with mixed pool
var path=require('path');
var mod=require(path.join(__dirname,'..','..','server.js'));
var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var sel=mod.selectStudyPhoto,isSel=mod.isStudySelectable;
if(!sel){t('SEL_FN',false,'');process.exit(1)}
var PNG=path.join(__dirname,'..','..','data','processed_images','c7a7d3bc2f605fb97c4f6996287b3b4e212f8038.png');
var base={processedPngPath:PNG,epfPath:PNG,width:800,height:480};
var pool=[
  Object.assign({},base,{id:'study-a',theme:'dialogue',kind:'storyboard',safetyStatus:'approved',poolType:'study_frames'}),
  Object.assign({},base,{id:'study-b',theme:'wide_shot',kind:'storyboard',safetyStatus:'approved',poolType:'study_frames'}),
  Object.assign({},base,{id:'study-c',theme:'night',kind:'storyboard',safetyStatus:'approved',poolType:'study_frames'}),
  Object.assign({},base,{id:'deco-d',theme:'cinematic',kind:'shot',safetyStatus:'approved',poolType:'decorative_photos'}),
  Object.assign({},base,{id:'pending-e',theme:'entrance',kind:'storyboard',safetyStatus:'pending',poolType:'study_frames'}),
  Object.assign({},base,{id:'rejected-f',theme:'ensemble',kind:'storyboard',safetyStatus:'rejected',poolType:'study_frames'}),
  Object.assign({},base,{id:'nostatus-g',theme:'color',kind:'shot',safetyStatus:'',poolType:'study_frames'}),
];
t('IS_SEL_A',isSel(pool[0]),'');t('IS_SEL_B',isSel(pool[1]),'');t('IS_SEL_C',isSel(pool[2]),'');
t('NOT_SEL_DECO',!isSel(pool[3]),'');t('NOT_SEL_PENDING',!isSel(pool[4]),'');
t('NOT_SEL_REJECTED',!isSel(pool[5]),'');t('NOT_SEL_NOSTATUS',!isSel(pool[6]),'');
var slots=['2026-07-10T10:00:00Z','2026-07-10T11:00:00Z','2026-07-10T12:00:00Z','2026-07-10T13:00:00Z','2026-07-10T14:00:00Z','2026-07-10T15:00:00Z'];
var results=[];slots.forEach(function(s,si){var now=new Date(s);results.push(sel(now,pool,{themeCursor:si,currentTheme:null,currentImageIndex:0,remainingThemeSlots:1,lastSlotKey:null,lastSwitchDate:null,patternIndex:si%6,currentKind:null}))});
var nonApproved=results.filter(function(r){return r.entry&&r.entry.safetyStatus!=='approved'});
var decorative=results.filter(function(r){return r.entry&&r.entry.poolType==='decorative_photos'});
var missing=results.filter(function(r){return r.entry&&!r.entry.safetyStatus});
t('NON_APPROVED_ZERO',nonApproved.length===0,'got='+nonApproved.length);
t('DECORATIVE_ZERO',decorative.length===0,'got='+decorative.length);
t('MISSING_ZERO',missing.length===0,'got='+missing.length);
var ids=new Set(results.filter(function(r){return r.entry}).map(function(r){return r.entry.id}));
t('UNIQUE_IDS_GE2',ids.size>=2,'ids='+Array.from(ids).join(','));
console.log('=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);
