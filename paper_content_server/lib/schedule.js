// Schedule resolution for NewsPhoto e-paper server.
// Pure function: resolves display mode from wall time.
// Used by server.js and schedule-test.js — single source of truth.

function resolveDisplayMode(wallTime) {
  const dateKey = wallTime.year + '-' +
    String(wallTime.month).padStart(2, '0') + '-' +
    String(wallTime.day).padStart(2, '0');
  const inWindow = wallTime.hour >= 10 && wallTime.hour < 19;
  const mode = inWindow && wallTime.minute >= 30 ? 'news' : 'photo';
  // Night hours (19:00-09:59) use night START date as slot anchor.
  // 19:00-23:59: night started today. 00:00-09:59: night started yesterday.
  var nightDateKey = dateKey;
  if (!inWindow && wallTime.hour < 10) {
    var prev = new Date(wallTime.year, wallTime.month - 1, wallTime.day - 1);
    nightDateKey = prev.getFullYear() + '-' +
      String(prev.getMonth() + 1).padStart(2, '0') + '-' +
      String(prev.getDate()).padStart(2, '0');
  }
  const slotKey = inWindow
    ? dateKey + 'T' + String(wallTime.hour).padStart(2, '0') +
      ':' + (wallTime.minute >= 30 ? '30' : '00')
    : nightDateKey + ':offhours';
  return { mode: mode, slotKey: slotKey };
}

module.exports = { resolveDisplayMode: resolveDisplayMode };
