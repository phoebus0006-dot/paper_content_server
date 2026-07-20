#!/usr/bin/env node
// translation-config-validation-test.js — verifies load-config translation
// provider key validation rules. Production must fail fast at startup when a
// provider is selected without its required API key, when an unknown provider
// is configured, or when config.json is malformed JSON (must not silently
// fall back to defaults).
var path = require('path');
var fs = require('fs');
var os = require('os');
var passed = 0, failed = 0, exitCode = 0;
function check(l, c) { if (c) { passed++; console.log('PASS', l) } else { failed++; exitCode = 1; console.log('FAIL', l) } }

var { loadConfig } = require(path.join(__dirname, '..', '..', 'src', 'config', 'load-config'));

function cfg(env, opts) {
  opts = opts || {};
  // Provide a minimal valid admin config so validation failures are isolated
  // to translation provider rules. Default ADMIN_ACCESS_MODE=lan + CIDR.
  var fullEnv = Object.assign({
    PORT: '8787',
    TZ: 'UTC',
    ADMIN_ACCESS_MODE: 'lan',
    ADMIN_ALLOWED_CIDRS: '127.0.0.0/8'
  }, env);
  var callOpts = { env: fullEnv };
  if (opts.cwd) callOpts.cwd = opts.cwd;
  return loadConfig(callOpts);
}

console.log('=== Translation Config Validation Test ===');

// ── Provider = none (default) — valid without keys ──
(function() {
  var c = cfg({ TRANSLATION_PROVIDER: 'none' });
  check('NONE_DEFAULT_VALID', c.isValid, c.errors.join('; '));
})();

// ── Provider = openai without OPENAI_API_KEY — invalid ──
(function() {
  var c = cfg({ TRANSLATION_PROVIDER: 'openai' });
  check('OPENAI_NO_KEY_REJECTED', !c.isValid);
  check('OPENAI_NO_KEY_MESSAGE', c.errors.join('; ').indexOf('OPENAI_API_KEY') >= 0);
})();

// ── Provider = openai with OPENAI_API_KEY — valid ──
(function() {
  var c = cfg({ TRANSLATION_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test' });
  check('OPENAI_WITH_KEY_VALID', c.isValid, c.errors.join('; '));
})();

// ── Provider = deepl without DEEPL_API_KEY — invalid ──
(function() {
  var c = cfg({ TRANSLATION_PROVIDER: 'deepl' });
  check('DEEPL_NO_KEY_REJECTED', !c.isValid);
  check('DEEPL_NO_KEY_MESSAGE', c.errors.join('; ').indexOf('DEEPL_API_KEY') >= 0);
})();

// ── Provider = deepl with DEEPL_API_KEY — valid ──
(function() {
  var c = cfg({ TRANSLATION_PROVIDER: 'deepl', DEEPL_API_KEY: 'test-key' });
  check('DEEPL_WITH_KEY_VALID', c.isValid, c.errors.join('; '));
})();

// ── Provider = gemini without GEMINI_API_KEY — invalid ──
(function() {
  var c = cfg({ TRANSLATION_PROVIDER: 'gemini' });
  check('GEMINI_NO_KEY_REJECTED', !c.isValid);
  check('GEMINI_NO_KEY_MESSAGE', c.errors.join('; ').indexOf('GEMINI_API_KEY') >= 0);
})();

// ── Provider = gemini with GEMINI_API_KEY — valid ──
(function() {
  var c = cfg({ TRANSLATION_PROVIDER: 'gemini', GEMINI_API_KEY: 'AIza-test' });
  check('GEMINI_WITH_KEY_VALID', c.isValid, c.errors.join('; '));
})();

// ── Unknown provider — invalid ──
(function() {
  var c = cfg({ TRANSLATION_PROVIDER: 'azure' });
  check('UNKNOWN_PROVIDER_REJECTED', !c.isValid);
  check('UNKNOWN_PROVIDER_MESSAGE', c.errors.join('; ').indexOf('not a known provider') >= 0);
})();

// ── config.json missing → defaults apply, valid ──
(function() {
  var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paper-cfg-'));
  var c = cfg({ TRANSLATION_PROVIDER: 'none' }, { cwd: tmpDir });
  check('MISSING_CONFIG_FILE_VALID', c.isValid, c.errors.join('; '));
  try { fs.rmdirSync(tmpDir); } catch(e) {}
})();

// ── config.json malformed JSON → invalid (must NOT silently fall back) ──
(function() {
  var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paper-cfg-'));
  // Write a config.json with intentionally broken JSON
  fs.writeFileSync(path.join(tmpDir, 'config.json'), '{ "port": 8787, broken json missing closing brace');
  var c = cfg({ TRANSLATION_PROVIDER: 'none' }, { cwd: tmpDir });
  check('MALFORMED_JSON_REJECTED', !c.isValid);
  check('MALFORMED_JSON_MESSAGE', c.errors.join('; ').toLowerCase().indexOf('json syntax error') >= 0,
    'errors=' + c.errors.join('; '));
  // Clean up
  try { fs.unlinkSync(path.join(tmpDir, 'config.json')); fs.rmdirSync(tmpDir); } catch(e) {}
})();

// ── config.json readable but empty {} — valid (no required fields) ──
(function() {
  var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paper-cfg-'));
  fs.writeFileSync(path.join(tmpDir, 'config.json'), '{}');
  var c = cfg({ TRANSLATION_PROVIDER: 'none' }, { cwd: tmpDir });
  check('EMPTY_JSON_OBJECT_VALID', c.isValid, c.errors.join('; '));
  try { fs.unlinkSync(path.join(tmpDir, 'config.json')); fs.rmdirSync(tmpDir); } catch(e) {}
})();

console.log('\n=== Summary: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(exitCode);
