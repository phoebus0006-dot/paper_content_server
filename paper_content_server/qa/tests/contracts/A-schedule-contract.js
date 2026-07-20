#!/usr/bin/env node
// A-schedule-contract: direct call to production lib/schedule.js
var path = require('path');
var mod = require(path.join(__dirname, '..', '..', '..', 'lib', 'schedule.js'));
var ec = 0, pass = 0, fail = 0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}
function wt(y,M,d,h,m){return{year:y,month:M,day:d,hour:h,minute:m}}
var tz='Europe/Paris';
var cases=[
  {h:9,m:59,e:'photo'},{h:10,m:0,e:'photo'},{h:10,m:1,e:'photo'},{h:10,m:29,e:'photo'},
  {h:10,m:30,e:'news'},{h:10,m:31,e:'news'},{h:10,m:59,e:'news'},
  {h:11,m:0,e:'photo'},{h:11,m:29,e:'photo'},{h:11,m:30,e:'news'},{h:11,m:59,e:'news'},
  {h:18,m:0,e:'photo'},{h:18,m:30,e:'news'},{h:18,m:59,e:'news'},
  {h:19,m:0,e:'photo'},{h:19,m:30,e:'photo'},{h:23,m:30,e:'photo'},
];
cases.forEach(function(c){var r=mod.resolveDisplayMode(wt(2026,7,9,c.h,c.m),tz);t(c.h+':'+c.m+'->'+r.mode,r.mode===c.e,'got='+r.mode)});
var b1=mod.resolveDisplayMode(wt(2026,7,9,10,29),tz);
var b2=mod.resolveDisplayMode(wt(2026,7,9,10,30),tz);
t('Boundary 10:29->10:30',b1.mode!==b2.mode,b1.mode+'->'+b2.mode);
console.log('=== Summary: '+pass+' passed, '+fail+' failed ===');process.exit(ec);
