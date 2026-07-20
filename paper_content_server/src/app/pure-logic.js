let runtime = { libraryState: {} };
function setRuntime(r) { runtime = r; }
const getTimezone = () => (runtime.config && runtime.config.timezone ? runtime.config.timezone : (typeof process !== 'undefined' && process.env.TZ ? process.env.TZ : 'UTC'));
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { resolveDisplayMode } = require('../../lib/schedule');
const ROOT_DIR = path.join(__dirname, '../..');

const DEFAULT_PANEL = 49;

const FRAME_WIDTH = 800;

const FRAME_HEIGHT = 480;

const NEWS_MAX_ITEMS = 6;
// NEWS_MIN_ITEMS 控制 selectNewsItems 触发回退到 fallbackPool 的阈值。
// 之前值为 10，大于 NEWS_MAX_ITEMS(6)，导致只要 24h rotation 池少于 10 条
// 就强制降级到 6h 回退池，深夜/清晨 RSS 更新少时常误触发，重复展示旧闻。
// 改为与 NEWS_MAX_ITEMS 一致：池满 6 条即可走标准路径。

// NEWS_MIN_ITEMS 控制 selectNewsItems 触发回退到 fallbackPool 的阈值。
// 之前值为 10，大于 NEWS_MAX_ITEMS(6)，导致只要 24h rotation 池少于 10 条
// 就强制降级到 6h 回退池，深夜/清晨 RSS 更新少时常误触发，重复展示旧闻。
// 改为与 NEWS_MAX_ITEMS 一致：池满 6 条即可走标准路径。
const NEWS_MIN_ITEMS = 6;

const NEWS_REFRESH_MINUTES = 15;

const NEWS_SHOWN_RECALL_HOURS = 24;

const NEWS_SHOWN_FALLBACK_HOURS = 6;

const CATEGORY_PRIORITY = {
  politics: 60,
  international: 58,
  economy: 56,
  business: 54,
  technology: 52,
  tech: 52,
  culture: 50,
  entertainment: 48,
  movies: 47,
  world: 46,
  science: 45,
  sports: 40,
  sport: 40,
  health: 38,
  travel: 35,
  lifestyle: 30,
  local: 20
};
const SHOT_STORYBOARD_PATTERN = ['shot', 'shot', 'storyboard', 'shot', 'shot', 'storyboard'];

const PHOTO_THEME_POOL = ['cinematic', 'storyboard', 'wide_shot', 'portrait', 'night', 'backlight', 'color', 'motion'];

const PANEL_SIZES = {
  25: {
    width: 600,
    height: 448,
    name: '5.65 inch F'
  },
  49: {
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    name: '7.3 inch E6'
  },
  50: {
    width: 1200,
    height: 1600,
    name: '13.3 inch E6'
  }
};


function resolveAllowedImagePath(requestedPath) {
  if (!requestedPath) return null;
  const path = require('path');
  let absPath = path.isAbsolute(requestedPath) ? requestedPath : path.join(__dirname, requestedPath);
  try {
    let resolved = fs.realpathSync(absPath);
    let stat = fs.lstatSync(resolved);
    if (!stat.isFile()) return null;
    let allowedDirs = [path.join(__dirname, 'data'), path.join(__dirname, 'public'), path.join(__dirname, 'src')];
    let isAllowed = false;
    for (let d of allowedDirs) {
      if (resolved.startsWith(fs.realpathSync(d))) {
        isAllowed = true;
        break;
      }
    }
    return isAllowed ? resolved : null;
  } catch (e) {
    return null;
  }
}

function sha1(text) {
  return crypto.createHash('sha1').update(String(text || '')).digest('hex');
}

function normalizeText(text) {
  return String(text || '').replace(/[\s\u00A0]+/g, ' ').replace(/^\s+|\s+$/g, '');
}

function formatDateParts(date, timeZone = getTimezone()) {
  // 容错：date 为空字符串/undefined/无法解析的字符串时，new Date(date) 得到 Invalid Date，
  // Intl.DateTimeFormat.formatToParts(Invalid Date) 抛 RangeError("Invalid time value")。
  // 该错误会沿 renderNewsSvg → renderNewsFrame → publish/news 一路冒泡导致发布 500。
  // 回退到当前时间，保证渲染链路不因单条新闻时间戳缺失而整体失败。
  var d = new Date(date);
  if (isNaN(d.getTime())) d = new Date();
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).formatToParts(d);
  } catch {
    parts = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).formatToParts(d);
  }
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour,
    minute: map.minute,
    second: map.second
  };
}

function formatDateKey(date) {
  const parts = formatDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getWallTime(date, timeZone = getTimezone()) {
  const parts = formatDateParts(date, timeZone);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
}

function getTimeZoneOffsetMinutes(date, timeZone = getTimezone()) {
  const utcString = date.toLocaleString('en-US', {
    timeZone: 'UTC'
  });
  const tzString = date.toLocaleString('en-US', {
    timeZone
  });
  const utcDate = new Date(utcString);
  const tzDate = new Date(tzString);
  return (utcDate.getTime() - tzDate.getTime()) / 60000;
}

function dateFromWallTime({
  year,
  month,
  day,
  hour,
  minute,
  second
}, timeZone = getTimezone()) {
  let candidate = new Date(Date.UTC(year, month - 1, day, hour, minute, second || 0));
  for (let attempt = 0; attempt < 3; attempt++) {
    const offsetMinutes = getTimeZoneOffsetMinutes(candidate, timeZone);
    candidate = new Date(Date.UTC(year, month - 1, day, hour, minute, second || 0) + offsetMinutes * 60000);
    const wall = getWallTime(candidate, timeZone);
    if (wall.year === year && wall.month === month && wall.day === day && wall.hour === hour && wall.minute === minute) {
      return candidate;
    }
  }
  return candidate;
}

function canonicalUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    for (const key of [...parsed.searchParams.keys()]) {
      if (/utm_|fbclid|gclid|ref|cmp|spm|ncid|session/i.test(key)) parsed.searchParams.delete(key);
    }
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return String(url).trim();
  }
}

function categoryPriority(category) {
  return CATEGORY_PRIORITY[String(category || '').toLowerCase()] || 10;
}

function categoryForRotation(category) {
  const base = String(category || '').toLowerCase();
  if (['politics', 'international', 'world'].includes(base)) return 'politics';
  if (['economy', 'business'].includes(base)) return 'economy';
  if (['technology', 'tech'].includes(base)) return 'technology';
  if (['culture', 'entertainment', 'movies'].includes(base)) return 'culture';
  return base || 'general';
}

function titleHash(title) {
  return sha1(normalizeText(title).toLowerCase());
}

function isRecentlyShown(article, sinceHours) {
  const cutoff = Date.now() - sinceHours * 60 * 60 * 1000;
  const url = canonicalUrl(article.url);
  const hash = titleHash(article.title);
  return runtime.newsRotation.shown.some(entry => {
    if (entry.shownAt && Date.parse(entry.shownAt) < cutoff) return false;
    if (url && canonicalUrl(entry.url) === url) return true;
    return entry.titleHash === hash;
  });
}

function filterByRotation(candidates, minHours) {
  return candidates.filter(article => !isRecentlyShown(article, minHours));
}

function selectNewsItems(candidates, slotKey) {
  let pool = filterByRotation(candidates, NEWS_SHOWN_RECALL_HOURS);
  if (pool.length < NEWS_MIN_ITEMS) {
    pool = filterByRotation(candidates, NEWS_SHOWN_FALLBACK_HOURS);
  }
  const byCategory = new Map();
  for (const article of pool) {
    const group = categoryForRotation(article.category);
    if (!byCategory.has(group)) byCategory.set(group, []);
    byCategory.get(group).push(article);
  }
  for (const list of byCategory.values()) {
    list.sort((left, right) => {
      const score = categoryPriority(right.category) - categoryPriority(left.category);
      if (score !== 0) return score;
      return Date.parse(right.publishedAt) - Date.parse(left.publishedAt);
    });
  }
  const selected = [];
  const usedUrls = new Set();
  const usedHashes = new Set();
  function takeOne(group) {
    const list = byCategory.get(group) || [];
    for (let i = 0; i < list.length; i++) {
      const article = list[i];
      const url = canonicalUrl(article.url);
      const hash = titleHash(article.title);
      if (usedUrls.has(url) || usedHashes.has(hash)) continue;
      selected.push(article);
      if (url) usedUrls.add(url);
      usedHashes.add(hash);
      list.splice(i, 1);
      return true;
    }
    return false;
  }
  takeOne('politics');
  takeOne('economy');
  takeOne('technology');
  takeOne('culture');
  const roundRobinGroups = ['politics', 'economy', 'technology', 'culture', 'general'];
  const pointers = new Map(roundRobinGroups.map(group => [group, 0]));
  while (selected.length < NEWS_MAX_ITEMS) {
    let addedInRound = false;
    for (const group of roundRobinGroups) {
      const list = byCategory.get(group) || [];
      let pointer = pointers.get(group) || 0;
      while (pointer < list.length) {
        const article = list[pointer];
        pointer++;
        const url = canonicalUrl(article.url);
        const hash = titleHash(article.title);
        if (usedUrls.has(url) || usedHashes.has(hash)) continue;
        selected.push(article);
        if (url) usedUrls.add(url);
        usedHashes.add(hash);
        addedInRound = true;
        break;
      }
      pointers.set(group, pointer);
      if (selected.length >= NEWS_MAX_ITEMS) break;
    }
    if (!addedInRound) break;
  }
  if (selected.length < NEWS_MIN_ITEMS) {
    const fallbackPool = candidates.filter(article => {
      const url = canonicalUrl(article.url);
      const hash = titleHash(article.title);
      return !usedUrls.has(url) && !usedHashes.has(hash);
    });
    while (selected.length < NEWS_MIN_ITEMS && fallbackPool.length) {
      const article = fallbackPool.shift();
      const url = canonicalUrl(article.url);
      const hash = titleHash(article.title);
      if (usedUrls.has(url) || usedHashes.has(hash)) continue;
      selected.push(article);
      if (url) usedUrls.add(url);
      usedHashes.add(hash);
    }
  }
  selected.sort((left, right) => {
    const order = {
      politics: 0,
      economy: 1,
      technology: 2,
      culture: 3,
      general: 4
    };
    const leftGroup = categoryForRotation(left.category);
    const rightGroup = categoryForRotation(right.category);
    const orderDiff = (order[leftGroup] ?? 9) - (order[rightGroup] ?? 9);
    if (orderDiff !== 0) return orderDiff;
    return Date.parse(right.publishedAt) - Date.parse(left.publishedAt);
  });
  return selected;
}

function canonicalUrl(u) {
  if (!u) return '';
  return String(u).replace(/[?#].*$/, '').replace(/\/+$/, '').replace(/^https?:\/\//, '').toLowerCase().trim();
}

function isImageReady(entry) {
  if (!entry || !entry.id || !entry.theme) return false;
  if (!entry.processedPngPath) return false;
  // 路径解析统一：相对路径基于 ROOT_DIR，避免 cwd 不对时所有图片被判 not ready
  var pp = entry.processedPngPath;
  var ppAbs = path.isAbsolute(pp) ? pp : path.join(ROOT_DIR, pp);
  if (!fs.existsSync(ppAbs)) return false;
  if (entry.width !== FRAME_WIDTH || entry.height !== FRAME_HEIGHT) return false;
  return true;
}

function isImageApproved(entry) { return entry && entry.safetyStatus === 'approved'; }

function isStudySelectable(entry) {
  return isImageReady(entry) && isImageApproved(entry) && entry.poolType === 'study_frames';
}

function getImageKind(entry) {
  return entry && entry.kind === 'storyboard' ? 'storyboard' : 'shot';
}

function groupImagesByKindAndTheme(imageIndex) {
  const result = {
    shot: new Map(),
    storyboard: new Map()
  };
  for (const entry of imageIndex || []) {
    if (!isImageReady(entry)) continue;
    const kind = getImageKind(entry);
    const theme = String(entry.theme || 'unknown').toLowerCase();
    if (!result[kind].has(theme)) result[kind].set(theme, []);
    result[kind].get(theme).push(entry);
  }
  return result;
}

function themePoolFromKind(imageIndex, kind) {
  const grouped = groupImagesByKindAndTheme(imageIndex);
  const kindMap = grouped[kind] || new Map();
  const pool = [];
  for (const theme of PHOTO_THEME_POOL) {
    if (kindMap.has(theme) && kindMap.get(theme).length) pool.push(theme);
  }
  for (const theme of kindMap.keys()) {
    if (!pool.includes(theme)) pool.push(theme);
  }
  return pool;
}

function groupImagesByTheme(imageIndex) {
  const map = new Map();
  for (const entry of imageIndex || []) {
    if (!isImageReady(entry)) continue;
    const theme = String(entry.theme || 'unknown').toLowerCase();
    if (!map.has(theme)) map.set(theme, []);
    map.get(theme).push(entry);
  }
  return map;
}

function themePoolFromIndex(imageIndex) {
  const grouped = groupImagesByTheme(imageIndex);
  const pool = [];
  for (const theme of PHOTO_THEME_POOL) {
    if (grouped.has(theme) && grouped.get(theme).length) pool.push(theme);
  }
  for (const theme of grouped.keys()) {
    if (!pool.includes(theme)) pool.push(theme);
  }
  return pool.length ? pool : PHOTO_THEME_POOL.slice();
}

function filterRecentImages(images, hours) {
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return images.filter(image => !image.lastShownAt || Date.parse(image.lastShownAt) < cutoff);
}

function sortByLastShown(images) {
  return [...images].sort((left, right) => {
    const leftTime = left.lastShownAt ? Date.parse(left.lastShownAt) : 0;
    const rightTime = right.lastShownAt ? Date.parse(right.lastShownAt) : 0;
    return leftTime - rightTime;
  });
}

function updateLibraryStateForPhoto(snapshot, imageIndex) {
  const daySeed = Number.parseInt(sha1(snapshot.slotKey).slice(0, 8), 16);
  const state = {
    ...runtime.libraryState
  };
  const sameSlot = state.lastSlotKey === snapshot.slotKey;

  // Same slot: return cached selection (preserving kind)
  if (sameSlot && state.currentKind && state.currentTheme) {
    const grouped = groupImagesByKindAndTheme(imageIndex);
    const images = grouped[state.currentKind]?.get(state.currentTheme) || [];
    if (images.length) {
      const idx = Math.max(0, Math.min(Number(state.currentImageIndex) || 0, images.length - 1));
      return {
        theme: state.currentTheme,
        entry: images[idx],
        state,
        kind: state.currentKind
      };
    }
  }

  // New day: reset
  if (state.lastSwitchDate !== formatDateKey(snapshot.nextSwitchAt)) {
    const poolLength = Math.max(1, themePoolFromIndex(imageIndex).length);
    state.patternIndex = Math.abs(daySeed) % SHOT_STORYBOARD_PATTERN.length;
    state.themeCursor = Math.abs(daySeed) % poolLength;
    state.currentKind = null;
    state.currentTheme = null;
    state.currentImageIndex = 0;
    state.remainingThemeSlots = 0;
  }
  const grouped = groupImagesByKindAndTheme(imageIndex);

  // Determine kind from pattern
  let kind = SHOT_STORYBOARD_PATTERN[state.patternIndex % SHOT_STORYBOARD_PATTERN.length];

  // Fallback: if no images for this kind, try the other
  if (!grouped[kind] || !grouped[kind].size) {
    kind = kind === 'shot' ? 'storyboard' : 'shot';
  }

  // Still nothing: NO_IMAGES
  if (!grouped[kind] || !grouped[kind].size) {
    return {
      theme: 'NO_IMAGES',
      entry: null,
      state,
      kind
    };
  }
  const kindChanged = state.currentKind !== kind;
  const needsNewTheme = kindChanged || state.remainingThemeSlots <= 0 || !state.currentTheme;
  let theme = state.currentTheme;
  let images = [];
  if (needsNewTheme) {
    if (kind === 'storyboard') {
      // Storyboard: prefer current/previous shot theme
      const shotTheme = state.lastShotTheme || state.currentTheme;
      if (shotTheme && grouped.storyboard.has(shotTheme) && grouped.storyboard.get(shotTheme).length) {
        theme = shotTheme;
      } else if (grouped.storyboard.size) {
        // Any storyboard theme
        const themes = [...grouped.storyboard.keys()];
        const cursor = Math.abs(daySeed + (state.themeCursor || 0)) % themes.length;
        theme = themes[cursor];
      } else {
        // Fallback to shot
        kind = 'shot';
      }
    }
    if (kind === 'shot') {
      const pool = themePoolFromKind(imageIndex, 'shot');
      if (pool.length) {
        const cursor = (state.themeCursor || 0) % pool.length;
        theme = pool[cursor];
        state.themeCursor = (cursor + 1) % pool.length;
        state.lastShotTheme = theme;
      } else if (grouped.shot.size) {
        const themes = [...grouped.shot.keys()];
        theme = themes[(state.themeCursor || 0) % themes.length];
        state.themeCursor = ((state.themeCursor || 0) + 1) % themes.length;
      }
    }
    images = theme ? grouped[kind]?.get(theme) || [] : [];
    state.currentImageIndex = 0;
    state.remainingThemeSlots = 1 + Math.abs(daySeed + (state.themeCursor || 0)) % 2;
  } else {
    images = theme ? grouped[kind]?.get(theme) || [] : [];
  }

  // Last-resort fallback: pick any image from current kind
  if (!theme || !images.length) {
    for (const [t, imgs] of grouped[kind] || []) {
      if (imgs.length) {
        theme = t;
        images = imgs;
        break;
      }
    }
  }
  if (!theme || !images.length) {
    return {
      theme: 'NO_IMAGES',
      entry: null,
      state,
      kind
    };
  }
  let pool = filterRecentImages(images, 7 * 24);
  if (!pool.length) pool = sortByLastShown(images);
  const idx = Number.isFinite(state.currentImageIndex) ? state.currentImageIndex % pool.length : 0;
  const entry = pool[idx];
  state.currentTheme = theme;
  state.currentImageIndex = (idx + 1) % pool.length;
  state.remainingThemeSlots = Math.max(0, Number(state.remainingThemeSlots) - 1);
  state.currentKind = kind;
  state.patternIndex = (state.patternIndex + 1) % SHOT_STORYBOARD_PATTERN.length;
  state.lastSlotKey = snapshot.slotKey;
  state.lastSwitchDate = formatDateKey(snapshot.nextSwitchAt);
  return {
    theme,
    entry,
    state,
    kind
  };
}

function selectPhotoSnapshot(now, imageIndex = runtime.imageIndex || []) {
  const t = getWallTime(now, getTimezone());
  const resolved = resolveDisplayMode(t, getTimezone());
  const dateKey = `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`;
  const inDayWindow = t.hour >= 10 && t.hour < 19;
  const slotIndex = inDayWindow ? (t.hour - 10) * 2 + (t.minute >= 30 ? 1 : 0) : 0;
  const nextSwitchAt = computeNextSwitchAt(now);
  return {
    mode: resolved.mode,
    slotIndex,
    slotKey: resolved.slotKey,
    nextSwitchAt
  };
}

// resolveDisplayMode imported from lib/schedule.js

// resolveDisplayMode imported from lib/schedule.js

function computeNextHalfHourBoundary(now, tz) {
  const t = getWallTime(now, tz || getTimezone());
  let year = t.year,
    month = t.month,
    day = t.day,
    hour = t.hour,
    minute = 0;
  if (t.minute < 30) {
    minute = 30;
  } else {
    hour = t.hour + 1;
    minute = 0;
  }
  return dateFromWallTime({
    year,
    month,
    day,
    hour,
    minute,
    second: 0
  }, tz || getTimezone());
}

function computeNextSwitchAt(now) {
  const t = getWallTime(now, getTimezone());
  let year = t.year;
  let month = t.month;
  let day = t.day;
  let hour = t.hour;
  let minute = 0;
  if (t.hour < 10) {
    hour = 10;
    minute = 30;
  } else if (t.hour >= 19) {
    const next = new Date(Date.UTC(year, month - 1, day + 1, 12));
    const nextWall = getWallTime(next, getTimezone());
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
  return dateFromWallTime({
    year,
    month,
    day,
    hour,
    minute,
    second: 0
  }, getTimezone());
}

/**
 * selectStudyPhoto — shared pure function used by production selector and tests.
 * Calls updateLibraryStateForPhoto on the study-only selectable subset.
 * Returns { theme, entry, state, kind } or { theme:'NO_STUDY_FRAMES', entry:null }.
 */

/**
 * selectStudyPhoto — shared pure function used by production selector and tests.
 * Calls updateLibraryStateForPhoto on the study-only selectable subset.
 * Returns { theme, entry, state, kind } or { theme:'NO_STUDY_FRAMES', entry:null }.
 */
function selectStudyPhoto(now, imageIndex, libraryState) {
  const snapshot = selectPhotoSnapshot(now, imageIndex);
  const studyIndex = (imageIndex || []).filter(isStudySelectable);
  const selection = updateLibraryStateForPhoto(snapshot, studyIndex);
  if (!selection.entry) {
    return {
      theme: 'NO_STUDY_FRAMES',
      entry: null,
      kind: 'shot',
      state: selection.state
    };
  }
  return selection;
}

module.exports = { setRuntime, getWallTime, dateFromWallTime, getTimeZoneOffsetMinutes, computeNextSwitchAt, computeNextHalfHourBoundary, resolveAllowedImagePath, isImageReady, isImageApproved, isStudySelectable, getImageKind, groupImagesByKindAndTheme, groupImagesByTheme, updateLibraryStateForPhoto, selectStudyPhoto, selectPhotoSnapshot, selectNewsItems, sha1, formatDateKey, formatDateParts, themePoolFromIndex, themePoolFromKind, filterRecentImages, sortByLastShown, filterByRotation, isRecentlyShown, normalizeText, categoryForRotation, categoryPriority, canonicalUrl, titleHash, FRAME_WIDTH, FRAME_HEIGHT, NEWS_REFRESH_MINUTES, NEWS_MAX_ITEMS, NEWS_SHOWN_RECALL_HOURS, NEWS_SHOWN_FALLBACK_HOURS, NEWS_MIN_ITEMS, SHOT_STORYBOARD_PATTERN, PHOTO_THEME_POOL, DEFAULT_PANEL, PANEL_SIZES };
