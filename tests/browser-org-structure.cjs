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
    // 1. Check across all 4 responsive viewports
    for (const width of [1440, 820, 390, 320]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));

      await page.goto(base + '/#OrgStructure');
      await page.locator('#page h1').waitFor();

      // Heading and label check
      const h1Text = await page.locator('#page h1').innerText();
      assert.equal(h1Text, 'Teams & leadership', `Expected 'Teams & leadership' heading at ${width}px`);

      // No horizontal document overflow
      const docOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
      assert.ok(docOverflow, `Horizontal overflow detected at ${width}px`);

      await context.close();
      assert.deepEqual(errors, []);
    }

    // 2. Functional & interaction checks at 1440px
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(base + '/#OrgStructure');
    await p.locator('#page h1').waitFor();

    // In-page group index
    const indexChips = await p.locator('.org-index-chip').count();
    assert.equal(indexChips, 7, 'Expected 7 group overview chips in index');

    // Groups exist and stay whole
    const vmrGroup = p.locator('#org-group-vmr');
    assert.equal(await vmrGroup.count(), 1, 'VMR group section must exist');
    const vmrText = await vmrGroup.innerText();
    assert.ok(vmrText.includes('Tuesday VMR'), 'Tuesday VMR must be inside VMR group');
    assert.ok(vmrText.includes('Wednesday VMR'), 'Wednesday VMR must be inside VMR group');
    assert.ok(vmrText.includes('Monday VMR'), 'Monday VMR must be inside VMR group');

    const journalGroup = p.locator('#org-group-journal');
    const journalText = await journalGroup.innerText();
    assert.ok(journalText.includes('Editor in Chief'), 'Editor in Chief must be inside Journal group');
    assert.ok(journalText.includes('Associate Editors'), 'Associate Editors must be inside Journal group');
    assert.ok(journalText.includes('Consulting Editors'), 'Consulting Editors must be inside Journal group');

    // Group heading record accessible through source details
    const vmrHeadingBtn = p.locator('#org-group-vmr .org-heading-btn');
    assert.equal(await vmrHeadingBtn.count(), 1, 'VMR heading button must exist');
    await vmrHeadingBtn.click();
    await p.locator('#detail-dialog[open]').waitFor();
    const dialogTitle = await p.locator('#dialog-title').innerText();
    assert.equal(dialogTitle, 'VMR', 'Heading dialog title should be VMR');
    await p.keyboard.press('Escape');

    // SLS row 36 multiline text complete
    const slsRow = p.locator('.org-row:has-text("Spaced Learning Series (SLS)")');
    assert.equal(await slsRow.count(), 1, 'SLS row must exist');
    const slsText = await slsRow.innerText();
    assert.ok(slsText.includes('Teamlet 1'), 'SLS must contain Teamlet 1');
    assert.ok(slsText.includes('Teamlet 4'), 'SLS must contain Teamlet 4');
    assert.ok(slsText.includes('Jas, Vale, Mukund (audio editor), Elena, Anmol'));

    // In-view search: search "Ravi"
    await p.locator('#org-search-input').fill('Ravi');
    assert.ok(await vmrGroup.evaluate(el => el.open), 'VMR group should auto-open on search');
    const filteredText = await vmrGroup.innerText();
    assert.ok(filteredText.includes('Showing'), 'Filter banner should appear');
    assert.ok(filteredText.includes('Tuesday VMR'), 'Tuesday VMR should match Ravi');

    // Offer full group
    const showFullBtn = p.locator('#org-group-vmr .org-toggle-full-btn');
    assert.ok(await showFullBtn.count() > 0, 'Show full group button must be offered');
    await showFullBtn.click();
    const expandedVmrText = await vmrGroup.innerText();
    assert.ok(expandedVmrText.includes('Monday VMR'), 'Monday VMR should be visible when full group shown');

    // Clear search restores group state
    await p.locator('#org-clear-input').click();
    assert.equal(await p.locator('#org-search-input').inputValue(), '');

    // Keyboard toggle on group section
    const summary = p.locator('#org-group-leadership .org-group-summary');
    assert.ok(await p.locator('#org-group-leadership').evaluate(el => el.open));
    await summary.click();
    assert.ok(!await p.locator('#org-group-leadership').evaluate(el => el.open), 'Click toggles closed');
    await summary.click();
    assert.ok(await p.locator('#org-group-leadership').evaluate(el => el.open), 'Click toggles open');

    // Edit and pin addressing original record ID
    const tuesOpen = p.locator('[data-open="OrgStructure:14"]');
    await tuesOpen.click();
    await p.locator('#detail-dialog[open]').waitFor();
    assert.equal(await p.locator('#dialog-title').innerText(), 'Tuesday VMR');
    await p.keyboard.press('Escape');

    const starBtn = p.locator('[data-star="OrgStructure:14"]');
    await starBtn.click();
    assert.ok(await starBtn.evaluate(el => el.classList.contains('is-starred')), 'Star button toggles active');

    // Global search retains group context
    await p.locator('#global-search').fill('Tuesday VMR');
    await p.locator('.hub-card').first().waitFor();
    const cardText = await p.locator('.hub-card').first().innerText();
    assert.ok(cardText.includes('VMR'), 'Global search card retains parent group context');

    await ctx.close();
    console.log('browser-org-structure: all 1440, 820, 390, 320px responsive, interaction, search, and group checks passed.');
  } finally {
    await browser.close();
    await new Promise(r => server.close(r));
  }
})();
