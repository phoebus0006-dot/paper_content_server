const fs = require('fs');
let s = fs.readFileSync('ast-extract.js', 'utf8');
s = s.replace(/'filterByRotation',/g, "'filterByRotation', 'isRecentlyShown',");
fs.writeFileSync('ast-extract.js', s);
