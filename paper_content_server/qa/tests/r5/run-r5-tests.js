#!/usr/bin/env node
var path=require('path');var cp=require('child_process');var ROOT=path.join(__dirname, '..', '..','..');
var tests=['test/r5/news-normalizer-test.js','test/r5/article-identity-test.js','test/r5/news-deduplicator-test.js','test/r5/last-good-store-test.js','test/r5/news-pipeline-parity-test.js','test/r5/dependency-boundary-test.js','test/r5/news-http-integration-test.js','test/r5/translation-gate-integration-test.js','test/r5/news-production-parity-test.js','test/r5/news-production-wiring-test.js'];
var overall=false;tests.forEach(function(f){var p=path.join(ROOT,f);console.log('\n=== Running '+f+' ===');var r=cp.spawnSync(process.execPath,[p],{cwd:ROOT,stdio:'inherit',timeout:60000});if(r.status!==0){console.log('FAIL: '+f);overall=true;}});
if(overall){console.log('\n=== R5: some tests FAILED ===');process.exit(1);}else{console.log('\n=== R5: ALL TESTS PASSED ===');process.exit(0);}
