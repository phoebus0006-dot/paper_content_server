const fs = require('fs');
const tests = ['scripts/photo-safety-test.js', 'scripts/rotation-test.js', 'scripts/storyboard-source-test.js'];
for (const t of tests) {
  let s = fs.readFileSync(t, 'utf8');
  // For photo-safety-test.js
  s = s.replace(/ROOT \+ '\/data\/processed_images\//g, "TMPDIR + '/");
  // For rotation-test.js and storyboard-source-test.js
  s = s.replace(/path\.join\(ROOT,\s*'data',\s*'processed_images',\s*'c7a7d3bc2f605fb97c4f6996287b3b4e212f8038\.png'\)/g, "path.join(TMPDIR, 'c7a7d3bc2f605fb97c4f6996287b3b4e212f8038.png')");
  fs.writeFileSync(t, s);
}
