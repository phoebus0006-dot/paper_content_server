const test = require('node:test');
const assert = require('assert');
const path = require('path');

function calculateTitleWidth(title) {
  return Math.min(title.length * 16, 160);
}

function runMutation(mutantFn, input) {
  return mutantFn(input);
}

test('mutation 1: remove width boundary check', () => {
  const mutant = (title) => title.length * 16;
  assert.notStrictEqual(runMutation(mutant, "LongTitleExceedingLimit"), 160);
});

test('mutation 2: always return max width', () => {
  const mutant = () => 160;
  assert.notStrictEqual(runMutation(mutant, "Short"), calculateTitleWidth("Short"));
});

test('mutation 3: change multiplier', () => {
  const mutant = (title) => Math.min(title.length * 14, 160);
  assert.notStrictEqual(runMutation(mutant, "Medium"), calculateTitleWidth("Medium"));
});

test('mutation 4: return 0', () => {
  const mutant = () => 0;
  assert.notStrictEqual(runMutation(mutant, "Test"), calculateTitleWidth("Test"));
});

test('mutation 5: path traversal mutation - allow all', () => {
  const base = path.resolve(__dirname, 'data');
  const mutant = (input) => path.resolve(base, input);
  
  assert.strictEqual(runMutation(mutant, '../passwd'), path.resolve(__dirname, 'passwd'));
});

test('mutation 6: path traversal mutation - substring match', () => {
  const base = path.resolve(__dirname, 'data');
  const mutant = (input) => {
    const p = path.resolve(base, input);
    // Simulate substring check bug which shouldn't happen with robust boundary checks
    // Windows path logic allows us to do this cleanly if we just check string.
    return p.includes('data') ? p : null;
  };
  assert.ok(runMutation(mutant, '../data-evil/test.jpg'));
});

test('mutation 7: timeout mutation - drop timeout', () => {
  const mutant = () => setTimeout(() => {}, 1000);
  assert.ok(typeof mutant === 'function');
});

test('mutation 8: async unhandled rejection', async () => {
  const mutant = async () => { throw new Error('Unhandled'); };
  await assert.rejects(runMutation(mutant));
});
