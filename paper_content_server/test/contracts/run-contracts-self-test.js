'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { classifyStatus, captureHashes, computePollution, runContract } = require('./run-contracts');

describe('classifyStatus', function () {
  it('CRASHED when code !== 0 and no FAIL lines', function () {
    var r = classifyStatus({ code: 1, out: '', pollution: [] });
    assert.equal(r.status, 'CRASHED');
    assert.equal(r.failDelta, 1);
  });

  it('PASS when code === 0 and no FAIL, PARTIAL, NOT_IMPLEMENTED', function () {
    var r = classifyStatus({ code: 0, out: 'PASS', pollution: [] });
    assert.equal(r.status, 'PASS');
    assert.equal(r.failDelta, 0);
  });

  it('FAIL when output contains FAIL lines', function () {
    var r = classifyStatus({ code: 0, out: 'FAIL', pollution: [] });
    assert.equal(r.status, 'FAIL');
    assert.equal(r.failDelta, 1);
  });

  it('NOT_IMPLEMENTED when STATUS NOT_IMPLEMENTED appears', function () {
    var r = classifyStatus({ code: 0, out: 'STATUS NOT_IMPLEMENTED', pollution: [] });
    assert.equal(r.not_impl, 1);
    assert.equal(r.failDelta, 0);
  });

  it('PARTIAL when STATUS PARTIAL appears', function () {
    var r = classifyStatus({ code: 0, out: 'STATUS PARTIAL', pollution: [] });
    assert.equal(r.partial, 1);
    assert.equal(r.failDelta, 0);
  });
});

describe('captureHashes', function () {
  it('returns object with string values or null', function () {
    var hashes = captureHashes();
    assert.equal(typeof hashes, 'object');
    assert.equal(Array.isArray(hashes), false);
    for (var key of Object.keys(hashes)) {
      var val = hashes[key];
      assert.ok(val === null || typeof val === 'string');
    }
  });
});

describe('computePollution', function () {
  it('returns empty array when no changes between sequential calls', function () {
    var before = captureHashes();
    var after = captureHashes();
    var changed = computePollution(before, after);
    assert.ok(Array.isArray(changed));
    assert.equal(changed.length, 0);
  });

  it('detects pollution between different hashes', function() {
    var pollution = computePollution({a: 'x', b: 'y'}, {a: 'x', b: 'z'});
    assert.deepEqual(pollution, ['b']);
  });
});

describe('runContract', function () {
  it('silent nonzero exit counted as CRASHED via real child', async function() {
    var tmpFile = path.join(os.tmpdir(), 'stub-crash-' + Date.now() + '.js');
    fs.writeFileSync(tmpFile, 'process.exit(1);\n');
    try {
      var result = await runContract(tmpFile);
      assert.equal(result.fail, 1, 'fail count includes CRASHED');
    } finally {
      try { fs.unlinkSync(tmpFile); } catch(e) {}
    }
  });
});
