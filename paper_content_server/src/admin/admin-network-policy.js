// admin-network-policy.js — IP-based access control for admin routes
// Used by server.js and admin tests. Single source of truth for CIDR checks.

var OCTET_RE = /^(0|[1-9]\d{0,2})$/;
var MASK_RE = /^(\d{1,2})$/;
var CIDR_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/;

function parseCIDR(cidr) {
  if (typeof cidr !== 'string') return null;
  var trimmed = cidr.trim();
  var match = trimmed.match(CIDR_RE);
  if (!match) return null;
  for (var i = 1; i <= 4; i++) {
    var octet = parseInt(match[i], 10);
    if (octet < 0 || octet > 255) return null;
  }
  var mask = parseInt(match[5], 10);
  if (mask < 0 || mask > 32) return null;
  var ipNum = ((parseInt(match[1], 10) << 24) | (parseInt(match[2], 10) << 16) | (parseInt(match[3], 10) << 8) | parseInt(match[4], 10)) >>> 0;
  if (mask === 0) return { network: 0, mask: 0 };
  var hostBits = 32 - mask;
  var maskNum = (~((1 << hostBits) - 1)) >>> 0;
  return { network: ipNum & maskNum, mask: maskNum };
}

function ipInCIDRs(ip, cidrs) {
  var ipParts = ip.split('.').map(Number);
  if (ipParts.length !== 4 || ipParts.some(function(n) { return isNaN(n) || n < 0 || n > 255; })) return false;
  var ipNum = ((ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3]) >>> 0;
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
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return null;
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

function getRemoteIP(req, trustProxy, trustedProxyCIDRs) {
  if (trustProxy && req.socket && req.socket.remoteAddress) {
    var remoteAddr = normalizeRemoteAddress(req.socket.remoteAddress);
    if (remoteAddr && ipInCIDRs(remoteAddr, trustedProxyCIDRs || [])) {
      var xff = req.headers['x-forwarded-for'];
      if (xff) {
        var forwarded = xff.split(',')[0].trim();
        if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(forwarded)) return forwarded;
      }
      var xri = req.headers['x-real-ip'];
      if (xri) {
        var ri = xri.trim();
        if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ri)) return ri;
      }
    }
  }
  return req.socket ? req.socket.remoteAddress : null;
}

module.exports = {
  parseCIDR: parseCIDR,
  ipInCIDRs: ipInCIDRs,
  normalizeRemoteAddress: normalizeRemoteAddress,
  parseCIDRList: parseCIDRList,
  isAddressAllowed: isAddressAllowed,
  getRemoteIP: getRemoteIP,
};
