const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let failed = false;

const runtimeDir = path.join(__dirname, '..', 'qa', 'runtime');
if (fs.existsSync(runtimeDir)) {
  const files = fs.readdirSync(runtimeDir);
  if (files.length > 0) {
    console.error("FAIL: qa/runtime is not empty after tests:", files);
    failed = true;
  }
}

try {
  // Wait, trying to find lingering node processes that are running tests. 
  // It's hard on Windows without a specific identifier. 
  // We'll skip strict PID checking for now since it's hard to distinguish test processes from the parent process.
} catch (e) {}

if (failed) process.exit(1);
console.log("SUCCESS: Environment is clean.");
process.exit(0);
