const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

async function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const srv = http.createServer();
    srv.listen(0, () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

function pollReadiness(baseUrl, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const interval = setInterval(() => {
      if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        return reject(new Error('Readiness timeout'));
      }
      http.get(baseUrl + '/', (res) => {
        if (res.statusCode === 200 || res.statusCode === 401 || res.statusCode === 403 || res.statusCode === 404) {
          clearInterval(interval);
          resolve(true);
        }
      }).on('error', () => {
        // keep polling
      });
    }, 500);
  });
}

async function createIsolatedServer() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paper-test-'));
  const dataDir = path.join(tempDir, 'data');
  const imageDir = path.join(tempDir, 'images');
  fs.mkdirSync(dataDir);
  fs.mkdirSync(imageDir);

  const port = await getAvailablePort();
  fs.writeFileSync(path.join(dataDir, 'config.json'), JSON.stringify({ port: port }));
  fs.writeFileSync(path.join(dataDir, 'feeds.json'), JSON.stringify([]));
  fs.writeFileSync(path.join(dataDir, 'image_index.json'), JSON.stringify([]));
  const child = spawn('node', ['server.js', '--port', port.toString()], {
    cwd: path.join(__dirname, '..', '..'),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: port.toString(),
      DATA_DIR: dataDir,
      IMAGE_DIR: imageDir,
      MQTT_ENABLED: 'false',
      DEVICE_PUBLISH_ENABLED: 'false',
      CONTENT_SYNC_ENABLED: 'false',
      AUTO_SYNC_ENABLED: 'false',
      ADMIN_ACCESS_MODE: 'lan',
      ADMIN_ALLOWED_CIDRS: '127.0.0.1/32'
    }
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', d => stdout += d.toString());
  child.stderr.on('data', d => stderr += d.toString());

  const baseUrl = `http://127.0.0.1:${port}`;
  
  try {
    await pollReadiness(baseUrl, 15000);
  } catch (err) {
    child.kill();
    throw new Error(`Server failed to start. Stdout: ${stdout}\nStderr: ${stderr}`);
  }

  return {
    baseUrl,
    port,
    dataDir,
    imageDir,
    tempDir,
    process: child,
    stop: () => {
      child.kill();
    },
    cleanup: () => {
      child.kill();
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
    }
  };
}

module.exports = { createIsolatedServer };





