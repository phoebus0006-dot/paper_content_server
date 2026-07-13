#!/usr/bin/env node
// server-no-direct-env-test.js — static check that server.js does not read
// business configuration directly from process.env.
//
// Policy (see the comment block at the top of server.js):
//   - All business config MUST flow through load-config -> APP_CONFIG.
//   - The ONLY whitelisted direct process.env read is NODE_ENV (Node.js
//     runtime standard variable, not business configuration).
//
// This test reads server.js source, strips comment lines, and scans the
// remaining code for `process.env.UPPERCASE_NAME` patterns. Any match other
// than NODE_ENV is a policy violation.
//
// SERVER_DIRECT_PROCESS_ENV_READS=0 is the invariant.
var fs = require('fs');
var path = require('path');
var assert = require('assert');

var SERVER_PATH = path.join(__dirname, '..', '..', 'server.js');

var serverSrc = fs.readFileSync(SERVER_PATH, 'utf8');

// Strip full-line comments (lines whose first non-whitespace char is // or *).
// This prevents false positives from comments that mention process.env.XXX.
// Inline // comments and block comments inside code lines are NOT stripped
// (we want to catch real reads even if someone tried to hide them as inline
// comments), but full-line comments like the policy block at the top of
// server.js are removed so the explanatory comment doesn't trip the test.
var lines = serverSrc.split('\n').filter(function(l) {
  var trimmed = l.trim();
  return trimmed.indexOf('//') !== 0 && trimmed.indexOf('*') !== 0;
});
var code = lines.join('\n');

// Match process.env.UPPERCASE_NAME but NOT process.env.NODE_ENV (the only
// whitelisted runtime variable). Bracket access (process.env[key]) does not
// match this regex — that pattern is used by loadDotEnv to populate env vars
// from the .env file and is not a business-config read.
var matches = code.match(/process\.env\.(?!NODE_ENV\b)[A-Z_]+/g) || [];

var pass = 0, fail = 0, ec = 0;
function t(name, ok, detail) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ': ' + detail : ''));
  if (ok) { pass++; } else { fail++; ec = 1; }
}

console.log('=== server.js no-direct-env test ===');

t('SERVER_DIRECT_PROCESS_ENV_READS', matches.length === 0,
  matches.length === 0
    ? 'no direct business process.env reads'
    : 'found ' + JSON.stringify(matches));

// Sanity: the regex we use would catch a hypothetical violation.
var SANITY = 'process.env.TRANSLATION_PROVIDER';
var sanityMatches = SANITY.match(/process\.env\.(?!NODE_ENV\b)[A-Z_]+/g) || [];
t('SANITY_REGEX_WOULD_CATCH_VIOLATION',
  sanityMatches.length === 1 && sanityMatches[0] === 'process.env.TRANSLATION_PROVIDER',
  JSON.stringify(sanityMatches));

// Sanity: NODE_ENV is excluded by the regex.
var nodeEnvMatches = 'process.env.NODE_ENV'.match(/process\.env\.(?!NODE_ENV\b)[A-Z_]+/g) || [];
t('SANITY_NODE_ENV_EXCLUDED', nodeEnvMatches.length === 0, 'NODE_ENV is whitelisted');

// Sanity: bracket access does not match (loadDotEnv's process.env[key] is allowed).
var bracketMatches = 'if (!process.env[key]) process.env[key] = value;'.match(/process\.env\.(?!NODE_ENV\b)[A-Z_]+/g) || [];
t('SANITY_BRACKET_ACCESS_NOT_MATCHED', bracketMatches.length === 0, 'bracket access is not a direct read');

console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(ec);
