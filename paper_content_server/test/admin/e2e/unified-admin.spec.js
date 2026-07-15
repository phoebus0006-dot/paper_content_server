const { test, expect } = require('@playwright/test');

test.describe('Admin Unified E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to admin using default test URL (assuming local server runs on 8787 or similar)
    // We will use the staging URL since the user gave it: http://192.168.1.49:18080/admin
    // For local CI, we might need a local server. Let's assume process.env.BASE_URL.
    const baseUrl = process.env.BASE_URL || 'http://localhost:8787';
    await page.goto(baseUrl + '/admin');
    
    // Auth bypass if needed, or assume dev environment allows it.
    await page.evaluate(() => {
      localStorage.setItem('admin_token', 'test-token');
    });
    await page.reload();
  });

  test('ADMIN_JS_LOADS and NO CONSOLE_ERRORS', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().includes('favicon')) errors.push(msg.text());
    });
    
    await page.waitForLoadState('networkidle');
    expect(errors.length).toBe(0);
  });

  test('CONTROL_MODE_TEST', async ({ page }) => {
    // Wait for control mode info to not say loading
    await expect(page.locator('#control-mode-info')).not.toContainText('加载中', { timeout: 10000 });
    const text = await page.locator('#control-mode-info').textContent();
    expect(text).toMatch(/自动调度|手动覆盖/);
  });

  test('NEWS_LAYOUT_TEST', async ({ page }) => {
    await page.locator('text="新闻审查"').click();
    await page.waitForSelector('.news-card', { timeout: 10000 });
    const cardCount = await page.locator('.news-card').count();
    expect(cardCount).toBeGreaterThan(0);
    
    // Check classes
    const firstCardTitle = page.locator('.news-card').first().locator('.news-card-title');
    await expect(firstCardTitle).toBeVisible();
  });
});
