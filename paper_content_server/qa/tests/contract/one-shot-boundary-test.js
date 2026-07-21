const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// ── Inlined computeNextSwitchAt with its dependencies ──
// These are copied from server.js so the test can run without requiring
// the full server module (which would trigger app startup).
// The production implementation lives in server.js:computeNextSwitchAt (line 2223).

function formatDateParts(date, timeZone) {
  var parts;
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(new Date(date));
  } catch (e) {
    parts = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(new Date(date));
  }
  var map = Object.fromEntries(parts.map(function(p) { return [p.type, p.value]; }));
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour,
    minute: map.minute,
    second: map.second,
  };
}

function getWallTime(date, timeZone) {
  var parts = formatDateParts(date, timeZone);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function getTimeZoneOffsetMinutes(date, timeZone) {
  var utcString = date.toLocaleString('en-US', { timeZone: 'UTC' });
  var tzString = date.toLocaleString('en-US', { timeZone: timeZone });
  var utcDate = new Date(utcString);
  var tzDate = new Date(tzString);
  return (utcDate.getTime() - tzDate.getTime()) / 60000;
}

function dateFromWallTime(_a, timeZone) {
  var year = _a.year, month = _a.month, day = _a.day, hour = _a.hour, minute = _a.minute, second = _a.second;
  var candidate = new Date(Date.UTC(year, month - 1, day, hour, minute, second || 0));
  for (var attempt = 0; attempt < 3; attempt++) {
    var offsetMinutes = getTimeZoneOffsetMinutes(candidate, timeZone);
    candidate = new Date(Date.UTC(year, month - 1, day, hour, minute, second || 0) + offsetMinutes * 60000);
    var wall = getWallTime(candidate, timeZone);
    if (wall.year === year && wall.month === month && wall.day === day && wall.hour === hour && wall.minute === minute) {
      return candidate;
    }
  }
  return candidate;
}

function computeNextSwitchAt(now, timeZone) {
  var t = getWallTime(now, timeZone);
  var year = t.year;
  var month = t.month;
  var day = t.day;
  var hour = 0;
  var minute = 0;

  if (t.hour < 10) {
    hour = 10;
    minute = 30;
  } else if (t.hour >= 19) {
    var next = new Date(Date.UTC(year, month - 1, day + 1, 12));
    var nextWall = getWallTime(next, timeZone);
    year = nextWall.year;
    month = nextWall.month;
    day = nextWall.day;
    hour = 10;
    minute = 30;
  } else if (t.minute < 30) {
    hour = t.hour;
    minute = 30;
  } else if (t.hour === 18) {
    hour = 19;
    minute = 0;
  } else {
    hour = t.hour + 1;
    minute = 0;
  }

  return dateFromWallTime({ year: year, month: month, day: day, hour: hour, minute: minute, second: 0 }, timeZone);
}

// ── Test helper ──

function makeUTCDate(year, month, day, hour, minute, second) {
  // month is 0-based for Date.UTC
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second || 0));
}

function toUTCHoursMinutes(date) {
  return date.getUTCHours() + ':' + String(date.getUTCMinutes()).padStart(2, '0');
}

function formatUTCDate(date) {
  return date.getUTCFullYear() + '-' +
    String(date.getUTCMonth() + 1).padStart(2, '0') + '-' +
    String(date.getUTCDate()).padStart(2, '0') + ' ' +
    String(date.getUTCHours()).padStart(2, '0') + ':' +
    String(date.getUTCMinutes()).padStart(2, '0') + ':' +
    String(date.getUTCSeconds()).padStart(2, '0');
}

// Use UTC timezone for fully deterministic tests (no DST edge cases)
var TZ = 'UTC';

describe('computeNextSwitchAt — boundary cases (UTC)', () => {

  var cases = [
    // [label, input date (UTC), expected next switch output (UTC)]
    // Before active window: switch to 10:30 same day
    ['08:00 -> 10:30',       makeUTCDate(2025, 6, 15, 8, 0, 0),     makeUTCDate(2025, 6, 15, 10, 30, 0)],
    ['08:12 -> 10:30',       makeUTCDate(2025, 6, 15, 8, 12, 0),    makeUTCDate(2025, 6, 15, 10, 30, 0)],
    ['08:29:59 -> 10:30',    makeUTCDate(2025, 6, 15, 8, 29, 59),   makeUTCDate(2025, 6, 15, 10, 30, 0)],
    // Active window start boundary
    ['08:30 -> 10:30',       makeUTCDate(2025, 6, 15, 8, 30, 0),    makeUTCDate(2025, 6, 15, 10, 30, 0)],
    // Mid-morning
    ['09:00 -> 10:30',       makeUTCDate(2025, 6, 15, 9, 0, 0),     makeUTCDate(2025, 6, 15, 10, 30, 0)],
    // Before half-hour boundary
    ['10:29 -> 10:30',       makeUTCDate(2025, 6, 15, 10, 29, 0),   makeUTCDate(2025, 6, 15, 10, 30, 0)],
    // Half-hour boundary: next 30-min slot
    ['10:30 -> 11:00',       makeUTCDate(2025, 6, 15, 10, 30, 0),   makeUTCDate(2025, 6, 15, 11, 0, 0)],
    ['10:42 -> 11:00',       makeUTCDate(2025, 6, 15, 10, 42, 0),   makeUTCDate(2025, 6, 15, 11, 0, 0)],
    // Pre-hour boundary
    ['10:59:59 -> 11:00',    makeUTCDate(2025, 6, 15, 10, 59, 59),  makeUTCDate(2025, 6, 15, 11, 0, 0)],
    // Hour boundary
    ['11:00 -> 11:30',       makeUTCDate(2025, 6, 15, 11, 0, 0),    makeUTCDate(2025, 6, 15, 11, 30, 0)],
    // Late afternoon → last slot before 19:00
    ['18:00 -> 18:30',       makeUTCDate(2025, 6, 15, 18, 0, 0),    makeUTCDate(2025, 6, 15, 18, 30, 0)],
    ['18:30 -> 19:00',       makeUTCDate(2025, 6, 15, 18, 30, 0),   makeUTCDate(2025, 6, 15, 19, 0, 0)],
    // After active window: next day 10:30
    ['19:00 -> next day 10:30',       makeUTCDate(2025, 6, 15, 19, 0, 0),    makeUTCDate(2025, 6, 16, 10, 30, 0)],
    ['21:12 -> next day 10:30',       makeUTCDate(2025, 6, 15, 21, 12, 0),   makeUTCDate(2025, 6, 16, 10, 30, 0)],
    ['23:45 -> next day 10:30',       makeUTCDate(2025, 6, 15, 23, 45, 0),   makeUTCDate(2025, 6, 16, 10, 30, 0)],
    ['23:59:59 -> next day 10:30',    makeUTCDate(2025, 6, 15, 23, 59, 59),  makeUTCDate(2025, 6, 16, 10, 30, 0)],
  ];

  cases.forEach(function(_a) {
    var label = _a[0], input = _a[1], expected = _a[2];
    it(label, function() {
      var result = computeNextSwitchAt(input, TZ);
      assert.equal(result.getTime(), expected.getTime(),
        'input=' + formatUTCDate(input) + ' expected=' + formatUTCDate(expected) + ' got=' + formatUTCDate(result));
    });
  });

  // Month/year boundary: rollover from Dec 31 -> Jan 1
  it('year boundary: Dec 31 23:00 -> Jan 1 10:30', function() {
    var input = makeUTCDate(2025, 12, 31, 23, 0, 0);
    var expected = makeUTCDate(2026, 1, 1, 10, 30, 0);
    var result = computeNextSwitchAt(input, TZ);
    assert.equal(result.getTime(), expected.getTime(),
      'expected=' + formatUTCDate(expected) + ' got=' + formatUTCDate(result));
  });

  // Month boundary: Jan 31 23:00 -> Feb 1 10:30
  it('month boundary: Jan 31 23:00 -> Feb 1 10:30', function() {
    var input = makeUTCDate(2025, 1, 31, 23, 0, 0);
    var expected = makeUTCDate(2025, 2, 1, 10, 30, 0);
    var result = computeNextSwitchAt(input, TZ);
    assert.equal(result.getTime(), expected.getTime(),
      'expected=' + formatUTCDate(expected) + ' got=' + formatUTCDate(result));
  });

  // Edge: exactly at 10:30 → next slot is 11:00
  it('exactly at 10:30 -> 11:00 (half-hour boundary)', function() {
    var input = makeUTCDate(2025, 6, 15, 10, 30, 0);
    var result = computeNextSwitchAt(input, TZ);
    assert.equal(result.getUTCHours(), 11);
    assert.equal(result.getUTCMinutes(), 0);
  });

  // Edge: exactly at 18:30 → last slot ends at 19:00
  it('exactly at 18:30 -> 19:00 (last slot boundary)', function() {
    var input = makeUTCDate(2025, 6, 15, 18, 30, 0);
    var result = computeNextSwitchAt(input, TZ);
    assert.equal(result.getUTCHours(), 19);
    assert.equal(result.getUTCMinutes(), 0);
  });

  // Edge: exactly at 19:00 → next day
  it('exactly at 19:00 -> next day 10:30', function() {
    var input = makeUTCDate(2025, 6, 15, 19, 0, 0);
    var result = computeNextSwitchAt(input, TZ);
    assert.equal(result.getUTCDate(), 16);
    assert.equal(result.getUTCHours(), 10);
    assert.equal(result.getUTCMinutes(), 30);
  });

  // Leap year: Feb 28 23:00 -> Mar 1 10:30 (non-leap)
  it('non-leap Feb 28 23:00 -> Mar 1 10:30', function() {
    var input = makeUTCDate(2025, 2, 28, 23, 0, 0);
    var expected = makeUTCDate(2025, 3, 1, 10, 30, 0);
    var result = computeNextSwitchAt(input, TZ);
    assert.equal(result.getTime(), expected.getTime());
  });

  // Leap year: Feb 29 23:00 -> Mar 1 10:30 (leap year 2024)
  it('leap Feb 29 23:00 -> Mar 1 10:30', function() {
    var input = makeUTCDate(2024, 2, 29, 23, 0, 0);
    var expected = makeUTCDate(2024, 3, 1, 10, 30, 0);
    var result = computeNextSwitchAt(input, TZ);
    assert.equal(result.getTime(), expected.getTime());
  });

});
