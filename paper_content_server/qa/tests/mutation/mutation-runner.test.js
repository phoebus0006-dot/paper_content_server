const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { mutationTest } = require('./run-mutation-test');

var results = [];

// After all tests, check no survivors
after(function() {
  var survived = results.filter(function(r) { return !r.killed; });
  if (survived.length > 0) {
    console.error('SURVIVED MUTATIONS:', JSON.stringify(survived, null, 2));
  }
  assert.equal(survived.length, 0, survived.length + ' mutation(s) survived');
});

describe('EPF1 frame mutation tests', function() {
  it('KILL: change HEADER_BYTES from 10 to 16 (frame 192010→192016)', function() {
    var r = mutationTest(
      'EPF1 HEADER_BYTES 10→16',
      'src/epaper/epf1.js',
      function(code) {
        return code.replace('HEADER_BYTES: 10', 'HEADER_BYTES: 16');
      },
      'node --test qa/tests/contract/epf1-frame-test.js'
    );
    results.push(r);
    assert.ok(r.killed, 'Mutation should be killed: ' + (r.error || ''));
  });

  it('KILL: remove EPF1 magic validation', function() {
    var r = mutationTest(
      'Remove EPF1 magic check',
      'src/epaper/epf1.js',
      function(code) {
        // Remove the magic check in EPF1_CONSTANTS
        return code.replace(/MAGIC.*EPF1.*/g, '// REMOVED: magic check');
      },
      'node --test qa/tests/contract/epf1-frame-test.js'
    );
    results.push(r);
    assert.ok(r.killed, 'Mutation should be killed: ' + (r.error || ''));
  });

  it('KILL: history failure returns committed=true', function() {
    var r = mutationTest(
      'History failure → committed=true',
      'src/publication/publication-service.js',
      function(code) {
        // Change the error handling so history.append is skipped
        return code.replace(
          /history\.append/,
          '// MUTATED: history.append skipped\nPromise.resolve()'
        );
      },
      'node --test qa/tests/contract/publication-transaction-test.js'
    );
    results.push(r);
    assert.ok(r.killed, 'Mutation should be killed: ' + (r.error || ''));
  });

  it('KILL: one-shot boundary returns current time', function() {
    var r = mutationTest(
      'One-shot boundary = current time',
      'server.js',
      function(code) {
        // Replace the boundary logic to return current time
        return code.replace(
          /function computeNextSwitchAt/,
          'function computeNextSwitchAt(now) { return now; }\n// MUTATED: original removed\nfunction _original_computeNextSwitchAt'
        );
      },
      'node --test qa/tests/contract/one-shot-boundary-test.js'
    );
    results.push(r);
    assert.ok(r.killed, 'Mutation should be killed: ' + (r.error || ''));
  });

  it('KILL: 19:00 after continues half-hour cycles (not next-day 10:30)', function() {
    var r = mutationTest(
      '19:00 after → half-hour (not next-day 10:30)',
      'server.js',
      function(code) {
        // Remove the t.hour >= 19 → next-day 10:30 rule
        return code.replace(
          /} else if \(t\.hour >= 19\) \{[\s\S]*?minute = 30;/,
          '} else if (t.hour >= 19) { hour = t.hour; minute = 0; // MUTATED: no next-day rule'
        );
      },
      'node --test qa/tests/contract/one-shot-boundary-test.js'
    );
    results.push(r);
    assert.ok(r.killed, 'Mutation should be killed: ' + (r.error || ''));
  });
});

describe('Approval adapter mutation tests', function() {
  it('KILL: pending image allowed', function() {
    var r = mutationTest(
      'Pending image publishable',
      'src/images/image-approval-adapter.js',
      function(code) {
        return code.replace(
          /function isPublishable/,
          'function isPublishable(entry) { return true; }\n// MUTATED: original\nfunction _original_isPublishable'
        );
      },
      'node --test qa/tests/integration/publish-workflows-test.js'
    );
    results.push(r);
    assert.ok(r.killed, 'Mutation should be killed: ' + (r.error || ''));
  });

  it('KILL: frame.bin returns wrong size (192016 instead of 192010)', function() {
    var r = mutationTest(
      'Frame.bin size wrong',
      'server.js',
      function(code) {
        // Change the first frame.bin test buffer allocation from 192010 to 192016
        return code.replace(
          'Buffer.alloc(192010, 0xAA)',
          'Buffer.alloc(192016, 0xAA) // MUTATED: wrong size'
        );
      },
      'node --test qa/tests/e2e/real-http-e2e-test.js'
    );
    results.push(r);
    assert.ok(r.killed, 'Mutation should be killed: ' + (r.error || ''));
  });
});
