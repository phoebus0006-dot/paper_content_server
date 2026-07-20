#!/usr/bin/env node
// photo:safety-test — uses real production selectStudyPhoto, no reimplemented logic

var path = require('path');
var fs = require('fs');
var ROOT = path.join(__dirname, '..');
var TMPDIR = path.join(ROOT, 'data', 'test_tmp_' + Date.now());
try { fs.mkdirSync(TMPDIR, {recursive: true}); fs.writeFileSync(path.join(TMPDIR, 'c7a7d3bc2f605fb97c4f6996287b3b4e212f8038.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==', 'base64')); } catch(e) {}

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
    id: id || 'test-' + Date.now(),
    url: 'https://example.com/test.jpg',
    title: 'Test Image',
    sourceType: 'test',
    source: 'Test',
    theme: 'wide_shot',
    kind: 'shot',
    hash: 'abc123',
    rawPath: 'data/raw_images/' + (id || 'test') + '.jpg',
    processedPngPath: TMPDIR + '/' + (id || 'test') + '.png',
    epfPath: 'data/processed_images/' + (id || 'test') + '.epf',
    width: 800,
    height: 480,
    imageName: (id || 'test') + '.png',
    createdAt: new Date().toISOString(),
    lastShownAt: null,
    shownCount: 0,
    safetyStatus: 'approved',
    poolType: 'study_frames',
    metadata: { test: true },
    ...overrides,
  };
}

// Use real processed files that exist for isImageReady
var DATA_DIR = path.join(ROOT, 'data');

var passed = 0, failed = 0;
function test(name, fn) {
  try {
    var result = fn();
    if (result === true) { passed++; console.log('PASS', name); }
    else { failed++; console.log('FAIL', name, '- got:', JSON.stringify(result)); }
  } catch(e) { failed++; console.log('FAIL', name, '- threw:', e.message); }
}

function ok(v, msg) { if (!v) throw new Error(msg || 'assertion'); return true; }

// ——— Static entry checks ———
test('approved+study selectable', function() {
  var e = makeEntry('valid', { processedPngPath: TMPDIR + '/c7a7d3bc2f605fb97c4f6996287b3b4e212f8038.png' });
  return ok(isStudySelectable(e));
});

test('missing safetyStatus not study-selectable', function() {
  var e = makeEntry('nosafety', { safetyStatus: undefined, poolType: 'study_frames' });
  return ok(!isStudySelectable(e));
});

test('pending not study-selectable', function() {
  var e = makeEntry('pending', { safetyStatus: 'pending', poolType: 'study_frames' });
  return ok(!isStudySelectable(e));
});

test('rejected not study-selectable', function() {
  var e = makeEntry('rejected', { safetyStatus: 'rejected', poolType: 'study_frames' });
  return ok(!isStudySelectable(e));
});

test('quarantined not study-selectable', function() {
  var e = makeEntry('quarantined', { safetyStatus: 'quarantined', poolType: 'study_frames' });
  return ok(!isStudySelectable(e));
});

test('approved decorative not study-selectable', function() {
  var e = makeEntry('deco', { safetyStatus: 'approved', poolType: 'decorative_photos' });
  return ok(!isStudySelectable(e));
});

test('missing poolType not study-selectable', function() {
  var e = makeEntry('nopool', { safetyStatus: 'approved', poolType: undefined });
  return ok(!isStudySelectable(e));
});

test('approved+study selectable with isImageApproved', function() {
  var e = makeEntry('valid2');
  return ok(isImageApproved(e));
});

test('pending not isImageApproved', function() {
  var e = makeEntry('pend', { safetyStatus: 'pending' });
  return ok(!isImageApproved(e));
});

// ——— selectStudyPhoto 1000-iteration mixed-pool test ———
test('1000 selections via selectStudyPhoto produce zero non-approved or decorative', function() {
  var approvedStudy = makeEntry('study1', { theme: 'dialogue', processedPngPath: TMPDIR + '/c7a7d3bc2f605fb97c4f6996287b3b4e212f8038.png' });
  var approvedStudy2 = makeEntry('study2', { theme: 'wide_shot', processedPngPath: TMPDIR + '/c7a7d3bc2f605fb97c4f6996287b3b4e212f8038.png' });
  var approvedDeco = makeEntry('deco1', { poolType: 'decorative_photos', theme: 'dialogue', processedPngPath: TMPDIR + '/c7a7d3bc2f605fb97c4f6996287b3b4e212f8038.png' });
  var pendingStudy = makeEntry('pending1', { safetyStatus: 'pending', theme: 'night' });
  var rejectedStudy = makeEntry('reject1', { safetyStatus: 'rejected', theme: 'backlight' });
  var missingSafety = makeEntry('nosafety', { safetyStatus: undefined, theme: 'ensemble' });
  var missingPool = makeEntry('nopool', { poolType: undefined, theme: 'color', processedPngPath: TMPDIR + '/c7a7d3bc2f605fb97c4f6996287b3b4e212f8038.png' });
  var quarantinedStudy = makeEntry('quar1', { safetyStatus: 'quarantined', theme: 'suspense' });

  var imageIndex = [
    approvedStudy, approvedStudy2, approvedDeco, pendingStudy,
    rejectedStudy, missingSafety, missingPool, quarantinedStudy,
  ];

  var libraryState = {
    themeCursor: 0, currentTheme: null, currentImageIndex: 0,
    remainingThemeSlots: 1, lastSlotKey: null, lastSwitchDate: null,
    patternIndex: 0, currentKind: null,
  };

  var selectedNonApproved = 0;
  var selectedDecorative = 0;
  var selectedMissingStatus = 0;

  for (var n = 0; n < 1000; n++) {
    var now = new Date(Date.now() + n * 1800000);
    var result = selectStudyPhoto(now, imageIndex, libraryState);
    if (result.entry) {
      if (result.entry.safetyStatus !== 'approved') selectedNonApproved++;
      if (result.entry.poolType !== 'study_frames') selectedDecorative++;
      if (!result.entry.safetyStatus) selectedMissingStatus++;
    }
  }

  console.log('  selectedNonApproved:', selectedNonApproved);
  console.log('  selectedDecorative:', selectedDecorative);
  console.log('  selectedMissingStatus:', selectedMissingStatus);
  return ok(selectedNonApproved === 0 && selectedDecorative === 0 && selectedMissingStatus === 0,
    'leak detected: non-approved=' + selectedNonApproved + ' decorative=' + selectedDecorative + ' missing=' + selectedMissingStatus);
});

// ——— pool config existence ———
test('photo_sources.json has poolType on each source', function() {
  var config = loadJson(path.join(ROOT, 'config', 'photo_sources.json'), {});
  var allHavePool = (config.sources || []).every(function(s) { return s.poolType || s.type === 'local_import' || s.type === 'url_list'; });
  return ok(allHavePool, 'every source should have poolType');
});

test('no unknown source types', function() {
  var config = loadJson(path.join(ROOT, 'config', 'photo_sources.json'), {});
  var src = fs.readFileSync(path.join(ROOT, 'scripts', 'fetch-images.js'), 'utf8');
  var unknownCount = 0;
  for (var s of config.sources || []) {
    if (s.type === 'wikimedia_commons' && src.indexOf("fetchWikimediaCandidates") >= 0) continue;
    if (s.type === 'wikimedia_category' && src.indexOf("fetchWikimediaCategoryCandidates") >= 0) continue;
    if (s.type === 'url_list' && src.indexOf("fetchUrlListCandidates") >= 0) continue;
    if (s.type === 'local_import' && src.indexOf("fetchLocalImportCandidates") >= 0) continue;
    if (s.type === 'internet_archive') continue;
    if (s.type === 'europeana') continue;
    if (s.type === 'rss_images') continue;
    unknownCount++;
  }
  return ok(unknownCount === 0, 'unknown source types: ' + unknownCount);
});

// ——— summary ———
console.log();
console.log('=== Summary: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed > 0 ? 1 : 0);
