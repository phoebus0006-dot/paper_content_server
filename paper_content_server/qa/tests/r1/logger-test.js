#!/usr/bin/env node
// R1.4: Logger abstraction test
var path = require('path');
var ROOT = path.join(__dirname, '..', '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}

var mod = require(path.join(ROOT, 'src', 'infra', 'logger'));
t('CONSOLE_LOGGER', typeof mod.ConsoleLogger === 'function', '');
t('SILENT_LOGGER', typeof mod.SilentLogger === 'function', '');
t('MEMORY_LOGGER', typeof mod.MemoryLogger === 'function', '');

// Memory logger records entries
var mem = mod.MemoryLogger();
mem.info('test message');
t('MEMORY_RECORDS', mem.entries().length === 1, 'count=' + mem.entries().length);
t('MEMORY_LEVEL', mem.entries()[0].level === 'info', mem.entries()[0].level);
t('MEMORY_MSG', mem.entries()[0].msg === 'test message', mem.entries()[0].msg);

// Clear
mem.clear();
t('MEMORY_CLEAR', mem.entries().length === 0, '');

// Silent logger produces no output
var sil = mod.SilentLogger();
sil.warn('should not crash');
t('SILENT_NO_CRASH', true, '');

console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(ec);
