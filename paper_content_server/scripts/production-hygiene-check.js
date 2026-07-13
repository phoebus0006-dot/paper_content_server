#!/usr/bin/env node
// production-hygiene-check.js — Lane F static production hygiene guards
//
// Detects regressions in production truth + safety wiring. Each check is
// independent; the script exits non-zero if any check fails.
//
// Checks:
//   1. NO_EMPTY_CATCH_IN_DELETE_COMPOSITION  — compose-services.js has no
//      empty catch blocks (mkdir best-effort catches are whitelisted).
//   2. NO_PLACEHOLDER_COMPLETION_CLAIMS      — docs contain no premature
//      "ALL FEATURES COMPLETE" / "PRODUCTION READY" claims.
//   3. NO_INTERNAL_PATH_IN_HTTP_RESPONSES    — server.js response strings
//      do not embed absolute filesystem paths.
//   4. NO_CLIENT_FILEPATH_UPLOAD             — upload route does not accept
//      a client-provided filepath field.
//   5. NO_DIRECT_STATIC_BUSINESS_ENV_READ    — server.js does not read
//      business config directly from process.env (NODE_ENV + .env bootstrap
//      write are whitelisted).
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..');

var pass = 0, fail = 0, ec = 0;
function t(name, ok, detail) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ': ' + detail : ''));
  if (ok) pass++; else { fail++; ec = 1; }
}
function readRepo(rel) {
  try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch (e) { return null; }
}
function stripFullLineComments(text) {
  return text.split('\n').filter(function (l) {
    var tr = l.trim();
    return tr.indexOf('//') !== 0 && tr.indexOf('*') !== 0;
  }).join('\n');
}

console.log('=== production-hygiene-check ===');

// --- 1. NO_EMPTY_CATCH_IN_DELETE_COMPOSITION ---
// compose-services.js wires the asset delete pipeline + library/learning/render
// services. Empty catch blocks silently swallow errors. Mkdir best-effort
// catches (`try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}`)
// are whitelisted because { recursive: true } does not throw on existing dirs
// and downstream operations surface genuine permission errors.
var composeSrc = readRepo(path.join('src', 'app', 'compose-services.js')) || '';
if (composeSrc) {
  // Match `catch (...) { ... }` blocks with a simple brace-balanced body.
  // Empty body = only whitespace inside the braces.
  var emptyCatchRe = /catch\s*\(([^)]*)\)\s*\{(\s*)\}/g;
  var mm;
  var bad = [];
  while ((mm = emptyCatchRe.exec(composeSrc)) !== null) {
    // Inspect the preceding ~160 chars for the mkdir best-effort pattern.
    var start = Math.max(0, mm.index - 160);
    var preceding = composeSrc.slice(start, mm.index + mm[0].length);
    if (/fs\.mkdirSync\([^)]+\)\s*;\s*}\s*catch\s*\(\s*\w+\s*\)\s*\{\s*\}/.test(preceding)) {
      continue;
    }
    bad.push('line ~' + composeSrc.slice(0, mm.index).split('\n').length);
  }
  t('NO_EMPTY_CATCH_IN_DELETE_COMPOSITION',
    bad.length === 0,
    bad.length === 0
      ? 'no non-mkdir empty catch blocks in compose-services.js'
      : bad.length + ' empty catches at ' + bad.join(', '));
} else {
  t('NO_EMPTY_CATCH_IN_DELETE_COMPOSITION', false, 'compose-services.js not found');
}

// --- 2. NO_PLACEHOLDER_COMPLETION_CLAIMS ---
// Docs must not declare premature completion. Honest status only.
var forbiddenPhrases = [
  /ALL\s+FEATURES\s+COMPLETE/i,
  /\bPRODUCTION\s+READY\b/i,
  /\bFULLY\s+IMPLEMENTED\b/i,
  /\bALL\s+COMPLETE\b/i,
];
var docsDir = path.join(ROOT, 'docs');
var docsFiles = [];
try { docsFiles = fs.readdirSync(docsDir).filter(function (f) { return /\.md$/i.test(f); }); } catch (e) {}
var claimViolations = [];
docsFiles.forEach(function (f) {
  var text = readRepo(path.join('docs', f)) || '';
  // Allow the policy line that mentions the forbidden phrase as a prohibition
  // (e.g. `禁止写 "全部完成"`).
  var stripped = text.replace(/禁止写[^\n]*全部完成[^\n]*/g, '');
  forbiddenPhrases.forEach(function (pat) {
    var m = stripped.match(pat);
    if (m) claimViolations.push(f + ': "' + m[0] + '"');
  });
});
t('NO_PLACEHOLDER_COMPLETION_CLAIMS',
  claimViolations.length === 0,
  claimViolations.length === 0 ? 'no premature completion claims in docs' : claimViolations.join('; '));

// --- 3. NO_INTERNAL_PATH_IN_HTTP_RESPONSES ---
// server.js response strings must not embed absolute filesystem paths
// (e.g. /var/lib/..., /home/..., C:\...) — these leak deployment topology.
// We scan code (comments stripped) for absolute-path string literals and
// flag any that appear inside a failJson/respondJson/res.end call.
var serverSrc = readRepo('server.js') || '';
if (serverSrc) {
  var serverCode = stripFullLineComments(serverSrc);
  // Match POSIX absolute path literals in string quotes OR Windows drive paths.
  // Excludes URL routes (/api/, /health, /admin, /debug) and lone slashes.
  var pathLitRe = /["']((?:\/(?:var|home|etc|usr|opt|srv|root|tmp)\/[a-zA-Z0-9_\-\.\/]+)|(?:[A-Z]:\\[a-zA-Z0-9_\-\.\\]+))["']/g;
  var pm;
  var leaked = [];
  while ((pm = pathLitRe.exec(serverCode)) !== null) {
    var idx = pm.index;
    var ctx = serverCode.slice(Math.max(0, idx - 200), idx + pm[0].length + 50);
    if (/(?:failJson|respondJson|res\.end|res\.write)\s*\(/.test(ctx)) {
      leaked.push(pm[1]);
    }
  }
  t('NO_INTERNAL_PATH_IN_HTTP_RESPONSES',
    leaked.length === 0,
    leaked.length === 0 ? 'no absolute paths in HTTP response strings' : 'leaked: ' + leaked.join(', '));
} else {
  t('NO_INTERNAL_PATH_IN_HTTP_RESPONSES', false, 'server.js not found');
}

// --- 4. NO_CLIENT_FILEPATH_UPLOAD ---
// Upload route must not accept a client-provided filepath. Streaming upload
// uses application/octet-stream + headers (x-original-name, x-mime-type,
// content-length). No JSON body field that contains a file path should be
// read and passed to the filesystem.
if (serverSrc) {
  var uploadMarker = "'/api/admin/library/custom/upload'";
  var uploadStart = serverSrc.indexOf(uploadMarker);
  var uploadBlock = '';
  if (uploadStart >= 0) {
    // Capture the route handler block (up to the next top-level `return;`
    // that closes the if-branch).
    var returnIdx = serverSrc.indexOf('return;\n    }', uploadStart);
    uploadBlock = serverSrc.slice(uploadStart, returnIdx < 0 ? serverSrc.length : returnIdx);
  }
  // Flag client-body/header fields whose name looks like a filepath.
  var fpFieldRe = /\.(?:filepath|filePath|clientPath|localPath|absPath|fileName|fileName)\b/gi;
  // Note: `originalName` (used by x-original-name header) is a client-supplied
  // display name, NOT a filesystem path — we do not flag it.
  var fpMatches = uploadBlock.match(fpFieldRe) || [];
  t('NO_CLIENT_FILEPATH_UPLOAD',
    fpMatches.length === 0,
    fpMatches.length === 0
      ? 'upload route does not accept client filepath'
      : 'found: ' + fpMatches.join(', '));
} else {
  t('NO_CLIENT_FILEPATH_UPLOAD', false, 'server.js not found');
}

// --- 5. NO_DIRECT_STATIC_BUSINESS_ENV_READ ---
// server.js must not read business configuration from process.env directly
// (mirrors test/config/server-no-direct-env-test.js). Whitelisted:
//   - process.env.NODE_ENV  (Node.js runtime standard variable)
//   - process.env[key]      (bracket access used by .env bootstrap write)
if (serverSrc) {
  var code = stripFullLineComments(serverSrc);
  var envMatches = code.match(/process\.env\.(?!NODE_ENV\b)[A-Z_]+/g) || [];
  t('NO_DIRECT_STATIC_BUSINESS_ENV_READ',
    envMatches.length === 0,
    envMatches.length === 0
      ? 'no direct business process.env reads in server.js'
      : 'found ' + JSON.stringify(envMatches));
} else {
  t('NO_DIRECT_STATIC_BUSINESS_ENV_READ', false, 'server.js not found');
}

console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(ec);
