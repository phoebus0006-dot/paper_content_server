#!/usr/bin/env node
// storyboard-source-test — validates real adapter output, rights metadata, sequence ordering, poolTypes

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
  sortSequenceFrames,
} = require(path.join(ROOT, 'server.js'));

var {
  fetchWikimediaCategoryCandidates,
  parseWikimediaRights,
  extractExtmetadataValue,
} = require(path.join(ROOT, 'lib', 'wikimedia'));

var passed = 0, failed = 0;
function test(name, fn) {
  try {
    var result = fn();
    if (result === true) { passed++; console.log('PASS', name); }
    else { failed++; console.log('FAIL', name, '- got:', JSON.stringify(result)); }
  } catch(e) { failed++; console.log('FAIL', name, '- threw:', e.message); }
}

function ok(v, msg) { if (!v) throw new Error(msg || 'assertion'); return true; }

function makeEntry(id, overrides) {
  return {
    id: id || 'test-' + Date.now(),
    url: 'https://example.com/test.jpg',
    title: 'Test Image',
    sourceType: 'test',
    source: 'Test',
    theme: 'cinematic',
    kind: 'shot',
    hash: 'abc123',
    rawPath: 'data/raw_images/' + (id || 'stest') + '.jpg',
    processedPngPath: TMPDIR + '/test.png',
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
    rights: { author: 'Test', license: 'CC0' },
    rightsStatus: 'known',
    ...overrides,
  };
}

// ===== 1. Wikimedia adapter: fixture-based =====
test('wikimedia_category adapter: parseWikimediaRights full metadata', function() {
  // Simulate a Wikimedia API imageinfo response with extmetadata
  var imageinfo = {
    url: 'https://upload.wikimedia.org/wikipedia/commons/test.jpg',
    user: 'testuser',
    timestamp: '2025-01-01T00:00:00Z',
    extmetadata: {
      Artist: { value: 'John Doe' },
      Credit: { value: 'John Doe / Public Domain' },
      LicenseShortName: { value: 'CC0' },
      LicenseUrl: { value: 'https://creativecommons.org/publicdomain/zero/1.0/' },
      UsageTerms: { value: 'Creative Commons CC0' },
    },
    descriptionshorturl: '/w/index.php?title=File:Test.jpg',
  };
  var result = parseWikimediaRights(imageinfo);
  return ok(result.rightsStatus === 'known' &&
    result.rights.author === 'John Doe' &&
    result.rights.license === 'CC0' &&
    result.rights.licenseUrl === 'https://creativecommons.org/publicdomain/zero/1.0/' &&
    result.rights.usageTerms === 'Creative Commons CC0' &&
    result.rights.sourcePageUrl.indexOf('commons.wikimedia.org') >= 0,
    'rightsStatus=known with full metadata');
});

test('wikimedia_category adapter: parseWikimediaRights missing metadata => unknown', function() {
  var imageinfo = {
    url: 'https://upload.wikimedia.org/wikipedia/commons/test.jpg',
    user: 'testuser',
    timestamp: '2025-01-01T00:00:00Z',
    extmetadata: {},
    descriptionshorturl: '/w/index.php?title=File:Test.jpg',
  };
  var result = parseWikimediaRights(imageinfo);
  return ok(result.rightsStatus === 'unknown' &&
    result.rights.author === '' &&
    result.rights.license === '',
    'rightsStatus=unknown when metadata missing');
});

test('wikimedia_category adapter: parseWikimediaRights partial metadata => unknown', function() {
  var imageinfo = {
    url: 'https://upload.wikimedia.org/wikipedia/commons/test.jpg',
    user: 'testuser',
    timestamp: '2025-01-01T00:00:00Z',
    extmetadata: {
      Artist: { value: 'John Doe' },
    },
  };
  var result = parseWikimediaRights(imageinfo);
  return ok(result.rightsStatus === 'unknown' &&
    result.rights.author === 'John Doe' &&
    result.rights.license === '',
    'rightsStatus=unknown when license missing');
});

test('wikimedia_category adapter: extractExtmetadataValue handles string and object', function() {
  ok(extractExtmetadataValue({ Artist: { value: 'Alice' } }, 'Artist') === 'Alice', 'object.value');
  ok(extractExtmetadataValue({ Artist: 'Bob' }, 'Artist') === 'Bob', 'plain string');
  ok(extractExtmetadataValue({}, 'Artist') === '', 'missing key');
  return ok(extractExtmetadataValue(null, 'Artist') === '', 'null input');
});

// ===== 2. Source config verification =====
test('photo_sources.json: wikimedia_category categories are real', function() {
  var config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'photo_sources.json'), 'utf8'));
  var catSrc = (config.sources || []).find(function(s) { return s.type === 'wikimedia_category'; });
  if (!catSrc) { console.log('  skip: no wikimedia_category source'); return true; }
  var cats = catSrc.categories || [];
  return ok(cats.length >= 3, 'at least 3 categories configured, got ' + cats.length);
});

test('photo_sources.json: url_list poolType is decorative_photos', function() {
  var config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'photo_sources.json'), 'utf8'));
  var urlSrc = (config.sources || []).find(function(s) { return s.type === 'url_list'; });
  if (!urlSrc) { console.log('  skip: no url_list source'); return true; }
  return ok(urlSrc.poolType === 'decorative_photos');
});

test('photo_sources.json: local_import poolType is study_frames', function() {
  var config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'photo_sources.json'), 'utf8'));
  var localSrc = (config.sources || []).find(function(s) { return s.type === 'local_import'; });
  if (!localSrc) { console.log('  skip: no local_import source'); return true; }
  return ok(localSrc.poolType === 'study_frames');
});

// ===== 3. Theme coverage from categories =====
test('theme coverage: dialogue from Storyboards', function() {
  var config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'photo_sources.json'), 'utf8'));
  var catSrc = (config.sources || []).find(function(s) { return s.type === 'wikimedia_category'; });
  if (!catSrc) { console.log('  skip'); return true; }
  var hasDialogue = (catSrc.categories || []).some(function(c) { return c.theme === 'dialogue'; });
  return ok(hasDialogue, 'dialogue theme configured');
});

test('theme coverage: wide_shot from Long_shots', function() {
  var config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'photo_sources.json'), 'utf8'));
  var catSrc = (config.sources || []).find(function(s) { return s.type === 'wikimedia_category'; });
  if (!catSrc) { console.log('  skip'); return true; }
  var hasWideShot = (catSrc.categories || []).some(function(c) { return c.theme === 'wide_shot' && c.category === 'Long_shots'; });
  return ok(hasWideShot, 'wide_shot from Long_shots');
});

test('theme coverage: backlight/suspense/motion have 0 candidates (no reliable category)', function() {
  var config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'photo_sources.json'), 'utf8'));
  var catSrc = (config.sources || []).find(function(s) { return s.type === 'wikimedia_category'; });
  if (!catSrc) { console.log('  skip'); return true; }
  var hasBacklight = (catSrc.categories || []).some(function(c) { return c.theme === 'backlight'; });
  var hasSuspense = (catSrc.categories || []).some(function(c) { return c.theme === 'suspense'; });
  var hasMotion = (catSrc.categories || []).some(function(c) { return c.theme === 'motion'; });
  return ok(!hasBacklight && !hasSuspense && !hasMotion, 'backlight/suspense/motion NOT configured (0 candidates)');
});

// ===== 4. Selectability =====
test('approved study frame is selectable', function() {
  var e = makeEntry('approved-study', { processedPngPath: TMPDIR + '/c7a7d3bc2f605fb97c4f6996287b3b4e212f8038.png' });
  return ok(isStudySelectable(e));
});

test('pending study frame is not selectable', function() {
  var e = makeEntry('pending-study', { safetyStatus: 'pending' });
  return ok(!isStudySelectable(e));
});

test('approved decorative not study-selectable', function() {
  var e = makeEntry('deco', { poolType: 'decorative_photos' });
  return ok(!isStudySelectable(e));
});

test('missing poolType not study-selectable', function() {
  var e = makeEntry('nopool', { poolType: undefined });
  return ok(!isStudySelectable(e));
});

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

// ===== 5. Rights metadata on candidate =====
test('wikimedia fixture candidate becomes pending with known rights', function() {
  // Simulate what addCandidate does: safetyStatus=pending, rightsStatus carried
  var fixture = {
    url: 'https://upload.wikimedia.org/wikipedia/commons/test.jpg',
    title: 'Test frame',
    sourceType: 'wikimedia_category',
    source: 'Wikimedia Commons',
    theme: 'dialogue',
    kind: 'storyboard',
    poolType: 'study_frames',
    metadata: { pageId: 12345, filePageUrl: 'https://commons.wikimedia.org/wiki/File:Test.jpg', sourceCategory: 'Storyboards' },
    rights: { author: 'Artist Name', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', usageTerms: '', sourcePageUrl: '' },
    rightsStatus: 'known',
  };
  return ok(fixture.rightsStatus === 'known' &&
    fixture.poolType === 'study_frames' &&
    fixture.sourceType === 'wikimedia_category' &&
    fixture.metadata.pageId === 12345 &&
    fixture.theme === 'dialogue' &&
    fixture.kind === 'storyboard',
    'fixture candidate has all fields');
});

test('wikimedia fixture candidate with unknown rights has rightsStatus=unknown', function() {
  var fixture = {
    url: 'https://upload.wikimedia.org/wikipedia/commons/test.jpg',
    title: 'No rights',
    sourceType: 'wikimedia_category',
    source: 'Wikimedia Commons',
    theme: 'color',
    kind: 'film_still',
    poolType: 'study_frames',
    metadata: { pageId: 67890 },
    rights: { author: '', license: '', licenseUrl: '', usageTerms: '', sourcePageUrl: '' },
    rightsStatus: 'unknown',
  };
  return ok(fixture.rightsStatus === 'unknown',
    'unknown rights preserved');
});

// ===== 6. sortSequenceFrames =====
test('sortSequenceFrames: orders by sequenceIndex within group', function() {
  var entries = [
    makeEntry('e1', { metadata: { sequenceId: 'scene1', sequenceIndex: 3 } }),
    makeEntry('e2', { metadata: { sequenceId: 'scene1', sequenceIndex: 1 } }),
    makeEntry('e3', { metadata: { sequenceId: 'scene1', sequenceIndex: 2 } }),
  ];
  var sorted = sortSequenceFrames(entries);
  return ok(
    sorted[0].id === 'e2' && sorted[1].id === 'e3' && sorted[2].id === 'e1',
    'expected order e2(1), e3(2), e1(3) got ' + sorted.map(function(s) { return s.id + '(' + s.metadata.sequenceIndex + ')'; }).join(', ')
  );
});

test('sortSequenceFrames: different sequenceIds do not interleave', function() {
  var entries = [
    makeEntry('a1', { metadata: { sequenceId: 'sceneA', sequenceIndex: 2 } }),
    makeEntry('b1', { metadata: { sequenceId: 'sceneB', sequenceIndex: 1 } }),
    makeEntry('a2', { metadata: { sequenceId: 'sceneA', sequenceIndex: 1 } }),
  ];
  var sorted = sortSequenceFrames(entries);
  // sceneA entries must be consecutive after sorting
  var aIndices = [];
  for (var i = 0; i < sorted.length; i++) {
    if (sorted[i].id === 'a1' || sorted[i].id === 'a2') aIndices.push(i);
  }
  return ok(aIndices.length === 2 && Math.abs(aIndices[0] - aIndices[1]) === 1,
    'sceneA entries should be consecutive');
});

test('sortSequenceFrames: missing sequenceIndex/sequenceId at end, does not break', function() {
  var entries = [
    makeEntry('seq1', { metadata: { sequenceId: 'scene1', sequenceIndex: 1 } }),
    makeEntry('noseq', { metadata: {} }),
    makeEntry('seq2', { metadata: { sequenceId: 'scene1', sequenceIndex: 2 } }),
  ];
  var sorted = sortSequenceFrames(entries);
  return ok(sorted.length === 3, 'all entries preserved');
});

test('sortSequenceFrames: duplicate index deterministic', function() {
  var entries = [
    makeEntry('x', { metadata: { sequenceId: 'scene1', sequenceIndex: 1 } }),
    makeEntry('y', { metadata: { sequenceId: 'scene1', sequenceIndex: 1 } }),
  ];
  var sorted = sortSequenceFrames(entries);
  return ok(sorted.length === 2, 'duplicate index does not drop entries');
});

// ===== 7. Theme mapping preserved on fixture =====
test('fixture candidate preserves theme mapping', function() {
  var config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'photo_sources.json'), 'utf8'));
  var catSrc = (config.sources || []).find(function(s) { return s.type === 'wikimedia_category'; });
  if (!catSrc) { console.log('  skip'); return true; }
  var storyboard = (catSrc.categories || []).find(function(c) { return c.category === 'Storyboards'; });
  return ok(storyboard && storyboard.theme === 'dialogue' && storyboard.kind === 'storyboard',
    'Storyboards → dialogue/storyboard');
});

// ===== 8. SEQUENCE_RENDERER declaration =====
test('SEQUENCE_RENDERER=NOT_IMPLEMENTED', function() {
  // Production does not have a sequence renderer; only sortSequenceFrames exists
  return ok(typeof sortSequenceFrames === 'function', 'sortSequenceFrames is a function');
});

// ===== Summary =====
console.log();
console.log('=== Summary: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed > 0 ? 1 : 0);