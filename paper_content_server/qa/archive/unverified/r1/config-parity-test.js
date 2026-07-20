#!/usr/bin/env node
// R1.2: Config parity — new config loader must produce same results as legacy
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var ec = 0, pass = 0, fail = 0;
function t(n,o,d){console.log((o?'PASS':'FAIL')+' '+n+(d?': '+d:''));if(o)pass++;else{ec=1;fail++}}

var loadConfig = require(path.join(ROOT, 'src', 'config', 'load-config')).loadConfig;
t('LOAD_CONFIG_EXISTS', typeof loadConfig === 'function', '');

// Default config — LAN mode with local CIDR (valid baseline)
var cfg = loadConfig({ env: { ADMIN_ACCESS_MODE: 'lan', ADMIN_ALLOWED_CIDRS: '127.0.0.0/8' }, cwd: ROOT });
t('DEFAULT_PORT', cfg.server.port === 8787, 'port=' + cfg.server.port);
t('DEFAULT_PANEL', cfg.panel.index === 49, 'panel=' + cfg.panel.index);
t('DEFAULT_PROVIDER', cfg.translation.provider === 'none', 'provider=' + cfg.translation.provider);
t('DEFAULT_DATA_DIR', cfg.paths.dataDir.indexOf('data') >= 0, 'dataDir=' + cfg.paths.dataDir);
t('CONFIG_IS_VALID', cfg.isValid === true, '');

// Env override
var cfg2 = loadConfig({ env: { PORT: '9000', TRANSLATION_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test', ADMIN_ACCESS_MODE: 'lan', ADMIN_ALLOWED_CIDRS: '127.0.0.0/8' }, cwd: ROOT });
t('ENV_PORT', cfg2.server.port === 9000, 'port=' + cfg2.server.port);
t('ENV_PROVIDER', cfg2.translation.provider === 'openai', 'provider=' + cfg2.translation.provider);

// Missing required key
var cfg3 = loadConfig({ env: { TRANSLATION_PROVIDER: 'openai' }, cwd: ROOT });
t('MISSING_OPENAI_KEY', cfg3.isValid === false, 'errors=' + cfg3.errors.join(','));

console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(ec);
