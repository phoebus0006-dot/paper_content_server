var passed = 0, failed = 0, exitCode = 0;
function check(l, c) { if (c) { passed++; console.log('PASS', l) } else { failed++; exitCode = 1; console.log('FAIL', l) } }

function parseCIDR(cidr) {
  var parts = cidr.split('/'); var ipParts = parts[0].split('.').map(Number);
  var mask = parseInt(parts[1], 10); if (isNaN(mask)) mask = 32;
  if (ipParts.length !== 4 || ipParts.some(isNaN) || mask < 0 || mask > 32) return null;
  var ipNum = ((ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3]) >>> 0;
  if (mask === 0) return { network: 0, mask: 0 };
  var hostBits = 32 - mask;
  var maskNum = (~((1 << hostBits) - 1)) >>> 0;
  return { network: ipNum & maskNum, mask: maskNum };
}

function ipInCIDRs(ip, cidrs) {
  var ipParts = ip.split('.').map(Number);
  if (ipParts.length !== 4 || ipParts.some(isNaN)) return false;
  var ipNum = ((ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3]) >>> 0;
  for (var i = 0; i < cidrs.length; i++) {
    var c = cidrs[i]; if (c && (ipNum & c.mask) === c.network) return true;
  }
  return false;
}

function isAddressAllowed(remoteAddr, cidrStr) {
  var ip = remoteAddr; if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (ip === '::1') ip = '127.0.0.1';
  if (!cidrStr) return true;
  var cidrList = cidrStr.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
  var parsed = [];
  for (var i = 0; i < cidrList.length; i++) { var p = parseCIDR(cidrList[i]); if (p) parsed.push(p); }
  if (parsed.length === 0) return true;
  return ipInCIDRs(ip, parsed);
}

console.log('=== Admin CIDR Policy Unit Test ===');

// 127.0.0.1 NOT unconditionally allowed
check('127.0.0.1 in 127.0.0.0/8', isAddressAllowed('127.0.0.1', '127.0.0.0/8') === true);
check('127.0.0.1 NOT in 10.0.0.0/8', isAddressAllowed('127.0.0.1', '10.0.0.0/8') === false);
check('10.8.1.2 in 10.0.0.0/8', isAddressAllowed('10.8.1.2', '10.0.0.0/8') === true);
check('11.0.0.1 NOT in 10.0.0.0/8', isAddressAllowed('11.0.0.1', '10.0.0.0/8') === false);

// 172.16.0.0/12 boundaries
check('172.15.1.2 NOT in 172.16.0.0/12', isAddressAllowed('172.15.1.2', '172.16.0.0/12') === false);
check('172.16.1.2 in 172.16.0.0/12', isAddressAllowed('172.16.1.2', '172.16.0.0/12') === true);
check('172.31.255.255 in 172.16.0.0/12', isAddressAllowed('172.31.255.255', '172.16.0.0/12') === true);
check('172.32.0.1 NOT in 172.16.0.0/12', isAddressAllowed('172.32.0.1', '172.16.0.0/12') === false);

// 192.168.0.0/16
check('192.168.1.49 in 192.168.0.0/16', isAddressAllowed('192.168.1.49', '192.168.0.0/16') === true);
check('192.169.0.1 NOT in 192.168.0.0/16', isAddressAllowed('192.169.0.1', '192.168.0.0/16') === false);

// IPv4-mapped IPv6
check('::ffff:192.168.1.49 normalized', isAddressAllowed('::ffff:192.168.1.49', '192.168.0.0/16') === true);

// Multiple CIDRs
check('10.8.1.1 in 10.0.0.0/8,172.16.0.0/12', isAddressAllowed('10.8.1.1', '10.0.0.0/8,172.16.0.0/12') === true);
check('172.20.1.1 in 10.0.0.0/8,172.16.0.0/12', isAddressAllowed('172.20.1.1', '10.0.0.0/8,172.16.0.0/12') === true);
check('8.8.8.8 NOT in 10.0.0.0/8,172.16.0.0/12', isAddressAllowed('8.8.8.8', '10.0.0.0/8,172.16.0.0/12') === false);

// Edge cases
check('/0 allows all', isAddressAllowed('8.8.8.8', '0.0.0.0/0') === true);
check('/32 exact match', isAddressAllowed('10.0.0.1', '10.0.0.1/32') === true);
check('/32 no match', isAddressAllowed('10.0.0.2', '10.0.0.1/32') === false);
check('empty CIDR allows all', isAddressAllowed('8.8.8.8', '') === true);

// Invalid CIDR
check('parseCIDR invalid', parseCIDR('not-an-ip') === null);
check('parseCIDR /33 invalid', parseCIDR('10.0.0.0/33') === null);

console.log('=== Summary:', passed, 'passed,', failed, 'failed ===');
process.exit(exitCode);
