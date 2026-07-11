#!/usr/bin/env node
// news-render-readability-test — deterministic production-path test
// Uses pre-populated last_good_news.json to avoid dependency on live news
var path = require('path');
var fs = require('fs');
var http = require('http');
var cp = require('child_process');
var crypto = require('crypto');
var sharp = require('sharp');
var ROOT = path.join(__dirname, '..');
var PORT = 8797;
var BASE = 'http://127.0.0.1:' + PORT;
var TMPDIR = path.join(ROOT, 'test_readability_' + Date.now());
var exitCode = 0, passed = 0, failed = 0;

function test(name, ok, detail) {
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ': ' + detail : ''));
  if (ok) passed++; else { failed++; exitCode = 1; }
}

function fetch(p, timeout) {
  return new Promise(function(resolve, reject) {
    var req = http.get(BASE + p, function(res) {
      var d = [];
      res.on('data', function(c) { d.push(c); });
      res.on('end', function() { resolve({ s: res.statusCode, b: Buffer.concat(d) }); });
    });
    req.on('error', reject);
    req.setTimeout(timeout || 15000, function() { req.destroy(); reject(new Error('timeout')); });
  });
}

function scanFrameCodes(buf) {
  var codes = {}, code4 = 0, unsupported = [];
  for (var i = 10; i < buf.length; i++) {
    var hi = (buf[i] >> 4) & 0x0F, lo = buf[i] & 0x0F;
    codes[hi] = (codes[hi]||0)+1; codes[lo] = (codes[lo]||0)+1;
    if (hi === 4) code4++; if (lo === 4) code4++;
    if (![0,1,2,3,5,6].includes(hi) && !unsupported.includes(hi)) unsupported.push(hi);
    if (![0,1,2,3,5,6].includes(lo) && !unsupported.includes(lo)) unsupported.push(lo);
  }
  return { codes: Object.keys(codes).map(Number).sort(), code4: code4, unsupported: unsupported.sort() };
}

// Fixed deterministic Chinese news items with summaries wrapping to 2–3 visible lines
var FIXED_NEWS_ITEMS = [
  { title: 'China Unveils New AI Policy Framework for 2026', originalTitle: 'China Unveils New AI Policy Framework for 2026', originalSummary: 'The Chinese government has released a comprehensive artificial intelligence policy framework aimed at balancing innovation with ethical safeguards across all sectors of the economy and society in the coming years.', zhTitle: '中国发布2026年人工智能政策新框架', zhSummary: '中国政府发布了一项全面的人工智能政策框架，旨在在未来几年内平衡各经济领域的创新与伦理保障，推动AI产业健康发展并建立完善的监管体系。', sourceUrl: 'https://example.com/news/1', source: '新华网', category: 'politics', publishedAt: new Date().toISOString(), translationStatus: 'cached' },
  { title: 'Global Trade Talks Resume Between Major Economies', originalTitle: 'Global Trade Talks Resume Between Major Economies', originalSummary: 'Trade negotiations between the world\'s largest economies have resumed after a brief pause, with both sides expressing cautious optimism about reaching a comprehensive agreement on tariff reduction and market access issues.', zhTitle: '全球主要经济体恢复贸易谈判', zhSummary: '全球最大经济体之间的贸易谈判在短暂暂停后恢复，双方对就关税减免和市场准入问题达成全面协议表示谨慎乐观，本轮谈判预计将持续数周。', sourceUrl: 'https://example.com/news/2', source: '新华社', category: 'economy', publishedAt: new Date().toISOString(), translationStatus: 'cached' },
  { title: 'Breakthrough in Quantum Computing Achieved by Research Team', originalTitle: 'Breakthrough in Quantum Computing Achieved by Research Team', originalSummary: 'A team of international researchers has achieved a major milestone in quantum computing, successfully demonstrating error correction at scale that paves the way for practical quantum computers within the next decade.', zhTitle: '研究团队在量子计算领域取得突破', zhSummary: '一个国际研究团队在量子计算领域取得重大突破，成功演示了大规模纠错技术，为未来十年内实现实用量子计算机铺平了道路，这一成果发表在顶级学术期刊上。', sourceUrl: 'https://example.com/news/3', source: '科技日报', category: 'technology', publishedAt: new Date().toISOString(), translationStatus: 'cached' },
  { title: 'New Museum of Modern Art Opens in Shanghai Exhibition', originalTitle: 'New Museum of Modern Art Opens in Shanghai Exhibition', originalSummary: 'Shanghai has inaugurated its newest cultural landmark with the opening of a cutting-edge museum of modern art featuring works from both established and emerging contemporary artists across Asia and the world.', zhTitle: '上海现代艺术博物馆新馆开幕', zhSummary: '上海最新文化地标——一座前沿现代艺术博物馆正式开幕，展出亚洲及全球知名与新锐当代艺术家的作品，首展吸引了数万名艺术爱好者前来参观。', sourceUrl: 'https://example.com/news/4', source: '人民日报', category: 'culture', publishedAt: new Date().toISOString(), translationStatus: 'cached' },
  { title: 'Renewable Energy Capacity Surpasses Coal Globally', originalTitle: 'Renewable Energy Capacity Surpasses Coal Globally', originalSummary: 'Global renewable energy capacity has officially surpassed coal for the first time in history, marking a significant turning point in the world\'s transition to clean energy sources according to the latest industry report.', zhTitle: '全球可再生能源装机容量首次超越煤炭', zhSummary: '根据最新行业报告，全球可再生能源装机容量有史以来首次正式超越煤炭，标志着世界向清洁能源转型的重要转折点，其中太阳能和风能贡献了最大增量。', sourceUrl: 'https://example.com/news/5', source: '中国能源报', category: 'economy', publishedAt: new Date().toISOString(), translationStatus: 'cached' },
  { title: 'New Education Reform Bill Passes National Congress', originalTitle: 'New Education Reform Bill Passes National Congress', originalSummary: 'The National Congress has passed a landmark education reform bill that introduces comprehensive changes to the curriculum, teacher training programs, and digital learning infrastructure across all grade levels nationwide.', zhTitle: '全国人大通过教育改革新法案', zhSummary: '全国人大通过了一项具有里程碑意义的教育改革法案，对全国各年级课程设置、教师培训计划和数字学习基础设施进行全面改革，旨在提升教育质量和公平性。', sourceUrl: 'https://example.com/news/6', source: '中国教育报', category: 'politics', publishedAt: new Date().toISOString(), translationStatus: 'cached' },
];

// Build news snapshot structure matching server.js buildNewsSnapshot output
var FIXED_NEWS = {
  translationProvider: 'none',
  translationNotice: '翻译未启用',
  updatedAt: new Date().toISOString(),
  items: FIXED_NEWS_ITEMS,
  frameId: 'news:' + crypto.createHash('sha1').update(FIXED_NEWS_ITEMS.map(function(it) { return it.url || it.sourceUrl; }).join('||')).digest('hex'),
  title: '测试新闻',
};

fs.mkdirSync(TMPDIR, { recursive: true });

// Write empty feeds file so server has no RSS sources
fs.writeFileSync(path.join(TMPDIR, 'empty_feeds.json'), '[]', 'utf8');

// Write pre-populated last_good_news.json for deterministic news fallback
fs.writeFileSync(path.join(TMPDIR, 'last_good_news.json'), JSON.stringify(FIXED_NEWS), 'utf8');

// Also write an empty data files for other required paths
fs.writeFileSync(path.join(TMPDIR, 'news_cache.json'), JSON.stringify({ version: 1, updatedAt: null, translations: {} }), 'utf8');
fs.writeFileSync(path.join(TMPDIR, 'news_rotation_state.json'), JSON.stringify({ slots: {}, shown: [] }), 'utf8');
fs.writeFileSync(path.join(TMPDIR, 'library_state.json'), JSON.stringify({}), 'utf8');
fs.writeFileSync(path.join(TMPDIR, 'image_index.json'), JSON.stringify([]), 'utf8');

var env = Object.assign({}, process.env, {
  PORT: String(PORT), TZ: 'Europe/Paris',
  TRANSLATION_PROVIDER: 'none',
  DATA_DIR: TMPDIR,
  FEEDS_FILE: path.join(TMPDIR, 'empty_feeds.json'),
});

var srv = cp.spawn(process.execPath, [path.join(ROOT, 'server.js')], { env: env, cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });

async function main() {
  await new Promise(function(resolve, reject) {
    var timer = setInterval(function() {
      http.get(BASE + '/api/state.json', function(res) {
        var d = [];
        res.on('data', function(c) { d.push(c); });
        res.on('end', function() { if (res.statusCode === 200) { clearInterval(timer); resolve(); } });
      }).on('error', function() {});
    }, 2000);
    setTimeout(function() { clearInterval(timer); srv.kill(); reject(new Error('timeout')); }, 60000);
  });
  console.log('--- server ready ---');

  try {
    // 1. Test API endpoints
    var nw = await fetch('/api/news.json', 60000);
    test('NEWS_HTTP_200', nw.s === 200, 'status=' + nw.s);
    var nj = JSON.parse(nw.b);
    test('NEWS_COUNT_6', nj.items && nj.items.length === 6, 'count=' + nj.items.length);

    // 2. Test frame via API (may be photo or news depending on time)
    var fb = await fetch('/api/frame.bin', 20000);
    test('FRAME_HTTP_200', fb.s === 200, 'status=' + fb.s);
    test('FRAME_BYTES_192010', fb.b.length === 192010, 'len=' + fb.b.length);
    test('EPF1_HEADER', fb.b.slice(0, 4).toString() === 'EPF1', 'magic=' + fb.b.slice(0, 4).toString());
    var fw = fb.b.readUInt16LE(4);
    var fh = fb.b.readUInt16LE(6);
    test('FRAME_DIMENSIONS', fw === 800 && fh === 480, fw + 'x' + fh);
    var scan = scanFrameCodes(fb.b);
    test('CODE4_ZERO', scan.code4 === 0, 'code4=' + scan.code4);
    test('UNSUPPORTED_EMPTY', scan.unsupported.length === 0, 'unsupported=' + JSON.stringify(scan.unsupported));
    test('VALID_CODES', scan.codes.length > 0, 'codes=' + JSON.stringify(scan.codes));

    // 3. Direct layout test using exported layoutNewsCard with fixed items
    var mod = require(path.join(ROOT, 'server.js'));
    var layoutNewsCard = mod.layoutNewsCard;
    var NEWS_LAYOUT = mod.NEWS_LAYOUT;
    var renderNewsSvg = mod.renderNewsSvg;

    if (!layoutNewsCard || !NEWS_LAYOUT) {
      test('LAYOUT_FN_MISSING', false, 'layoutNewsCard or NEWS_LAYOUT not exported');
    } else {
      var allOk = true;
      FIXED_NEWS_ITEMS.forEach(function(item, i) {
        var layout = layoutNewsCard(item, NEWS_LAYOUT);
        var visibleSummaryLines = layout.summaryLines.filter(function(line) { return String(line).trim().length > 0; });
        var ok = visibleSummaryLines.length >= 2 && visibleSummaryLines.length <= 3;
        if (!ok) allOk = false;
        test('CARD_' + (i+1) + '_VISIBLE_LINES=' + visibleSummaryLines.length, ok, 'visible=' + visibleSummaryLines.length + ' total=' + layout.summaryLines.length);
        test('CARD_' + (i+1) + '_TITLE_1LINE', layout.titleLines === 1, 'titleLines=' + layout.titleLines);
        test('CARD_' + (i+1) + '_NO_OVERFLOW', !layout.overflow, layout.overflow ? 'OVERFLOW' : 'ok');
      });
      test('ALL_2or3_VISIBLE_SUMMARY_LINES', allOk, '');
    }

    // 4. Render deterministic news frame and validate directly
    if (renderNewsSvg && layoutNewsCard) {
      var now = new Date();
      var svg = renderNewsSvg(FIXED_NEWS, now);
      test('SVG_RENDERED', !!svg && svg.length > 100, 'len=' + (svg ? svg.length : 0));

      var sharpResult = await sharp(Buffer.from(svg))
        .resize(800, 480, { fit: 'fill' })
        .flatten({ background: '#ffffff' })
        .raw()
        .toBuffer({ resolveWithObject: true });
      var mod2 = require(path.join(ROOT, 'src', 'epaper', 'image-frame'));
      var rawPayload = mod.imageToFrameBuffer(sharpResult.data, sharpResult.info.width, sharpResult.info.height, sharpResult.info.channels);
      var frame = mod2.buildFrameBuffer(rawPayload);
      test('RENDERED_FRAME_LEN', frame.length === 192010, 'len=' + frame.length);
      test('RENDERED_FRAME_MAGIC', frame.slice(0, 4).toString() === 'EPF1', 'magic=' + frame.slice(0, 4).toString());
      var rScan = scanFrameCodes(frame);
      test('RENDERED_CODE4_ZERO', rScan.code4 === 0, 'code4=' + rScan.code4);
      test('RENDERED_UNSUPPORTED_EMPTY', rScan.unsupported.length === 0, 'unsupported=' + JSON.stringify(rScan.unsupported));
    }

    // 5. Short summary negative test: genuinely short summary must remain 1 visible line
    if (layoutNewsCard) {
      var shortItem = { zhTitle: '短标题测试', zhSummary: '简短摘要' };
      var shortLayout = layoutNewsCard(shortItem, NEWS_LAYOUT);
      var shortVisible = shortLayout.summaryLines.filter(function(line) { return String(line).trim().length > 0; });
      test('SHORT_SUMMARY_VISIBLE_LINES', shortVisible.length === 1, 'visible=' + shortVisible.length + ' (not padded to 2)');
    }

  } catch(e) {
    test('TEST_FAIL', false, e.message);
  }

  srv.kill();
  setTimeout(function() {
    try { fs.rmdirSync(TMPDIR, { recursive: true }); } catch(e) {}
    console.log('\n=== Summary: ' + passed + ' passed, ' + failed + ' failed ===');
    process.exit(exitCode);
  }, 1000);
}

main().catch(function(e) { console.log('FATAL: ' + e.message); srv.kill(); process.exit(1); });
