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

      // Members
      await page.goto(base + '/#Members');
      await page.locator('#page h1').waitFor();
      const memCountText = await page.locator('.results-count').innerText();
      assert.ok(memCountText.includes('148 named member rows (4 cohorts)'), `Members count mismatch at ${width}px: ${memCountText}`);
      assert.ok(memCountText.includes('6 structural entries'), `Members structural count mismatch at ${width}px: ${memCountText}`);
      assert.ok(memCountText.includes('154 total records'), `Members total mismatch at ${width}px: ${memCountText}`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Members overflow at ${width}px`);

      // Residency Programs
      await page.goto(base + '/#Residency%20Programs');
      await page.locator('#page h1').waitFor();
      const resCountText = await page.locator('.results-count').innerText();
      assert.ok(resCountText.includes('1 session'), `Residency count mismatch at ${width}px: ${resCountText}`);
      assert.ok(resCountText.includes('5 month labels'), `Residency month count mismatch at ${width}px: ${resCountText}`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Residency overflow at ${width}px`);

      // CRC - retired
      await page.goto(base + '/#CRC%20-%20retired');
      await page.locator('#page h1').waitFor();
      const crcCountText = await page.locator('.results-count').innerText();
      assert.ok(crcCountText.includes('400 cases'), `CRC cases mismatch at ${width}px: ${crcCountText}`);
      assert.ok(crcCountText.includes('15 round headings'), `CRC rounds mismatch at ${width}px: ${crcCountText}`);
      assert.ok(crcCountText.includes('2 placeholders'), `CRC placeholders mismatch at ${width}px: ${crcCountText}`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `CRC overflow at ${width}px`);

      await context.close();
      assert.deepEqual(errors, []);
    }

    // 2. Functional & Interaction checks at 1440px
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();

    // Members cohorts & structural tags
    await p.goto(base + '/#Members');
    await p.locator('#page h1').waitFor();

    // Verify cohort chips exist on page
    const cohortChips = await p.locator('.tag:has-text("Participants"), .tag:has-text("Core team"), .tag:has-text("Leaders")').count();
    assert.ok(cohortChips > 0, 'Cohort chips must be visible on Members cards');

    // Filter by searching "Leaders"
    await p.locator('#global-search').fill('Leaders');
    await p.locator('#page h1:has-text("Search the Academy")').waitFor();
    const leaderCards = await p.locator('.hub-card:has-text("Leaders")').count();
    assert.ok(leaderCards > 0, 'Matching leader cards must be displayed');

    // Clear search and return to Members
    await p.locator('#global-search').fill('');
    await p.locator('#page h1:has-text("Members")').waitFor();
    assert.equal(await p.locator('#global-search').inputValue(), '');

    // Residency Programs: verify calendar buttons omitted for month headings
    await p.goto(base + '/#Residency%20Programs');
    await p.locator('#page h1').waitFor();
    const headingCard = p.locator('.hub-card:has-text("Month heading")');
    assert.ok((await headingCard.count()) >= 1, 'Month heading card must exist');
    const calBtnsOnHeading = await headingCard.first().locator('.cal-btn').count();
    assert.equal(calBtnsOnHeading, 0, 'Calendar button must not appear on month heading card');

    // CRC - retired: check placeholders and dynamic edit promotion
    await p.goto(base + '/#CRC%20-%20retired');
    await p.locator('#page h1').waitFor();

    // Verify round heading on page 1
    const roundHeadingCard = p.locator('.hub-card:has-text("Round boundary")');
    assert.ok((await roundHeadingCard.count()) >= 1, 'Round heading card must exist on page 1');

    // Switch to Show all to inspect trailing placeholders at rows 418-419
    await p.locator('#show-all-toggle').check();
    await p.waitForTimeout(200);

    const placeholderCard = p.locator('.hub-card:has-text("Template placeholder")');
    assert.ok((await placeholderCard.count()) >= 1, 'Placeholder card must exist');

    // Open detail dialog on placeholder 418
    const editBtn = p.locator('[data-open="CRC - retired:418"]');
    await editBtn.click();
    await p.locator('#detail-dialog[open]').waitFor();

    // Fill Mentee field and save
    const menteeInput = p.locator('#dialog-content [data-field="MENTEE"]');
    await menteeInput.fill('Dr. Jane Specialist');
    await p.locator('#dialog-primary').click();

    // Card should now display dynamic promotion badge
    await p.locator('.hub-card:has-text("Dr. Jane Specialist")').waitFor();
    const promotedCard = p.locator('.hub-card:has-text("Dr. Jane Specialist")');
    const promotedBadge = await promotedCard.locator('.local-chip:has-text("Locally edited from placeholder")').count();
    assert.equal(promotedBadge, 1, 'Promoted card must display locally edited from placeholder chip');

    // Verify count reflects 401 cases and 1 placeholder
    const updatedCrcCount = await p.locator('.results-count').innerText();
    assert.ok(updatedCrcCount.includes('401 cases'), `Count should reflect 401 cases: ${updatedCrcCount}`);
    assert.ok(updatedCrcCount.includes('1 placeholders') || updatedCrcCount.includes('1 placeholder'), `Count should reflect 1 placeholder: ${updatedCrcCount}`);

    await ctx.close();
    console.log('browser-classification: all 1440, 820, 390, 320px responsive, cohort, heading, placeholder, and dynamic promotion checks passed.');
  } finally {
    await browser.close();
    await new Promise(r => server.close(r));
  }
})();
