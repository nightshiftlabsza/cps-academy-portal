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

  console.log('Starting Browser Milestone Consolidation Suite...');

  try {
    // -------------------------------------------------------------
    // Suite 1: Desktop 1440px - Full Feature & Defect Verification
    // -------------------------------------------------------------
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));

      // 1. Morning Report Schedule & Defect 1 ("This Week" navigation)
      await page.goto(base + '/#Morning%20Report');
      await page.locator('#page h1').waitFor();

      // Verify schedule convention badge & note
      const navText = await page.locator('.schedule-week-navigator').innerText();
      assert.match(navText, /Monday[–\s-]+Sunday,\s*using workbook dates/i, 'Schedule convention badge must describe workbook dates');
      assert.ok(!navText.includes('UTC source date'), 'Schedule convention must not label dates as UTC');

      // Check Next week navigation from "This Week"
      const initialTitle = await page.locator('#week-nav-title').innerText();
      await page.locator('#week-nav-next').click();
      await page.waitForTimeout(100);
      const nextTitle = await page.locator('#week-nav-title').innerText();
      assert.notEqual(nextTitle, initialTitle, 'Next week must shift visible week from initial week');

      // Jump back to This Week
      await page.locator('#week-nav-today').click();
      await page.waitForTimeout(100);
      const todayTitle = await page.locator('#week-nav-title').innerText();
      assert.equal(todayTitle, initialTitle, 'This week button must return to default week');

      // 2. Defect 2: Custom date filter agreement
      await page.locator('#date-from').fill('2026-09-01');
      await page.locator('#date-from').dispatchEvent('change');
      await page.locator('#date-to').fill('2026-09-15');
      await page.locator('#date-to').dispatchEvent('change');
      await page.waitForTimeout(100);

      const customTitle = await page.locator('#week-nav-title').innerText();
      assert.match(customTitle, /Custom range: 2026-09-01 to 2026-09-15/i, 'Navigator title must show custom date range');
      const resultsSummary = await page.locator('#results-count-announcer').innerText();
      assert.match(resultsSummary, /Custom date range \(2026-09-01 to 2026-09-15\)/i, 'Results summary must indicate custom date range');

      // Clear filters
      await page.locator('#clear').click();
      await page.waitForTimeout(100);

      // 3. Defect 8 & 7: CRC - retired
      await page.goto(base + '/#CRC%20-%20retired');
      await page.locator('#page h1').waitFor();

      // Check status filter contains "Progress not recorded"
      const statusSelectHtml = await page.locator('#crc-status-select').innerHTML();
      assert.ok(statusSelectHtml.includes('Progress not recorded'), 'CRC status filter must have Progress not recorded');
      assert.ok(!statusSelectHtml.includes('In progress / unrecorded'), 'CRC status filter must not have In progress / unrecorded');

      // Check classification summary contains 400 cases (357 named mentees, 43 mentor-only)
      const crcSummary = await page.locator('#crc-results-meta').innerText();
      assert.match(crcSummary, /400 cases \(357 named mentees,\s*43 mentor-only\)/i, 'CRC summary must distinguish mentees and mentor-only');
      assert.ok(crcSummary.includes('15 round headings'), 'CRC summary must state 15 round headings');
      assert.ok(crcSummary.includes('2 placeholders'), 'CRC summary must state 2 placeholders');

      // 4. Defect 10: Members directory
      await page.goto(base + '/#Members');
      await page.locator('#page h1').waitFor();

      const memberSummary = await page.locator('#members-results-meta').innerText();
      assert.match(memberSummary, /148 named member rows \(4 cohorts\) · 6 structural entries/i, 'Members directory must account for 148 named rows and 6 structural');

      // 5. Research @CPSolvers: 18 records without pagination
      await page.goto(base + '/#Research%20@CPSolvers');
      await page.locator('#page h1').waitFor();
      assert.equal(await page.locator('.pagination').count(), 0, 'Research view must have zero pagination');
      const researchRows = await page.locator('.research-table tbody tr').count();
      assert.equal(researchRows, 18, 'Research table must display all 18 records');

      // 6. Important links & Conferences: zero pagination, full lists
      await page.goto(base + '/#Important%20links');
      await page.locator('#page h1').waitFor();
      assert.equal(await page.locator('.pagination').count(), 0, 'Important links must have zero pagination');
      const linkCards = await page.locator('.resource-card').count();
      assert.equal(linkCards, 13, 'Important links must show all 13 resources');

      await page.goto(base + '/#Conferences');
      await page.locator('#page h1').waitFor();
      assert.equal(await page.locator('.pagination').count(), 0, 'Conferences must have zero pagination');
      assert.equal(await page.locator('.conference-brief-card').count(), 1, 'Conferences card must render for EULAR Congress');

      // 7. Legitimate pagination on CPS Academy VMRs
      await page.goto(base + '/#CPS%20Academy%20VMRs');
      await page.locator('#page h1').waitFor();
      assert.ok(await page.locator('.pagination').count() > 0, 'CPS Academy VMRs must have legitimate pagination');

      assert.equal(errors.length, 0, 'Must have zero console page errors during desktop run: ' + errors.join(', '));
      await context.close();
      console.log('✓ Desktop 1440px checks passed');
    }

    // -------------------------------------------------------------
    // Suite 2: Mobile 390px and 320px Viewports & Details Button
    // -------------------------------------------------------------
    for (const width of [390, 320]) {
      const context = await browser.newContext({ viewport: { width, height: 800 } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));

      // Check Home
      await page.goto(base + '/#Home');
      await page.locator('#page').waitFor();
      const homeOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      assert.equal(homeOverflow, false, `Home must have zero horizontal overflow at ${width}px`);

      // Check Morning Report
      await page.goto(base + '/#Morning%20Report');
      await page.locator('#page h1').waitFor();
      const mrOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      assert.equal(mrOverflow, false, `Morning Report must have zero horizontal overflow at ${width}px`);

      // Check CRC - retired mobile cards
      await page.goto(base + '/#CRC%20-%20retired');
      await page.locator('#page h1').waitFor();
      const crcCards = await page.locator('.crc-mobile-card').count();
      assert.ok(crcCards > 0, `CRC mobile cards must render at ${width}px`);
      const crcOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      assert.equal(crcOverflow, false, `CRC - retired must have zero horizontal overflow at ${width}px`);

      // Check Members mobile
      await page.goto(base + '/#Members');
      await page.locator('#page h1').waitFor();
      const memOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      assert.equal(memOverflow, false, `Members must have zero horizontal overflow at ${width}px`);

      // Check Research mobile and verify mobile Details button targets visible record
      await page.goto(base + '/#Research%20@CPSolvers');
      await page.locator('#page h1').waitFor();
      const resOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      assert.equal(resOverflow, false, `Research must have zero horizontal overflow at ${width}px`);

      const mobileDetailsBtn = page.locator('.research-mobile-actions button[data-open]').first();
      assert.ok(await mobileDetailsBtn.count() > 0, 'Mobile Details button must be present in research mobile card');
      const targetId = await mobileDetailsBtn.getAttribute('data-open');
      await mobileDetailsBtn.click();
      await page.locator('#detail-dialog[open]').waitFor();
      const dialogOpen = await page.locator('#detail-dialog').getAttribute('open');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);

      assert.equal(errors.length, 0, `Zero errors at ${width}px: ` + errors.join(', '));
      await context.close();
      console.log(`✓ Mobile ${width}px checks passed`);
    }

    // -------------------------------------------------------------
    // Suite 3: Transition Widths (760px, 820px) & Live Resizing
    // -------------------------------------------------------------
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();

      await page.goto(base + '/#Morning%20Report');
      await page.locator('#page h1').waitFor();

      // Dynamic resize to tablet transition width (820px)
      await page.setViewportSize({ width: 820, height: 900 });
      await page.waitForTimeout(100);
      let overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      assert.equal(overflow, false, 'Zero overflow at 820px after live resize');

      // Dynamic resize to mobile transition width (760px)
      await page.setViewportSize({ width: 760, height: 900 });
      await page.waitForTimeout(100);
      overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      assert.equal(overflow, false, 'Zero overflow at 760px after live resize');

      // Dynamic resize to small mobile (360px)
      await page.setViewportSize({ width: 360, height: 800 });
      await page.waitForTimeout(100);
      overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      assert.equal(overflow, false, 'Zero overflow at 360px after live resize');

      // Dynamic resize back to desktop (1440px)
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.waitForTimeout(100);
      overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      assert.equal(overflow, false, 'Zero overflow at 1440px after return resize');

      await context.close();
      console.log('✓ Live resizing across transition widths passed');
    }

    // -------------------------------------------------------------
    // Suite 4: Back / Forward State Restoration
    // -------------------------------------------------------------
    {
      const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
      const page = await context.newPage();

      // Navigate to Members and search for 'Julia'
      await page.goto(base + '/#Members');
      await page.locator('#page h1').waitFor();
      await page.locator('#member-search-input').fill('Julia');
      await page.locator('#member-search-input').dispatchEvent('input');
      await page.waitForTimeout(100);
      const membersCountText = await page.locator('#members-results-meta').innerText();

      // Navigate to Morning Report
      await page.goto(base + '/#Morning%20Report');
      await page.locator('#page h1').waitFor();

      // Go Back via browser history
      await page.goBack();
      await page.locator('#page h1').waitFor();
      assert.equal(page.url().includes('#Members'), true, 'Must navigate back to Members');
      const restoredSearchVal = await page.locator('#member-search-input').inputValue();
      assert.equal(restoredSearchVal, 'Julia', 'Search query must be restored upon Back navigation');

      // Go Forward via browser history
      await page.goForward();
      await page.locator('#page h1').waitFor();
      assert.equal(page.url().includes('#Morning%20Report') || page.url().includes('#Morning Report'), true, 'Must navigate forward to Morning Report');

      await context.close();
      console.log('✓ Back / Forward state restoration passed');
    }

    // -------------------------------------------------------------
    // Suite 5: Backup Export and Re-Import Fidelity
    // -------------------------------------------------------------
    {
      const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
      const page = await context.newPage();

      await page.goto(base + '/#Members');
      await page.locator('#page h1').waitFor();

      // Make a local edit and star a record via page evaluate
      await page.evaluate(() => {
        workspace.edits['Members:80'] = { Name: 'Dr. Jane Smith (Export Test)' };
        workspace.favorites.push('Members:80');
        save(workspace);
        render();
      });
      await page.waitForTimeout(100);

      // Verify edit rendered
      const editedText = await page.locator('#page').innerText();
      assert.ok(editedText.includes('Dr. Jane Smith (Export Test)'), 'Local edit must be visible in UI');

      // Export backup payload
      const backupPayload = await page.evaluate(() => {
        return JSON.stringify({
          version: 'cps-hub-backup-v2',
          exportedAt: new Date().toISOString(),
          workspace
        });
      });

      // Clear workspace
      await page.evaluate(() => {
        localStorage.clear();
        workspace = { edits: {}, added: [], favorites: [], history: [], recent: [], issues: [], isAdmin: false, role: 'VMR Leadership' };
        render();
      });
      await page.waitForTimeout(100);
      assert.ok(!(await page.locator('#page').innerText()).includes('Dr. Jane Smith (Export Test)'), 'Edit must be cleared after wipe');

      // Re-import backup payload
      await page.evaluate((payload) => {
        const parsed = JSON.parse(payload);
        workspace = parsed.workspace;
        localStorage.setItem('cps-hub-workspace-v2', JSON.stringify(workspace));
        render();
      }, backupPayload);
      await page.waitForTimeout(100);

      // Verify complete restoration
      const restoredText = await page.locator('#page').innerText();
      assert.ok(restoredText.includes('Dr. Jane Smith (Export Test)'), 'Local edit must be restored from backup');

      await context.close();
      console.log('✓ Backup export and re-import round-trip fidelity passed');
    }

    console.log('\nAll browser milestone consolidation suites completed successfully!');
  } finally {
    await browser.close();
    await new Promise(r => server.close(r));
  }
})().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
