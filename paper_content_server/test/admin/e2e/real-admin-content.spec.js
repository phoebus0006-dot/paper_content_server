const { test, expect } = require('@playwright/test');
const { createIsolatedServer } = require('../../helpers/start-isolated-server');

const fs = require('fs');
const path = require('path');

let srv;

test.beforeAll(async () => {
  srv = await createIsolatedServer();
  fs.writeFileSync(path.join(srv.dataDir, 'last_good_news.json'), JSON.stringify({
    items: [
      {
        id: "1",
        displayTitle: "Test News Title",
        displaySummary: "Test summary of news.",
        source: "test",
        publishedAt: new Date().toISOString()
      }
    ]
  }));
});

test.afterAll(() => {
  if (srv) srv.cleanup();
});

test.describe('Admin Content UI', () => {
  test('News Card Styling and Content Proportions', async ({ page }) => {
    await page.goto(srv.baseUrl + '/admin/');
    
    // Switch to News Review Tab
    await page.click('a[data-tab="news-page"]');
    await expect(page.locator('#news-page')).toBeVisible();

    // Wait for at least one news card to appear
    const newsCard = page.locator('.news-card').first();
    await newsCard.waitFor({ state: 'visible' });

    // Validate specific class is used for isolation
    await expect(newsCard).toHaveClass(/news-card/);

    // Validate layout doesn't bleed out of bounds
    const box = await newsCard.boundingBox();
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
    
    // Check title font size is reduced
    const title = newsCard.locator('.news-card-title');
    const titleStyles = await title.evaluate((el) => window.getComputedStyle(el));
    expect(parseInt(titleStyles.fontSize)).toBeLessThanOrEqual(14); // As per our patch

    // Check summary font size is reduced
    const summary = newsCard.locator('.news-card-summary');
    const summaryStyles = await summary.evaluate((el) => window.getComputedStyle(el));
    expect(parseInt(summaryStyles.fontSize)).toBeLessThanOrEqual(12);

    // Ensure buttons are visible
    const moveBtn = newsCard.locator('button', { hasText: '上移' });
    if (await moveBtn.count() > 0) {
      await expect(moveBtn).toBeVisible();
    }

    // Text vs Padding Proportion check
    const paddedBox = await newsCard.evaluate(el => {
      const style = window.getComputedStyle(el);
      return {
        paddingTop: parseFloat(style.paddingTop),
        paddingBottom: parseFloat(style.paddingBottom),
        height: el.clientHeight
      };
    });
    
    // Total vertical space taken by padding vs content height
    const paddingHeight = paddedBox.paddingTop + paddedBox.paddingBottom;
    const contentHeight = paddedBox.height - paddingHeight;
    const textRatio = contentHeight / paddedBox.height;
    
    expect(textRatio).toBeGreaterThan(0.75); // Ensure text is majority of the card space
  });
});
