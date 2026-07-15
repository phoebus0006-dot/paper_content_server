const fs = require('fs');
const path = require('path');
const http = require('http');
const sharp = require('sharp');

const DATA_DIR = path.join(__dirname, 'test_env_new');
if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, {recursive: true});

// 1. Setup Data
const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNkYPhfz0AEYBxVSF+FAAhKDveksOjmAAAAAElFTkSuQmCC';
const realPng = Buffer.from(pngBase64, 'base64');
fs.writeFileSync(path.join(DATA_DIR, 'photo1.png'), realPng);
fs.writeFileSync(path.join(DATA_DIR, 'photo2.png'), realPng);
const imgIdx = [
  {id: 'p1', title: 'Photo 1', processedPngPath: 'photo1.png', width: 10, height: 10, createdAt: new Date().toISOString()},
  {id: 'p2', title: 'Photo 2', processedPngPath: 'photo2.png', width: 10, height: 10, createdAt: new Date().toISOString()}
];
fs.writeFileSync(path.join(DATA_DIR, 'image_index.json'), JSON.stringify(imgIdx));
fs.writeFileSync(path.join(DATA_DIR, 'last_good_news.json'), JSON.stringify({items: [{id: 'n1', zhTitle: 'News 1', zhSummary: 'Sum 1'}]}));

// 2. Start Server
const { spawn } = require('child_process');
const serverProcess = spawn('node', ['server.js'], {
  cwd: path.resolve(__dirname, '../../'),
  env: { ...process.env, PORT: '18789', ADMIN_ACCESS_MODE: 'lan', ADMIN_ALLOWED_CIDRS: '127.0.0.1/32', DATA_DIR: path.join(__dirname, 'test_env_new') }
});

const API_BASE = 'http://127.0.0.1:18789';

async function req(method, p, body) {
  return new Promise((resolve) => {
    const opts = { method, headers: {'Content-Type': 'application/json', 'Origin': API_BASE} };
    const req = http.request(API_BASE + p, opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', (e) => resolve({ status: 500, error: e.message }));
    if(body) req.write(JSON.stringify(body));
    req.end();
  });
}

function assert(cond, msg) { if(!cond) throw new Error(msg); }

async function runTests() {
  await new Promise(r => setTimeout(r, 2000)); // wait for server to start
  console.log('--- API TESTS ---');

  const tests = [
    { m: 'GET', p: '/health/live', expect: 200 },
    { m: 'GET', p: '/health/ready', expect: 200 },
    { m: 'GET', p: '/api/admin/dashboard', expect: 200 },
    { m: 'GET', p: '/api/admin/control-mode', expect: 200 },
    { m: 'GET', p: '/api/admin/news', expect: 200 },
    { m: 'GET', p: '/api/admin/photos', expect: 200 },
    { m: 'GET', p: '/api/admin/photos/p1', expect: 200 },
    { m: 'GET', p: '/api/admin/photos/invalid-id', expect: 404 },
    { m: 'POST', p: '/api/admin/photos/p1/save-edit', body: {op:'test'}, expect: 200 },
    { m: 'DELETE', p: '/api/admin/photos/p2', expect: 200 },
    { m: 'GET', p: '/api/admin/photo-palette?id=p1', expect: 200 },
    { m: 'POST', p: '/api/admin/publish/news', body: {newsId: 'n1'}, expect: 200 },
    { m: 'POST', p: '/api/admin/publish/photo', body: {photoId: 'p1'}, expect: 200 },
    { m: 'GET', p: '/api/admin/publish-history', expect: 200 },
    { m: 'POST', p: '/api/admin/rollback', body: {frameId: 'invalid'}, expect: 400 },
    // error scenarios
    { m: 'GET', p: '/api/admin/photos/../../../etc/passwd', expect: 404 }, // path traversal protection is handled by router usually 404
  ];

  let passed = 0, failed = 0;
  for(const t of tests) {
    const res = await req(t.m, t.p, t.body);
    const success = res.status === t.expect || (t.expect===404 && res.status===403);
    console.log(`${t.m} ${t.p} ${res.status} ${success ? 'PASSED' : 'FAILED'}`);
    if (success) passed++; else failed++;
  }

  // Validate Sharp on actual image
  const meta = await sharp(realPng).metadata();
  console.log(`sharp(image).metadata() passed. width=${meta.width}, height=${meta.height}`);

  console.log(`TOTAL ${passed+failed}`);
  console.log(`PASSED ${passed}`);
  console.log(`FAILED ${failed}`);
  
  serverProcess.kill();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => {
  console.error(e);
  serverProcess.kill();
  process.exit(1);
});
