const fs = require('fs');
let s = fs.readFileSync('src/app/pure-logic.js', 'utf8');
s = s.replace(/APP_CONFIG\.timezone/g, "(typeof APP_CONFIG !== 'undefined' ? APP_CONFIG.timezone : (process.env.TZ || 'UTC'))");
s = s.replace(/APP_CONFIG\.overridePersistenceFile/g, "(typeof APP_CONFIG !== 'undefined' ? APP_CONFIG.overridePersistenceFile : runtime.libraryStateFile)");
fs.writeFileSync('src/app/pure-logic.js', s);
