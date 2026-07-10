function ProductionClock() {
  return {
    now: function() { return new Date(); },
    nowMs: function() { return Date.now(); },
    timezone: function() { return Intl.DateTimeFormat().resolvedOptions().timeZone; },
  };
}
function TestClock(fixedTime, tz) {
  var fixed = fixedTime || new Date('2026-07-09T10:00:00Z');
  var zone = tz || 'Europe/Paris';
  return {
    now: function() { return new Date(fixed.getTime()); },
    nowMs: function() { return fixed.getTime(); },
    timezone: function() { return zone; },
    advanceMs: function(ms) { fixed = new Date(fixed.getTime() + ms); },
    setTime: function(d) { fixed = new Date(d); },
  };
}
module.exports = { ProductionClock, TestClock };
