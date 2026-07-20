const test = require('node:test');
const assert = require('assert');

test('test runner self-check', () => {
  assert.strictEqual(1, 1, 'basic assertion');
});
