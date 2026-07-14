#!/usr/bin/env node
var path=require('path');var cp=require('child_process');var ROOT=path.join(__dirname,'..','..');
var tests=['test/r9/render-profile-test.js','test/r9/render-request-test.js','test/r9/render-validator-test.js','test/r9/dependency-boundary-test.js','test/r9/legacy-render-adapter-test.js','test/r9/render-orchestrator-test.js','test/r9/render-frame-validator-test.js','test/r9/render-shadow-test.js','test/r9/render-shadow-mismatch-test.js','test/r9/render-golden-parity-test.js'];
var overall=false;tests.forEach(function(f){var p=path.join(ROOT,f);console.log('\n=== Running '+f+' ===');var r=cp.spawnSync(process.execPath,[p],{cwd:ROOT,stdio:'inherit',timeout:30000});if(r.status!==0){console.log('FAIL: '+f);overall=true;}});
if(overall){console.log('\n=== R8: some tests FAILED ===');process.exit(1);}else{console.log('\n=== R9: ALL TESTS PASSED ===');process.exit(0);}
