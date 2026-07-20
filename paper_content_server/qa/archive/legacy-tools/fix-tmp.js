const fs = require('fs');
const tests = ['scripts/photo-safety-test.js', 'scripts/storyboard-source-test.js', 'scripts/rotation-test.js'];
for (const t of tests) {
  let s = fs.readFileSync(t, 'utf8');
  s = s.replace(/var TMPDIR = path\.join\(ROOT, 'test_tmp_' \+ Date\.now\(\)\);/g, "var TMPDIR = path.join(ROOT, 'data', 'test_tmp_' + Date.now());");
  fs.writeFileSync(t, s);
}
