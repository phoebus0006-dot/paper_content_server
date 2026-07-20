const fs = require('fs');
let s = fs.readFileSync('src/app/pure-logic.js', 'utf8');

// fix isImageApproved
s = s.replace(
  /function isImageApproved\(entry\) \{[\s\S]*?\}/,
  `function isImageApproved(entry) { return entry && entry.safetyStatus === 'approved'; }`
);

// inject resolveDisplayMode dependency
if (!s.includes("require('../../lib/schedule')")) {
  s = s.replace(/const crypto = require\('crypto'\);/, "const crypto = require('crypto');\nconst { resolveDisplayMode } = require('../../lib/schedule');");
}

fs.writeFileSync('src/app/pure-logic.js', s);
