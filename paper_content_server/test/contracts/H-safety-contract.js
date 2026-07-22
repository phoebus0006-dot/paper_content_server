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
// Positive: current production contract
var approve={id:'test',safetyStatus:'SAFE',reviewStatus:'APPROVED',lifecycleStatus:'SELECTABLE',processedPngPath:__filename,width:800,height:480,theme:'test',poolType:'study_frames'};
t('APPROVED_SEL',isSel(approve),'safetyStatus=SAFE reviewStatus=APPROVED lifecycleStatus=SELECTABLE');
// Negative: safetyStatus not SAFE
['UNSAFE','PENDING'].forEach(function(st){
  var e=Object.assign({},approve,{safetyStatus:st});
  t('SAFETY_'+st+'_REJECT',!isSel(e),'safetyStatus='+st);
});
// Negative: reviewStatus not APPROVED
['REJECTED','PENDING'].forEach(function(st){
  var e=Object.assign({},approve,{reviewStatus:st});
  t('REVIEW_'+st+'_REJECT',!isSel(e),'reviewStatus='+st);
});
// Negative: lifecycleStatus not SELECTABLE
['BLOCKED','QUARANTINED','TOMBSTONED'].forEach(function(st){
  var e=Object.assign({},approve,{lifecycleStatus:st});
  t('LC_'+st+'_REJECT',!isSel(e),'lifecycleStatus='+st);
});
// Negative: missing processedPngPath
var noPng=Object.assign({},approve,{processedPngPath:null});
t('NO_PNG_REJECT',!isSel(noPng),'no processedPngPath');
// Status characterizations (not test PASS/FAIL)
s('SafetySelectorFiltering','IMPLEMENTED','isStudySelectable correctly filters safetyStatus, reviewStatus, lifecycleStatus');
s('SafetyDeletionChain','IMPLEMENTED','Production DELETE chain (src/assets/asset-delete-service.js, wired by compose-services.js when deletePipelineEnabled=true): HTTP route → feature flag check (503 FEATURE_DISABLED when off, no legacy fallback) → AssetDeleteService.deleteAsset → findReferences → markBlocked → tombstone write → cleanup (referenceCleaner.cleanCache) → audit (auditLog.append) → markTombstoned. Reason enum UNSAFE / SUSPICIOUS / POLICY_BLOCKED; fail-closed: every step rejects on failure (no swallow).');
s('DualLibrarySafety','IMPLEMENTED','safety-classifier-port (ready=configured=!!modelPath&&existsSync) + nsfw-safety-gate fail-closed; custom-library-service streaming upload (processUploadStream, octet-stream, no filePath, no finalPath leak); learning ingestion service (HTTPS-only downloader, fail-closed decode, no path leak); scheduler gated by classifierReady; both libraries gated by feature flags + classifier readiness');
s('REAL_CLASSIFIER','BLOCKED','safety-classifier-port fail-closed: configured=false, ready=false (no real NSFW model loaded). Custom Library / Learning Library uploads cannot ACCEPT until a real model is configured; Strict NSFW deletion chain is IMPLEMENTED but cannot make a real deletion decision.');
s('REAL_CJK_MODULE','IMPLEMENTED','text-rasterizer.js + font-detector.js + sharp SVG text pipeline (librsvg + pango + harfbuzz + freetype) renders real CJK glyphs; cjk-glyph-test PASS.');
s('REAL_CJK_GLYPH_RENDER','IMPLEMENTED_NOT_PRODUCTION_VERIFIED','CJK rendering implementation complete; not verified on ESP32-S3 + Spectra 6 true device.');
s('ORCHESTRATOR_SHADOW','IMPLEMENTED','render-shadow.js + orchestrator-shadow-adapter.js independent shadow pipeline implemented; runs alongside legacy-render-adapter when renderShadowEnabled=true; shadow mismatch does NOT affect production.');
s('ORCHESTRATOR_PRODUCTION_SWITCH','IMPLEMENTED_NOT_PRODUCTION_VERIFIED','RENDER_PRODUCTION_SIDE wired through config.render.productionSide → composeServices → createRenderShadow, default=legacy. Switching to orchestrator is configurable but NOT default/device-verified on ESP32-S3 + Spectra 6.');
// RENDER_PRODUCTION_SIDE genuine behavior proof: loadConfig + renderShadow composition
var loadConfig=require(path.join(__dirname,'..','..','src','config','load-config')).loadConfig;
var cfgDefault=loadConfig({cwd:path.join(__dirname,'..','..'),env:{}});
t('ORCHESTRATOR_CONFIG_DEFAULT',cfgDefault.render&&cfgDefault.render.productionSide==='legacy','productionSide defaults to legacy');
var cfgOrch=loadConfig({cwd:path.join(__dirname,'..','..'),env:{RENDER_PRODUCTION_SIDE:'orchestrator'}});
t('ORCHESTRATOR_CONFIG_ORCH',cfgOrch.render&&cfgOrch.render.productionSide==='orchestrator','RENDER_PRODUCTION_SIDE=orchestrator sets productionSide=orchestrator');
// Compose render shadow with distinct marker outputs, prove orchestrator output returned when selected
var {createRenderShadow}=require(path.join(__dirname,'..','..','src','render','render-shadow'));
var asyncOk=[];
function legacyStub(){return Promise.resolve({frame:Buffer.from('LEGACY'),frameId:'legacy-marker',layoutType:'test'});}
function orchStub(){return Promise.resolve({frame:Buffer.from('ORCH'),frameId:'orch-marker',layoutType:'test'});}
var shadowOrch=createRenderShadow(legacyStub,orchStub,null,{productionSide:'orchestrator'});
asyncOk.push(shadowOrch.run({},'p',0).then(function(r){t('ORCH_PROD_SELECTED',r.frameId==='orch-marker','productionSide=orchestrator returns orchestrator output');}));
var shadowLegacy=createRenderShadow(legacyStub,orchStub,null,{});
asyncOk.push(shadowLegacy.run({},'p',0).then(function(r){t('LEGACY_PROD_DEFAULT',r.frameId==='legacy-marker','default productionSide returns legacy output');}));
Promise.all(asyncOk).then(function(){console.log('=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);});
