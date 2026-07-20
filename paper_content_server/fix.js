const fs = require('fs');
let c = fs.readFileSync('qa/tests/integration/v3-production-path-test.js', 'utf8');
const header = `const test = require('node:test');
const assert = require('node:assert');
var http = require('http');
var crypto = require('crypto');
var { spawn } = require('child_process');
var path = require('path');
var fs = require('fs');

var ROOT = path.join(__dirname, '..', '..', '..');
var SRV = path.join(ROOT, 'server.js');
var ec = 0, pass = 0, fail = 0;
var TOKEN = 'v3-test-token-' + crypto.randomBytes(4).toString('hex');

function t(n, ok, d) {
  assert.ok(ok, n + (d ? ': ' + d : ''));
  if (ok) pass++; else { ec = 1; fail++; }
}

function makeTmpDir(label) {
  var runId = 'run_' + Date.now().toString(36); var d = path.join(ROOT, 'qa', 'runtime', runId, 'data');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function makeEnv(dataDir, extra) {
  return Object.assign({}, process.env, {
    TZ: 'Europe/Paris',
`;
c = c.replace(/^[\s\S]*?TRANSLATION_PROVIDER: 'none',/m, header + "    TRANSLATION_PROVIDER: 'none',");
fs.writeFileSync('qa/tests/integration/v3-production-path-test.js', c);
