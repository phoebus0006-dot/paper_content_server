const test = require('node:test');
const assert = require('assert');
const { spawnSync } = require('child_process');

test('integration: 测试临时目录清理 (Test temp dir cleanup)', () => {
  // Mocking the creation and cleanup of a runtime dir
  const fs = require('fs');
  const path = require('path');
  const tempDir = path.join(__dirname, '..', '..', 'runtime', 'test-run-1234');
  fs.mkdirSync(tempDir, { recursive: true });
  assert.ok(fs.existsSync(tempDir));
  
  // Cleanup
  fs.rmSync(tempDir, { recursive: true, force: true });
  assert.strictEqual(fs.existsSync(tempDir), false);
});

test('integration: 测试子进程清理 (Test child process cleanup)', () => {
  // Test that if we spawn a child and then kill it, it actually dies
  const { spawn } = require('child_process');
  const child = spawn(process.execPath, ['-e', 'setTimeout(()=>{}, 10000)']);
  
  assert.ok(child.pid);
  child.kill('SIGTERM');
  
  return new Promise((resolve) => {
    child.on('exit', (code, signal) => {
      assert.strictEqual(signal, 'SIGTERM');
      resolve();
    });
  });
});
