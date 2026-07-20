#!/usr/bin/env node
// Lane A: Failure audit — FAILED status recorded
var path=require('path'),fs=require('fs'),os=require('os');
var ROOT=path.join(__dirname,'..','..');var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var SAL=require(path.join(ROOT,'src','safety','safety-audit-log')).SafetyAuditLog;
var tmp=path.join(os.tmpdir(),'r4_faud_'+Date.now());fs.mkdirSync(tmp,{recursive:true});
var lg={info:function(){},warn:function(){},error:function(){}};
async function run(){
  var aud=SAL(path.join(tmp,'audit.log'),lg);
  await aud.append({assetId:'ast_fail',action:'delete',status:'FAILED',stage:'file_unlink',reason:'EPERM',error:'permission denied'});
  await aud.append({assetId:'ast_ok',action:'delete',status:'SUCCESS',stage:'complete'});
  var all=await aud.readAll();
  t('FAILED_AUDIT_EXISTS',all.some(function(a){return a.assetId==='ast_fail'&&a.status==='FAILED';}),'');
  t('SUCCESS_AUDIT_EXISTS',all.some(function(a){return a.assetId==='ast_ok'&&a.status==='SUCCESS';}),'');
  try{fs.rmdirSync(tmp,{recursive:true})}catch(e){}
  console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);
}
run().catch(function(e){console.log('CRASH: '+e.message);process.exit(1)});
