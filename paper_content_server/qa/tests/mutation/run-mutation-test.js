const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..', '..');

/**
 * Run a mutation test:
 * 1. Apply EXACTLY one precise change to source code
 * 2. node --check on mutated file must PASS (no syntax errors)
 * 3. Run the TARGET test that should detect the mutation
 * 4. Only count as KILLED if test fails due to AssertionError (contract failure)
 * 5. Restore original file and verify SHA
 */
function replaceExactlyOnce(text, search, replacement) {
  var count;
  if (search instanceof RegExp) {
    var flags = 'g';
    if (search.ignoreCase) flags += 'i';
    if (search.multiline) flags += 'm';
    if (search.dotAll) flags += 's';
    if (search.unicode) flags += 'u';
    if (search.sticky) flags += 'y';
    var globalRegex = new RegExp(search.source, flags);
    var matches = text.match(globalRegex);
    count = matches ? matches.length : 0;
  } else {
    count = text.split(search).length - 1;
  }
  if (count === 0) {
    throw new Error('Mutation NOT_APPLIED: pattern not found in source');
  }
  if (count > 1) {
    throw new Error('Mutation AMBIGUOUS: pattern found ' + count + ' times (expected exactly 1)');
  }
  return text.replace(search, replacement);
}

function mutationTest(name, sourcePath, mutateFn, testCommand) {
  var absPath = path.join(ROOT, sourcePath);
  var original = fs.readFileSync(absPath);
  var origHash = crypto.createHash('sha256').update(original).digest('hex');

  var tempPath = absPath + '.mutation_tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6) + '.js';

  var result = {
    name: name,
    killed: false,
    sourceShaBefore: origHash,
    sourceShaMutated: null,
    sourceShaRestored: origHash,
    mutationsApplied: 0,
    nodeCheckExitCode: null,
    targetTestExitCode: null,
    failureAssertionName: null,
    error: null
  };

  try {
    // Apply mutation
    var originalStr = original.toString('utf8');
    var mutated = mutateFn(originalStr, absPath);
    result.mutationsApplied = 1;

    // Write to isolated temp file first, then swap safely
    fs.writeFileSync(tempPath, mutated);
    var mutatedContent = fs.readFileSync(tempPath);
    result.sourceShaMutated = crypto.createHash('sha256').update(mutatedContent).digest('hex');

    // Check syntax on isolated temp file
    try {
      execSync('node --check "' + tempPath + '"', {
        timeout: 10000,
        stdio: 'pipe'
      });
      result.nodeCheckExitCode = 0;
    } catch(e) {
      result.nodeCheckExitCode = e.status || 1;
      result.error = 'Syntax error after mutation (node --check failed with exit ' + result.nodeCheckExitCode + ')';
      result.killed = false; // Invalid mutation
      return result;
    }

    // Temporarily swap file to run target test
    fs.writeFileSync(absPath, mutated);

    // Run target test in a clean environment
    var cleanEnv = Object.assign({}, process.env);
    delete cleanEnv.NODE_TEST_CONTEXT;
    delete cleanEnv.NODE_CHANNEL;
    delete cleanEnv.NODE_V8_COVERAGE;

    try {
      execSync(testCommand, {
        cwd: ROOT,
        timeout: 30000,
        stdio: 'pipe',
        env: cleanEnv
      });
      // Test passed (exit 0) — mutation SURVIVED
      result.targetTestExitCode = 0;
      result.killed = false;
      result.error = 'Mutation survived: test passed with exit 0';
    } catch(e) {
      // Test failed
      result.targetTestExitCode = e.status || 1;
      var stderr = (e.stderr || '').toString();
      var stdout = (e.stdout || '').toString();
      var output = stdout + '\n' + stderr;

      // Check if failure was due to assertion (not crash/syntax/typeerror)
      if (output.indexOf('AssertionError') >= 0 || output.indexOf('ERR_ASSERTION') >= 0) {
        result.killed = true;
        // Extract assertion name
        var match = output.match(/(?:not ok \d+ - |failureType|name:\s*')([^']+)/);
        result.failureAssertionName = match ? match[1] : 'AssertionError (contract)';
      } else if (output.indexOf('TypeError') >= 0) {
        result.error = 'Mutation caused TypeError, not contract failure';
        result.killed = false;
      } else if (output.indexOf('SyntaxError') >= 0) {
        result.error = 'Mutation caused SyntaxError at runtime';
        result.killed = false;
      } else if (output.indexOf('ENOENT') >= 0 || output.indexOf('MODULE_NOT_FOUND') >= 0) {
        result.error = 'Mutation caused module load failure';
        result.killed = false;
      } else {
        result.error = 'Test failure type unclear (not AssertionError). Output: ' + output.substring(0, 200);
        result.killed = false;
      }
    }
  } catch(e) {
    result.error = 'Mutation execution error: ' + e.message;
    result.killed = false;
  } finally {
    // 100% Guarantee: Restore original source file
    fs.writeFileSync(absPath, original);
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch(e) {}
    }
    var restored = fs.readFileSync(absPath);
    result.sourceShaRestored = crypto.createHash('sha256').update(restored).digest('hex');

    if (result.sourceShaRestored !== result.sourceShaBefore) {
      result.error = (result.error || '') + ' FILE RESTORE FAILED: hash mismatch';
    }
  }

  return result;
}

// Export for test runner
module.exports = { mutationTest, replaceExactlyOnce };
