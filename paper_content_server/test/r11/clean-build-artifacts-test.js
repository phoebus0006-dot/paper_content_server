#!/usr/bin/env node
// R11 clean build & deploy artifact verification
// Verifies: Dockerfile, build-staging.sh, .env.example, deploy-staging.sh, verify.sh
var path = require('path');
var fs = require('fs');
var ROOT = path.join(__dirname, '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

var deployDir = path.join(ROOT, 'deploy', 'nas');

// 1. Dockerfile: clean build, no node_modules copy, npm ci, sharp fail-fast
var dockerfile = fs.readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8');
t('DOCKERFILE_FROM_NODE_SLIM', dockerfile.indexOf('FROM node:20-slim') >= 0, '');
t('DOCKERFILE_NPM_CI', dockerfile.indexOf('npm ci --omit=dev --no-audit --no-fund') >= 0, '');
t('DOCKERFILE_SHARP_FAILFAST', dockerfile.indexOf("require('sharp')") >= 0, '');
t('DOCKERFILE_SERVER_CHECK', dockerfile.indexOf('node --check server.js') >= 0, '');
t('DOCKERFILE_NO_COPY_NODE_MODULES', dockerfile.indexOf('COPY node_modules') < 0, 'must not copy host node_modules');
t('DOCKERFILE_NO_REUSE_REFERENCE', dockerfile.indexOf('Dockerfile.reuse') < 0, 'must not reference reuse approach');
t('DOCKERFILE_NON_ROOT', dockerfile.indexOf('USER appuser') >= 0, '');
t('DOCKERFILE_BUILD_ARG_SHA', dockerfile.indexOf('BUILD_GIT_SHA') >= 0, '');

// 2. build-staging.sh: requires GIT_SHA, uses --no-cache, --network=host, fail-fast
var buildScript = fs.readFileSync(path.join(deployDir, 'build-staging.sh'), 'utf8');
t('BUILD_SCRIPT_REQUIRES_GIT_SHA', buildScript.indexOf('GIT_SHA') >= 0 && buildScript.indexOf('usage') >= 0, '');
t('BUILD_SCRIPT_NO_CACHE', buildScript.indexOf('--no-cache') >= 0, '');
t('BUILD_SCRIPT_NETWORK_HOST', buildScript.indexOf('--network=host') >= 0, '');
t('BUILD_SCRIPT_TLS_NOT_DISABLED', buildScript.indexOf('NODE_TLS_REJECT_UNAUTHORIZED') < 0, 'must not disable TLS');
t('BUILD_SCRIPT_FAIL_FAST', buildScript.indexOf('set -euo pipefail') >= 0, '');
t('BUILD_SCRIPT_VERIFY_SHARP', buildScript.indexOf("require('sharp')") >= 0, '');
t('BUILD_SCRIPT_VERIFY_NON_ROOT', buildScript.indexOf('id -u') >= 0, '');
t('BUILD_SCRIPT_12_CHAR_TAG', buildScript.indexOf('${GIT_SHA:0:12}') >= 0 || buildScript.indexOf('12') >= 0, '');

// 3. .env.example: minimal, no production secrets
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

// 4. deploy-staging.sh: staging only, backup, rejects production secrets
var deployScript = fs.readFileSync(path.join(deployDir, 'deploy-staging.sh'), 'utf8');
t('DEPLOY_STAGING_PORT_18080', deployScript.indexOf('18080') >= 0, '');
t('DEPLOY_PRODUCTION_8787_REFERENCED', deployScript.indexOf('8787') >= 0 && deployScript.indexOf('untouched') >= 0, '');
t('DEPLOY_BACKUP', deployScript.indexOf('backup.sh') >= 0, '');
t('DEPLOY_REJECTS_SECRETS', deployScript.indexOf('OPENAI_API_KEY') >= 0 && deployScript.indexOf('FAIL') >= 0, '');
t('DEPLOY_NO_TOUCH_PRODUCTION', deployScript.indexOf('paper-frame-server') < 0, 'must not reference production container name');

// 5. verify.sh: full endpoint + frame + sharp + CJK + SHA
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
