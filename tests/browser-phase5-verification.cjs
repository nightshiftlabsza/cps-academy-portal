'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createServer } = require('../scripts/serve.cjs');
const { chromium } = require('playwright-core');

const root = path.resolve(__dirname, '..');
const workbook = JSON.parse(fs.readFileSync(path.join(root, 'workbook.json'), 'utf8'));

(async () => {
  const server = createServer();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const executablePath = process.env.CHROMIUM_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const browser = await chromium.launch({ headless: true, executablePath });
  const base = `http://127.0.0.1:${server.address().port}`;

  const screenshotsDir = path.join(root, 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  try {
    // -------------------------------------------------------------
    // 1. DATA FIDELITY VERIFICATION
    // -------------------------------------------------------------
    console.log('--- 1. Data Fidelity Verification ---');
    const members = workbook['Members'].records;
    assert.equal(members.length, 154, 'Members must have 154 total records');
    const memberBirthdays = members.filter(r => r.fields && r.fields['Birthday'] && String(r.fields['Birthday']).trim()).length;
    assert.equal(memberBirthdays, 127, 'Members must have exactly 127 recorded birthdays');

    const orgRecords = workbook['OrgStructure'].records;
    assert.equal(orgRecords.length, 49, 'OrgStructure must have exactly 49 records');
    const slsRow = orgRecords.find(r => r.id === 'OrgStructure:36');
    assert.ok(slsRow, 'SLS row OrgStructure:36 must exist');
    assert.ok(slsRow.fields['Team / responsibility'].includes('Spaced Learning Series (SLS)'), 'SLS row title intact');
    assert.ok(slsRow.fields['Role'].includes('Teamlet 1'), 'SLS pairings intact');

    const activeCrc = workbook['CRC'].records;
    assert.equal(activeCrc.length, 366, 'Active CRC must have exactly 366 records');

    const retiredCrc = workbook['CRC - retired'].records;
    assert.equal(retiredCrc.length, 417, 'Retired CRC must have exactly 417 records');

    // Row 396 nonstandard preservation
    const r396 = retiredCrc.find(r => r.id === 'CRC - retired:396');
    assert.ok(r396, 'Row 396 must exist in Retired CRC');
    assert.equal(r396.fields['CONTACTED?'], 'Elena & Samantha', 'Row 396 CONTACTED? must retain Elena & Samantha verbatim');

    console.log('Data fidelity checks passed: Members (154: 148 substantive + 6 structural, 127 birthdays), Org (49, 7 sections, SLS intact), Active CRC (366), Retired CRC (417).');

    // -------------------------------------------------------------
    // 2. RESPONSIVE CHECKS ACROSS VIEWPORTS (Zero horizontal overflow)
    // -------------------------------------------------------------
    console.log('--- 2. Responsive & Overflow Verification ---');
    const viewports = [1440, 820, 390, 320];
    const testRoutes = ['#Morning%20Report', '#CRC', '#CRC%20-%20retired', '#OrgStructure', '#Members'];

    for (const width of viewports) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await ctx.newPage();
      for (const route of testRoutes) {
        await page.goto(base + '/' + route);
        await page.locator('#page h1').waitFor();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        assert.equal(overflow, false, `Horizontal overflow detected at ${width}px on route ${route}`);
      }
      await ctx.close();
    }
    console.log('Responsive overflow checks passed across 1440px, 820px, 390px, 320px with zero horizontal overflow.');

    // -------------------------------------------------------------
    // 3. RETIRED CRC CHECKBOX LABELS & MODAL WORKFLOWS
    // -------------------------------------------------------------
    console.log('--- 3. Retired CRC Checkbox Labels Verification ---');
    const crcCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const crcPage = await crcCtx.newPage();

    await crcPage.goto(base + '/#CRC%20-%20retired');
    await crcPage.locator('#page h1').waitFor();

    // Check row with '1' -> Case complete, Presented, Contacted
    const rowWith1 = crcPage.locator('.crc-case-row:has(.ready-chip:has-text("Case complete"))').first();
    const row1Id = await rowWith1.getAttribute('data-id');
    await rowWith1.locator('button:has-text("Details")').click();
    await crcPage.locator('#detail-dialog[open]').waitFor();

    // Verify detail labels in dialog
    const detailDialogText = await crcPage.locator('#dialog-content').innerText();
    assert.ok(detailDialogText.includes('Checked'), 'Detail view must display "Checked" for 1');
    assert.ok(!detailDialogText.includes('Checked (1)'), 'Detail view must NOT include "(1)" suffix');

    // Open edit dialog from detail view
    await crcPage.locator('#edit-record-btn').click();
    await crcPage.locator('#dialog-content select[data-field="CASE COMPLETE?"]').waitFor();

    // Verify edit dropdown options
    const caseCompleteSelect = crcPage.locator('#dialog-content select[data-field="CASE COMPLETE?"]');
    const selectOptions = await caseCompleteSelect.locator('option').allInnerTexts();
    assert.ok(selectOptions.includes('Checked'), 'Select options must include "Checked"');
    assert.ok(selectOptions.includes('Unchecked'), 'Select options must include "Unchecked"');
    assert.ok(selectOptions.includes('Not recorded'), 'Select options must include "Not recorded"');
    assert.ok(!selectOptions.some(o => o.includes('(1)') || o.includes('(0)')), 'Select options must not have (1) or (0) suffixes');
    assert.ok(!selectOptions.some(o => /pending|failed|incomplete/i.test(o)), 'Select options must not interpret 0 as pending, failed or incomplete');

    // Close edit dialog
    await crcPage.locator('#dialog-secondary:has-text("Cancel")').click();

    // Test row 396 nonstandard preservation
    await crcPage.goto(base + '/#CRC%20-%20retired');
    await crcPage.locator('#page h1').waitFor();
    await crcPage.evaluate(() => openRecord('CRC - retired:396', 'CRC - retired'));
    await crcPage.locator('#detail-dialog[open]').waitFor();
    const r396DialogText = await crcPage.locator('#dialog-content').innerText();
    assert.ok(r396DialogText.includes('Elena & Samantha'), 'Nonstandard string "Elena & Samantha" preserved in detail view');

    // Open edit for row 396
    await crcPage.locator('#edit-record-btn').click();
    await crcPage.locator('#dialog-content select[data-field="CONTACTED?"]').waitFor();
    const contactedSelect = crcPage.locator('#dialog-content select[data-field="CONTACTED?"]');
    const contactedOpts = await contactedSelect.locator('option').allInnerTexts();
    assert.ok(contactedOpts.includes('Elena & Samantha'), 'Nonstandard string "Elena & Samantha" preserved as option in edit dropdown');
    const selectedContacted = await contactedSelect.inputValue();
    assert.equal(selectedContacted, 'Elena & Samantha', 'Nonstandard string "Elena & Samantha" selected in edit dropdown');

    // Close dialog
    await crcPage.locator('#dialog-secondary:has-text("Cancel")').click();
    await crcCtx.close();
    console.log('Retired CRC checkbox labels verified: 1 -> Checked, 0 -> Unchecked, Empty -> Not recorded, nonstandard text preserved.');

    // -------------------------------------------------------------
    // 4. ACTIVE & RETIRED CRC EDITING PERSISTENCE
    // -------------------------------------------------------------
    console.log('--- 4. Active & Retired CRC Editing Persistence ---');
    const editCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const editPage = await editCtx.newPage();

    // A. Active CRC edit unrelated field (Remarks)
    await editPage.goto(base + '/#CRC');
    await editPage.locator('#page h1').waitFor();
    const activeId = 'CRC:2';
    await editPage.evaluate(id => openRecord(id, 'CRC', null, true), activeId);
    await editPage.locator('#dialog-content textarea[data-field="Remarks"]').waitFor();

    const origRemarks = await editPage.locator('#dialog-content textarea[data-field="Remarks"]').inputValue();
    const updatedRemarks = 'Phase 5 QA Verified Remarks ' + Date.now();
    await editPage.locator('#dialog-content textarea[data-field="Remarks"]').fill(updatedRemarks);
    await editPage.locator('#dialog-primary').click();
    await editPage.waitForTimeout(200);

    // Reload and verify persistence
    await editPage.reload();
    await editPage.locator('#page h1').waitFor();
    await editPage.evaluate(id => openRecord(id, 'CRC'), activeId);
    await editPage.locator('#detail-dialog[open]').waitFor();
    const reloadedActiveDetail = await editPage.locator('#dialog-content').innerText();
    assert.ok(reloadedActiveDetail.includes(updatedRemarks), 'Active CRC edited Remarks must persist across reload');
    await editPage.keyboard.press('Escape');

    // B. Retired CRC edit unrelated field (ISSUES/CONCERNS)
    await editPage.goto(base + '/#CRC%20-%20retired');
    await editPage.locator('#page h1').waitFor();
    const retId = 'CRC - retired:3';
    await editPage.evaluate(id => openRecord(id, 'CRC - retired', null, true), retId);
    await editPage.locator('#dialog-content textarea[data-field="ISSUES/CONCERNS"]').waitFor();

    const updatedIssues = 'Phase 5 Unrelated Concern Edit ' + Date.now();
    await editPage.locator('#dialog-content textarea[data-field="ISSUES/CONCERNS"]').fill(updatedIssues);
    await editPage.locator('#dialog-primary').click();
    await editPage.waitForTimeout(200);

    // Reload and verify that unrelated field persisted, and other fields (dates, checkboxes) remained intact
    await editPage.reload();
    await editPage.locator('#page h1').waitFor();
    await editPage.evaluate(id => openRecord(id, 'CRC - retired'), retId);
    await editPage.locator('#detail-dialog[open]').waitFor();
    const reloadedRetDetail = await editPage.locator('#dialog-content').innerText();
    assert.ok(reloadedRetDetail.includes(updatedIssues), 'Retired CRC edited issues must persist across reload');
    assert.ok(reloadedRetDetail.includes('6/8/2023'), 'Retired CRC DATE OF PRESENTATION must remain 6/8/2023');
    assert.ok(reloadedRetDetail.includes('Checked'), 'Retired CRC checkbox must remain Checked');
    await editPage.keyboard.press('Escape');

    // Confirm nonstandard row 396 remains intact
    await editPage.evaluate(() => openRecord('CRC - retired:396', 'CRC - retired'));
    await editPage.locator('#detail-dialog[open]').waitFor();
    const r396Text = await editPage.locator('#dialog-content').innerText();
    assert.ok(r396Text.includes('Elena & Samantha'), 'Row 396 CONTACTED? nonstandard value must remain Elena & Samantha');
    assert.ok(r396Text.includes('Mahnoor khan'), 'Row 396 CONTACT INFO must remain Mahnoor khan');
    await editPage.keyboard.press('Escape');

    await editCtx.close();
    console.log('Active and retired CRC edit persistence verified: unrelated fields save and reload, dates, checkboxes and nonstandard strings stay intact.');

    // -------------------------------------------------------------
    // 5. MEMBERS DIRECTORY WORKFLOWS
    // -------------------------------------------------------------
    console.log('--- 5. Members Directory Workflows Verification ---');
    const memCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const memPage = await memCtx.newPage();

    await memPage.goto(base + '/#Members');
    await memPage.locator('#page h1').waitFor();

    // Verify rendered cohort badges and exact counts (15, 54, 36, 43)
    const pCountText = await memPage.locator('#cohort-participants .member-cohort-count').innerText();
    const cCountText = await memPage.locator('#cohort-core .member-cohort-count').innerText();
    const lCountText = await memPage.locator('#cohort-leaders .member-cohort-count').innerText();
    const iCountText = await memPage.locator('#cohort-inactive .member-cohort-count').innerText();

    assert.ok(pCountText.toLowerCase().includes('15 member'), `Participants cohort badge must show 15 members (got: ${pCountText})`);
    assert.ok(cCountText.toLowerCase().includes('54 member'), `Core team cohort badge must show 54 members (got: ${cCountText})`);
    assert.ok(lCountText.toLowerCase().includes('36 member'), `Leaders cohort badge must show 36 members (got: ${lCountText})`);
    assert.ok(iCountText.toLowerCase().includes('43 member'), `Inactive cohort badge must show 43 members (got: ${iCountText})`);
    assert.equal(await memPage.locator('.member-row').count(), 148, 'Total rendered substantive member rows must equal 148');

    // Birthday sorting check
    const bdayHeader = memPage.locator('.sortable-th[data-sort="Birthday"]');
    await bdayHeader.click();
    await memPage.waitForTimeout(100);
    const firstBdayAsc = await memPage.locator('.member-row .td-birthday').first().innerText();

    await bdayHeader.click();
    await memPage.waitForTimeout(100);
    const firstBdayDesc = await memPage.locator('.member-row .td-birthday').first().innerText();
    assert.notEqual(firstBdayAsc, firstBdayDesc, 'Descending sort must invert dates relative to ascending sort');

    // Reset sort
    await memPage.locator('.sortable-th[data-sort="Name"]').click();
    await memPage.waitForTimeout(100);

    // Members search
    const memSearch = memPage.locator('#member-search-input');
    await memSearch.fill('Julia');
    await memPage.waitForTimeout(150);
    const searchedRows = await memPage.locator('.member-row').count();
    assert.ok(searchedRows >= 1 && searchedRows < 148, `Search for Julia returned ${searchedRows} rows`);
    await memSearch.fill('');
    await memPage.waitForTimeout(150);

    // Scroll preservation on detail close
    await memPage.evaluate(() => window.scrollTo(0, 1000));
    await memPage.waitForTimeout(100);
    const scrolledMemberBtn = memPage.locator('.member-row .member-name-btn').nth(25);
    await scrolledMemberBtn.click();
    await memPage.locator('#detail-dialog[open]').waitFor();
    const scrollWhenOpened = await memPage.evaluate(() => window.scrollY);
    assert.ok(scrollWhenOpened > 800, 'Page must remain scrolled down when modal opened');

    await memPage.keyboard.press('Escape');
    await memPage.waitForTimeout(100);
    const scrollAfter = await memPage.evaluate(() => window.scrollY);
    assert.ok(Math.abs(scrollAfter - scrollWhenOpened) < 50, `Scroll position preserved on modal dismiss (opened: ${scrollWhenOpened}, after: ${scrollAfter})`);

    // Modal focus return
    const activeElTag = await memPage.evaluate(() => document.activeElement?.tagName);
    assert.ok(['BUTTON', 'A'].includes(activeElTag), `Focus returned to button after modal close, got: ${activeElTag}`);

    await memCtx.close();
    console.log('Members directory workflows verified: birthday sorting, search, scroll preservation, modal focus return.');

    // -------------------------------------------------------------
    // 6. ORG STRUCTURE & NAVIGATION ROUTING
    // -------------------------------------------------------------
    console.log('--- 6. Org Structure & Navigation Routing ---');
    const navCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const navPage = await navCtx.newPage();

    // Default #People -> #OrgStructure
    await navPage.goto(base + '/#People');
    await navPage.locator('#page h1').waitFor();
    const orgH1 = await navPage.locator('#page h1').innerText();
    assert.ok(orgH1.includes('Leadership') || orgH1.includes('Org Structure'), 'Navigating to #People must open Org Structure');

    // Section expansion
    const expectedSectionIds = ['leadership', 'vmr', 'journal', 'academy', 'podcasts', 'operations', 'website'];
    for (const sId of expectedSectionIds) {
      const section = navPage.locator(`#org-group-${sId}`);
      assert.equal(await section.count(), 1, `Section #${sId} must exist`);
      assert.ok(await section.evaluate(el => el.open), `Section #${sId} must be open`);
    }
    const firstSummary = navPage.locator('#org-group-leadership summary');
    await firstSummary.click();
    await navPage.waitForTimeout(50);
    assert.equal(await navPage.locator('#org-group-leadership').evaluate(el => el.open), false, 'Section should collapse on summary click');
    await firstSummary.click();
    await navPage.waitForTimeout(50);
    assert.equal(await navPage.locator('#org-group-leadership').evaluate(el => el.open), true, 'Section should re-expand on summary click');
    // SLS pairings in Org Structure
    const slsOrgRow = navPage.locator('.org-row:has-text("Spaced Learning Series")');
    assert.ok((await slsOrgRow.count()) > 0, 'SLS row must be present in Org Structure');
    const slsText = await slsOrgRow.innerText();
    assert.ok(slsText.includes('Teamlet 1'), 'SLS pairings must be rendered');

    // #Sessions redirect to Morning Report
    await navPage.goto(base + '/#Sessions');
    await navPage.locator('#page h1').waitFor();
    const mrH1 = await navPage.locator('#page h1').innerText();
    assert.equal(mrH1, 'Morning Report', 'Direct link #Sessions must redirect to Morning Report');

    // Navigation buttons
    const desktopMrBtn = navPage.locator('#desktop-nav [data-nav="Morning Report"]');
    assert.equal(await desktopMrBtn.count(), 1, 'Desktop nav has "Morning Report" button');
    const desktopSessionsBtn = navPage.locator('#desktop-nav [data-nav="Sessions"]');
    assert.equal(await desktopSessionsBtn.count(), 0, 'Desktop nav does not have "Sessions" button');

    await navCtx.close();
    console.log('Org Structure and navigation routing verified: #People -> #OrgStructure, section expansion, SLS pairings, #Sessions redirect.');

    // -------------------------------------------------------------
    // 7. SCREENSHOT CAPTURE (1440px Desktop and 390px Mobile)
    // -------------------------------------------------------------
    console.log('--- 7. Screenshot Capture ---');
    const desktopCaptureCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const dp = await desktopCaptureCtx.newPage();

    await dp.goto(base + '/#Morning%20Report');
    await dp.locator('#page h1').waitFor();
    await dp.screenshot({ path: path.join(screenshotsDir, 'phase5-desktop-morning-report.png') });

    await dp.goto(base + '/#CRC');
    await dp.locator('#page h1').waitFor();
    await dp.screenshot({ path: path.join(screenshotsDir, 'phase5-desktop-crc.png') });

    await dp.goto(base + '/#CRC%20-%20retired');
    await dp.locator('#page h1').waitFor();
    await dp.screenshot({ path: path.join(screenshotsDir, 'phase5-desktop-crc-retired.png') });

    await dp.goto(base + '/#OrgStructure');
    await dp.locator('#page h1').waitFor();
    await dp.screenshot({ path: path.join(screenshotsDir, 'phase5-desktop-org-structure.png') });

    await dp.goto(base + '/#Members');
    await dp.locator('#page h1').waitFor();
    await dp.screenshot({ path: path.join(screenshotsDir, 'phase5-desktop-members.png') });
    await desktopCaptureCtx.close();

    const mobileCaptureCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mp = await mobileCaptureCtx.newPage();

    await mp.goto(base + '/#Morning%20Report');
    await mp.locator('#page h1').waitFor();
    await mp.screenshot({ path: path.join(screenshotsDir, 'phase5-mobile-morning-report.png') });

    await mp.goto(base + '/#CRC');
    await mp.locator('#page h1').waitFor();
    await mp.screenshot({ path: path.join(screenshotsDir, 'phase5-mobile-crc.png') });

    await mp.goto(base + '/#CRC%20-%20retired');
    await mp.locator('#page h1').waitFor();
    await mp.screenshot({ path: path.join(screenshotsDir, 'phase5-mobile-crc-retired.png') });

    await mp.goto(base + '/#OrgStructure');
    await mp.locator('#page h1').waitFor();
    await mp.screenshot({ path: path.join(screenshotsDir, 'phase5-mobile-org-structure.png') });

    await mp.goto(base + '/#Members');
    await mp.locator('#page h1').waitFor();
    await mp.screenshot({ path: path.join(screenshotsDir, 'phase5-mobile-members.png') });
    await mobileCaptureCtx.close();

    console.log('All 10 desktop and mobile screenshots successfully captured in screenshots/.');
    console.log('--- ALL PHASE 5 VERIFICATIONS PASSED CLEANLY ---');
  } finally {
    await browser.close();
    await new Promise(r => server.close(r));
  }
})();
