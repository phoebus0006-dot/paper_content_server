// Schedule test: directly tests resolveDisplayMode with wall time objects
// No timezone conversion needed — wallTime is already in target timezone

function resolveDisplayMode(wallTime) {
  const dateKey = `${wallTime.year}-${String(wallTime.month).padStart(2, '0')}-${String(wallTime.day).padStart(2, '0')}`;
  const inWindow = wallTime.hour >= 10 && wallTime.hour < 19;
  const mode = inWindow && wallTime.minute >= 30 ? 'news' : 'photo';
  const slotKey = inWindow
    ? `${dateKey}T${String(wallTime.hour).padStart(2, '0')}:${wallTime.minute >= 30 ? '30' : '00'}`
    : `${dateKey}:offhours`;
  return { mode, slotKey };
}

const tests = [
  { label: '09:59', hour: 9, minute: 59, expected: 'photo' },
  { label: '10:00', hour: 10, minute: 0, expected: 'photo' },
  { label: '10:01', hour: 10, minute: 1, expected: 'photo' },
  { label: '10:29', hour: 10, minute: 29, expected: 'photo' },
  { label: '10:30', hour: 10, minute: 30, expected: 'news' },
  { label: '10:31', hour: 10, minute: 31, expected: 'news' },
  { label: '10:59', hour: 10, minute: 59, expected: 'news' },
  { label: '11:00', hour: 11, minute: 0, expected: 'photo' },
  { label: '11:29', hour: 11, minute: 29, expected: 'photo' },
  { label: '11:30', hour: 11, minute: 30, expected: 'news' },
  { label: '11:59', hour: 11, minute: 59, expected: 'news' },
  { label: '18:00', hour: 18, minute: 0, expected: 'photo' },
  { label: '18:30', hour: 18, minute: 30, expected: 'news' },
  { label: '18:59', hour: 18, minute: 59, expected: 'news' },
  { label: '19:00', hour: 19, minute: 0, expected: 'photo' },
  { label: '19:30', hour: 19, minute: 30, expected: 'photo' },
  { label: '20:00', hour: 20, minute: 0, expected: 'photo' },
  { label: '23:30', hour: 23, minute: 30, expected: 'photo' },
];

let passed = 0;
let failed = 0;

console.log('=== Schedule Test (wall time / Europe/Paris) ===\n');

for (const test of tests) {
  const wall = { year: 2026, month: 7, day: 9, hour: test.hour, minute: test.minute, second: 0 };
  const result = resolveDisplayMode(wall);
  const ok = result.mode === test.expected;
  const wallStr = `${String(wall.hour).padStart(2, '0')}:${String(wall.minute).padStart(2, '0')}`;
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`${mark} ${test.label} -> ${result.mode} (expected ${test.expected}) slot=${result.slotKey}`);
  if (ok) passed++; else failed++;
}

console.log(`\n${passed} passed, ${failed} failed out of ${tests.length} tests`);

// Cross-boundary consistency
console.log('\n=== Boundary Crossing Check ===');
const wall1 = resolveDisplayMode({ year: 2026, month: 7, day: 9, hour: 10, minute: 29, second: 59 });
const wall2 = resolveDisplayMode({ year: 2026, month: 7, day: 9, hour: 10, minute: 30, second: 0 });
console.log(`10:29:59 -> ${wall1.mode} slot=${wall1.slotKey}`);
console.log(`10:30:00 -> ${wall2.mode} slot=${wall2.slotKey}`);
console.log(`Boundary: ${wall1.mode !== wall2.mode ? 'DIFFERENT (expected)' : 'SAME (unexpected)'}`);

process.exit(failed > 0 ? 1 : 0);
