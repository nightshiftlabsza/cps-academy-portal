'use strict';
const assert = require('node:assert/strict');
const { createServer } = require('../scripts/serve.cjs');
const { chromium } = require('playwright-core');

(async () => {
  const server = createServer();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const executablePath = process.env.CHROMIUM_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const browser = await chromium.launch({ headless: true, executablePath });
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    // 1. Responsive & Semantics across 1440, 820, 390, 320px
    for (const width of [1440, 820, 390, 320]) {
      const context = await browser.newContext({ viewport: { width, height: 800 } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));

      // Test Morning Report view mode semantics
      await page.goto(base + '/#' + encodeURIComponent('Morning Report'));
      await page.locator('#page h1').waitFor();

      if (width <= 760) {
        // Mobile must render agenda or list, never matrix grid
        const hasMatrix = await page.locator('.matrix-table, .matrix-container').count();
        assert.equal(hasMatrix, 0, `At ${width}px, Morning Report must not render matrix grid`);
      }

      // Check aria-current on active nav button
      const activeNav = page.locator('.nav-button[aria-current="page"]');
      assert.ok(await activeNav.count() > 0, `At ${width}px, active navigation button must have aria-current="page"`);

      // No horizontal overflow
      const docOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
      assert.ok(docOverflow, `Horizontal overflow detected at ${width}px`);

      await context.close();
      assert.deepEqual(errors, []);
    }

    // 2. Interaction and Back/Forward State Restoration at 1440px
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();

    // A. Visit CPS Academy VMRs -> Page 2
    await p.goto(base + '/#' + encodeURIComponent('CPS Academy VMRs'));
    await p.locator('#page h1').waitFor();
    const nextBtn = p.locator('#next');
    await nextBtn.waitFor();
    await nextBtn.click();
    await p.waitForTimeout(100);

    // Verify Page 2 is displayed
    let paginationText = await p.locator('.pagination span').innerText();
    assert.ok(paginationText.includes('Page 2'), `Expected Page 2 in VMRs: ${paginationText}`);

    // Click a record to set anchor
    const firstOpenBtn = p.locator('[data-open]').first();
    await firstOpenBtn.click();
    await p.locator('#detail-dialog[open]').waitFor();
    await p.keyboard.press('Escape');

    // B. Navigate to OrgStructure
    await p.locator('#desktop-nav [data-nav="People"]').click();
    await p.locator('[data-go="OrgStructure"]').first().click();
    await p.locator('#page h1:has-text("Teams & leadership")').waitFor();

    // Expand a group in OrgStructure
    const orgGroup = p.locator('#org-group-journal');
    if (await orgGroup.count() > 0) {
      await orgGroup.evaluate(el => el.open = true);
    }

    // C. Browser Back -> should return to CPS Academy VMRs Page 2
    await p.goBack();
    await p.goBack();
    await p.locator('#page h1:has-text("CPS Academy VMRs")').waitFor();
    await p.waitForTimeout(150);

    paginationText = await p.locator('.pagination span').innerText();
    assert.ok(paginationText.includes('Page 2'), `Expected restored Page 2 after Back navigation: ${paginationText}`);

    // D. Global search from filtered view -> Return restores originating view
    await p.goto(base + '/#' + encodeURIComponent('Research @CPSolvers'));
    await p.locator('#page h1').waitFor();

    // Set filter in Research
    const skillSelect = p.locator('#research-skill-select');
    if (await skillSelect.count() > 0) {
      await skillSelect.selectOption('Data analytics');
      await p.waitForTimeout(100);
    }

    // Type in global search
    const globalSearchInput = p.locator('#global-search');
    await globalSearchInput.fill('cardiology');
    await p.locator('#page h1:has-text("Search the Academy")').waitFor();

    // Verify Return button targets Research @CPSolvers
    const returnBtn = p.locator('#clear-search');
    assert.ok((await returnBtn.innerText()).includes('Research @CPSolvers'), 'Return button must target Research @CPSolvers');
    await returnBtn.click();

    // Verify Research section restored with previous filter
    await p.locator('#page h1:has-text("Research Collaborators")').waitFor();
    if (await skillSelect.count() > 0) {
      const selectedSkill = await p.locator('#research-skill-select').inputValue();
      assert.equal(selectedSkill, 'Data analytics', 'Research skill filter must be preserved after returning from global search');
    }

    // E. Dialog focus return
    const testOpenBtn = p.locator('[data-open]').first();
    await testOpenBtn.focus();
    await testOpenBtn.click();
    await p.locator('#detail-dialog[open]').waitFor();
    await p.keyboard.press('Escape');
    await p.waitForTimeout(50);

    // Verify focus returned to the opening button or detail dialog trigger
    const focusedTag = await p.evaluate(() => document.activeElement?.tagName);
    assert.ok(['BUTTON', 'A', 'SUMMARY'].includes(focusedTag), `Active element after dialog close should be trigger, got: ${focusedTag}`);

    // F. Clear filters resets state
    await p.goto(base + '/#' + encodeURIComponent('CPS Academy VMRs'));
    await p.locator('#page h1').waitFor();
    await p.locator('#next').click();
    await p.locator('.schedule-secondary-filters').evaluate(el=>el.open=true);
    await p.locator('#scope-select').selectOption('Pinned');
    await p.locator('#secondary-clear-btn').click();
    await p.waitForTimeout(100);

    const clearedPagination = await p.locator('.pagination span').innerText();
    assert.ok(clearedPagination.includes('Page 1'), 'Clear filters must reset to Page 1');
    const clearedFilter = await p.locator('#scope-select').inputValue();
    assert.equal(clearedFilter, 'All', 'Clear filters must reset filter to All');

    await ctx.close();
    console.log('browser-browsing-state: all responsive, pagination, back-navigation, global search return, and dialog focus checks passed.');
  } finally {
    await browser.close();
    await new Promise(r => server.close(r));
  }
})();
