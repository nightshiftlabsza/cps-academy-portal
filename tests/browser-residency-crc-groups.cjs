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
    // 1. Responsive checks across 1440, 820, 390, 320px (zero horizontal overflow)
    for (const width of [1440, 820, 390, 320]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));

      // Residency Programs view
      await page.goto(base + '/#Residency%20Programs');
      await page.locator('#page h1').waitFor();
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        `Residency Programs overflow at ${width}px`
      );

      // CRC - retired view
      await page.goto(base + '/#CRC%20-%20retired');
      await page.locator('#page h1').waitFor();
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        `CRC - retired overflow at ${width}px`
      );

      // Active CRC view
      await page.goto(base + '/#CRC');
      await page.locator('#page h1').waitFor();
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        `Active CRC overflow at ${width}px`
      );

      await context.close();
      assert.deepEqual(errors, [], `Errors at ${width}px: ${errors.join(', ')}`);
    }

    // 2. Residency Programs verification at 1440px
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();

    await p.goto(base + '/#Residency%20Programs');
    await p.locator('#page h1').waitFor();

    // Verify 5 month sections rendered in strict workbook order
    const monthNames = await p.locator('.residency-month-name').allInnerTexts();
    assert.deepEqual(monthNames, ['October', 'November', 'December', 'January', 'February']);

    // Verify October has populated session and roles trio
    const octSession = p.locator('.residency-session-card');
    assert.equal(await octSession.count(), 1, 'October must contain exactly 1 session');
    const octText = await octSession.innerText();
    assert.ok(octText.includes('Saturday, 24th at 12:00 pm EST Allegheny Internal Medicine'), 'Date/program text verbatim');
    assert.ok(octText.includes('DISCUSSANT'), 'Discussant role displayed');
    assert.ok(octText.includes('JUNIOR MEMBER'), 'Junior Member role displayed');
    assert.ok(octText.includes('Vini'), 'Facilitator present');

    // Verify remaining 4 months display empty notice verbatim
    const emptyBoxes = p.locator('.empty-month-box');
    assert.equal(await emptyBoxes.count(), 4, 'Four empty month notices expected');
    const emptyNotice = await emptyBoxes.first().innerText();
    assert.ok(emptyNotice.includes('No session entered in this source'), 'Verbatim empty notice');

    // Verify source entries drawer has 5 month headings and 0 calendar buttons on them
    const sourceSummary = p.locator('.residency-source-summary');
    await sourceSummary.click();
    const monthCards = p.locator('.residency-source-cards .hub-card');
    assert.equal(await monthCards.count(), 5, 'Source drawer must contain 5 month headings');
    for (let i = 0; i < 5; i++) {
      const calCount = await monthCards.nth(i).locator('.cal-btn').count();
      assert.equal(calCount, 0, `Month heading ${i} must have 0 calendar buttons`);
    }

    // 3. CRC - retired verification at 1440px
    await p.goto(base + '/#CRC%20-%20retired');
    await p.locator('#page h1').waitFor();

    // Verify 15 rounds chips are present
    const roundChips = p.locator('.crc-round-chip[data-filter-round^="Round"]');
    assert.equal(await roundChips.count(), 15, 'All 15 round chips must be present');

    // Click Round 1 chip and verify filtering
    await roundChips.first().click();
    await p.waitForTimeout(100);
    const round1Rows = await p.locator('.crc-case-row').count();
    assert.equal(round1Rows, 25, 'Round 1 page 1 has 25 substantive cases');
    await p.locator('#show-all-toggle').check();
    await p.waitForTimeout(100);
    const round1AllRows = await p.locator('.crc-case-row').count();
    assert.equal(round1AllRows, 32, 'Round 1 show all displays all 32 substantive cases');

    // Reset to all rounds
    await p.locator('#show-all-toggle').uncheck();
    await p.locator('.crc-round-chip[data-filter-round="all"]').click();
    await p.waitForTimeout(100);

    // Verify pagination controls
    const pagination = p.locator('.pagination');
    assert.ok((await pagination.count()) > 0, 'Pagination controls must exist');

    // 4. Mobile inspection at 390px
    const mobCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mobP = await mobCtx.newPage();
    await mobP.goto(base + '/#CRC%20-%20retired');
    await mobP.locator('#page h1').waitFor();

    // Verify mobile cards are rendered and desktop table is hidden
    assert.equal(await mobP.locator('.crc-table-container').count(), 0, 'Desktop table not rendered on mobile');
    const mobileListVisible = await mobP.locator('.crc-mobile-list').isVisible();
    assert.equal(mobileListVisible, true, 'Mobile list visible on mobile');

    await ctx.close();
    await mobCtx.close();

    // 5. Phase 4 Navigation & CRC Verification
    const navCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const np = await navCtx.newPage();

    // A. Desktop navigation buttons
    await np.goto(base + '/#Home');
    await np.locator('#page h1').waitFor();
    const mrNavBtn = np.locator('#desktop-nav [data-nav="Morning Report"]');
    assert.equal(await mrNavBtn.count(), 1, 'Desktop nav must contain "Morning Report" button');
    assert.equal(await np.locator('#desktop-nav [data-nav="Sessions"]').count(), 0, 'Desktop nav must not contain "Sessions" button');

    // B. Direct link #Sessions redirects to Morning Report
    await np.goto(base + '/#Sessions');
    await np.locator('#page h1').waitFor();
    const currentH1 = await np.locator('#page h1').innerText();
    assert.equal(currentH1, 'Morning Report', 'Direct route #Sessions must redirect to Morning Report');

    // C. Area tabs on Morning Report include both active and retired CRC with consistent labels
    const mrTabs = await np.locator('.area-tabs button').allInnerTexts();
    assert.deepEqual(mrTabs, [
      'Morning Report',
      'CPS Academy VMRs',
      'Special VMRs',
      'Student Forum',
      'Residency Programs',
      'Leader of the Week',
      'Case Review Committee (CRC)',
      'Case Review Committee (CRC) — Retired'
    ], 'Morning Report group must contain all 8 sections with consistent labels');

    // D. People group contains strictly Org Structure and Members
    await np.locator('#desktop-nav [data-nav="People"]').click();
    await np.waitForTimeout(100);
    await np.locator('#page h1').waitFor();
    const peopleH1 = await np.locator('#page h1').innerText();
    assert.equal(peopleH1, 'Org Structure', 'Clicking People must open Org Structure as first/default');
    const peopleTabs = await np.locator('.area-tabs button').allInnerTexts();
    assert.deepEqual(peopleTabs, ['Org Structure', 'Members'], 'People area tabs must contain only Org Structure and Members');

    // E. Navigate to active CRC via tab and verify title
    await np.goto(base + '/#CRC');
    await np.locator('#page h1').waitFor();
    const crcH1 = await np.locator('#page h1').innerText();
    assert.equal(crcH1, 'Case Review Committee (CRC)', 'Active CRC view must display consistent label');

    // F. Navigate to retired CRC via tab and verify title
    await np.goto(base + '/#CRC%20-%20retired');
    await np.locator('#page h1').waitFor();
    const crcRetH1 = await np.locator('#page h1').innerText();
    assert.equal(crcRetH1, 'Case Review Committee (CRC) — Retired', 'Retired CRC view must display consistent label');

    // G. Mobile bottom nav verification
    const mobNavCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mnp = await mobNavCtx.newPage();
    await mnp.goto(base + '/#Home');
    await mnp.locator('#page h1').waitFor();
    const mobMrBtn = mnp.locator('#mobile-nav [data-nav="Morning Report"]');
    assert.equal(await mobMrBtn.count(), 1, 'Mobile nav must have "Morning Report" button');
    assert.equal(await mnp.locator('#mobile-nav [data-nav="Sessions"]').count(), 0, 'Mobile nav must not have "Sessions" button');

    await navCtx.close();
    await mobNavCtx.close();

    console.log('browser-residency-crc-groups: All responsive and functional checks passed successfully.');
  } finally {
    await browser.close();
    await new Promise(r => server.close(r));
  }
})();
