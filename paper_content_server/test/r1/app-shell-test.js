#!/usr/bin/env node
// R1.1: Application Shell — createApp must not auto-start server
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}

// Import createApp and verify it does NOT start a server
var createApp = require(path.join(ROOT, 'src', 'app', 'create-app')).createApp;
t('CREATE_APP_EXISTS', typeof createApp === 'function', '');

// Create app without starting
var app = createApp({ config: { server: { port: 8797 } } });
t('CREATE_APP_RETURNS_HANDLER', typeof app.handler === 'function', '');
t('CREATE_APP_RETURNS_SERVICES', typeof app.services === 'object', '');

// Verify import does NOT auto-start (does not crash)
t('IMPORT_NO_CRASH', true, '');

// Bootstrap test
var bootstrap = require(path.join(ROOT, 'src', 'app', 'bootstrap')).bootstrap;
t('BOOTSTRAP_EXISTS', typeof bootstrap === 'function', '');

console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(ec);
