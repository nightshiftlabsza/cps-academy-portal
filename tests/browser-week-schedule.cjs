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
    // 1. Desktop verification (1440px)
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const p = await context.newPage();
      const errors = [];
      p.on('pageerror', e => errors.push(e.message));

      await p.goto(base + '/#Morning%20Report');
      await p.locator('#page h1').waitFor();

      // Verify Week navigator renders
      assert.ok(await p.locator('.schedule-week-navigator').count() > 0, 'Week navigator must render in Morning Report');

      // Verify Convention notice
      const conventionText = await p.locator('.schedule-week-navigator').innerText();
      assert.match(conventionText, /Monday to Sunday/i, 'Convention note must be visible');
      assert.match(conventionText, /Mon–Sun \(UTC\)/i, 'Convention badge must be visible');

      // Check Prev / Next / This Week navigation
      const initialTitle = await p.locator('#week-nav-title').innerText();
      assert.ok(initialTitle.startsWith('Week of '), `Title must start with Week of: ${initialTitle}`);

      // Click Next week
      await p.locator('#week-nav-next').click();
      await p.waitForTimeout(60);
      const nextTitle = await p.locator('#week-nav-title').innerText();
      assert.notEqual(nextTitle, initialTitle, 'Next week must shift visible week');

      // Click Prev week
      await p.locator('#week-nav-prev').click();
      await p.waitForTimeout(60);
      const restoredTitle = await p.locator('#week-nav-title').innerText();
      assert.equal(restoredTitle, initialTitle, 'Prev week must return to initial week');

      // Jump to specific date containing split Row 12 (2026-10-26)
      await p.locator('#week-jump-date').fill('2026-10-26');
      await p.locator('#week-jump-date').dispatchEvent('change');
      await p.waitForTimeout(100);

      const jumpedTitle = await p.locator('#week-nav-title').innerText();
      assert.match(jumpedTitle, /Oct 26/i, `Jump to date must select Oct 26 week: ${jumpedTitle}`);

      // Verify Row 12 split child sessions are present
      const r12a = p.locator('[data-open="Morning Report:12::session:1"]');
      const r12b = p.locator('[data-open="Morning Report:12::session:2"]');
      assert.ok(await r12a.count() > 0, 'Child session 1 of row 12 must be visible');
      assert.ok(await r12b.count() > 0, 'Child session 2 of row 12 must be visible');

      // Switch to All history
      await p.locator('[data-schedule-scope="all"]').click();
      await p.waitForTimeout(100);
      const allText = await p.locator('#results-count-announcer').innerText();
      assert.match(allText, /All history \(2020 – 2026\)/i, 'All history announcement must be visible');

      // Switch to Unresolved dates
      await p.locator('[data-schedule-scope="unresolved"]').click();
      await p.waitForTimeout(100);
      const unresText = await p.locator('#results-count-announcer').innerText();
      assert.match(unresText, /Unresolved source dates/i, 'Unresolved source dates view active');
      assert.ok(await p.locator('[data-open="Morning Report:1830"]').count() > 0, 'Row 1830 #VALUE! must be visible in unresolved view');

      // Test Hash Routing: direct deep link to a specific week
      await p.goto(base + '/#Morning%20Report/week/2026-10-26');
      await p.waitForTimeout(100);
      const hashJumpTitle = await p.locator('#week-nav-title').innerText();
      assert.match(hashJumpTitle, /Oct 26/i, `Hash deep link must load Oct 26 week: ${hashJumpTitle}`);

      // Deep link to unresolved
      await p.goto(base + '/#Morning%20Report/unresolved');
      await p.waitForTimeout(100);
      assert.match(await p.locator('#results-count-announcer').innerText(), /Unresolved source dates/i);

      // Deep link to history
      await p.goto(base + '/#Morning%20Report/history');
      await p.waitForTimeout(100);
      assert.match(await p.locator('#results-count-announcer').innerText(), /All history/i);

      assert.deepEqual(errors, []);
      await context.close();
      console.log('✓ Desktop week navigation, convention notice, jump to date, and deep links passed');
    }

    // 2. Mobile verification (390px)
    {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const p = await context.newPage();
      const errors = [];
      p.on('pageerror', e => errors.push(e.message));

      await p.goto(base + '/#Morning%20Report');
      await p.locator('#page h1').waitFor();

      // Mobile defaults to agenda view
      assert.ok(await p.locator('.agenda-view').count() > 0, 'Mobile must default to agenda view');
      assert.equal(await p.locator('.matrix-table').count(), 0, 'Mobile must not render matrix table');

      // Jump to week with sessions (2026-10-26)
      await p.locator('#week-jump-date').fill('2026-10-26');
      await p.locator('#week-jump-date').dispatchEvent('change');
      await p.waitForTimeout(100);

      // Verify daily grouping
      assert.ok(await p.locator('.agenda-day-group').count() > 0, 'Daily groups must render in agenda view');
      assert.ok(await p.locator('.agenda-day-head').count() > 0, 'Day headers must render with weekday/date');

      // Verify no horizontal overflow
      const docOverflow = await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
      assert.ok(docOverflow, '390px mobile viewport must not have horizontal scroll');

      // Touch target heights on week navigator controls
      const prevBox = await p.locator('#week-nav-prev').boundingBox();
      assert.ok(prevBox.height >= 40, `Touch target height for Prev week must be >= 40px, got ${prevBox.height}`);

      // Interactive claim button in agenda card
      const gapBtn = p.locator('.gap-action-btn').first();
      if (await gapBtn.count()) {
        await gapBtn.click();
        await p.waitForTimeout(100);
        const dialogOpen = await p.locator('#quick-claim-dialog[open], #detail-dialog[open]').count();
        assert.ok(dialogOpen > 0 || await p.locator('#toast.show').count() > 0, 'Gap button must be directly interactive');
      }

      assert.deepEqual(errors, []);
      await context.close();
      console.log('✓ Mobile agenda daily grouping, touch targets, and gap interactions passed');
    }

    console.log('All Prompt 10 browser verification assertions passed successfully.');
  } finally {
    await browser.close();
    server.close();
  }
})();
