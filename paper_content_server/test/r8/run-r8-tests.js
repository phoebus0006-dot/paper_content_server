#!/usr/bin/env node
var path=require('path');var cp=require('child_process');var ROOT=path.join(__dirname,'..','..');
var tests=['test/r8/custom-upload-model-test.js','test/r8/custom-file-store-test.js','test/r8/custom-validator-test.js','test/r8/custom-dedup-test.js','test/r8/custom-library-service-test.js','test/r8/custom-selector-test.js','test/r8/dependency-boundary-test.js'];
var overall=false;tests.forEach(function(f){var p=path.join(ROOT,f);console.log('\n=== Running '+f+' ===');var r=cp.spawnSync(process.execPath,[p],{cwd:ROOT,stdio:'inherit',timeout:30000});if(r.status!==0){console.log('FAIL: '+f);overall=true;}});
if(overall){console.log('\n=== R8: some tests FAILED ===');process.exit(1);}else{console.log('\n=== R8: ALL TESTS PASSED ===');process.exit(0);}