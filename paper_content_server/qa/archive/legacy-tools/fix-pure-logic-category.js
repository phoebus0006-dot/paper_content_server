const fs = require('fs');
let s = fs.readFileSync('src/app/pure-logic.js', 'utf8');

if (!s.includes('CATEGORY_PRIORITY =')) {
  s = s.replace(/const SHOT_STORYBOARD_PATTERN/, "const CATEGORY_PRIORITY = {\n  politics: 60,\n  international: 58,\n  economy: 56,\n  business: 54,\n  technology: 52,\n  tech: 52,\n  culture: 50,\n  entertainment: 48,\n  movies: 47,\n  world: 46,\n  science: 45,\n  sports: 40,\n  sport: 40,\n  health: 38,\n  travel: 35,\n  lifestyle: 30,\n  local: 20\n};\nconst SHOT_STORYBOARD_PATTERN");
}

fs.writeFileSync('src/app/pure-logic.js', s);
