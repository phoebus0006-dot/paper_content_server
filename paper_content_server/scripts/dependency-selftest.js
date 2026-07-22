#!/usr/bin/env node
var path = require('path');
var fs = require('fs');
var ROOT = path.join(__dirname, '..');
var pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
var deps = new Set(Object.keys(pkg.dependencies || {}));
var devDeps = new Set(Object.keys(pkg.devDependencies || {}));
var allDeps = new Set([...deps, ...devDeps]);
var ec = 0;

function walkDir(dir) {
  var entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch(e) { return []; }
  var files = [];
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    var full = path.join(dir, entry.name);
    if (entry.isDirectory()) { files = files.concat(walkDir(full)); }
    else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.mjs') || entry.name.endsWith('.cjs'))) { files.push(full); }
  }
  return files;
}

var srcFiles = walkDir(path.join(ROOT, 'src'));
srcFiles = srcFiles.concat(walkDir(path.join(ROOT, 'test')));
srcFiles = srcFiles.concat(walkDir(path.join(ROOT, 'scripts')));

var optionalModules = new Set([
  'onnxruntime-node',
  'onnxruntime',
  '@tensorflow/tfjs-node',
]);

var builtinModules = new Set([
  'fs', 'path', 'http', 'https', 'os', 'crypto', 'url', 'stream', 'buffer',
  'util', 'events', 'assert', 'child_process', 'net', 'dns', 'tls', 'querystring',
  'string_decoder', 'timers', 'zlib', 'punycode', 'readline', 'cluster',
  'domain', 'constants', 'module', 'process', 'console', 'perf_hooks',
]);

var requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
var foundModules = new Set();

for (var i = 0; i < srcFiles.length; i++) {
  var content = fs.readFileSync(srcFiles[i], 'utf8');
  var match;
  while ((match = requireRegex.exec(content)) !== null) {
    var mod = match[1];
    if (mod.startsWith('.') || mod.startsWith('/') || builtinModules.has(mod)) continue;
    var modName = mod.startsWith('@') ? mod.split('/').slice(0, 2).join('/') : mod.split('/')[0];
    foundModules.add(modName);
  }
}

var failures = [];
for (var mod of foundModules) {
  if (optionalModules.has(mod)) continue;
  if (!allDeps.has(mod)) {
    failures.push('Missing dependency: ' + mod);
    ec = 1;
  }
}

for (var mod of foundModules) {
  if (optionalModules.has(mod)) {
    console.log('OPTIONAL_NOT_INSTALLED: ' + mod);
  } else if (deps.has(mod)) {
    console.log('OK runtime: ' + mod);
  } else if (devDeps.has(mod)) {
    console.log('OK dev: ' + mod);
  } else {
    console.log('MISSING: ' + mod);
  }
}

if (failures.length > 0) {
  console.log('\nFAILED: ' + failures.length + ' undeclared dependencies');
  failures.forEach(function(f) { console.log('  ' + f); });
} else {
  console.log('\nAll external require() calls are declared in package.json');
}
process.exit(ec);
