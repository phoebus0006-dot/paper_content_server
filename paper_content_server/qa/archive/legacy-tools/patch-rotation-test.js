const fs = require('fs');
let s = fs.readFileSync('scripts/rotation-test.js', 'utf8');
s = s.replace(/test\('PHASE_A_NEWS_200', newsA\.s === 200, 'status=' \+ newsA\.s\);/g, "test('PHASE_A_NEWS_200', newsA.s === 200, 'status=' + newsA.s + ' err=' + newsA.b.toString());");
fs.writeFileSync('scripts/rotation-test.js', s);
