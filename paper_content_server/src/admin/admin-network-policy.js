// admin-network-policy.js — IP-based access control for admin routes
// Used by server.js and admin tests. Single source of truth for CIDR checks.

function parseCIDR(cidr) {
  if (typeof cidr !== 'string') return null;
  var parts = cidr.split('/');
  if (parts.length !== 2) return null;
  var ipParts = parts[0].split('.');
  if (ipParts.length !== 4) return null;
  var octets = ipParts.map(Number);
  for (var i = 0; i < octets.length; i++) {
    if (isNaN(octets[i]) || octets[i] < 0 || octets[i] > 255 || !Number.isInteger(octets[i])) return null;
  }
  var mask = parseInt(parts[1], 10);
  if (isNaN(mask) || mask < 0 || mask > 32) return null;
  var ipNum = ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
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
  if (!rawCidrs || typeof rawCidrs !== 'string' || !rawCidrs.trim()) return { parsed: [], valid: false, error: 'EMPTY_CIDR_CONFIG' };
  var cidrStrings = rawCidrs.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
  if (cidrStrings.length === 0) return { parsed: [], valid: false, error: 'EMPTY_CIDR_CONFIG' };
  var parsed = [];
  for (var i = 0; i < cidrStrings.length; i++) {
    var p = parseCIDR(cidrStrings[i]);
    if (p) parsed.push(p);
  }
  if (parsed.length === 0) return { parsed: [], valid: false, error: 'ALL_INVALID_CIDRS' };
  return { parsed: parsed, valid: true, error: null };
}

function isAddressAllowed(remoteAddr, parsedCIDRs) {
  var ip = normalizeRemoteAddress(remoteAddr);
  if (!ip) return false;
  return ipInCIDRs(ip, parsedCIDRs);
}

function getRemoteIP(req, trustProxy, trustedProxyCIDRs) {
  if (trustProxy && req.socket && req.socket.remoteAddress) {
    var remoteAddr = req.socket.remoteAddress;
    if (remoteAddr.startsWith('::ffff:')) remoteAddr = remoteAddr.slice(7);
    var isTrusted = ipInCIDRs(remoteAddr, trustedProxyCIDRs || []);
    if (isTrusted) {
      var xff = req.headers['x-forwarded-for'];
      if (xff) {
        var forwarded = xff.split(',')[0].trim();
        if (/^\d+\.\d+\.\d+\.\d+$/.test(forwarded)) return forwarded;
      }
      var xri = req.headers['x-real-ip'];
      if (xri && /^\d+\.\d+\.\d+\.\d+$/.test(xri.trim())) return xri.trim();
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
