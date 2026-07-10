#!/usr/bin/env node
// photo:audit — comprehensive photo inventory audit (config-aware runtime paths)

var path = require('path');
var fs = require('fs');

var ROOT = path.join(__dirname, '..');

function loadJson(fp, fallback) {
  try { var raw = fs.readFileSync(fp, 'utf8'); return JSON.parse(raw); } catch(e) { return fallback; }
}

// Resolve runtime DATA_DIR and IMAGE_INDEX_FILE from env → config.json → fallback
var appConfig = loadJson(path.join(ROOT, 'config.json'), {});
var DATA_DIR = process.env.DATA_DIR
  ? (path.isAbsolute(process.env.DATA_DIR) ? process.env.DATA_DIR : path.join(ROOT, process.env.DATA_DIR))
  : (appConfig.dataDir ? (path.isAbsolute(appConfig.dataDir) ? appConfig.dataDir : path.join(ROOT, appConfig.dataDir)) : path.join(ROOT, 'data'));
var IMAGE_INDEX_FILE = process.env.IMAGE_INDEX_FILE
  ? (path.isAbsolute(process.env.IMAGE_INDEX_FILE) ? process.env.IMAGE_INDEX_FILE : path.join(ROOT, process.env.IMAGE_INDEX_FILE))
  : path.join(DATA_DIR, 'image_index.json');
var RAW_INDEX_FILE = path.join(DATA_DIR, 'raw_index.json');

function scanDir(dir) {
  try {
    return fs.readdirSync(dir).filter(function(f) { return f !== '.gitkeep'; });
  } catch(e) { return []; }
}

console.log('========== PHOTO AUDIT ==========');
console.log('Runtime paths:');
console.log('  DATA_DIR:', DATA_DIR);
console.log('  IMAGE_INDEX_FILE:', IMAGE_INDEX_FILE);
console.log('  RAW_INDEX_FILE:', RAW_INDEX_FILE);
console.log('Scanning:', DATA_DIR);
console.log();

// 1. image_index
var imageIndex = loadJson(IMAGE_INDEX_FILE, []);
if (!Array.isArray(imageIndex)) imageIndex = [];
console.log('--- PRODUCTION INDEX (' + path.basename(IMAGE_INDEX_FILE) + ') ---');
console.log('Total entries:', imageIndex.length);
var approvedStudy = imageIndex.filter(function(e) { return e.safetyStatus === 'approved' && e.poolType === 'study_frames'; });
var approvedDeco = imageIndex.filter(function(e) { return e.safetyStatus === 'approved' && e.poolType === 'decorative_photos'; });
var pending = imageIndex.filter(function(e) { return e.safetyStatus === 'pending' || !e.safetyStatus; });
var rejected = imageIndex.filter(function(e) { return e.safetyStatus === 'rejected'; });
var quarantined = imageIndex.filter(function(e) { return e.safetyStatus === 'quarantined'; });
console.log('  approvedStudy:', approvedStudy.length);
console.log('  approvedDecorative:', approvedDeco.length);
console.log('  pending:', pending.length);
console.log('  rejected:', rejected.length);
console.log('  quarantined:', quarantined.length);
for (var i = 0; i < imageIndex.length; i++) {
  var e = imageIndex[i];
  var r = e.rights || {};
  console.log('  [' + (e.safetyStatus || 'MISSING') + '][' + (e.poolType || '?') + '] ' + e.id.slice(0, 16) + '... ' + (e.title || '').slice(0, 40) + ' | src:' + (e.source || '?') + ' | pool:' + (e.poolType || '?') + ' | kind:' + (e.kind || '?') + ' | theme:' + (e.theme || '?') + ' | safety:' + (e.safetyStatus || '?') + ' | rightsStatus:' + (e.rightsStatus || (r.license ? 'known' : 'unknown') || '?') + ' | shown:' + (e.shownCount || 0));
}
console.log();

// 2. raw_index
var rawIndex = loadJson(path.join(DATA_DIR, 'raw_index.json'), []);
if (!Array.isArray(rawIndex)) rawIndex = [];
console.log('--- RAW INDEX (raw_index.json) ---');
console.log('Total entries:', rawIndex.length);
for (var ri = 0; ri < rawIndex.length; ri++) {
  var r = rawIndex[ri];
  console.log('  [' + (r.safetyStatus || 'MISSING') + '] ' + (r.id || '?').slice(0, 16) + '... ' + (r.title || '').slice(0, 40) + ' | status:' + (r.status || '?'));
}
console.log();

// 3. raw_images directory orphans
var rawImages = scanDir(path.join(DATA_DIR, 'raw_images'));
console.log('--- RAW IMAGES DIR ---');
console.log('Files:', rawImages.length);
var rawIndexIds = {};
(rawIndex || []).forEach(function(e) { if (e.id) rawIndexIds[e.id] = true; });
var orphanRaw = rawImages.filter(function(f) {
  var id = f.split('.')[0];
  return !rawIndexIds[id] && f !== '.gitkeep';
});
console.log('  orphan files (in dir but not in index):', orphanRaw.length);
orphanRaw.forEach(function(f) { console.log('    ' + f); });
console.log();

// 4. processed_images directory orphans
var procImages = scanDir(path.join(DATA_DIR, 'processed_images'));
console.log('--- PROCESSED IMAGES DIR ---');
console.log('Files:', procImages.length);
var imageIndexIds = {};
(imageIndex || []).forEach(function(e) { if (e.id) imageIndexIds[e.id] = true; });
var orphanProc = procImages.filter(function(f) {
  var id = f.split('.')[0];
  return !imageIndexIds[id] && f !== '.gitkeep';
});
console.log('  orphan files (in dir but not in index):', orphanProc.length);
orphanProc.forEach(function(f) { console.log('    ' + f); });
console.log();

// 5. quarantine directories
var quarantineDirs = fs.readdirSync(DATA_DIR).filter(function(f) { return f.startsWith('quarantine_'); });
console.log('--- QUARANTINE ---');
console.log('Directories:', quarantineDirs.length);
var totalQuarantinedFiles = 0;
quarantineDirs.forEach(function(qd) {
  var qp = path.join(DATA_DIR, qd);
  var files = [];
  try {
    var subs = fs.readdirSync(qp);
    subs.forEach(function(sub) {
      var subPath = path.join(qp, sub);
      try {
        var subFiles = fs.readdirSync(subPath);
        subFiles.forEach(function(f) {
          files.push(path.join(sub, f));
          totalQuarantinedFiles++;
        });
      } catch(e) {}
    });
  } catch(e) {}
  console.log('  ' + qd + ': ' + files.length + ' files');
  files.forEach(function(f) { console.log('    ' + f); });
});
console.log();

// 6. quarantine/rejected index files (dynamic discovery)
var quarantineFiles = fs.readdirSync(DATA_DIR).filter(function(f) { return /^quarantine.*\.json$/.test(f); });
console.log('--- QUARANTINE/PENDING INDEX FILES ---');
console.log('Files:', quarantineFiles.length);
quarantineFiles.forEach(function(qf) {
  var qData = loadJson(path.join(DATA_DIR, qf), []);
  if (Array.isArray(qData) && qData.length) {
    console.log('  ' + qf + ': ' + qData.length + ' entries');
    for (var qi = 0; qi < qData.length && qi < 3; qi++) {
      var q = qData[qi];
      console.log('    [' + (q.id || '?').slice(0, 16) + '...] ' + (q.title || '').slice(0, 50) + ' | src:' + (q.source || '?'));
    }
    if (qData.length > 3) console.log('    ... and ' + (qData.length - 3) + ' more');
  }
});
console.log();

// 7. import_images
var importImages = scanDir(path.join(DATA_DIR, 'import_images'));
console.log('--- IMPORT IMAGES ---');
console.log('Files:', importImages.length);
importImages.forEach(function(f) { console.log('  ' + f); });
console.log();

// 8. images/shots and images/storyboard
var shotsDir = path.join(ROOT, 'images', 'shots');
var storyDir = path.join(ROOT, 'images', 'storyboard');
[shotsDir, storyDir].forEach(function(dir) {
  var name = path.relative(ROOT, dir);
  try {
    var themes = fs.readdirSync(dir);
    console.log('--- ' + name + ' ---');
    console.log('Themes:', themes.length);
    themes.forEach(function(theme) {
      var files = scanDir(path.join(dir, theme));
      console.log('  ' + theme + ': ' + files.length + ' files');
    });
  } catch(e) { console.log('--- ' + name + ' --- (not found)'); }
  console.log();
});

// 9. Cached frames and snapshots check
console.log('--- RUNTIME CACHE REFERENCES ---');
// Check admin_override.json
var overrideFile = path.join(DATA_DIR, 'admin_override.json');
if (fs.existsSync(overrideFile)) {
  var override = loadJson(overrideFile, {});
  console.log('admin_override.json:', JSON.stringify(override));
} else {
  console.log('admin_override.json: not found');
}

// Check publish_history.json
var pubHist = loadJson(path.join(DATA_DIR, 'publish_history.json'), []);
if (Array.isArray(pubHist) && pubHist.length) {
  console.log('publish_history.json entries:', pubHist.length);
  pubHist.forEach(function(h) {
    console.log('  ' + h.id + ' | type:' + (h.type || '?') + ' | frameId:' + (h.frameId || '?') + ' | status:' + (h.status || '?'));
  });
} else {
  console.log('publish_history.json: not found or empty');
}
console.log();

// 10. Summary
console.log('========== AUDIT SUMMARY ==========');
console.log('Runtime DATA_DIR:', DATA_DIR);
console.log('Runtime IMAGE_INDEX_FILE:', IMAGE_INDEX_FILE);
console.log('image_index total:', imageIndex.length);
console.log('  approvedStudy:', approvedStudy.length);
console.log('  approvedDecorative:', approvedDeco.length);
console.log('  pending:', pending.length);
console.log('  rejected:', rejected.length);
console.log('  quarantined:', quarantined.length);
console.log('raw_index total:', rawIndex.length);
console.log('raw_images files:', rawImages.length);
console.log('  orphans:', orphanRaw.length);
console.log('processed_images files:', procImages.length);
console.log('  orphans:', orphanProc.length);
console.log('quarantine dirs:', quarantineDirs.length);
console.log('  total quarantined files:', totalQuarantinedFiles);
console.log('import_images:', importImages.length);
console.log();
console.log('Unsafe references to investigate:');
console.log('  - Check quarantine_raw_index for quarantined entries that may have cached frames');
console.log('  - Check if any publish_history entries reference quarantined image IDs');
