/**
 * image-governance.js
 * Extracted pure validation logic for image sources to support isolated testing
 * and enforcement of strict default deny contracts.
 */

function normalizeImageSourceId(sourceId) {
  return String(sourceId || '').trim().toLowerCase();
}

/**
 * Pure function to validate an image candidate based on source contract rules.
 * @param {Object} candidate The candidate image object.
 * @param {Object} config The configuration object containing allowed source IDs and categories.
 * @returns {Object} { valid: boolean, reason: string | null, classification: string }
 */
function validateImageCandidate(candidate, config) {
  const sourceId = normalizeImageSourceId(candidate.sourceId || candidate.sourceType || candidate.source);
  const sourceName = String(candidate.sourceName || candidate.source || '').toLowerCase();
  const titleLow = String(candidate.title || '').toLowerCase();
  const category = String(candidate.category || candidate.kind || candidate.poolType || '').toLowerCase();
  const topic = String(candidate.theme || candidate.query || '').toLowerCase();
  const provenance = candidate.provenance || candidate.metadata || {};

  // Check missing provenance
  if (Object.keys(provenance).length === 0 && !candidate.localPath && sourceId !== 'local_import' && sourceId !== 'local-import') {
    return { valid: false, reason: 'rejected-missing-provenance', classification: 'LEGACY_UNVERIFIED_IMAGE' };
  }

  // Load rules from config or use defaults
  const allowedSourceIds = (config.IMAGE_ALLOWED_SOURCE_IDS || ['wikimedia_category', 'wikimedia_commons', 'local_import', 'local-import']).map(normalizeImageSourceId);
  const allowedCategories = (config.IMAGE_ALLOWED_CATEGORIES || ['storyboards', 'medium_shots', 'long_shots', 'full_shots', 'night_photography', 'group_portraits', 'film_frames']).map(c => String(c).toLowerCase());

  if (!allowedSourceIds.includes(sourceId)) {
    return { valid: false, reason: 'rejected-unauthorized-sourceId', classification: 'UNKNOWN_SOURCE_IMAGE' };
  }

  // Provider allowed but category wrong
  if (category && !allowedCategories.includes(category)) {
    // If it's a known valid source but wrong category, we reject it as well
    return { valid: false, reason: 'rejected-invalid-category', classification: 'UNKNOWN_SOURCE_IMAGE' };
  }

  // Blacklist checks (Defense in Depth)
  if (sourceName.includes('nasa') || titleLow.includes('nasa') || titleLow.includes('astronomy') || titleLow.includes('apod') || topic.includes('nasa') || topic.includes('astronomy')) {
    return { valid: false, reason: 'rejected-forbidden-topic-nasa', classification: 'NASA_IMAGE' };
  }
  if (sourceName.includes('unsplash') || sourceName.includes('picsum') || sourceName.includes('random') || topic.includes('random')) {
    return { valid: false, reason: 'rejected-forbidden-source-random', classification: 'RANDOM_SOURCE_IMAGE' };
  }
  if (titleLow.includes('scenery') || titleLow.includes('landscape') || titleLow.includes('nature wallpaper') || topic.includes('scenery') || topic.includes('landscape')) {
    return { valid: false, reason: 'rejected-forbidden-topic-scenery', classification: 'SCENERY_IMAGE' };
  }

  return { valid: true, reason: null, classification: 'VALID_TARGET_IMAGE' };
}

function classifyImageCandidate(candidate, config) {
  return validateImageCandidate(candidate, config).classification;
}

function isAllowedImageSource(sourceId, config) {
  const allowedSourceIds = (config.IMAGE_ALLOWED_SOURCE_IDS || ['wikimedia_category', 'wikimedia_commons', 'local_import', 'local-import']).map(normalizeImageSourceId);
  return allowedSourceIds.includes(normalizeImageSourceId(sourceId));
}

module.exports = {
  normalizeImageSourceId,
  validateImageCandidate,
  classifyImageCandidate,
  isAllowedImageSource
};
