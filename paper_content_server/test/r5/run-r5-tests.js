#!/usr/bin/env node
// R5 test runner — executes all R5 tests sequentially
var path=require('path');
var cp=require('child_process');
var ROOT=path.join(__dirname,'..','..');
var tests=[
  'test/r5/news-normalizer-test.js',
  'test/r5/article-identity-test.js',
  'test/r5/news-deduplicator-test.js',
  'test/r5/last-good-store-test.js',
  'test/r5/news-pipeline-parity-test.js',
  'test/r5/dependency-boundary-test.js',
];
var overallFail=false;
tests.forEach(function(testFile){
  var testPath=path.join(ROOT,testFile);
  console.log('\n=== Running '+testFile+' ===');
  var result=cp.spawnSync(process.execPath,[testPath],{cwd:ROOT,stdio:'inherit',timeout:60000});
  if(result.status!==0){console.log('FAIL: '+testFile+' exited with code '+result.status);overallFail=true;}
});
if(overallFail){console.log('\n=== R5: some tests FAILED ===');process.exit(1);}
else{console.log('\n=== R5: ALL TESTS PASSED ===');process.exit(0);}
