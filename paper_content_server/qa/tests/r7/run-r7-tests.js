#!/usr/bin/env node
var path=require('path');var cp=require('child_process');var ROOT=path.join(__dirname, '..', '..','..');
var tests=['test/r7/learning-candidate-test.js','test/r7/learning-source-registry-test.js','test/r7/learning-ingestion-test.js','test/r7/learning-gates-test.js','test/r7/learning-dedup-test.js','test/r7/dependency-boundary-test.js'];
var overall=false;tests.forEach(function(f){var p=path.join(ROOT,f);console.log('\n=== Running '+f+' ===');var r=cp.spawnSync(process.execPath,[p],{cwd:ROOT,stdio:'inherit',timeout:30000});if(r.status!==0){console.log('FAIL: '+f);overall=true;}});
if(overall){console.log('\n=== R7: some tests FAILED ===');process.exit(1);}else{console.log('\n=== R7: ALL TESTS PASSED ===');process.exit(0);}
