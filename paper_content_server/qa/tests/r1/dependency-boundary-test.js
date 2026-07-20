#!/usr/bin/env node
// R1.8: Dependency boundary — infra and config must not import server.js
var path = require('path');
var fs = require('fs');
var ROOT = path.join(__dirname, '..', '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}

var srcDir = path.join(ROOT, 'src');

function checkDir(dir, label) {
  if (!fs.existsSync(dir)) return;
  var files = fs.readdirSync(dir, { recursive: true }).filter(function(f) { return f.endsWith('.js'); });
  var violations = [];
  files.forEach(function(f) {
    var fp = path.join(dir, f);
    var content = fs.readFileSync(fp, 'utf8');
    if (content.includes("require('./server')") || content.includes("require('../server')") || content.includes("require('../../server')")) {
      violations.push(f);
    }
    if (content.includes('runtime.newsCache') || content.includes('runtime.cachedFrames') || content.includes('runtime.libraryState') || content.includes('runtime.imageIndex')) {
      violations.push(f + ' (runtime state access)');
    }
  });
  if (violations.length > 0) {
    t(label + ' NO_IMPORTS', false, violations.join(', '));
  } else {
    t(label + ' NO_IMPORTS', true, '');
  }
}

checkDir(path.join(srcDir, 'infra'), 'infra');
checkDir(path.join(srcDir, 'config'), 'config');

console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(ec);
