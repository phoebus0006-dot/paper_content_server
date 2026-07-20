#!/usr/bin/env node
var path = require('path');var cp = require('child_process');var ROOT = path.join(__dirname,'..','..');
var tests=['test/r11/workflow-location-test.js','test/r11/workflow-working-directory-test.js','test/r11/build-manifest-test.js','test/r11/dockerfile-manifest-failclosed-test.js','test/r11/dockerfile-multistage-test.js','test/r11/frame-validator-cli-test.js','test/r11/nas-verify-script-test.js'];
var overall=false;tests.forEach(function(f){var p=path.join(ROOT,f);console.log('\n=== Running '+f+' ===');var r=cp.spawnSync(process.execPath,[p],{cwd:ROOT,stdio:'inherit',timeout:30000});if(r.status!==0){console.log('FAIL: '+f);overall=true;}});
if(overall){console.log('\n=== R11: some tests FAILED ===');process.exit(1);}else{console.log('\n=== R11: ALL TESTS PASSED ===');process.exit(0);}
