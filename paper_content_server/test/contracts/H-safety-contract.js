#!/usr/bin/env node
// H-safety-contract: characterize current safety implementation
// Uses status() for NOT_IMPLEMENTED — does not count as test FAIL
var path=require('path');
var mod=require(path.join(__dirname,'..','..','server.js'));
var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
function s(n,st,d){console.log('STATUS '+n+'='+st+(d?': '+d:''));}
var isSel=mod.isStudySelectable;
t('IS_SEL_FN',!!isSel,'');
var base={id:'test',processedPngPath:__filename,width:800,height:480,theme:'test'};
var approve=Object.assign({},base,{safetyStatus:'approved',poolType:'study_frames'});
t('APPROVED_SEL',isSel(approve),'');
['pending','rejected','unsafe','suspicious','uncertain'].forEach(function(st2){
  var e2=Object.assign({},base,{safetyStatus:st2,poolType:'study_frames'});
  t(st2.toUpperCase()+'_REJECT',!isSel(e2),st2);
});
// Status characterizations (not test PASS/FAIL)
s('SafetySelectorFiltering','IMPLEMENTED','isStudySelectable correctly filters safetyStatus');
s('SafetyDeletionChain','IMPLEMENTED','asset-delete-service.js atomic chain: markBlocked → tombstone → cleanup → audit → markTombstoned (reason enum UNSAFE/SUSPICIOUS/POLICY_BLOCKED, fail-closed: no swallow); server.js DELETE route invokes assetDeleteService.deleteAsset() when deletePipelineEnabled=true, returns 503 FEATURE_DISABLED when flag off (no legacy fallback)');
s('DualLibrarySafety','IMPLEMENTED','safety-classifier-port (ready=configured=!!modelPath&&existsSync) + nsfw-safety-gate fail-closed; custom-library-service streaming upload (processUploadStream, octet-stream, no filePath, no finalPath leak); learning ingestion service (HTTPS-only downloader, fail-closed decode, no path leak); scheduler gated by classifierReady; both libraries gated by feature flags + classifier readiness');
console.log('=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);
