const fs = require('fs');
let s = fs.readFileSync('inject-runtime.js', 'utf8');
s = s.replace(/normalizeText, normalizeText, /g, "normalizeText, ");
fs.writeFileSync('inject-runtime.js', s);
