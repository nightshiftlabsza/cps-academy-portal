'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const { createServer } = require('../scripts/serve.cjs');
const { injectAuth } = require('./test-auth-helper.cjs');

(async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const executablePath = process.env.CHROMIUM_PATH || [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
  ].find(p => fs.existsSync(p));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath });
    const output = path.resolve(__dirname, '../screenshots/next7-density');
    fs.mkdirSync(output, { recursive: true });
    for (const width of [320, 390, 430]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
      await injectAuth(context, 'admin');
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${server.address().port}/#Morning%20Report`);
      const card = page.locator('.mr-stream').first().locator('.mr-card').first();
      await card.waitFor();
      await page.evaluate(() => document.fonts.ready);
      const metrics = await card.evaluate(el => {
        const cells = [...el.querySelectorAll('.mr-role-cell')].map(c => c.getBoundingClientRect());
        const grid = el.querySelector('.mr-card-staffing').getBoundingClientRect();
        return {
          height: el.getBoundingClientRect().height,
          staffingHeight: grid.height,
          rowGap: cells[2].top - Math.max(cells[0].bottom, cells[1].bottom),
          firstRowAligned: Math.abs(cells[0].top - cells[1].top) < 1,
          dateBeforeTitle: el.querySelector('.mr-card-date').getBoundingClientRect().bottom <= el.querySelector('.mr-card-content').getBoundingClientRect().top + 1,
          titleFont: getComputedStyle(el.querySelector('.mr-card-title')).fontFamily,
          nameFont: getComputedStyle(el.querySelector('.staff-token')).fontFamily,
          overflow: document.documentElement.scrollWidth > innerWidth + 1
        };
      });
      console.log(`${width}px Next 7: ${JSON.stringify(metrics)}`);
      assert.equal(metrics.overflow, false);
      assert.equal(metrics.firstRowAligned, true, 'Roles remain a two-column grid on narrow phones');
      assert.equal(metrics.dateBeforeTitle, true, 'Date stays above the title');
      assert.ok(metrics.rowGap >= -1 && metrics.rowGap <= 16, 'Staffing rows follow their content without artificial empty space');
      await card.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, `next7-${width}.png`) });
      await page.evaluate(() => localStorage.setItem('cps-hub-appearance-v1', JSON.stringify({ theme: 'emerald', mode: 'dark' })));
      await page.reload();
      await card.waitFor();
      await card.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, `next7-${width}-dark.png`) });
      // Cancelled/blackout cards use a separate zone with the same desktop flex basis.
      await card.evaluate(el => {
        el.querySelector('.mr-card-staffing').outerHTML = '<div class="mr-card-bypassed">Session cancelled — team not required</div>';
      });
      const cancelled = await card.locator('.mr-card-bypassed').boundingBox();
      assert.ok(cancelled.height < 90, 'Cancelled notices must not inherit a 460px desktop flex basis');
      await context.close();
    }
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
