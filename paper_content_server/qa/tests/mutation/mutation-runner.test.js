const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const mutate = require('./run-mutation-test');
const { mutationTest } = mutate;

var results = [];

function logResult(r) {
  console.log(JSON.stringify({
    name: r.name,
    killed: r.killed,
    sourceShaBefore: r.sourceShaBefore,
    sourceShaMutated: r.sourceShaMutated,
    sourceShaRestored: r.sourceShaRestored,
    mutationsApplied: r.mutationsApplied,
    nodeCheckExitCode: r.nodeCheckExitCode,
    targetTestExitCode: r.targetTestExitCode,
    failureAssertionName: r.failureAssertionName,
    error: r.error
  }, null, 2));
}

// After all tests, check no survivors
after(function() {
  var survived = results.filter(function(r) { return !r.killed; });
  console.error('=== ALL MUTATION RESULTS ===');
  results.forEach(function(r) {
    console.error('---');
    logResult(r);
  });
  if (survived.length > 0) {
    console.error('=== SURVIVED MUTATIONS ===');
    survived.forEach(function(r) {
      console.error('---');
      logResult(r);
    });
  }
  assert.equal(survived.length, 0, survived.length + ' mutation(s) survived');
});

describe('EPF1 frame mutation tests', function() {
  it('KILL: change HEADER_BYTES from 10 to 16 (frame 192010→192016)', function() {
    var r = mutationTest(
      'EPF1 HEADER_BYTES 10→16',
      'src/epaper/epf1.js',
      function(code) {
        return mutate.replaceExactlyOnce(code, 'HEADER_BYTES: 10', 'HEADER_BYTES: 16');
      },
      'node --test qa/tests/contract/epf1-frame-test.js'
    );
    logResult(r);
    results.push(r);
    assert.ok(r.killed, 'Mutation should be killed: ' + (r.error || ''));
  });

  it('KILL: remove EPF1 magic validation', function() {
    var r = mutationTest(
      'Remove EPF1 magic check',
      'src/epaper/epf1.js',
      function(code) {
        return mutate.replaceExactlyOnce(code, "MAGIC: 'EPF1'", "MAGIC: 'EPF2'");
      },
      'node --test qa/tests/contract/epf1-frame-test.js'
    );
    logResult(r);
    results.push(r);
    assert.ok(r.killed, 'Mutation should be killed: ' + (r.error || ''));
  });

  it('KILL: history failure returns committed=true', function() {
    var r = mutationTest(
      'History failure → committed=true',
      'src/publication/publication-service.js',
      function(code) {
        var cr = code.replace(/\r/g, '');
        return mutate.replaceExactlyOnce(cr, '// History append (pre-commit: failure triggers full rollback)\n      return history.append({', '// MUTATED: history.append skipped\n      return Promise.resolve({');
      },
      'node --test qa/tests/contract/publication-transaction-test.js'
    );
    logResult(r);
    results.push(r);
    assert.ok(r.killed, 'Mutation should be killed: ' + (r.error || ''));
  });

  it('KILL: one-shot boundary returns current time', function() {
    var r = mutationTest(
      'One-shot boundary = current time',
      'server.js',
      function(code) {
        return mutate.replaceExactlyOnce(code, /function computeNextSwitchAt/, 'function computeNextSwitchAt(now) { return now; }\n// MUTATED: original removed\nfunction _original_computeNextSwitchAt');
      },
      'node --test qa/tests/contract/one-shot-boundary-test.js'
    );
    logResult(r);
    results.push(r);
    assert.ok(r.killed, 'Mutation should be killed: ' + (r.error || ''));
  });

  it('KILL: 19:00 after continues half-hour cycles (not next-day 10:30)', function() {
    var r = mutationTest(
      '19:00 after → half-hour (not next-day 10:30)',
      'server.js',
      function(code) {
        var cr = code.replace(/\r/g, '');
        return mutate.replaceExactlyOnce(cr, /} else if \(t\.hour >= 19\) \{[\s\S]*?(\n\s*hour = 10;\n\s*)minute = 30;/, '} else if (t.hour >= 19) { hour = t.hour; minute = 0; // MUTATED: no next-day rule');
      },
      'node --test qa/tests/contract/one-shot-boundary-test.js'
    );
    logResult(r);
    results.push(r);
    assert.ok(r.killed, 'Mutation should be killed: ' + (r.error || ''));
  });
});

describe('Approval adapter & Endpoint mutation tests', function() {
  it('KILL: pending image allowed', function() {
    var r = mutationTest(
      'Pending image publishable',
      'src/images/image-approval-adapter.js',
      function(code) {
        return mutate.replaceExactlyOnce(code, 'function isPublishable(entry) {', 'function isPublishable(entry) {\nreturn true;\n');
      },
      'node --test qa/tests/integration/publish-workflows-test.js'
    );
    logResult(r);
    results.push(r);
    assert.ok(r.killed, 'Mutation should be killed: ' + (r.error || ''));
  });

  it('KILL: frame.bin endpoint broken', function() {
    var r = mutationTest(
      'Frame.bin endpoint broken',
      'server.js',
      function(code) {
        return mutate.replaceExactlyOnce(code, "if (parsed.pathname === '/api/frame.bin') {", "if (parsed.pathname === '/api/frame.bin_mutated_test') {");
      },
      'node --test qa/tests/e2e/real-http-e2e-test.js'
    );
    logResult(r);
    results.push(r);
    assert.ok(r.killed, 'Mutation should be killed: ' + (r.error || ''));
  });
});
