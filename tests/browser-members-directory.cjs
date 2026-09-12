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
    // 1. Responsive checks across 1440, 820, 390, 320px
    for (const width of [1440, 820, 390, 320]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));

      await page.goto(base + '/#Members');
      await page.locator('#page h1').waitFor();

      // Heading and results count checks
      const h1Text = await page.locator('#page h1').innerText();
      assert.equal(h1Text, 'Members', `Expected 'Members' heading at ${width}px`);

      const memCountText = await page.locator('.results-count').innerText();
      assert.ok(memCountText.includes('148 named member rows (4 cohorts)'), `Count mismatch at ${width}px: ${memCountText}`);
      assert.ok(memCountText.includes('6 structural entries'), `Structural count mismatch at ${width}px: ${memCountText}`);
      assert.ok(memCountText.includes('154 total records'), `Total records mismatch at ${width}px: ${memCountText}`);

      // No horizontal overflow
      const docOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
      assert.ok(docOverflow, `Horizontal overflow detected at ${width}px: scrollWidth=${await page.evaluate(() => document.documentElement.scrollWidth)}, innerWidth=${width}`);

      await context.close();
      assert.deepEqual(errors, []);
    }

    // 2. Functional & Interaction checks at 1440px
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(base + '/#Members');
    await p.locator('#page h1').waitFor();

    // Overview index chips
    const indexChips = p.locator('.member-index-chip');
    assert.equal(await indexChips.count(), 6, 'Expected 6 overview chips (All, 4 cohorts, Source headings)');

    // Verify 4 cohorts exist
    const partSection = p.locator('#member-cohort-participants');
    const coreSection = p.locator('#member-cohort-core');
    const leadersSection = p.locator('#member-cohort-leaders');
    const inactiveSection = p.locator('#member-cohort-inactive');

    assert.equal(await partSection.count(), 1, 'Participants cohort section must exist');
    assert.equal(await coreSection.count(), 1, 'Core team cohort section must exist');
    assert.equal(await leadersSection.count(), 1, 'Leaders cohort section must exist');
    assert.equal(await inactiveSection.count(), 1, 'Marked inactive cohort section must exist');

    // Source heading buttons on cohort headers
    const coreHeadingBtn = p.locator('#member-cohort-core .member-heading-btn');
    assert.equal(await coreHeadingBtn.count(), 1, 'Core team must link to source heading');
    await coreHeadingBtn.click();
    await p.locator('#detail-dialog[open]').waitFor();
    const dialogTitle = await p.locator('#dialog-title').innerText();
    assert.equal(dialogTitle, 'Core team members', 'Dialog title must match heading record');
    await p.keyboard.press('Escape');

    // In-view name search: "Julia"
    const searchInput = p.locator('#member-search-input');
    await searchInput.fill('Julia');
    await p.waitForTimeout(100);

    const inactiveText = await inactiveSection.innerText();
    assert.ok(inactiveText.includes('Julia Schlender'), 'Search should locate Julia Schlender in inactive cohort');
    const resultsCountSearch = await p.locator('.results-count').innerText();
    assert.ok(resultsCountSearch.includes('Showing'), 'Results count must indicate filtered results');

    // Clear search
    await p.locator('#member-clear-input').click();
    assert.equal(await searchInput.inputValue(), '');

    // Cohort filter dropdown: select Leaders
    await p.locator('#member-cohort-select').selectOption('Leaders');
    const leadersFilteredCount = await p.locator('.results-count').innerText();
    assert.ok(leadersFilteredCount.includes('Showing 36 named rows'), `Expected 36 Leaders: ${leadersFilteredCount}`);

    // Reset filters
    await p.locator('#member-reset-filters').click();
    assert.equal(await p.locator('#member-cohort-select').inputValue(), 'all');

    // Country filter: select Spain
    await p.locator('#member-country-select').selectOption('Spain');
    const spainFilteredCount = await p.locator('.results-count').innerText();
    assert.ok(spainFilteredCount.includes('Showing'), 'Filtered count line should appear for Spain');
    await p.locator('#member-reset-filters').click();

    // Sort order: Name A–Z
    await p.locator('#member-sort-select').selectOption('az');
    const azNav = p.locator('.member-az-nav');
    assert.equal(await azNav.count(), 1, 'A–Z jump navigation must appear');
    await p.locator('#member-sort-select').selectOption('source');

    // Star/Pin toggle
    const starBtn = p.locator('[data-star="Members:57"]').first();
    await starBtn.click();
    assert.ok(await starBtn.evaluate(el => el.classList.contains('is-starred')), 'Star button toggles active');

    // Find this name in teams button
    const findInTeamsBtn = p.locator('.find-in-teams-btn[data-member-name="Marino Rodriguez"]').first();
    assert.equal(await findInTeamsBtn.count(), 1, 'Find in teams button must exist');
    await findInTeamsBtn.click();

    // Verifies navigation to Teams & leadership with search query prefilled
    await p.locator('#page h1:has-text("Teams & leadership")').waitFor();
    const orgQuery = await p.locator('#org-search-input').inputValue();
    assert.equal(orgQuery, 'Marino Rodriguez', 'Find in teams pre-fills exact name query in OrgStructure');

    // Return to Members and verify structural drawer
    await p.goto(base + '/#Members');
    await p.locator('#page h1:has-text("Members")').waitFor();
    await p.locator('#toggle-structural-btn').click();
    const drawer = p.locator('#member-structural-drawer');
    assert.ok(await drawer.evaluate(el => el.open), 'Structural drawer toggles open');
    const drawerText = await drawer.innerText();
    assert.ok(drawerText.includes('Row 80'), 'Drawer includes Row 80');
    assert.ok(drawerText.includes('Row 82'), 'Drawer includes Row 82');
    assert.ok(drawerText.includes('Row 146'), 'Drawer includes Row 146');
    assert.ok(drawerText.includes('Row 148'), 'Drawer includes Row 148');
    assert.ok(drawerText.includes('Row 189'), 'Drawer includes Row 189');
    assert.ok(drawerText.includes('Row 191'), 'Drawer includes Row 191');

    await ctx.close();
    console.log('browser-members-directory: all 1440, 820, 390, 320px responsive, cohort, heading, search, filter, and cross-reference checks passed.');
  } finally {
    await browser.close();
    await new Promise(r => server.close(r));
  }
})();
