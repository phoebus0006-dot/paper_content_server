// font-detector.js — Cross-platform CJK font detection
// Probes the operating system for an installed CJK-capable font file and
// returns a descriptor used by the text rasterizer to render real glyphs.
//
// Detection order:
//   Windows:  C:\Windows\Fonts\msyh.ttc (Microsoft YaHei), then simhei.ttf
//   Linux:    fontconfig match for Noto Sans CJK SC / Noto Sans SC /
//             Source Han Sans SC, then common install paths
//   macOS:    /System/Library/Fonts/PingFang.ttc
//
// Return shape: { family, path, available, fallbackReason }
//   - available === true  → path and family are populated; fallbackReason is null
//   - available === false → path may be null; fallbackReason explains why

var fs = require('fs');
var path = require('path');
var os = require('os');
var childProcess = require('child_process');

// Map of candidate font files to the CSS font-family name librsvg/pango
// should use when looking the font up. We pair every path with the family
// name that pango/fontconfig will recognise, so callers can either embed
// the file via @font-face or rely on the family name directly.
var WINDOWS_CANDIDATES = [
  { path: 'C:\\Windows\\Fonts\\msyh.ttc', family: 'Microsoft YaHei' },
  { path: 'C:\\Windows\\Fonts\\msyhbd.ttc', family: 'Microsoft YaHei' },
  { path: 'C:\\Windows\\Fonts\\simhei.ttf', family: 'SimHei' },
  { path: 'C:\\Windows\\Fonts\\simsun.ttc', family: 'SimSun' },
  { path: 'C:\\Windows\\Fonts\\Deng.ttf', family: 'DengXian' },
];

var LINUX_PATH_CANDIDATES = [
  { path: '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', family: 'Noto Sans CJK SC' },
  { path: '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc', family: 'Noto Sans CJK SC' },
  { path: '/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc', family: 'Noto Sans CJK SC' },
  { path: '/usr/share/fonts/opentype/noto/NotoSansSC-Regular.otf', family: 'Noto Sans SC' },
  { path: '/usr/share/fonts/truetype/noto/NotoSansSC-Regular.otf', family: 'Noto Sans SC' },
  { path: '/usr/share/fonts/source-han-sans/SourceHanSansSC-Regular.otf', family: 'Source Han Sans SC' },
  { path: '/usr/share/fonts/source-han-sans-sc/SourceHanSansSC-Regular.otf', family: 'Source Han Sans SC' },
  { path: '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc', family: 'WenQuanYi Micro Hei' },
  { path: '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', family: 'WenQuanYi Zen Hei' },
];

var LINUX_FC_FAMILIES = [
  'Noto Sans CJK SC',
  'Noto Sans SC',
  'Source Han Sans SC',
  'WenQuanYi Micro Hei',
  'WenQuanYi Zen Hei',
];

var MACOS_CANDIDATES = [
  { path: '/System/Library/Fonts/PingFang.ttc', family: 'PingFang SC' },
  { path: '/Library/Fonts/Songti.ttc', family: 'Songti SC' },
  { path: '/System/Library/Fonts/STHeiti Medium.ttc', family: 'Heiti SC' },
];

function fileExists(p) {
  if (!p || typeof p !== 'string') return false;
  try {
    return fs.existsSync(p);
  } catch (e) {
    return false;
  }
}

function pickFirstAvailable(candidates) {
  for (var i = 0; i < candidates.length; i++) {
    var c = candidates[i];
    if (fileExists(c.path)) {
      return { family: c.family, path: c.path, available: true, fallbackReason: null };
    }
  }
  return null;
}

// Use fontconfig's fc-match to resolve a family name to a font file on Linux.
// Returns { family, path } or null if fc-match is unavailable / finds nothing.
function probeLinuxFontconfig() {
  for (var i = 0; i < LINUX_FC_FAMILIES.length; i++) {
    var family = LINUX_FC_FAMILIES[i];
    var out;
    try {
      out = childProcess.execSync(
        'fc-match -f "%{file}\\n%{family}" "' + family + '"',
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 }
      );
    } catch (e) {
      continue;
    }
    if (!out) continue;
    var lines = out.split(/\r?\n/);
    var fontPath = (lines[0] || '').trim();
    var fontFamily = (lines[1] || '').trim() || family;
    if (fontPath && fileExists(fontPath)) {
      return { family: fontFamily, path: fontPath, available: true, fallbackReason: null };
    }
  }
  return null;
}

function detectOnWindows() {
  var hit = pickFirstAvailable(WINDOWS_CANDIDATES);
  if (hit) return hit;
  return {
    family: null,
    path: null,
    available: false,
    fallbackReason: 'CJK_FONT_NOT_AVAILABLE',
  };
}

function detectOnLinux() {
  // Try fontconfig first (handles distro-specific install paths).
  try {
    var fcHit = probeLinuxFontconfig();
    if (fcHit) return fcHit;
  } catch (e) {
    // fall through to path-based detection
  }
  var hit = pickFirstAvailable(LINUX_PATH_CANDIDATES);
  if (hit) return hit;
  return {
    family: null,
    path: null,
    available: false,
    fallbackReason: 'CJK_FONT_NOT_AVAILABLE',
  };
}

function detectOnMacOS() {
  var hit = pickFirstAvailable(MACOS_CANDIDATES);
  if (hit) return hit;
  return {
    family: null,
    path: null,
    available: false,
    fallbackReason: 'CJK_FONT_NOT_AVAILABLE',
  };
}

function detectCJKFont(platform) {
  var p = platform || os.platform();
  if (p === 'win32') return detectOnWindows();
  if (p === 'darwin') return detectOnMacOS();
  // Default: treat as Linux/Unix-like.
  return detectOnLinux();
}

// Convert a filesystem path to a file:// URL suitable for SVG @font-face src.
// Used by the text rasterizer when embedding the font explicitly so rendering
// does not depend on fontconfig's family-name lookup.
function pathToFileUrl(p) {
  if (!p) return null;
  if (p.indexOf('file://') === 0) return p;
  // Windows: C:\Path\to\font.ttc → file:///C:/Path/to/font.ttc
  var normalized = p.replace(/\\/g, '/');
  if (/^[A-Za-z]:/.test(normalized)) {
    return 'file:///' + encodeURI(normalized);
  }
  if (normalized.charAt(0) === '/') {
    return 'file://' + encodeURI(normalized);
  }
  return 'file:///' + encodeURI(normalized);
}

module.exports = {
  detectCJKFont: detectCJKFont,
  pathToFileUrl: pathToFileUrl,
  // Exposed for tests so they can inspect the candidate tables.
  WINDOWS_CANDIDATES: WINDOWS_CANDIDATES,
  LINUX_PATH_CANDIDATES: LINUX_PATH_CANDIDATES,
  MACOS_CANDIDATES: MACOS_CANDIDATES,
  LINUX_FC_FAMILIES: LINUX_FC_FAMILIES,
};
