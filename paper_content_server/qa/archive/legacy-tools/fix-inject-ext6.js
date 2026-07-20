const fs = require('fs');
let s = fs.readFileSync('inject-runtime.js', 'utf8');
s = s.replace(/titleHash \} = pureLogic;/, "titleHash, FRAME_WIDTH, FRAME_HEIGHT, TIMEZONE, NEWS_REFRESH_MINUTES, NEWS_MAX_ITEMS, SHOT_STORYBOARD_PATTERN, DEFAULT_PANEL, PANEL_SIZES, NEWS_SHOWN_RECALL_HOURS, NEWS_SHOWN_FALLBACK_HOURS, NEWS_MIN_ITEMS, PHOTO_THEME_POOL } = pureLogic;");
fs.writeFileSync('inject-runtime.js', s);
