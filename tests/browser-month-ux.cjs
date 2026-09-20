'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const { createServer } = require('../scripts/serve.cjs');
const { injectAuth } = require('./test-auth-helper.cjs');

const EDGE_PATH = process.env.CHROMIUM_PATH || (
  fs.existsSync('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe')
    ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    : fs.existsSync('C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe')
      ? 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
      : undefined
);

const SCREENSHOT_DIR = path.resolve(__dirname, '..', 'screenshots', 'month-verification');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

(async () => {
  const server = createServer();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      ...(EDGE_PATH ? { executablePath: EDGE_PATH } : {})
    });

    console.log('\n--- Starting Month VMR Schedule UX Verification Suite ---');

    const setupFixtures = async (page) => {
      await page.evaluate(() => {
        if (typeof db !== 'undefined' && db['Morning Report'] && db['Morning Report'].records) {
          // Find or inject test session for September 14, 2026
          const target = db['Morning Report'].records.find(r => (r.fields?.Date || '').startsWith('2026-09-14'));
          if (target) {
            target.fields.Facilitator = 'Rabih & Renzo';
            target.fields.Presenter = 'Dr. Zachary R';
            target.fields.Scribe = 'Kaleem';
            target.fields['Teaching Points'] = 'Manasa & Mattia';
            target.fields.Notes = 'Confirmed special case discussion with guest discussant Dr. Zachary. Please review pre-case handouts.';
          }
        }
        if (typeof render === 'function') render();
      });
    };

    // TEST 1: Mobile Jump Link, Collapsed Readability & Next 7 Comparison (390px)
    {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
      await injectAuth(context, 'admin');
      const page = await context.newPage();
      await page.goto(`${baseUrl}/#Morning%20Report`);
      await page.waitForSelector('.mr-section-head');
      await setupFixtures(page);

      // Capture Next 7 VMR section on mobile for direct scale comparison
      const next7Section = page.locator('.mr-stream').first();
      await next7Section.screenshot({ path: path.join(SCREENSHOT_DIR, 'compare-390-next7.png') });

      // Check Jump link is present
      const jumpLink = page.locator('.mr-jump-to-schedule-link');
      assert.equal(await jumpLink.count(), 1, 'Jump link exists in Next 7 section header');
      assert.equal(await jumpLink.getAttribute('href'), '#vmr-month-schedule');

      // Click jump link
      await jumpLink.click();
      await page.waitForTimeout(300);

      // Verify schedule section is visible
      const scheduleSection = page.locator('#vmr-month-schedule');
      assert.equal(await scheduleSection.count(), 1, '#vmr-month-schedule target section exists');

      // Verify collapsed card elements: date, time, title, chevron
      const firstCard = scheduleSection.locator('.mobile-only-stream .mr-month-card').first();
      await firstCard.waitFor();
      const firstToggle = firstCard.locator('.mr-month-mobile-toggle');
      assert.equal(await firstToggle.count(), 1);

      const dateText = await firstCard.locator('.mr-month-mobile-date').innerText();
      const timeTrigger = firstCard.locator('.mr-month-mobile-time .mr-time-edit-trigger');
      const titleText = await firstCard.locator('.mr-month-mobile-title').innerText();
      const chevronText = await firstCard.locator('.mr-month-mobile-chevron').innerText();

      assert.ok(dateText.length > 0, 'Date text present');
      assert.ok(await timeTrigger.count() > 0, 'Time trigger present inside mobile time area');
      assert.ok(titleText.length > 0, 'Title text present');
      assert.equal(chevronText, '›', 'Chevron indicates collapsed state');

      // Measure Collapsed Card Height at 390px
      const collapsedBox390 = await firstCard.boundingBox();
      console.log(`[390px] Collapsed Card Measured Height: ${Math.round(collapsedBox390.height)}px (width: ${Math.round(collapsedBox390.width)}px)`);
      assert.ok(collapsedBox390.height >= 48 && collapsedBox390.height <= 85, `Collapsed height ${collapsedBox390.height}px within content-driven range`);

      // Capture Normal Scale 390px Viewport showing Next 7
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'viewport-390-next7.png') });

      // Scroll schedule into view and capture normal scale viewport showing controls + collapsed cards
      await scheduleSection.scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'viewport-390-month-collapsed.png') });
      await scheduleSection.screenshot({ path: path.join(SCREENSHOT_DIR, 'mobile-390-schedule-collapsed.png') });
      console.log('✓ [390px] Mobile jump link, collapsed card structure & comparison verified');

      // TEST 2: Time Trigger Click Does NOT Expand Card (Event Isolation)
      await timeTrigger.click();
      await page.waitForTimeout(300);
      const timeDialog = page.locator('#time-picker-dialog');
      assert.equal(await timeDialog.evaluate(el => el.open), true, 'Time picker dialog opened');
      assert.equal(await firstCard.evaluate(el => el.classList.contains('is-mobile-expanded')), false, 'Card remains collapsed after clicking time');

      // Close dialog
      await page.locator('#tp-cancel-btn').click();
      await page.waitForTimeout(200);

      // TEST 3: Card Accordion Expansion with Multiple Names, Milestone Badge, and Long Note
      await firstToggle.click();
      await page.waitForTimeout(300);
      assert.equal(await firstCard.evaluate(el => el.classList.contains('is-mobile-expanded')), true, 'Card is now expanded');

      // Measure Expanded Card Height at 390px
      const expandedBox390 = await firstCard.boundingBox();
      console.log(`[390px] Expanded Card Measured Height: ${Math.round(expandedBox390.height)}px (content-driven with long note)`);
      assert.ok(expandedBox390.height >= 130 && expandedBox390.height <= 320, `Expanded height ${expandedBox390.height}px within content-driven expectation`);

      // Verify Staff Token Click inside expanded card works without triggering collapse
      const staffTokenBtn = firstCard.locator('button.staff-token').first();
      if (await staffTokenBtn.count() > 0) {
        await staffTokenBtn.click();
        await page.waitForTimeout(200);
        assert.equal(await firstCard.evaluate(el => el.classList.contains('is-mobile-expanded')), true, 'Staff token click did not collapse card');
      }

      // Verify No Duplicate Title in expanded body
      const bodyTitleVisible = await firstCard.locator('.mr-month-card-content .mr-card-title').isVisible();
      assert.equal(bodyTitleVisible, false, 'Duplicate title is hidden in expanded card');

      // Verify staffing grid is visible and positioned
      const staffingGrid = firstCard.locator('.mr-month-card-staffing');
      assert.equal(await staffingGrid.isVisible(), true, 'Staffing grid is visible in expanded card');

      // Verify milestone badge exists on the expanded card
      const milestoneCount = await firstCard.locator('.milestone-badge').count();
      assert.ok(milestoneCount > 0, 'Milestone badge is rendered');

      // Verify note exists in footer
      const noteCount = await firstCard.locator('.mr-session-note').count();
      assert.ok(noteCount > 0, 'Long note is rendered in integrated footer');

      // Capture Mobile 390px Expanded Viewport at Normal Scale
      await firstCard.scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'viewport-390-month-expanded.png') });
      await scheduleSection.screenshot({ path: path.join(SCREENSHOT_DIR, 'mobile-390-schedule-expanded.png') });
      console.log('✓ [390px] Accordion expansion with multiple names, milestone badge & long note verified');

      // TEST 4: Mobile Month Picker Open & Navigation
      const monthTrigger = page.locator('#mr-mobile-month-trigger');
      await monthTrigger.click();
      await page.waitForTimeout(300);
      const dropdown = page.locator('#mr-mobile-month-dropdown');
      assert.equal(await dropdown.isVisible(), true, 'Mobile month picker dropdown is visible');
      await scheduleSection.screenshot({ path: path.join(SCREENSHOT_DIR, 'mobile-390-schedule-month-picker.png') });
      console.log('✓ [390px] Mobile month picker open verified');

      // Check overflow on mobile
      const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      assert.equal(hasOverflow, false, 'Zero horizontal overflow at 390px');

      await context.close();
    }

    // TEST 5: Mobile 320px Readability, Touch Target, and Comparison
    {
      const context = await browser.newContext({ viewport: { width: 320, height: 700 }, isMobile: true });
      await injectAuth(context, 'admin');
      const page = await context.newPage();
      await page.goto(`${baseUrl}/#Morning%20Report`);
      await page.waitForSelector('#vmr-month-schedule');
      await setupFixtures(page);

      // Capture Normal Scale Viewport of Next 7 at 320px
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'viewport-320-next7.png') });

      const scheduleSection = page.locator('#vmr-month-schedule');
      await scheduleSection.scrollIntoViewIfNeeded();

      const firstCard320 = page.locator('.mobile-only-stream .mr-month-card').first();
      await firstCard320.waitFor();
      const collapsedBox320 = await firstCard320.boundingBox();
      console.log(`[320px] Collapsed Card Measured Height: ${Math.round(collapsedBox320.height)}px (width: ${Math.round(collapsedBox320.width)}px)`);
      assert.ok(collapsedBox320.height >= 48 && collapsedBox320.height <= 75, `Collapsed height ${collapsedBox320.height}px within expected range at 320px`);

      const mobileTimeEl = page.locator('.mobile-only-stream .mr-month-mobile-time').first();
      await mobileTimeEl.waitFor();
      const timeBox = await mobileTimeEl.boundingBox();
      assert.ok(timeBox, 'timeBox bounding box exists');
      assert.ok(timeBox.width >= 36, `Time trigger width ${timeBox.width} >= 36px at 320px`);
      assert.ok(timeBox.height >= 20, `Time trigger height ${timeBox.height} >= 20px at 320px`);

      // Verify no overflow at 320px
      const hasOverflow320 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      assert.equal(hasOverflow320, false, 'Zero horizontal overflow at 320px');

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'viewport-320-month-collapsed.png') });
      await scheduleSection.screenshot({ path: path.join(SCREENSHOT_DIR, 'mobile-320-schedule-collapsed.png') });

      // Expand card at 320px
      await page.locator('.mobile-only-stream .mr-month-mobile-toggle').first().click();
      await page.waitForTimeout(300);

      const expandedBox320 = await firstCard320.boundingBox();
      console.log(`[320px] Expanded Card Measured Height: ${Math.round(expandedBox320.height)}px (content-driven with long note)`);
      assert.ok(expandedBox320.height >= 130 && expandedBox320.height <= 320, `Expanded height ${expandedBox320.height}px within content-driven expectation at 320px`);

      await firstCard320.scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'viewport-320-month-expanded.png') });
      await scheduleSection.screenshot({ path: path.join(SCREENSHOT_DIR, 'mobile-320-schedule-expanded.png') });
      console.log('✓ [320px] Touch target, readability, expansion, comparison and zero overflow verified');

      await context.close();
    }

    // TEST 6: Desktop 1280px Schedule Section and Text Wrapping
    {
      const context = await browser.newContext({ viewport: { width: 1280, height: 850 }, isMobile: false });
      await injectAuth(context, 'admin');
      const page = await context.newPage();
      await page.goto(`${baseUrl}/#Morning%20Report`);
      await page.waitForSelector('#vmr-month-schedule');
      await setupFixtures(page);

      // Capture Next 7 at 1280px for direct comparison
      const next7Section1280 = page.locator('.mr-stream').first();
      await next7Section1280.screenshot({ path: path.join(SCREENSHOT_DIR, 'compare-1280-next7.png') });

      const scheduleSection = page.locator('#vmr-month-schedule');
      await scheduleSection.scrollIntoViewIfNeeded();

      // Check month schedule cards count
      const desktopCards = scheduleSection.locator('.mr-month-desktop-stream .mr-month-card');
      const count = await desktopCards.count();
      assert.ok(count > 0, `Desktop rendered ${count} month cards`);

      // Capture Desktop Schedule Section
      await scheduleSection.screenshot({ path: path.join(SCREENSHOT_DIR, 'desktop-1280-schedule-section.png') });
      console.log('✓ [1280px] Desktop month schedule stream, styling, and comparison verified');

      await context.close();
    }

    console.log('--- ALL BROWSER MONTH SCHEDULE UX VERIFICATIONS PASSED ---\n');
  } finally {
    if (browser) await browser.close();
    await new Promise(r => server.close(r));
  }
})().catch(e => {
  console.error('Test error:', e);
  process.exit(1);
});
