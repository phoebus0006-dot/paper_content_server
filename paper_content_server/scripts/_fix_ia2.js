const fs = require('fs');
const src = fs.readFileSync(__dirname + '/fetch-images.js', 'utf8');

// Add file.name check in the IA file loop
const target = "const url = `https://archive.org/download/${identifier}/${encodeURIComponent(file.name)}`;";
const idx = src.indexOf(target);
if (idx < 0) { console.log('IA file url target not found'); process.exit(1); }

// Find end of line and insert after
const eol = src.indexOf('\n', idx);
const insertAt = eol + 1;

const afterLine = src.slice(insertAt, insertAt + 80);
if (afterLine.includes('isLowQualityTitle')) {
  console.log('Already added');
  process.exit(0);
}

const newSrc = src.slice(0, insertAt) +
  '            if (isLowQualityTitle(file.name, identifier)) continue;\r\n' +
  src.slice(insertAt);

fs.writeFileSync(__dirname + '/fetch-images.js', newSrc);
console.log('OK - IA file.name filter added');
