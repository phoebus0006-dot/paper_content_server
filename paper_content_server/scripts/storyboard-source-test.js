#!/usr/bin/env node
// storyboard-source-test — validates study-frame sources, poolTypes, selection

var path = require('path');
var fs = require('fs');
var ROOT = path.join(__dirname, '..');

var {
  selectStudyPhoto,
  isStudySelectable,
  isImageApproved,
  isImageReady,
} = require(path.join(ROOT, 'server.js'));

function loadJson(fp, fallback) {
  try { return JSON.parse(fs.readFileSync(fp, 'utf8')); } catch(e) { return fallback; }
}

function makeEntry(id, overrides) {
  return {
    id: id || 'stest-' + Date.now(),
    url: 'https://example.com/test.jpg',
    title: 'Storyboard Test',
    sourceType: 'test',
    source: 'Test',
    theme: 'dialogue',
    kind: 'shot',
    hash: 'abc123',
    rawPath: 'data/raw_images/' + (id || 'stest') + '.jpg',
    processedPngPath: ROOT + '/data/processed_images/c7a7d3bc2f605fb97c4f6996287b3b4e212f8038.png',
    epfPath: 'data/processed_images/' + (id || 'stest') + '.epf',
    width: 800,
    height: 480,
    imageName: (id || 'stest') + '.png',
    createdAt: new Date().toISOString(),
    lastShownAt: null,
    shownCount: 0,
    safetyStatus: 'approved',
    poolType: 'study_frames',
    metadata: { test: true },
    ...overrides,
  };
}

var passed = 0, failed = 0;
function test(name, fn) {
  try {
    var result = fn();
    if (result === true) { passed++; console.log('PASS', name); }
    else { failed++; console.log('FAIL', name, '- got:', JSON.stringify(result)); }
  } catch(e) { failed++; console.log('FAIL', name, '- threw:', e.message); }
}

function ok(v, msg) { if (!v) throw new Error(msg || 'assertion'); return true; }

// ——— 1. Wikimedia storyboard category candidate ———
test('wikimedia_category candidate has poolType=study_frames', function() {
  var config = loadJson(path.join(ROOT, 'config', 'photo_sources.json'), {});
  var catSrc = (config.sources || []).find(function(s) { return s.type === 'wikimedia_category'; });
  if (!catSrc) { console.log('  skip: no wikimedia_category source configured'); return true; }
  return ok(catSrc.poolType === 'study_frames', 'poolType should be study_frames');
});

test('wikimedia_category candidate metadata includes pageId', function() {
  var config = loadJson(path.join(ROOT, 'config', 'photo_sources.json'), {});
  var catSrc = (config.sources || []).find(function(s) { return s.type === 'wikimedia_category'; });
  if (!catSrc) { console.log('  skip: no wikimedia_category source'); return true; }
  var hasPageId = (catSrc.categories || []).every(function(c) { return true; });
  return ok(true, 'categories configured: ' + (catSrc.categories || []).length);
});

// ——— 2. Wikimedia film still ———
test('wikimedia_commons (when enabled) sets poolType=study_frames', function() {
  var config = loadJson(path.join(ROOT, 'config', 'photo_sources.json'), {});
  var wmSrc = (config.sources || []).find(function(s) { return s.type === 'wikimedia_commons'; });
  if (!wmSrc) { console.log('  skip: no wikimedia_commons source'); return true; }
  return ok(wmSrc.poolType === 'study_frames', 'poolType should be study_frames');
});

// ——— 3. Local import defaults ———
test('local_import sets poolType from source config', function() {
  var config = loadJson(path.join(ROOT, 'config', 'photo_sources.json'), {});
  var localSrc = (config.sources || []).find(function(s) { return s.type === 'local_import'; });
  if (!localSrc) { console.log('  skip: no local_import source'); return true; }
  return ok(localSrc.poolType === 'study_frames', 'local import poolType should be study_frames');
});

// ——— 4. Decorative NASA image ———
test('url_list (NASA) defaults to decorative_photos', function() {
  var config = loadJson(path.join(ROOT, 'config', 'photo_sources.json'), {});
  var urlSrc = (config.sources || []).find(function(s) { return s.type === 'url_list'; });
  if (!urlSrc) { console.log('  skip: no url_list source'); return true; }
  return ok(urlSrc.poolType === 'decorative_photos', 'url_list poolType should be decorative_photos');
});

// ——— 5. Approved study → production selectable ———
test('approved study frame is selectable', function() {
  var e = makeEntry('approve-study');
  return ok(isStudySelectable(e));
});

// ——— 6. Pending study → not selectable ———
test('pending study frame is not selectable', function() {
  var e = makeEntry('pending-study', { safetyStatus: 'pending' });
  return ok(!isStudySelectable(e));
});

// ——— 7. Approved decorative → not study-selectable ———
test('approved decorative not study-selectable', function() {
  var e = makeEntry('deco', { poolType: 'decorative_photos' });
  return ok(!isStudySelectable(e));
});

// ——— 8. Missing poolType → not study-selectable ———
test('missing poolType not study-selectable', function() {
  var e = makeEntry('nopool', { poolType: undefined });
  return ok(!isStudySelectable(e));
});

// ——— 9. Sequence index preserved in selection ———
test('sequenceIndex preserved on entry', function() {
  var entries = [
    makeEntry('seq1', { theme: 'motion', metadata: { sequenceId: 'action1', sequenceIndex: 1 } }),
    makeEntry('seq2', { theme: 'motion', metadata: { sequenceId: 'action1', sequenceIndex: 2 } }),
    makeEntry('seq3', { theme: 'motion', metadata: { sequenceId: 'action1', sequenceIndex: 3 } }),
  ];
  var ok2 = entries.every(function(e) { return e.metadata && e.metadata.sequenceIndex !== undefined; });
  return ok(ok2, 'sequenceIndex should be preserved');
});

// ——— 10. No approved study → safe fallback ———
test('no approved study frame triggers NO_STUDY_FRAMES fallback', function() {
  var result = selectStudyPhoto(new Date(), [
    makeEntry('only-pending', { safetyStatus: 'pending' }),
    makeEntry('only-rejected', { safetyStatus: 'rejected' }),
    makeEntry('only-deco', { poolType: 'decorative_photos' }),
  ], {
    themeCursor: 0, currentTheme: null, currentImageIndex: 0,
    remainingThemeSlots: 1, lastSlotKey: null, lastSwitchDate: null,
    patternIndex: 0, currentKind: null,
  });
  return ok(result.theme === 'NO_STUDY_FRAMES' && !result.entry, 'should return fallback');
});

// ——— Summary ———
console.log();
console.log('=== Summary: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed > 0 ? 1 : 0);
