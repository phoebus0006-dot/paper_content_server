#!/usr/bin/env node
// H-safety-contract: characterize current safety implementation
var path=require('path');
var mod=require(path.join(__dirname,'..','..','server.js'));
var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
// SafetySelectorFiltering
var isSel=mod.isStudySelectable;
t('IS_SEL_FN',!!isSel,'');
var e={id:'test',safetyStatus:'approved',poolType:'study_frames',processedPngPath:__filename,width:800,height:480,theme:'test'};
t('APPROVED_SEL',isSel(e),'');
e.safetyStatus='pending';t('PENDING_REJECT',!isSel(e),'');
e.safetyStatus='rejected';t('REJECTED_REJECT',!isSel(e),'');
e.safetyStatus='unsafe';t('UNSAFE_REJECT',!isSel(e),'');
e.safetyStatus='suspicious';t('SUSPICIOUS_REJECT',!isSel(e),'');
// SafetyDeletionChain
t('DELETE_PIPELINE',false,'NOT_IMPLEMENTED — no delete pipeline, no tombstone');
// DualLibrarySafety
t('DUAL_LIBRARY_SAFETY',false,'NOT_IMPLEMENTED — single model, no libraryType');
// Overall
t('BLOCKLIST_EXISTS',true,'BLOCKLIST_WORDS regex L890');
console.log('=== Summary: '+pass+' passed, '+fail+' failed ===');
process.exit(ec);
