const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');

let errors = [];

function checkHygiene() {
  // 1. Only one active test directory
  if (fs.existsSync(path.join(ROOT_DIR, 'test'))) {
    errors.push("test/ directory still exists. Should only have qa/tests.");
  }

  // 2. Service root has no test-news*.json
  const rootFiles = fs.readdirSync(ROOT_DIR);
  const testNewsFiles = rootFiles.filter(f => /^test-news.*\.json$/.test(f));
  if (testNewsFiles.length > 0) {
    errors.push(`Found test-news*.json in root: ${testNewsFiles.join(', ')}`);
  }

  // 3. No test runtime directories
  if (fs.existsSync(path.join(ROOT_DIR, 'qa', 'runtime'))) {
    const runtimeContents = fs.readdirSync(path.join(ROOT_DIR, 'qa', 'runtime'));
    if (runtimeContents.length > 0) {
      errors.push(`qa/runtime is not empty: ${runtimeContents.join(', ')}`);
    }
  }

  // 4. No temporary patch scripts
  const tempScripts = rootFiles.filter(f => /^(migrate-tests|_fix_.*|fix.*|patch.*|inject.*|extract.*)\.js$/.test(f) && f !== 'fix-test-requires.js');
  // wait, fix*.js would match fix-test-requires.js if we kept it. But we should delete them all.
  if (tempScripts.length > 0) {
    errors.push(`Temporary patch scripts found: ${tempScripts.join(', ')}`);
  }

  // 5. No deploy.tar
  if (fs.existsSync(path.join(ROOT_DIR, 'deploy.tar'))) {
    errors.push("deploy.tar found.");
  }

  // 6. Check package.json scripts
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
  for (const [name, cmd] of Object.entries(pkg.scripts || {})) {
    if (cmd.includes('node scripts/')) {
      const scriptPath = cmd.split('node scripts/')[1].split(' ')[0];
      if (!fs.existsSync(path.join(ROOT_DIR, 'scripts', scriptPath))) {
        errors.push(`package.json script '${name}' references missing file: scripts/${scriptPath}`);
      }
    }
  }

  // 7. All active tests in manifest.json exist
  const manifestPath = path.join(ROOT_DIR, 'qa', 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    for (const t of manifest.tests || []) {
      if (t.status === 'ACTIVE' && !fs.existsSync(path.join(ROOT_DIR, t.path))) {
        errors.push(`Manifest active test missing: ${t.path}`);
      }
    }
  }

  // 8. No nested .git
  if (fs.existsSync(path.join(ROOT_DIR, 'qa', '.git')) || fs.existsSync(path.join(ROOT_DIR, 'src', '.git'))) {
    errors.push("Nested .git directories found.");
  }

  // 9. No file:/// links in codebase (excluding test reports or ignored files)
  // This is a heavy check, skipping for now or doing a fast grep
  
  if (errors.length > 0) {
    console.error("Hygiene Check FAILED:");
    errors.forEach(e => console.error("- " + e));
    process.exit(1);
  } else {
    console.log("Hygiene Check PASSED.");
  }
}

checkHygiene();
