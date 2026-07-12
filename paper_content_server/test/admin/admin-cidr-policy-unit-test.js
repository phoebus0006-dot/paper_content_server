var passed = 0, failed = 0, exitCode = 0;
function check(l, c) { if (c) { passed++; console.log('PASS', l) } else { failed++; exitCode = 1; console.log('FAIL', l) } }

var policy = require('../../src/admin/admin-network-policy');

console.log('=== Admin CIDR Policy Unit Test (using require) ===');

// parseCIDR validation
var r1 = policy.parseCIDR('127.0.0.0/8');
check('parseCIDR 127.0.0.0/8 valid', r1 !== null);
check('parseCIDR 127.0.0.0/8 mask=8', r1 && r1.mask === 0xFF000000 >>> 0);

check('parseCIDR /0 boundary', policy.parseCIDR('0.0.0.0/0') !== null);
check('parseCIDR /32 boundary', policy.parseCIDR('10.0.0.1/32') !== null);
check('parseCIDR invalid', policy.parseCIDR('not-an-ip') === null);
check('parseCIDR /33 invalid', policy.parseCIDR('10.0.0.0/33') === null);
check('parseCIDR 999 octet invalid', policy.parseCIDR('999.1.1.1/24') === null);
check('parseCIDR negative invalid', policy.parseCIDR('-1.0.0.0/24') === null);
check('parseCIDR non-integer invalid', policy.parseCIDR('1.2.3.4.5/24') === null);
check('parseCIDR 192.168..1/24 invalid', policy.parseCIDR('192.168..1/24') === null);
check('parseCIDR 1e2.1.1.1/24 invalid', policy.parseCIDR('1e2.1.1.1/24') === null);
check('parseCIDR trailing garbage', policy.parseCIDR('192.168.1.1/24abc') === null);
check('parseCIDR no mask', policy.parseCIDR('192.168.1.1') === null);
check('parseCIDR mask decimal', policy.parseCIDR('192.168.1.1/24.0') === null);
check('parseCIDR mixed list rejected', policy.parseCIDRList('127.0.0.0/8,999.1.1.1/24').valid === false);

// parseCIDRList
var list1 = policy.parseCIDRList('127.0.0.0/8');
check('parseCIDRList single valid', list1.valid === true);

var list2 = policy.parseCIDRList('');
check('parseCIDRList empty rejected', list2.valid === false && list2.error === 'EMPTY_CIDR_CONFIG');

var list3 = policy.parseCIDRList('999.1.1.1/24');
check('parseCIDRList all invalid rejected', list3.valid === false && list3.error === 'MIXED_INVALID_CIDRS' && list3.invalidEntries.length > 0);

var list4 = policy.parseCIDRList('127.0.0.0/8,10.0.0.0/8,192.168.0.0/16');
check('parseCIDRList multiple valid', list4.valid === true && list4.parsed.length === 3);

// IP normalization
check('normalize IPv4', policy.normalizeRemoteAddress('192.168.1.1') === '192.168.1.1');
check('normalize ::ffff: mapping', policy.normalizeRemoteAddress('::ffff:192.168.1.49') === '192.168.1.49');
check('normalize ::1 mapping', policy.normalizeRemoteAddress('::1') === '127.0.0.1');
check('normalize null', policy.normalizeRemoteAddress(null) === null);
check('normalize undefined', policy.normalizeRemoteAddress(undefined) === null);
check('normalize empty', policy.normalizeRemoteAddress('') === null);

// isAddressAllowed
var cidrs = policy.parseCIDRList('127.0.0.0/8').parsed;
check('127.0.0.1 in 127.0.0.0/8', policy.isAddressAllowed('127.0.0.1', cidrs) === true);
check('127.0.0.1 NOT in 10.0.0.0/8', policy.isAddressAllowed('127.0.0.1', policy.parseCIDRList('10.0.0.0/8').parsed) === false);

var cidrs2 = policy.parseCIDRList('172.16.0.0/12').parsed;
check('172.15.1.2 NOT in 172.16.0.0/12', policy.isAddressAllowed('172.15.1.2', cidrs2) === false);
check('172.16.1.2 in 172.16.0.0/12', policy.isAddressAllowed('172.16.1.2', cidrs2) === true);
check('172.31.255.255 in 172.16.0.0/12', policy.isAddressAllowed('172.31.255.255', cidrs2) === true);
check('172.32.0.1 NOT in 172.16.0.0/12', policy.isAddressAllowed('172.32.0.1', cidrs2) === false);

console.log('=== Summary:', passed, 'passed,', failed, 'failed ===');
process.exit(exitCode);
