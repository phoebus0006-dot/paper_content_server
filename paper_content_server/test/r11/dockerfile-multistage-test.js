#!/usr/bin/env node
var path = require('path');
var fs = require('fs');
var ROOT = path.join(__dirname, '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

// --- Dockerfile checks ---
var dockerfile = fs.readFileSync(path.join(ROOT, 'Dockerfile'), 'utf8');

t('NPM_CI_OMIT_DEV', dockerfile.indexOf('npm ci --omit=dev') >= 0, '');
t('NON_ROOT_USER_APPUSER', dockerfile.indexOf('USER appuser') >= 0, '');
t('NO_COPY_NODE_MODULES', dockerfile.indexOf('COPY node_modules') < 0, 'must not copy host node_modules');
t('MULTISTAGE_BUILD', dockerfile.indexOf('AS builder') >= 0 && dockerfile.indexOf('AS runtime') >= 0, '');
t('FONTS_NOTO_CJK', dockerfile.indexOf('fonts-noto-cjk') >= 0, '');

// --- .dockerignore checks ---
var dockerignore = fs.readFileSync(path.join(ROOT, '.dockerignore'), 'utf8');
t('DOCKERIGNORE_NODE_MODULES', dockerignore.indexOf('node_modules/') >= 0, '');
t('DOCKERIGNORE_DATA', dockerignore.indexOf('data/') >= 0, '');
t('DOCKERIGNORE_TEST', dockerignore.indexOf('test/') >= 0, '');
t('DOCKERIGNORE_ENV', dockerignore.indexOf('.env') >= 0, '');
t('DOCKERIGNORE_CONFIG_H', dockerignore.indexOf('config.h') >= 0, '');

// --- NAS compose port check ---
var composePath = path.join(ROOT, 'deploy', 'nas', 'docker-compose.yml');
var compose = fs.readFileSync(composePath, 'utf8');
t('NAS_PORT_18080_8787', compose.indexOf('18080:8787') >= 0, '');

console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(ec);
