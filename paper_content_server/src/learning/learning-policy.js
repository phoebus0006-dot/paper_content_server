// learning-policy.js — Policy rules for learning candidates (relevance gate)
function createPolicy(config) {
  config = config || {};
  var allowedLicenses = config.allowedLicenses || ['CC0','CC-BY','CC-BY-SA','PUBLIC_DOMAIN','Public domain'];
  var topics = config.topics || [];  // 主题关键词列表
  var keywords = config.keywords || [];  // 关键词列表
  var qualityThreshold = config.qualityThreshold || 0;
  var minScore = config.minScore || 0;

  function computeTopicScore(candidate) {
    if (!topics.length) return 1;  // 无主题配置时全部通过
    var score = 0;
    var title = (candidate.title || '').toLowerCase();
    var desc = (candidate.description || '').toLowerCase();
    topics.forEach(function(topic) {
      var t = topic.toLowerCase();
      if (title.indexOf(t) >= 0) score += 2;
      if (desc.indexOf(t) >= 0) score += 1;
    });
    return score;
  }

  function computeQualityScore(candidate) {
    var score = 0;
    if (candidate.width && candidate.height) {
      var megaPixels = (candidate.width * candidate.height) / 1000000;
      if (megaPixels >= 0.5) score += 2;
      if (megaPixels >= 2) score += 1;
    }
    if (candidate.license) score += 1;
    if (candidate.sourceUrl) score += 1;
    return score;
  }

  function isAllowed(candidate) {
    // License check
    if (candidate.rightsStatus === 'RESTRICTED') return false;
    if (candidate.license && allowedLicenses.indexOf(candidate.license) < 0) {
      // 特殊处理 "Public domain" 格式
      if (!(candidate.license === 'Public domain' && allowedLicenses.indexOf('PUBLIC_DOMAIN') >= 0)) {
        return false;
      }
    }

    // Topic score
    var topicScore = computeTopicScore(candidate);
    if (topics.length && topicScore < minScore) return false;

    // Quality score
    var qualityScore = computeQualityScore(candidate);
    if (qualityScore < qualityThreshold) return false;

    return true;
  }

  function evaluate(candidate) {
    var allowed = isAllowed(candidate);
    var topicScore = computeTopicScore(candidate);
    var qualityScore = computeQualityScore(candidate);
    var rejectReason = null;
    if (!allowed) {
      if (candidate.rightsStatus === 'RESTRICTED') rejectReason = 'LICENSE_RESTRICTED';
      else if (topics.length && topicScore < minScore) rejectReason = 'TOPIC_SCORE_TOO_LOW';
      else if (qualityScore < qualityThreshold) rejectReason = 'QUALITY_SCORE_TOO_LOW';
      else rejectReason = 'UNKNOWN';
    }
    return {
      topicScore: topicScore,
      qualityScore: qualityScore,
      totalScore: topicScore + qualityScore,
      licenseOk: candidate.rightsStatus !== 'RESTRICTED',
      allowed: allowed,
      rejectReason: rejectReason,
    };
  }

  return {
    isAllowed: isAllowed,
    evaluate: evaluate,
    allowedLicenses: allowedLicenses,
    topics: topics,
    computeTopicScore: computeTopicScore,
    computeQualityScore: computeQualityScore,
  };
}
module.exports = { createPolicy: createPolicy };
