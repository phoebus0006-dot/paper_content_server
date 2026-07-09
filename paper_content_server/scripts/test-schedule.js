#!/usr/bin/env node

const { getWallTime, computeNextSwitchAt, selectPhotoSnapshot } = require('../server.js');

const TIMEZONE = 'Europe/Paris';

function makeDate(iso) {
  return new Date(`${iso}+02:00`);
}

const cases = [
  { iso: '2026-07-08T08:00:00', expectedMode: 'photo', expectedNext: '2026-07-08T10:30:00' },
  { iso: '2026-07-08T10:15:00', expectedMode: 'photo', expectedNext: '2026-07-08T10:30:00' },
  { iso: '2026-07-08T10:30:00', expectedMode: 'news', expectedNext: '2026-07-08T11:00:00' },
  { iso: '2026-07-08T11:45:00', expectedMode: 'news', expectedNext: '2026-07-08T12:00:00' },
  { iso: '2026-07-08T14:00:00', expectedMode: 'photo', expectedNext: '2026-07-08T14:30:00' },
  { iso: '2026-07-08T18:30:00', expectedMode: 'news', expectedNext: '2026-07-08T19:00:00' },
  { iso: '2026-07-08T19:15:00', expectedMode: 'photo', expectedNext: '2026-07-09T10:30:00' },
  { iso: '2026-07-08T23:00:00', expectedMode: 'photo', expectedNext: '2026-07-09T10:30:00' },
];

let passed = 0;
let failed = 0;

for (const test of cases) {
  const date = makeDate(test.iso);
  const wall = getWallTime(date, TIMEZONE);
  const snapshot = selectPhotoSnapshot(date, []);
  const nextLocal = `${wall.year}-${String(wall.month).padStart(2, '0')}-${String(wall.day).padStart(2, '0')}T${String(snapshot.nextSwitchAt.getHours()).padStart(2, '0')}:${String(snapshot.nextSwitchAt.getMinutes()).padStart(2, '0')}:00`;
  const expectedNextDate = makeDate(test.expectedNext);
  const ok = snapshot.mode === test.expectedMode && snapshot.nextSwitchAt.getTime() === expectedNextDate.getTime();
  if (ok) {
    passed++;
    console.log(`OK   ${test.iso} -> mode=${snapshot.mode} next=${nextLocal}`);
  } else {
    failed++;
    console.log(`FAIL ${test.iso} -> mode=${snapshot.mode} (expected ${test.expectedMode}) next=${snapshot.nextSwitchAt.toISOString()} (expected ${expectedNextDate.toISOString()})`);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
