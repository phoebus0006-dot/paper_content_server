// learning-ingestion-service.js — Full gates + atomic repository persistence
var path = require('path');
var { createCandidate } = require('./learning-candidate-model');
var assetModel = require(path.join(__dirname, '..', 'assets', 'asset-model'));

function createIngestionService(sourceRegistry, validator, deduplicator, policy, assetRepository, logger) {
  logger = logger || {};

  function ingestAll() {
    return sourceRegistry.fetchAll().then(function(lists) {
      var all = lists.reduce(function(a,b){return a.concat(b);}, []);
      return Promise.all(all.map(function(c) { return ingestOne(c); }));
    });
  }

  function ingestOne(raw) {
    if (!raw) return Promise.resolve({ status: 'REJECTED', reason: 'NULL_INPUT' });
    var candidate;
    try { candidate = createCandidate(raw); } catch(e) { return Promise.resolve({ status: 'REJECTED', reason: 'INVALID_CANDIDATE', reasonCode: 'CANDIDATE_CREATE_FAILED' }); }
    // Full gates
    var gateResult = validator.validate(candidate);
    if (!gateResult.ok) return Promise.resolve({ status: 'REJECTED', reason: gateResult.errors.join('; '), reasonCodes: gateResult.reasonCodes, candidateId: candidate.candidateId });
    if (!policy.isAllowed(candidate)) return Promise.resolve({ status: 'REJECTED', reason: 'POLICY_BLOCKED', reasonCode: 'POLICY', candidateId: candidate.candidateId });
    // Dedup check (read-only, no side effect)
    if (deduplicator.isDuplicate(candidate)) return Promise.resolve({ status: 'DUPLICATE', candidateId: candidate.candidateId, reasonCode: 'DUPLICATE' });
    // Persist
    if (!assetRepository) return Promise.resolve({ status: 'REJECTED', reason: 'DEPENDENCY_UNAVAILABLE', reasonCode: 'NO_REPOSITORY', candidateId: candidate.candidateId });
    var asset;
    try {
      asset = assetModel.createAsset({
        sourceUrl: candidate.sourceUrl, localPath: candidate.localPath,
        libraryType: 'LEARNING', sourceType: candidate.source || 'unknown',
        sha256: candidate.sha256, mimeType: candidate.mimeType,
        width: candidate.width, height: candidate.height,
        safetyStatus: 'SAFE', lifecycleStatus: 'SELECTABLE',
        metadata: { candidateId: candidate.candidateId },
      });
    } catch(e) { return Promise.resolve({ status: 'REJECTED', reason: 'ASSET_CREATE_FAILED', reasonCode: 'ASSET_CREATE', candidateId: candidate.candidateId }); }
    return assetRepository.create(asset).then(function(assetId) {
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
