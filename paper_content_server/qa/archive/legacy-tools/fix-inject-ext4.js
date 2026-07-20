const fs = require('fs');
let s = fs.readFileSync('inject-runtime.js', 'utf8');
s = s.replace(/SHOT_STORYBOARD_PATTERN, /g, "SHOT_STORYBOARD_PATTERN, PHOTO_THEME_POOL, ");
fs.writeFileSync('inject-runtime.js', s);
