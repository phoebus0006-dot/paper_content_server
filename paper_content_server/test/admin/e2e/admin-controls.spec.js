const { test, expect } = require('@playwright/test');
test('admin test', async ({ page }) => {
  await page.goto('http://localhost:8787/admin');
  const title = await page.title();
  expect(title).toBeDefined();
});
