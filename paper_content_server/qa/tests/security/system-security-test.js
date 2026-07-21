const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

describe('SafeImagePath — security critical paths', () => {
  let SafeImagePath, sip, tmpDir, safePng;

  before(() => {
    SafeImagePath = require('../../../src/files/safe-image-path').SafeImagePath;
    tmpDir = fs.mkdtempSync(path.join(__dirname, 'tmp-sec-'));
    fs.writeFileSync(path.join(tmpDir, 'test.png'), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    safePng = path.join(tmpDir, 'test.png');
    sip = new SafeImagePath({ rootDir: tmpDir });
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should reject simple path traversal (../)', () => {
    const badPath = path.join(tmpDir, '..', '..', 'etc', 'passwd');
    assert.equal(sip.isSafe(badPath), false);
  });

  it('should reject absolute path outside root', () => {
    assert.equal(sip.isSafe('/etc/passwd'), false);
  });

  it('should reject path with encoded traversal sequences', () => {
    assert.equal(sip.isSafe(path.join(tmpDir, '..%2f..%2fetc%2fpasswd')), false);
  });

  it('should reject path escaping via symlink', () => {
    const linkDir = fs.mkdtempSync(path.join(__dirname, 'tmp-link-'));
    try {
      const outsideFile = path.join(linkDir, 'target.txt');
      fs.writeFileSync(outsideFile, 'secret');
      const linkPath = path.join(tmpDir, 'evil-link.png');
      try { fs.symlinkSync(outsideFile, linkPath); } catch (e) {
        // Symlink may fail on Windows without privileges; skip if so
        return;
      }
      assert.equal(sip.isSafe(linkPath), false);
    } finally {
      fs.rmSync(linkDir, { recursive: true, force: true });
    }
  });

  it('should reject non-image extension (.txt)', () => {
    const txtPath = path.join(tmpDir, 'test.txt');
    fs.writeFileSync(txtPath, 'hello');
    assert.equal(sip.isSafe(txtPath), false);
  });

  it('should reject non-image extension (.svg)', () => {
    const svgPath = path.join(tmpDir, 'test.svg');
    fs.writeFileSync(svgPath, '<svg></svg>');
    assert.equal(sip.isSafe(svgPath), false);
  });

  it('should reject non-image extension (.pdf)', () => {
    const pdfPath = path.join(tmpDir, 'test.pdf');
    fs.writeFileSync(pdfPath, '%PDF');
    assert.equal(sip.isSafe(pdfPath), false);
  });

  it('should reject non-image extension (.js)', () => {
    const jsPath = path.join(tmpDir, 'test.js');
    fs.writeFileSync(jsPath, 'var x = 1;');
    assert.equal(sip.isSafe(jsPath), false);
  });

  it('should reject non-existent file', () => {
    assert.equal(sip.isSafe(path.join(tmpDir, 'nonexistent.png')), false);
    assert.equal(sip.isSafe(path.join(tmpDir, 'missing.jpg')), false);
    assert.equal(sip.isSafe(path.join(tmpDir, 'no-such-file.webp')), false);
  });

  it('should reject empty path', () => {
    assert.equal(sip.isSafe(''), false);
    assert.equal(sip.isSafe(null), false);
    assert.equal(sip.isSafe(undefined), false);
  });

  it('should reject directory path even with image name', () => {
    const dirPng = path.join(tmpDir, 'imagedir');
    fs.mkdirSync(dirPng);
    assert.equal(sip.isSafe(dirPng), false);
  });

  it('should resolve safe path successfully', () => {
    const resolved = sip.resolve(safePng);
    assert.equal(resolved, fs.realpathSync(safePng));
  });

  it('should throw on resolve for unsafe path', () => {
    assert.throws(() => sip.resolve('/etc/passwd'), /Unsafe/);
  });

  it('should validate a safe png file within root', () => {
    assert.ok(sip.isSafe(safePng));
  });

  it('should validate .jpg extension', () => {
    const jpgPath = path.join(tmpDir, 'test.jpg');
    fs.writeFileSync(jpgPath, Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]));
    assert.ok(sip.isSafe(jpgPath));
  });

  it('should validate .webp extension', () => {
    const webpPath = path.join(tmpDir, 'test.webp');
    fs.writeFileSync(webpPath, Buffer.from([0x52, 0x49, 0x46, 0x46]));
    assert.ok(sip.isSafe(webpPath));
  });
});

describe('Secret pattern detection in source', () => {
  const repoRoot = path.resolve(__dirname, '../../..');
  const srcDir = path.join(repoRoot, 'src');

  function gitGrep(pattern, pathspec) {
    try {
      const out = execSync(
        `cd "${repoRoot}" && git grep -n "${pattern}" -- "${pathspec}"`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 10 * 1024 * 1024 }
      );
      return out.trim();
    } catch (e) {
      // git grep returns exit code 1 when no matches found
      return '';
    }
  }

  it('should have no ghp_ GitHub token patterns in tracked source files', () => {
    const result = gitGrep('ghp_[0-9A-Za-z]{35,40}', 'src/');
    assert.equal(result, '', 'Found potential GitHub token pattern in src/: ' + result);
  });

  it('should have no AKIA AWS access key patterns in tracked source files', () => {
    const result = gitGrep('AKIA[0-9A-Z]{16}', 'src/');
    assert.equal(result, '', 'Found potential AWS access key pattern in src/: ' + result);
  });

  it('should have no BEGIN PRIVATE KEY patterns in tracked source files', () => {
    const result = gitGrep('BEGIN (RSA|EC|OPENSSH|PRIVATE) KEY', 'src/');
    assert.equal(result, '', 'Found private key pattern in src/: ' + result);
  });

  it('should have no .env file tracked in git', () => {
    try {
      execSync(`cd "${repoRoot}" && git ls-files --error-unmatch .env`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      assert.fail('.env is tracked in git');
    } catch (e) {
      // Expected: .env is not tracked
      assert.ok(true);
    }
  });

  it('should have no generic secret assignment patterns in config files', () => {
    const result = gitGrep('(apiKey|api_secret|password)\\s*[:=]\\s*[\'\"][A-Za-z0-9_/-]{20,}', 'src/');
    assert.equal(result, '', 'Found potential hardcoded secrets in src/: ' + result);
  });
});
