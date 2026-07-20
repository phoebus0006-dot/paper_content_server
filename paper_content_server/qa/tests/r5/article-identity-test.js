#!/usr/bin/env node
// R5.1: Article identity test
var path=require('path');
var ROOT=path.join(__dirname, '..', '..','..');
var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var ai=require(path.join(ROOT,'src','news','article-identity'));
t('NORMALIZE_TITLE',ai.normalizeTitle(' Hello World ')==='hello world','');
t('CREATE_ID',ai.createArticleId('http://a.com/1').startsWith('art_'),'');
var id1=ai.createArticleId('http://a.com/1');
var id2=ai.createArticleId('http://a.com/1');
t('SAME_URL_SAME_ID',id1===id2,'');
var id3=ai.createArticleId('http://a.com/2');
t('DIFF_URL_DIFF_ID',id1!==id3,'');
var ident=ai.extractArticleIdentity({url:'http://a.com/1',title:'Hello'});
t('EXTRACT_URL',ident.canonicalUrl==='http://a.com/1','');
t('EXTRACT_ID',ident.articleId===id1,'');
t('EXTRACT_TITLE',ident.normalizedTitle==='hello','');
t('EVENT_KEY_PARTIAL',ident.eventKey==='PARTIAL','');
console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');
process.exit(ec);
// Empty URL fallback
var noUrl=ai.extractArticleIdentity({title:'Test',source:'Src',publishedAt:'2026-07-11T10:00:00Z'});
t('EMPTY_URL_FALLBACK',noUrl.canonicalUrl.startsWith('fallback://'),'');
t('EMPTY_URL_ID',noUrl.articleId.startsWith('art_'),'');
// Different items with no URL get different IDs
var noUrl2=ai.extractArticleIdentity({title:'Other',source:'Src2',publishedAt:'2026-07-11T11:00:00Z'});
t('EMPTY_URL_DIFFERENT',noUrl.articleId!==noUrl2.articleId,'');