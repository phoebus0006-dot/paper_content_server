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

  async function decodeFile(filePath) {
    var buf = fs.readFileSync(filePath);
    var sha256 = crypto.createHash('sha256').update(buf).digest('hex');
    var ext = path.extname(filePath).toLowerCase();
    var mimeType = 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
    else if (ext === '.webp') mimeType = 'image/webp';
    var width = 0, height = 0;
    try {
      var sharp = require('sharp');
      var meta = await sharp(buf).metadata();
      if (meta) { mimeType = meta.format ? 'image/' + meta.format : mimeType; width = meta.width || 0; height = meta.height || 0; }
    } catch(e) { logger.warn && logger.warn('decode metadata failed: ' + e.message); }
    return { sha256: sha256, mimeType: mimeType, width: width, height: height };
  }

  function moveFinal(stagingPath, assetId) {
    var ext = path.extname(stagingPath) || '.bin';
    var dest = path.join(assetsDir, assetId + ext);
    fs.renameSync(stagingPath, dest);
    return dest;
  }

  function ingestAll() {
    return sourceRegistry.fetchAll().then(function(lists) {
      var all = lists.reduce(function(a,b){return a.concat(b);}, []);
      return Promise.all(all.map(function(c) { return ingestOne(c); }));
    });
  }

  async function ingestOne(raw) {
    if (!raw) return { status: 'REJECTED', reason: 'NULL_INPUT' };
    var candidate;
    try { candidate = createCandidate(raw); } catch(e) { return { status: 'REJECTED', reason: 'INVALID_CANDIDATE', reasonCode: 'CANDIDATE_CREATE_FAILED' }; }
    // Full gates
    var gateResult = validator.validate(candidate);
    if (!gateResult.ok) return { status: 'REJECTED', reason: gateResult.errors.join('; '), reasonCodes: gateResult.reasonCodes, candidateId: candidate.candidateId };
    if (!policy.isAllowed(candidate)) return { status: 'REJECTED', reason: 'POLICY_BLOCKED', reasonCode: 'POLICY', candidateId: candidate.candidateId };
    // Pre-download dedup check (sourceUrl) — read-only, no side effect
    if (deduplicator.isDuplicate(candidate)) return { status: 'DUPLICATE', candidateId: candidate.candidateId, reasonCode: 'DUPLICATE' };
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
      try { finalPath = moveFinal(stagingPath, tempAsset.assetId); }
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
        // Commit dedup only after successful repository write
        deduplicator.commit({ sha256: decoded.sha256, sourceUrl: candidate.sourceUrl });
        return { status: 'ACCEPTED', assetId: assetId, candidateId: candidate.candidateId, sha256: decoded.sha256, finalPath: finalPath };
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
      // Commit dedup only after successful repository write
      deduplicator.commit(candidate);
      return { status: 'ACCEPTED', assetId: assetId, candidateId: candidate.candidateId };
    }).catch(function(e) {
      return { status: 'REJECTED', reason: 'REPOSITORY_WRITE_FAILED', reasonCode: 'REPO_WRITE', error: e.message, candidateId: candidate.candidateId };
    });
  }
  return { ingestAll: ingestAll, ingestOne: ingestOne };
}
module.exports = { createIngestionService: createIngestionService };
