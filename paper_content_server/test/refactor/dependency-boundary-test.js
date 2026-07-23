'use strict';

/**
 * Dependency boundary test for src/http/ modules.
 *
 * Two tiers of enforcement:
 *
 * Tier 1 — Core HTTP modules (src/http/*.js, non-recursive)
 *   Only depend on Node.js standard library and other src/http/ modules.
 *   Must NOT require business modules, server.js, read process.env, or data/.
 *
 * Tier 2 — HTTP handlers (src/http/handlers/*.js)
 *   MAY require business modules (they are the bridge layer), but must NOT:
 *     - require('../../server') or require('../server')
 *     - require Express / Fastify / Koa / Hapi / Restify
 *     - access data/ directory directly
 */

const fs = require('fs');
const path = require('path');

const HTTP_SRC = path.join(__dirname, '..', '..', 'src', 'http');
const CORE_GLOB = path.join(HTTP_SRC, '*.js');
const HANDLERS_DIR = path.join(HTTP_SRC, 'handlers');

const ALLOWED_PREFIXES = [
  // Node.js built-in modules
  'assert', 'buffer', 'child_process', 'crypto', 'events', 'fs', 'http',
  'https', 'net', 'os', 'path', 'querystring', 'stream', 'string_decoder',
  'timers', 'tls', 'url', 'util', 'zlib',
  // src/http/ internal modules
  '../http/',
  './',
  'url',
];

let pass = 0;
let fail = 0;
let exitCode = 0;

function check(ok, msg) {
  if (ok) {
    console.log('PASS ' + msg);
    pass++;
  } else {
    console.log('FAIL ' + msg);
    fail++;
    exitCode = 1;
  }
}

function findJsFiles(dir, recurse) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isFile() && e.name.endsWith('.js')) {
      results.push(full);
    } else if (e.isDirectory() && recurse) {
      results = results.concat(findJsFiles(full, true));
    }
  }
  return results;
}

function getRelativeName(absolutePath) {
  return path.relative(HTTP_SRC, absolutePath);
}

// ── Collect files ─────────────────────────────────────────────────────────

const coreFiles = fs.readdirSync(HTTP_SRC)
  .filter(f => f.endsWith('.js'))
  .map(f => path.join(HTTP_SRC, f));

const handlerFiles = fs.existsSync(HANDLERS_DIR)
  ? findJsFiles(HANDLERS_DIR, true)
  : [];

// ── Shared checks (both tiers) ────────────────────────────────────────────

for (const file of coreFiles.concat(handlerFiles)) {
  const content = fs.readFileSync(file, 'utf8');
  const rel = getRelativeName(file);

  // Must not require server.js
  const hasServerRequire = /require\(['"](\.\.\/)*server['"]\)/.test(content);
  check(!hasServerRequire, `${rel}: must not require server.js`);

  // Must not require Express / Fastify / etc.
  const hasFramework = /require\(['"](express|fastify|koa|hapi|restify)['"]\)/.test(content);
  check(!hasFramework, `${rel}: must not require third-party web framework`);

  // Must not access data/ directory directly
  const hasDataDirRead = /['"]data\//.test(content) || /path\.join\(.*DATA_DIR/.test(content);
  check(!hasDataDirRead, `${rel}: must not reference data/ directory directly`);

  // Check process.env usage
  const envMatches = content.match(/process\.env\.\w+/g);
  if (envMatches) {
    for (const envRef of envMatches) {
      const isGeneric = envRef === 'process.env.NODE_ENV' || envRef === 'process.env.PORT';
      if (!isGeneric) {
        check(false, `${rel}: should not read ${envRef}`);
      }
    }
  }
}

// ── Tier 1: Strict checks for core HTTP modules ───────────────────────────

for (const file of coreFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const rel = getRelativeName(file);

  const requireRegex = /require\(['"]([^'"]+)['"]\)/g;
  let match;

  while ((match = requireRegex.exec(content)) !== null) {
    const req = match[1];
    const isAllowed = ALLOWED_PREFIXES.some(p => req.startsWith(p));
    const isFramework = /express|fastify|koa|hapi|restify/.test(req);
    const isBusiness = /\.\.\/(app|news|render|publication|snapshot|safety|infra|config|admin|assets|devices|epaper|custom-library|files|images|learning|mqtt|server)/.test(req);

    check(isAllowed && !isFramework && !isBusiness,
      `${rel}: require('${req}') must be stdlib or src/http/ internal`);
  }
}

// ── Tier 2: Relaxed checks for handlers ───────────────────────────────────

for (const file of handlerFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const rel = getRelativeName(file);

  const requireRegex = /require\(['"]([^'"]+)['"]\)/g;
  let match;

  while ((match = requireRegex.exec(content)) !== null) {
    const req = match[1];
    const isFramework = /express|fastify|koa|hapi|restify/.test(req);

    check(!isFramework,
      `${rel}: handler must not require third-party web framework '${req}'`);
  }
}

console.log(`\n=== dependency-boundary: ${pass} passed, ${fail} failed ===`);
process.exit(exitCode);
