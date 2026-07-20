// Unit tests for composeServices.resolveTranslationConfig
// Verifies that the per-provider translation fields produced by load-config
// (openaiApiKey/openaiModel/openaiBaseUrl, deeplApiKey/deeplApiUrl,
// geminiApiKey/geminiModel/geminiApiBase) are mapped to the flat
// { provider, apiKey, model, baseUrl } shape the news pipeline expects — and
// that the legacy top-level apiKey/model/baseUrl fields are NOT consulted.
var resolve = require('../../src/app/compose-services').resolveTranslationConfig;

var passed = 0, failed = 0, exitCode = 0;
function check(label, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + label + (detail ? ': ' + detail : ''));
  if (cond) { passed++; } else { failed++; exitCode = 1; }
}
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

console.log('=== Compose-Services Translation Config Unit Test ===');

// none — no credentials needed
check('none provider', eq(resolve({ provider: 'none' }), { provider: 'none', apiKey: '', model: '', baseUrl: '' }));
check('missing config -> none', eq(resolve(undefined), { provider: 'none', apiKey: '', model: '', baseUrl: '' }));
check('null config -> none', eq(resolve(null), { provider: 'none', apiKey: '', model: '', baseUrl: '' }));

// openai
var openai = {
  provider: 'openai',
  openaiApiKey: 'sk-test-openai',
  openaiModel: 'gpt-4o-mini',
  openaiBaseUrl: 'https://api.openai.com/v1',
  // unrelated provider fields present but must be ignored
  deeplApiKey: 'should-be-ignored',
  geminiApiKey: 'should-be-ignored'
};
check('openai maps apiKey/model/baseUrl', eq(resolve(openai), { provider: 'openai', apiKey: 'sk-test-openai', model: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1' }));

// deepl — no model field
var deepl = {
  provider: 'deepl',
  deeplApiKey: 'deep-key',
  deeplApiUrl: 'https://api-free.deepl.com/v2/translate'
};
check('deepl maps apiKey/apiUrl, model empty', eq(resolve(deepl), { provider: 'deepl', apiKey: 'deep-key', model: '', baseUrl: 'https://api-free.deepl.com/v2/translate' }));

// gemini
var gemini = {
  provider: 'gemini',
  geminiApiKey: 'gem-key',
  geminiModel: 'gemini-2.5-flash',
  geminiApiBase: 'https://generativelanguage.googleapis.com'
};
check('gemini maps apiKey/model/apiBase', eq(resolve(gemini), { provider: 'gemini', apiKey: 'gem-key', model: 'gemini-2.5-flash', baseUrl: 'https://generativelanguage.googleapis.com' }));

// Regression: the OLD code read config.translation.apiKey/model/baseUrl (which
// don't exist on load-config output). Those legacy fields must NOT be honored.
var legacy = {
  provider: 'openai',
  apiKey: 'LEGACY_SHOULD_BE_IGNORED',
  model: 'LEGACY_MODEL_IGNORED',
  baseUrl: 'LEGACY_URL_IGNORED',
  openaiApiKey: 'sk-real',
  openaiModel: 'gpt-4o-mini',
  openaiBaseUrl: 'https://api.openai.com/v1'
};
var legacyResolved = resolve(legacy);
check('legacy top-level apiKey ignored', legacyResolved.apiKey === 'sk-real');
check('legacy top-level model ignored', legacyResolved.model === 'gpt-4o-mini');
check('legacy top-level baseUrl ignored', legacyResolved.baseUrl === 'https://api.openai.com/v1');

// baseUrl trailing slash preserved as-is (load-config already strips trailing
// slashes; resolveTranslationConfig must not re-introduce or strip them).
check('openai baseUrl passed through verbatim', resolve({ provider: 'openai', openaiApiKey: 'k', openaiBaseUrl: 'https://api.openai.com/v1' }).baseUrl === 'https://api.openai.com/v1');

// Empty provider string falls back to none.
check('empty provider -> none', resolve({ provider: '' }).provider === 'none');

console.log('=== Summary:', passed, 'passed,', failed, 'failed ===');
process.exit(exitCode);
