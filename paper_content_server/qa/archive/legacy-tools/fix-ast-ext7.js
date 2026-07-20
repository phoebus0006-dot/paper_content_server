const fs = require('fs');
let s = fs.readFileSync('ast-extract.js', 'utf8');
if (!s.includes("'normalizeText'")) {
  s = s.replace(/'isRecentlyShown',/g, "'isRecentlyShown', 'normalizeText',");
  fs.writeFileSync('ast-extract.js', s);
}
