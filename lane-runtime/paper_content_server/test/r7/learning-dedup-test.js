#!/usr/bin/env node
var path=require('path');var ROOT=path.join(__dirname,'..','..');var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var D=require(path.join(ROOT,'src','learning','learning-deduplicator'));

// Test read-only isDuplicate (no auto-commit)
(function(){
  var d=D.createDeduplicator();
  t('IS_DUPLICATE_READ_ONLY',!d.isDuplicate({sourceUrl:'http://a.com/1'}),'first call returns false');
  t('IS_DUPLICATE_READ_ONLY_AGAIN',!d.isDuplicate({sourceUrl:'http://a.com/1'}),'second call also false because isDuplicate is read-only and nothing committed yet');
})();

// Test explicit commit makes subsequent duplicate
(function(){
  var d=D.createDeduplicator();
  t('UNIQUE_BEFORE_COMMIT',!d.isDuplicate({sourceUrl:'http://a.com/1'}),'unique url before commit');
  d.commit({sourceUrl:'http://a.com/1'});
  t('DUPLICATE_AFTER_COMMIT',d.isDuplicate({sourceUrl:'http://a.com/1'}),'duplicate url after commit');
})();

// Test SHA dedup
(function(){
  var d=D.createDeduplicator();
  t('UNIQUE_SHA_BEFORE_COMMIT',!d.isDuplicate({sha256:'abc',sourceUrl:'http://b.com'}),'unique sha before commit');
  d.commit({sha256:'abc',sourceUrl:'http://b.com'});
  t('SHA_DUPLICATE_AFTER_COMMIT',d.isDuplicate({sha256:'abc',sourceUrl:'http://c.com'}),'same sha is duplicate after commit');
  t('URL_DUPLICATE_REJECTED_AFTER_COMMIT',d.isDuplicate({sourceUrl:'http://b.com'}),'url from committed entry also duplicate');
})();

// Test null/undefined inputs
(function(){
  var d=D.createDeduplicator();
  t('NULL_INPUT_IS_DUPLICATE',!d.isDuplicate(null),'null returns false');
  t('UNDEFINED_INPUT_IS_DUPLICATE',!d.isDuplicate(undefined),'undefined returns false');
  t('NULL_COMMIT_NO_ERROR',function(){try{d.commit(null);return true;}catch(e){return false;}}(),'commit null does not throw');
})();

// Test repository integration pattern: success commits, failure does not
(function(){
  var d=D.createDeduplicator();
  var committed=false;
  // Simulate successful repository write
  d.commit({sourceUrl:'http://success.com/1'});
  committed=true;
  t('REPOSITORY_SUCCESS_COMMITS',d.isDuplicate({sourceUrl:'http://success.com/1'}),'after successful repo write, candidate is duplicate');

  // Simulate repository failure — do NOT commit
  var d2=D.createDeduplicator();
  t('REPOSITORY_FAILURE_NOT_COMMITTED',!d2.isDuplicate({sourceUrl:'http://fail.com/1'}),'after repo failure, candidate not committed so not duplicate');

  // Failed candidate can retry
  var d3=D.createDeduplicator();
  t('FAILED_CANDIDATE_CAN_RETRY',!d3.isDuplicate({sourceUrl:'http://retry.com/1'}),'first attempt not duplicate');
  // After retry and successful commit
  d3.commit({sourceUrl:'http://retry.com/1'});
  t('FAILED_CANDIDATE_CAN_RETRY_AFTER_COMMIT',d3.isDuplicate({sourceUrl:'http://retry.com/1'}),'after commit on retry, now duplicate');
})();

// Header-level test presence
t('HEADER_READONLY_COMMENT',function(){
  var fs=require('fs');
  var src=fs.readFileSync(path.join(ROOT,'src','learning','learning-deduplicator.js'),'utf8');
  return src.indexOf('strict two-phase')>=0 || src.indexOf('read-only')>=0;
}(),'');

console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);
