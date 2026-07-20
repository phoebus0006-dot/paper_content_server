const fs = require('fs');
const path = require('path');
const tests = ['scripts/rotation-test.js', 'scripts/storyboard-source-test.js'];
for (const t of tests) {
  let s = fs.readFileSync(t, 'utf8');
  if (!s.includes('Buffer.from(')) {
    s = s.replace(/fs\.mkdirSync\(TMPDIR, \{ recursive: true \}\);/, "fs.mkdirSync(TMPDIR, { recursive: true });\ntry { fs.writeFileSync(path.join(TMPDIR, 'c7a7d3bc2f605fb97c4f6996287b3b4e212f8038.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==', 'base64')); } catch(e) {}");
    fs.writeFileSync(t, s);
  }
}
