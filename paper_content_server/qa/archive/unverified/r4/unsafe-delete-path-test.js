#!/usr/bin/env node
// Lane A: Unsafe delete path — path validation
var path=require('path'),fs=require('fs'),os=require('os');
var ROOT=path.join(__dirname,'..','..');var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var RC=require(path.join(ROOT,'src','safety','reference-cleaner')).ReferenceCleaner;
var tmp=path.join(os.tmpdir(),'r4_path_'+Date.now());fs.mkdirSync(tmp,{recursive:true});
var lg={};
var cleaner=RC(null,null,null,tmp,lg);
fs.writeFileSync(path.join(tmp,'img.png'),'img');
fs.writeFileSync(path.join(tmp,'config.json'),'{}');
t('ALLOWED_IMG',cleaner.isPathAllowed(path.join(tmp,'img.png')),'');
t('REJECTED_JSON',!cleaner.isPathAllowed(path.join(tmp,'config.json')),'');
t('REJECTED_DIR',!cleaner.isPathAllowed(tmp),'');
t('REJECTED_NULL',!cleaner.isPathAllowed(null),'');
t('REJECTED_EMPTY',!cleaner.isPathAllowed(''),'');
try{fs.rmdirSync(tmp,{recursive:true})}catch(e){}
console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);
