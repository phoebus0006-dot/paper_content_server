const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const qaDir = path.join(rootDir, 'qa');
const dirsToClean = ['tmp', 'artifacts', 'reports'];

let totalDeleted = 0;

function cleanDir(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      cleanDir(fullPath);
      fs.rmdirSync(fullPath);
    } else {
      fs.unlinkSync(fullPath);
      totalDeleted++;
    }
  }
}

for (const d of dirsToClean) {
  const target = path.join(qaDir, d);
  cleanDir(target);
}

console.log(`qa:clean finished. Deleted ${totalDeleted} files.`);
