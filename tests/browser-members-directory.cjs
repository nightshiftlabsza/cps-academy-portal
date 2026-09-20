'use strict';
const assert = require('node:assert/strict');
const { createServer } = require('../scripts/serve.cjs');
const workbook = require('../workbook.json');
const { injectAuth } = require('./test-auth-helper.cjs');
const { launchBrowser } = require('./test-browser-helper.cjs');

(async () => {
  const server = createServer();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await launchBrowser({ headless: true });
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    // 1. Responsive checks across 1440, 820, 390, 320px
    for (const width of [1440, 820, 390, 320]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await injectAuth(context, 'mock');
      await context.route('**/api/sync', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ schemaVersion: 1, workbook })
      }));
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

      // Confirm all eight fields remain visible on mobile
      if (width === 390) {
        const sampleCard = page.locator('.member-row').first();
        const expectedFields = [
          '.td-name',
          '.td-sponsor',
          '.td-social',
          '.td-country',
          '.td-birthday',
          '.td-email',
          '.td-location',
          '.td-training'
        ];
        for (const selector of expectedFields) {
          const el = sampleCard.locator(selector);
          assert.equal(await el.count(), 1, `${selector} must exist on mobile card`);
          assert.ok(await el.isVisible(), `${selector} must be visible on mobile card`);
        }
      }

      await context.close();
      assert.deepEqual(errors, []);
    }

    // 2. Functional & Interaction checks at 1440px
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await injectAuth(ctx, 'mock');
    await ctx.route('**/api/sync', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ schemaVersion: 1, workbook })
    }));
    const p = await ctx.newPage();
    await p.goto(base + '/#Members');
    await p.locator('#page h1').waitFor();

    // Verify 4 cohort section headers exist in continuous table
    const partSection = p.locator('#cohort-participants');
    const coreSection = p.locator('#cohort-core');
    const leadersSection = p.locator('#cohort-leaders');
    const inactiveSection = p.locator('#cohort-inactive');

    assert.equal(await partSection.count(), 1, 'Participants cohort header must exist');
    assert.equal(await coreSection.count(), 1, 'Core team cohort header must exist');
    assert.equal(await leadersSection.count(), 1, 'Leaders cohort header must exist');
    assert.equal(await inactiveSection.count(), 1, 'Marked inactive cohort header must exist');

    // Verify exact cohort member counts in DOM
    const memberRows = p.locator('.member-row');
    assert.equal(await memberRows.count(), 148, 'Must render exactly 148 visible substantive member rows');

    // Verify all 6 structural records are excluded from visible directory
    const structuralIds = ['Members:80', 'Members:82', 'Members:146', 'Members:148', 'Members:189', 'Members:191'];
    for (const sid of structuralIds) {
      assert.equal(await p.locator(`.member-row[data-id="${sid}"]`).count(), 0, `${sid} must be excluded from table rows`);
    }

    // Verify legacy controls are completely gone
    assert.equal(await p.locator('#member-cohort-select').count(), 0, 'No cohort dropdown filter wall');
    assert.equal(await p.locator('#member-country-select').count(), 0, 'No country dropdown filter wall');
    assert.equal(await p.locator('#member-sort-select').count(), 0, 'No sort dropdown filter wall');
    assert.equal(await p.locator('.member-index-chip').count(), 0, 'No legacy index chips');
    assert.equal(await p.locator('#prev, #next, .pagination').count(), 0, 'No pagination');
    assert.equal(await p.locator('[data-star]').count(), 0, 'No stars');
    assert.equal(await p.locator('.member-actions-wrap, th:has-text("Action")').count(), 0, 'No Action column');
    assert.equal(await p.locator('button:has-text("Open details")').count(), 0, 'No repeated Open details buttons');

    // Verify 8 column headers
    const ths = p.locator('.member-table thead th');
    assert.equal(await ths.count(), 8, 'Must have exactly 8 desktop columns');
    const thTexts = (await ths.allInnerTexts()).map(t => t.toLowerCase());
    assert.ok(thTexts.some(t => t.includes('name')));
    assert.ok(thTexts.some(t => t.includes('sponsor')));
    assert.ok(thTexts.some(t => t.includes('social handles')));
    assert.ok(thTexts.some(t => t.includes('country of origin')));
    assert.ok(thTexts.some(t => t.includes('birthday')));
    assert.ok(thTexts.some(t => t.includes('email')));
    assert.ok(thTexts.some(t => t.includes('location / home')));
    assert.ok(thTexts.some(t => t.includes('training / specialty')));

    // Birthday sorting: ascending and descending order, missing values at bottom
    const bdayHeader = p.locator('.sortable-th[data-sort="Birthday"]');
    await bdayHeader.click();
    await p.waitForTimeout(150);

    const partRowsAsc = p.locator('#cohort-participants ~ tr.member-row');
    const partCount = 15;
    const firstPartBdayAsc = await partRowsAsc.first().locator('.td-birthday').innerText();
    const lastPartBdayAsc = await partRowsAsc.nth(partCount - 1).locator('.td-birthday').innerText();
    assert.equal(lastPartBdayAsc, '—', 'Missing birthday must sort to bottom of cohort in ascending sort');

    await bdayHeader.click();
    await p.waitForTimeout(150);

    const partRowsDesc = p.locator('#cohort-participants ~ tr.member-row');
    const firstPartBdayDesc = await partRowsDesc.first().locator('.td-birthday').innerText();
    const lastPartBdayDesc = await partRowsDesc.nth(partCount - 1).locator('.td-birthday').innerText();
    assert.notEqual(firstPartBdayAsc, firstPartBdayDesc, 'Descending sort must invert dates relative to ascending sort');
    assert.equal(lastPartBdayDesc, '—', 'Missing birthday must remain at bottom of cohort in descending sort');

    // Reset sort by clicking Name
    const nameHeader = p.locator('.sortable-th[data-sort="Name"]');
    await nameHeader.click();
    await p.waitForTimeout(100);

    // In-view search: "Julia"
    const searchInput = p.locator('#member-search-input');
    await searchInput.fill('Julia');
    await p.waitForTimeout(100);

    const filteredRowCount = await p.locator('.member-row').count();
    assert.ok(filteredRowCount > 0 && filteredRowCount < 148, 'Search should reduce visible rows');
    const tableText = await p.locator('#member-directory-table').innerText();
    assert.ok(tableText.includes('Julia Schlender'), 'Search locates Julia Schlender');
    const resultsCountSearch = await p.locator('.results-count').innerText();
    assert.ok(resultsCountSearch.includes('Julia'), 'Results meta reflects search query');

    // Search preservation: closing detail modal preserves search query and filtered count
    const juliaBtn = p.locator('.member-name-btn').first();
    await juliaBtn.click();
    await p.locator('#detail-dialog[open]').waitFor();
    await p.keyboard.press('Escape');
    await p.waitForTimeout(100);

    assert.equal(await searchInput.inputValue(), 'Julia', 'Search query preserved after closing detail modal');
    assert.equal(await p.locator('.member-row').count(), filteredRowCount, 'Filtered row count preserved after closing modal');

    // Search preservation: saving an edit preserves search query and filtered count
    await juliaBtn.click();
    await p.locator('#detail-dialog[open]').waitFor();
    await p.locator('#edit-record-btn').click();
    await p.locator('#dialog-primary').waitFor();
    await p.locator('#dialog-primary').click();
    await p.waitForTimeout(150);

    assert.equal(await searchInput.inputValue(), 'Julia', 'Search query preserved after saving record');
    assert.equal(await p.locator('.member-row').count(), filteredRowCount, 'Filtered row count preserved after saving record');

    // Clear search
    await p.locator('#member-clear-input').click();
    assert.equal(await searchInput.inputValue(), '');
    assert.equal(await p.locator('.member-row').count(), 148, 'Clearing search restores 148 rows');

    // Scroll preservation: closing details preserves scroll position
    await p.evaluate(() => window.scrollTo(0, 1000));
    await p.waitForTimeout(100);

    const scrolledMemberBtn = p.locator('.member-row .member-name-btn').nth(25);
    await scrolledMemberBtn.click();
    await p.locator('#detail-dialog[open]').waitFor();
    const scrollWhenOpened = await p.evaluate(() => window.scrollY);
    assert.ok(scrollWhenOpened > 800, 'Page must be scrolled down when modal opened');

    await p.keyboard.press('Escape');
    await p.waitForTimeout(100);

    const scrollAfterClose = await p.evaluate(() => window.scrollY);
    assert.ok(Math.abs(scrollAfterClose - scrollWhenOpened) < 50, `Scroll preserved on modal close: opened=${scrollWhenOpened}, afterClose=${scrollAfterClose}`);

    // Scroll preservation after saving an edit
    await scrolledMemberBtn.click();
    await p.locator('#detail-dialog[open]').waitFor();
    const scrollBeforeSave = await p.evaluate(() => window.scrollY);
    await p.locator('#edit-record-btn').click();
    await p.locator('#dialog-primary').waitFor();
    await p.locator('#dialog-primary').click();
    await p.waitForTimeout(150);

    const scrollAfterSave = await p.evaluate(() => window.scrollY);
    assert.ok(Math.abs(scrollAfterSave - scrollBeforeSave) < 50, `Scroll preserved after saving: beforeSave=${scrollBeforeSave}, afterSave=${scrollAfterSave}`);

    // Interaction: clicking member Name opens details modal
    const firstMemberBtn = p.locator('.member-name-btn').first();
    const firstName = (await firstMemberBtn.innerText()).trim();
    await firstMemberBtn.click();
    await p.locator('#detail-dialog[open]').waitFor();

    const dialogTitle = await p.locator('#dialog-title').innerText();
    assert.ok(dialogTitle.includes(firstName), `Dialog title must include ${firstName}`);

    const editBtn = p.locator('#edit-record-btn');
    assert.equal(await editBtn.innerText(), 'Edit member', 'Modal button must be labeled "Edit member"');

    // Verify detail labels in modal
    const modalText = (await p.locator('#dialog-content').innerText()).toLowerCase();
    assert.ok(modalText.includes('country of origin'), 'Modal displays Country of origin');
    assert.ok(modalText.includes('training / specialty'), 'Modal displays Training / specialty');
    assert.ok(modalText.includes('location / home'), 'Modal displays Location / home');
    assert.ok(modalText.includes('birthday'), 'Modal displays Birthday');

    await p.keyboard.press('Escape');
    await p.waitForTimeout(100);

    // Edit a member, save, reload, and verify persistence
    const targetMemberBtn = p.locator('.member-row[data-id="Members:57"] .member-name-btn');
    await targetMemberBtn.click();
    await p.locator('#detail-dialog[open]').waitFor();

    await p.locator('#edit-record-btn').click();
    await p.locator('#dialog-primary').waitFor();

    const locInput = p.locator('#dialog-content [data-field="Location"]');
    await locInput.fill('Chicago, IL (Verified Local Edit)');
    await p.locator('#dialog-primary').click();
    await p.waitForTimeout(200);

    const updatedRow = p.locator('.member-row[data-id="Members:57"]');
    assert.ok(await updatedRow.locator('.local-chip').count() > 0, 'Local changes chip present before reload');
    assert.ok((await updatedRow.locator('.td-location').innerText()).includes('Verified Local Edit'), 'Updated location present before reload');

    // Reload page and verify persistence
    await p.reload();
    await p.locator('#page h1').waitFor();
    const reloadedRow = p.locator('.member-row[data-id="Members:57"]');
    assert.ok(await reloadedRow.locator('.local-chip').count() > 0, 'Local changes chip persists after reload');
    assert.ok((await reloadedRow.locator('.td-location').innerText()).includes('Verified Local Edit'), 'Edited location persists after reload');

    // Clean up test edit by restoring original workbook values
    await reloadedRow.locator('.member-name-btn').click();
    await p.locator('#detail-dialog[open]').waitFor();
    await p.locator('#edit-record-btn').click();
    await p.locator('#restore-record').waitFor();
    await p.locator('#restore-record').click();
    await p.locator('#confirm-restore').click();
    await p.waitForTimeout(200);

    await ctx.close();
    console.log('browser-members-directory: all 1440, 820, 390, 320px responsive, cohort, heading, search, filter, birthday sorting, edit persistence, scroll preservation, and mobile field checks passed.');
  } finally {
    await browser.close();
    await new Promise(r => server.close(r));
  }
})();
