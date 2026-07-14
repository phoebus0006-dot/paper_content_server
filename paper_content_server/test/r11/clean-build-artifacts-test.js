#!/usr/bin/env node
// R11 clean build & deploy artifact verification
// Verifies: Dockerfile order, build-staging.sh network mode, .dockerignore,
//           .env.example, deploy-staging.sh, verify.sh
var path = require('path');
var fs = require('fs');
var ROOT = path.join(__dirname, '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

var deployDir = path.join(ROOT, 'deploy', 'nas');

// ============================================================
// 1. Dockerfile: correct order — npm ci + sharp BEFORE COPY . .,
//    server.js --check AFTER COPY . .
// ============================================================
var dockerfile = fs.readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8');
var lines = dockerfile.split('\n');

// Find line indices
function findLine(substr, from) {
  for (var i = from || 0; i < lines.length; i++) {
    if (lines[i].indexOf(substr) >= 0) return i;
  }
  return -1;
}

var npmCiLine = findLine('npm ci --omit=dev');
var sharpLine = findLine("require('sharp')", npmCiLine);
var copyAllLine = findLine('COPY . .');
var serverCheckLine = findLine('node --check server.js');

t('DOCKERFILE_FROM_NODE_SLIM', dockerfile.indexOf('FROM node:20-slim') >= 0, '');
t('DOCKERFILE_NPM_CI', npmCiLine >= 0, '');
t('DOCKERFILE_SHARP_FAILFAST', sharpLine >= 0, '');

// ORDER: npm ci + sharp must be BEFORE COPY . .
t('DOCKERFILE_NPM_CI_BEFORE_COPY', npmCiLine >= 0 && copyAllLine >= 0 && npmCiLine < copyAllLine,
  'npm_ci@' + npmCiLine + ' copy@' + copyAllLine);
t('DOCKERFILE_SHARP_BEFORE_COPY', sharpLine >= 0 && copyAllLine >= 0 && sharpLine < copyAllLine,
  'sharp@' + sharpLine + ' copy@' + copyAllLine);

// ORDER: server.js --check must be AFTER COPY . .
t('DOCKERFILE_SERVER_CHECK_AFTER_COPY', serverCheckLine >= 0 && copyAllLine >= 0 && serverCheckLine > copyAllLine,
  'check@' + serverCheckLine + ' copy@' + copyAllLine);

// server.js --check must NOT be in the same RUN as npm ci
var npmCiRunEnd = -1;
for (var i = npmCiLine; i < lines.length; i++) {
  if (lines[i].trim().indexOf('RUN ') === 0 && i !== npmCiLine) { npmCiRunEnd = i; break; }
  if (lines[i].trim() === 'COPY . .' || lines[i].trim().indexOf('COPY . .') >= 0) { npmCiRunEnd = i; break; }
}
t('DOCKERFILE_SERVER_CHECK_SEPARATE_RUN', serverCheckLine >= 0 && serverCheckLine > copyAllLine,
  'server check is a separate RUN after COPY');

t('DOCKERFILE_NO_COPY_NODE_MODULES', dockerfile.indexOf('COPY node_modules') < 0, 'must not copy host node_modules');
t('DOCKERFILE_NO_REUSE_REFERENCE', dockerfile.indexOf('Dockerfile.reuse') < 0, 'must not reference reuse approach');
t('DOCKERFILE_NON_ROOT', dockerfile.indexOf('USER appuser') >= 0, '');
t('DOCKERFILE_BUILD_ARG_SHA', dockerfile.indexOf('BUILD_GIT_SHA') >= 0, '');
t('DOCKERFILE_BUILD_ARG_TREE', dockerfile.indexOf('BUILD_GIT_TREE') >= 0, '');

// ============================================================
// 2. build-staging.sh: network mode is opt-in, validates values
// ============================================================
var buildScript = fs.readFileSync(path.join(deployDir, 'build-staging.sh'), 'utf8');
t('BUILD_SCRIPT_REQUIRES_GIT_SHA', buildScript.indexOf('GIT_SHA') >= 0 && buildScript.indexOf('usage') >= 0, '');
t('BUILD_SCRIPT_NO_CACHE', buildScript.indexOf('--no-cache') >= 0, '');

// Network mode: DOCKER_BUILD_NETWORK variable must exist
t('BUILD_SCRIPT_NETWORK_VAR', buildScript.indexOf('DOCKER_BUILD_NETWORK') >= 0, '');

// host mode is opt-in via DOCKER_BUILD_NETWORK=host
t('BUILD_SCRIPT_HOST_OPTIN', buildScript.indexOf('DOCKER_BUILD_NETWORK=host') >= 0 || buildScript.indexOf('"host"') >= 0, '');

// Default must NOT include --network=host unconditionally
// The --network=host should only appear inside the host case branch
var hostCaseIdx = buildScript.indexOf('host)');
var networkHostIdx = buildScript.indexOf('--network=host');
t('BUILD_SCRIPT_HOST_IN_CASE_BRANCH', hostCaseIdx >= 0 && networkHostIdx >= 0 && networkHostIdx > hostCaseIdx,
  'host@' + hostCaseIdx + ' netarg@' + networkHostIdx);

// Must validate allowed values and reject invalid
t('BUILD_SCRIPT_REJECTS_INVALID_NETWORK', buildScript.indexOf('is invalid') >= 0 || buildScript.indexOf('Allowed values') >= 0, '');

// Must NOT disable TLS
t('BUILD_SCRIPT_TLS_NOT_DISABLED', buildScript.indexOf('NODE_TLS_REJECT_UNAUTHORIZED') < 0, 'must not disable TLS');

t('BUILD_SCRIPT_FAIL_FAST', buildScript.indexOf('set -euo pipefail') >= 0, '');
t('BUILD_SCRIPT_VERIFY_SHARP', buildScript.indexOf("require('sharp')") >= 0, '');
t('BUILD_SCRIPT_VERIFY_NON_ROOT', buildScript.indexOf('id -u') >= 0 || buildScript.indexOf('id"$IMAGE" -u') >= 0 || buildScript.indexOf('entrypoint id') >= 0, '');

// Must NOT refuse build if host node_modules exists
t('BUILD_SCRIPT_NO_NODE_MODULES_REFUSAL', buildScript.indexOf('host node_modules present') < 0 && buildScript.indexOf('refusing to build from dirty') < 0,
  'must not refuse based on host node_modules');

// Must verify BUILD_GIT_TREE
t('BUILD_SCRIPT_VERIFY_TREE', buildScript.indexOf('BUILD_GIT_TREE') >= 0, '');

// server.js check must use --entrypoint node
t('BUILD_SCRIPT_SERVER_CHECK_ENTRYPOINT', buildScript.indexOf('--entrypoint node') >= 0, '');

// 12-char tag
t('BUILD_SCRIPT_12_CHAR_TAG', buildScript.indexOf('${GIT_SHA:0:12}') >= 0, '');

// ============================================================
// 3. .dockerignore: excludes node_modules, data, .env, config.h,
//    models, fonts, temp files
// ============================================================
var dockerignore = fs.readFileSync(path.join(ROOT, '.dockerignore'), 'utf8');
t('DOCKERIGNORE_NODE_MODULES', dockerignore.indexOf('node_modules') >= 0, '');
t('DOCKERIGNORE_DATA', dockerignore.indexOf('data/') >= 0, '');
t('DOCKERIGNORE_ENV', dockerignore.indexOf('.env') >= 0, '');
t('DOCKERIGNORE_CONFIG_H', dockerignore.indexOf('config.h') >= 0, '');
t('DOCKERIGNORE_GIT', dockerignore.indexOf('.git/') >= 0, '');
// Model file patterns
t('DOCKERIGNORE_TFLITE', dockerignore.indexOf('*.tflite') >= 0, '');
t('DOCKERIGNORE_ONNX', dockerignore.indexOf('*.onnx') >= 0, '');
// Font file patterns
t('DOCKERIGNORE_TTF', dockerignore.indexOf('*.ttf') >= 0, '');
t('DOCKERIGNORE_OTF', dockerignore.indexOf('*.otf') >= 0, '');
// Temp file patterns
t('DOCKERIGNORE_LOG', dockerignore.indexOf('*.log') >= 0, '');
t('DOCKERIGNORE_TMP', dockerignore.indexOf('*.tmp') >= 0, '');

// ============================================================
// 4. .env.example: minimal, no production secrets
// ============================================================
var envExample = fs.readFileSync(path.join(deployDir, '.env.example'), 'utf8');
t('ENV_EXAMPLE_PORT', envExample.indexOf('PORT=8787') >= 0, '');
t('ENV_EXAMPLE_ADMIN_LAN', envExample.indexOf('ADMIN_ACCESS_MODE=lan') >= 0, '');
t('ENV_EXAMPLE_TRUST_PROXY_FALSE', envExample.indexOf('TRUST_PROXY=false') >= 0, '');
t('ENV_EXAMPLE_NO_OPENAI_KEY', envExample.indexOf('OPENAI_API_KEY') < 0, 'must not contain production API key');
t('ENV_EXAMPLE_NO_GEMINI', envExample.indexOf('GEMINI') < 0, 'must not contain Gemini config');
t('ENV_EXAMPLE_NO_TRANSLATION', envExample.indexOf('TRANSLATION_PROVIDER') < 0, '');
t('ENV_EXAMPLE_MQTT_FALSE', envExample.indexOf('MQTT_ENABLED=false') >= 0, '');
t('ENV_EXAMPLE_CUSTOM_LIB_FALSE', envExample.indexOf('CUSTOM_LIBRARY_ENABLED=false') >= 0, '');
t('ENV_EXAMPLE_LEARNING_FALSE', envExample.indexOf('LEARNING_LIBRARY_ENABLED=false') >= 0, '');
t('ENV_EXAMPLE_DELETE_FALSE', envExample.indexOf('DELETE_PIPELINE_ENABLED=false') >= 0, '');
t('ENV_EXAMPLE_R9_ADVANCED_FALSE', envExample.indexOf('R9_ADVANCED_RENDER_ENABLED=false') >= 0, '');
t('ENV_EXAMPLE_R9_SHADOW_FALSE', envExample.indexOf('R9_RENDER_SHADOW_ENABLED=false') >= 0, '');

// ============================================================
// 5. deploy-staging.sh: staging only, backup, rejects production secrets
// ============================================================
var deployScript = fs.readFileSync(path.join(deployDir, 'deploy-staging.sh'), 'utf8');
t('DEPLOY_STAGING_PORT_18080', deployScript.indexOf('18080') >= 0, '');
t('DEPLOY_PRODUCTION_8787_REFERENCED', deployScript.indexOf('8787') >= 0 && deployScript.indexOf('untouched') >= 0, '');
t('DEPLOY_BACKUP', deployScript.indexOf('backup.sh') >= 0, '');
t('DEPLOY_REJECTS_SECRETS', deployScript.indexOf('OPENAI_API_KEY') >= 0 && deployScript.indexOf('FAIL') >= 0, '');
t('DEPLOY_NO_TOUCH_PRODUCTION', deployScript.indexOf('paper-frame-server') < 0, 'must not reference production container name');

// ============================================================
// 6. verify.sh: full endpoint + frame + sharp + CJK + SHA
// ============================================================
var verifyScript = fs.readFileSync(path.join(deployDir, 'verify.sh'), 'utf8');
t('VERIFY_HEALTH_LIVE', verifyScript.indexOf('health/live') >= 0, '');
t('VERIFY_HEALTH_READY', verifyScript.indexOf('health/ready') >= 0, '');
t('VERIFY_ADMIN', verifyScript.indexOf('/admin') >= 0, '');
t('VERIFY_STATE', verifyScript.indexOf('state.json') >= 0, '');
t('VERIFY_FRAME_192010', verifyScript.indexOf('192010') >= 0, '');
t('VERIFY_EPF1_MAGIC', verifyScript.indexOf('45504631') >= 0 || verifyScript.indexOf('EPF1') >= 0, '');
t('VERIFY_WIDTH_800', verifyScript.indexOf('800') >= 0, '');
t('VERIFY_HEIGHT_480', verifyScript.indexOf('480') >= 0, '');
t('VERIFY_PANEL_49', verifyScript.indexOf('49') >= 0, '');
t('VERIFY_NON_ROOT', verifyScript.indexOf('id -u') >= 0, '');
t('VERIFY_SHARP', verifyScript.indexOf("require('sharp')") >= 0, '');
t('VERIFY_CJK', verifyScript.indexOf('CJK') >= 0, '');
t('VERIFY_BUILD_SHA', verifyScript.indexOf('BUILD_GIT_SHA') >= 0, '');
t('VERIFY_BUILD_404_DOC', verifyScript.indexOf('NOT_IMPLEMENTED') >= 0 || verifyScript.indexOf('404') >= 0, '');

console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(ec);
