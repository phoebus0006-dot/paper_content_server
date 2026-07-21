const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  computeNextSwitchAt,
  TIMEZONE,
  dateFromWallTime,
  getWallTime,
  formatDateParts,
} = require('../../../server');

// ── Helpers ──

function makeDate(year, month, day, hour, minute, second) {
  return dateFromWallTime({ year, month, day, hour, minute, second: second || 0 }, TIMEZONE);
}

function utcDate(year, month, day, hour, minute, second) {
  return new Date(Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0));
}

function formatUTCDate(date) {
  return date.getUTCFullYear() + '-' +
    String(date.getUTCMonth() + 1).padStart(2, '0') + '-' +
    String(date.getUTCDate()).padStart(2, '0') + ' ' +
    String(date.getUTCHours()).padStart(2, '0') + ':' +
    String(date.getUTCMinutes()).padStart(2, '0') + ':' +
    String(date.getUTCSeconds()).padStart(2, '0');
}

function formatWallDate(date) {
  const w = getWallTime(date, TIMEZONE);
  return w.year + '-' +
    String(w.month).padStart(2, '0') + '-' +
    String(w.day).padStart(2, '0') + ' ' +
    String(w.hour).padStart(2, '0') + ':' +
    String(w.minute).padStart(2, '0') + ':' +
    String(w.second).padStart(2, '0');
}

// ─────────────────────────────────────────────────────────────
// computeNextSwitchAt — precise day/night period rules
// ─────────────────────────────────────────────────────────────

describe('computeNextSwitchAt — news period (10:30-19:00)', () => {

  // 10:30:00 is the start of the window → next half-hour slot 11:00
  it('10:30:00 -> 11:00:00 (at boundary → next half-hour)', () => {
    const input = makeDate(2025, 6, 15, 10, 30, 0);
    const expected = makeDate(2025, 6, 15, 11, 0, 0);
    const result = computeNextSwitchAt(input);
    assert.equal(result.getTime(), expected.getTime(),
      'input=' + formatWallDate(input) + ' expected=' + formatWallDate(expected) + ' got=' + formatWallDate(result));
  });

  it('10:30:01 -> 11:00:00 (just after boundary → next half-hour)', () => {
    const input = makeDate(2025, 6, 15, 10, 30, 1);
    const expected = makeDate(2025, 6, 15, 11, 0, 0);
    const result = computeNextSwitchAt(input);
    assert.equal(result.getTime(), expected.getTime(),
      'input=' + formatWallDate(input) + ' expected=' + formatWallDate(expected) + ' got=' + formatWallDate(result));
  });

  it('10:42:00 -> 11:00:00', () => {
    const input = makeDate(2025, 6, 15, 10, 42, 0);
    const expected = makeDate(2025, 6, 15, 11, 0, 0);
    const result = computeNextSwitchAt(input);
    assert.equal(result.getTime(), expected.getTime(),
      'input=' + formatWallDate(input) + ' expected=' + formatWallDate(expected) + ' got=' + formatWallDate(result));
  });

  it('11:00:00 -> 11:30:00', () => {
    const input = makeDate(2025, 6, 15, 11, 0, 0);
    const expected = makeDate(2025, 6, 15, 11, 30, 0);
    const result = computeNextSwitchAt(input);
    assert.equal(result.getTime(), expected.getTime(),
      'input=' + formatWallDate(input) + ' expected=' + formatWallDate(expected) + ' got=' + formatWallDate(result));
  });

  it('18:00:00 -> 18:30:00', () => {
    const input = makeDate(2025, 6, 15, 18, 0, 0);
    const expected = makeDate(2025, 6, 15, 18, 30, 0);
    const result = computeNextSwitchAt(input);
    assert.equal(result.getTime(), expected.getTime(),
      'input=' + formatWallDate(input) + ' expected=' + formatWallDate(expected) + ' got=' + formatWallDate(result));
  });

  it('18:29:59 -> 18:30:00 (before half-hour → :30)', () => {
    const input = makeDate(2025, 6, 15, 18, 29, 59);
    const expected = makeDate(2025, 6, 15, 18, 30, 0);
    const result = computeNextSwitchAt(input);
    assert.equal(result.getTime(), expected.getTime(),
      'input=' + formatWallDate(input) + ' expected=' + formatWallDate(expected) + ' got=' + formatWallDate(result));
  });

  it('18:30:00 -> 19:00:00 (at half-hour → 19:00 end of news)', () => {
    const input = makeDate(2025, 6, 15, 18, 30, 0);
    const expected = makeDate(2025, 6, 15, 19, 0, 0);
    const result = computeNextSwitchAt(input);
    assert.equal(result.getTime(), expected.getTime(),
      'input=' + formatWallDate(input) + ' expected=' + formatWallDate(expected) + ' got=' + formatWallDate(result));
  });

  it('18:45:00 -> 19:00:00', () => {
    const input = makeDate(2025, 6, 15, 18, 45, 0);
    const expected = makeDate(2025, 6, 15, 19, 0, 0);
    const result = computeNextSwitchAt(input);
    assert.equal(result.getTime(), expected.getTime(),
      'input=' + formatWallDate(input) + ' expected=' + formatWallDate(expected) + ' got=' + formatWallDate(result));
  });

  it('18:59:59 -> 19:00:00 (just before 19:00 → 19:00)', () => {
    const input = makeDate(2025, 6, 15, 18, 59, 59);
    const expected = makeDate(2025, 6, 15, 19, 0, 0);
    const result = computeNextSwitchAt(input);
    assert.equal(result.getTime(), expected.getTime(),
      'input=' + formatWallDate(input) + ' expected=' + formatWallDate(expected) + ' got=' + formatWallDate(result));
  });

});

describe('computeNextSwitchAt — photo period (19:00-10:30)', () => {

  it('19:00:00 -> next-day 10:30:00', () => {
    const input = makeDate(2025, 6, 15, 19, 0, 0);
    const expected = makeDate(2025, 6, 16, 10, 30, 0);
    const result = computeNextSwitchAt(input);
    assert.equal(result.getTime(), expected.getTime(),
      'input=' + formatWallDate(input) + ' expected=' + formatWallDate(expected) + ' got=' + formatWallDate(result));
  });

  it('19:30:00 -> next-day 10:30:00', () => {
    const input = makeDate(2025, 6, 15, 19, 30, 0);
    const expected = makeDate(2025, 6, 16, 10, 30, 0);
    const result = computeNextSwitchAt(input);
    assert.equal(result.getTime(), expected.getTime(),
      'input=' + formatWallDate(input) + ' expected=' + formatWallDate(expected) + ' got=' + formatWallDate(result));
  });

  it('21:00:00 -> next-day 10:30:00', () => {
    const input = makeDate(2025, 6, 15, 21, 0, 0);
    const expected = makeDate(2025, 6, 16, 10, 30, 0);
    const result = computeNextSwitchAt(input);
    assert.equal(result.getTime(), expected.getTime(),
      'input=' + formatWallDate(input) + ' expected=' + formatWallDate(expected) + ' got=' + formatWallDate(result));
  });

  it('21:12:00 -> next-day 10:30:00', () => {
    const input = makeDate(2025, 6, 15, 21, 12, 0);
    const expected = makeDate(2025, 6, 16, 10, 30, 0);
    const result = computeNextSwitchAt(input);
    assert.equal(result.getTime(), expected.getTime(),
      'input=' + formatWallDate(input) + ' expected=' + formatWallDate(expected) + ' got=' + formatWallDate(result));
  });

  it('23:45:00 -> next-day 10:30:00', () => {
    const input = makeDate(2025, 6, 15, 23, 45, 0);
    const expected = makeDate(2025, 6, 16, 10, 30, 0);
    const result = computeNextSwitchAt(input);
    assert.equal(result.getTime(), expected.getTime(),
      'input=' + formatWallDate(input) + ' expected=' + formatWallDate(expected) + ' got=' + formatWallDate(result));
  });

  it('00:00:00 -> same-day 10:30:00', () => {
    const input = makeDate(2025, 6, 15, 0, 0, 0);
    const expected = makeDate(2025, 6, 15, 10, 30, 0);
    const result = computeNextSwitchAt(input);
    assert.equal(result.getTime(), expected.getTime(),
      'input=' + formatWallDate(input) + ' expected=' + formatWallDate(expected) + ' got=' + formatWallDate(result));
  });

  it('01:30:00 -> same-day 10:30:00', () => {
    const input = makeDate(2025, 6, 15, 1, 30, 0);
    const expected = makeDate(2025, 6, 15, 10, 30, 0);
    const result = computeNextSwitchAt(input);
    assert.equal(result.getTime(), expected.getTime(),
      'input=' + formatWallDate(input) + ' expected=' + formatWallDate(expected) + ' got=' + formatWallDate(result));
  });

  it('08:00:00 -> same-day 10:30:00', () => {
    const input = makeDate(2025, 6, 15, 8, 0, 0);
    const expected = makeDate(2025, 6, 15, 10, 30, 0);
    const result = computeNextSwitchAt(input);
    assert.equal(result.getTime(), expected.getTime(),
      'input=' + formatWallDate(input) + ' expected=' + formatWallDate(expected) + ' got=' + formatWallDate(result));
  });

  it('08:12:00 -> same-day 10:30:00', () => {
    const input = makeDate(2025, 6, 15, 8, 12, 0);
    const expected = makeDate(2025, 6, 15, 10, 30, 0);
    const result = computeNextSwitchAt(input);
    assert.equal(result.getTime(), expected.getTime(),
      'input=' + formatWallDate(input) + ' expected=' + formatWallDate(expected) + ' got=' + formatWallDate(result));
  });

  it('10:00:00 -> 10:30:00', () => {
    const input = makeDate(2025, 6, 15, 10, 0, 0);
    const expected = makeDate(2025, 6, 15, 10, 30, 0);
    const result = computeNextSwitchAt(input);
    assert.equal(result.getTime(), expected.getTime(),
      'input=' + formatWallDate(input) + ' expected=' + formatWallDate(expected) + ' got=' + formatWallDate(result));
  });

  it('10:29:00 -> 10:30:00', () => {
    const input = makeDate(2025, 6, 15, 10, 29, 0);
    const expected = makeDate(2025, 6, 15, 10, 30, 0);
    const result = computeNextSwitchAt(input);
    assert.equal(result.getTime(), expected.getTime(),
      'input=' + formatWallDate(input) + ' expected=' + formatWallDate(expected) + ' got=' + formatWallDate(result));
  });

  it('10:29:59 -> 10:30:00', () => {
    const input = makeDate(2025, 6, 15, 10, 29, 59);
    const expected = makeDate(2025, 6, 15, 10, 30, 0);
    const result = computeNextSwitchAt(input);
    assert.equal(result.getTime(), expected.getTime(),
      'input=' + formatWallDate(input) + ' expected=' + formatWallDate(expected) + ' got=' + formatWallDate(result));
  });

});

describe('computeNextSwitchAt — year/month boundaries', () => {

  it('Dec 31 19:00 -> Jan 1 10:30 (year boundary)', () => {
    const input = makeDate(2025, 12, 31, 19, 0, 0);
    const expected = makeDate(2026, 1, 1, 10, 30, 0);
    const result = computeNextSwitchAt(input);
    assert.equal(result.getTime(), expected.getTime(),
      'input=' + formatWallDate(input) + ' expected=' + formatWallDate(expected) + ' got=' + formatWallDate(result));
  });

  it('Jan 31 19:00 -> Feb 1 10:30 (month boundary)', () => {
    const input = makeDate(2025, 1, 31, 19, 0, 0);
    const expected = makeDate(2025, 2, 1, 10, 30, 0);
    const result = computeNextSwitchAt(input);
    assert.equal(result.getTime(), expected.getTime(),
      'input=' + formatWallDate(input) + ' expected=' + formatWallDate(expected) + ' got=' + formatWallDate(result));
  });

  it('Feb 28 (non-leap) 19:00 -> Mar 1 10:30', () => {
    const input = makeDate(2025, 2, 28, 19, 0, 0);
    const expected = makeDate(2025, 3, 1, 10, 30, 0);
    const result = computeNextSwitchAt(input);
    assert.equal(result.getTime(), expected.getTime(),
      'input=' + formatWallDate(input) + ' expected=' + formatWallDate(expected) + ' got=' + formatWallDate(result));
  });

  it('Feb 29 (leap) 19:00 -> Mar 1 10:30', () => {
    const input = makeDate(2024, 2, 29, 19, 0, 0);
    const expected = makeDate(2024, 3, 1, 10, 30, 0);
    const result = computeNextSwitchAt(input);
    assert.equal(result.getTime(), expected.getTime(),
      'input=' + formatWallDate(input) + ' expected=' + formatWallDate(expected) + ' got=' + formatWallDate(result));
  });

});

// ─────────────────────────────────────────────────────────────
// One-shot content-type frameId verification
// ─────────────────────────────────────────────────────────────

describe('one-shot frameId — content type determines prefix', () => {

  it('buildNewsSnapshot constructs frameId starting with "news:"', () => {
    const src = computeNextSwitchAt.toString(); // not used; we inspect the source
    const serverPath = path.join(__dirname, '..', '..', '..', 'server.js');
    const serverSrc = fs.readFileSync(serverPath, 'utf8');
    // In buildNewsSnapshot, the frameId is constructed as:  frameId: `news:${sha1(...)}`
    const newsFrameLine = serverSrc.match(/frameId:\s*`news:\$\{sha1\(/);
    assert.notEqual(newsFrameLine, null, 'buildNewsSnapshot frameId should start with "news:"');
  });

  it('buildPhotoSnapshot constructs frameId starting with "photo:"', () => {
    const serverPath = path.join(__dirname, '..', '..', '..', 'server.js');
    const serverSrc = fs.readFileSync(serverPath, 'utf8');
    // In buildPhotoSnapshot, the frameId is constructed with:  const frameId = `photo:${snapshot.slotKey}:...`
    const photoFrameLine = serverSrc.match(/const\s+frameId\s*=\s*`photo:\$\{snapshot\.slotKey\}/);
    assert.notEqual(photoFrameLine, null, 'buildPhotoSnapshot frameId should start with "photo:"');
  });

  it('one-shot handler calls buildNewsSnapshot for news content type', () => {
    const serverPath = path.join(__dirname, '..', '..', '..', 'server.js');
    const serverSrc = fs.readFileSync(serverPath, 'utf8');
    // The one-shot handler uses contentType to branch:
    //   if (contentType === 'news') { osContent = await buildNewsSnapshot(osNow); }
    const newsBranch = serverSrc.match(/if\s*\(contentType\s*===\s*['"]news['"]\)\s*\{[^}]*buildNewsSnapshot/);
    assert.notEqual(newsBranch, null, 'one-shot handler should call buildNewsSnapshot for news content');
  });

  it('one-shot handler calls buildPhotoSnapshot or buildPhotoSnapshotFromAsset for photo content', () => {
    const serverPath = path.join(__dirname, '..', '..', '..', 'server.js');
    const serverSrc = fs.readFileSync(serverPath, 'utf8');
    // Photo with explicit assetId → buildPhotoSnapshotFromAsset
    const assetBranch = serverSrc.match(/buildPhotoSnapshotFromAsset/);
    // Photo without assetId → buildPhotoSnapshot (the else branch)
    const photoBranch = serverSrc.match(/else\s*\{[^}]*\n[^}]*buildPhotoSnapshot\b/);
    assert.notEqual(assetBranch, null, 'one-shot handler should call buildPhotoSnapshotFromAsset when assetId provided');
    assert.notEqual(photoBranch, null, 'one-shot handler should call buildPhotoSnapshot when no assetId');
  });

  it('one-shot response osFrameId uses "one-shot:{contentType}:" prefix', () => {
    const serverPath = path.join(__dirname, '..', '..', '..', 'server.js');
    const serverSrc = fs.readFileSync(serverPath, 'utf8');
    // Line 3466: var osFrameId = 'one-shot:' + contentType + ':' + Date.now().toString(36);
    const osFrameIdLine = serverSrc.match(/var\s+osFrameId\s*=\s*['"]one-shot:['"]\s*\+\s*contentType/);
    assert.notEqual(osFrameIdLine, null, 'osFrameId should use "one-shot:{contentType}:" prefix');
  });

  it('frameId prefix determined by actual content type, not by current auto mode', () => {
    const serverPath = path.join(__dirname, '..', '..', '..', 'server.js');
    const serverSrc = fs.readFileSync(serverPath, 'utf8');
    // Verify the one-shot handler never reads the runtime auto mode to determine frameId prefix.
    // The contentType variable comes from the request body, not from the runtime operating mode.
    const readsAutoMode = serverSrc.match(/one-shot[^}]*runtime\.\w+.*mode[^}]*frameId/);
    // Verify the contentType is sourced from request body
    const contentTypeFromBody = serverSrc.match(/contentType\s*=\s*String\(osBody\.contentType/);
    assert.notEqual(contentTypeFromBody, null, 'contentType must come from request body, not auto mode');
    // The frameId prefix is determined by contentType (request body), which represents actual content
    assert.equal(readsAutoMode, null, 'one-shot handler should not read auto mode for frameId prefix');
  });

  it('one-shot snapshot mode matches content type ("news" or "photo")', () => {
    const serverPath = path.join(__dirname, '..', '..', '..', 'server.js');
    const serverSrc = fs.readFileSync(serverPath, 'utf8');
    // createSnapshot is called with contentType as the mode parameter:
    // R3_snapshotModel.createSnapshot(osFrameId, osContent.snapshot, osContent.frame, contentType, ...)
    const snapModeMatch = serverSrc.match(/createSnapshot\([^)]*contentType/);
    assert.notEqual(snapModeMatch, null, 'snapshot mode should be set from contentType');
  });

  it('buildNewsSnapshot frameId uses "news:" prefix via sha1 hash of items', () => {
    const serverPath = path.join(__dirname, '..', '..', '..', 'server.js');
    const serverSrc = fs.readFileSync(serverPath, 'utf8');
    // Check the exact pattern: frameId: `news:${sha1(...)}`
    const exactPattern = serverSrc.match(/frameId:\s*`news:\$\{sha1\(/);
    assert.notEqual(exactPattern, null, 'buildNewsSnapshot should use news:sha1(...) frameId pattern');
  });

  it('buildPhotoSnapshot frameId uses "photo:" prefix with slotKey, kind, theme, contentId', () => {
    const serverPath = path.join(__dirname, '..', '..', '..', 'server.js');
    const serverSrc = fs.readFileSync(serverPath, 'utf8');
    // Check: const frameId = `photo:${snapshot.slotKey}:${displayKind}:${selection.theme}:${contentId}`
    const photoPattern = serverSrc.match(/const\s+frameId\s*=\s*`photo:\$\{snapshot\.slotKey\}:\$\{displayKind\}:\$\{selection\.theme\}:\$\{contentId\}`/);
    assert.notEqual(photoPattern, null, 'buildPhotoSnapshot should use photo:slotKey:kind:theme:contentId pattern');
  });

});
