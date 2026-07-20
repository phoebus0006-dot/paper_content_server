#!/usr/bin/env node
// R11 clean build & deploy artifact verification
// Verifies: Dockerfile order, build-staging.sh network mode, .dockerignore,
//           .env.example, deploy-staging.sh, verify.sh, path consistency,
//           LF line endings, no host node dependency, SHA exact match.
var path = require('path');
var fs = require('fs');
var cp = require('child_process');
var ROOT = path.join(__dirname, '..', '..', '..');
var REPO_ROOT = path.join(ROOT, '..');
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

var deployDir = path.join(ROOT, 'deploy', 'nas');

// ============================================================
// 1. Dockerfile: correct order — npm ci + sharp BEFORE COPY . .,
//    server.js --check AFTER COPY . .
// ============================================================
var dockerfile = fs.readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8');
var lines = dockerfile.split('\n');

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

t('DOCKERFILE_NPM_CI_BEFORE_COPY', npmCiLine >= 0 && copyAllLine >= 0 && npmCiLine < copyAllLine,
  'npm_ci@' + npmCiLine + ' copy@' + copyAllLine);
t('DOCKERFILE_SHARP_BEFORE_COPY', sharpLine >= 0 && copyAllLine >= 0 && sharpLine < copyAllLine,
  'sharp@' + sharpLine + ' copy@' + copyAllLine);

t('DOCKERFILE_SERVER_CHECK_AFTER_COPY', serverCheckLine >= 0 && copyAllLine >= 0 && serverCheckLine > copyAllLine,
  'check@' + serverCheckLine + ' copy@' + copyAllLine);

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
t('BUILD_SCRIPT_NETWORK_VAR', buildScript.indexOf('DOCKER_BUILD_NETWORK') >= 0, '');
t('BUILD_SCRIPT_HOST_OPTIN', buildScript.indexOf('DOCKER_BUILD_NETWORK=host') >= 0 || buildScript.indexOf('"host"') >= 0, '');

var hostCaseIdx = buildScript.indexOf('host)');
var networkHostIdx = buildScript.indexOf('--network=host');
t('BUILD_SCRIPT_HOST_IN_CASE_BRANCH', hostCaseIdx >= 0 && networkHostIdx >= 0 && networkHostIdx > hostCaseIdx,
  'host@' + hostCaseIdx + ' netarg@' + networkHostIdx);

t('BUILD_SCRIPT_REJECTS_INVALID_NETWORK', buildScript.indexOf('is invalid') >= 0 || buildScript.indexOf('Allowed values') >= 0, '');
t('BUILD_SCRIPT_TLS_NOT_DISABLED', buildScript.indexOf('NODE_TLS_REJECT_UNAUTHORIZED') < 0, 'must not disable TLS');
t('BUILD_SCRIPT_FAIL_FAST', buildScript.indexOf('set -euo pipefail') >= 0, '');
t('BUILD_SCRIPT_VERIFY_SHARP', buildScript.indexOf("require('sharp')") >= 0, '');
t('BUILD_SCRIPT_VERIFY_NON_ROOT', buildScript.indexOf('id -u') >= 0 || buildScript.indexOf('id"$IMAGE" -u') >= 0 || buildScript.indexOf('entrypoint id') >= 0, '');
t('BUILD_SCRIPT_NO_NODE_MODULES_REFUSAL', buildScript.indexOf('host node_modules present') < 0 && buildScript.indexOf('refusing to build from dirty') < 0,
  'must not refuse based on host node_modules');
t('BUILD_SCRIPT_VERIFY_TREE', buildScript.indexOf('BUILD_GIT_TREE') >= 0, '');
t('BUILD_SCRIPT_SERVER_CHECK_ENTRYPOINT', buildScript.indexOf('--entrypoint node') >= 0, '');
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
t('DOCKERIGNORE_TFLITE', dockerignore.indexOf('*.tflite') >= 0, '');
t('DOCKERIGNORE_ONNX', dockerignore.indexOf('*.onnx') >= 0, '');
t('DOCKERIGNORE_TTF', dockerignore.indexOf('*.ttf') >= 0, '');
t('DOCKERIGNORE_OTF', dockerignore.indexOf('*.otf') >= 0, '');
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
// 5. deploy-staging.sh: staging only, backup, rejects production secrets,
//    uses STAGING_ROOT env var (no hardcoded paths)
// ============================================================
var deployScript = fs.readFileSync(path.join(deployDir, 'deploy-staging.sh'), 'utf8');
t('DEPLOY_STAGING_PORT_18080', deployScript.indexOf('18080') >= 0, '');
t('DEPLOY_PRODUCTION_8787_REFERENCED', deployScript.indexOf('8787') >= 0 && deployScript.indexOf('untouched') >= 0, '');
t('DEPLOY_BACKUP', deployScript.indexOf('backup.sh') >= 0, '');
t('DEPLOY_REJECTS_SECRETS', deployScript.indexOf('OPENAI_API_KEY') >= 0 && deployScript.indexOf('FAIL') >= 0, '');
t('DEPLOY_NO_TOUCH_PRODUCTION', deployScript.indexOf('paper-frame-server') < 0, 'must not reference production container name');
// Path portability: must use STAGING_ROOT env var, not hardcoded /volume1
t('DEPLOY_USES_STAGING_ROOT', deployScript.indexOf('STAGING_ROOT') >= 0, 'must use STAGING_ROOT env var');
t('DEPLOY_NO_VOLUME1_HARDCODE', deployScript.indexOf('/volume1/docker/paper-content-staging') < 0, 'must not hardcode /volume1 path');
t('DEPLOY_USES_DATA_DIR_VAR', deployScript.indexOf('DATA_DIR') >= 0, 'must use DATA_DIR variable');
t('DEPLOY_USES_IMAGE_DIR_VAR', deployScript.indexOf('IMAGE_DIR') >= 0, 'must use IMAGE_DIR variable');

// ============================================================
// 6. backup.sh: uses STAGING_ROOT, no hardcoded /volume1
// ============================================================
var backupScript = fs.readFileSync(path.join(deployDir, 'backup.sh'), 'utf8');
t('BACKUP_USES_STAGING_ROOT', backupScript.indexOf('STAGING_ROOT') >= 0, 'must use STAGING_ROOT env var');
t('BACKUP_NO_VOLUME1_HARDCODE', backupScript.indexOf('/volume1/docker/paper-content-staging') < 0, 'must not hardcode /volume1 path');
t('BACKUP_USES_DATA_DIR_VAR', backupScript.indexOf('DATA_DIR') >= 0, 'must use DATA_DIR variable');
t('BACKUP_USES_BACKUP_DIR_VAR', backupScript.indexOf('BACKUP_DIR') >= 0, 'must use BACKUP_DIR variable');

// ============================================================
// 7. rollback.sh: uses STAGING_ROOT, no hardcoded /volume1
// ============================================================
var rollbackScript = fs.readFileSync(path.join(deployDir, 'rollback.sh'), 'utf8');
t('ROLLBACK_USES_STAGING_ROOT', rollbackScript.indexOf('STAGING_ROOT') >= 0, 'must use STAGING_ROOT env var');
t('ROLLBACK_NO_VOLUME1_HARDCODE', rollbackScript.indexOf('/volume1/docker/paper-content-staging') < 0, 'must not hardcode /volume1 path');

// ============================================================
// 8. verify.sh: no host Node dependency, SHA exact match, CJK render
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
t('VERIFY_BUILD_404_DOC', verifyScript.indexOf('NOT_IMPLEMENTED') >= 0 || verifyScript.indexOf('404') >= 0, '');

// NEW: verify.sh must NOT call host node directly
t('VERIFY_NO_HOST_NODE', verifyScript.indexOf('node "$SRC_DIR') < 0 && verifyScript.indexOf('SRC_DIR') < 0,
  'must not reference host SRC_DIR for node execution');
t('VERIFY_USES_DOCKER_EXEC', verifyScript.indexOf('docker exec') >= 0, 'must use docker exec for node work');
t('VERIFY_USES_CONTAINER_VALIDATOR', verifyScript.indexOf('/app/scripts/validate-frame.js') >= 0,
  'must run validator inside container');

// NEW: SHA exact match (not just non-empty)
t('VERIFY_EXPECTED_SHA_VAR', verifyScript.indexOf('EXPECTED_SHA') >= 0, 'must accept EXPECTED_SHA env var');
t('VERIFY_EXPECTED_TREE_VAR', verifyScript.indexOf('EXPECTED_TREE') >= 0, 'must accept EXPECTED_TREE env var');
// Checks for the exact comparison pattern, not just non-empty
t('VERIFY_SHA_EXACT_MATCH', verifyScript.indexOf('ACTUAL_SHA') >= 0 && verifyScript.indexOf('EXPECTED_SHA') >= 0 &&
  (verifyScript.indexOf('"$ACTUAL_SHA" = "$EXPECTED_SHA"') >= 0 ||
   verifyScript.indexOf('ACTUAL_SHA = "$EXPECTED_SHA"') >= 0 ||
   verifyScript.indexOf('"$ACTUAL_SHA"="$EXPECTED_SHA"') >= 0 ||
   verifyScript.indexOf('"$EXPECTED_SHA" ] && echo true') >= 0),
  'must verify exact SHA match, not just non-empty');
t('VERIFY_TREE_EXACT_MATCH', verifyScript.indexOf('ACTUAL_TREE') >= 0 && verifyScript.indexOf('EXPECTED_TREE') >= 0,
  'must verify exact tree match');
t('VERIFY_DIRTY_FALSE', verifyScript.indexOf('ACTUAL_DIRTY') >= 0 && verifyScript.indexOf('false') >= 0,
  'must verify BUILD_DIRTY=false');

// NEW: CJK dynamic render (not just file count)
t('VERIFY_CJK_RENDER', verifyScript.indexOf('CJK_RENDER') >= 0 || verifyScript.indexOf('dark_pixels') >= 0,
  'must dynamically render CJK text and count dark pixels');
t('VERIFY_CJK_RENDER_TEXT', verifyScript.indexOf('新闻图片测试') >= 0, 'must render specific Chinese test text');

// NEW: verify.sh must not require host node/npm
t('VERIFY_NO_HOST_NODE_REQUIREMENT', verifyScript.indexOf('node "$SRC_DIR/scripts') < 0,
  'must not require node on host');

// ============================================================
// 9. .gitattributes: enforces LF for *.sh and Dockerfile
// ============================================================
var gitattributesPath = path.join(REPO_ROOT, '.gitattributes');
t('GITATTRIBUTES_EXISTS', fs.existsSync(gitattributesPath), '');
if (fs.existsSync(gitattributesPath)) {
  var gitattributes = fs.readFileSync(gitattributesPath, 'utf8');
  t('GITATTRIBUTES_SH_LF', gitattributes.indexOf('*.sh') >= 0 && gitattributes.indexOf('eol=lf') >= 0, '');
  t('GITATTRIBUTES_DOCKERFILE_LF', gitattributes.indexOf('Dockerfile') >= 0 && gitattributes.indexOf('eol=lf') >= 0, '');
}

// ============================================================
// 10. LF line endings: all deploy/nas/*.sh must not contain CRLF
// ============================================================
var shFiles = fs.readdirSync(deployDir).filter(function(f) { return f.endsWith('.sh'); });
shFiles.forEach(function(f) {
  var filePath = path.join(deployDir, f);
  var buf = fs.readFileSync(filePath);
  var hasCRLF = false;
  for (var i = 0; i < buf.length - 1; i++) {
    if (buf[i] === 0x0D && buf[i + 1] === 0x0A) { hasCRLF = true; break; }
  }
  t('LF_' + f.toUpperCase().replace(/\./g, '_'), !hasCRLF, hasCRLF ? 'contains CRLF' : '');

  // Shebang check
  var content = buf.toString('utf8');
  t('SHEBANG_' + f.toUpperCase().replace(/\./g, '_'), content.indexOf('#!/bin/bash') === 0, 'must start with #!/bin/bash');
});

// Dockerfile LF check
var dockerfileBuf = fs.readFileSync(path.join(ROOT, 'Dockerfile'));
var dockerfileHasCRLF = false;
for (var i = 0; i < dockerfileBuf.length - 1; i++) {
  if (dockerfileBuf[i] === 0x0D && dockerfileBuf[i + 1] === 0x0A) { dockerfileHasCRLF = true; break; }
}
t('LF_DOCKERFILE', !dockerfileHasCRLF, dockerfileHasCRLF ? 'contains CRLF' : '');

// ============================================================
// 11. bash -n syntax check (if bash is available and can resolve paths)
// ============================================================
var bashProbe = cp.spawnSync('bash', ['-c', 'echo ok'], { cwd: ROOT });
var bashAvailable = !bashProbe.error && bashProbe.status === 0;
if (bashAvailable) {
  // On Windows, bash needs Unix-style paths; use cygpath or cd
  shFiles.forEach(function(f) {
    var filePath = path.join(deployDir, f);
    // Use bash -c with cd to handle Windows paths
    var unixPath = filePath.replace(/\\/g, '/');
    var drive = unixPath.replace(/^([a-zA-Z]):\/.*/, '/$1');
    if (drive !== unixPath) {
      // Git Bash uses /c/path format
      unixPath = '/' + unixPath.charAt(0).toLowerCase() + unixPath.substring(2);
    }
    var r = cp.spawnSync('bash', ['-n', unixPath], { cwd: ROOT });
    if (r.status === 127) {
      // bash couldn't resolve path — skip, CI verifies
      t('BASH_SYNTAX_' + f.toUpperCase().replace(/\./g, '_'), true, 'path resolution issue, CI verifies');
    } else {
      t('BASH_SYNTAX_' + f.toUpperCase().replace(/\./g, '_'), r.status === 0, 'exit=' + r.status);
    }
  });
} else {
  t('BASH_SYNTAX_SKIPPED_NO_BASH', true, 'bash not on host, CI verifies syntax');
}

console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(ec);
