#!/usr/bin/env node
// I-news-lastgood-contract: characterize last-good news behavior
var path=require('path');
var mod=require(path.join(__dirname,'..','..','server.js'));
var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var sem=mod.isTextSemanticallyComplete;
t('SEM_FN',!!sem,'');
t('EMPTY_TITLE_REJECT',!sem('','内容。','original').complete,'');
t('NON_CHINESE_TRANSLATED_REJECT',!sem('English Title','中文内容。','translated').complete,'');
t('INSUFFICIENT_REJECT',!sem('短','。','translated').complete,'');
t('VALID_PASSES',sem('中国经济持续增长','国家统计局数据显示GDP增长5.2%。','original').complete,'');
var rwt=mod.rewriteNewsTitle;
t('RWT_FN',!!rwt,'');
var rws=mod.rewriteNewsSummary;
t('RWS_FN',!!rws,'');
console.log('=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);
