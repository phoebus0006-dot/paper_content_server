// Unit tests for src/admin/admin-csrf-policy.js
// Verifies that malformed Origin/Referer headers are rejected explicitly
// (INVALID_ORIGIN / INVALID_REFERER) rather than treated as missing, and that
// scheme/host/port mismatches and cross-site Sec-Fetch-Site are rejected.
var policy = require('../../src/admin/admin-csrf-policy');
var checkCSRF = policy.checkCSRF;

var passed = 0, failed = 0, exitCode = 0;
function check(label, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + label + (detail ? ': ' + detail : ''));
  if (cond) { passed++; } else { failed++; exitCode = 1; }
}

// Build a fake request. Host defaults to 127.0.0.1:8894 over plain HTTP so the
// request's own origin is http://127.0.0.1:8894.
function makeReq(method, headers, opts) {
  opts = opts || {};
  var h = { host: '127.0.0.1:8894' };
  if (headers) Object.keys(headers).forEach(function (k) { h[k.toLowerCase()] = headers[k]; });
  return {
    method: method || 'POST',
    headers: h,
    socket: { encrypted: !!opts.encrypted }
  };
}

console.log('=== Admin CSRF Policy Unit Test ===');

// ── Method gate ──
check('GET allowed (method gate)', checkCSRF(makeReq('GET', { origin: 'http://evil.com' })).allowed === true);
check('OPTIONS allowed (method gate)', checkCSRF(makeReq('OPTIONS', {})).allowed === true);

// ── Content-Type ──
check('POST missing content-type -> INVALID_CONTENT_TYPE', checkCSRF(makeReq('POST', {})).error === 'INVALID_CONTENT_TYPE');
check('POST text/plain -> INVALID_CONTENT_TYPE', checkCSRF(makeReq('POST', { 'content-type': 'text/plain' })).error === 'INVALID_CONTENT_TYPE');
check('POST application/json; charset=utf-8 accepted', checkCSRF(makeReq('POST', { 'content-type': 'application/json; charset=utf-8', origin: 'http://127.0.0.1:8894' })).allowed === true);
check('POST multipart/form-data accepted', checkCSRF(makeReq('POST', { 'content-type': 'multipart/form-data; boundary=x', origin: 'http://127.0.0.1:8894' })).allowed === true);

// ── Host ──
check('POST missing Host -> MISSING_HOST', checkCSRF({ method: 'POST', headers: { 'content-type': 'application/json' }, socket: {} }).error === 'MISSING_HOST');

// ── Sec-Fetch-Site ──
check('cross-site Sec-Fetch-Site rejected even with valid origin', checkCSRF(makeReq('POST', { 'content-type': 'application/json', origin: 'http://127.0.0.1:8894', 'sec-fetch-site': 'cross-site' })).error === 'CROSS_SITE_SEC_FETCH');
check('same-origin Sec-Fetch-Site allowed', checkCSRF(makeReq('POST', { 'content-type': 'application/json', origin: 'http://127.0.0.1:8894', 'sec-fetch-site': 'same-origin' })).allowed === true);

// ── Origin: same-origin allowed ──
check('same-origin Origin allowed', checkCSRF(makeReq('POST', { 'content-type': 'application/json', origin: 'http://127.0.0.1:8894' })).allowed === true);
check('same-origin Origin (default port 80 vs omitted) allowed', checkCSRF(makeReq('POST', { host: '127.0.0.1', 'content-type': 'application/json', origin: 'http://127.0.0.1' })).allowed === true);

// ── Origin: mismatches ──
check('cross-host Origin -> ORIGIN_MISMATCH', checkCSRF(makeReq('POST', { 'content-type': 'application/json', origin: 'http://evil.com' })).error === 'ORIGIN_MISMATCH');
check('different scheme (https vs http) -> ORIGIN_MISMATCH', checkCSRF(makeReq('POST', { 'content-type': 'application/json', origin: 'https://127.0.0.1:8894' })).error === 'ORIGIN_MISMATCH');
check('different port -> ORIGIN_MISMATCH', checkCSRF(makeReq('POST', { 'content-type': 'application/json', origin: 'http://127.0.0.1:9999' })).error === 'ORIGIN_MISMATCH');

// ── Origin: malformed must NOT be treated as missing ──
check('malformed Origin -> INVALID_ORIGIN', checkCSRF(makeReq('POST', { 'content-type': 'application/json', origin: 'http://[' })).error === 'INVALID_ORIGIN');
check('garbage Origin -> INVALID_ORIGIN', checkCSRF(makeReq('POST', { 'content-type': 'application/json', origin: 'not-a-url' })).error === 'INVALID_ORIGIN');
check('non-http scheme Origin -> INVALID_ORIGIN', checkCSRF(makeReq('POST', { 'content-type': 'application/json', origin: 'ftp://127.0.0.1:8894' })).error === 'INVALID_ORIGIN');
check('Origin with path -> INVALID_ORIGIN', checkCSRF(makeReq('POST', { 'content-type': 'application/json', origin: 'http://127.0.0.1:8894/admin' })).error === 'INVALID_ORIGIN');
// Critical: a malformed Origin must NOT fall through to a valid Referer.
check('malformed Origin not rescued by valid Referer', checkCSRF(makeReq('POST', { 'content-type': 'application/json', origin: 'http://[', referer: 'http://127.0.0.1:8894/admin/' })).error === 'INVALID_ORIGIN');

// ── Origin absent → Referer path ──
check('absent Origin + same-origin Referer (with path) allowed', checkCSRF(makeReq('POST', { 'content-type': 'application/json', referer: 'http://127.0.0.1:8894/admin/' })).allowed === true);
check('absent Origin + cross-origin Referer -> REFERER_MISMATCH', checkCSRF(makeReq('POST', { 'content-type': 'application/json', referer: 'http://evil.com/page' })).error === 'REFERER_MISMATCH');
check('absent Origin + different-port Referer -> REFERER_MISMATCH', checkCSRF(makeReq('POST', { 'content-type': 'application/json', referer: 'http://127.0.0.1:9999/admin/' })).error === 'REFERER_MISMATCH');
check('absent Origin + malformed Referer -> INVALID_REFERER', checkCSRF(makeReq('POST', { 'content-type': 'application/json', referer: 'http://[' })).error === 'INVALID_REFERER');
check('absent Origin + non-http Referer -> INVALID_REFERER', checkCSRF(makeReq('POST', { 'content-type': 'application/json', referer: 'ftp://127.0.0.1/file' })).error === 'INVALID_REFERER');

// ── Both absent ──
// checkCSRF(req, allowHeaderlessWrite): the 2nd arg controls the headerless escape hatch.
check('both absent, allowHeaderlessWrite=true -> allowed', checkCSRF(makeReq('POST', { 'content-type': 'application/json' }), true).allowed === true);
check('both absent, allowHeaderlessWrite=false -> NO_ORIGIN_NO_REFERER', checkCSRF(makeReq('POST', { 'content-type': 'application/json' }), false).error === 'NO_ORIGIN_NO_REFERER');

// ── HTTPS request origin ──
check('https request vs http Origin -> ORIGIN_MISMATCH', checkCSRF(makeReq('POST', { 'content-type': 'application/json', origin: 'http://127.0.0.1:443' }, { encrypted: true })).error === 'ORIGIN_MISMATCH');
check('https request vs https same Origin allowed', checkCSRF(makeReq('POST', { host: '127.0.0.1', 'content-type': 'application/json', origin: 'https://127.0.0.1' }, { encrypted: true })).allowed === true);

console.log('=== Summary:', passed, 'passed,', failed, 'failed ===');
process.exit(exitCode);
