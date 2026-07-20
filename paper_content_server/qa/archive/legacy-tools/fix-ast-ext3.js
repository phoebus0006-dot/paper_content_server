const fs = require('fs');
let s = fs.readFileSync('ast-extract.js', 'utf8');
s = s.replace(/'groupImagesByKindAndTheme',/g, "'groupImagesByKindAndTheme', 'groupImagesByTheme',");
fs.writeFileSync('ast-extract.js', s);
