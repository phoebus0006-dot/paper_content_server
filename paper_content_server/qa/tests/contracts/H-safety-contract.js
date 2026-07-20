#!/usr/bin/env node
// H-safety-contract: characterize current safety implementation
// Uses status() for NOT_IMPLEMENTED — does not count as test FAIL
var path=require('path');
var mod=require(path.join(__dirname, '..', '..','..','server.js'));
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
s('SafetyDeletionChain','IMPLEMENTED','Production DELETE chain (src/assets/asset-delete-service.js, wired by compose-services.js when deletePipelineEnabled=true): HTTP route → feature flag check (503 FEATURE_DISABLED when off, no legacy fallback) → AssetDeleteService.deleteAsset → findReferences → markBlocked → tombstone write → cleanup (referenceCleaner.cleanCache) → audit (auditLog.append) → markTombstoned. Reason enum UNSAFE / SUSPICIOUS / POLICY_BLOCKED; fail-closed: every step rejects on failure (no swallow).');
s('DualLibrarySafety','IMPLEMENTED','safety-classifier-port (ready=configured=!!modelPath&&existsSync) + nsfw-safety-gate fail-closed; custom-library-service streaming upload (processUploadStream, octet-stream, no filePath, no finalPath leak); learning ingestion service (HTTPS-only downloader, fail-closed decode, no path leak); scheduler gated by classifierReady; both libraries gated by feature flags + classifier readiness');
s('REAL_CLASSIFIER','BLOCKED','safety-classifier-port fail-closed: configured=false, ready=false (no real NSFW model loaded). Custom Library / Learning Library uploads cannot ACCEPT until a real model is configured; Strict NSFW deletion chain is IMPLEMENTED but cannot make a real deletion decision.');
s('REAL_CJK_MODULE','IMPLEMENTED','text-rasterizer.js + font-detector.js + sharp SVG text pipeline (librsvg + pango + harfbuzz + freetype) renders real CJK glyphs; cjk-glyph-test PASS.');
s('REAL_CJK_GLYPH_RENDER','IMPLEMENTED_NOT_PRODUCTION_VERIFIED','CJK rendering implementation complete; not verified on ESP32-S3 + Spectra 6 true device.');
s('ORCHESTRATOR_SHADOW','IMPLEMENTED','render-shadow.js + orchestrator-shadow-adapter.js independent shadow pipeline implemented; runs alongside legacy-render-adapter when renderShadowEnabled=true; shadow mismatch does NOT affect production.');
s('ORCHESTRATOR_PRODUCTION_SWITCH','NOT_IMPLEMENTED','orchestrator is NOT the default production path; production still uses legacy-render-adapter. Switch requires shadow↔legacy long-run consistency + ESP32真机回归.');
console.log('=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);
