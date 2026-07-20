const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const exclude = ['node_modules', '.git', 'data', 'public'];

function walk(dir) {
  let files = [];
  try {
    const list = fs.readdirSync(dir);
    for (const item of list) {
      if (exclude.includes(item)) continue;
      const p = path.join(dir, item);
      const stat = fs.statSync(p);
      if (stat.isDirectory()) {
        files = files.concat(walk(p));
      } else if (p.endsWith('.js')) {
        files.push(p);
      }
    }
  } catch(e) {}
  return files;
}

const jsFiles = walk(root);
let fail = 0;
for (const f of jsFiles) {
  const res = spawnSync('node', ['--check', f]);
  if (res.status !== 0) {
    console.log(res.stderr.toString());
    fail++;
  }
}
if (fail > 0) process.exit(1);
console.log('Syntax check passed for', jsFiles.length, 'files');
