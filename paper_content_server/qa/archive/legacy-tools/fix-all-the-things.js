const fs = require('fs');

// Clean up ast-extract.js
let ast = fs.readFileSync('ast-extract.js', 'utf8');
ast = ast.replace(/'normalizeText', /g, '');
ast = ast.replace(/'isRecentlyShown',/g, "'isRecentlyShown', 'normalizeText',");
fs.writeFileSync('ast-extract.js', ast);

// Clean up inject-runtime.js
let inj = fs.readFileSync('inject-runtime.js', 'utf8');
inj = inj.replace(/normalizeText, /g, '');
inj = inj.replace(/isRecentlyShown, /g, "isRecentlyShown, normalizeText, ");
fs.writeFileSync('inject-runtime.js', inj);

// Fix fix-timezone-final.js
let ftf = fs.readFileSync('fix-timezone-final.js', 'utf8');
ftf = ftf.replace(/p = p\.replace\(\/\\= TIMEZONE\/g, "\\= getTimezone\(\)"\);\n/, "p = p.replace(/, TIMEZONE(, | \\})/g, \"$1\");\np = p.replace(/= TIMEZONE/g, \"= getTimezone()\");\n");
ftf = ftf.replace(/p = p\.replace\(\/\\, TIMEZONE\\(\\,\\| \\\\}\\)\/g, "\\$1"\);\n/, "");
// Also we need to make sure we don't double up
fs.writeFileSync('fix-timezone-final.js', ftf);
