// admin-csrf-policy.js — Cross-Site Request Forgery protection for admin write endpoints
//
// A request is allowed only when it carries a same-origin Origin OR Referer that
// matches the request's own scheme + host + port. Headers that are PRESENT but
// malformed are rejected explicitly (INVALID_ORIGIN / INVALID_REFERER) and are
// never treated as "missing" — otherwise an attacker could smuggle a garbage
// Origin to bypass the check the way a missing Origin is tolerated when paired
// with a valid Referer (or when allowHeaderlessWrite is enabled).

// application/octet-stream 用于 /api/admin/photos/upload 的 raw binary 上传
// （前端 fetch body: Buffer，不能走 multipart）。浏览器 fetch 的 Content-Type
// 由开发者显式设置，不会被自动 form-encode，所以 octet-stream 不构成 CSRF 风险。
// image/* 同理——前端用 file.type 上传时也是显式设置，不会绕过 Origin/Referer 检查。
var ALLOWED_CONTENT_TYPES = ['application/json', 'multipart/form-data', 'application/octet-stream', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'];

function checkContentType(req) {
  var ct = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  for (var i = 0; i < ALLOWED_CONTENT_TYPES.length; i++) {
    if (ct === ALLOWED_CONTENT_TYPES[i]) return true;
  }
  return false;
}

// normalizePort — collapses empty/default ports to the canonical port for a
// scheme so that "http://host" and "http://host:80" compare equal.
function normalizePort(scheme, port) {
  if (!port) return scheme === 'https' ? '443' : '80';
  return String(port);
}

// parseHeaderURL — classifies an Origin/Referer header value.
//   { state: 'absent' }                      header missing or whitespace-only
//   { state: 'malformed' }                   header present but not a valid http(s) URL
//   { state: 'ok', scheme, host, port }      valid URL, host lowercased, port normalized
// When isOrigin is true, a path/search/fragment is treated as malformed — a
// real browser Origin is always scheme://host:port with no path.
function parseHeaderURL(raw, isOrigin) {
  if (raw === undefined || raw === null) return { state: 'absent' };
  var value = String(raw).trim();
  if (!value) return { state: 'absent' };
  var u;
  try { u = new URL(value); } catch (e) { return { state: 'malformed' }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { state: 'malformed' };
  if (u.username || u.password) return { state: 'malformed' };
  if (isOrigin && (u.pathname !== '/' || u.search || u.hash)) return { state: 'malformed' };
  var scheme = u.protocol.slice(0, -1);
  return { state: 'ok', scheme: scheme, host: u.hostname.toLowerCase(), port: normalizePort(scheme, u.port) };
}

// requestOriginParts — reconstructs the request's own origin from the Host
// header plus the socket scheme. Returns null when the Host header is missing
// or not a bare host[:port].
function requestOriginParts(req) {
  var hostHeader = req.headers['host'];
  if (!hostHeader) return null;
  var value = String(hostHeader).trim();
  if (!value) return null;
  var scheme = (req.socket && req.socket.encrypted) ? 'https' : 'http';
  var u;
  try { u = new URL(scheme + '://' + value); } catch (e) { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  if (u.pathname !== '/' || u.search || u.hash) return null;
  return { scheme: scheme, host: u.hostname.toLowerCase(), port: normalizePort(scheme, u.port) };
}

function sameOrigin(a, b) {
  return a.scheme === b.scheme && a.host === b.host && a.port === b.port;
}

function checkCSRF(req, allowHeaderlessWrite) {
  var method = req.method;
  if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH' && method !== 'DELETE') return { allowed: true };

  if (!checkContentType(req)) return { allowed: false, error: 'INVALID_CONTENT_TYPE' };

  var reqOrigin = requestOriginParts(req);
  if (!reqOrigin) return { allowed: false, error: 'MISSING_HOST' };

  var secFetchSite = (req.headers['sec-fetch-site'] || '').toLowerCase();
  if (secFetchSite === 'cross-site') return { allowed: false, error: 'CROSS_SITE_SEC_FETCH' };

  // Origin takes precedence. A PRESENT-but-malformed Origin must be rejected
  // outright (INVALID_ORIGIN); it must NOT fall through to the Referer check.
  var originInfo = parseHeaderURL(req.headers['origin'], true);
  if (originInfo.state === 'malformed') return { allowed: false, error: 'INVALID_ORIGIN' };
  if (originInfo.state === 'ok') {
    if (!sameOrigin(originInfo, reqOrigin)) return { allowed: false, error: 'ORIGIN_MISMATCH' };
    return { allowed: true };
  }

  // Origin absent → rely on Referer. Same rule: a malformed Referer is rejected
  // explicitly and never treated as missing.
  var refererInfo = parseHeaderURL(req.headers['referer'], false);
  if (refererInfo.state === 'malformed') return { allowed: false, error: 'INVALID_REFERER' };
  if (refererInfo.state === 'ok') {
    if (!sameOrigin(refererInfo, reqOrigin)) return { allowed: false, error: 'REFERER_MISMATCH' };
    return { allowed: true };
  }

  // Both headers genuinely absent.
  if (allowHeaderlessWrite) return { allowed: true };

  return { allowed: false, error: 'NO_ORIGIN_NO_REFERER' };
}

module.exports = {
  checkCSRF: checkCSRF,
  checkContentType: checkContentType,
  parseHeaderURL: parseHeaderURL,
  requestOriginParts: requestOriginParts,
  sameOrigin: sameOrigin,
  ALLOWED_CONTENT_TYPES: ALLOWED_CONTENT_TYPES,
};
