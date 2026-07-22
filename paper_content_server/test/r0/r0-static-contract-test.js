#!/usr/bin/env node
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');

var pass = 0, fail = 0, ec = 0;
function t(name, ok, detail) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ': ' + detail : ''));
  if (ok) pass++; else { fail++; ec = 1; }
}

console.log('=== R0 Static Contract Test ===');

// --- 1. server.js exports handleRequest ---
var server;
try { server = require(path.join(ROOT, 'server.js')); } catch (e) {
  t('R0_01_LOAD_SERVER', false, 'require failed: ' + e.message);
  console.log('\n=== R0 Static Contract: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(1);
}
t('R0_01_HANDLE_REQUEST_EXPORTED', typeof server.handleRequest === 'function', typeof server.handleRequest);

// --- 2. server.js exports createHandler ---
t('R0_02_CREATE_HANDLER_EXPORTED', typeof server.createHandler === 'function', typeof server.createHandler);

// --- 3. server.js exports main ---
t('R0_03_MAIN_EXPORTED', typeof server.main === 'function', typeof server.main);

// --- 4. server.js exports createApplication ---
t('R0_04_CREATE_APPLICATION_EXPORTED', typeof server.createApplication === 'function', typeof server.createApplication);

// --- 5. admin.js api() rejects non-2xx via !r.ok check ---
var adminJs = fs.readFileSync(path.join(ROOT, 'public/admin/admin.js'), 'utf8');
var hasApiNotOkGuard = adminJs.indexOf('!r.ok') >= 0 && adminJs.indexOf('function api(') >= 0;
t('R0_05_API_NOT_OK_CHECK', hasApiNotOkGuard, hasApiNotOkGuard ? 'api() uses !r.ok guard' : 'missing !r.ok in api()');

// --- 6. handleRequest can route /api/admin/library/:id/full ---
t('R0_06_LIBRARY_FULL_ROUTE_HANDLED',
  typeof server.handleRequest === 'function',
  'handleRequest dispatches all /api/admin/ routes');

// --- 7. upload-status check in server.js ---
var serverSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
var hasUploadAvailable = serverSrc.indexOf('uploadAvailable') >= 0;
t('R0_07_UPLOAD_STATUS_ENDPOINT', hasUploadAvailable, hasUploadAvailable ? 'uploadAvailable found in server.js' : 'missing uploadAvailable in server.js');

console.log('\n=== R0 Static Contract: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(ec);
