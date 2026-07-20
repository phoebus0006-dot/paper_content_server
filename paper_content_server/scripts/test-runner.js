const { run } = require('node:test');
const { spec } = require('node:test/reporters');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const manifestPath = path.join(rootDir, 'qa', 'manifest.json');

if (!fs.existsSync(manifestPath)) {
  console.error('Missing qa/manifest.json');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const type = process.argv[2] || 'all';

let files = [];
if (type === 'all') {
  for (const t in manifest) {
    files.push(...manifest[t]);
  }
} else if (manifest[type]) {
  files = manifest[type];
}

if (files.length === 0) {
  console.error(`No tests found for type: ${type}`);
  process.exit(1);
}

files = files.map(f => path.join(rootDir, f));

let hasTests = false;
let failed = false;
let skipped = 0;
let total = 0;

const stream = run({ files, concurrency: 1 });

stream.on('test:pass', (data) => {
  if (!data.name.startsWith('file://')) {
    hasTests = true;
    total++;
  }
});

stream.on('test:fail', (data) => {
  if (!data.name.startsWith('file://')) {
    hasTests = true;
    failed = true;
    total++;
  }
});

stream.on('test:diagnostic', (data) => {
  if (data.message && data.message.includes('skipped')) {
    skipped++;
  }
});

stream.pipe(spec()).pipe(process.stdout);

stream.on('end', () => {
  if (failed) {
    console.error('Tests failed.');
    process.exit(1);
  }
  if (!hasTests || total === 0) {
    console.error('0 assertions/tests executed.');
    process.exit(1);
  }
  if (skipped > 0 && skipped === total) {
    console.error('All tests skipped.');
    process.exit(1);
  }
  process.exit(0);
});
