const fs = require('fs');
let s = fs.readFileSync('ast-extract.js', 'utf8');
s = s.replace(/'SHOT_STORYBOARD_PATTERN',/g, "'SHOT_STORYBOARD_PATTERN', 'PHOTO_THEME_POOL',");
fs.writeFileSync('ast-extract.js', s);
