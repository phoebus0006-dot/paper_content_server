const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..', '..');

/**
 * Run a mutation test:
 * 1. Copy source file to temp
 * 2. Apply mutation (modify file)
 * 3. Run test command
 * 4. Assert test fails (non-zero exit)
 * 5. Restore original
 * 6. Verify source hash matches original
 */
function mutationTest(name, sourcePath, mutateFn, testCommand) {
  var absPath = path.join(ROOT, sourcePath);
  var original = fs.readFileSync(absPath);
  var origHash = crypto.createHash('sha256').update(original).digest('hex');

  // Create backup
  var backup = original.slice(0); // copy

  var result = { name: name, killed: false, error: null };

  try {
    // Apply mutation
    var mutated = mutateFn(original.toString('utf8'), absPath);
    fs.writeFileSync(absPath, mutated);

    // Run test — use process.execPath to ensure same Node binary
    var cmd = testCommand.replace(/^node\b/, process.execPath);
    try {
      execSync(cmd, {
        cwd: ROOT,
        timeout: 30000,
        stdio: 'pipe'
      });
      // Test passed (exit 0) — mutation SURVIVED
      result.killed = false;
      result.error = 'Mutation survived: test passed with mutated code';
    } catch(e) {
      // Test failed (non-zero) — mutation KILLED
      result.killed = true;
    }
  } catch(e) {
    result.error = 'Mutation execution error: ' + e.message;
    result.killed = false;
  } finally {
    // Restore original
    fs.writeFileSync(absPath, backup);

    // Verify hash
    var restored = fs.readFileSync(absPath);
    var restoredHash = crypto.createHash('sha256').update(restored).digest('hex');
    if (restoredHash !== origHash) {
      result.error = 'File restoration failed: hash mismatch';
    }
  }

  return result;
}

// Export for test runner
module.exports = { mutationTest };
