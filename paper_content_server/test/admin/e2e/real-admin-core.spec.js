const { test, expect } = require('@playwright/test');
const { createIsolatedServer } = require('../../helpers/start-isolated-server');

let srv;

test.beforeAll(async () => {
  srv = await createIsolatedServer();
});

test.afterAll(() => {
  if (srv) srv.cleanup();
});

test.describe('Admin Core Layout', () => {
  test('core layout and dashboard loaded', async ({ page }) => {
    await page.goto(srv.baseUrl + '/admin/');
    
    // Verify dashboard displays
    const dashMode = page.locator('#dash-mode');
    await expect(dashMode).toBeVisible();

    // Verify sidebars and nav exist
    const sidebar = page.locator('.sidebar nav');
    await expect(sidebar).toBeVisible();

    // Verify tabs can be switched
    await page.click('a[data-tab="news-page"]');
    await expect(page.locator('#news-page')).toBeVisible();
    await expect(page.locator('#dashboard')).not.toBeVisible();
  });
});
