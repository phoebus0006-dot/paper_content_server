#!/usr/bin/env node
// News Contract — validate buildNewsSnapshot output structure
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var mod = require(path.join(ROOT, 'server.js'));
var exitCode = 0, passed = 0, failed = 0;

function test(name, ok, detail) {
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ': ' + detail : ''));
  if (ok) passed++; else { failed++; exitCode = 1; }
}

// Test isTextSemanticallyComplete directly (production function)
var sem = mod.isTextSemanticallyComplete;
if (!sem) { test('SEMANTIC_FN', false, 'isTextSemanticallyComplete not exported'); process.exit(1); }

// Valid Chinese
var r = sem('中国经济持续增长', '国家统计局数据显示GDP同比增长5.2%。', 'original');
test('VALID_ZH_PASSES', r.complete, r.reasons.join(','));

// Empty title
r = sem('', '内容。', 'original');
test('EMPTY_TITLE', !r.complete && r.reasons.indexOf('EMPTY_TITLE') >= 0, r.reasons.join(','));

// Translated but no Chinese in title
r = sem('Lido Pimienta', '哥伦比亚音乐家获大奖。', 'translated');
test('TRANSLATED_NON_CHINESE_TITLE', !r.complete && r.reasons.indexOf('TRANSLATED_TITLE_NOT_CHINESE') >= 0, r.reasons.join(','));

// Translated but no Chinese in summary
r = sem('美国打击伊朗', 'The funeral in Tehran on Thursday.', 'translated');
test('TRANSLATED_ENGLISH_SUMMARY', !r.complete && r.reasons.indexOf('TRANSLATED_SUMMARY_NOT_CHINESE') >= 0, r.reasons.join(','));

// Hanging end (title needs to be long enough to not trigger fragment check)
r = sem('欧盟计划对美国加征关税将', '欧盟对美国加征关税。', 'translated');
test('HANGING_END_REJECT', !r.complete && r.reasons.indexOf('HANGING_END') >= 0, r.reasons.join(','));

// Photo credit residue
r = sem('中国经济', 'Photo: John Smith. 数据良好。', 'translated');
test('PHOTO_CREDIT_REJECT', !r.complete && r.reasons.indexOf('PHOTO_CREDIT_RESIDUE') >= 0, r.reasons.join(','));

// Test normalizeEntitiesAndAcronyms
var nea = mod.normalizeEntitiesAndAcronyms;
test('NEA_OPENAI', nea && nea('Open AI') === 'OpenAI', nea ? nea('Open AI') : 'fn missing');
test('NEA_CHATGPT', nea && nea('Chat GPT') === 'ChatGPT', nea ? nea('Chat GPT') : 'fn missing');
test('NEA_NATO', nea && nea('N A T O') === 'NATO', nea ? nea('N A T O') : 'fn missing');

// Test PROTECTED_ENTITIES
var pe = mod.PROTECTED_ENTITIES;
test('PE_OPENAI', pe && pe.indexOf('OpenAI') >= 0, 'missing');
test('PE_NATO', pe && pe.indexOf('NATO') >= 0, 'missing');
test('PE_GDP', pe && pe.indexOf('GDP') >= 0, 'missing');
test('PE_CEO', pe && pe.indexOf('CEO') >= 0, 'missing');

console.log('\n=== Summary: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(exitCode);
