// learning-ingestion-service.js — Full gates + download + decode + safety + atomic persistence
var path = require('path');
var fs = require('fs');
var crypto = require('crypto');
var { createCandidate } = require('./learning-candidate-model');
var assetModel = require(path.join(__dirname, '..', 'assets', 'asset-model'));

function createIngestionService(sourceRegistry, validator, deduplicator, policy, assetRepository, logger, deps) {
  logger = logger || {};
  deps = deps || {};
  var downloader = deps.downloader || null;
  var safetyGate = deps.safetyGate || null;
  var stagingDir = deps.stagingDir || null;
  var assetsDir = deps.assetsDir || null;
  // enabled 默认 true(本服务仅在 feature flag 开启时由 compose-services 构造);
  // 显式传入 false 时,ingestAll 立即短路,不触发任何网络请求。
  var enabled = deps.enabled !== undefined ? deps.enabled : true;
  var ALLOWED_DECODE_MIME = ['image/jpeg', 'image/png', 'image/webp'];

  function mimeToExt(mimeType) {
    if (mimeType === 'image/jpeg') return '.jpg';
    if (mimeType === 'image/png') return '.png';
    if (mimeType === 'image/webp') return '.webp';
    return '.bin';
  }

  // decodeFile — fail-closed:sharp 不可用或解码失败立即抛出(由调用方转 REJECTED)。
  // 不从扩展名推断 MIME;SHA256/ fileSize 走流式计算。
  async function decodeFile(filePath) {
    var sharp;
    try { sharp = require('sharp'); }
    catch(e) { throw new Error('decode dependency unavailable: sharp'); }
    var hash = crypto.createHash('sha256');
    var fileSize = 0;
    await new Promise(function(resolve, reject) {
      var rs = fs.createReadStream(filePath);
      rs.on('data', function(chunk) { hash.update(chunk); fileSize += chunk.length; });
      rs.on('end', resolve);
      rs.on('error', reject);
    });
    var sha256 = hash.digest('hex');
    var meta;
    try { meta = await sharp(filePath).metadata(); }
    catch(e) { throw new Error('decode failed: ' + e.message); }
    if (!meta || !meta.format) throw new Error('decode failed: no image format detected');
    var mimeType = 'image/' + meta.format;
    if (ALLOWED_DECODE_MIME.indexOf(mimeType) < 0) {
      throw new Error('decode failed: unsupported format ' + mimeType);
    }
    return {
      sha256: sha256, mimeType: mimeType,
      width: meta.width || 0, height: meta.height || 0,
      fileSize: fileSize, format: meta.format,
    };
  }

  function moveFinal(stagingPath, assetId, mimeType) {
    var ext = mimeToExt(mimeType);
    var dest = path.join(assetsDir, assetId + ext);
    fs.renameSync(stagingPath, dest);
    return dest;
  }

  function ingestAll() {
    if (!enabled) {
      return Promise.resolve({ status: 'DISABLED', candidates: [] });
    }
    return sourceRegistry.fetchAll().then(function(lists) {
      var all = lists.reduce(function(a,b){return a.concat(b);}, []);
      return Promise.all(all.map(function(c) { return ingestOne(c); }));
    });
  }

  async function ingestOne(raw) {
    if (!raw) return { status: 'REJECTED', reason: 'NULL_INPUT' };
    var candidate;
    try { candidate = createCandidate(raw); } catch(e) { return { status: 'REJECTED', reason: 'INVALID_CANDIDATE', reasonCode: 'CANDIDATE_CREATE_FAILED' }; }
    // Full gates — 必须包裹 try/catch：validator/policy/deduplicator 内部抛错（如候选字段缺失
    // 导致 TypeError）会让 ingestOne reject → Promise.all reject → 整批失败。
    // ingestOne 契约是返回 {status:'REJECTED'} 而非抛错。
    var gateResult;
    try {
      gateResult = validator.validate(candidate);
      if (!gateResult.ok) return { status: 'REJECTED', reason: gateResult.errors.join('; '), reasonCodes: gateResult.reasonCodes, candidateId: candidate.candidateId };
      if (!policy.isAllowed(candidate)) return { status: 'REJECTED', reason: 'POLICY_BLOCKED', reasonCode: 'POLICY', candidateId: candidate.candidateId };
      // Pre-download dedup check (sourceUrl) — read-only, no side effect
      if (deduplicator.isDuplicate(candidate)) return { status: 'DUPLICATE', candidateId: candidate.candidateId, reasonCode: 'DUPLICATE' };
    } catch(e) {
      return { status: 'REJECTED', reason: 'GATE_ERROR', reasonCode: 'GATE', error: e.message, candidateId: candidate.candidateId };
    }
    if (!assetRepository) return { status: 'REJECTED', reason: 'DEPENDENCY_UNAVAILABLE', reasonCode: 'NO_REPOSITORY', candidateId: candidate.candidateId };

    // Production flow: download → decode → safety → move → persist
    if (downloader) {
      if (!stagingDir || !assetsDir) return { status: 'REJECTED', reason: 'DEPENDENCY_UNAVAILABLE', reasonCode: 'NO_DIRS', candidateId: candidate.candidateId };
      // 4. Download to staging
      var stagingPath;
      try { stagingPath = await downloader.download(candidate.sourceUrl); }
      catch(e) { return { status: 'REJECTED', reason: 'DOWNLOAD_FAILED', reasonCode: 'DOWNLOAD', error: e.message, candidateId: candidate.candidateId }; }
      // 5. Decode + SHA256 + MIME + dimensions
      var decoded;
      try { decoded = await decodeFile(stagingPath); }
      catch(e) { downloader.cleanup(stagingPath); return { status: 'REJECTED', reason: 'DECODE_FAILED', reasonCode: 'DECODE', error: e.message, candidateId: candidate.candidateId }; }
      // Post-decode dedup check (sha256)
      if (deduplicator.isDuplicate({ sha256: decoded.sha256, sourceUrl: candidate.sourceUrl })) {
        downloader.cleanup(stagingPath);
        return { status: 'DUPLICATE', candidateId: candidate.candidateId, reasonCode: 'DUPLICATE_SHA' };
      }
      // 6. Safety gate — required (classify first, then isSafe on classification result)
      if (!safetyGate) { downloader.cleanup(stagingPath); return { status: 'REJECTED', reason: 'DEPENDENCY_UNAVAILABLE', reasonCode: 'NO_SAFETY_GATE', candidateId: candidate.candidateId }; }
      var safetyMetadata = { width: decoded.width, height: decoded.height, fileSize: decoded.fileSize, mimeType: decoded.mimeType, originalName: candidate.title };
      var classification;
      try { classification = await safetyGate.classify(stagingPath, safetyMetadata); }
      catch(e) { downloader.cleanup(stagingPath); return { status: 'REJECTED', reason: 'SAFETY', reasonCode: 'SAFETY', error: e.message, candidateId: candidate.candidateId }; }
      if (!safetyGate.isSafe(classification)) {
        downloader.cleanup(stagingPath);
        return { status: 'REJECTED', reason: 'SAFETY', reasonCode: 'SAFETY', candidateId: candidate.candidateId };
      }
      // 7. Move to final path
      var tempAsset;
      try { tempAsset = assetModel.createAsset({ sourceUrl: null, localPath: '/tmp', libraryType: 'LEARNING', safetyStatus: 'SAFE', lifecycleStatus: 'SELECTABLE' }); }
      catch(e) { downloader.cleanup(stagingPath); return { status: 'REJECTED', reason: 'ASSET_CREATE_FAILED', reasonCode: 'ASSET_CREATE', candidateId: candidate.candidateId }; }
      var finalPath;
      try { finalPath = moveFinal(stagingPath, tempAsset.assetId, decoded.mimeType); }
      catch(e) { downloader.cleanup(stagingPath); return { status: 'REJECTED', reason: 'MOVE_FAILED', reasonCode: 'MOVE', error: e.message, candidateId: candidate.candidateId }; }
      // 8. Create asset
      var asset;
      try {
        asset = assetModel.createAsset({
          assetId: tempAsset.assetId, sourceUrl: candidate.sourceUrl, localPath: finalPath,
          libraryType: 'LEARNING', sourceType: candidate.source || 'unknown',
          sha256: decoded.sha256, mimeType: decoded.mimeType,
          width: decoded.width, height: decoded.height,
          safetyStatus: 'SAFE', lifecycleStatus: 'SELECTABLE',
          metadata: { candidateId: candidate.candidateId },
        });
      } catch(e) { downloader.cleanup(finalPath); return { status: 'REJECTED', reason: 'ASSET_CREATE_FAILED', reasonCode: 'ASSET_CREATE', candidateId: candidate.candidateId }; }
      try {
        var assetId = await assetRepository.create(asset);
        // Commit dedup only after successful repository write。
        // 独立 try/catch：commit 同步抛错时仓库记录已存在，不能删 finalPath（会成孤儿记录），
        // 也不能误报 REPOSITORY_WRITE_FAILED（仓库写成功了）。仅 warn 并返回 ACCEPTED。
        try {
          deduplicator.commit({ sha256: decoded.sha256, sourceUrl: candidate.sourceUrl });
        } catch(commitErr) {
          (logger.warn || function(){})('dedup commit failed for ' + candidate.candidateId + ' (asset already created): ' + commitErr.message);
        }
        // ACCEPTED 摘要不包含内部路径(localPath/finalPath)
        return { status: 'ACCEPTED', assetId: assetId, candidateId: candidate.candidateId, sha256: decoded.sha256 };
      } catch(e) {
        downloader.cleanup(finalPath);
        return { status: 'REJECTED', reason: 'REPOSITORY_WRITE_FAILED', reasonCode: 'REPO_WRITE', error: e.message, candidateId: candidate.candidateId };
      }
    }

    // Legacy flow (no downloader injected): persist directly from candidate metadata
    var legacyAsset;
    try {
      legacyAsset = assetModel.createAsset({
        sourceUrl: candidate.sourceUrl, localPath: candidate.localPath,
        libraryType: 'LEARNING', sourceType: candidate.source || 'unknown',
        sha256: candidate.sha256, mimeType: candidate.mimeType,
        width: candidate.width, height: candidate.height,
        safetyStatus: 'SAFE', lifecycleStatus: 'SELECTABLE',
        metadata: { candidateId: candidate.candidateId },
      });
    } catch(e) { return { status: 'REJECTED', reason: 'ASSET_CREATE_FAILED', reasonCode: 'ASSET_CREATE', candidateId: candidate.candidateId }; }
    return assetRepository.create(legacyAsset).then(function(assetId) {
      // Commit dedup only after successful repository write（同生产流，独立 catch）
      try { deduplicator.commit(candidate); }
      catch(commitErr) { (logger.warn || function(){})('dedup commit failed (legacy) for ' + candidate.candidateId + ': ' + commitErr.message); }
      return { status: 'ACCEPTED', assetId: assetId, candidateId: candidate.candidateId };
    }).catch(function(e) {
      return { status: 'REJECTED', reason: 'REPOSITORY_WRITE_FAILED', reasonCode: 'REPO_WRITE', error: e.message, candidateId: candidate.candidateId };
    });
  }
  return { ingestAll: ingestAll, ingestOne: ingestOne };
}
module.exports = { createIngestionService: createIngestionService };
