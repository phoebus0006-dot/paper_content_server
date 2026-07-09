const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const RAW_INDEX_FILE = path.join(DATA_DIR, 'raw_index.json');
const IMAGE_INDEX_FILE = path.join(DATA_DIR, 'image_index.json');
const PROCESSED_DIR = path.join(DATA_DIR, 'processed_images');

// IDs to remove (text/poster/logo suspects from Internet Archive)
const REMOVE_IDS = new Set([
  '13ac04f75e1681c9fe813c781841f6ee4ab54fae',  // "Twelfth Night (a3)" - theater poster with text
  '9b15f27efc2e40e0ad4a5e18db750959132e6840',   // "Portrait Studio Rental" - likely sign/logo
]);

// === Clean image_index.json ===
let imageIndex = JSON.parse(fs.readFileSync(IMAGE_INDEX_FILE, 'utf8'));
const before = imageIndex.length;
imageIndex = imageIndex.filter(e => !REMOVE_IDS.has(e.id));
const removed = before - imageIndex.length;
console.log(`image_index: ${before} -> ${imageIndex.length} (removed ${removed})`);
fs.writeFileSync(IMAGE_INDEX_FILE, JSON.stringify(imageIndex, null, 2) + '\n');

// === Clean raw_index.json (keep but mark) ===
let rawIndex = JSON.parse(fs.readFileSync(RAW_INDEX_FILE, 'utf8'));
for (const entry of rawIndex) {
  if (REMOVE_IDS.has(entry.id)) {
    entry.status = 'disabled';
    console.log(`raw_index: disabled ${entry.id} (${entry.title})`);
  }
}
fs.writeFileSync(RAW_INDEX_FILE, JSON.stringify(rawIndex, null, 2) + '\n');

// === Delete processed files ===
for (const id of REMOVE_IDS) {
  for (const ext of ['.png', '.epf']) {
    const f = path.join(PROCESSED_DIR, id + ext);
    if (fs.existsSync(f)) {
      fs.unlinkSync(f);
      console.log(`deleted ${f}`);
    }
  }
}

console.log('Cleanup done.');
