const fs = require('fs');
const src = fs.readFileSync(__dirname + '/fetch-images.js', 'utf8');

// Add QA filter in Internet Archive section: after "const title = doc.title || identifier;"
const target = 'const title = doc.title || identifier;';
const idx = src.indexOf(target);
if (idx < 0) { console.log('IA target not found'); process.exit(1); }

// Find the end of that line
const eol = src.indexOf('\n', idx);
const insertAt = eol + 1;

// Check if already added
const afterLine = src.slice(insertAt, insertAt + 60);
if (afterLine.includes('isLowQualityTitle')) {
  console.log('Already added, skipping');
  process.exit(0);
}

const newSrc = src.slice(0, insertAt) +
  '        if (isLowQualityTitle(title, identifier)) continue;\r\n' +
  src.slice(insertAt);

fs.writeFileSync(__dirname + '/fetch-images.js', newSrc);
console.log('OK - IA filter added');
