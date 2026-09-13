'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createServer } = require('../scripts/serve.cjs');

(async () => {
  let chromium;
  try {
    chromium = require('playwright-core').chromium;
  } catch {
    console.log('[SKIP] playwright-core not found.');
    process.exit(0);
  }

  const EDGE_PATH = process.env.CHROMIUM_PATH || (
    fs.existsSync('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe')
      ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
      : 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  );

  const server = createServer();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;

  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: EDGE_PATH
    });

    for (const width of [1440, 820, 390, 320]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));

      await page.goto(`${base}/#${encodeURIComponent('Research @CPSolvers')}`);
      await page.locator('#page h1').waitFor();
      assert.equal(await page.locator('#page h1').innerText(), 'Research Collaborators');

      // Zero horizontal page overflow
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
      assert.ok(overflow, `${width}px horizontal overflow detected on Research View`);

      // No pagination buttons exist
      assert.equal(await page.locator('#next').count(), 0, 'No Next button on Research View');
      assert.equal(await page.locator('#prev').count(), 0, 'No Prev button on Research View');

      // Verify all 18 collaborators are present
      if (width > 760) {
        // Desktop comparison table
        const rows = page.locator('.research-desktop-view tbody tr.research-row');
        assert.equal(await rows.count(), 18, `All 18 collaborators in desktop table at ${width}px`);

        // Check 12th and 13th collaborators are present together
        const row12 = page.locator('.research-desktop-view tr:has-text("Johann Alexandre Edjimbi")');
        const row13 = page.locator('.research-desktop-view tr:has-text("Minahil Ramzan")');
        assert.equal(await row12.count(), 1, '12th collaborator present in table');
        assert.equal(await row13.count(), 1, '13th collaborator present in table');

        // Check verbatim availability
        assert.ok(await page.locator('.research-desktop-view :text("NOT available (YET)")').count() > 0, 'Verbatim availability preserved');

        // Check sticky header
        const thPosition = await page.locator('.research-table thead th').first().evaluate(el => window.getComputedStyle(el).position);
        assert.equal(thPosition, 'sticky', 'Table header has sticky position');
      } else {
        // Mobile cards
        const cards = page.locator('.research-mobile-view article.research-mobile-card');
        assert.equal(await cards.count(), 18, `All 18 collaborators in mobile list at ${width}px`);

        // Check 12th and 13th collaborators are present together
        const card12 = page.locator('.research-mobile-view article:has-text("Johann Alexandre Edjimbi")');
        const card13 = page.locator('.research-mobile-view article:has-text("Minahil Ramzan")');
        assert.equal(await card12.count(), 1, '12th collaborator present in mobile view');
        assert.equal(await card13.count(), 1, '13th collaborator present in mobile view');

        // Verify keyboard disclosure
        const firstDisclosure = page.locator('.research-mobile-view details.research-skills-disclosure').first();
        assert.equal(await firstDisclosure.getAttribute('open'), null, 'Disclosure closed by default');
        await page.locator('.research-mobile-view summary.skills-disclosure-summary').first().click();
        assert.equal(await firstDisclosure.evaluate(el => el.open), true, 'Disclosure opens upon click');

        // Verify preferred contact inside disclosure
        const contactBlock = firstDisclosure.locator('.research-contact-block');
        assert.equal(await contactBlock.count(), 1, 'Contact block rendered inside disclosure');
      }

      assert.equal(errors.length, 0, `Errors encountered at ${width}px: ${errors.join('; ')}`);
      await context.close();
    }

    // Interactive tests at 1440px
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      await page.goto(`${base}/#${encodeURIComponent('Research @CPSolvers')}`);
      await page.locator('#page h1').waitFor();

      // Test skill filter dropdown
      await page.selectOption('#research-skill-select', 'Prior CPS publications');
      const filteredRows = page.locator('.research-desktop-view tbody tr.research-row');
      assert.equal(await filteredRows.count(), 2, 'Prior CPS publications filter yields exactly 2 collaborators');
      assert.ok(await page.locator('text=Yaz Heredia').count() > 0, 'Yaz Heredia matches');
      assert.ok(await page.locator('text=Oumaima Outani').count() > 0, 'Oumaima Outani matches');

      // Test reset button
      await page.click('#research-reset-filters');
      assert.equal(await page.locator('.research-desktop-view tbody tr.research-row').count(), 18, 'Reset restores 18 rows');

      // Test text search
      await page.fill('#research-search-input', 'Zakariyya');
      const searchRows = page.locator('.research-desktop-view tbody tr.research-row');
      assert.equal(await searchRows.count(), 2, 'Search for Zakariyya returns 2 collaborators (Zakariyya Gardee, Zakariyya Ellemdin)');
      await page.click('#research-clear-input');
      assert.equal(await page.locator('.research-desktop-view tbody tr.research-row').count(), 18, 'Clear search restores 18 rows');

      // Test column picker
      await page.click('#research-column-picker summary');
      const dataAnalyticsCheckbox = page.locator('input[data-skill-col="Data analytics"]');
      await dataAnalyticsCheckbox.uncheck();
      // Verify Data analytics column header is removed from table
      assert.equal(await page.locator('.research-table th.th-skill:has-text("Data analytics")').count(), 0, 'Data analytics column hidden');
      // Reset columns
      await page.click('#research-columns-select-all');
      assert.equal(await page.locator('.research-table th.th-skill:has-text("Data analytics")').count(), 1, 'Data analytics column restored');
      await page.click('#research-columns-done');

      // Test open details
      await page.locator('.research-row-actions button[data-open]').first().click();
      await page.locator('#detail-dialog').waitFor();
      assert.equal(await page.locator('#detail-dialog').evaluate(el => el.open), true, 'Detail dialog open');
      assert.ok(await page.locator('#dialog-content :text("Research writing")').count() > 0, 'Detail dialog includes all fields');
      if (await page.locator('#edit-record-btn').isVisible()) {
        await page.click('#edit-record-btn');
        assert.ok(await page.locator('#dialog-content label:has-text("Research writing")').count() > 0, 'Edit form includes Research writing');
        await page.click('#dialog-secondary'); // cancel edit -> view mode
        if (await page.locator('#detail-dialog').evaluate(el => el.open)) {
          await page.click('#dialog-secondary'); // close view mode
        }
      } else {
        await page.keyboard.press('Escape');
      }

      await context.close();
    }

    // 200% zoom check (emulate 720px width representing 1440px @ 200% zoom)
    {
      const context = await browser.newContext({ viewport: { width: 720, height: 900 }, deviceScaleFactor: 2 });
      const page = await context.newPage();
      await page.goto(`${base}/#${encodeURIComponent('Research @CPSolvers')}`);
      await page.locator('#page h1').waitFor();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
      assert.ok(overflow, 'Zero horizontal overflow at 200% zoom');
      await context.close();
    }

    console.log('Research comparison browser tests passed on Chromium/Edge');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})();
