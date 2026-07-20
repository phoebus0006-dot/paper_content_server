const fs = require('fs');
let s = fs.readFileSync('inject-runtime.js', 'utf8');
s = s.replace(/filterByRotation, /g, "filterByRotation, isRecentlyShown, ");
fs.writeFileSync('inject-runtime.js', s);
