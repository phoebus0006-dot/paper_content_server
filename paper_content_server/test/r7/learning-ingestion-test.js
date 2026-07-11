#!/usr/bin/env node
var path=require('path');var ROOT=path.join(__dirname,'..','..');var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var IS=require(path.join(ROOT,'src','learning','learning-ingestion-service'));
var V=require(path.join(ROOT,'src','learning','learning-validator'));
var D=require(path.join(ROOT,'src','learning','learning-deduplicator'));
var P=require(path.join(ROOT,'src','learning','learning-policy'));
var SR=require(path.join(ROOT,'src','learning','learning-source-registry'));
var SP=require(path.join(ROOT,'src','learning','learning-source-port'));
var validator=V.createValidator();var dedup=D.createDeduplicator();var policy=P.createPolicy();
var reg=SR.createSourceRegistry();var src=SP.createSourcePort({name:'test',fetchCandidates:function(){return Promise.resolve([]);}});
reg.register('test',src);var svc=IS.createIngestionService(reg,validator,dedup,policy,null,{});
t('SVC_EXISTS',typeof svc.ingestAll==='function','');
(async function(){var r=await svc.ingestOne({sourceUrl:'http://img2.jpg',source:'test'});t('INGEST_ACCEPTED',r.status==='ACCEPTED','');
var r2=await svc.ingestOne({sourceUrl:'http://img2.jpg',source:'test'});t('INGEST_DUPLICATE',r2.status==='DUPLICATE','');
var r3=await svc.ingestAll();t('INGEST_ALL',Array.isArray(r3),'');console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);})();
