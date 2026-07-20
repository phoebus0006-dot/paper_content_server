#!/usr/bin/env node
// text-rasterizer-test.js — 文字光栅化器单元测试
// 验证 renderText 把字符像素写入 codes 数组(特定像素的 code 值正确),
// wrapText 行为,以及 CJK 字符 fallback 占位方块。
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var tr = require(path.join(ROOT, 'src', 'render', 'text-rasterizer'));
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

// === FONT_5x7 完整性 ===
t('FONT_HAS_A', !!tr.FONT_5x7['A'] && tr.FONT_5x7['A'].length === 7, '');
t('FONT_HAS_Z', !!tr.FONT_5x7['Z'] && tr.FONT_5x7['Z'][0].length === 5, '');
t('FONT_HAS_0', !!tr.FONT_5x7['0'], '');
t('FONT_HAS_9', !!tr.FONT_5x7['9'], '');
t('FONT_HAS_SPACE', !!tr.FONT_5x7[' '], '');
t('FONT_HAS_DOT', !!tr.FONT_5x7['.'], '');
t('FONT_HAS_COMMA', !!tr.FONT_5x7[','], '');
t('FONT_HAS_DASH', !!tr.FONT_5x7['-'], '');
t('FONT_HAS_COLON', !!tr.FONT_5x7[':'], '');
t('FONT_HAS_QUOTE', !!tr.FONT_5x7["'"], '');
t('FONT_HAS_EXCLAIM', !!tr.FONT_5x7['!'], '');
t('FONT_HAS_QUESTION', !!tr.FONT_5x7['?'], '');
t('FONT_HAS_SLASH', !!tr.FONT_5x7['/'], '');

// 每个 glyph 必须 7 行 x 5 列且仅含 0/1
var allGlyphsValid = true;
Object.keys(tr.FONT_5x7).forEach(function(ch) {
  var g = tr.FONT_5x7[ch];
  if (!Array.isArray(g) || g.length !== 7) { allGlyphsValid = false; return; }
  for (var r = 0; r < 7; r++) {
    if (typeof g[r] !== 'string' || g[r].length !== 5) { allGlyphsValid = false; return; }
    for (var c = 0; c < 5; c++) {
      if (g[r][c] !== '0' && g[r][c] !== '1') { allGlyphsValid = false; return; }
    }
  }
});
t('FONT_ALL_GLYPHS_VALID', allGlyphsValid, '');

// === renderText 基本行为 ===
// 1. 单字符 'A' 在白底上绘制黑色,验证某些像素被改为黑色
var w = 100, h = 50;
var codes = makeCodes(w, h, 1);
var drawn = tr.renderText('A', 10, 10, codes, w, h, 0, { scale: 1 });
t('RENDER_RETURNS_LINES', typeof drawn === 'number' && drawn === 1, 'drawn=' + drawn);
// 'A' 字形里 row=0 是 '01110' → (12,10) 和 (13,10) 应为黑(code 0)
t('A_PIXEL_ROW0_LEFT', codes[10 * w + 12] === 0, '');
t('A_PIXEL_ROW0_RIGHT', codes[10 * w + 13] === 0, '');
t('A_PIXEL_ROW0_LEFT_OFF', codes[10 * w + 10] === 1, 'should remain background');
// 'A' row=3 是 '11111' → 5 个像素都应为黑
t('A_PIXEL_ROW3_FULL', codes[13 * w + 10] === 0 && codes[13 * w + 14] === 0, '');
// 计数: A 字形应当包含若干黑色像素
var blackCount = countCode(codes, w, h, 10, 10, 16, 17, 0);
t('A_BLACK_PIXEL_COUNT_GT0', blackCount > 0, 'black=' + blackCount);

// 2. scale=2 应该把每个 1 像素扩展为 2x2 方块
var codes2 = makeCodes(w, h, 1);
tr.renderText('I', 5, 5, codes2, w, h, 0, { scale: 2 });
// 'I' row=0 是 '01110' → col 1,2,3 为 1, 在 scale=2 下应该 (5+2,5)~(5+8,6) 是黑
t('I_SCALE2_ROW0', codes2[5 * w + 7] === 0 && codes2[5 * w + 8] === 0, '');
t('I_SCALE2_ROW0_Y1', codes2[6 * w + 7] === 0 && codes2[6 * w + 8] === 0, 'scale=2 should fill 2 rows');

// 3. 多行文本:长字符串应该换行
var codes3 = makeCodes(50, 200, 1);
var lines = tr.wrapText('ABCDEFGH', 24, 1);  // 每字符宽 6,24/6=4 字符每行
t('WRAP_LENGTH', lines.length === 2, 'lines=' + lines.length);
t('WRAP_LINE0', lines[0] === 'ABCD', 'line0=' + lines[0]);
t('WRAP_LINE1', lines[1] === 'EFGH', 'line1=' + lines[1]);

// 4. 空文本不画任何东西
var codes4 = makeCodes(50, 50, 1);
var drawnEmpty = tr.renderText('', 5, 5, codes4, 50, 50, 0);
t('EMPTY_RETURNS_0', drawnEmpty === 0, '');
var anyBlack = false;
for (var i = 0; i < codes4.length; i++) { if (codes4[i] === 0) { anyBlack = true; break; } }
t('EMPTY_NO_PIXELS', !anyBlack, '');

// 5. maxLines 截断与省略号
var codes5 = makeCodes(50, 200, 1);
var drawnTrunc = tr.renderText('AABBCCDDEEFFGGHHIIJJKKLLMMNNOOPP', 5, 5, codes5, 50, 200, 0, { scale: 1, maxWidth: 24, maxLines: 2 });
t('MAXLINES_RETURNS_2', drawnTrunc === 2, 'drawn=' + drawnTrunc);
// 第二行应包含 '.' (省略号)
// 在 y=5+8=13 行里查找 '.' 字形,row 5 是 '00100'
// 实际渲染包含 "...",但具体位置依赖 wrapText。这里只检查第二行有像素
var line2HasPixels = false;
for (var x = 0; x < 50; x++) {
  for (var y = 13; y < 20; y++) {
    if (codes5[y * 50 + x] === 0) { line2HasPixels = true; break; }
  }
  if (line2HasPixels) break;
}
t('MAXLINES_LINE2_HAS_PIXELS', line2HasPixels, '');

// === CJK fallback ===
// 6. CJK 字符应渲染为占位方块,而不是空白
var codes6 = makeCodes(50, 50, 1);
var beforeCJK = countCode(codes6, 50, 50, 5, 5, 11, 12, 0);
tr.renderText('中', 5, 5, codes6, 50, 50, 0, { scale: 1 });
var afterCJK = countCode(codes6, 50, 50, 5, 5, 11, 12, 0);
t('CJK_DRAWS_PLACEHOLDER', afterCJK > beforeCJK, 'before=' + beforeCJK + ' after=' + afterCJK);
// 占位方块应有外框(row 0 全黑)
t('CJK_PLACEHOLDER_BORDER_ROW0', codes6[5 * 50 + 5] === 0 && codes6[5 * 50 + 9] === 0, '');
// 占位方块应有外框(row 6 全黑)
t('CJK_PLACEHOLDER_BORDER_ROW6', codes6[11 * 50 + 5] === 0 && codes6[11 * 50 + 9] === 0, '');

// 7. 混合 ASCII + CJK 文本
var codes7 = makeCodes(100, 50, 1);
tr.renderText('A中B', 5, 5, codes7, 100, 50, 0, { scale: 1 });
// 第一个字符 A 在 x=5,col=0 处 'A'[0][0]='0' → 不画,但 'A'[0][1]='1' → 画在 x=6
t('MIXED_ASCII_A_PIXEL', codes7[5 * 100 + 6] === 0, '');
// CJK 在 x=11 处(row 0 col 0 → on),应该有黑像素
t('MIXED_CJK_PIXEL', codes7[5 * 100 + 11] === 0, '');

// 8. isCJKChar / isHighCodepoint
t('ISCJK_CHINESE', tr.isCJKChar('中') === true, '');
t('ISCJK_ASCII', tr.isCJKChar('A') === false, '');
t('ISHIGH_CHINESE', tr.isHighCodepoint('中') === true, '');
t('ISHIGH_ASCII', tr.isHighCodepoint('A') === false, '');

// 9. 边界检查:超出 canvas 不应崩溃
var codes9 = makeCodes(20, 20, 1);
try {
  tr.renderText('TEST', 18, 18, codes9, 20, 20, 0, { scale: 1 });
  t('CLIP_NO_CRASH', true, '');
} catch (e) {
  t('CLIP_NO_CRASH', false, e.message);
}

// 10. 重复调用确定性:相同输入应产生相同 codes
var cA = makeCodes(50, 50, 1);
var cB = makeCodes(50, 50, 1);
tr.renderText('HELLO', 5, 5, cA, 50, 50, 0, { scale: 1 });
tr.renderText('HELLO', 5, 5, cB, 50, 50, 0, { scale: 1 });
var samePixels = true;
for (var i = 0; i < cA.length; i++) {
  if (cA[i] !== cB[i]) { samePixels = false; break; }
}
t('DETERMINISTIC_SAME_INPUT', samePixels, '');

console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(ec);
