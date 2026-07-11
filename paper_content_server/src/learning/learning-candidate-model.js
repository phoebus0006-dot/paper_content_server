// learning-candidate-model.js — Candidate image model before ingestion
function createCandidate(fields) {
  if (!fields.sourceUrl && !fields.localPath) throw new Error('candidate needs sourceUrl or localPath');
  return Object.freeze({
    candidateId: fields.candidateId || 'cand_' + Date.now().toString(36),
    sourceUrl: fields.sourceUrl || null,
    localPath: fields.localPath || null,
    source: fields.source || '',
    license: fields.license || '',
    rightsStatus: fields.rightsStatus || 'UNKNOWN',
    sha256: fields.sha256 || null,
    mimeType: fields.mimeType || 'image/jpeg',
    width: fields.width || null,
    height: fields.height || null,
    metadata: fields.metadata || {},
  });
}
module.exports = { createCandidate: createCandidate };
