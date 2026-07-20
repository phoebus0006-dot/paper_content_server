#!/usr/bin/env node
// R3 test: dependency boundary — src/snapshot and src/publication only import R1 infra
var path=require('path'),fs=require('fs');
var ROOT=path.join(__dirname,'..','..');
var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
function checkImports(dir,allowed){
  var files=fs.readdirSync(dir).filter(function(f){return f.endsWith('.js');});
  var issues=[];
  files.forEach(function(f){
    var src=fs.readFileSync(path.join(dir,f),'utf8');
    var reqs=src.match(/require\([^)]+\)/g)||[];
    reqs.forEach(function(r){
      var found=false;
      allowed.forEach(function(a){if(r.indexOf(a)>=0)found=true;});
      if(!found&&r.indexOf('./')===0)issues.push(f+':'+r);
    });
  });
  return issues;
}
// src/snapshot/ may only import: infra, epaper/epf1, crypto, path, fs, os
var snapIssues=checkImports(path.join(ROOT,'src','snapshot'),['../infra/','../epaper/','crypto','path','fs']);
t('SNAPSHOT_BOUNDARY',snapIssues.length===0,snapIssues.join('; '));
// src/publication/ may only import: infra, ../snapshot/, path, fs
var pubIssues=checkImports(path.join(ROOT,'src','publication'),['../infra/','../snapshot/','path','fs','crypto']);
t('PUBLICATION_BOUNDARY',pubIssues.length===0,pubIssues.join('; '));
// Check snapshot does not import publication or server or app
var allSnapSrc=fs.readdirSync(path.join(ROOT,'src','snapshot')).filter(function(f){return f.endsWith('.js');}).map(function(f){return fs.readFileSync(path.join(ROOT,'src','snapshot',f),'utf8');}).join('\n');
t('SNAPSHOT_NO_PUBLICATION',allSnapSrc.indexOf('../publication/')===-1,'');
t('SNAPSHOT_NO_SERVER',allSnapSrc.indexOf('server.js')===-1,'');
t('SNAPSHOT_NO_APP',allSnapSrc.indexOf('../app/')===-1,'');
// Check publication does not import server or app
var allPubSrc=fs.readdirSync(path.join(ROOT,'src','publication')).filter(function(f){return f.endsWith('.js');}).map(function(f){return fs.readFileSync(path.join(ROOT,'src','publication',f),'utf8');}).join('\n');
t('PUBLICATION_NO_SERVER',allPubSrc.indexOf('server.js')===-1,'');
t('PUBLICATION_NO_APP',allPubSrc.indexOf('../app/')===-1,'');
// Check server imports snapshot and publication correctly
var serverSrc=fs.readFileSync(path.join(ROOT,'server.js'),'utf8');
t('SERVER_IMPORTS_SNAPSHOT',serverSrc.indexOf('./src/snapshot/')>=0,'');
t('SERVER_IMPORTS_PUBLICATION',serverSrc.indexOf('./src/publication/')>=0,'');
console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');
process.exit(ec);
