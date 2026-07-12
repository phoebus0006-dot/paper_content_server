// admin-network-policy.js — IP-based access control for admin routes
// Used by server.js and admin tests. Single source of truth for CIDR checks.
// All IP parsing flows through parseIPv4 (strict dotted-quad, no leading zeros,
// no scientific notation, no negatives).

var CIDR_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/;

// parseIPv4 — strict IPv4 parser. Returns numeric IP (uint32) or null.
// Rejects: 999.1.1.1, 256.0.0.1, 1.2.3, 1.2.3.4.5, 01e2.1.1.1, 1.2.3.-1, etc.
function parseIPv4(value) {
  if (typeof value !== 'string') return null;
  var parts = value.split('.');
  if (parts.length !== 4) return null;
  var nums = [];
  for (var i = 0; i < 4; i++) {
    var p = parts[i];
    // Allow "0" but reject leading zeros (e.g. "01"), letters, scientific
    // notation, negatives, empty strings, and non-numeric garbage.
    if (!/^(0|[1-9]\d{0,2})$/.test(p)) return null;
    var n = parseInt(p, 10);
    if (n < 0 || n > 255) return null;
    nums.push(n);
  }
  return ((nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3]) >>> 0;
}

function parseCIDR(cidr) {
  if (typeof cidr !== 'string') return null;
  var trimmed = cidr.trim();
  var match = trimmed.match(CIDR_RE);
  if (!match) return null;
  // Validate octets via strict parser (rejects leading zeros / out-of-range).
  var ipNum = parseIPv4(match[1] + '.' + match[2] + '.' + match[3] + '.' + match[4]);
  if (ipNum === null) return null;
  var mask = parseInt(match[5], 10);
  if (mask < 0 || mask > 32) return null;
  if (mask === 0) return { network: 0, mask: 0 };
  var hostBits = 32 - mask;
  var maskNum = (~((1 << hostBits) - 1)) >>> 0;
  return { network: ipNum & maskNum, mask: maskNum };
}

function ipInCIDRs(ip, cidrs) {
  var ipNum = parseIPv4(ip);
  if (ipNum === null) return false;
  for (var i = 0; i < cidrs.length; i++) {
    var c = cidrs[i];
    if (c && (ipNum & c.mask) === c.network) return true;
  }
  return false;
}

function normalizeRemoteAddress(remoteAddr) {
  if (!remoteAddr) return null;
  var ip = remoteAddr;
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (ip === '::1') ip = '127.0.0.1';
  if (parseIPv4(ip) === null) return null;
  return ip;
}

function parseCIDRList(rawCidrs) {
  if (!rawCidrs || typeof rawCidrs !== 'string' || !rawCidrs.trim()) return { parsed: [], valid: false, error: 'EMPTY_CIDR_CONFIG', invalidEntries: [] };
  var cidrStrings = rawCidrs.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
  if (cidrStrings.length === 0) return { parsed: [], valid: false, error: 'EMPTY_CIDR_CONFIG', invalidEntries: [] };
  var parsed = [], invalid = [];
  for (var i = 0; i < cidrStrings.length; i++) {
    var p = parseCIDR(cidrStrings[i]);
    if (p) parsed.push(p); else invalid.push(cidrStrings[i]);
  }
  if (invalid.length > 0) return { parsed: [], valid: false, error: 'MIXED_INVALID_CIDRS', invalidEntries: invalid };
  return { parsed: parsed, valid: true, error: null, invalidEntries: [] };
}

function isAddressAllowed(remoteAddr, parsedCIDRs) {
  var ip = normalizeRemoteAddress(remoteAddr);
  if (!ip) return false;
  return ipInCIDRs(ip, parsedCIDRs);
}

// getRemoteIP — proxy chain policy: only the FIRST X-Forwarded-For entry is
// trusted, and only when the socket remoteAddress belongs to trustedProxyCIDRs.
function getRemoteIP(req, trustProxy, trustedProxyCIDRs) {
  if (trustProxy && req.socket && req.socket.remoteAddress) {
    var remoteAddr = normalizeRemoteAddress(req.socket.remoteAddress);
    if (remoteAddr && ipInCIDRs(remoteAddr, trustedProxyCIDRs || [])) {
      var xff = req.headers['x-forwarded-for'];
      if (xff) {
        // Only the first (left-most) entry is the original client.
        var forwarded = xff.split(',')[0].trim();
        if (parseIPv4(forwarded) !== null) return forwarded;
      }
      var xri = req.headers['x-real-ip'];
      if (xri) {
        var ri = xri.trim();
        if (parseIPv4(ri) !== null) return ri;
      }
    }
  }
  return req.socket ? req.socket.remoteAddress : null;
}

module.exports = {
  parseIPv4: parseIPv4,
  parseCIDR: parseCIDR,
  ipInCIDRs: ipInCIDRs,
  normalizeRemoteAddress: normalizeRemoteAddress,
  parseCIDRList: parseCIDRList,
  isAddressAllowed: isAddressAllowed,
  getRemoteIP: getRemoteIP,
};
