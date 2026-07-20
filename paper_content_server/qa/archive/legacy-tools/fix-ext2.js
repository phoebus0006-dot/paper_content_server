const fs = require('fs');
let s = fs.readFileSync('extract.js', 'utf8');
s = s.replace(/path\.join\(__dirname, '\.\.\/\.\.\/\.\.'\)/g, "path.join(__dirname, '../..')");
fs.writeFileSync('extract.js', s);
