const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const port = Math.floor(Math.random() * 10000) + 10000;
const tmpData = path.join(__dirname, '../tmp', 'repro-' + Date.now());
fs.mkdirSync(tmpData, { recursive: true });

// Copy base data
const srcData = path.join(__dirname, '../../data');
if (fs.existsSync(srcData)) {
  fs.cpSync(srcData, tmpData, { recursive: true });
}

console.log('Starting server on port ' + port);
const { spawn } = require('child_process');
const server = spawn('node', ['server.js'], {
  cwd: path.join(__dirname, '../../'),
  env: { ...process.env, PORT: port.toString(), DATA_DIR: tmpData }
});

server.stdout.on('data', (d) => console.log('server:', d.toString()));
server.stderr.on('data', (d) => console.error('server err:', d.toString()));

async function request(method, reqPath, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: port,
      path: reqPath,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, data }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

setTimeout(async () => {
  const results = {};

  try {
    const res = await request('POST', '/api/admin/publish/news', {
      newsId: 'test-news'
    });
    results['PUB-01'] = { endpoint: '/api/admin/publish/news', response: res.data, status: res.statusCode };
  } catch(e) {
    results['PUB-01'] = { error: e.message };
  }

  try {
    const res = await request('POST', '/api/admin/publish/photo', {
      photoId: 'test-photo'
    });
    results['PUB-02'] = { endpoint: '/api/admin/publish/photo', response: res.data, status: res.statusCode };
  } catch(e) {
    results['PUB-02'] = { error: e.message };
  }

  try {
    const res = await request('POST', '/api/admin/news/draft', {
      rawTitle: 'A very long title that should definitely trigger the too wide error in the current version of the content server because it exceeds the pixel limit of the e-paper display',
      rawSummary: 'Summary'
    });
    results['NEWS-01'] = { endpoint: '/api/admin/news/draft', response: res.data, status: res.statusCode };
  } catch(e) {
    results['NEWS-01'] = { error: e.message };
  }

  // Write results
  const reproFile = path.join(__dirname, '../../audit/problem-reproductions.json');
  fs.writeFileSync(reproFile, JSON.stringify(results, null, 2));
  console.log('Results written');
  
  server.kill();
  process.exit(0);
}, 3000);
