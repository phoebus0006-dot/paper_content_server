const fs = require('fs');

let pure = fs.readFileSync('src/app/pure-logic.js', 'utf8');
pure = pure.replace(/APP_CONFIG\.timezone/g, "(runtime.config ? runtime.config.timezone : (process.env.TZ || 'UTC'))");
pure = pure.replace(/APP_CONFIG\.overridePersistenceFile/g, "(runtime.config ? runtime.config.overridePersistenceFile : runtime.libraryStateFile)");
pure = pure.replace(/\(typeof APP_CONFIG !== 'undefined' \? APP_CONFIG\.timezone : \(process\.env\.TZ \|\| 'UTC'\)\)/g, "(runtime.config ? runtime.config.timezone : (process.env.TZ || 'UTC'))");
pure = pure.replace(/\(typeof APP_CONFIG !== 'undefined' \? APP_CONFIG\.overridePersistenceFile : runtime\.libraryStateFile\)/g, "(runtime.config ? runtime.config.overridePersistenceFile : runtime.libraryStateFile)");
fs.writeFileSync('src/app/pure-logic.js', pure);

let s = fs.readFileSync('server.js', 'utf8');
if (!s.includes('runtime.config = APP_CONFIG;')) {
  s = s.replace(/const APP_CONFIG = loadAppConfig\(\);/, "const APP_CONFIG = loadAppConfig();\nruntime.config = APP_CONFIG;");
  fs.writeFileSync('server.js', s);
}
