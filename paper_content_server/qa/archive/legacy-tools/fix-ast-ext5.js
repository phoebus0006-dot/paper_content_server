const fs = require('fs');
let s = fs.readFileSync('ast-extract.js', 'utf8');
s = s.replace(/'sortByLastShown'/g, "'sortByLastShown', 'filterByRotation', 'categoryForRotation', 'categoryPriority', 'canonicalUrl', 'titleHash'");
s = s.replace(/'NEWS_MAX_ITEMS',/g, "'NEWS_MAX_ITEMS', 'NEWS_SHOWN_RECALL_HOURS', 'NEWS_SHOWN_FALLBACK_HOURS', 'NEWS_MIN_ITEMS',");
fs.writeFileSync('ast-extract.js', s);
