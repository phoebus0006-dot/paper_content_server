#!/usr/bin/env node
// E-news-contract: production news pipeline functions (semantic gate, entities, rewrite)
var path=require('path');
var mod=require(path.join(__dirname, '..', '..','..','server.js'));
var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var sem=mod.isTextSemanticallyComplete;
if(!sem){t('SEMANTIC_FN',false,'');process.exit(1)}
t('GOOD_ZH',sem('中国经济持续增长','国家统计局数据显示GDP同比增长5.2%。','original').complete,'');
t('EMPTY_TITLE',!sem('','内容。','original').complete,'');
t('TRANSLATED_NON_CHINESE_TITLE',!sem('Lido Pimienta','哥伦比亚音乐家。','translated').complete,'');
t('TRANSLATED_ENGLISH_SUMMARY',!sem('美国打击伊朗','The funeral in Tehran.','translated').complete,'');
t('HANGING_END',!sem('欧盟计划对美国加征关税将','内容。','translated').complete,'');
t('PHOTO_CREDIT',!sem('中国经济','Photo:John Smith. 数据良好。','translated').complete,'');
var nea=mod.normalizeEntitiesAndAcronyms;
t('NEA_OPENAI',nea('Open AI')==='OpenAI',nea('Open AI'));
t('NEA_CHATGPT',nea('Chat GPT')==='ChatGPT',nea('Chat GPT'));
t('NEA_NATO',nea('N A T O')==='NATO',nea('N A T O'));
var pe=mod.PROTECTED_ENTITIES;
t('PE_OPENAI',pe.includes('OpenAI'),'');t('PE_NATO',pe.includes('NATO'),'');t('PE_GDP',pe.includes('GDP'),'');
var rwt=mod.rewriteNewsTitle;
t('RWT_SHORT',rwt({zhTitle:'中国经济持续增长'})==='中国经济持续增长','');
t('RWT_NO_HANG',!/[的为在向与和]$/.test(rwt({zhTitle:'欧盟计划对美国加征关税'})),'');
var rws=mod.rewriteNewsSummary;
t('RWS_ENDS_PERIOD',/[。！？]$/.test(rws({zhSummary:'测试摘要没句号'})),'');
t('RWS_NO_PHOTO',rws({zhSummary:'Photo:JS. 数据良好。'}).indexOf('Photo:')<0,'');
t('RWS_NO_CONTINUE',rws({zhSummary:'数据良好。Continue reading...'}).indexOf('Continue')<0,'');
console.log('=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);
