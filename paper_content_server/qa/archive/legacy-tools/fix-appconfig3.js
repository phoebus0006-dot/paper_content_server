const fs = require('fs');
let s = fs.readFileSync('server.js', 'utf8');
s = s.replace(/const APP_CONFIG = loadAppConfig\(\);\nruntime\.config = APP_CONFIG;/, "const APP_CONFIG = loadAppConfig();");
s = s.replace(/setRuntime\(runtime\);/, "setRuntime(runtime);\nruntime.config = APP_CONFIG;");
fs.writeFileSync('server.js', s);
