const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function run(cmd) {
  try { return execSync(cmd, { stdio: 'pipe' }).toString(); }
  catch(e) { return e.stdout ? e.stdout.toString() : ''; }
}

const errors = [];

// 1. Check generated directories
const tracked = run('git ls-files').split('\n').filter(Boolean);
for (const file of tracked) {
  if (file.match(/(^|\/)(test_data_|test_v3_|test_admin_|test_tmp_)/)) {
    errors.push(`Tracked garbage dir found: ${file}`);
  }
  if (file.match(/(^|\/)(_fix_|fix-?|patch-?|inject-?|extract-?|update-?|restore-|setup-|run-pipeline).*\.js$/)) {
    errors.push(`Tracked patch script found: ${file}`);
  }
  if (file.endsWith('deploy.tar')) {
    errors.push(`Tracked deploy.tar found: ${file}`);
  }
  if (file.match(/qa\/(runtime|artifacts|reports|tmp)/)) {
    errors.push(`Tracked QA runtime artifact found: ${file}`);
  }
  if (file.match(/\.(log|tmp)$/) || file.match(/\.corrupt\./)) {
    errors.push(`Tracked log/tmp found: ${file}`);
  }
  if (file.match(/(^|\/)(dist|coverage|playwright-report|test-results)\//)) {
    errors.push(`Tracked build output found: ${file}`);
  }
}

// 2. Check package.json local file references
const rootPkg = path.join(__dirname, '..', 'package.json');
if (fs.existsSync(rootPkg)) {
  const pkg = JSON.parse(fs.readFileSync(rootPkg, 'utf8'));
  for (const script in pkg.scripts || {}) {
    const cmd = pkg.scripts[script];
    // naive check for "node file.js"
    const m = cmd.match(/node\s+([a-zA-Z0-9_/-]+\.js)/g);
    if (m) {
      for (const match of m) {
        const file = match.split(' ')[1];
        if (!fs.existsSync(path.join(__dirname, '..', file))) {
          errors.push(`package.json references missing file: ${file}`);
        }
      }
    }
  }
}

if (errors.length > 0) {
  console.error("Hygiene check failed:");
  errors.forEach(e => console.error("- " + e));
  process.exit(1);
} else {
  console.log("Repository hygiene check passed.");
}
