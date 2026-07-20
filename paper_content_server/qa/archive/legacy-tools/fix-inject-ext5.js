const fs = require('fs');
let s = fs.readFileSync('inject-runtime.js', 'utf8');
s = s.replace(/sortByLastShown/g, "sortByLastShown, filterByRotation, categoryForRotation, categoryPriority, canonicalUrl, titleHash");
fs.writeFileSync('inject-runtime.js', s);
