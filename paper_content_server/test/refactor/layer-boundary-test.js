'use strict';

/**
 * Layer boundary test — Phase A3.5.
 *
 * Enforces the strict dependency direction:
 *
 *     HTTP Handlers (src/http/handlers/)
 *        ↓
 *     Services (src/services/)
 *        ↓
 *     Repositories (src/repositories/)
 *        ↓
 *     Runtime / Data
 *
 * Rules:
 *   1. src/services/*.js  must NOT import src/http/* or server.js
 *   2. src/repositories/*.js must NOT import src/services/*, src/http/*, or server.js
 *   3. src/http/handlers/*.js must NOT import server.js
 *   4. src/http/*.js (core) must NOT import any business module
 *   5. No module in src/ may import third-party web frameworks
 *
 * This test is designed to catch NEW violations as new files are added.
 */

const fs = require('fs');
const path = require('path');

const SRC_ROOT = path.join(__dirname, '..', '..', 'src');

const THIRD_PARTY_FRAMEWORKS = ['express', 'fastify', 'koa', 'hapi', 'restify'];

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

function findJsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const result = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isFile() && e.name.endsWith('.js')) {
      result.push(full);
    } else if (e.isDirectory() && e.name !== 'node_modules') {
      result.push(...findJsFiles(full));
    }
  }
  return result;
}

function extractRequires(content) {
  const regex = /require\(['"]([^'"]+)['"]\)/g;
  const requires = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    requires.push(match[1]);
  }
  return requires;
}

function resolveRequire(fileAbsPath, requirePath) {
  if (requirePath.startsWith('.')) {
    return path.resolve(path.dirname(fileAbsPath), requirePath);
  }
  return null;
}

function isUnderSrc(resolvedPath, subDir) {
  const targetDir = path.join(SRC_ROOT, subDir);
  const sep = path.sep;
  return resolvedPath.startsWith(targetDir + sep) || resolvedPath === targetDir + '.js';
}

// ── Collect files ─────────────────────────────────────────────────────────

const httpCoreFiles = findJsFiles(path.join(SRC_ROOT, 'http')).filter(function (f) {
  return !f.replace(/\\/g, '/').includes('/handlers/');
});

const handlerFiles = findJsFiles(path.join(SRC_ROOT, 'http', 'handlers'));
const serviceFiles = findJsFiles(path.join(SRC_ROOT, 'services'));
const repoFiles = findJsFiles(path.join(SRC_ROOT, 'repositories'));

// ═════════════════════════════════════════════════════════════════════════
// Rule 1: Repository layer
// ═════════════════════════════════════════════════════════════════════════
console.log('\n── Rule 1: Repositories must not depend on services or HTTP ──\n');

if (repoFiles.length === 0) {
  console.log('  (no repository files to check)');
} else {
  for (const file of repoFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const rel = path.relative(SRC_ROOT, file);
    const requires = extractRequires(content);

    check(!/require\(['"](\.\.\/)*server['"]\)/.test(content),
      rel + ': no require(server.js)');

    let hasHttpDep = false;
    let hasSvcDep = false;
    for (const req of requires) {
      const resolved = resolveRequire(file, req);
      if (resolved) {
        if (isUnderSrc(resolved, 'services')) hasSvcDep = true;
        if (isUnderSrc(resolved, 'http')) hasHttpDep = true;
      }
    }
    check(!hasSvcDep, rel + ': no dependency on src/services/');
    check(!hasHttpDep, rel + ': no dependency on src/http/');

    check(!/\bres\.(writeHead|end|setHeader)\b/.test(content),
      rel + ': no res.* method calls');

    let hasFramework = false;
    for (const fw of THIRD_PARTY_FRAMEWORKS) {
      if (new RegExp("require\\('" + fw + "'\\)").test(content)) hasFramework = true;
    }
    check(!hasFramework, rel + ': no third-party web framework');
  }
}

// ═════════════════════════════════════════════════════════════════════════
// Rule 2: Service layer
// ═════════════════════════════════════════════════════════════════════════
console.log('\n── Rule 2: Services must not depend on HTTP ──\n');

if (serviceFiles.length === 0) {
  console.log('  (no service files to check)');
} else {
  for (const file of serviceFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const rel = path.relative(SRC_ROOT, file);
    const requires = extractRequires(content);

    check(!/require\(['"](\.\.\/)*server['"]\)/.test(content),
      rel + ': no require(server.js)');

    let hasHttpDep = false;
    for (const req of requires) {
      const resolved = resolveRequire(file, req);
      if (resolved && isUnderSrc(resolved, 'http')) hasHttpDep = true;
    }
    check(!hasHttpDep, rel + ': no dependency on src/http/');

    check(!/\bres\.(writeHead|end|setHeader)\b/.test(content),
      rel + ': no res.* method calls');

    // Check for direct HTTP status code usage
    const statusMatch = content.match(/writeHead|statusCode|status\s*[:=]\s*\d{3}/);
    check(!statusMatch, rel + ': no HTTP status code references');

    let hasFramework = false;
    for (const fw of THIRD_PARTY_FRAMEWORKS) {
      if (new RegExp("require\\('" + fw + "'\\)").test(content)) hasFramework = true;
    }
    check(!hasFramework, rel + ': no third-party web framework');
  }
}

// ═════════════════════════════════════════════════════════════════════════
// Rule 3: Handler layer
// ═════════════════════════════════════════════════════════════════════════
console.log('\n── Rule 3: Handlers must not require server.js ──\n');

if (handlerFiles.length === 0) {
  console.log('  (no handler files to check)');
} else {
  for (const file of handlerFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const rel = path.relative(SRC_ROOT, file);

    check(!/require\(['"](\.\.\/)*server['"]\)/.test(content),
      rel + ': no require(server.js)');

    let hasFramework = false;
    for (const fw of THIRD_PARTY_FRAMEWORKS) {
      if (new RegExp("require\\('" + fw + "'\\)").test(content)) hasFramework = true;
    }
    check(!hasFramework, rel + ': no third-party web framework');
  }
}

// ═════════════════════════════════════════════════════════════════════════
// Rule 4: HTTP core layer
// ═════════════════════════════════════════════════════════════════════════
console.log('\n── Rule 4: HTTP core must not import business modules ──\n');

const BUSINESS_PREFIXES = [
  'app', 'news', 'render', 'publication', 'snapshot', 'safety', 'infra',
  'config', 'admin', 'assets', 'devices', 'epaper', 'custom-library',
  'files', 'images', 'learning', 'mqtt', 'services', 'repositories', 'domain',
];

if (httpCoreFiles.length === 0) {
  console.log('  (no HTTP core files to check)');
} else {
  for (const file of httpCoreFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const rel = path.relative(SRC_ROOT, file);
    const requires = extractRequires(content);

    let hasBusiness = false;
    for (const req of requires) {
      if (!req.startsWith('.')) continue;
      const resolved = resolveRequire(file, req);
      if (!resolved) continue;
      const relResolved = path.relative(SRC_ROOT, resolved);
      const isBusiness = BUSINESS_PREFIXES.some(function (p) {
        return relResolved.startsWith(p);
      });
      if (isBusiness) {
        hasBusiness = true;
        break;
      }
    }
    check(!hasBusiness, rel + ': no business module imports');

    let hasFramework = false;
    for (const fw of THIRD_PARTY_FRAMEWORKS) {
      if (new RegExp("require\\('" + fw + "'\\)").test(content)) hasFramework = true;
    }
    check(!hasFramework, rel + ': no third-party web framework');
  }
}

// ═════════════════════════════════════════════════════════════════════════
// Rule 5: Upward dependency prevention (layering)
// ═════════════════════════════════════════════════════════════════════════
console.log('\n── Rule 5: Layer hierarchy compliance ──\n');

// Layer hierarchy (lower number = lower layer, closer to data)
//   Layer 0: repositories — allowed to depend on: nothing in src/ (fs is stdlib)
//   Layer 1: services     — allowed to depend on: repositories, domain
//   Layer 2: http/handlers — allowed to depend on: services (through ctx)
const LAYERS = [
  { name: 'repositories', dir: 'repositories' },
  { name: 'services', dir: 'services' },
  // http core is in a separate test (Rule 4)
];

// A module at layer index I may only import from layers < I.
// We scan each layer's files and check that all their relative requires
// resolve only to lower-numbered layers or to non-layer src/ dirs.
for (var layerIdx = 0; layerIdx < LAYERS.length; layerIdx++) {
  var layer = LAYERS[layerIdx];
  var layerAbs = path.join(SRC_ROOT, layer.dir);
  if (!fs.existsSync(layerAbs)) continue;

  var files = findJsFiles(layerAbs);
  for (var fi = 0; fi < files.length; fi++) {
    var file = files[fi];
    var content = fs.readFileSync(file, 'utf8');
    var rel = path.relative(SRC_ROOT, file);
    var requires = extractRequires(content);

    for (var ri = 0; ri < requires.length; ri++) {
      var req = requires[ri];
      var resolved = resolveRequire(file, req);
      if (!resolved) continue;
      var resolvedRel = path.relative(SRC_ROOT, resolved);
      var resolvedParts = resolvedRel.split(path.sep);
      var resolvedLayer = resolvedParts[0]; // e.g., 'services', 'repositories'

      // Check if it's one of our tracked layers
      var targetLayerIdx = -1;
      for (var li = 0; li < LAYERS.length; li++) {
        if (LAYERS[li].name === resolvedLayer) {
          targetLayerIdx = li;
          break;
        }
      }

      if (targetLayerIdx !== -1 && targetLayerIdx > layerIdx) {
        // Target is an upper layer — violation
        check(false, rel + ' (layer ' + layer.name + ') imports upper layer \'' + resolvedLayer + '\' via require(\'' + req + '\')');
      }
    }
  }
}

// Note: handlers will import services via ctx (dependency injection),
// not via require(). The check for handlers is limited to Rule 3.

console.log('\n=== layer-boundary: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(exitCode);
