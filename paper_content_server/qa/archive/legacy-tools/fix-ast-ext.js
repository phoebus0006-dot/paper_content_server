const fs = require('fs');
let s = fs.readFileSync('ast-extract.js', 'utf8');
s = s.replace(/'formatDateKey', 'formatDateParts',/g, "'formatDateKey', 'formatDateParts', 'resolveDisplayMode',");
fs.writeFileSync('ast-extract.js', s);
