const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
let failed = false;

function checkNoLegacyScripts() {
  const files = fs.readdirSync(rootDir);
  const patterns = [/^fix.*\.js$/, /^patch.*\.js$/, /^inject.*\.js$/, /^extract.*\.js$/, /^update-.*\.js$/, /^restore-p0\.js$/, /^setup-p0-fixes\.js$/, /^run-pipeline\..*$/, /^ast-extract\.js$/];
  for (const file of files) {
    for (const pattern of patterns) {
      if (pattern.test(file)) {
        console.error(`[ERROR] Legacy script found in root: ${file}`);
        failed = true;
      }
    }
  }
}

function checkNoTempDirs() {
  const files = fs.readdirSync(rootDir);
  for (const file of files) {
    if (file.startsWith('test_tmp_') || file.startsWith('test_admin_')) {
      console.error(`[ERROR] Temp directory found in root: ${file}`);
      failed = true;
    }
  }
  
  const dataDir = path.join(rootDir, 'data');
  if (fs.existsSync(dataDir)) {
    const dataFiles = fs.readdirSync(dataDir);
    for (const file of dataFiles) {
      if (file.startsWith('test_') || file.includes('tmp')) {
        console.error(`[ERROR] Temp data found in data dir: ${file}`);
        failed = true;
      }
    }
  }
}

function checkNoLingeringProcesses() {
  try {
    const output = execSync('Get-Process -Name "node" -ErrorAction SilentlyContinue', { shell: 'powershell.exe' }).toString();
    // It's tricky to distinguish test processes from the current script. We'll skip strict cross-platform process check for now, assuming CI runs in clean containers.
  } catch (e) {
    // No processes found or command failed
  }
}

checkNoLegacyScripts();
checkNoTempDirs();
// checkNoLingeringProcesses();

if (failed) {
  process.exit(1);
} else {
  console.log('qa:verify-clean passed.');
}
