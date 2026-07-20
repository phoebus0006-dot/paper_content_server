const fs = require('fs');
let s = fs.readFileSync('inject-runtime.js', 'utf8');
s = s.replace(/groupImagesByKindAndTheme, /g, "groupImagesByKindAndTheme, groupImagesByTheme, ");
fs.writeFileSync('inject-runtime.js', s);
