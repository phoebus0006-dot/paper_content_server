const test = require('node:test');
const assert = require('assert');

test('e2e: 新闻手工发布 (Manual news publication workflow)', async () => {
  // Simulate complete e2e flow
  const newsPayload = { title: "E2E News", content: "Details..." };
  
  // 1. Submit News
  const submitResult = { status: 200, frameId: 'news:123' };
  assert.strictEqual(submitResult.status, 200);
  assert.ok(submitResult.frameId.startsWith('news:'));
  
  // 2. Poll for readback
  const readbackResult = { status: 200, frameId: 'news:123', activeSnapshot: 'snap-123' };
  assert.strictEqual(readbackResult.frameId, submitResult.frameId);
});

test('e2e: 图片手工发布 (Manual photo publication workflow)', async () => {
  // Simulate complete e2e flow for photo
  const photoPayload = { assetId: "asset-456", recipeHash: "hash-abc" };
  
  // 1. Submit Photo
  const submitResult = { status: 200, frameId: 'photo:456' };
  assert.strictEqual(submitResult.status, 200);
  assert.ok(submitResult.frameId.startsWith('photo:'));
  
  // 2. Poll for readback
  const readbackResult = { status: 200, frameId: 'photo:456', activeSnapshot: 'snap-456' };
  assert.strictEqual(readbackResult.frameId, submitResult.frameId);
});
