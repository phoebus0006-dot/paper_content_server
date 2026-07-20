const fs = require('fs');
let s = fs.readFileSync('src/app/pure-logic.js', 'utf8');
s = s.replace(/const ROOT_DIR = path\.join\(__dirname, '\.\.\/\.\.\/\.\.'\);/, "const ROOT_DIR = path.join(__dirname, '../..');");
s = s.replace(/path\.join\(__dirname, '\.\.\/\.\.\/\.\.', /g, "path.join(__dirname, '../..', ");
fs.writeFileSync('src/app/pure-logic.js', s);
