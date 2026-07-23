'use strict';

/**
 * Dependency boundary test for src/http/ modules.
 *
 * Confirms that HTTP-layer modules only depend on:
 *   - Node.js standard library
 *   - Other src/http/ modules (internal to the layer)
 *
 * They must NOT:
 *   - require('../../server') or require('../server')
 *   - read process.env for business config
 *   - read/write data/ directories
 *   - require Express, Fastify, or other third-party web frameworks
 *   - require business services from src/app/, src/news/, etc.
 */

const fs = require('fs');
const path = require('path');

const HTTP_SRC = path.join(__dirname, '..', '..', 'src', 'http');
const ALLOWED_PREFIXES = [
  // Node.js built-in modules
  'assert', 'buffer', 'child_process', 'crypto', 'events', 'fs', 'http',
  'https', 'net', 'os', 'path', 'querystring', 'stream', 'string_decoder',
  'timers', 'tls', 'url', 'util', 'zlib',
  // src/http/ internal modules
  '../http/',
  './',
  // Special: they may use require('url') etc. which are built-ins
  'url',
  // Also allow the package.json requires that are already in production
  // but the HTTP layer should not use them directly.
  // Actually the HTTP layer should NOT require third-party packages.
];

// Extensions we care about
const JS_FILES = fs.readdirSync(HTTP_SRC).filter(f => f.endsWith('.js'));

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

// 1. Check each file's require() calls
for (const file of JS_FILES) {
  const filePath = path.join(HTTP_SRC, file);
  const content = fs.readFileSync(filePath, 'utf8');

  // Find all require(...) calls
  const requireRegex = /require\(['"]([^'"]+)['"]\)/g;
  let match;
  let requires = [];

  while ((match = requireRegex.exec(content)) !== null) {
    requires.push(match[1]);
  }

  for (const req of requires) {
    const isAllowed = ALLOWED_PREFIXES.some(p => req.startsWith(p));
    // Also check it's not an Express/Fastify/etc require
    const isFramework = /express|fastify|koa|hapi|restify/.test(req);
    const isBusiness = /\.\.\/(app|news|render|publication|snapshot|safety|infra|config|admin|assets|devices|epaper|custom-library|files|images|learning|mqtt|server)/.test(req);

    check(isAllowed && !isFramework && !isBusiness,
      `${file}: require('${req}') is allowed within HTTP layer`);
  }

  // Check for process.env usage (business reads)
  const envMatches = content.match(/process\.env\.\w+/g);
  if (envMatches) {
    for (const envRef of envMatches) {
      // Allow NODE_ENV or PORT which are generic infra env vars
      const isGeneric = envRef === 'process.env.NODE_ENV' || envRef === 'process.env.PORT';
      if (!isGeneric) {
        check(false, `${file}: should not read ${envRef}`);
      }
    }
  }
}

// 2. Check that no file directly reads/writes data/ directory
for (const file of JS_FILES) {
  const filePath = path.join(HTTP_SRC, file);
  const content = fs.readFileSync(filePath, 'utf8');

  const hasDataDirRead = /['"]data\//.test(content) || /path\.join\(.*DATA_DIR/.test(content);
  check(!hasDataDirRead, `${file}: must not reference data/ directory directly`);
}

// 3. Check that src/http/ doesn't import server.js
for (const file of JS_FILES) {
  const filePath = path.join(HTTP_SRC, file);
  const content = fs.readFileSync(filePath, 'utf8');

  const hasServerRequire = /require\(['"](\.\.\/)*server['"]\)/.test(content);
  check(!hasServerRequire, `${file}: must not require('../../server')`);
}

console.log(`\n=== dependency-boundary: ${pass} passed, ${fail} failed ===`);
process.exit(exitCode);
