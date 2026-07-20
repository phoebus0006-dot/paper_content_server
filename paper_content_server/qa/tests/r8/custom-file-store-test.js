#!/usr/bin/env node
var path=require('path'),fs=require('fs'),os=require('os');var ROOT=path.join(__dirname, '..', '..','..');var ec=0,pass=0,fail=0;function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var FS=require(path.join(ROOT,'src','custom-library','custom-file-store')).createFileStore;
var tmp=path.join(os.tmpdir(),'r8_fs_'+Date.now());fs.mkdirSync(tmp,{recursive:true});fs.mkdirSync(path.join(tmp,'quar'),{recursive:true});fs.mkdirSync(path.join(tmp,'assets'),{recursive:true});
var store=FS(path.join(tmp,'quar'),path.join(tmp,'assets'),{});
fs.writeFileSync(path.join(tmp,'src.jpg'),'img');
var q=store.storeQuarantine(Buffer.from('img'));
t('QUARANTINE_EXISTS',fs.existsSync(q),'');
var m=store.moveToAssets(q,'ast_test');
t('MOVED_EXISTS',fs.existsSync(m),'');
store.cleanup(path.join(tmp,'nonexistent'));
t('CLEANUP_NOOP',true,'');
try{fs.rmdirSync(tmp,{recursive:true})}catch(e){}
console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);