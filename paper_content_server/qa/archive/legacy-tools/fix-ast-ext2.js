const fs = require('fs');
let s = fs.readFileSync('ast-extract.js', 'utf8');
s = s.replace(/'formatDateKey', 'formatDateParts', 'resolveDisplayMode',/g, "'formatDateKey', 'formatDateParts', 'resolveDisplayMode', 'groupImagesByTheme',");
fs.writeFileSync('ast-extract.js', s);
