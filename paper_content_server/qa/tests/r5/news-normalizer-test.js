#!/usr/bin/env node
// R5.1: News normalizer test
var path=require('path');
var ROOT=path.join(__dirname, '..', '..','..');
var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var nm=require(path.join(ROOT,'src','news','news-normalizer'));
var raw={url:'http://a.com/1',title:'Test',description:'Summary text',source:'SrcA',category:'tech',language:'en'};
var norm=nm.normalizeRawItem(raw);
t('NORM_EXISTS',norm!==null,'');
t('NORM_URL',norm.url==='http://a.com/1','');
t('NORM_TITLE',norm.title==='Test','');
t('NORM_DESCRIPTION',norm.description==='Summary text','');
t('NORM_SOURCE',norm.source==='SrcA','');
t('NORM_STATUS',norm.translationStatus==='pending','');
var items=nm.normalizeFeedItems([raw,null,raw]);
t('NORM_LIST',items.length===2,'count='+items.length);
console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');
process.exit(ec);
