/**
 * generate-fnos-preview-screenshots.js
 * Captures 1920x1080 and 1440x900 visual screenshots of Admin UI Top Navigation Workspace Mode.
 */
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'admin-preview-screenshots');
const PORT = 8787;

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

async function main() {
  console.log('=== Starting Admin Preview Server on Port ' + PORT + ' ===');
  const env = Object.assign({}, process.env, {
    PORT: String(PORT),
    NODE_ENV: 'production',
    ADMIN_ACCESS_MODE: 'lan',
    ADMIN_ALLOWED_CIDRS: '127.0.0.0/8,192.168.0.0/16,10.0.0.0/8,172.16.0.0/12',
    LEARNING_LIBRARY_ENABLED: 'true',
    CUSTOM_LIBRARY_ENABLED: 'true'
  });

  const server = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    env: env, cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe']
  });

  let stderr = '';
  server.stderr.on('data', (d) => { stderr += d.toString(); });

  // Wait for server health
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try {
      await new Promise((ok, fail) => {
        const r = http.get(`http://127.0.0.1:${PORT}/health/live`, (res) => {
          res.resume();
          res.on('end', () => ok());
        });
        r.on('error', fail);
        r.setTimeout(1000, () => { r.destroy(); fail(new Error('timeout')); });
      });
      ready = true;
      break;
    } catch (e) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  if (!ready) {
    console.error('Server failed to start. Stderr:', stderr);
    if (server) server.kill();
    process.exit(1);
  }

  console.log('Server running at http://127.0.0.1:' + PORT);

  const browser = await chromium.launch({ headless: true });

  const tabs = [
    { name: 'dashboard', tabId: 'dashboard' },
    { name: 'news', tabId: 'news-page' },
    { name: 'photos', tabId: 'photos-page' },
    { name: 'photo-editor', tabId: 'photo-editor-page' },
    { name: 'publish', tabId: 'publish-page' },
    { name: 'status', tabId: 'status-page' }
  ];

  const viewports = [
    { width: 1920, height: 1080, label: '1920x1080' },
    { width: 1440, height: 900, label: '1440x900' }
  ];

  try {
    for (const vp of viewports) {
      console.log(`\n--- Capturing Viewport ${vp.label} ---`);
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1
      });
      const page = await context.newPage();

      await page.goto(`http://127.0.0.1:${PORT}/admin`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);

      for (const tab of tabs) {
        await page.evaluate((targetTab) => {
          if (window.switchTab) {
            if (targetTab === 'photo-editor-page') {
              if (window.STATE && window.STATE.editor) window.STATE.editor.assetId = 'preview-demo';
            }
            window.switchTab(targetTab);
          }
        }, tab.tabId);

        await page.waitForTimeout(800);
        const fileName = `${tab.name}-${vp.label}.png`;
        const filePath = path.join(OUT_DIR, fileName);
        await page.screenshot({ path: filePath, fullPage: false });
        console.log(`Saved screenshot: ${fileName}`);
      }

      await context.close();
    }
  } catch (err) {
    console.error('Screenshot capturing error:', err);
  } finally {
    await browser.close();
    if (server) server.kill();
    console.log('\nAll screenshots saved to:', OUT_DIR);
  }
}

main().catch(console.error);
