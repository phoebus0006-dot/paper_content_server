#!/usr/bin/env node
var path=require('path');var cp=require('child_process');var ROOT=path.join(__dirname,'..','..');
var tests=['test/r10/admin-system-status-test.js','test/r10/admin-publication-query-test.js','test/r10/admin-asset-query-test.js','test/r10/admin-feature-flags-test.js','test/r10/admin-secret-redaction-test.js','test/r10/admin-read-only-http-test.js','test/r10/dependency-boundary-test.js'];
var overall=false;tests.forEach(function(f){var p=path.join(ROOT,f);console.log('\n=== Running '+f+' ===');var r=cp.spawnSync(process.execPath,[p],{cwd:ROOT,stdio:'inherit',timeout:30000});if(r.status!==0){console.log('FAIL: '+f);overall=true;}});
if(overall){console.log('\n=== R10: some tests FAILED ===');process.exit(1);}else{console.log('\n=== R10: ALL TESTS PASSED ===');process.exit(0);}
