const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const qaDir = path.join(rootDir, 'qa');
const runtimeDir = path.join(qaDir, 'runtime');
const dataDir = path.join(rootDir, 'data');
const isWin = process.platform === 'win32';

let failed = false;

function checkProcessRunning(pid) {
  try {
    if (isWin) {
      const out = execSync(`tasklist /FI "PID eq ${pid}" /NH`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
      return out.includes(pid.toString());
    } else {
      process.kill(pid, 0);
      return true;
    }
  } catch (e) {
    return false;
  }
}

// 1. Check pids from runtime
if (fs.existsSync(runtimeDir)) {
  const runs = fs.readdirSync(runtimeDir);
  for (const run of runs) {
    const runPath = path.join(runtimeDir, run);
    if (!fs.statSync(runPath).isDirectory()) continue;
    
    // We only allow keeping failed run data. If there is a run dir, it must be because it failed and we kept it,
    // but its processes MUST be dead.
    const pidsPath = path.join(runPath, 'pids.json');
    if (fs.existsSync(pidsPath)) {
      try {
        const pids = JSON.parse(fs.readFileSync(pidsPath, 'utf8'));
        for (const pid of pids) {
          if (checkProcessRunning(pid)) {
            console.error(`[ERROR] Residual process still alive from run ${run}: PID ${pid}`);
            failed = true;
          }
        }
      } catch (e) {}
    }
  }
}

// 2. Check root dir for stray test dirs
const rootFiles = fs.readdirSync(rootDir);
for (const file of rootFiles) {
  if (file.startsWith('test_data_') || file.startsWith('test_v3_')) {
    console.error(`[ERROR] Stray test directory in root: ${file}`);
    failed = true;
  }
}

// 3. Check formal data/ for test products
if (fs.existsSync(dataDir)) {
  const checkDataForTests = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const file of fs.readdirSync(dir)) {
      if (file.includes('test_') || file.includes('test-') || file.includes('mock')) {
        console.error(`[ERROR] Test product in formal data dir: ${path.join(dir, file)}`);
        failed = true;
      }
    }
  };
  checkDataForTests(dataDir);
  checkDataForTests(path.join(dataDir, 'raw_images'));
  checkDataForTests(path.join(dataDir, 'processed_images'));
}

if (failed) {
  process.exit(1);
} else {
  console.log('qa:verify-clean passed.');
  process.exit(0);
}
