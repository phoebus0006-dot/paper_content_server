const fs = require('fs');

let p = fs.readFileSync('src/app/pure-logic.js', 'utf8');

// Remove any existing const TIMEZONE declaration
p = p.replace(/const TIMEZONE = [^\n]*;\n/g, '');

// Add getTimezone at the top
if (!p.includes('getTimezone = () =>')) {
  p = p.replace(/let runtime = \{ libraryState: \{\} \};\nfunction setRuntime\(r\) \{ runtime = r; \}\n/, "let runtime = { libraryState: {} };\nfunction setRuntime(r) { runtime = r; }\nconst getTimezone = () => (runtime.config && runtime.config.timezone ? runtime.config.timezone : (typeof process !== 'undefined' && process.env.TZ ? process.env.TZ : 'UTC'));\n");
}

// Clean up exports BEFORE replacing , TIMEZONE
p = p.replace(/, TIMEZONE(,| \})/g, "$1");

// Replace default arguments and variable usages
p = p.replace(/= TIMEZONE/g, "= getTimezone()");
p = p.replace(/, TIMEZONE/g, ", getTimezone()");
p = p.replace(/\|\| TIMEZONE/g, "|| getTimezone()");
p = p.replace(/\(TIMEZONE\)/g, "(getTimezone())");

fs.writeFileSync('src/app/pure-logic.js', p);

let s = fs.readFileSync('server.js', 'utf8');
if (!s.includes('runtime.config = APP_CONFIG;')) {
  s = s.replace(/setRuntime\(runtime\);/, "setRuntime(runtime);\nruntime.config = APP_CONFIG;");
  fs.writeFileSync('server.js', s);
}
