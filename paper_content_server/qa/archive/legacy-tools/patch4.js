const fs = require('fs');
const path = require('path');

async function main() {
  const rootDir = __dirname;
  
  // 1. package.json check script
  let pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  pkg.scripts.check = "node scripts/check-all.js";
  fs.writeFileSync(path.join(rootDir, 'package.json'), JSON.stringify(pkg, null, 2));

  // 2. deploy_staging.sh
  const deployPath = path.join(rootDir, 'deploy_staging.sh');
  if (fs.existsSync(deployPath)) {
    let deploy = fs.readFileSync(deployPath, 'utf8');
    if (!deploy.includes('set -euo pipefail')) {
      deploy = deploy.replace('#!/bin/bash', '#!/bin/bash\nset -euo pipefail\n');
    }
    fs.writeFileSync(deployPath, deploy, 'utf8');
  }

  // 3. container-selftest.js main wrapper
  const testPath = path.join(rootDir, 'scripts/container-selftest.js');
  if (fs.existsSync(testPath)) {
    let content = fs.readFileSync(testPath, 'utf8');
    // Change to real async main if it isn't
    if (!content.includes('async function main()')) {
      content = content.replace(/function selftest\(\)\s*\{/, 'async function main() {')
                       .replace(/selftest\(\);/g, 'main().catch(console.error);');
      // If it exists, fix it. But simpler to just leave it if it works, or do a string replace.
    }
    fs.writeFileSync(testPath, content, 'utf8');
  }

  console.log('patch4 done');
}

main().catch(console.error);
