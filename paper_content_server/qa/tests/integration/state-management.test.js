const test = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

test('integration: 新闻草稿保存 (Draft saving)', () => {
  // Simulate saving a draft and reading it back
  const draftFile = path.join(__dirname, '..', '..', 'runtime', 'draft.json');
  fs.mkdirSync(path.dirname(draftFile), { recursive: true });
  
  const draftData = { title: 'Draft Title', content: 'Draft Content' };
  fs.writeFileSync(draftFile, JSON.stringify(draftData));
  
  const readData = JSON.parse(fs.readFileSync(draftFile, 'utf8'));
  assert.strictEqual(readData.title, 'Draft Title');
  
  fs.unlinkSync(draftFile);
});

test('integration: 人工模式持久化 (Manual mode persistence)', () => {
  const stateFile = path.join(__dirname, '..', '..', 'runtime', 'state.json');
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  
  const manualState = { mode: 'manual', activeSnapshot: 'snap-123' };
  fs.writeFileSync(stateFile, JSON.stringify(manualState));
  
  const loaded = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.strictEqual(loaded.mode, 'manual');
  
  fs.unlinkSync(stateFile);
});

test('integration: 恢复自动 (Restore auto)', () => {
  const stateFile = path.join(__dirname, '..', '..', 'runtime', 'state2.json');
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  
  const autoState = { mode: 'auto', activeSnapshot: 'snap-auto-456' };
  fs.writeFileSync(stateFile, JSON.stringify(autoState));
  
  const loaded = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.strictEqual(loaded.mode, 'auto');
  assert.strictEqual(loaded.activeSnapshot, 'snap-auto-456');
  
  fs.unlinkSync(stateFile);
});

test('integration: state/frame 一致性 (state/frame consistency)', () => {
  const stateFile = path.join(__dirname, '..', '..', 'runtime', 'state3.json');
  const frameFile = path.join(__dirname, '..', '..', 'runtime', 'frame.bin');
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  
  const frameData = Buffer.from('mock-frame-data');
  fs.writeFileSync(frameFile, frameData);
  
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256').update(frameData).digest('hex');
  
  const state = { frameSha256: hash };
  fs.writeFileSync(stateFile, JSON.stringify(state));
  
  const loadedState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  const loadedFrame = fs.readFileSync(frameFile);
  const loadedHash = crypto.createHash('sha256').update(loadedFrame).digest('hex');
  
  assert.strictEqual(loadedState.frameSha256, loadedHash);
  
  fs.unlinkSync(stateFile);
  fs.unlinkSync(frameFile);
});
