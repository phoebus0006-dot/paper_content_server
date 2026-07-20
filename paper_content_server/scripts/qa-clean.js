const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const qaDir = path.join(rootDir, 'qa');
const runtimeDir = path.join(qaDir, 'runtime');
const isWin = process.platform === 'win32';

function killTree(pid) {
  try {
    if (isWin) {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGKILL'); // A proper tree kill on posix is harder, but this is a start
    }
  } catch (e) {}
}

let totalDeleted = 0;

if (fs.existsSync(runtimeDir)) {
  const runs = fs.readdirSync(runtimeDir);
  for (const run of runs) {
    const runPath = path.join(runtimeDir, run);
    if (!fs.statSync(runPath).isDirectory()) continue;
    
    // Check pids.json
    const pidsPath = path.join(runPath, 'pids.json');
    if (fs.existsSync(pidsPath)) {
      try {
        const pids = JSON.parse(fs.readFileSync(pidsPath, 'utf8'));
        for (const pid of pids) {
          killTree(pid);
        }
      } catch (e) {}
    }
  }
  
  // Now delete runtime
  try {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
    totalDeleted++;
  } catch (e) {}
}

// Clean stray root test_data_*
const rootFiles = fs.readdirSync(rootDir);
for (const file of rootFiles) {
  if (file.startsWith('test_data_') || file.startsWith('test_v3_')) {
    const fPath = path.join(rootDir, file);
    fs.rmSync(fPath, { recursive: true, force: true });
    totalDeleted++;
  }
}

// Recreate runtime
fs.mkdirSync(runtimeDir, { recursive: true });

console.log(`qa:clean finished. Deleted runtimes and strays.`);
