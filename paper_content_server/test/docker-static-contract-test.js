#!/usr/bin/env node
// Docker static contract test — validates Dockerfile structure, .dockerignore
// rules, and path conventions WITHOUT building the image.
// This is NOT a substitute for `docker build`; it's a static analysis pass
// that catches obvious structural errors before CI.
var path = require('path');
var fs = require('fs');
var ROOT = path.join(__dirname, '..');
var ec = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (!o) ec = 1; }

// ── 1. Dockerfile exists and is parseable ──
var dfPath = path.join(ROOT, 'Dockerfile');
t('DOCKERFILE_EXISTS', fs.existsSync(dfPath), '');
var df = fs.readFileSync(dfPath, 'utf8');
t('DOCKERFILE_NONEMPTY', df.length > 0, 'length=' + df.length);

// ── 2. Multi-stage structure ──
var stages = df.match(/^FROM /gm);
t('DOCKERFILE_MULTI_STAGE', stages && stages.length >= 2, 'stages=' + (stages ? stages.length : 0));

// ── 3. Production deps: npm ci --omit=dev (not npm ci --only=dev which clears) ──
t('PROD_OMIT_DEV', df.indexOf('npm ci --omit=dev') >= 0, '');
t('PROD_NO_ONLY_DEV', df.indexOf('npm ci --only=dev') < 0, '');

// ── 4. Production stage does NOT use --ignore-scripts (sharp needs install scripts) ──
// Find the production FROM line and check subsequent RUN lines
var prodStageStart = df.lastIndexOf('FROM node:20-alpine AS production');
var prodStage = df.slice(prodStageStart);
var prodRunLines = prodStage.match(/^RUN .*$/gm) || [];
var prodOmitsDev = prodRunLines.some(function(l) { return l.indexOf('npm ci --omit=dev') >= 0; });
t('PROD_DEP_INSTALL_USES_OMIT_DEV', prodOmitsDev, '');

// ── 5. Production stage uses COPY for specific dirs, not COPY . . ──
var prodLines = prodStage.split('\n');
var hasCopyDotDot = prodLines.some(function(l) { return l.trim() === 'COPY . .' || l.trim() === 'COPY . ./'; });
t('PROD_NO_COPY_ALL', !hasCopyDotDot, hasCopyDotDot ? 'COPY . . found in production' : '');

// ── 6. Required directories are COPY'd in production (may use --from=build) ──
var requiredDirs = ['src/', 'lib/', 'public/', 'resources/', 'scripts/'];
requiredDirs.forEach(function(dir) {
  t('PROD_COPY_' + dir.toUpperCase().replace('/', ''), prodLines.some(function(l) { return l.indexOf('COPY ') >= 0 && l.indexOf(dir) >= 0; }), '');
});

// ── 7. server.js, package.json, package-lock.json COPY'd ──
t('PROD_COPY_server_js', prodLines.some(function(l) { return l.indexOf('COPY ') >= 0 && l.indexOf('server.js') >= 0; }), '');
t('PROD_COPY_package_json', prodLines.some(function(l) { return l.indexOf('COPY ') >= 0 && l.indexOf('package.json') >= 0; }), '');
t('PROD_COPY_package_lock', prodLines.some(function(l) { return l.indexOf('COPY ') >= 0 && l.indexOf('package-lock.json') >= 0; }), '');

// ── 8. Build manifest generated before COPY in production ──
t('PROD_COPY_BUILD_MANIFEST', prodLines.some(function(l) { return l.indexOf('build-manifest.json') >= 0; }), '');

// ── 9. ARG BUILD_GIT_SHA/TREE/DIRTY before manifest generation in build stage ──
var buildStageStart = df.indexOf('FROM node:20-alpine AS build');
var buildStage = df.slice(buildStageStart, df.indexOf('FROM node:20-alpine AS test'));
t('BUILD_STAGE_HAS_ARG_GIT_SHA', buildStage.indexOf('ARG BUILD_GIT_SHA') >= 0, '');
t('BUILD_STAGE_HAS_ARG_GIT_TREE', buildStage.indexOf('ARG BUILD_GIT_TREE') >= 0, '');
t('BUILD_STAGE_HAS_ARG_DIRTY', buildStage.indexOf('ARG BUILD_DIRTY') >= 0, '');

// Verify ARGs appear before generate-build-manifest.js
var argLines = [];
buildStage.split('\n').forEach(function(l) {
  if (l.indexOf('ARG BUILD_GIT_SHA') >= 0) argLines.push('ARG BUILD_GIT_SHA');
  if (l.indexOf('ARG BUILD_GIT_TREE') >= 0) argLines.push('ARG BUILD_GIT_TREE');
  if (l.indexOf('ARG BUILD_DIRTY') >= 0) argLines.push('ARG BUILD_DIRTY');
  if (l.indexOf('generate-build-manifest') >= 0) argLines.push('generate-build-manifest');
});
var shaIdx = argLines.indexOf('ARG BUILD_GIT_SHA');
var treeIdx = argLines.indexOf('ARG BUILD_GIT_TREE');
var dirtyIdx = argLines.indexOf('ARG BUILD_DIRTY');
var manifestIdx = argLines.indexOf('generate-build-manifest');
t('ARG_SHA_BEFORE_MANIFEST', shaIdx >= 0 && manifestIdx >= 0 && shaIdx < manifestIdx, '');
t('ARG_TREE_BEFORE_MANIFEST', treeIdx >= 0 && manifestIdx >= 0 && treeIdx < manifestIdx, '');
t('ARG_DIRTY_BEFORE_MANIFEST', dirtyIdx >= 0 && manifestIdx >= 0 && dirtyIdx < manifestIdx, '');

// ── 9b. ARG BUILD_MODE in build stage before generate-build-manifest ──
t('BUILD_STAGE_HAS_ARG_BUILD_MODE', buildStage.indexOf('ARG BUILD_MODE') >= 0, '');
var bmIdx = buildStage.split('\n').reduce(function(acc, l, i) { if (l.indexOf('ARG BUILD_MODE') >= 0) return i; return acc; }, -1);
var manifestLineIdx = buildStage.split('\n').reduce(function(acc, l, i) { if (l.indexOf('generate-build-manifest') >= 0) return i; return acc; }, -1);
t('ARG_BUILD_MODE_BEFORE_MANIFEST', bmIdx >= 0 && manifestLineIdx >= 0 && bmIdx < manifestLineIdx, 'buildModeIdx=' + bmIdx + ' manifestIdx=' + manifestLineIdx);

// ── 10. build-manifest.json is generated in build stage ──
t('BUILD_STAGE_GENERATES_MANIFEST', buildStage.indexOf('generate-build-manifest.js') >= 0, '');

// ── 11. Production stage verifies modules ──
t('PROD_VERIFIES_SHARP', prodStage.indexOf("require('sharp')") >= 0, '');
t('PROD_VERIFIES_MQTT', prodStage.indexOf("require('mqtt')") >= 0, '');
t('PROD_VERIFIES_SERVER', prodStage.indexOf('require(\'./server.js\')') >= 0 || prodStage.indexOf('require("./server.js")') >= 0, '');

// ── 12. docker-entrypoint.sh COPY to /usr/local/bin/ ──
t('ENTRYPOINT_COPY', df.indexOf('COPY docker-entrypoint.sh /usr/local/bin/') >= 0, '');
var entrypointSrc = path.join(ROOT, 'docker-entrypoint.sh');
t('ENTRYPOINT_FILE_EXISTS', fs.existsSync(entrypointSrc), '');

// ── 13. validate-frame.js exists (NAS verify uses it) ──
t('VALIDATE_FRAME_SCRIPT_EXISTS', fs.existsSync(path.join(ROOT, 'scripts', 'validate-frame.js')), '');
// Check it's in production COPY
t('VALIDATE_FRAME_IN_PRODUCTION', prodLines.some(function(l) { return l.indexOf('COPY ') >= 0 && l.indexOf('scripts/') >= 0; }), '');

// ── 14. .dockerignore doesn't exclude files needed by Docker build/test ──
var diPath = path.join(ROOT, '.dockerignore');
t('DOCKERIGNORE_EXISTS', fs.existsSync(diPath), '');
var di = fs.readFileSync(diPath, 'utf8');
var diLines = di.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);

// Should NOT exclude test/ pattern
t('DOCKERIGNORE_NO_TEST_EXCLUDE', diLines.indexOf('test/') < 0, '');
// Should NOT exclude *-test.js
t('DOCKERIGNORE_NO_TEST_JS_EXCLUDE', diLines.indexOf('**/*.test.js') < 0, '');
t('DOCKERIGNORE_NO_DASH_TEST_EXCLUDE', diLines.indexOf('**/*-test.js') < 0, '');
// Should NOT exclude scripts/
t('DOCKERIGNORE_NO_SCRIPTS_EXCLUDE', diLines.indexOf('scripts/') < 0, '');
// Should NOT exclude docker-entrypoint.sh or Dockerfile
t('DOCKERIGNORE_NO_ENTRYPOINT_EXCLUDE', diLines.indexOf('docker-entrypoint.sh') < 0, '');
t('DOCKERIGNORE_NO_DOCKERFILE_EXCLUDE', diLines.indexOf('Dockerfile') < 0, '');
// Should exclude node_modules/
t('DOCKERIGNORE_EXCLUDES_NODE_MODULES', diLines.indexOf('node_modules/') >= 0, '');
// Should exclude .git/
t('DOCKERIGNORE_EXCLUDES_GIT', diLines.indexOf('.git/') >= 0, '');

// ── 15. File system check: verify all server requires exist locally ──
var serverJs = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
var localRequires = serverJs.match(/require\(['"]\.\/([^'"]+)['"]\)/g) || [];
localRequires.forEach(function(r) {
  var modPath = r.match(/require\(['"]\.\/([^'"]+)['"]\)/);
  if (modPath) {
    var fp = path.join(ROOT, modPath[1] + '.js');
    t('LOCAL_REQUIRE_EXISTS:' + modPath[1], fs.existsSync(fp), '');
  }
});

// ── 16. Verify container selftest required paths exist in production layout ──
var containerSelftest = fs.readFileSync(path.join(ROOT, 'scripts', 'container-selftest.js'), 'utf8');
// Extract required files from the REQUIRED_FILES array in container-selftest
var reqFilesMatch = containerSelftest.match(/var REQUIRED_FILES = \[([^\]]+)\]/);
if (reqFilesMatch) {
  var reqFiles = reqFilesMatch[1].match(/['"]([^'"]+)['"]/g) || [];
  reqFiles.forEach(function(f) {
    var clean = f.replace(/['"]/g, '');
    var fp = path.join(ROOT, clean);
    t('SELFTEST_REQUIRED_EXISTS:' + clean, fs.existsSync(fp), '');
    // Verify this file is in production COPY scope
    var inScope = false;
    requiredDirs.forEach(function(dir) {
      if (clean.indexOf(dir) === 0) inScope = true;
    });
    if (clean.indexOf('server.js') === 0 || clean.indexOf('package.json') === 0 || clean.indexOf('package-lock.json') === 0) inScope = true;
    if (clean.indexOf('scripts/') === 0) inScope = true;
    if (!inScope) {
      t('SELFTEST_REQUIRED_IN_PRODUCTION_SCOPE:' + clean, false, 'not covered by any COPY directive: ' + clean);
    }
  });
}

// ── 17. docker-entrypoint.sh exists and references correct paths ──
if (fs.existsSync(entrypointSrc)) {
  var ep = fs.readFileSync(entrypointSrc, 'utf8');
  t('ENTRYPOINT_REFERENCES_APP_DATA', ep.indexOf('/app/data') >= 0, '');
  t('ENTRYPOINT_REFERENCES_APP_RESOURCES', ep.indexOf('/app/resources') >= 0, '');
}

// ── 18. Production stage has ARG+ENV for BUILD_GIT_SHA/TREE/DIRTY ──
t('PROD_HAS_ARG_BUILD_GIT_SHA', prodStage.indexOf('ARG BUILD_GIT_SHA') >= 0, '');
t('PROD_HAS_ARG_BUILD_GIT_TREE', prodStage.indexOf('ARG BUILD_GIT_TREE') >= 0, '');
t('PROD_HAS_ARG_BUILD_DIRTY', prodStage.indexOf('ARG BUILD_DIRTY') >= 0, '');
// ENV line may combine all three (e.g. ENV BUILD_GIT_SHA=$BUILD_GIT_SHA BUILD_GIT_TREE=...)
var envLine = prodStage.split('\n').filter(function(l) { return l.indexOf('ENV BUILD_GIT_SHA=') >= 0 || l.indexOf('ENV BUILD_GIT_TREE=') >= 0 || l.indexOf('ENV BUILD_DIRTY=') >= 0; }).join('\n');
t('PROD_HAS_ENV_BUILD_GIT_SHA', envLine.indexOf('BUILD_GIT_SHA=') >= 0, '');
t('PROD_HAS_ENV_BUILD_GIT_TREE', envLine.indexOf('BUILD_GIT_TREE=') >= 0, '');
t('PROD_HAS_ENV_BUILD_DIRTY', envLine.indexOf('BUILD_DIRTY=') >= 0, '');
// Verify ENV references ARG (single line or separate lines)
t('PROD_ENV_REFERENCES_ARG_SHA', envLine.indexOf('BUILD_GIT_SHA=$BUILD_GIT_SHA') >= 0, '');
t('PROD_ENV_REFERENCES_ARG_TREE', envLine.indexOf('BUILD_GIT_TREE=$BUILD_GIT_TREE') >= 0, '');
t('PROD_ENV_REFERENCES_ARG_DIRTY', envLine.indexOf('BUILD_DIRTY=$BUILD_DIRTY') >= 0, '');

// ── 18b. Production stage has ARG BUILD_MODE and ENV BUILD_MODE ──
t('PROD_HAS_ARG_BUILD_MODE', prodStage.indexOf('ARG BUILD_MODE') >= 0, '');
t('PROD_HAS_ENV_BUILD_MODE', prodStage.indexOf('ENV BUILD_MODE=') >= 0, '');
var prodEnvBm = prodStage.split('\n').filter(function(l) { return l.indexOf('ENV BUILD_MODE=') >= 0; }).join('\n');
t('PROD_ENV_REFERENCES_ARG_BUILD_MODE', prodEnvBm.indexOf('BUILD_MODE=$BUILD_MODE') >= 0, '');

// ── 19. Build manifest: development mode produces correct fields ──
// Run generate-build-manifest.js with BUILD_MODE=development from the actual repo root
(function() {
  var os = require('os');
  var cp = require('child_process');
  var devEnv = Object.assign({}, process.env, { BUILD_MODE: 'development' });
  var manifestBak = null;
  // Backup existing manifest if it exists
  var manifestPath = path.join(ROOT, 'build-manifest.json');
  if (fs.existsSync(manifestPath)) {
    manifestBak = fs.readFileSync(manifestPath);
  }
  try {
    var devResult = cp.spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'generate-build-manifest.js')], {
      cwd: ROOT, env: devEnv,
    });

    if (devResult.status === 0) {
      t('DEV_BUILD_MANIFEST_EXIT_OK', true, '');
      if (fs.existsSync(manifestPath)) {
        var devManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        t('DEV_MANIFEST_gitSha', devManifest.gitSha === 'development', 'got=' + devManifest.gitSha);
        t('DEV_MANIFEST_gitTree', devManifest.gitTree === 'development', 'got=' + devManifest.gitTree);
        t('DEV_MANIFEST_dirty', devManifest.dirty === true, 'got=' + devManifest.dirty);
        t('DEV_MANIFEST_buildMode', devManifest.buildMode === 'development', 'got=' + devManifest.buildMode);
      } else {
        t('DEV_BUILD_MANIFEST_FILE', false, 'file not created');
      }
    } else {
      t('DEV_BUILD_MANIFEST_EXIT_OK', false, 'exit code=' + devResult.status + ' stderr=' + (devResult.stderr || '').toString().slice(0, 200));
    }
  } catch(e) {
    t('DEV_BUILD_MANIFEST_EXIT_OK', false, e.message);
  } finally {
    // Restore original manifest
    if (manifestBak) {
      fs.writeFileSync(manifestPath, manifestBak);
    } else if (fs.existsSync(manifestPath)) {
      try { fs.unlinkSync(manifestPath); } catch(e) {}
    }
  }
})();

// ── 20. Build manifest: release mode rejects missing/dirty ──
// Set BUILD_GIT_SHA to 'unknown' (via env) and BUILD_MODE=release, should fail
(function() {
  var cp = require('child_process');
  var relEnv = Object.assign({}, process.env, {
    BUILD_MODE: 'release',
    BUILD_GIT_SHA: 'unknown',
    BUILD_GIT_TREE: 'unknown',
    BUILD_DIRTY: 'false',
  });
  var relResult = cp.spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'generate-build-manifest.js')], {
    cwd: ROOT, env: relEnv,
  });
  // Should fail because SHA is 'unknown'
  t('REL_BUILD_MANIFEST_REJECTS_UNKNOWN', relResult.status !== 0, 'exit code=' + relResult.status + ' stderr=' + (relResult.stderr || '').toString().slice(0, 200));
})();

// ── Summary ──
console.log('\n=== Docker static contract: ' + (ec === 0 ? 'ALL PASSED' : 'SOME FAILED') + ' ===');
process.exit(ec);
