#!/usr/bin/env node
// image-rasterizer-test.js — 图片光栅化器单元测试
// 用 sharp 生成真实小图片,验证 rasterizeImage 把像素量化到调色板码并写入 codes 数组,
// 同时验证非本地 URL / 缺失文件触发 fallback 填充。
var path = require('path');
var fs = require('fs');
var os = require('os');
var sharp = require('sharp');
var ROOT = path.join(__dirname, '..', '..', '..');
var img = require(path.join(ROOT, 'src', 'render', 'image-rasterizer'));
var palette = require(path.join(ROOT, 'src', 'epaper', 'palette'));
var ec = 0, pass = 0, fail = 0;
function t(n, o, d) { console.log((o ? 'PASS' : 'FAIL') + ' ' + n + (d ? ': ' + d : '')); if (o) pass++; else { ec = 1; fail++; } }

function makeCodes(w, h, fill) {
  var codes = new Array(w * h);
  for (var i = 0; i < codes.length; i++) codes[i] = (fill != null ? fill : 1);
  return codes;
}

function countCode(codes, w, h, x0, y0, x1, y1, target) {
  var n = 0;
  for (var y = y0; y < y1 && y < h; y++) {
    for (var x = x0; x < x1 && x < w; x++) {
      if (codes[y * w + x] === target) n++;
    }
  }
  return n;
}

// 创建临时目录用于测试图片
var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-raster-'));

function cleanup() {
  try {
    var files = fs.readdirSync(tmpDir);
    files.forEach(function(f) { try { fs.unlinkSync(path.join(tmpDir, f)); } catch (e) {} });
    fs.rmdirSync(tmpDir);
  } catch (e) {}
}

async function run() {
  // === 1. 纯红图片应被量化到调色板码 3 (red) ===
  var redPng = path.join(tmpDir, 'red.png');
  await sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 255, g: 0, b: 0 } },
  }).png().toFile(redPng);
  t('RED_PNG_CREATED', fs.existsSync(redPng), '');

  var codes = makeCodes(20, 20, 1);
  await img.rasterizeImage(redPng, 0, 0, 8, 8, codes, 20, 20, { mode: 'contain' });
  var redCount = countCode(codes, 20, 20, 0, 0, 8, 8, 3);
  t('RED_QUANTIZED_TO_RED_CODE', redCount === 64, 'red=' + redCount);
  // 红图片不应有白色像素(code 1)进入图像区域
  var whiteCount = countCode(codes, 20, 20, 0, 0, 8, 8, 1);
  t('RED_NO_WHITE_IN_IMAGE', whiteCount === 0, 'white=' + whiteCount);

  // === 2. 纯白图片应被量化到 code 1 ===
  var whitePng = path.join(tmpDir, 'white.png');
  await sharp({
    create: { width: 4, height: 4, channels: 3, background: { r: 255, g: 255, b: 255 } },
  }).png().toFile(whitePng);
  var codes2 = makeCodes(20, 20, 0);
  await img.rasterizeImage(whitePng, 0, 0, 4, 4, codes2, 20, 20, { mode: 'contain' });
  var whiteCount2 = countCode(codes2, 20, 20, 0, 0, 4, 4, 1);
  t('WHITE_QUANTIZED_TO_WHITE_CODE', whiteCount2 === 16, 'white=' + whiteCount2);

  // === 3. 纯黑图片应被量化到 code 0 ===
  var blackPng = path.join(tmpDir, 'black.png');
  await sharp({
    create: { width: 6, height: 6, channels: 3, background: { r: 0, g: 0, b: 0 } },
  }).png().toFile(blackPng);
  var codes3 = makeCodes(20, 20, 1);
  await img.rasterizeImage(blackPng, 5, 5, 6, 6, codes3, 20, 20, { mode: 'contain' });
  var blackCount3 = countCode(codes3, 20, 20, 5, 5, 11, 11, 0);
  t('BLACK_QUANTIZED_TO_BLACK_CODE', blackCount3 === 36, 'black=' + blackCount3);

  // === 4. 缺失文件应触发 fallback 填充 ===
  var codes4 = makeCodes(20, 20, 1);
  var missingPath = path.join(tmpDir, 'does-not-exist.png');
  await img.rasterizeImage(missingPath, 0, 0, 8, 8, codes4, 20, 20, { fallbackCode: 0 });
  var fallbackCount = countCode(codes4, 20, 20, 0, 0, 8, 8, 0);
  t('MISSING_FILE_FALLBACK_FILLED', fallbackCount === 64, 'fallback=' + fallbackCount);

  // === 5. HTTP URL 应触发 fallback (不联网) ===
  var codes5 = makeCodes(20, 20, 1);
  await img.rasterizeImage('http://example.com/image.png', 0, 0, 6, 6, codes5, 20, 20, { fallbackCode: 0 });
  var urlFallbackCount = countCode(codes5, 20, 20, 0, 0, 6, 6, 0);
  t('HTTP_URL_FALLBACK_FILLED', urlFallbackCount === 36, 'fallback=' + urlFallbackCount);

  // === 6. 不合法路径应触发 fallback ===
  var codes6 = makeCodes(20, 20, 1);
  await img.rasterizeImage(null, 0, 0, 4, 4, codes6, 20, 20, { fallbackCode: 0 });
  var nullFallbackCount = countCode(codes6, 20, 20, 0, 0, 4, 4, 0);
  t('NULL_PATH_FALLBACK_FILLED', nullFallbackCount === 16, 'fallback=' + nullFallbackCount);

  // === 7. 错误的图片数据应触发 fallback ===
  var badPng = path.join(tmpDir, 'bad.png');
  fs.writeFileSync(badPng, Buffer.from('NOT_A_PNG_FILE_DATA', 'utf8'));
  var codes7 = makeCodes(20, 20, 1);
  await img.rasterizeImage(badPng, 0, 0, 5, 5, codes7, 20, 20, { fallbackCode: 0 });
  var badFallbackCount = countCode(codes7, 20, 20, 0, 0, 5, 5, 0);
  t('CORRUPT_FILE_FALLBACK_FILLED', badFallbackCount === 25, 'fallback=' + badFallbackCount);

  // === 8. 确定性:相同图片 + 相同位置应产生相同 codes ===
  var cA = makeCodes(20, 20, 1);
  var cB = makeCodes(20, 20, 1);
  await img.rasterizeImage(redPng, 0, 0, 8, 8, cA, 20, 20, { mode: 'contain' });
  await img.rasterizeImage(redPng, 0, 0, 8, 8, cB, 20, 20, { mode: 'contain' });
  var same = true;
  for (var i = 0; i < cA.length; i++) {
    if (cA[i] !== cB[i]) { same = false; break; }
  }
  t('DETERMINISTIC_SAME_IMAGE', same, '');

  // === 9. 'contain' 模式:小图保持比例,周围填充背景 ===
  // 8x8 红图缩放到 16x8 区域, 'inside' fit 应保持 8x8,居中
  var codes9 = makeCodes(40, 20, 1);
  await img.rasterizeImage(redPng, 0, 0, 16, 8, codes9, 40, 20, { mode: 'contain' });
  var redCount9 = countCode(codes9, 40, 20, 0, 0, 16, 8, 3);
  t('CONTAIN_PRESERVES_ASPECT', redCount9 === 64, 'red=' + redCount9);

  cleanup();
  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}

run().catch(function(e) {
  cleanup();
  console.log('CRASH: ' + e.message);
  console.log(e.stack);
  process.exit(1);
});
