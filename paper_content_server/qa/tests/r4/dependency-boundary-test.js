#!/usr/bin/env node
// R4.1: Dependency boundary — src/assets/ only imports R1 infra
var path=require('path'),fs=require('fs');
var ROOT=path.join(__dirname, '..', '..','..');
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
var assetsDir=path.join(ROOT,'src','assets');
var issues=checkImports(assetsDir,['../infra/','./','path','fs','crypto']);
t('ASSETS_BOUNDARY',issues.length===0,issues.join('; '));
// Check no imports to snapshot, publication, server, app, epaper
var allSrc=fs.readdirSync(assetsDir).filter(function(f){return f.endsWith('.js');}).map(function(f){return fs.readFileSync(path.join(assetsDir,f),'utf8');}).join('\n');
var reqs=allSrc.match(/require\([^)]+\)/g)||[];
t('NO_SNAPSHOT',reqs.filter(function(r){return r.indexOf('../snapshot/')>=0;}).length===0,'');
t('NO_PUBLICATION',reqs.filter(function(r){return r.indexOf('../publication/')>=0;}).length===0,'');
t('NO_SERVER',reqs.filter(function(r){return r.indexOf('server')>=0;}).length===0,'');
t('NO_APP',reqs.filter(function(r){return r.indexOf('../app/')>=0;}).length===0,'');
t('NO_EPAPER',reqs.filter(function(r){return r.indexOf('../epaper/')>=0;}).length===0,'');
console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');
process.exit(ec);
