const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('SafeImagePath', () => {
  let sip;
  let tmpDir;
  let safePng;

  before(() => {
    const { SafeImagePath } = require('../../../src/files/safe-image-path');
    // Use a temp test root
    tmpDir = fs.mkdtempSync(path.join(__dirname, 'tmp-test-'));
    fs.writeFileSync(path.join(tmpDir, 'test.png'), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    safePng = path.join(tmpDir, 'test.png');
    sip = new SafeImagePath({ rootDir: tmpDir });
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should validate a safe file within root', () => {
    assert.ok(sip.isSafe(safePng));
  });

  it('should resolve safe path', () => {
    const resolved = sip.resolve(safePng);
    assert.equal(resolved, fs.realpathSync(safePng));
  });

  it('should reject empty path', () => {
    assert.equal(sip.isSafe(''), false);
    assert.equal(sip.isSafe(null), false);
    assert.equal(sip.isSafe(undefined), false);
  });

  it('should reject path traversal with ..', () => {
    const badPath = path.join(tmpDir, '..', '..', 'etc', 'passwd');
    assert.equal(sip.isSafe(badPath), false);
  });

  it('should reject non-existent file', () => {
    assert.equal(sip.isSafe(path.join(tmpDir, 'nonexistent.png')), false);
  });

  it('should reject directory path', () => {
    assert.equal(sip.isSafe(tmpDir), false);
  });

  it('should reject non-image extension', () => {
    fs.writeFileSync(path.join(tmpDir, 'test.txt'), 'hello');
    assert.equal(sip.isSafe(path.join(tmpDir, 'test.txt')), false);
  });

  it('should resolve throws on unsafe path', () => {
    assert.throws(() => sip.resolve('/etc/passwd'), /Unsafe/);
  });
});
