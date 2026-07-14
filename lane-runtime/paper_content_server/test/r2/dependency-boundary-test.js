#!/usr/bin/env node
// R2.10: Dependency boundary test
// Verifies src/epaper/ modules have no forbidden dependencies.

var path = require('path');
var fs = require('fs');
var ROOT = path.join(__dirname, '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}

var EpaperDir = path.join(ROOT, 'src', 'epaper');
var files = fs.readdirSync(EpaperDir).filter(function(f) { return f.endsWith('.js'); });

var forbidden = [
  { pattern: /require\s*\(\s*['"]\.\/server['"]|require\s*\(\s*['"]\.\.\/server['"]|require\s*\(\s*['"]server['"]/, label: 'require_server' },
  { pattern: /runtime\s*[\.\[]/, label: 'runtime_access' },
  { pattern: /Admin/i, label: 'Admin' },
  { pattern: /[^a-zA-Z]News[^a-zA-Z]/, label: 'News' },
  { pattern: /Library/, label: 'Library' },
  { pattern: /http\.createServer|\.listen\s*\(/, label: 'http_server' },
  { pattern: /['"]data\//, label: 'data_dir' },
  { pattern: /process\.exit/, label: 'process_exit' },
  { pattern: /process\.env/, label: 'process_env' },
];

var allOk = true;

files.forEach(function(file) {
  var content = fs.readFileSync(path.join(EpaperDir, file), 'utf8');
  forbidden.forEach(function(rule) {
    if (rule.pattern.test(content)) {
      t('FORBIDDEN_' + file.toUpperCase() + '_' + rule.label.toUpperCase(), false, file + ' matches ' + rule.label);
      allOk = false;
    }
  });
});

// Verify each module can be required without crashing
files.forEach(function(file) {
  try {
    var mod = require(path.join(EpaperDir, file));
    t('REQUIRE_OK_' + file.replace('.js','').toUpperCase(), true, '');
  } catch(e) {
    t('REQUIRE_OK_' + file.replace('.js','').toUpperCase(), false, e.message);
    allOk = false;
  }
});

t('DEPENDENCY_BOUNDARY', allOk, '');

console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(ec);
