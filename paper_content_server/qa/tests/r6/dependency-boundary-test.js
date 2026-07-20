#!/usr/bin/env node
var path=require('path'),fs=require('fs');var ROOT=path.join(__dirname, '..', '..','..');var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
function checkImports(dir,allowed){var files=fs.readdirSync(dir).filter(function(f){return f.endsWith('.js');});var issues=[];
  files.forEach(function(f){var src=fs.readFileSync(path.join(dir,f),'utf8');(src.match(/require\([^)]+\)/g)||[]).forEach(function(r){var ok=false;allowed.forEach(function(a){if(r.indexOf(a)>=0)ok=true;});if(!ok&&r.indexOf('./')===0)issues.push(f+':'+r);});});return issues;}
var mqDir=path.join(ROOT,'src','mqtt');var issues=checkImports(mqDir,['./','crypto']);
t('MQTT_BOUNDARY',issues.length===0,issues.join(';'));
var allSrc=fs.readdirSync(mqDir).filter(function(f){return f.endsWith('.js');}).map(function(f){return fs.readFileSync(path.join(mqDir,f),'utf8');}).join('\n');
var reqs=allSrc.match(/require\([^)]+\)/g)||[];
t('NO_SERVER',reqs.filter(function(r){return r.indexOf('server')>=0;}).length===0,'');
t('NO_SNAPSHOT',reqs.filter(function(r){return r.indexOf('snapshot')>=0;}).length===0,'');
t('NO_ASSETS',reqs.filter(function(r){return r.indexOf('assets')>=0;}).length===0,'');
t('NO_NEWS',reqs.filter(function(r){return r.indexOf('news')>=0;}).length===0,'');
console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);
