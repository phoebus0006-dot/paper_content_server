#!/usr/bin/env node
var path=require('path');var cp=require('child_process');var ROOT=path.join(__dirname,'..','..');
var tests=['test/r6/mqtt-config-test.js','test/r6/mqtt-topic-test.js','test/r6/mqtt-message-test.js','test/r6/mqtt-publisher-test.js','test/r6/mqtt-reconnect-test.js','test/r6/notification-adapter-test.js','test/r6/dependency-boundary-test.js','test/r6/notification-contract-test.js','test/r6/mqtt-real-client-test.js','test/r6/mqtt-publication-integration-test.js','test/r6/mqtt-real-broker-test.js'];
var overall=false;tests.forEach(function(f){var p=path.join(ROOT,f);console.log('\n=== Running '+f+' ===');var r=cp.spawnSync(process.execPath,[p],{cwd:ROOT,stdio:'inherit',timeout:30000});if(r.status!==0){console.log('FAIL: '+f);overall=true;}});
if(overall){console.log('\n=== R6: some tests FAILED ===');process.exit(1);}else{console.log('\n=== R6: ALL TESTS PASSED ===');process.exit(0);}
