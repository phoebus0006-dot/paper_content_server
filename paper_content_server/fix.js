const fs = require('fs');
let code = fs.readFileSync('scripts/fetch-images.js', 'utf8');

// 1. Rename main to runFetchImages and add arguments
code = code.replace(/async function main\(\) \{/, 'async function runFetchImages(configOverride, indexOverride, limit = 0) {\n  let config = configOverride || loadJson(PHOTO_SOURCES_FILE, { sources: [] });\n  let index = indexOverride || await readJson(RAW_INDEX_FILE, []);\n  if (!Array.isArray(index)) index = [];\n');

// 2. Remove old config/args reading from inside runFetchImages
code = code.replace(
  /const config = loadJson\(PHOTO_SOURCES_FILE, \{ sources: \[\] \}\);\s*let index = await readJson\(RAW_INDEX_FILE, \[\]\);\s*if \(\!Array\.isArray\(index\)\) index = \[\];\s*const args = parseArgs\(process\.argv\);\s*\/\/ Always scan images\/ directory as built-in local source\s*\/\/ Supports: images\/shots\/<theme>\/, images\/storyboard\/<theme>\/, images\/<theme>\/\s*if \(\!args\.source \|\| args\.source === 'local_import'\) \{\s*config\.sources\.push\(\{\s*type: 'local_import',\s*enabled: true,\s*importDir: IMAGES_DIR,\s*\}\);\s*\}\s*if \(args\.source\) \{\s*config\.sources = config\.sources\.filter\(\(s\) => s\.type === args\.source\);\s*\}/,
  ''
);

// 3. Fix limited logic
code = code.replace(
  /const limited = args\.limit > 0 \? candidates\.slice\(0, args\.limit\) : candidates;/,
  'const limited = limit > 0 ? candidates.slice(0, limit) : candidates;'
);

// 4. Fix writeJson to only write if not in test
code = code.replace(
  /await writeJson\(RAW_INDEX_FILE, index\);/g,
  'if (!indexOverride) await writeJson(RAW_INDEX_FILE, index);'
);

// 5. Return from runFetchImages
code = code.replace(
  /console\.log\(\`fetch done: \$\{results\.downloaded\}/,
  'return { results, index };\n  console.log(`fetch done: ${results.downloaded}'
);

// 6. Append real main
const newMain = `
async function main() {
  await ensureDir(DATA_DIR);
  await ensureDir(RAW_IMAGES_DIR);
  await ensureDir(IMPORT_IMAGES_DIR);
  await ensureDir(IMAGES_DIR);
  
  const config = loadJson(PHOTO_SOURCES_FILE, { sources: [] });
  const args = parseArgs(process.argv);
  
  if (!args.source || args.source === 'local_import') {
    config.sources.push({ type: 'local_import', enabled: true, importDir: IMAGES_DIR });
  }
  if (args.source) {
    config.sources = config.sources.filter(s => s.type === args.source);
  }
  
  const { results } = await runFetchImages(config, null, args.limit);
  console.log(\`fetch done: \${results.downloaded} downloaded, \${results.skipped} skipped, \${results.failed} failed\`);
}
`;

// Replace the old main at the bottom or just append it before the module.exports
code = code.replace(/if \(require\.main === module\)/, newMain + '\nif (require.main === module)');

// 7. Update module.exports
code = code.replace(
  /module\.exports = \{[\s\S]*?\};/,
  'module.exports = { main, gatherCandidates, addCandidate, runFetchImages };'
);

fs.writeFileSync('scripts/fetch-images.js', code);
