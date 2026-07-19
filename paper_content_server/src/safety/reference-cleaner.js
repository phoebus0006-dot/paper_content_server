// reference-cleaner.js — Fail-closed cleanup with uniform result objects
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var DELETE_SYMLINK_NOT_ALLOWED = 'SYMLINK_NOT_ALLOWED';

// 同步原子写（tmp + renameSync）：cleanLegacyIndexes 是同步函数，不能用异步的 writeFileAtomic。
// 直接 fs.writeFileSync 会在写入过程中崩溃导致文件截断/损坏。
function writeFileSyncAtomic(filePath, data) {
  var dir = path.dirname(filePath);
  var tmp = path.join(dir, path.basename(filePath) + '.tmp.' + process.pid + '.' + crypto.randomBytes(4).toString('hex'));
  fs.writeFileSync(tmp, data, 'utf8');
  fs.renameSync(tmp, filePath);
}

function isInside(root, target) {
  var relative = path.relative(root, target);
  // 必须排除 '..'（直接父目录）：之前 relative==='..' 时，
  // '..'.startsWith('..' + path.sep) 为 false（Windows 下 '..'.startsWith('..\\')=false），
  // 导致"父目录在 root 内"的错误结论，安全敏感函数被复用时会出问题。
  return relative !== '' &&
    relative !== '..' &&
    !relative.startsWith('..' + path.sep) &&
    !path.isAbsolute(relative);
}

function resultObj(changed, count, errors) {
  return { complete: errors.length === 0, changed: changed, count: count, errors: errors };
}

function ReferenceCleaner(snapshotStore, snapshotCache, publicationHistory, dataDir, logger) {
  dataDir = dataDir || 'data';
  logger = logger || {};

  function cleanCache(assetId) {
    if (!snapshotCache) return resultObj(false, 0, []);
    var keys = snapshotCache.keys(), found = 0, errs = [];
    keys.forEach(function(k) {
      try {
        var snap = snapshotCache.get(k);
        if (snap && snap.payload) {
          // 移除 'localPath'：它是文件路径（路径域），与 assetId（ID 域）不同，
          // 极小概率字符串相等会误删缓存。仅比较 ID 域字段。
          var match = ['assetId','photoId','imageId','legacyId'].some(function(f) { return snap.payload[f] === assetId; });
          if (match) { snapshotCache.delete(k); found++; }
        }
      } catch(e) { errs.push('cache_evict:' + e.message); }
    });
    return resultObj(found > 0, found, errs);
  }

  function isPathAllowed(filePath) {
    if (!filePath || typeof filePath !== 'string') return false;
    try {
      var resolved = path.resolve(filePath);
      var originalStat = fs.lstatSync(resolved);
      if (originalStat.isSymbolicLink()) { throw new Error(DELETE_SYMLINK_NOT_ALLOWED); }
      var real = fs.realpathSync(resolved);
      var stat = fs.statSync(real);
      if (stat.isDirectory()) return false;
      // Must be within data/ or images/ roots
      var dataRoot = path.resolve(dataDir);
      var imagesRoot = path.resolve(path.join(dataDir, '..', 'images'));
      if (!isInside(dataRoot, real) && !isInside(imagesRoot, real)) return false;
      // Not a config/snapshot/frame file
      var base = path.basename(real);
      if (base === 'server.js' || base.endsWith('.json') || base.endsWith('.bin')) return false;
      return true;
    } catch(e) { return false; }
  }

  function cleanLegacyIndexes(assetId, references) {
    var errs = [];
    var idxCleaned = false, ovCleaned = false;
    // Image index — 用原子写（writeFileAtomic tmp+rename），避免写入过程中崩溃导致
    // image_index.json 被截断/损坏，后续所有 legacy 索引查询失败。
    try {
      var idxPath = path.join(dataDir, 'image_index.json');
      if (fs.existsSync(idxPath)) {
        var idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
        if (Array.isArray(idx)) {
          var filtered = idx.filter(function(e) { return e.id !== assetId && e.assetId !== assetId; });
          if (filtered.length < idx.length) {
            writeFileSyncAtomic(idxPath, JSON.stringify(filtered, null, 2) + '\n');
            idxCleaned = true;
          }
        }
      }
    } catch(e) { errs.push('image_index:' + e.message); }
    // Admin override
    try {
      var ovPath = path.join(dataDir, 'admin_override.json');
      if (fs.existsSync(ovPath)) {
        var ov = JSON.parse(fs.readFileSync(ovPath, 'utf8'));
        if (ov.assetId === assetId || ov.photoId === assetId || ov.imageId === assetId) { fs.unlinkSync(ovPath); ovCleaned = true; }
      }
    } catch(e) { errs.push('admin_override:' + e.message); }
    // 分别反映实际清理动作（之前两者恒相等，误导调用方）
    return { legacyIndexCleaned: idxCleaned, overrideCleaned: ovCleaned, complete: errs.length === 0, errors: errs };
  }

  return { cleanCache: cleanCache, cleanLegacyIndexes: cleanLegacyIndexes, isPathAllowed: isPathAllowed };
}
module.exports = { ReferenceCleaner: ReferenceCleaner };
