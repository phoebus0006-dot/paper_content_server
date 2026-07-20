const fs = require('fs');
let p = fs.readFileSync('src/app/pure-logic.js', 'utf8');
const code = `
function computeNextHalfHourBoundary(now, tz) {
  const t = getWallTime(now, tz || TIMEZONE);
  let year = t.year, month = t.month, day = t.day, hour = t.hour, minute = 0;
  if (t.minute < 30) { minute = 30; } else { hour = t.hour + 1; minute = 0; }
  return dateFromWallTime({ year, month, day, hour, minute, second: 0 }, tz || TIMEZONE);
}
`;
if (!p.includes('function computeNextHalfHourBoundary')) {
  p = p.replace('module.exports = {', code + '\nmodule.exports = {');
  fs.writeFileSync('src/app/pure-logic.js', p);
}
