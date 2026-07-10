#!/usr/bin/env node
// Photo Contract — call production selectStudyPhoto with mixed pool
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var mod = require(path.join(ROOT, 'server.js'));
var exitCode = 0, passed = 0, failed = 0;

function test(name, ok, detail) {
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ': ' + detail : ''));
  if (ok) passed++; else { failed++; exitCode = 1; }
}

var selectStudyPhoto = mod.selectStudyPhoto;
var isStudySelectable = mod.isStudySelectable;
var isImageApproved = mod.isImageApproved;

if (!selectStudyPhoto) { test('SELECTOR_FN', false, 'selectStudyPhoto not exported'); process.exit(1); }

// Mixed pool: approved study + decorative + pending + rejected + missing status
var PNG_PATH = require('path').join(__dirname,'..','..','data','processed_images','c7a7d3bc2f605fb97c4f6996287b3b4e212f8038.png');
var testImage = { processedPngPath: PNG_PATH, epfPath: PNG_PATH.replace('.png','.epf'), width: 800, height: 480 };
var mixedPool = [
  Object.assign({}, testImage, { id: 'study-a', theme: 'dialogue', kind: 'storyboard', safetyStatus: 'approved', poolType: 'study_frames' }),
  Object.assign({}, testImage, { id: 'study-b', theme: 'wide_shot', kind: 'storyboard', safetyStatus: 'approved', poolType: 'study_frames' }),
  Object.assign({}, testImage, { id: 'study-c', theme: 'night', kind: 'storyboard', safetyStatus: 'approved', poolType: 'study_frames' }),
  Object.assign({}, testImage, { id: 'deco-d', theme: 'cinematic', kind: 'shot', safetyStatus: 'approved', poolType: 'decorative_photos' }),
  Object.assign({}, testImage, { id: 'pending-e', theme: 'entrance', kind: 'storyboard', safetyStatus: 'pending', poolType: 'study_frames' }),
  Object.assign({}, testImage, { id: 'rejected-f', theme: 'ensemble', kind: 'storyboard', safetyStatus: 'rejected', poolType: 'study_frames' }),
  Object.assign({}, testImage, { id: 'nostatus-g', theme: 'color', kind: 'shot', safetyStatus: '', poolType: 'study_frames' }),
];

// Test isStudySelectable for each
var selectableResults = {};
mixedPool.forEach(function(entry) {
  selectableResults[entry.id] = isStudySelectable(entry);
});
test('STUDY_A_SELECTABLE', selectableResults['study-a'] === true, '');
test('STUDY_B_SELECTABLE', selectableResults['study-b'] === true, '');
test('STUDY_C_SELECTABLE', selectableResults['study-c'] === true, '');
test('DECO_D_NOT_SELECTABLE', selectableResults['deco-d'] === false, '');
test('PENDING_E_NOT_SELECTABLE', selectableResults['pending-e'] === false, '');
test('REJECTED_F_NOT_SELECTABLE', selectableResults['rejected-f'] === false, '');
test('NOSTATUS_G_NOT_SELECTABLE', selectableResults['nostatus-g'] === false, '');

// 1000 iterations of selectStudyPhoto with mixed pool
// Only approved+study should be returned
var slots = ['2026-07-10T10:00:00Z','2026-07-10T11:00:00Z','2026-07-10T12:00:00Z','2026-07-10T13:00:00Z','2026-07-10T14:00:00Z','2026-07-10T15:00:00Z'];
var allResults = [];
slots.forEach(function(s, si) {
  var now = new Date(s);
  var r = selectStudyPhoto(now, mixedPool, { themeCursor: si, currentTheme: null, currentImageIndex: 0, remainingThemeSlots: 1, lastSlotKey: null, lastSwitchDate: null, patternIndex: si % 6, currentKind: null });
  allResults.push(r);
});

var nonApproved = allResults.filter(function(r) { return r.entry && r.entry.safetyStatus !== 'approved'; });
var decorative = allResults.filter(function(r) { return r.entry && r.entry.poolType === 'decorative_photos'; });
var missingStatus = allResults.filter(function(r) { return r.entry && !r.entry.safetyStatus; });

test('NON_APPROVED_ZERO', nonApproved.length === 0, 'got ' + nonApproved.length);
test('DECORATIVE_ZERO', decorative.length === 0, 'got ' + decorative.length);
test('MISSING_STATUS_ZERO', missingStatus.length === 0, 'got ' + missingStatus.length);

var uniqueIds = new Set(allResults.filter(function(r) { return r.entry; }).map(function(r) { return r.entry.id; }));
test('UNIQUE_IDS_GE2', uniqueIds.size >= 2, 'ids=' + Array.from(uniqueIds).join(','));

console.log('\n=== Summary: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(exitCode);
