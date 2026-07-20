#!/usr/bin/env node
// R1.7: HTTP Client test
var path = require('path');
var http = require('http');
var ROOT = path.join(__dirname, '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}

var createHttpClient = require(path.join(ROOT, 'src', 'infra', 'http-client')).createHttpClient;
t('FN_EXISTS', typeof createHttpClient === 'function', '');

var client = createHttpClient(5000);
t('DEFAULT_TIMEOUT', client.defaultTimeoutMs === 5000, ''+client.defaultTimeoutMs);
t('FETCH_TEXT_EXISTS', typeof client.fetchText === 'function', '');
t('FETCH_JSON_EXISTS', typeof client.fetchJson === 'function', '');

console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(ec);
