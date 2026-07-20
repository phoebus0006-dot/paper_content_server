const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const tests = [
  'scripts/photo-safety-test.js',
  'scripts/storyboard-source-test.js',
  'scripts/rotation-test.js',
  'scripts/schedule-test.js',
  'scripts/coherence-test.js'
];
for (const t of tests) {
  const tPath = path.join(ROOT, t);
  if (!fs.existsSync(tPath)) continue;
  let c = fs.readFileSync(tPath, 'utf8');
  c = c.replace(/require\(path\.join\(ROOT, 'src\/app\/pure-logic\.js'\)\)\)/g, "require(path.join(ROOT, 'src/app/pure-logic.js'))");
  fs.writeFileSync(tPath, c);
}
