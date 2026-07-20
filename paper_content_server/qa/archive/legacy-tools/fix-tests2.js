const fs = require('fs');
let s = fs.readFileSync('scripts/photo-safety-test.js', 'utf8');
if (!s.includes("var TMPDIR = path.join(ROOT, 'data', 'test_tmp_'")) {
  s = s.replace(/var ROOT = path\.join\(__dirname, '\.\.'\);/, "var ROOT = path.join(__dirname, '..');\nvar TMPDIR = path.join(ROOT, 'data', 'test_tmp_' + Date.now());\ntry { fs.mkdirSync(TMPDIR, {recursive: true}); fs.writeFileSync(path.join(TMPDIR, 'c7a7d3bc2f605fb97c4f6996287b3b4e212f8038.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==', 'base64')); } catch(e) {}");
  fs.writeFileSync('scripts/photo-safety-test.js', s);
}
