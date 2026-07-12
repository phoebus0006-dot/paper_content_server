#!/usr/bin/env node
// nsfw-safety-gate-test.js — NSFW safety gate 单元测试
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var { createNsfwSafetyGate } = require(path.join(ROOT, 'src', 'safety', 'nsfw-safety-gate'));
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

var warns = [];
var logger = { info: function(){}, warn: function(m){ warns.push(m); }, error: function(){} };
var gate = createNsfwSafetyGate({ logger: logger });

// 1. 合法 jpg 文件名通过
t('SAFE_JPG', gate.isSafe('/tmp/photo.jpg') === true, '');

// 2. 合法 png 文件名通过
t('SAFE_PNG', gate.isSafe('/tmp/image.PNG') === true, '');

// 3. 合法 webp 通过
t('SAFE_WEBP', gate.isSafe('/tmp/pic.webp') === true, '');

// 4. 不支持的扩展名被拒绝
t('REJECT_GIF', gate.isSafe('/tmp/anim.gif') === false, '');
t('REJECT_BMP', gate.isSafe('/tmp/legacy.bmp') === false, '');

// 5. 无文件名返回 false
t('EMPTY_PATH', gate.isSafe('') === false, '');
t('NULL_PATH', gate.isSafe(null) === false, '');

// 6. 文件名含 nsfw 关键词被拒绝
t('REJECT_NSFW_KEYWORD', gate.isSafe('/tmp/nsfw_image.jpg') === false, '');
t('REJECT_EXPLICIT_KEYWORD', gate.isSafe('/tmp/explicit_pic.png') === false, '');
t('REJECT_ADULT_KEYWORD', gate.isSafe('/tmp/adult_content.jpg') === false, '');
t('REJECT_XXX_KEYWORD', gate.isSafe('/tmp/xxx_pic.jpg') === false, '');

// 7. 文件大小超限被拒绝 (metadata.size)
t('REJECT_OVERSIZED_FILE', gate.isSafe('/tmp/big.jpg', { size: 60 * 1024 * 1024 }) === false, '');
// 8. 文件大小在限内通过
t('ACCEPT_NORMAL_SIZE', gate.isSafe('/tmp/ok.jpg', { size: 1024 }) === true, '');

// 9. 宽度超限被拒绝
t('REJECT_OVERSIZED_WIDTH', gate.isSafe('/tmp/wide.jpg', { width: 9000 }) === false, '');
t('ACCEPT_MAX_WIDTH', gate.isSafe('/tmp/ok.jpg', { width: 8192 }) === true, '');

// 10. 高度超限被拒绝
t('REJECT_OVERSIZED_HEIGHT', gate.isSafe('/tmp/tall.jpg', { height: 10000 }) === false, '');

// 11. 大写扩展名被接受 (lowercase 转换)
t('ACCEPT_UPPERCASE_EXT', gate.isSafe('/tmp/PHOTO.JPEG') === true, '');

// 12. ALLOWED_EXT 暴露
t('ALLOWED_EXT_EXPOSED', Array.isArray(gate.ALLOWED_EXT) && gate.ALLOWED_EXT.length === 4, '');

// 13. warn 日志被调用
warns = [];
var gate2 = createNsfwSafetyGate({ logger: { warn: function(m){ warns.push(m); }, info: function(){}, error: function(){} } });
gate2.isSafe('/tmp/bad.gif');
t('WARN_LOGGED_ON_REJECT', warns.length > 0, '');

console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(ec);
