const fs = require('fs');
let p = fs.readFileSync('src/app/pure-logic.js', 'utf8');
p = p.replace(/const TIMEZONE = String\(APP_CONFIG\.timezone \|\| DEFAULT_TIMEZONE \|\| 'UTC'\);/, "const TIMEZONE = 'UTC';");
fs.writeFileSync('src/app/pure-logic.js', p);
