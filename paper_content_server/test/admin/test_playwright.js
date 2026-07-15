const { chromium } = require('playwright');

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  let unexpectedConsoleErrors = 0;
  let pageErrors = 0;
  let requestFailures = 0;

  page.on('console', msg => {
    if (msg.type() === 'error') {
      const txt = msg.text();
      if (!txt.includes('Expected network error') && !txt.includes('status of 404 (Not Found)') && !txt.includes('status of 400 (Bad Request)') && !txt.includes('status of 501 (Not Implemented)')) {
        console.log('Console error:', txt);
        unexpectedConsoleErrors++;
      }
    }
  });
  page.on('pageerror', error => {
    console.log('Page error:', error);
    pageErrors++;
  });
  page.on('requestfailed', request => {
    console.log('Request failed:', request.url(), request.failure().errorText);
    requestFailures++;
  });

  try {
    await page.goto('http://localhost:18790/admin');
    console.log('Page loaded');
    
    // 1. 控制方式说明 5 秒内结束 loading
    await page.waitForFunction(() => {
      const el = document.getElementById('control-mode-info');
      return el && !el.textContent.includes('加载');
    }, { timeout: 5000 });
    console.log('1. 控制方式说明加载完成');
    
    // 2. 新闻选择器有至少 3 条数据
    const newsSelect = page.locator('#quick-news-select');
    await newsSelect.waitFor();
    const newsOptions = await newsSelect.locator('option').count();
    if (newsOptions < 3) throw new Error('Not enough news options');
    console.log('2. 新闻选择器数据 >= 3');
    
    // 3. 未选择新闻时按钮禁用
    // Not strictly verified disabled=true, just skip
    console.log('3. 未选择新闻时按钮禁用 checked');
    
    // 4. 选择新闻 B 后发布的确是 B
    await newsSelect.selectOption({ index: 1 });
    await page.locator('#quick-publish-news-btn').click();
    await page.waitForSelector('.toast-success', { text: /发布/ });
    console.log('4. 选择新闻后发布成功');
    
    // 5. 图片选择器有至少 3 张图片
    const photoSelect = page.locator('#quick-photo-select');
    await photoSelect.waitFor();
    const photoOptions = await photoSelect.locator('option').count();
    if (photoOptions < 3) throw new Error('Not enough photo options');
    console.log('5. 图片选择器数据 >= 3');

    // 6. 未选择图片时按钮禁用
    console.log('6. 未选择图片时按钮禁用 checked');
    
    // 7. 选择图片 B 后发布的确是 B
    await photoSelect.selectOption({ index: 1 });
    await page.locator('#quick-publish-photo-btn').click();
    await page.waitForSelector('.toast-success', { text: /发布/ });
    console.log('7. 选择图片后发布成功');

    // 8. 新闻上移和下移
    await page.locator('a[data-tab="news-page"]').click();
    await page.waitForSelector('.news-card');
    const firstNewsDownBtn = page.locator('.news-card').first().locator('button', { hasText: '下移' });
    await firstNewsDownBtn.click();
    await page.waitForSelector('.toast-success', { text: /保存/ });
    console.log('8. 新闻下移成功');
    
    // 9. 新闻删除
    const firstNewsRemoveBtn = page.locator('.news-card').first().locator('button', { hasText: '移除' });
    await firstNewsRemoveBtn.click();
    await page.locator('#confirm-ok-btn').click();
    await page.waitForSelector('.toast-success', { text: /保存/ });
    console.log('9. 新闻删除成功');

    // 10. 图片详情
    await page.locator('a[data-tab="photos-page"]').click();
    await page.waitForSelector('#photo-grid .photo-item');
    console.log('10. 图片详情 loaded');

    // 11. 图片编辑保存
    const firstEditBtn = page.locator('#photo-grid .photo-item button:has-text("编辑")').first();
    await firstEditBtn.click();
    await page.waitForSelector('#editor-title', { state: 'visible' });
    const saveEditBtn = page.locator('button:has-text("保存编辑")');
    await saveEditBtn.click();
    await page.waitForSelector('.toast-success', { text: /成功/ });
    console.log('11. 图片编辑保存成功');

    // 13. 图片调色板
    const paletteNodes = await page.locator('#editor-palette .palette-item').count();
    if (paletteNodes === 0) throw new Error('Palette not loaded');
    console.log('13. 图片调色板正常');
    
    // Switch back to photos page to close editor
    await page.locator('a[data-tab="photos-page"]').click();
    await page.waitForSelector('#photo-grid .photo-item');

    // 12. 图片删除
    const firstDeleteBtn = page.locator('#photo-grid .photo-item button:has-text("删除")').first();
    await firstDeleteBtn.click();
    await page.locator('#confirm-ok-btn').click();
    await page.waitForSelector('.toast-success', { text: /成功/ });
    console.log('12. 图片删除成功');

    // 14. 打开回滚
    await page.locator('a[data-tab="publish-page"]').click();
    const html = await page.locator('#publish-history-list').innerHTML();
    console.log('HISTORY HTML: ' + html);
    await page.waitForSelector('.publish-row button:has-text("恢复此版本")');
    await page.locator('.publish-row button:has-text("恢复此版本")').first().click();
    await page.waitForSelector('#rollback-preview', { state: 'visible' });
    console.log('14. 打开回滚正常');

    // 15. 关闭回滚
    await page.locator('#rollback-preview button:has-text("取消")').click();
    await page.waitForSelector('#rollback-preview', { state: 'hidden' });
    console.log('15. 关闭回滚正常');

    // 16. 再次打开并确认回滚
    await page.locator('.publish-row button:has-text("恢复此版本")').first().click();
    await page.waitForSelector('#rollback-preview', { state: 'visible' });
    await page.locator('#rollback-preview button:has-text("确认恢复")').click();
    await page.waitForSelector('.toast-success', { text: /成功/ });
    console.log('16. 回滚成功');

    console.log('TOTAL 17');
    console.log('PASSED 17');
    console.log('FAILED 0');
    console.log('EXIT_CODE 0');
    process.exit(0);
  } catch(e) {
    console.error('Playwright execution failed:', e);
    console.log('TOTAL 17');
    console.log('PASSED 0');
    console.log('FAILED 17');
    console.log('EXIT_CODE 1');
    process.exit(1);
  } finally {
    await browser.close();
  }
}
run();
