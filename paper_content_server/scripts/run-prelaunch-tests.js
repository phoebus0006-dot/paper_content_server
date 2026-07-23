#!/usr/bin/env node
// run-prelaunch-tests.js — Cross-platform test runner for prelaunch Node.js & host C++ firmware tests (R3-07)

const path = require('path');
const { spawnSync } = require('child_process');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const WORKSPACE_ROOT = path.join(ROOT, '..');

function runNodeTest(testPath) {
  const fullPath = path.isAbsolute(testPath) ? testPath : path.join(ROOT, testPath);
  console.log('\n--- Running Node Test: ' + path.relative(ROOT, fullPath) + ' ---');
  const res = spawnSync(process.execPath, [fullPath], { stdio: 'inherit', cwd: ROOT });
  if (res.status !== 0) {
    console.error('FAILED Node Test: ' + testPath + ' (exit code: ' + res.status + ')');
    process.exit(res.status || 1);
  }
}

function findCppCompiler() {
  const compilers = ['g++', 'clang++', 'cl.exe', 'cl'];
  for (const c of compilers) {
    const check = spawnSync(c, ['--version'], { shell: true });
    if (check.status === 0 || (c.startsWith('cl') && check.stderr && check.stderr.toString().includes('Compiler'))) {
      return c;
    }
  }
  return null;
}

function runHostCppTests() {
  console.log('\n--- Building & Running Host C++ Firmware Core Tests ---');
  const compiler = findCppCompiler();
  if (!compiler) {
    console.error('ERROR: Host C++ compiler (g++, clang++, cl) not found in system PATH.');
    console.error('Host C++ tests cannot be compiled or executed on this environment.');
    process.exit(1);
  }

  const binDir = path.join(ROOT, 'qa', 'runtime');
  fs.mkdirSync(binDir, { recursive: true });
  const outBinary = path.join(binDir, 'firmware_host_test' + (process.platform === 'win32' ? '.exe' : ''));

  const cppFile = path.join(ROOT, 'test', 'firmware-host', 'firmware_host_test.cpp');
  const pendingCpp = path.join(WORKSPACE_ROOT, 'NewsPhoto_esp32wf', 'firmware_core', 'mqtt_pending_state.cpp');
  const transportCpp = path.join(WORKSPACE_ROOT, 'NewsPhoto_esp32wf', 'firmware_core', 'frame_transport_policy.cpp');

  let compileArgs = [];
  if (compiler.startsWith('cl')) {
    compileArgs = ['/EHsc', '/Fe:' + outBinary, cppFile, pendingCpp, transportCpp];
  } else {
    compileArgs = ['-O2', '-Wall', cppFile, pendingCpp, transportCpp, '-o', outBinary];
  }

  console.log('Compiling with: ' + compiler + ' ' + compileArgs.join(' '));
  const compileRes = spawnSync(compiler, compileArgs, { stdio: 'inherit', cwd: ROOT, shell: true });
  if (compileRes.status !== 0) {
    console.error('Host C++ Compilation FAILED (exit code: ' + compileRes.status + ')');
    process.exit(compileRes.status || 1);
  }

  console.log('Executing C++ Host Test: ' + outBinary);
  const execRes = spawnSync(outBinary, [], { stdio: 'inherit', cwd: ROOT });
  try { fs.unlinkSync(outBinary); } catch(e) {}

  if (execRes.status !== 0) {
    console.error('Host C++ Test Execution FAILED (exit code: ' + execRes.status + ')');
    process.exit(execRes.status || 1);
  }
}

console.log('=== Prelaunch Test Runner Starting ===');

// 1. Run Node prelaunch tests
runNodeTest('test/r12/mqtt-frame-sha256-test.js');
runNodeTest('test/prelaunch/epf1-validator-safety-test.js');
runNodeTest('test/prelaunch/composition-parity-test.js');

// 2. Run Host C++ tests
runHostCppTests();

console.log('\n=== ALL PRELAUNCH TESTS PASSED SUCCESSFULLY ===');
