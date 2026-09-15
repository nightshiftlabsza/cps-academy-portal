'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { createServer } = require('../scripts/serve.cjs');
const { chromium } = require('playwright-core');

const ARTIFACT_DIR = 'C:\\Users\\mzaka.ZAK-PC\\.gemini\\antigravity\\brain\\2a5dec5c-a021-4ea0-9647-cb8b98309ffe';

(async () => {
  const server = createServer();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const executablePath = process.env.CHROMIUM_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const browser = await chromium.launch({ headless: true, executablePath });
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    // 1. Check across all 4 responsive viewports (1440, 820, 390, 320)
    for (const width of [1440, 820, 390, 320]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));

      await page.goto(base + '/#OrgStructure');
      await page.locator('#page h1').waitFor();

      // Heading and visible label check
      const h1Text = await page.locator('#page h1').innerText();
      assert.equal(h1Text, 'Org Structure', `Expected 'Org Structure' heading at ${width}px`);

      // No horizontal document overflow
      const docOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
      assert.ok(docOverflow, `Horizontal overflow detected at ${width}px`);

      if (width === 1440) {
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'org-desktop.png'), fullPage: false });
      } else if (width === 390) {
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'org-mobile.png'), fullPage: false });
      }

      await context.close();
      assert.deepEqual(errors, []);
    }

    // 2. Functional, Navigation & Structural checks at 1440px
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    const runtimeErrors = [];
    p.on('pageerror', e => runtimeErrors.push(e.message));

    // Test Navigation: People opens Org Structure by default
    await p.goto(base + '/#Home');
    await p.locator('#desktop-nav [data-nav="People"]').click();
    await p.locator('#page h1:has-text("Org Structure")').waitFor();
    assert.equal(await p.locator('#page h1').innerText(), 'Org Structure', 'Navigating to People must open Org Structure');
    assert.ok(p.url().includes('OrgStructure'), 'URL should reflect OrgStructure');

    // Confirm direct #Members links remain intact
    await p.goto(base + '/#Members');
    await p.locator('#page h1:has-text("Members")').waitFor();
    assert.equal(await p.locator('#page h1').innerText(), 'Members', 'Direct #Members link must remain intact');

    // Return to Org Structure
    await p.goto(base + '/#OrgStructure');
    await p.locator('#page h1:has-text("Org Structure")').waitFor();

    // Confirm all 7 sections are initially open
    const expectedSectionIds = ['leadership', 'vmr', 'journal', 'academy', 'podcasts', 'operations', 'website'];
    for (const sId of expectedSectionIds) {
      const section = p.locator(`#org-group-${sId}`);
      assert.equal(await section.count(), 1, `Section #${sId} must exist`);
      const isOpen = await section.evaluate(el => el.open);
      assert.ok(isOpen, `Section #${sId} must be initially open`);
    }

    // Overview chips count
    const indexChips = await p.locator('.org-index-chip').count();
    assert.equal(indexChips, 7, 'Expected 7 group overview chips in index');

    // Verify overview links jump without filtering other sections away
    const podcastsChip = p.locator('.org-index-chip[data-jump-group="podcasts"]');
    assert.equal(await podcastsChip.count(), 1);
    await podcastsChip.click();
    await p.waitForTimeout(200);

    // All 7 sections must still be in DOM and visible (none hidden by filter)
    for (const sId of expectedSectionIds) {
      const sec = p.locator(`#org-group-${sId}`);
      assert.equal(await sec.count(), 1, `Section #${sId} must still be present after clicking overview chip`);
      const isVisible = await sec.isVisible();
      assert.ok(isVisible, `Section #${sId} must remain visible after jumping`);
    }

    // Verify table structure: plain column labels and NO actions or stars
    const thResp = (await p.locator('.th-resp').first().textContent()).trim();
    const thMembers = (await p.locator('.th-people').first().textContent()).trim();
    const thRole = (await p.locator('.th-role').first().textContent()).trim();
    assert.equal(thResp, 'Responsibility / team', 'Table header 1 must be Responsibility / team');
    assert.equal(thMembers, 'Members', 'Table header 2 must be Members');
    assert.equal(thRole, 'Role', 'Table header 3 must be Role');

    const actionHeaders = await p.locator('.th-actions').count();
    assert.equal(actionHeaders, 0, 'No Actions column header allowed');
    const actionCells = await p.locator('.org-cell-actions').count();
    assert.equal(actionCells, 0, 'No Actions cell allowed');
    const starBtns = await p.locator('.org-table [data-star]').count();
    assert.equal(starBtns, 0, 'No star buttons allowed in org table');

    // 3. SLS row 36 pairings verification
    const slsRow = p.locator('.org-row:has-text("Spaced Learning Series (SLS)")');
    assert.equal(await slsRow.count(), 1, 'SLS row must exist');

    const slsEntries = slsRow.locator('.sls-teamlet-entry');
    assert.equal(await slsEntries.count(), 4, 'SLS must render exactly 4 teamlet-to-member pairings');

    // Check specific pairings and exact text "None."
    const entry1Tag = await slsEntries.nth(0).locator('.sls-teamlet-tag').innerText();
    const entry1Mem = await slsEntries.nth(0).locator('.sls-teamlet-members').innerText();
    assert.equal(entry1Tag, 'Teamlet 1:');
    assert.ok(entry1Mem.includes('Jas, Vale, Mukund (audio editor), Elena, Anmol'));

    const entry2Tag = await slsEntries.nth(1).locator('.sls-teamlet-tag').innerText();
    const entry2Mem = await slsEntries.nth(1).locator('.sls-teamlet-members').innerText();
    assert.equal(entry2Tag, 'Teamlet 2:');
    assert.equal(entry2Mem, 'None.', 'Teamlet 2 members must be exact text "None."');

    const entry3Tag = await slsEntries.nth(2).locator('.sls-teamlet-tag').innerText();
    const entry3Mem = await slsEntries.nth(2).locator('.sls-teamlet-members').innerText();
    assert.equal(entry3Tag, 'Teamlet 3:');
    assert.ok(entry3Mem.includes('Alec, Mengyu, Parisa, Lera, Ethan'));

    const entry4Tag = await slsEntries.nth(3).locator('.sls-teamlet-tag').innerText();
    const entry4Mem = await slsEntries.nth(3).locator('.sls-teamlet-members').innerText();
    assert.equal(entry4Tag, 'Teamlet 4:');
    assert.ok(entry4Mem.includes('Austin, Maryana, Oumaima, David, Zakariyya G'));

    // 4. Test that search reveals matches inside collapsed sections
    const vmrGroup = p.locator('#org-group-vmr');
    const vmrSummary = vmrGroup.locator('.org-group-summary');
    // Collapse VMR group
    await vmrSummary.click();
    assert.ok(!await vmrGroup.evaluate(el => el.open), 'VMR group should now be collapsed');

    // Search for "Ravi"
    await p.locator('#org-search-input').fill('Ravi');
    assert.ok(await vmrGroup.evaluate(el => el.open), 'VMR group should automatically open when search matches');
    const vmrText = await vmrGroup.innerText();
    assert.ok(vmrText.includes('Tuesday VMR'), 'Tuesday VMR should match Ravi');

    // Clear search
    await p.locator('#org-clear-input').click();
    assert.equal(await p.locator('#org-search-input').inputValue(), '');

    // Reopen VMR group for subsequent row interaction
    await vmrSummary.click();
    assert.ok(await vmrGroup.evaluate(el => el.open), 'VMR group reopened');

    // 5. Buttonized responsibility name, modal details, edit dialog and persistence
    const respBtn = p.locator('.org-resp-btn[data-open="OrgStructure:14"]');
    assert.equal(await respBtn.count(), 1, 'Tuesday VMR responsibility name must be a button');
    await respBtn.click();
    await p.locator('#detail-dialog[open]').waitFor();

    const detailTitle = await p.locator('#dialog-title').innerText();
    assert.equal(detailTitle, 'Tuesday VMR', 'Details title should be Tuesday VMR');

    const editRecordBtn = p.locator('#edit-record-btn');
    assert.equal(await editRecordBtn.isVisible(), true, 'Edit button must be visible in details');
    assert.equal(await editRecordBtn.innerText(), 'Edit responsibility', 'Edit button label must be Edit responsibility');

    // Click edit
    await editRecordBtn.click();
    await p.locator('#dialog-title:has-text("Edit responsibility: Tuesday VMR")').waitFor();

    // Make an edit
    const roleInput = p.locator('[data-field="Role"]');
    assert.equal(await roleInput.count(), 1);
    const originalRole = await roleInput.inputValue();
    await roleInput.fill(originalRole + ' (Audited)');

    // Save changes
    await p.locator('#dialog-primary').click();
    await p.locator('#detail-dialog[open]').waitFor({ state: 'detached' });

    // Verify "Local changes" chip is present on row
    const editedRow = p.locator('.org-row:has-text("Tuesday VMR")');
    assert.ok(await editedRow.locator('.local-chip').isVisible(), 'Local changes chip must appear after editing');
    assert.ok((await editedRow.innerText()).includes('(Audited)'), 'Edited text must appear in row');

    // Reload page and verify persistence from localStorage
    await p.reload();
    await p.locator('#page h1:has-text("Org Structure")').waitFor();

    const reloadedRow = p.locator('.org-row:has-text("Tuesday VMR")');
    assert.ok(await reloadedRow.locator('.local-chip').isVisible(), 'Local changes chip must persist across reloads');
    assert.ok((await reloadedRow.innerText()).includes('(Audited)'), 'Edited text must persist across reloads');

    // Restore original values
    await reloadedRow.locator('.org-resp-btn').click();
    await p.locator('#detail-dialog[open]').waitFor();
    await p.locator('#edit-record-btn').click();
    await p.locator('#restore-record').click();
    await p.locator('#confirm-restore').click();
    await p.locator('#detail-dialog[open]').waitFor({ state: 'detached' });

    // Verify restored
    const restoredRow = p.locator('.org-row:has-text("Tuesday VMR")');
    assert.equal(await restoredRow.locator('.local-chip').count(), 0, 'Local chip removed after restore');
    assert.ok(!(await restoredRow.innerText()).includes('(Audited)'), 'Edited text cleared after restore');

    // 6. Mobile navigation check
    const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mp = await mobileCtx.newPage();
    await mp.goto(base + '/#Home');
    await mp.locator('#mobile-nav [data-nav="People"]').click();
    await mp.locator('#page h1:has-text("Org Structure")').waitFor();
    assert.equal(await mp.locator('#page h1').innerText(), 'Org Structure', 'Mobile People nav must open Org Structure');
    await mobileCtx.close();

    await ctx.close();
    assert.deepEqual(runtimeErrors, []);
    console.log('browser-org-structure: all responsive, navigation, SLS pairings, search, and persistence checks passed cleanly.');
  } finally {
    await browser.close();
    await new Promise(r => server.close(r));
  }
})();
