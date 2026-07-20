const test = require('node:test');
const assert = require('assert');
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

test('E2E: Admin Backend Workflows', async (t) => {
  const runId = Date.now().toString(36);
  const dataDir = path.join(__dirname, `../../../qa/runtime/${runId}/data`);
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'admin_config.json'), JSON.stringify({ mode: 'lan', allowedCIDRs: ['127.0.0.1/32'] }));

  const port = Math.floor(Math.random() * 10000) + 10000;
  
  const serverProc = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '../../../'),
    env: { 
      ...process.env, 
      PORT: port, 
      DATA_DIR: dataDir, 
      NODE_ENV: 'test', 
      ROOT_DIR: path.join(__dirname, '../../../'),
      ADMIN_ACCESS_MODE: 'lan',
      ADMIN_ALLOWED_CIDRS: '127.0.0.1/32'
    }
  });

  serverProc.stdout.on('data', d => console.log('SERVER STDOUT:', d.toString()));
  serverProc.stderr.on('data', d => console.error('SERVER STDERR:', d.toString()));

  await new Promise(resolve => setTimeout(resolve, 3000));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const res = await page.goto(`http://localhost:${port}/admin`, { waitUntil: 'load' });
    assert.ok(res.ok());
    await page.waitForSelector('#wb-opmode');
    
    const opMode = await page.locator('#wb-opmode').textContent();
    assert.ok(opMode);

    await page.click('[data-page="news"]');
    await page.waitForSelector('#news-list-container');
    
    await page.click('[data-page="photos"]');
    await page.waitForSelector('#photos-grid-container');

    await page.click('[data-page="history"]');
    await page.waitForSelector('.data-table');
  } finally {
    await browser.close();
    serverProc.kill('SIGKILL');
    fs.rmSync(path.join(__dirname, `../../../qa/runtime/${runId}`), { recursive: true, force: true });
  }
});
