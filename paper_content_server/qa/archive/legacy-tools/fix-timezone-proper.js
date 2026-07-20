const fs = require('fs');

let p = fs.readFileSync('src/app/pure-logic.js', 'utf8');
p = p.replace(/const TIMEZONE = String\(APP_CONFIG\.timezone \|\| DEFAULT_TIMEZONE \|\| 'UTC'\);/, "const TIMEZONE = String((runtime.config ? runtime.config.timezone : (typeof process !== 'undefined' && process.env.TZ ? process.env.TZ : null)) || 'UTC');");
fs.writeFileSync('src/app/pure-logic.js', p);

let s = fs.readFileSync('server.js', 'utf8');
if (!s.includes('runtime.config = APP_CONFIG;')) {
  s = s.replace(/setRuntime\(runtime\);/, "setRuntime(runtime);\nruntime.config = APP_CONFIG;");
  fs.writeFileSync('server.js', s);
}
