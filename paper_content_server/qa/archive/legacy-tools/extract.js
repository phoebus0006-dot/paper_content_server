const fs = require('fs');
const path = require('path');

const sPath = path.join(__dirname, 'server.js');
let s = fs.readFileSync(sPath, 'utf8');

const pureLogic = `
const fs = require('fs');
const path = require('path');
const FRAME_WIDTH = 800;
const FRAME_HEIGHT = 480;
const TIMEZONE = process.env.TZ || 'UTC';
const ROOT_DIR = path.join(__dirname, '../..');
const NEWS_REFRESH_MINUTES = 15;
const NEWS_MAX_ITEMS = 6;

function getWallTime(d, tz) {
  var str = d.toLocaleString('en-US', { timeZone: tz, hour12: false });
  var p = str.match(/(\\d+)\\/(\\d+)\\/(\\d+), (\\d+):(\\d+):(\\d+)/);
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

function computeNextSwitchAt(now) {
  const t = getWallTime(now, TIMEZONE);
  let year = t.year; let month = t.month; let day = t.day; let hour = t.hour; let minute = 0;
  if (t.hour < 10) { hour = 10; minute = 0; }
  else if (t.hour >= 19) {
    const next = new Date(Date.UTC(year, month - 1, day + 1, 12));
    const nextWall = getWallTime(next, TIMEZONE);
    year = nextWall.year; month = nextWall.month; day = nextWall.day;
    hour = 10; minute = 0;
  } else if (t.minute < 30) { hour = t.hour; minute = 30; }
  else if (t.hour === 18) { hour = 19; minute = 0; }
  else { hour = t.hour + 1; minute = 0; }
  return dateFromWallTime({ year, month, day, hour, minute, second: 0 }, TIMEZONE);
}

function computeNextHalfHourBoundary(now, tz) {
  const t = getWallTime(now, tz || TIMEZONE);
  let year = t.year, month = t.month, day = t.day, hour = t.hour, minute = 0;
  if (t.minute < 30) { minute = 30; } else { hour = t.hour + 1; minute = 0; }
  return dateFromWallTime({ year, month, day, hour, minute, second: 0 }, tz || TIMEZONE);
}

function resolveAllowedImagePath(requestedPath) {
  if (!requestedPath) return null;
  let absPath = path.isAbsolute(requestedPath) ? requestedPath : path.join(ROOT_DIR, requestedPath);
  try {
    let resolved = fs.realpathSync(absPath);
    let stat = fs.lstatSync(resolved);
    if (!stat.isFile()) return null;
    let allowedDirs = [ path.join(ROOT_DIR, 'data'), path.join(ROOT_DIR, 'public'), path.join(ROOT_DIR, 'src') ];
    let isAllowed = false;
    for (let d of allowedDirs) {
      if (resolved.startsWith(fs.realpathSync(d))) { isAllowed = true; break; }
    }
    return isAllowed ? resolved : null;
  } catch(e) { return null; }
}

function isImageReady(entry) {
  if (!entry || !entry.id || !entry.theme) return false;
  if (!entry.processedPngPath) return false;
  var ppAbs = resolveAllowedImagePath(entry.processedPngPath);
  if (!ppAbs || !fs.existsSync(ppAbs)) return false;
  if (entry.width !== FRAME_WIDTH || entry.height !== FRAME_HEIGHT) return false;
  return true;
}

function isImageApproved(entry) {
  return entry && entry.safetyStatus === 'approved';
}

function isStudySelectable(entry) {
  return isImageReady(entry) && isImageApproved(entry) && entry.poolType === 'study_frames';
}

function getImageKind(entry) {
  return entry && entry.kind === 'storyboard' ? 'storyboard' : 'shot';
}

function groupImagesByKindAndTheme(imageIndex) {
  const result = { shot: new Map(), storyboard: new Map() };
  for (const entry of imageIndex || []) {
    if (!isImageReady(entry)) continue;
    const kind = getImageKind(entry);
    const theme = String(entry.theme || 'unknown').toLowerCase();
    if (!result[kind].has(theme)) result[kind].set(theme, []);
    result[kind].get(theme).push(entry);
  }
  return result;
}

function updateLibraryStateForPhoto(libraryState, imagesByKindAndTheme) {
  if (!libraryState) return { updated: false, state: libraryState };
  let st = Object.assign({}, libraryState);
  let kinds = ['shot', 'storyboard'];
  let k = st.currentKind || 'shot';
  let t = st.currentTheme || null;
  let tList = Array.from(imagesByKindAndTheme[k].keys());
  if (tList.length === 0) return { updated: false, state: st };
  if (!t || !imagesByKindAndTheme[k].has(t) || st.remainingThemeSlots <= 0) {
    st.themeCursor = ((st.themeCursor || 0) + 1) % tList.length;
    st.currentTheme = tList[st.themeCursor];
    st.currentImageIndex = 0;
    st.remainingThemeSlots = Math.floor(Math.random() * 2) + 2; 
  } else {
    st.remainingThemeSlots--;
    st.currentImageIndex++;
  }
  return { updated: true, state: st };
}

function selectStudyPhoto(now, imageIndex, libraryState) {
  const grouped = groupImagesByKindAndTheme(imageIndex.filter(isStudySelectable));
  const upd = updateLibraryStateForPhoto(libraryState || {}, grouped);
  const st = upd.state;
  const t = st.currentTheme;
  const k = st.currentKind || 'shot';
  let list = grouped[k].get(t) || [];
  if (list.length === 0) return { entry: null, state: st };
  const e = list[st.currentImageIndex % list.length];
  return { entry: e, state: st };
}

function selectPhotoSnapshot(now, imageIndex) {
  return {
    mode: 'photo',
    slotKey: 'photo:' + now.getTime(),
    nextSwitchAt: computeNextSwitchAt(now)
  };
}

module.exports = {
  getWallTime, dateFromWallTime, computeNextSwitchAt, computeNextHalfHourBoundary,
  resolveAllowedImagePath, isImageReady, isImageApproved, isStudySelectable,
  getImageKind, groupImagesByKindAndTheme, updateLibraryStateForPhoto, selectStudyPhoto,
  selectPhotoSnapshot
};
`;

if (!fs.existsSync(path.join(__dirname, 'src'))) fs.mkdirSync(path.join(__dirname, 'src'));
if (!fs.existsSync(path.join(__dirname, 'src/app'))) fs.mkdirSync(path.join(__dirname, 'src/app'));
fs.writeFileSync(path.join(__dirname, 'src/app/pure-logic.js'), pureLogic);

const fnsToRemove = [
  'getWallTime', 'dateFromWallTime', 'computeNextSwitchAt', 
  'isImageReady', 'isImageApproved', 'isStudySelectable', 'getImageKind', 
  'groupImagesByKindAndTheme', 'updateLibraryStateForPhoto', 'selectStudyPhoto',
  'selectPhotoSnapshot'
];
for (const fn of fnsToRemove) {
  const re = new RegExp('function ' + fn + '\\b[^{]*\\{');
  const match = s.match(re);
  if (match) {
    let start = match.index;
    let end = start + match[0].length;
    let depth = 1;
    while(end < s.length && depth > 0) {
      if (s[end] === '{') depth++;
      else if (s[end] === '}') depth--;
      end++;
    }
    s = s.replace(s.substring(start, end), '');
  }
}

const reqStr = `const { getWallTime, dateFromWallTime, computeNextSwitchAt, computeNextHalfHourBoundary, resolveAllowedImagePath, isImageReady, isImageApproved, isStudySelectable, getImageKind, groupImagesByKindAndTheme, updateLibraryStateForPhoto, selectStudyPhoto, selectPhotoSnapshot } = require('./src/app/pure-logic');`;
s = reqStr + '\n' + s;
fs.writeFileSync(sPath, s);

const tests = [
  'scripts/photo-safety-test.js',
  'scripts/storyboard-source-test.js',
  'scripts/rotation-test.js',
  'scripts/schedule-test.js'
];
for (const t of tests) {
  const tPath = path.join(__dirname, t);
  if (!fs.existsSync(tPath)) continue;
  let c = fs.readFileSync(tPath, 'utf8');
  c = c.replace(/require\(path\.join\(ROOT, 'server\.js'\)\)/g, "require(path.join(ROOT, 'src/app/pure-logic.js'))");
  fs.writeFileSync(tPath, c);
}

console.log('Extraction complete');
