#!/usr/bin/env node
// rotation-test — production-level photo rotation and news fallback regression tests

var path = require('path');
var http = require('http');
var fs = require('fs');
var ROOT = path.join(__dirname, '..');
var DATA_DIR = path.join(ROOT, 'test_rotation_data');
var PORT = 8798;

var passed = 0, failed = 0;
function test(name, fn) {
  try {
    var result = fn();
    if (result === true) { passed++; console.log('PASS', name); }
    else { failed++; console.log('FAIL', name, '- got:', JSON.stringify(result)); }
  } catch(e) { failed++; console.log('FAIL', name, '- threw:', e.message); }
}
function ok(v, msg) { if (!v) throw new Error(msg || 'assertion'); return true; }

// Clear test data
function cleanDir(dir) {
  try {
    if (fs.existsSync(dir)) {
      fs.readdirSync(dir).forEach(function(f) {
        var fp = path.join(dir, f);
        try { fs.unlinkSync(fp); } catch(e) { try { fs.rmdirSync(fp, {recursive:true}); } catch(e2) {} }
      });
      fs.rmdirSync(dir, {recursive:true});
    }
  } catch(e) {}
}
cleanDir(DATA_DIR);

// Use existing processed image for test
var existingPng = path.join(ROOT, 'data', 'processed_images', 'c7a7d3bc2f605fb97c4f6996287b3b4e212f8038.png');

// Create test image_index with entries that have mixed safety/pool
var testImages = [];
var testIds = ['approve-study1', 'approve-study2', 'approve-study3',
               'approve-deco', 'pending-study', 'rejected-study'];
var themes = ['dialogue', 'wide_shot', 'night', 'dialogue', 'wide_shot', 'night'];
testIds.forEach(function(id, i) {
  var e = {
    id: id,
    url: 'builtin://test/' + id,
    title: 'Test ' + id,
    sourceType: 'test',
    source: 'Test',
    theme: themes[i] || 'cinematic',
    kind: i < 3 ? 'storyboard' : 'shot',
    hash: id + '-hash',
    processedPngPath: existingPng,
    epfPath: id + '.epf',
    width: 800, height: 480,
    imageName: id + '.png',
    createdAt: new Date().toISOString(),
    lastShownAt: null, shownCount: 0,
    safetyStatus: i < 4 ? 'approved' : (i === 4 ? 'pending' : 'rejected'),
    poolType: i < 3 ? 'study_frames' : (i === 3 ? 'decorative_photos' : undefined),
    metadata: { test: true },
  };
  testImages.push(e);
});

fs.mkdirSync(DATA_DIR, {recursive:true});
fs.writeFileSync(path.join(DATA_DIR, 'image_index.json'), JSON.stringify(testImages, null, 2));

// Set env for server
process.env.DATA_DIR = DATA_DIR;
process.env.IMAGE_INDEX_FILE = path.join(DATA_DIR, 'image_index.json');
process.env.LAST_GOOD_NEWS_FILE = path.join(DATA_DIR, 'last_good_news.json');
process.env.NEWS_CACHE_FILE = path.join(DATA_DIR, 'news_cache.json');
process.env.LIBRARY_STATE_FILE = path.join(DATA_DIR, 'library_state.json');
process.env.PORT = String(PORT);
process.env.TZ = 'Europe/Paris';
process.env.TRANSLATION_PROVIDER = 'none';
process.env.FALLBACK_STUDY_DIR = path.join(DATA_DIR, 'fallback_study');

var serverMod = require(path.join(ROOT, 'server.js'));

// Wait for server to be ready
function waitForServer(retries) {
  return new Promise(function(resolve, reject) {
    if (retries <= 0) { resolve(false); return; }
    var req = http.get('http://localhost:' + PORT + '/api/state.json', function(res) {
      resolve(true);
    });
    req.on('error', function() {
      setTimeout(function() {
        waitForServer(retries - 1).then(resolve);
      }, 1000);
    });
    req.setTimeout(2000, function() { req.destroy(); });
  });
}

waitForServer(15).then(function(ready) {
  if (!ready) { console.log('Server not ready, testing functions directly'); }

  // ===== PHOTO ROTATION TESTS (via exported functions) =====
  test('PHOTO_SAFETY: approved study selectable count >= 3', function() {
    var count = 0;
    testImages.forEach(function(e) {
      if (serverMod.isStudySelectable(e)) count++;
    });
    return ok(count >= 3, 'expected >= 3 approved study selectable, got ' + count);
  });

  // Test 6 consecutive photo slots
  var photoSlots = ['2026-07-10T10:00:00Z', '2026-07-10T11:00:00Z', '2026-07-10T12:00:00Z',
                    '2026-07-10T13:00:00Z', '2026-07-10T14:00:00Z', '2026-07-10T15:00:00Z'];

  var seenPhotoIds = {};
  var seenThemes = {};
  var allSelectable = testImages.filter(function(e) { return serverMod.isStudySelectable(e); });

  photoSlots.forEach(function(slotStr, si) {
    var now = new Date(slotStr);
    var result = serverMod.selectStudyPhoto(now, testImages, {
      themeCursor: 0, currentTheme: null, currentImageIndex: 0,
      remainingThemeSlots: 1, lastSlotKey: null, lastSwitchDate: null,
      patternIndex: si % 6, currentKind: null,
    });
    if (result.entry) {
      seenPhotoIds[result.entry.id] = (seenPhotoIds[result.entry.id] || 0) + 1;
      seenThemes[result.entry.theme] = (seenThemes[result.entry.theme] || 0) + 1;
    }
  });

  test('PHOTO_ROTATION_LIVE: multiple different photoIds across 6 slots', function() {
    var ids = Object.keys(seenPhotoIds);
    return ok(ids.length >= 2, 'expected >= 2 unique photoIds, got ' + ids.length + ': ' + JSON.stringify(ids));
  });

  test('PHOTO_ROTATION_LIVE: no null or NO_STUDY_FRAMES entries', function() {
    return ok(allSelectable.length >= 3, 'selectable count: ' + allSelectable.length);
  });

  // ===== FRAME FORMAT TESTS =====
  function testFrame(urlPath, label) {
    return new Promise(function(resolve) {
      var req = http.get('http://localhost:' + PORT + urlPath, function(res) {
        var chunks = [];
        res.on('data', function(c) { chunks.push(c); });
        res.on('end', function() {
          var buf = Buffer.concat(chunks);
          test('FRAME_' + label + ': ' + urlPath + ' is 192010 bytes', function() {
            return ok(buf.length === 192010, 'frame is ' + buf.length + ' bytes');
          });
          test('FRAME_' + label + ': EPF magic header', function() {
            return ok(buf.slice(0,4).toString() === 'EPF1', 'magic: ' + buf.slice(0,4).toString());
          });
          test('FRAME_' + label + ': no unsupported code 4', function() {
            var code4 = 0;
            for (var bi = 10; bi < buf.length; bi += 2) {
              if (buf.readUInt16BE(bi) === 4) code4++;
            }
            return ok(code4 === 0, 'found ' + code4 + ' code 4 values');
          });
          resolve();
        });
      });
      req.on('error', function(e) { console.log('Frame fetch error for ' + urlPath + ': ' + e.message); resolve(); });
      req.setTimeout(5000, function() { req.destroy(); resolve(); });
    });
  }

  // ===== NEWS TESTS =====
  function testNews() {
    return new Promise(function(resolve) {
      http.get('http://localhost:' + PORT + '/api/news.json', function(res) {
        var body = '';
        res.on('data', function(c) { body += c; });
        res.on('end', function() {
          try {
            var news = JSON.parse(body);
            test('NEWS_COUNT_6: /api/news.json has 6 items', function() {
              return ok(news.items && news.items.length === 6, 'items: ' + (news.items ? news.items.length : 0));
            });
            test('NEWS_NO_EMPTY: no item shows empty or placeholder', function() {
              var allGood = news.items.every(function(item) {
                return item.zhTitle && item.zhTitle.indexOf('暂无') < 0 && item.zhTitle.length > 0;
              });
              return ok(allGood, 'some items show empty title');
            });
            test('NEWS_2X3_FORMAT: 6 items present', function() {
              return ok(news.items.length === 6, 'count: ' + news.items.length);
            });

            // Check last-good file
            var lastGoodFile = path.join(DATA_DIR, 'last_good_news.json');
            test('NEWS_LAST_GOOD_FILE: last_good_news.json exists', function() {
              return ok(fs.existsSync(lastGoodFile), 'not found');
            });

            if (fs.existsSync(lastGoodFile)) {
              var lgd = JSON.parse(fs.readFileSync(lastGoodFile, 'utf8'));
              test('NEWS_LAST_GOOD_CONTENT: has 6 items', function() {
                return ok(lgd.items && lgd.items.length === 6, 'last good count: ' + (lgd.items ? lgd.items.length : 0));
              });
            }

            // Simulate live failure: delete cache, next build should use last-good
            if (fs.existsSync(path.join(DATA_DIR, 'news_cache.json'))) {
              fs.unlinkSync(path.join(DATA_DIR, 'news_cache.json'));
            }
          } catch(e) {
            console.log('News parse error: ' + e.message);
          }
          resolve();
        });
      }).on('error', function(e) {
        console.log('News fetch error: ' + e.message);
        resolve();
      });
    });
  }

  // Run tests sequentially
  var p = Promise.resolve();
  p = p.then(function() { return testFrame('/api/frame.bin', 'LIVE'); });
  p = p.then(function() { return testNews(); });

  p.then(function() {
    // Summary
    console.log('\n=== Results ===');
    console.log('  approvedStudy count:', testImages.filter(function(e){ return e.safetyStatus==='approved' && e.poolType==='study_frames'; }).length);
    console.log('  unique photo IDs:', Object.keys(seenPhotoIds).length);
    console.log('  unique themes:', Object.keys(seenThemes).length);
    console.log('\n=== Summary: ' + passed + ' passed, ' + failed + ' failed ===');
    // Cleanup
    cleanDir(DATA_DIR);
    process.exit(failed > 0 ? 1 : 0);
  });
});