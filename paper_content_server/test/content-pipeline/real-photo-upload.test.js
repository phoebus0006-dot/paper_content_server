const { test, before, after } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createIsolatedServer } = require('../helpers/start-isolated-server');

let srv;
let lastUploadedPhotoId;

before(async () => {
  srv = await createIsolatedServer();
});

after(() => {
  if (srv) srv.cleanup();
});

test('isolated server started on dynamic port and configs applied', () => {
  assert.ok(srv.port > 0);
  assert.notStrictEqual(srv.port, 8787);
  assert.notStrictEqual(srv.port, 18080);
});

test('upload valid PNG', async () => {
  const formData = new FormData();
  // Valid PNG buffer
  const validPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==', 'base64');
  formData.append('photo', new Blob([validPng], { type: 'image/png' }), 'test.png');

  const res = await fetch(srv.baseUrl + '/api/admin/photos/upload', {
    method: 'POST',
    body: formData, headers: { 'Origin': srv.baseUrl }
  });

  assert.strictEqual(res.status, 200, 'HTTP status should be 2xx');
  const data = await res.json();
  assert.strictEqual(data.status, 'ok', 'Response status must be ok');
  assert.ok(data.photoId, 'Must return photoId');
  
  lastUploadedPhotoId = data.photoId;

  // Check image_index
  const indexStr = fs.readFileSync(path.join(srv.dataDir, 'image_index.json'), 'utf8');
  const index = JSON.parse(indexStr);
  const record = index.find(p => p.photoId === data.photoId || p.id === data.photoId);
  assert.ok(record, 'Record must exist in image_index.json');
  assert.strictEqual(record.sourceId || record.sourceType || record.source, 'local_import', 'Must use canonical sourceId');
  assert.ok(record.width > 0, 'Must decode width');
  assert.ok(record.height > 0, 'Must decode height');

  // Check physical file
  const physicalName = record.fileName || record.relativePath || record.url.split('/').pop() || data.photoId;
  const expectedPath = path.join(srv.imageDir, 'local_import', physicalName);
  assert.ok(fs.existsSync(expectedPath), 'File must be physically written to TEST_IMAGE_DIR');

  // Verify fetch API
  const listRes = await fetch(srv.baseUrl + '/api/admin/photos');
  const listData = await listRes.json();
  assert.ok(listData.photos.some(p => p.id === data.photoId || p.photoId === data.photoId), 'Must be visible in GET /api/admin/photos');
});

test('upload valid JPEG', async () => {
  const formData = new FormData();
  const validJpeg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
  formData.append('photo', new Blob([validJpeg], { type: 'image/jpeg' }), 'test.jpg');
  const res = await fetch(srv.baseUrl + '/api/admin/photos/upload', { method: 'POST', body: formData, headers: { 'Origin': srv.baseUrl } });
  assert.strictEqual(res.status, 200);
});

test('upload valid WebP', async () => {
  const formData = new FormData();
  const validWebp = Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64');
  formData.append('photo', new Blob([validWebp], { type: 'image/webp' }), 'test.webp');
  const res = await fetch(srv.baseUrl + '/api/admin/photos/upload', { method: 'POST', body: formData, headers: { 'Origin': srv.baseUrl } });
  assert.strictEqual(res.status, 200);
});

test('upload HTML disguised as PNG', async () => {
  const initialIndexLength = JSON.parse(fs.readFileSync(path.join(srv.dataDir, 'image_index.json'), 'utf8')).length;

  const formData = new FormData();
  formData.append('photo', new Blob(['<html><body>Fake</body></html>'], { type: 'image/png' }), 'fake.png');

  const res = await fetch(srv.baseUrl + '/api/admin/photos/upload', { method: 'POST', body: formData, headers: { 'Origin': srv.baseUrl } });
  assert.ok(res.status >= 400 && res.status < 500, 'Must return 4xx');

  const currentIndexLength = JSON.parse(fs.readFileSync(path.join(srv.dataDir, 'image_index.json'), 'utf8')).length;
  assert.strictEqual(currentIndexLength, initialIndexLength, 'Index must not grow on invalid file');
});

test('upload SVG', async () => {
  const formData = new FormData();
  formData.append('photo', new Blob(['<svg></svg>'], { type: 'image/svg+xml' }), 'fake.svg');
  const res = await fetch(srv.baseUrl + '/api/admin/photos/upload', { method: 'POST', body: formData, headers: { 'Origin': srv.baseUrl } });
  assert.ok(res.status >= 400 && res.status < 500, 'Must reject SVG');
});

test('upload corrupt image', async () => {
  const formData = new FormData();
  const corrupt = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c48900', 'hex');
  formData.append('photo', new Blob([corrupt], { type: 'image/png' }), 'corrupt.png');
  const res = await fetch(srv.baseUrl + '/api/admin/photos/upload', { method: 'POST', body: formData, headers: { 'Origin': srv.baseUrl } });
  assert.ok(res.status >= 400 && res.status < 500, 'Must reject corrupt PNG');
});

test('upload oversize file', async () => {
  const formData = new FormData();
  const huge = Buffer.alloc(6 * 1024 * 1024, 'a');
  formData.append('photo', new Blob([huge], { type: 'image/png' }), 'huge.png');
  const res = await fetch(srv.baseUrl + '/api/admin/photos/upload', { method: 'POST', body: formData, headers: { 'Origin': srv.baseUrl } });
  assert.ok(res.status >= 400 && res.status < 500);
});

test('restart persistence verification', async () => {
  // Stop server
  srv.stop();
  
  // Wait a bit
  await new Promise(r => setTimeout(r, 500));

  // Restart using SAME dirs
  const { spawn } = require('child_process');
  const http = require('http');

  const port = await new Promise((resolve) => {
    const s = http.createServer();
    s.listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); });
  });

  const child = spawn('node', ['server.js', '--port', port.toString()], {
    cwd: path.join(__dirname, '..', '..'),
    env: { ...process.env, NODE_ENV: 'test', PORT: port.toString(), DATA_DIR: srv.dataDir, IMAGE_DIR: srv.imageDir, MQTT_ENABLED: 'false', DEVICE_PUBLISH_ENABLED: 'false', ADMIN_ACCESS_MODE: 'lan', ADMIN_ALLOWED_CIDRS: '127.0.0.1/32' }
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  
  let isReady = false;
  await new Promise((resolve, reject) => {
    const interval = setInterval(() => {
      http.get(baseUrl + '/', (res) => {
        if (res.statusCode >= 200) { clearInterval(interval); isReady = true; resolve(); }
      }).on('error', () => {});
    }, 500);
    setTimeout(() => { clearInterval(interval); if (!isReady) reject(new Error('Restart timeout')); }, 10000);
  });

  // Verify
  const listRes = await fetch(baseUrl + '/api/admin/photos');
  const listData = await listRes.json();
  assert.ok(listData.photos.some(p => p.id === lastUploadedPhotoId || p.photoId === lastUploadedPhotoId), 'Previously uploaded photo must persist across restart');

  child.kill();
});





