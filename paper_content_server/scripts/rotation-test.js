#!/usr/bin/env node
// rotation-test — production-level rotation + last-known-good A/B/C verification

var path = require('path');
var http = require('http');
var fs = require('fs');
var crypto = require('crypto');
var ROOT = path.join(__dirname, '..');
var PORT = 8797;
var BASE = 'http://127.0.0.1:' + PORT;
var exitCode = 0;
var passed = 0, failed = 0;

function test(name, ok, detail) {
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ': ' + detail : ''));
  if (ok) passed++; else { failed++; exitCode = 1; }
}

function sha256(b) { return crypto.createHash('sha256').update(b).digest('hex'); }

function fetchUrl(p, timeout) {
  return new Promise(function(resolve, reject) {
    var req = http.get(BASE + p, function(res) {
      var d = [];
      res.on('data', function(c) { d.push(c); });
      res.on('end', function() { resolve({ s: res.statusCode, b: Buffer.concat(d), h: res.headers }); });
    });
    req.on('error', function(e) { reject(e); });
    req.setTimeout(timeout || 10000, function() { req.destroy(); reject(new Error('timeout')); });
  });
}

function scanFrameCodes(buf) {
  var codes = {};
  var unsupported = [];
  var code4 = 0;
  for (var i = 10; i < buf.length; i++) {
    var hi = (buf[i] >> 4) & 0x0F;
    var lo = buf[i] & 0x0F;
    codes[hi] = (codes[hi] || 0) + 1;
    codes[lo] = (codes[lo] || 0) + 1;
    if (hi === 4) code4++;
    if (lo === 4) code4++;
    if (![0,1,2,3,5,6].includes(hi) && !unsupported.includes(hi)) unsupported.push(hi);
    if (![0,1,2,3,5,6].includes(lo) && !unsupported.includes(lo)) unsupported.push(lo);
  }
  return { codes: Object.keys(codes).map(Number).sort(function(a,b){return a-b}), code4: code4, unsupported: unsupported.sort(function(a,b){return a-b}) };
}

// ===== HELPERS =====

function startJsonFeedServer(port, routes) {
  // routes: { '/path': [items] } — respond with different items per path
  return new Promise(function(resolve) {
    var srv = http.createServer(function(req, res) {
      var items = routes[req.url] || [];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ items: items }));
    });
    srv.listen(port, function() { resolve(srv); });
  });
}

function startHttpErrorServer(port, status) {
  return new Promise(function(resolve) {
    var srv = http.createServer(function(req, res) {
      if (status === 'timeout') { return; }
      res.writeHead(status || 500);
      res.end('error');
    });
    srv.listen(port, function() { resolve(srv); });
  });
}

function makeNewsItem(i, src) {
  var cats = ['technology','politics','economy','culture'];
  var pad = 'x'.repeat(45);
  return {
    title: 'Item' + i,
    description: 'Summary ' + i + ' ' + pad,
    url: 'http://test-' + i + '.com/news/' + i,
    category: cats[(i - 1) % cats.length],
    publishedAt: new Date().toISOString(),
    language: 'zh',
  };
}

// ===== SETUP: isolated TMPDIR =====
var TMPDIR = path.join(ROOT, 'test_rotation_data_' + Date.now());

function cleanUp() {
  try { fs.rmdirSync(TMPDIR, { recursive: true }); } catch(e) {}
}

function createTestIndex(mode) {
  var entries = [];
  if (mode === 'mixed') {
    entries.push({ id:'study-a', url:'builtin://a', title:'Study A', source:'Test', theme:'dialogue', kind:'storyboard', processedPngPath: path.join(ROOT,'data','processed_images','c7a7d3bc2f605fb97c4f6996287b3b4e212f8038.png'), epfPath:'a.epf', width:800, height:480, imageName:'a.png', createdAt:new Date().toISOString(), lastShownAt:null, shownCount:0, safetyStatus:'approved', poolType:'study_frames', hash:'aaa' });
    entries.push({ id:'study-b', url:'builtin://b', title:'Study B', source:'Test', theme:'wide_shot', kind:'storyboard', processedPngPath: path.join(ROOT,'data','processed_images','c7a7d3bc2f605fb97c4f6996287b3b4e212f8038.png'), epfPath:'b.epf', width:800, height:480, imageName:'b.png', createdAt:new Date().toISOString(), lastShownAt:null, shownCount:0, safetyStatus:'approved', poolType:'study_frames', hash:'bbb' });
    entries.push({ id:'study-c', url:'builtin://c', title:'Study C', source:'Test', theme:'night', kind:'storyboard', processedPngPath: path.join(ROOT,'data','processed_images','c7a7d3bc2f605fb97c4f6996287b3b4e212f8038.png'), epfPath:'c.epf', width:800, height:480, imageName:'c.png', createdAt:new Date().toISOString(), lastShownAt:null, shownCount:0, safetyStatus:'approved', poolType:'study_frames', hash:'ccc' });
    entries.push({ id:'deco-d', url:'builtin://d', title:'Deco D', source:'Test', theme:'cinematic', kind:'shot', processedPngPath: path.join(ROOT,'data','processed_images','c7a7d3bc2f605fb97c4f6996287b3b4e212f8038.png'), epfPath:'d.epf', width:800, height:480, imageName:'d.png', createdAt:new Date().toISOString(), lastShownAt:null, shownCount:0, safetyStatus:'approved', poolType:'decorative_photos', hash:'ddd' });
    entries.push({ id:'pending-e', url:'builtin://e', title:'Pending E', source:'Test', theme:'entrance', kind:'storyboard', processedPngPath: path.join(ROOT,'data','processed_images','c7a7d3bc2f605fb97c4f6996287b3b4e212f8038.png'), epfPath:'e.epf', width:800, height:480, imageName:'e.png', createdAt:new Date().toISOString(), lastShownAt:null, shownCount:0, safetyStatus:'pending', poolType:'study_frames', hash:'eee' });
    entries.push({ id:'rejected-f', url:'builtin://f', title:'Rejected F', source:'Test', theme:'ensemble', kind:'storyboard', processedPngPath: path.join(ROOT,'data','processed_images','c7a7d3bc2f605fb97c4f6996287b3b4e212f8038.png'), epfPath:'f.epf', width:800, height:480, imageName:'f.png', createdAt:new Date().toISOString(), lastShownAt:null, shownCount:0, safetyStatus:'rejected', poolType:'study_frames', hash:'fff' });
    entries.push({ id:'nostatus-g', url:'builtin://g', title:'No Status G', source:'Test', theme:'color', kind:'shot', processedPngPath: path.join(ROOT,'data','processed_images','c7a7d3bc2f605fb97c4f6996287b3b4e212f8038.png'), epfPath:'g.epf', width:800, height:480, imageName:'g.png', createdAt:new Date().toISOString(), lastShownAt:null, shownCount:0, safetyStatus:'', poolType:'study_frames', hash:'ggg' });
  }
  return entries;
}

async function main() {
  console.log('=== Rotation + Last-Known-Good A/B/C Test ===\n');
  cleanUp();
  fs.mkdirSync(TMPDIR, { recursive: true });

  function makeEnv(ind, extra) {
    var env = Object.assign({}, process.env, {
      PORT: String(PORT), TZ: 'Europe/Paris', TRANSLATION_PROVIDER: 'none',
      PHOTO_QUANT_MODE: 'clean', ENABLE_DEBUG_ROUTES: 'true',
      DATA_DIR: TMPDIR, FEEDS_FILE: path.join(TMPDIR, 'feeds.json'),
      IMAGE_INDEX_FILE: path.join(TMPDIR, 'image_index.json'),
      NEWS_CACHE_FILE: path.join(TMPDIR, 'news_cache.json'),
      LIBRARY_STATE_FILE: path.join(TMPDIR, 'library_state.json'),
      NEWS_ROTATION_FILE: path.join(TMPDIR, 'news_rotation_state.json'),
      LAST_GOOD_NEWS_FILE: path.join(TMPDIR, 'last_good_news.json'),
      FALLBACK_STUDY_DIR: path.join(TMPDIR, 'fallback_study'),
      TEST_INSTANCE_ID: 'rotation_' + ind,
    });
    if (extra) Object.assign(env, extra);
    return env;
  }

  function startServer(ind, extraEnv) {
    return new Promise(function(resolve, reject) {
      var env = makeEnv(ind, extraEnv);
      var server = require('child_process').spawn(process.execPath, [path.join(ROOT, 'server.js')], { env: env, cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
      var started = false;
      var timer = setInterval(function() {
        var req = http.get(BASE + '/api/state.json', function(res) {
          var d = [];
          res.on('data', function(c) { d.push(c); });
          res.on('end', function() {
            if (res.statusCode === 200) { started = true; clearInterval(timer); resolve({ server: server }); }
          });
        });
        req.on('error', function() {});
        req.setTimeout(3000, function() { req.destroy(); });
      }, 2000);
      setTimeout(function() { if (!started) { clearInterval(timer); server.kill(); reject(new Error('server timeout')); } }, 60000);
    });
  }

  function stopServer(s) {
    return new Promise(function(resolve) {
      if (!s) { resolve(); return; }
      s.server.on('exit', function() { resolve(); });
      s.server.kill();
      setTimeout(function() { resolve(); }, 1000);
    });
  }

  // ===== PART A: PHOTO SELECTOR UNIT TEST =====
  console.log('\n--- PART A: Photo Selector Unit ---');
  var mod = require(path.join(ROOT, 'server.js'));

  // A1: Empty pool — only decorative/pending/rejected, no approved study frames
  var emptyIdx = createTestIndex('empty');
  var slots = ['2026-07-10T10:00:00Z','2026-07-10T11:00:00Z','2026-07-10T12:00:00Z','2026-07-10T13:00:00Z','2026-07-10T14:00:00Z','2026-07-10T15:00:00Z'];
  var emptyResults = slots.map(function(s) {
    var r = mod.selectStudyPhoto(new Date(s), emptyIdx, { themeCursor:0, currentTheme:null, currentImageIndex:0, remainingThemeSlots:1, lastSlotKey:null, lastSwitchDate:null, patternIndex:0, currentKind:null });
    return { entry: r.entry, theme: r.theme };
  });
  test('EMPTY_POOL_6_SLOTS_NO_STUDY_FRAMES', emptyResults.every(function(r) { return !r.entry && r.theme === 'NO_STUDY_FRAMES'; }), 'all NO_STUDY_FRAMES');

  // A2: Mixed pool (3 approved+study, 1 decorative, 1 pending, 1 rejected, 1 missing status)
  var mixedIdx = createTestIndex('mixed');
  var mixedResults = slots.map(function(s, si) {
    var r = mod.selectStudyPhoto(new Date(s), mixedIdx, { themeCursor: si, currentTheme: null, currentImageIndex: 0, remainingThemeSlots: 1, lastSlotKey: null, lastSwitchDate: null, patternIndex: si % 6, currentKind: null });
    return { entry: r.entry, theme: r.theme };
  });
  var nonApproved = mixedResults.filter(function(r) { return r.entry && r.entry.safetyStatus !== 'approved'; }).length;
  var decorative = mixedResults.filter(function(r) { return r.entry && r.entry.poolType === 'decorative_photos'; }).length;
  var noStatus = mixedResults.filter(function(r) { return r.entry && !r.entry.safetyStatus; }).length;
  var uniqueStudy = new Set(mixedResults.filter(function(r) { return r.entry && r.entry.poolType === 'study_frames'; }).map(function(r) { return r.entry.id; }));
  test('MIXED_NON_APPROVED_ZERO', nonApproved === 0, 'got ' + nonApproved);
  test('MIXED_DECORATIVE_ZERO', decorative === 0, 'got ' + decorative);
  test('MIXED_MISSING_STATUS_ZERO', noStatus === 0, 'got ' + noStatus);
  test('MIXED_UNIQUE_STUDY_IDS_GE2', uniqueStudy.size >= 2, 'ids=' + Array.from(uniqueStudy).join(','));

  // ===== PART B: PHOTO ROTATION HTTP TEST =====
  console.log('\n--- PART B: Photo Rotation HTTP ---');
  fs.writeFileSync(path.join(TMPDIR, 'image_index.json'), JSON.stringify([], null, 2));
  // Create a fallback study dir needed by the server
  try { fs.mkdirSync(path.join(TMPDIR, 'fallback_study')); } catch(e) {}

  var srv1 = await startServer('http_photo');
  console.log('  server ready');

  var httpOk = true;
  for (var si = 0; si < 3; si++) {
    try {
      var st = await fetchUrl('/api/state.json', 10000);
      if (st.s !== 200) { test('STATE_' + si + '_200', false, 'status=' + st.s); httpOk = false; break; }
      var sj = JSON.parse(st.b.toString());
      test('STATE_' + si + '_VALID', sj.panelIndex && sj.mode, 'mode=' + sj.mode + ' panel=' + sj.panelIndex);

      var fb = await fetchUrl('/api/frame.bin', 15000);
      if (fb.s !== 200) { test('FRAME_' + si + '_200', false, 'status=' + fb.s); httpOk = false; break; }
      if (fb.b.length !== 192010) { test('FRAME_' + si + '_SIZE', false, 'len=' + fb.b.length); httpOk = false; break; }
      var scan = scanFrameCodes(fb.b);
      test('FRAME_' + si + '_CODES', scan.code4 === 0 && scan.unsupported.length === 0, 'code4=' + scan.code4 + ' unsupported=' + JSON.stringify(scan.unsupported));
      if (scan.code4 !== 0 || scan.unsupported.length > 0) { httpOk = false; break; }
    } catch(e) {
      test('REQ_' + si, false, e.message);
      httpOk = false;
      break;
    }
  }
  await stopServer(srv1);

  // ===== PART C: NEWS LAST-KNOWN-GOOD A/B/C =====
  console.log('\n--- PART C: News Last-Known-Good A/B/C ---');

  var feedServerPort = 8989;
  var feedSrv;

  // Phase A — feed server returns 6 valid items across 3 sources (max 2 per source)
  var feedRoutesA = {};
  var feedEntriesA = [];
  var srcNames = ['NewsA', 'NewsB', 'NewsC'];
  srcNames.forEach(function(src, si) {
    var path = '/feed' + si;
    var items = [makeNewsItem(si * 2 + 1, src), makeNewsItem(si * 2 + 2, src)];
    feedRoutesA[path] = items;
    feedEntriesA.push({ id: 'feed-' + src, source: src, country: 'China', category: 'technology', language: 'zh', url: 'http://127.0.0.1:' + feedServerPort + path, weight: 100 });
  });
  var feedsAData = { feeds: feedEntriesA };
  feedSrv = await startJsonFeedServer(feedServerPort, feedRoutesA);
  fs.writeFileSync(path.join(TMPDIR, 'feeds.json'), JSON.stringify(feedsAData, null, 2));

  var srv2 = await startServer('news_phase_a');
  console.log('  Phase A server ready');

  try {
    var newsA = await fetchUrl('/api/news.json', 60000);
    test('PHASE_A_NEWS_200', newsA.s === 200, 'status=' + newsA.s);
    var newsAj = JSON.parse(newsA.b.toString());
    test('PHASE_A_NEWS_COUNT_6', newsAj.items && newsAj.items.length === 6, 'count=' + (newsAj.items ? newsAj.items.length : 0));
  } catch(e) {
    test('PHASE_A_NEWS_FETCH', false, e.message);
  }

  // Check last_good_news.json was saved
  var lastGoodHashA = '';
  try {
    var lgf = JSON.parse(fs.readFileSync(path.join(TMPDIR, 'last_good_news.json'), 'utf8'));
    lastGoodHashA = sha256(JSON.stringify(lgf.items));
    test('PHASE_A_LAST_GOOD_EXISTS', lgf.items && lgf.items.length === 6, 'len=' + (lgf.items ? lgf.items.length : 0));
  } catch(e) {
    test('PHASE_A_LAST_GOOD_FILE', false, e.message);
  }
  await stopServer(srv2);

  // Phase B — feed server returns empty results (HTTP 200 but no items)
  feedSrv.close();
  feedSrv = await startJsonFeedServer(feedServerPort, { '/any': [] });
  var feedsB = { feeds: [ { id:'empty-feed', source:'DeadSource', country:'China', category:'technology', language:'zh', url:'http://127.0.0.1:' + feedServerPort + '/any', weight:100 } ] };
  fs.writeFileSync(path.join(TMPDIR, 'feeds.json'), JSON.stringify(feedsB, null, 2));

  var srv3 = await startServer('news_phase_b');
  console.log('  Phase B server ready');

  try {
    var newsB = await fetchUrl('/api/news.json', 60000);
    test('PHASE_B_NEWS_200', newsB.s === 200, 'status=' + newsB.s);
    var newsBj = JSON.parse(newsB.b.toString());
    test('PHASE_B_NEWS_COUNT_6', newsBj.items && newsBj.items.length === 6, 'count=' + (newsBj.items ? newsBj.items.length : 0));
    // Verify Phase B uses last-good from Phase A (compare just items, not wrapper fields)
    var itemsA = JSON.stringify(newsAj.items);
    var itemsB = JSON.stringify(newsBj.items);
    test('PHASE_B_USES_LAST_GOOD', lastGoodHashA && itemsB === itemsA, 'items_match=' + (itemsB === itemsA));
  } catch(e) {
    test('PHASE_B_NEWS_FETCH', false, e.message);
  }

  // Phase C — last_good_news.json unchanged (not overwritten by empty data)
  try {
    var lgfC = JSON.parse(fs.readFileSync(path.join(TMPDIR, 'last_good_news.json'), 'utf8'));
    var hashC = sha256(JSON.stringify(lgfC.items));
    test('PHASE_C_LAST_GOOD_UNCHANGED', hashC === lastGoodHashA, 'hash_match=' + (hashC === lastGoodHashA));
  } catch(e) {
    test('PHASE_C_LAST_GOOD_FILE', false, e.message);
  }
  await stopServer(srv3);
  feedSrv.close();

  // ===== PART D: FRAME CODE 4 SCAN =====
  console.log('\n--- PART D: Frame Code 4 Validation ---');
  fs.writeFileSync(path.join(TMPDIR, 'feeds.json'), JSON.stringify(feedsAData, null, 2));
  var srv4 = await startServer('frame_scan');
  console.log('  server ready');
  try {
    var fb4 = await fetchUrl('/api/frame.bin', 15000);
    test('FRAME_SCAN_200', fb4.s === 200, 'status=' + fb4.s);
    test('FRAME_SCAN_BYTES', fb4.b.length === 192010, 'len=' + fb4.b.length);
    var scan4 = scanFrameCodes(fb4.b);
    test('FRAME_SCAN_CODE4_ZERO', scan4.code4 === 0, 'code4=' + scan4.code4);
    test('FRAME_SCAN_UNSUPPORTED_EMPTY', scan4.unsupported.length === 0, 'unsupported=' + JSON.stringify(scan4.unsupported));
    test('FRAME_SCAN_CODES_VALID', scan4.codes.every(function(c) { return [0,1,2,3,5,6].includes(c); }), 'codes=' + JSON.stringify(scan4.codes));
  } catch(e) {
    test('FRAME_SCAN_FETCH', false, e.message);
  }
  await stopServer(srv4);

  // ===== SUMMARY =====
  console.log('\n=== Summary: ' + passed + ' passed, ' + failed + ' failed ===');
  cleanUp();
  process.exit(exitCode);
}

main().catch(function(e) {
  console.log('FATAL: ' + e.message);
  cleanUp();
  process.exit(1);
});
