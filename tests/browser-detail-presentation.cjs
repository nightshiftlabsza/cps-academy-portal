'use strict';
// Comprehensive browser verification for Prompt 7: Separate reading details from editing
const assert = require('node:assert/strict');
const { createServer } = require('../scripts/serve.cjs');
const workbook = require('../workbook.json');

(async () => {
  let chromium;
  try {
    chromium = require('playwright-core').chromium;
  } catch {
    console.log('[SKIP] Optional playwright-core not installed.');
    process.exit(0);
  }

  const server = createServer();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
    });
    const base = `http://127.0.0.1:${server.address().port}`;

    for (const width of [1440, 820, 390, 320]) {
      const context = await browser.newContext({
        viewport: { width, height: 844 },
        timezoneId: 'Africa/Johannesburg'
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

      const nav = async area => {
        await page.goto(base + '/#' + encodeURIComponent(area));
        await page.locator('#page h1').waitFor();
      };
      const overflow = async label => {
        const ok = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
        assert(ok, `${width}px horizontal overflow at ${label}`);
      };

      // 1. Accessible names on dialogs
      await nav('Home');
      const detailAria = await page.locator('#detail-dialog').getAttribute('aria-labelledby');
      assert.equal(detailAria, 'dialog-title', 'detail-dialog must have aria-labelledby="dialog-title"');
      const newAria = await page.locator('#new-dialog').getAttribute('aria-labelledby');
      assert.equal(newAria, 'new-dialog-title', 'new-dialog must have aria-labelledby="new-dialog-title"');

      // 2. Read-only presentation on CPS Academy VMRs (no inputs, textareas, selects)
      await nav('CPS Academy VMRs');
      const detailsBtn = page.locator('[data-open][data-area]').first();
      await detailsBtn.waitFor();
      await detailsBtn.click();

      const dialog = page.locator('#detail-dialog[open]');
      await dialog.waitFor();

      // Focus must enter dialog heading
      const focusedId = await page.evaluate(() => document.activeElement?.id);
      assert.equal(focusedId, 'dialog-title', 'Focus must move to dialog-title on open');

      // Verify NO editable form controls in read-only view
      const formInputs = await page.locator('#dialog-content input:not([type="hidden"]), #dialog-content textarea, #dialog-content select').count();
      assert.equal(formInputs, 0, 'Read-only detail presentation must not contain editable form controls');

      // Verify metadata tags, source badge, and field list
      assert(await page.locator('.detail-meta-bar').isVisible(), 'Meta bar must be visible');
      assert(await page.locator('.detail-fields-list').isVisible(), 'Field definition list must be visible');
      assert(await page.locator('#edit-record-btn').isVisible(), 'Edit on this device button must be visible');

      // Verify mobile-specific elements when width <= 760
      if (width <= 760) {
        assert(await page.locator('#mobile-detail-bar').isVisible(), 'Mobile top bar must be visible on small viewports');
        const backBtnBox = await page.locator('#detail-back-btn').boundingBox();
        assert(backBtnBox && backBtnBox.height >= 44, 'Mobile back button height >= 44px');
      }

      await overflow('detail-readonly');

      // 3. Transition to Edit on this device
      await page.locator('#edit-record-btn').click();
      // Editable inputs must now be visible
      const editInputs = await page.locator('#dialog-content input, #dialog-content textarea, #dialog-content select').count();
      assert(editInputs > 0, 'Edit mode must render editable form controls');
      assert(await page.locator('.edit-workflow-note-bar').isVisible(), 'Edit note bar must be visible');
      assert.match(await page.locator('.edit-workflow-note-bar').innerText(), /Saved on this device; no changes sent to the workbook/i);
      assert(await page.locator('#dialog-primary').isVisible(), 'Save button must be visible in edit mode');

      // Test dirty discard guard
      const firstInput = page.locator('#dialog-content input:not([type="hidden"])').first();
      await firstInput.fill('MODIFIED_VALUE_FOR_TEST');
      // Attempt to close via cancel button
      page.once('dialog', d => {
        assert.match(d.message(), /unsaved changes/i);
        d.dismiss();
      });
      await page.locator('#dialog-secondary').click();
      assert(await page.locator('#detail-dialog[open]').isVisible(), 'Dialog must remain open after dismissing discard prompt');

      // Discard edits with confirm: returns to read-only presentation
      page.once('dialog', d => d.accept());
      await page.locator('#dialog-secondary').click();
      assert(await page.locator('#edit-record-btn').isVisible(), 'Should return to read-only summary');
      // Close read-only presentation
      await page.locator('#dialog-secondary').click();
      await page.locator('#detail-dialog[open]').waitFor({ state: 'hidden' });

      // 4. Focus restoration to trigger
      const restoredFocus = await page.evaluate(() => document.activeElement === document.querySelector('[data-open]'));
      assert(restoredFocus, 'Focus must return to trigger button after closing detail dialog');

      // 4b. Read-only presentation on Members heading
      await nav('Members');
      const coreHeadingBtn = page.locator('#member-cohort-core .member-heading-btn');
      await coreHeadingBtn.waitFor();
      await coreHeadingBtn.click();
      await page.locator('#detail-dialog[open]').waitFor();
      const memberFormInputs = await page.locator('#dialog-content input:not([type="hidden"]), #dialog-content textarea, #dialog-content select').count();
      assert.equal(memberFormInputs, 0, 'Members read-only view must not contain editable inputs');
      await page.keyboard.press('Escape');
      await page.locator('#detail-dialog[open]').waitFor({ state: 'hidden' });

      // 5. Direct Staffing action on Morning Report
      await nav('Morning Report');
      const cardsBtn = page.locator('[data-set-view="cards"]');
      if (await cardsBtn.count() > 0) await cardsBtn.click();
      const staffBtn = page.locator('[data-action="staff"]').first();
      await staffBtn.waitFor();
      await staffBtn.click();
      await page.locator('#detail-dialog[open]').waitFor();

      // Must open DIRECTLY in edit mode
      const mrEditInputs = await page.locator('#dialog-content input, #dialog-content textarea, #dialog-content select').count();
      assert(mrEditInputs > 0, 'Direct staff button must open dialog directly into edit mode');
      assert(await page.locator('#dialog-primary').isVisible(), 'Save button must be visible directly');
      await page.keyboard.press('Escape');
      await page.locator('#detail-dialog[open]').waitFor({ state: 'hidden' });

      // 6. Direct edit via record menu
      await nav('Morning Report');
      const viewModeBtn = page.locator(width > 760 ? '[data-set-view="matrix"]' : '[data-set-view="agenda"]');
      if (await viewModeBtn.count() > 0 && await viewModeBtn.isVisible()) await viewModeBtn.click();
      const menuBtn = page.locator('[data-record-menu]').first();
      await menuBtn.waitFor();
      await menuBtn.click();
      await page.locator('#record-actions-dialog[open]').waitFor();

      // Verify menu has both options: View and Staff & Edit
      assert(await page.locator('#menu-act-view').isVisible(), 'Menu must offer View Details Summary');
      assert(await page.locator('#menu-act-open').isVisible(), 'Menu must offer Staff & Edit Details');

      // Clicking View opens read-only
      await page.locator('#menu-act-view').click();
      await page.locator('#detail-dialog[open]').waitFor();
      const orgInputsView = await page.locator('#dialog-content input:not([type="hidden"]), #dialog-content textarea, #dialog-content select').count();
      assert.equal(orgInputsView, 0, 'View menu action must open read-only summary');
      await page.keyboard.press('Escape');
      await page.locator('#detail-dialog[open]').waitFor({ state: 'hidden' });

      // 7. Test 200% zoom on mobile (390px)
      if (width === 390) {
        await nav('CPS Academy VMRs');
        await page.evaluate(() => { document.body.style.zoom = '200%'; });
        await detailsBtn.click();
        await page.locator('#detail-dialog[open]').waitFor();
        await overflow('zoom-200');
        await page.evaluate(() => document.querySelector('#detail-mobile-close-btn').click());
        await page.locator('#detail-dialog[open]').waitFor({ state: 'hidden' });
        await page.evaluate(() => { document.body.style.zoom = ''; });
      }

      assert.equal(errors.length, 0, `No console/page errors at ${width}px: ` + errors.join('; '));
      await context.close();
    }

    console.log('[PASS] Browser detail presentation verification succeeded across 1440, 820, 390, 320px.');
  } finally {
    if (browser) await browser.close();
    await new Promise(r => server.close(r));
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
