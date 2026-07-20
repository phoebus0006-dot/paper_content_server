const fs = require('fs');
let p = fs.readFileSync('src/app/pure-logic.js', 'utf8');
const code = `
function resolveAllowedImagePath(requestedPath) {
  if (!requestedPath) return null;
  const path = require('path');
  let absPath = path.isAbsolute(requestedPath) ? requestedPath : path.join(__dirname, '../../..', requestedPath);
  try {
    let resolved = fs.realpathSync(absPath);
    let stat = fs.lstatSync(resolved);
    if (!stat.isFile()) return null;
    let allowedDirs = [
      path.join(__dirname, '../../..', 'data'),
      path.join(__dirname, '../../..', 'public'),
      path.join(__dirname, '../../..', 'src')
    ];
    let isAllowed = false;
    for (let d of allowedDirs) {
      if (resolved.startsWith(fs.realpathSync(d))) {
        isAllowed = true;
        break;
      }
    }
    return isAllowed ? resolved : null;
  } catch(e) {
    return null;
  }
}
`;
if (!p.includes('function resolveAllowedImagePath')) {
  p = p.replace('module.exports = {', code + '\nmodule.exports = {');
  fs.writeFileSync('src/app/pure-logic.js', p);
}
