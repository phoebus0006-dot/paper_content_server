// Schedule resolution for NewsPhoto e-paper server.
// Pure function: resolves display mode from wall time.
// Used by server.js and schedule-test.js — single source of truth.

function resolveDisplayMode(wallTime) {
  const dateKey = wallTime.year + '-' +
    String(wallTime.month).padStart(2, '0') + '-' +
    String(wallTime.day).padStart(2, '0');
  const inWindow = wallTime.hour >= 10 && wallTime.hour < 19;
  const mode = inWindow && wallTime.minute >= 30 ? 'news' : 'photo';
  const slotKey = inWindow
    ? dateKey + 'T' + String(wallTime.hour).padStart(2, '0') +
      ':' + (wallTime.minute >= 30 ? '30' : '00')
    : dateKey + ':offhours';
  return { mode: mode, slotKey: slotKey };
}

module.exports = { resolveDisplayMode: resolveDisplayMode };
