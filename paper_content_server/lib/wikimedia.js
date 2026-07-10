var path = require('path');

var ROOT_DIR = path.join(__dirname, '..');

function loadJson(filePath, fallback) {
  try {
    return JSON.parse(require('fs').readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function loadDotEnv(filePath) {
  if (!require('fs').existsSync(filePath)) return;
  var text = require('fs').readFileSync(filePath, 'utf8');
  for (var rawLine of text.split(/\r?\n/)) {
    var line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    var equalsIndex = line.indexOf('=');
    if (equalsIndex < 0) continue;
    var key = line.slice(0, equalsIndex).trim();
    var value = line.slice(equalsIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadDotEnv(path.join(ROOT_DIR, '.env'));

async function fetchJsonInner(url, timeoutMs) {
  var controller = new AbortController();
  var timer = setTimeout(function() { controller.abort(new Error('timeout')); }, timeoutMs || 20000);
  try {
    var response = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'NewsPhoto_esp32wf/1.0', 'accept': 'application/json, */*;q=0.8' },
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

function withRetry(operation, label, maxAttempts, baseDelayMs) {
  maxAttempts = maxAttempts || 3;
  baseDelayMs = baseDelayMs || 500;
  var lastError;
  return (function attempt(n) {
    return operation().catch(function(error) {
      lastError = error;
      var isRateLimited = error.message.indexOf('429') >= 0 || error.message.indexOf('rate') >= 0;
      if (!isRateLimited && n >= maxAttempts) throw error;
      var delay = baseDelayMs * Math.pow(2, n - 1) * (isRateLimited ? 2 : 1);
      console.log('retry ' + label + ' attempt ' + n + '/' + maxAttempts + ' after ' + delay + 'ms: ' + error.message);
      return sleep(delay).then(function() { return attempt(n + 1); });
    });
  })(1);
}

function fetchJson(url, timeoutMs) {
  return withRetry(function() { return fetchJsonInner(url, timeoutMs); }, 'fetchJson ' + url.slice(0, 80));
}

function extractExtmetadataValue(extmetadata, key) {
  if (!extmetadata || !extmetadata[key]) return '';
  var val = extmetadata[key];
  if (typeof val === 'string') return val;
  if (val.value) return val.value;
  if (val.source) return val.source;
  return '';
}

function parseWikimediaRights(imageinfo) {
  var extmetadata = imageinfo.extmetadata || {};
  var author = extractExtmetadataValue(extmetadata, 'Artist') ||
               extractExtmetadataValue(extmetadata, 'Credit') || '';
  var license = extractExtmetadataValue(extmetadata, 'LicenseShortName') ||
                extractExtmetadataValue(extmetadata, 'UsageTerms') || '';
  var licenseUrl = extractExtmetadataValue(extmetadata, 'LicenseUrl') || '';
  var usageTerms = extractExtmetadataValue(extmetadata, 'UsageTerms') || '';
  var sourcePageUrl = imageinfo.descriptionshorturl
    ? 'https://commons.wikimedia.org' + imageinfo.descriptionshorturl
    : '';

  var hasAuthor = author.trim().length > 0;
  var hasLicense = license.trim().length > 0;

  return {
    rights: {
      author: author,
      license: license,
      licenseUrl: licenseUrl,
      usageTerms: usageTerms,
      sourcePageUrl: sourcePageUrl,
    },
    rightsStatus: hasAuthor && hasLicense ? 'known' : 'unknown',
  };
}

async function fetchWikimediaCategoryCandidates(source) {
  var candidates = [];
  var categories = source.categories || [];
  var limit = source.limitPerCategory || 3;

  for (var cat of categories) {
    try {
      var url = 'https://commons.wikimedia.org/w/api.php?action=query&generator=categorymembers&gcmtitle=Category:' + encodeURIComponent(cat.category) + '&gcmtype=file&gcmlimit=' + limit + '&prop=imageinfo&iiprop=url|size|mime|user|timestamp|extmetadata&iiurlwidth=1200&format=json';
      var data = await fetchJson(url);
      var pages = data && data.query && data.query.pages ? data.query.pages : {};

      for (var pageId of Object.keys(pages)) {
        var page = pages[pageId];
        var imageinfo = page.imageinfo && page.imageinfo[0];
        if (!imageinfo || !imageinfo.url) continue;
        var title = page.title ? page.title.replace(/^File:/, '').replace(/_/g, ' ') : cat.category;
        var rightsInfo = parseWikimediaRights(imageinfo);

        candidates.push({
          url: imageinfo.url,
          title: title,
          sourceType: 'wikimedia_category',
          source: 'Wikimedia Commons',
          theme: cat.theme || 'cinematic',
          kind: cat.kind || 'film_still',
          poolType: source.poolType || 'study_frames',
          metadata: {
            pageId: page.pageid,
            filePageUrl: page.title ? 'https://commons.wikimedia.org/wiki/' + encodeURIComponent(page.title) : '',
            sourceCategory: cat.category,
            description: page.description || '',
            ...rightsInfo.rights,
          },
          rights: rightsInfo.rights,
          rightsStatus: rightsInfo.rightsStatus,
        });
      }
      await sleep(2500);
    } catch (error) {
      console.log('wikimedia category failed for ' + cat.category + ': ' + error.message);
    }
  }

  return candidates;
}

module.exports = {
  fetchWikimediaCategoryCandidates,
  parseWikimediaRights,
  extractExtmetadataValue,
};