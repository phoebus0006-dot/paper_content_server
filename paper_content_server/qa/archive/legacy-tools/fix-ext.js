const fs = require('fs');
let s = fs.readFileSync('extract.js', 'utf8');
s = s.replace(/const reqStr = \\`const \{/, 'const reqStr = `const {');
s = s.replace(/\}\`;/, '}`;');
s = s.replace(/c\.replace\(\/require\\\\\(path\\\\\.join\\\\\(ROOT, 'server\\\\\.js'\\\\\\)\\\\\)\/g/, "c.replace(/require\\\\(path\\\\.join\\\\(ROOT, 'server\\\\.js'\\\\)\\\\)/g");
fs.writeFileSync('extract.js', s);
