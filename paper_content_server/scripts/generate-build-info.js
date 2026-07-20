const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function runGit(cmd, fallback = 'unknown') {
  try {
    return execSync(cmd, { stdio: 'pipe' }).toString().trim() || fallback;
  } catch (e) {
    return fallback;
  }
}

const buildInfoPath = path.join(__dirname, '../public/admin/build-info.json');

const buildInfo = {
  commit: process.env.GIT_COMMIT || runGit('git rev-parse HEAD', 'unknown'),
  branch: process.env.GIT_BRANCH || runGit('git branch --show-current', 'unknown'),
  buildTime: process.env.BUILD_TIME || new Date().toISOString(),
  serverVersion: process.env.npm_package_version || require('../package.json').version || '1.0.0'
};

fs.writeFileSync(buildInfoPath, JSON.stringify(buildInfo, null, 2));
console.log(`Generated build info at ${buildInfoPath}`);
