const { chromium } = require('playwright');
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

async function waitForServer(url, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
          if (res.statusCode === 200 || res.statusCode === 401 || res.statusCode === 403) resolve();
          else reject();
        });
        req.on('error', reject);
      });
      return true;
    } catch (e) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  return false;
}

async function runTest() {
  console.log('Starting server...');
  const serverProc = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: '8788', ADMIN_TOKEN: 'testtoken' }
  });

  serverProc.stdout.on('data', (d) => console.log(`SERVER: ${d}`));
  serverProc.stderr.on('data', (d) => console.error(`SERVER ERR: ${d}`));

  const url = 'http://localhost:8788/admin/';
  const ok = await waitForServer(url);
  if (!ok) {
    console.error('Server failed to start');
    serverProc.kill();
    process.exit(1);
  }

  console.log('Server started. Launching Playwright...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  let testPassed = false;
  try {
    await page.goto(url);
    
    // Login
    await page.fill('#login-token', 'testtoken');
    await page.click('#login-form button[type="submit"]');
    
    // Wait for Dashboard to appear
    await page.waitForSelector('#dashboard.active');
    console.log('Logged in successfully');

    // Go to publish page
    await page.click('a[data-tab="publish-page"]');
    await page.waitForSelector('#publish-page.active');
    console.log('Navigated to Publish page');

    await page.click('#publish-page button[onclick="showNewsSelector()"]');
    await page.waitForSelector('#btn-confirm-news-publish:not([disabled])');
    console.log('Opened news publish modal');

    const [response] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/admin/publish/news')),
      page.click('#btn-confirm-news-publish')
    ]);

    console.log(`Publish Response Status: ${response.status()}`);
    if (response.status() !== 200) {
      console.error('Failed to publish news', await response.text());
      throw new Error('Publish failed');
    }

    // Now check status
    const statusRes = await page.request.get('http://localhost:8788/api/admin/status', {
      headers: { 'Authorization': 'Bearer testtoken' }
    });
    const statusObj = await statusRes.json();
    
    if (statusObj.overrideMode === 'MANUAL_NEWS') {
      console.log('SUCCESS: overrideMode is MANUAL_NEWS');
      testPassed = true;
    } else {
      console.error('FAIL: overrideMode is', statusObj.overrideMode);
    }
  } catch (err) {
    console.error('Test error:', err);
  } finally {
    await browser.close();
    serverProc.kill();
    process.exit(testPassed ? 0 : 1);
  }
}

runTest();
