const fs = require('fs');
let s = fs.readFileSync('patch4.js', 'utf8');
s = s.replace(/s = s\.replace\(\/APP_CONFIG\\\.overridePersistenceFile\/g, \"\\(typeof APP_CONFIG !== 'undefined' \\? APP_CONFIG\.overridePersistenceFile : runtime\.libraryStateFile\\)\"\);/,
  "s = s.replace(/APP_CONFIG\\.overridePersistenceFile/g, \"(typeof APP_CONFIG !== 'undefined' ? APP_CONFIG.overridePersistenceFile : runtime.libraryStateFile)\");\n  s = s.replace(/APP_CONFIG\\.timezone/g, \"(typeof APP_CONFIG !== 'undefined' ? APP_CONFIG.timezone : (process.env.TZ || 'UTC'))\");");
fs.writeFileSync('patch4.js', s);
