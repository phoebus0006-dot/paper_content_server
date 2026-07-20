const fs = require('fs');
let s = fs.readFileSync('inject-runtime.js', 'utf8');
s = s.replace(/formatDateKey, formatDateParts, resolveDisplayMode, /g, "formatDateKey, formatDateParts, resolveDisplayMode, groupImagesByTheme, ");
fs.writeFileSync('inject-runtime.js', s);
