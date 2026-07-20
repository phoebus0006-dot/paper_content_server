// admin-config-validation-test.js — verifies load-config admin validation rules.
// These rules guarantee startup fails on misconfiguration rather than failing
// silently at request time. Production code reads only APP_CONFIG.admin.
var path = require('path');
var passed = 0, failed = 0, exitCode = 0;
function check(l, c) { if (c) { passed++; console.log('PASS', l) } else { failed++; exitCode = 1; console.log('FAIL', l) } }

var { loadConfig } = require('../../src/config/load-config');

// All tests pass env via opts.env (test path) — no .env loading, no process.env mutation.
function cfg(env) {
  return loadConfig({ env: Object.assign({ PORT: '8787', TRANSLATION_PROVIDER: 'none', TZ: 'UTC' }, env) });
}

console.log('=== Admin Config Validation Test ===');

// TOKEN_WITHOUT_TOKEN_REJECTED
(function() {
  var c = cfg({ ADMIN_ACCESS_MODE: 'token' });
  check('TOKEN_WITHOUT_TOKEN_REJECTED', !c.isValid && c.errors.join('; ').indexOf('ADMIN_TOKEN') >= 0);
})();

// TOKEN_WITH_TOKEN_ACCEPTED
(function() {
  var c = cfg({ ADMIN_ACCESS_MODE: 'token', ADMIN_TOKEN: 'secret-xyz' });
  check('TOKEN_WITH_TOKEN_ACCEPTED', c.isValid);
})();

// LAN_EMPTY_CIDR_REJECTED
(function() {
  var c = cfg({ ADMIN_ACCESS_MODE: 'lan', ADMIN_ALLOWED_CIDRS: '' });
  check('LAN_EMPTY_CIDR_REJECTED', !c.isValid && c.errors.join('; ').indexOf('ADMIN_ALLOWED_CIDRS') >= 0);
})();

// LAN_INVALID_CIDR_REJECTED
(function() {
  var c = cfg({ ADMIN_ACCESS_MODE: 'lan', ADMIN_ALLOWED_CIDRS: '999.1.1.1/24' });
  check('LAN_INVALID_CIDR_REJECTED', !c.isValid && c.errors.join('; ').indexOf('ADMIN_ALLOWED_CIDRS') >= 0);
})();

// LAN_MIXED_VALID_INVALID_REJECTED
(function() {
  var c = cfg({ ADMIN_ACCESS_MODE: 'lan', ADMIN_ALLOWED_CIDRS: '127.0.0.0/8,999.1.1.1/24' });
  check('LAN_MIXED_VALID_INVALID_REJECTED', !c.isValid && c.errors.join('; ').indexOf('ADMIN_ALLOWED_CIDRS') >= 0);
})();

// LAN_VALID_CIDR_ACCEPTED
(function() {
  var c = cfg({ ADMIN_ACCESS_MODE: 'lan', ADMIN_ALLOWED_CIDRS: '127.0.0.0/8,10.0.0.0/8' });
  check('LAN_VALID_CIDR_ACCEPTED', c.isValid);
})();

// TRUST_PROXY_WITHOUT_CIDR_REJECTED
(function() {
  var c = cfg({ ADMIN_ACCESS_MODE: 'lan', ADMIN_ALLOWED_CIDRS: '127.0.0.0/8', TRUST_PROXY: 'true', TRUSTED_PROXY_CIDRS: '' });
  check('TRUST_PROXY_WITHOUT_CIDR_REJECTED', !c.isValid && c.errors.join('; ').indexOf('TRUSTED_PROXY_CIDRS') >= 0);
})();

// TRUST_PROXY_INVALID_CIDR_REJECTED
(function() {
  var c = cfg({ ADMIN_ACCESS_MODE: 'lan', ADMIN_ALLOWED_CIDRS: '127.0.0.0/8', TRUST_PROXY: 'true', TRUSTED_PROXY_CIDRS: '999.1.1.1/24' });
  check('TRUST_PROXY_INVALID_CIDR_REJECTED', !c.isValid && c.errors.join('; ').indexOf('TRUSTED_PROXY_CIDRS') >= 0);
})();

// UNKNOWN_MODE_REJECTED
(function() {
  var c = cfg({ ADMIN_ACCESS_MODE: 'bogus' });
  check('UNKNOWN_MODE_REJECTED', !c.isValid && c.errors.join('; ').indexOf('ADMIN_ACCESS_MODE') >= 0);
})();

// Config object exposes full admin namespace (centralized).
(function() {
  var c = cfg({ ADMIN_ACCESS_MODE: 'lan', ADMIN_ALLOWED_CIDRS: '127.0.0.0/8' });
  check('ADMIN_CONFIG_NAMESPACE_PRESENT', c.admin && typeof c.admin.accessMode === 'string');
  check('ADMIN_ALLOWED_CIDRS_PARSED', c.admin.allowedCidrs && c.admin.allowedCidrs.valid === true && c.admin.allowedCidrs.parsed.length === 1);
  check('ADMIN_TRUST_PROXY_BOOLEAN', typeof c.admin.trustProxy === 'boolean');
  check('ADMIN_HEADERLESS_WRITE_BOOLEAN', typeof c.admin.allowHeaderlessWrite === 'boolean');
})();

console.log('=== Summary:', passed, 'passed,', failed, 'failed ===');
process.exit(exitCode);
