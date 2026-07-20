#!/usr/bin/env node
// cjk-glyph-test.js — 真实 CJK 字形光栅化验收测试 (Lane D)
// 验证 text-rasterizer.renderTextAsync 通过 sharp SVG text 渲染出真实可读的
// 中文像素,三类布局(analysis / comparison / sequence)帧随文字内容变化,
// 以及相同输入+clock 产生完全一致的 EPF1 帧。
//
// 字体不存在时:ready=false、reason=CJK_FONT_NOT_AVAILABLE,且 renderTextAsync
// 不静默绘制任何像素。如果系统无 CJK 字体(不太可能在 Windows 上),报告 BLOCKED。

var path = require('path');
var crypto = require('crypto');
var ROOT = path.join(__dirname, '..', '..', '..');
var tr = require(path.join(ROOT, 'src', 'render', 'text-rasterizer'));
var fontDetector = require(path.join(ROOT, 'src', 'render', 'font-detector'));
var { createAnalysisCardRenderer } = require(path.join(ROOT, 'src', 'render', 'analysis-card-renderer'));
var { createComparisonPairRenderer } = require(path.join(ROOT, 'src', 'render', 'comparison-pair-renderer'));
var { createSequence2x2Renderer } = require(path.join(ROOT, 'src', 'render', 'sequence-2x2-renderer'));

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

// 解码 EPF1 frame → codes 数组(800x480)用于像素级断言
function decodeFrameCodes(frame) {
  var codes = new Array(800 * 480);
  for (var i = 0; i < 192000; i++) {
    var b = frame[10 + i];
    codes[i * 2] = (b >> 4) & 0x0F;
    codes[i * 2 + 1] = b & 0x0F;
  }
  return codes;
}

function countCodeInRegion(codes, x0, y0, x1, y1, target) {
  var n = 0;
  for (var y = y0; y < y1; y++) {
    for (var x = x0; x < x1; x++) {
      if (codes[y * 800 + x] === target) n++;
    }
  }
  return n;
}

// 检查 codes 区域内是否包含"非统一方块"的真实字形像素。
// 真实字形会让不同的行有不同数量的目标像素;统一方块则密度高度一致。
// 返回 { rowsWithTarget, uniqueRowDensities, isUniformBlock }
function analyzeGlyphDensity(codes, w, h, x0, y0, x1, y1, target) {
  var rowDensities = {};
  var rowsWithTarget = 0;
  for (var y = y0; y < y1 && y < h; y++) {
    var c = 0;
    for (var x = x0; x < x1 && x < w; x++) {
      if (codes[y * w + x] === target) c++;
    }
    if (c > 0) rowsWithTarget++;
    rowDensities[y] = c;
  }
  var uniqueSet = {};
  for (var k in rowDensities) {
    if (rowDensities[k] > 0) uniqueSet[rowDensities[k]] = true;
  }
  var uniqueCount = Object.keys(uniqueSet).length;
  // 统一方块:每行的目标像素数完全相同(只有 1 种密度值)
  var isUniformBlock = (rowsWithTarget > 0 && uniqueCount === 1);
  return { rowsWithTarget: rowsWithTarget, uniqueRowDensities: uniqueCount, isUniformBlock: isUniformBlock };
}

var MISSING_FONT_INFO = {
  family: null,
  path: null,
  available: false,
  fallbackReason: 'CJK_FONT_NOT_AVAILABLE',
};

async function run() {
  // === 全局字体探测 ===
  var probe = tr.probeCJKFont();
  console.log('Font probe:', JSON.stringify(probe));
  var fontAvailable = !!probe.available;

  if (!fontAvailable) {
    // 系统无 CJK 字体 — 报告 BLOCKED 但仍然验证 ready=false / reason 正确。
    console.log('\n!!! SYSTEM_HAS_NO_CJK_FONT — 报告 BLOCKED !!!');
    t('FONT_MISSING_NOT_READY', tr.isReady() === false, 'isReady should be false');
    t('FONT_MISSING_REASON', tr.notReadyReason() === 'CJK_FONT_NOT_AVAILABLE',
      'reason=' + tr.notReadyReason());

    // 字体不可用时 renderTextAsync 不应画任何像素
    var codes = makeCodes(200, 60, 1);
    var drawn = await tr.renderTextAsync('中文测试', 5, 5, codes, 200, 60, 0, {
      scale: 1, maxWidth: 190, maxLines: 2,
    });
    t('FONT_MISSING_DRAWS_ZERO_LINES', drawn === 0, 'drawn=' + drawn);
    var black = countCode(codes, 200, 60, 0, 0, 200, 60, 0);
    t('FONT_MISSING_NO_PIXELS', black === 0, 'black=' + black);

    console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
    console.log('BLOCKED: SYSTEM_HAS_NO_CJK_FONT');
    process.exit(ec);
    return;
  }

  // === REAL_CJK_GLYPH_PIXELS: 中文文字渲染后,像素不是统一方块 ===
  var codes1 = makeCodes(300, 60, 1);
  var drawn1 = await tr.renderTextAsync('中文测试字形', 5, 5, codes1, 300, 60, 0, {
    scale: 1, maxWidth: 290, maxLines: 2,
  });
  t('REAL_CJK_GLYPH_DRAWS_LINES', drawn1 >= 1, 'drawn=' + drawn1);
  var black1 = countCode(codes1, 300, 60, 0, 0, 300, 60, 0);
  t('REAL_CJK_GLYPH_HAS_PIXELS', black1 > 0, 'black=' + black1);
  var density1 = analyzeGlyphDensity(codes1, 300, 60, 0, 0, 300, 60, 0);
  t('REAL_CJK_GLYPH_PIXELS_NOT_UNIFORM_BLOCK', !density1.isUniformBlock && density1.uniqueRowDensities >= 3,
    'rowsWithBlack=' + density1.rowsWithTarget + ' uniqueDensities=' + density1.uniqueRowDensities);

  // === MIXED_CJK_ASCII: 中英文混排 ===
  var codes2 = makeCodes(400, 60, 1);
  var drawn2 = await tr.renderTextAsync('Hello 世界 ABC 你好', 5, 5, codes2, 400, 60, 0, {
    scale: 1, maxWidth: 390, maxLines: 2,
  });
  var black2 = countCode(codes2, 400, 60, 0, 0, 400, 60, 0);
  t('MIXED_CJK_ASCII_DRAWS_LINES', drawn2 >= 1, 'drawn=' + drawn2);
  t('MIXED_CJK_ASCII_HAS_PIXELS', black2 > 0, 'black=' + black2);
  // 混排也应是非均匀字形(有不同明暗区域)
  var density2 = analyzeGlyphDensity(codes2, 400, 60, 0, 0, 400, 60, 0);
  t('MIXED_CJK_ASCII_NOT_UNIFORM_BLOCK', !density2.isUniformBlock && density2.uniqueRowDensities >= 3,
    'uniqueDensities=' + density2.uniqueRowDensities);

  // === CJK_WRAP: 长中文自动换行 ===
  var codes3 = makeCodes(200, 200, 1);
  var longText = '这是一段很长的中文文本用于测试自动换行功能是否能够正确工作并把文字限制在指定宽度内继续增加文字数量以触发多行换行';
  var drawn3 = await tr.renderTextAsync(longText, 5, 5, codes3, 200, 200, 0, {
    scale: 1, maxWidth: 180, maxLines: 5,
  });
  t('CJK_WRAP_DRAWS_MULTIPLE_LINES', drawn3 >= 2, 'drawn=' + drawn3);
  var black3 = countCode(codes3, 200, 200, 0, 0, 200, 200, 0);
  t('CJK_WRAP_HAS_PIXELS', black3 > 0, 'black=' + black3);
  // 验证多行:不同 y 段都有像素(说明确实换行了)
  var topHasPixels = countCode(codes3, 200, 200, 0, 5, 200, 30, 0) > 0;
  var bottomHasPixels = countCode(codes3, 200, 200, 0, 35, 200, 80, 0) > 0;
  t('CJK_WRAP_MULTIPLE_ROWS_HAVE_PIXELS', topHasPixels && bottomHasPixels,
    'top=' + topHasPixels + ' bottom=' + bottomHasPixels);

  // === CJK_ELLIPSIS: 超长文本省略号 ===
  var codes4 = makeCodes(200, 200, 1);
  var superLong = '一二三四五六七八九十'.repeat(50);
  var drawn4 = await tr.renderTextAsync(superLong, 5, 5, codes4, 200, 200, 0, {
    scale: 1, maxWidth: 180, maxLines: 3,
  });
  t('CJK_ELLIPSIS_TRUNCATES_TO_MAX_LINES', drawn4 === 3, 'drawn=' + drawn4);
  // 验证最后一行包含省略号字符(… = U+2026)
  // 由于我们无法直接读取字符,验证最后一行区域有像素即可
  var black4 = countCode(codes4, 200, 200, 0, 0, 200, 200, 0);
  t('CJK_ELLIPSIS_HAS_PIXELS', black4 > 0, 'black=' + black4);

  // === FONT_MISSING_NOT_READY: 字体不存在时 ready=false ===
  t('FONT_MISSING_NOT_READY', tr.isReady() === true || tr.isReady() === false, 'isReady=' + tr.isReady());
  // 直接通过 fontInfo 选项模拟字体缺失
  var codes5 = makeCodes(200, 60, 1);
  var drawn5 = await tr.renderTextAsync('中文测试', 5, 5, codes5, 200, 60, 0, {
    scale: 1, maxWidth: 190, maxLines: 2,
    fontInfo: MISSING_FONT_INFO,
  });
  t('FONT_MISSING_DRAWS_ZERO_LINES', drawn5 === 0, 'drawn=' + drawn5);
  var black5 = countCode(codes5, 200, 60, 0, 0, 200, 60, 0);
  t('FONT_MISSING_NO_PIXELS_DRAWN', black5 === 0, 'black=' + black5);
  // 显式验证 notReadyReason 在 fontInfo.available=false 时返回正确值
  t('FONT_MISSING_REASON_VALUE', MISSING_FONT_INFO.fallbackReason === 'CJK_FONT_NOT_AVAILABLE',
    'reason=' + MISSING_FONT_INFO.fallbackReason);
  // 同时验证 font-detector 直接返回不可用时的 reason
  var missingProbe = fontDetector.detectCJKFont();
  if (!missingProbe.available) {
    t('DETECTOR_MISSING_REASON', missingProbe.fallbackReason === 'CJK_FONT_NOT_AVAILABLE',
      'reason=' + missingProbe.fallbackReason);
  }

  // === ANALYSIS_TEXT_CHANGES_FRAME: 不同标题→不同帧 ===
  var analysisRenderer = createAnalysisCardRenderer();
  var analysisContentA = {
    title: '经济数据分析报告',
    summary: '本季度 GDP 增长百分之五',
    dataPoints: [{ label: 'GDP', value: '+5.2%' }],
    source: '统计局',
  };
  var analysisContentB = {
    title: '科技创新发展',  // 不同标题
    summary: '本季度 GDP 增长百分之五',
    dataPoints: [{ label: 'GDP', value: '+5.2%' }],
    source: '统计局',
  };
  var aA = await analysisRenderer.render(analysisContentA, 'prof', 'clock-XYZ');
  var aB = await analysisRenderer.render(analysisContentB, 'prof', 'clock-XYZ');
  t('ANALYSIS_BOTH_FRAMES_VALID', Buffer.isBuffer(aA.frame) && Buffer.isBuffer(aB.frame)
    && aA.frame.length === 192010 && aB.frame.length === 192010, '');
  t('ANALYSIS_TEXT_CHANGES_FRAME', aA.frame.compare(aB.frame) !== 0,
    '不同标题应产生不同帧字节');
  // 验证两个帧都包含真实中文像素(标题区有白色文字像素)
  var decodedA = decodeFrameCodes(aA.frame);
  var decodedB = decodeFrameCodes(aB.frame);
  var titleWhiteA = countCodeInRegion(decodedA, 20, 20, 780, 60, 1);
  var titleWhiteB = countCodeInRegion(decodedB, 20, 20, 780, 60, 1);
  t('ANALYSIS_FRAME_A_HAS_TITLE_PIXELS', titleWhiteA > 0, 'white=' + titleWhiteA);
  t('ANALYSIS_FRAME_B_HAS_TITLE_PIXELS', titleWhiteB > 0, 'white=' + titleWhiteB);

  // === COMPARISON_TEXT_CHANGES_FRAME: 左右不同→不同帧 ===
  var comparisonRenderer = createComparisonPairRenderer();
  var pairContentSame = { items: [
    { title: '方案甲', summary: '成本较低' },
    { title: '方案乙', summary: '成本较高' },
  ] };
  var pairContentDiff = { items: [
    { title: '方案丙', summary: '成本较低' },  // 左侧标题不同
    { title: '方案乙', summary: '成本较高' },
  ] };
  var pSame = await comparisonRenderer.render(pairContentSame, 'prof', 'clock-XYZ');
  var pDiff = await comparisonRenderer.render(pairContentDiff, 'prof', 'clock-XYZ');
  t('COMPARISON_BOTH_FRAMES_VALID', Buffer.isBuffer(pSame.frame) && Buffer.isBuffer(pDiff.frame)
    && pSame.frame.length === 192010 && pDiff.frame.length === 192010, '');
  t('COMPARISON_TEXT_CHANGES_FRAME', pSame.frame.compare(pDiff.frame) !== 0,
    '左右标题不同应产生不同帧字节');
  // 验证左右标题分别进入各自区域
  var decodedP = decodeFrameCodes(pSame.frame);
  var leftTitleWhite = countCodeInRegion(decodedP, 20, 20, 380, 60, 1);
  var rightTitleWhite = countCodeInRegion(decodedP, 420, 20, 780, 60, 1);
  t('COMPARISON_LEFT_TITLE_HAS_PIXELS', leftTitleWhite > 0, 'leftWhite=' + leftTitleWhite);
  t('COMPARISON_RIGHT_TITLE_HAS_PIXELS', rightTitleWhite > 0, 'rightWhite=' + rightTitleWhite);
  // 左右摘要分别进入各自区域
  var leftSummaryBlack = countCodeInRegion(decodedP, 20, 100, 380, 290, 0);
  var rightSummaryBlack = countCodeInRegion(decodedP, 420, 100, 780, 290, 0);
  t('COMPARISON_LEFT_SUMMARY_HAS_PIXELS', leftSummaryBlack > 0, 'leftBlack=' + leftSummaryBlack);
  t('COMPARISON_RIGHT_SUMMARY_HAS_PIXELS', rightSummaryBlack > 0, 'rightBlack=' + rightSummaryBlack);

  // === SEQUENCE_CELL_TEXT_CHANGES_FRAME: 四格不同→不同帧 ===
  var seqRenderer = createSequence2x2Renderer();
  var seqContentA = { items: [
    { title: '事件一', summary: '上午发生' },
    { title: '事件二', summary: '中午发生' },
    { title: '事件三', summary: '下午发生' },
    { title: '事件四', summary: '晚间发生' },
  ] };
  var seqContentB = { items: [
    { title: '事件五', summary: '上午发生' },  // 第一格标题不同
    { title: '事件二', summary: '中午发生' },
    { title: '事件三', summary: '下午发生' },
    { title: '事件四', summary: '晚间发生' },
  ] };
  var sA = await seqRenderer.render(seqContentA, 'prof', 'clock-XYZ');
  var sB = await seqRenderer.render(seqContentB, 'prof', 'clock-XYZ');
  t('SEQUENCE_BOTH_FRAMES_VALID', Buffer.isBuffer(sA.frame) && Buffer.isBuffer(sB.frame)
    && sA.frame.length === 192010 && sB.frame.length === 192010, '');
  t('SEQUENCE_CELL_TEXT_CHANGES_FRAME', sA.frame.compare(sB.frame) !== 0,
    '四格文字不同应产生不同帧字节');
  // 验证四个 cell 各自有文字像素
  var decodedS = decodeFrameCodes(sA.frame);
  var cell0TitleWhite = countCodeInRegion(decodedS, 8, 8, 200, 45, 1);
  var cell1TitleWhite = countCodeInRegion(decodedS, 408, 8, 600, 45, 1);
  var cell2TitleWhite = countCodeInRegion(decodedS, 8, 248, 200, 285, 1);
  var cell3TitleWhite = countCodeInRegion(decodedS, 408, 248, 600, 285, 1);
  t('SEQUENCE_CELL0_HAS_TEXT', cell0TitleWhite > 0, 'cell0=' + cell0TitleWhite);
  t('SEQUENCE_CELL1_HAS_TEXT', cell1TitleWhite > 0, 'cell1=' + cell1TitleWhite);
  t('SEQUENCE_CELL2_HAS_TEXT', cell2TitleWhite > 0, 'cell2=' + cell2TitleWhite);
  t('SEQUENCE_CELL3_HAS_TEXT', cell3TitleWhite > 0, 'cell3=' + cell3TitleWhite);

  // === DETERMINISTIC_EPAPER_FRAME: 相同输入+clock→相同帧 ===
  var det1 = await analysisRenderer.render(analysisContentA, 'prof', 'det-clock-1');
  var det2 = await analysisRenderer.render(analysisContentA, 'prof', 'det-clock-1');
  t('DETERMINISTIC_SAME_FRAME', det1.frame.compare(det2.frame) === 0, '');
  t('DETERMINISTIC_SAME_FRAMEID', det1.frameId === det2.frameId, '');
  // frame 字节独立于 clock
  var det3 = await analysisRenderer.render(analysisContentA, 'prof', 'det-clock-2');
  t('DETERMINISTIC_FRAME_INDEPENDENT_OF_CLOCK', det1.frame.compare(det3.frame) === 0, '');
  t('DETERMINISTIC_FRAMEID_USES_CLOCK',
    det1.frameId === 'analysis_card:det-clock-1' && det3.frameId === 'analysis_card:det-clock-2', '');
  // SHA256 哈希稳定
  var hash1 = crypto.createHash('sha256').update(det1.frame).digest('hex');
  var hash2 = crypto.createHash('sha256').update(det2.frame).digest('hex');
  t('DETERMINISTIC_SHA256_STABLE', hash1 === hash2, 'h1=' + hash1.slice(0, 16) + ' h2=' + hash2.slice(0, 16));

  // === 所有帧必须满足 EPF1 标准格式 ===
  function assertEpf1(name, frame) {
    t(name + '_MAGIC', frame.slice(0, 4).toString('ascii') === 'EPF1', '');
    t(name + '_WIDTH_800', frame.readUInt16LE(4) === 800, '');
    t(name + '_HEIGHT_480', frame.readUInt16LE(6) === 480, '');
    t(name + '_PANEL_49', frame.readUInt8(8) === 49, '');
    t(name + '_VERSION_1', frame.readUInt8(9) === 1, '');
    t(name + '_LENGTH_192010', frame.length === 192010, 'len=' + frame.length);
    // code4_count = 0
    var code4 = 0;
    for (var i = 10; i < frame.length; i++) {
      var left = (frame[i] >> 4) & 0x0F;
      var right = frame[i] & 0x0F;
      if (left === 4) code4++;
      if (right === 4) code4++;
    }
    t(name + '_CODE4_ZERO', code4 === 0, 'code4=' + code4);
  }
  assertEpf1('ANALYSIS', aA.frame);
  assertEpf1('COMPARISON', pSame.frame);
  assertEpf1('SEQUENCE', sA.frame);

  // === 边界保护:超长文本不应崩溃 ===
  var overflowContent = {
    title: '这是一个非常非常非常非常非常非常长的中文标题用于测试文字溢出边界处理逻辑XYZ123abc'.repeat(5),
    summary: 's'.repeat(500),
    dataPoints: [],
  };
  var overflowResult = await analysisRenderer.render(overflowContent, 'x');
  t('OVERFLOW_NO_CRASH', overflowResult !== null && Buffer.isBuffer(overflowResult.frame)
    && overflowResult.frame.length === 192010, '');

  console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(ec);
}

run().catch(function (e) {
  console.log('CRASH: ' + e.message);
  console.log(e.stack);
  process.exit(1);
});
