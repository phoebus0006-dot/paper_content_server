// admin-csrf-policy.js — Cross-Site Request Forgery protection for admin write endpoints

var ALLOWED_CONTENT_TYPES = ['application/json', 'multipart/form-data'];

function checkContentType(req) {
  var ct = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  for (var i = 0; i < ALLOWED_CONTENT_TYPES.length; i++) {
    if (ct === ALLOWED_CONTENT_TYPES[i]) return true;
  }
  return false;
}

function parseOrigin(origin) {
  if (!origin) return null;
  try { return (new URL(origin)).host; } catch(e) { return null; }
}

function parseReferer(referer) {
  if (!referer) return null;
  try { return (new URL(referer)).host; } catch(e) { return null; }
}

function checkCSRF(req, allowHeaderlessWrite) {
  var method = req.method;
  if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH' && method !== 'DELETE') return { allowed: true };

  if (!checkContentType(req)) return { allowed: false, error: 'INVALID_CONTENT_TYPE' };

  var host = (req.headers['host'] || '').toLowerCase();
  if (!host) return { allowed: false, error: 'MISSING_HOST' };

  var origin = parseOrigin(req.headers['origin']);
  var referer = parseReferer(req.headers['referer']);
  var secFetchSite = (req.headers['sec-fetch-site'] || '').toLowerCase();

  if (secFetchSite === 'cross-site') return { allowed: false, error: 'CROSS_SITE_SEC_FETCH' };

  if (origin) {
    if (origin.toLowerCase() !== host) return { allowed: false, error: 'ORIGIN_MISMATCH' };
    return { allowed: true };
  }

  if (referer) {
    if (referer.toLowerCase() !== host) return { allowed: false, error: 'REFERER_MISMATCH' };
    return { allowed: true };
  }

  if (allowHeaderlessWrite) return { allowed: true };

  return { allowed: false, error: 'NO_ORIGIN_NO_REFERER' };
}

module.exports = {
  checkCSRF: checkCSRF,
  checkContentType: checkContentType,
  ALLOWED_CONTENT_TYPES: ALLOWED_CONTENT_TYPES,
};
