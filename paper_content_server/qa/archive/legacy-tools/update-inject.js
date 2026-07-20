const fs = require('fs');
let s = fs.readFileSync('inject-runtime.js', 'utf8');
s = s.replace(/formatDateKey, /g, "formatDateKey, formatDateParts, ");
fs.writeFileSync('inject-runtime.js', s);
