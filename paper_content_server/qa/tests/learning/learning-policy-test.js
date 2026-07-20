#!/usr/bin/env node
// learning-policy-test.js — relevance gate: topic + quality scoring
var path = require('path');
var ROOT = path.join(__dirname, '..', '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

var P = require(path.join(ROOT, 'src', 'learning', 'learning-policy'));

// --- Default policy (no topics configured) ---
(function() {
  var pol = P.createPolicy();
  t('DEFAULT_ALLOWED_LICENSES', pol.allowedLicenses.indexOf('CC0') >= 0 && pol.allowedLicenses.indexOf('PUBLIC_DOMAIN') >= 0, '');
  t('DEFAULT_NO_TOPICS', Array.isArray(pol.topics) && pol.topics.length === 0, '');
  t('DEFAULT_TOPIC_SCORE_NO_TOPICS', pol.computeTopicScore({ title: 'anything' }) === 1, 'no topics -> score 1 (pass all)');
  t('DEFAULT_ALLOWED_CC0', pol.isAllowed({ license: 'CC0' }), '');
  t('DEFAULT_ALLOWED_PUBLIC_DOMAIN_CAPS', pol.isAllowed({ license: 'PUBLIC_DOMAIN' }), '');
})();

// --- Topic score ---
(function() {
  var pol = P.createPolicy({ topics: ['math', 'science'] });
  t('TOPIC_TITLE_MATCH_2', pol.computeTopicScore({ title: 'Math formulas' }) === 2, 'title match +2');
  t('TOPIC_DESC_MATCH_1', pol.computeTopicScore({ description: 'some math' }) === 1, 'desc match +1');
  t('TOPIC_BOTH_MATCH_3', pol.computeTopicScore({ title: 'math basics', description: 'math is fun' }) === 3, 'title+desc match +3');
  t('TOPIC_MULTI_TOPIC', pol.computeTopicScore({ title: 'math and science', description: 'math' }) === 5, 'two topics title(4)+desc(1)=5');
  t('TOPIC_CASE_INSENSITIVE', pol.computeTopicScore({ title: 'MATH' }) === 2, '');
  t('TOPIC_NO_MATCH_0', pol.computeTopicScore({ title: 'cats', description: 'dogs' }) === 0, '');
  t('TOPIC_EMPTY_TITLE_DESC', pol.computeTopicScore({}) === 0, '');
})();

// --- Quality score ---
(function() {
  var pol = P.createPolicy();
  // 800x600 = 0.48MP (< 0.5) -> no size bonus; license +1; sourceUrl +1 = 2
  t('QUALITY_SMALL_IMG', pol.computeQualityScore({ width: 800, height: 600, license: 'CC0', sourceUrl: 'http://x' }) === 2, '');
  // 1000x1000 = 1MP (>= 0.5 but < 2) -> +2; license +1; sourceUrl +1 = 4
  t('QUALITY_MED_IMG', pol.computeQualityScore({ width: 1000, height: 1000, license: 'CC0', sourceUrl: 'http://x' }) === 4, '');
  // 2000x1500 = 3MP (>= 2) -> +3; license +1; sourceUrl +1 = 5
  t('QUALITY_LARGE_IMG', pol.computeQualityScore({ width: 2000, height: 1500, license: 'CC0', sourceUrl: 'http://x' }) === 5, '');
  // no width/height -> no size bonus; no license -> 0; no sourceUrl -> 0 = 0
  t('QUALITY_EMPTY', pol.computeQualityScore({}) === 0, '');
  // only sourceUrl -> 1
  t('QUALITY_ONLY_URL', pol.computeQualityScore({ sourceUrl: 'http://x' }) === 1, '');
})();

// --- Relevance pass ---
(function() {
  var pol = P.createPolicy({ topics: ['biology'], minScore: 2 });
  var cand = { title: 'Biology diagram', description: 'cell biology', license: 'CC0', sourceUrl: 'http://bio.jpg', width: 1000, height: 1000 };
  t('RELEVANCE_PASS', pol.isAllowed(cand) === true, '');
  // topicScore: biology in title (+2) + desc (+1) = 3 >= minScore 2; license CC0 ok; quality >= 0
})();

// --- Relevance reject: topic score too low ---
(function() {
  var pol = P.createPolicy({ topics: ['biology'], minScore: 2 });
  var cand = { title: 'Cars', description: 'fast cars', license: 'CC0', sourceUrl: 'http://car.jpg', width: 1000, height: 1000 };
  t('RELEVANCE_REJECT_TOPIC_SCORE', pol.isAllowed(cand) === false, 'topic score 0 < minScore 2');
})();

// --- Relevance reject: quality score too low ---
(function() {
  var pol = P.createPolicy({ qualityThreshold: 3 });
  // width/height 800x600 = 0.48MP no bonus; license +1; sourceUrl +1 = 2 < 3
  var cand = { license: 'CC0', sourceUrl: 'http://x', width: 800, height: 600 };
  t('RELEVANCE_REJECT_QUALITY', pol.isAllowed(cand) === false, 'quality 2 < 3');
})();

// --- License reject ---
(function() {
  var pol = P.createPolicy();
  t('LICENSE_RESTRICTED', pol.isAllowed({ rightsStatus: 'RESTRICTED' }) === false, '');
  t('LICENSE_PROPRIETARY_REJECTED', pol.isAllowed({ license: 'PROPRIETARY' }) === false, '');
  t('LICENSE_UNKNOWN_ALLOWED', pol.isAllowed({ license: '' }) === true, 'empty license allowed');
})();

// --- Public domain mapping (license='Public domain' with allowedLicenses only having PUBLIC_DOMAIN) ---
(function() {
  var pol = P.createPolicy({ allowedLicenses: ['PUBLIC_DOMAIN'] });
  t('PUBLIC_DOMAIN_STRING_OK', pol.isAllowed({ license: 'Public domain' }) === true, 'Public domain string maps to PUBLIC_DOMAIN');
  var pol2 = P.createPolicy({ allowedLicenses: ['CC0'] });
  t('PUBLIC_DOMAIN_STRING_NOT_IN_LIST', pol2.isAllowed({ license: 'Public domain' }) === false, 'Public domain not allowed when only CC0');
})();

// --- evaluate() returns detailed evaluation ---
(function() {
  var pol = P.createPolicy({ topics: ['math'], minScore: 2, qualityThreshold: 1 });
  var good = { title: 'math lesson', license: 'CC0', sourceUrl: 'http://m.jpg', width: 1000, height: 1000 };
  var ev = pol.evaluate(good);
  t('EVAL_TOPIC_SCORE', ev.topicScore === 2, 'topicScore=' + ev.topicScore);
  t('EVAL_QUALITY_SCORE', ev.qualityScore === 4, 'qualityScore=' + ev.qualityScore);
  t('EVAL_TOTAL_SCORE', ev.totalScore === 6, 'totalScore=' + ev.totalScore);
  t('EVAL_LICENSE_OK', ev.licenseOk === true, '');
  t('EVAL_ALLOWED', ev.allowed === true, '');
  t('EVAL_REJECT_REASON_NULL', ev.rejectReason === null, '');

  // A candidate that fails multiple gates reports the first matching reason (topic before UNKNOWN)
  var bad = { title: 'cars', license: 'PROPRIETARY', sourceUrl: 'http://c.jpg' };
  var ev2 = pol.evaluate(bad);
  t('EVAL_REJECT_NOT_ALLOWED', ev2.allowed === false, '');
  t('EVAL_REJECT_MULTIPLE_FIRST_REASON', ev2.rejectReason === 'TOPIC_SCORE_TOO_LOW', 'when topic+license both fail, topic reason reported first; got ' + ev2.rejectReason);
})();

// --- evaluate reject reason: license-only failure (no topics, no quality threshold) -> UNKNOWN ---
(function() {
  var pol = P.createPolicy(); // no topics, qualityThreshold 0
  var cand = { license: 'PROPRIETARY', sourceUrl: 'http://c.jpg' };
  var ev = pol.evaluate(cand);
  t('EVAL_REJECT_LICENSE_NOT_ALLOWED', ev.allowed === false, '');
  t('EVAL_REJECT_LICENSE_REASON', ev.rejectReason === 'UNKNOWN', 'license not in list & not RESTRICTED falls through to UNKNOWN; got ' + ev.rejectReason);
})();

// --- evaluate reject reason: TOPIC_SCORE_TOO_LOW ---
(function() {
  var pol = P.createPolicy({ topics: ['math'], minScore: 2 });
  var cand = { title: 'cars', license: 'CC0', sourceUrl: 'http://c.jpg' };
  var ev = pol.evaluate(cand);
  t('EVAL_REJECT_TOPIC_REASON', ev.rejectReason === 'TOPIC_SCORE_TOO_LOW', 'rejectReason=' + ev.rejectReason);
})();

// --- evaluate reject reason: LICENSE_RESTRICTED takes precedence ---
(function() {
  var pol = P.createPolicy({ topics: ['math'], minScore: 2 });
  var cand = { title: 'cars', rightsStatus: 'RESTRICTED', sourceUrl: 'http://c.jpg' };
  var ev = pol.evaluate(cand);
  t('EVAL_REJECT_RESTRICTED_REASON', ev.rejectReason === 'LICENSE_RESTRICTED', 'rejectReason=' + ev.rejectReason);
  t('EVAL_LICENSE_NOT_OK', ev.licenseOk === false, '');
})();

// --- evaluate reject reason: QUALITY_SCORE_TOO_LOW ---
(function() {
  var pol = P.createPolicy({ qualityThreshold: 5 });
  // width 800x600 = 0.48MP no bonus; license +1; sourceUrl +1 = 2 < 5
  var cand = { license: 'CC0', sourceUrl: 'http://c.jpg', width: 800, height: 600 };
  var ev = pol.evaluate(cand);
  t('EVAL_REJECT_QUALITY_REASON', ev.rejectReason === 'QUALITY_SCORE_TOO_LOW', 'rejectReason=' + ev.rejectReason);
})();

console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(ec);
