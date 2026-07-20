#!/usr/bin/env node
// R5.1: News deduplicator test
var path=require('path');
var ROOT=path.join(__dirname, '..', '..','..');
var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var dd=require(path.join(ROOT,'src','news','news-deduplicator'));
var items=[{url:'http://a.com/1'},{url:'http://a.com/1'},{url:'http://b.com/2'}];
var deduped=dd.deduplicate(items);
t('DEDUP_COUNT',deduped.length===2,'count='+deduped.length);
t('DEDUP_UNIQUE',deduped[0].url!==deduped[1].url,'');
t('DEDUP_EMPTY',Array.isArray(dd.deduplicate([])),'');
t('DEDUP_NULL',Array.isArray(dd.deduplicate(null)),'');
console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');
process.exit(ec);
