const fs = require('fs');
let s = fs.readFileSync('inject-runtime.js', 'utf8');
s = s.replace(/formatDateKey, formatDateParts, /g, "formatDateKey, formatDateParts, resolveDisplayMode, ");
fs.writeFileSync('inject-runtime.js', s);
