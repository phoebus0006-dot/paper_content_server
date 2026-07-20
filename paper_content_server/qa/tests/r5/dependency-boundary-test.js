#!/usr/bin/env node
// R5.1: Dependency boundary — src/news/ only imports R1 infra and own modules
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
var newsDir=path.join(ROOT,'src','news');
var issues=checkImports(newsDir,['../infra/','./','path','crypto','fs']);
t('NEWS_BOUNDARY',issues.length===0,issues.join('; '));
var allSrc=fs.readdirSync(newsDir).filter(function(f){return f.endsWith('.js');}).map(function(f){return fs.readFileSync(path.join(newsDir,f),'utf8');}).join('\n');
var reqs=allSrc.match(/require\([^)]+\)/g)||[];
t('NO_SERVER',reqs.filter(function(r){return r.indexOf('server')>=0;}).length===0,'');
t('NO_RUNTIME',reqs.filter(function(r){return r.indexOf('runtime')>=0;}).length===0,'');
console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');
process.exit(ec);
