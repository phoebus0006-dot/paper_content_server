const fs = require('fs');
let s = fs.readFileSync('inject-runtime.js', 'utf8');
if (!s.includes("normalizeText, ")) {
  s = s.replace(/isRecentlyShown, /g, "isRecentlyShown, normalizeText, ");
  fs.writeFileSync('inject-runtime.js', s);
}
