const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { JsonStore, ERR_NOT_FOUND, ERR_INVALID_JSON, ERR_IO } = require('../src/infra/json-store');

async function testJsonStoreRemediation() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'json-store-test-'));
  try {
    // 1. File not found -> readOrDefault returns default
    const missingFile = path.join(tmpDir, 'missing.json');
    const storeMissing = JsonStore(missingFile);
    const defVal = await storeMissing.readOrDefault(['default']);
    assert.deepStrictEqual(defVal, ['default']);

    // 2. Valid JSON -> readOrDefault returns parsed object
    const validFile = path.join(tmpDir, 'valid.json');
    fs.writeFileSync(validFile, JSON.stringify({ hello: 'world' }));
    const storeValid = JsonStore(validFile);
    const validVal = await storeValid.readOrDefault(null);
    assert.deepStrictEqual(validVal, { hello: 'world' });

    // 3. Invalid JSON -> creates .corrupt file, rejects with ERR_INVALID_JSON, original preserved
    const corruptFile = path.join(tmpDir, 'corrupt.json');
    const corruptContent = '{ invalid json content...';
    fs.writeFileSync(corruptFile, corruptContent);
    const storeCorrupt = JsonStore(corruptFile);

    let caughtErr = null;
    try {
      await storeCorrupt.readOrDefault({ fallback: true });
    } catch (err) {
      caughtErr = err;
    }
    assert.ok(caughtErr, 'Should throw on corrupt JSON');
    assert.strictEqual(caughtErr.code, ERR_INVALID_JSON);

    // Verify original file preserved
    assert.strictEqual(fs.readFileSync(corruptFile, 'utf8'), corruptContent);

    // Verify .corrupt-* file created
    const files = fs.readdirSync(tmpDir);
    const corruptBackup = files.find(f => f.startsWith('corrupt.json.corrupt-'));
    assert.ok(corruptBackup, 'Backup file .corrupt-* should be created');

    console.log('PASS: JsonStore remediation tests');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

testJsonStoreRemediation().catch(err => {
  console.error('FAIL: JsonStore remediation tests:', err);
  process.exit(1);
});
