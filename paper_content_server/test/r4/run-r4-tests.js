#!/usr/bin/env node
// R4 test runner — executes all R4 tests sequentially
var path=require('path');
var cp=require('child_process');
var ROOT=path.join(__dirname,'..','..');
var tests=[
  'test/r4/asset-model-test.js',
  'test/r4/asset-repository-test.js',
  'test/r4/legacy-asset-adapter-test.js',
  'test/r4/asset-reference-index-test.js',
  'test/r4/dependency-boundary-test.js',
];
var overallFail=false;
tests.forEach(function(testFile){
  var testPath=path.join(ROOT,testFile);
  console.log('\n=== Running '+testFile+' ===');
  var result=cp.spawnSync(process.execPath,[testPath],{cwd:ROOT,stdio:'inherit',timeout:60000});
  if(result.status!==0){console.log('FAIL: '+testFile+' exited with code '+result.status);overallFail=true;}
});
if(overallFail){console.log('\n=== R4: some tests FAILED ===');process.exit(1);}
else{console.log('\n=== R4: ALL TESTS PASSED ===');process.exit(0);}
