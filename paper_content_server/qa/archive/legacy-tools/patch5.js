const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SERVER_JS = path.join(ROOT, 'server.js');
const PURE_JS = path.join(ROOT, 'src/app/pure-logic.js');

let pureCode = fs.readFileSync(PURE_JS, 'utf8');

const purePrefix = `const fs = require('fs');
const path = require('path');
const FRAME_WIDTH = 800;
const FRAME_HEIGHT = 480;
const TIMEZONE = process.env.TZ || 'UTC';
const ROOT_DIR = path.join(__dirname, '../../..');

// Helpers for time bounds
function getWallTime(d, tz) {
  var s = d.toLocaleString('en-US', { timeZone: tz, hour12: false });
  var p = s.match(/(\\d+)\\/(\\d+)\\/(\\d+), (\\d+):(\\d+):(\\d+)/);
  if (!p) return { year: d.getUTCFullYear(), month: d.getUTCMonth()+1, day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds() };
  var h = parseInt(p[4], 10); if (h === 24) h = 0;
  return { year: parseInt(p[3], 10), month: parseInt(p[1], 10), day: parseInt(p[2], 10), hour: h, minute: parseInt(p[5], 10), second: parseInt(p[6], 10) };
}
function dateFromWallTime(t, tz) {
  var s = t.year + '-' + String(t.month).padStart(2, '0') + '-' + String(t.day).padStart(2, '0') + 'T' + String(t.hour).padStart(2, '0') + ':' + String(t.minute).padStart(2, '0') + ':' + String(t.second).padStart(2, '0');
  var dt = new Date(s + 'Z');
  if (tz === 'UTC') return dt;
  var offsetMs = 0;
  for (var i = 0; i < 3; i++) {
    var check = getWallTime(new Date(dt.getTime() - offsetMs), tz);
    var err = (check.hour * 3600 + check.minute * 60) - (t.hour * 3600 + t.minute * 60);
    if (err > 43200) err -= 86400; if (err < -43200) err += 86400;
    if (err === 0) break;
    offsetMs += err * 1000;
  }
  return new Date(dt.getTime() - offsetMs);
}

function resolveAllowedImagePath(requestedPath) {
  if (!requestedPath) return null;
  let absPath = path.isAbsolute(requestedPath) ? requestedPath : path.join(ROOT_DIR, requestedPath);
  try {
    let resolved = fs.realpathSync(absPath);
    let stat = fs.lstatSync(resolved);
    if (!stat.isFile()) return null;
    let allowedDirs = [
      path.join(ROOT_DIR, 'data'),
      path.join(ROOT_DIR, 'public'),
      path.join(ROOT_DIR, 'src')
    ];
    let isAllowed = false;
    for (let d of allowedDirs) {
      if (resolved.startsWith(fs.realpathSync(d))) {
        isAllowed = true;
        break;
      }
    }
    return isAllowed ? resolved : null;
  } catch(e) {
    return null;
  }
}
`;

const pureSuffix = `
module.exports = {
  isImageReady, isImageApproved, isStudySelectable, computeNextSwitchAt, computeNextHalfHourBoundary, selectStudyPhoto, selectPhotoSnapshot, selectNewsItems
};
`;

fs.writeFileSync(PURE_JS, purePrefix + '\\n' + pureCode + '\\n' + pureSuffix);

let serverCode = fs.readFileSync(SERVER_JS, 'utf8');
const requireStr = `const { isImageReady, isImageApproved, isStudySelectable, computeNextSwitchAt, computeNextHalfHourBoundary, selectStudyPhoto, selectPhotoSnapshot, selectNewsItems } = require('./src/app/pure-logic.js');`;
serverCode = requireStr + '\\n' + serverCode;

// Fix selectStudyPhoto refs to missing functions in pure-logic
// Wait, pure-logic might need selectStudyPhoto helpers or use constants, they are self-contained now?
// Wait, `selectPhotoSnapshot` and `selectNewsItems` might depend on other things.
fs.writeFileSync(SERVER_JS, serverCode);

// Fix tests
const tests = [
  'scripts/photo-safety-test.js',
  'scripts/storyboard-source-test.js',
  'scripts/rotation-test.js',
  'scripts/schedule-test.js',
  'scripts/coherence-test.js'
];
for (const t of tests) {
  const tPath = path.join(ROOT, t);
  if (!fs.existsSync(tPath)) continue;
  let c = fs.readFileSync(tPath, 'utf8');
  c = c.replace(/require\([^)]*'server\.js'\)/g, "require(path.join(ROOT, 'src/app/pure-logic.js'))");
  fs.writeFileSync(tPath, c);
}
