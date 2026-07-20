#!/usr/bin/env node
var path=require('path');var ROOT=path.join(__dirname, '..', '..','..');var ec=0,pass=0,fail=0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
var V=require(path.join(ROOT,'src','learning','learning-validator'));
var P=require(path.join(ROOT,'src','learning','learning-policy'));
var val=V.createValidator();t('VALIDATOR_EXISTS',typeof val.validate==='function','');
t('VALID_VALID',val.validate({sourceUrl:'http://img.jpg'}),'');
t('INVALID_VALID',!val.validate(null),'');
var pol=P.createPolicy({allowedLicenses:['CC0']});t('ALLOWED_LICENSE',pol.isAllowed({license:'CC0'}),'');
t('BLOCKED_LICENSE',!pol.isAllowed({license:'PROPRIETARY'}),'');
t('RESTRICTED_RIGHTS',!pol.isAllowed({rightsStatus:'RESTRICTED'}),'');
console.log('\n=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);
