const fs = require('fs');
let s = fs.readFileSync('ast-extract.js', 'utf8');
s = s.replace(/'formatDateKey',/g, "'formatDateKey', 'formatDateParts',");
fs.writeFileSync('ast-extract.js', s);
