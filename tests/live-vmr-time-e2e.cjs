'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

// Auto-load .env.local
const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath) && typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(envPath); } catch {}
}

const { createServer } = require('../scripts/serve.cjs');
const { injectAuth } = require('./test-auth-helper.cjs');
const { getCredentials, getAccessToken } = require('../api/_lib/sheets-reader.cjs');

async function fetchSheetCells(sheetId, range) {
  const creds = getCredentials();
  const token = await getAccessToken(creds);
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  return data.values || [];
}

async function writeSheetCells(sheetId, range, values) {
  const creds = getCredentials();
  const token = await getAccessToken(creds);
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values })
  });
  return res.ok;
}

async function runLiveTrial() {
  const sheetId = process.env.SYNC_SHEET_ID || '1QBgiknR05XihR1JkND8dBCY6NFfSum0142pGMIOquh8';
  console.log('=== Physical Google Sheets End-to-End Trial ===');
  console.log('Target Sheet ID:', sheetId);

  // 1. Inspect initial state of Row 108 (Monday September 21, 2026 - TBD)
  const row108Initial = await fetchSheetCells(sheetId, "'Morning Report'!A108:D108");
  console.log('Initial Row 108 in Google Sheet:', JSON.stringify(row108Initial));
  assert.equal(row108Initial[0][0], 'Monday - September 21, 2026');
  const origPt108 = row108Initial[0][1] || '';
  const origEt108 = row108Initial[0][2] || '';
  console.log(`Original Row 108 values: PT="${origPt108}", ET="${origEt108}"`);

  // 2. Inspect initial state of Row 109 (Sunday September 20, 2026 - Existing time)
  const row109Initial = await fetchSheetCells(sheetId, "'Morning Report'!A109:D109");
  console.log('Initial Row 109 in Google Sheet:', JSON.stringify(row109Initial));
  assert.equal(row109Initial[0][0], 'Sunday - September 20, 2026');
  const origPt109 = row109Initial[0][1] || '';
  const origEt109 = row109Initial[0][2] || '';
  console.log(`Original Row 109 values: PT="${origPt109}", ET="${origEt109}"`);

  let chromium;
  try {
    ({ chromium } = require('playwright-core'));
  } catch {
    throw new Error('playwright-core is required for browser trial');
  }

  const server = createServer();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      timezoneId: 'America/New_York'
    });
    await injectAuth(context, 'admin');
    const p = await context.newPage();

    try {
      // ---------------------------------------------------------
      // TEST 1: Physical Write from Month-Long Schedule Table
      // (Sunday September 20, 2026 - Row 109, Morning Report:109)
      // ---------------------------------------------------------
      console.log('\n--- Test 1: Real Write initiated specifically from Month-Long Schedule Table ---');
      await p.goto(base + '/#Morning%20Report');
      await p.waitForSelector('.mr-monthly-schedule-section');

      const monthRow109Btn = p.locator('.mr-month-desktop-stream .mr-card-date [data-edit-time="Morning Report:109"]');
      await monthRow109Btn.waitFor({ state: 'visible', timeout: 10000 });
      const initialMonthText = await monthRow109Btn.innerText();
      console.log('Row 109 initial button text in Month-long table:', initialMonthText);
      assert.match(initialMonthText, /12:00 PM/);

      // Click to open time picker dialog from Month schedule
      await monthRow109Btn.click();
      await p.waitForSelector('#time-picker-dialog[open]');
      console.log('✓ Time picker clock dialog opened from Month table row');

      // Change time to 2:00 PM ET (which corresponds to 11:00 AM PT)
      await p.locator('#tp-zone-select').selectOption('America/New_York');
      await p.locator('.tp-clock-number', { hasText: /^2$/ }).click();
      await p.locator('#tp-pm-btn').click();

      // Check timezone projection preview
      const previewText109 = await p.locator('#tp-tz-preview').innerText();
      console.log('Clock dialog projection preview:\n' + previewText109);
      assert.match(previewText109, /Pacific Time[\s\S]*11:00 AM/);
      assert.match(previewText109, /Eastern Time[\s\S]*2:00 PM/);

      console.log('Clicking Save Time from Month table...');
      await p.locator('#tp-save-btn').click();
      await p.locator('#time-picker-dialog').waitFor({ state: 'hidden', timeout: 15000 });
      console.log('✓ Dialog closed cleanly upon save from Month table');

      // Verify Month table immediately reflects updated time
      const updatedMonthText = await monthRow109Btn.innerText();
      console.log('Month table button text after save:', updatedMonthText);
      assert.match(updatedMonthText, /2:00 PM/);

      // PHYSICALLY inspect Google Sheets cells B109:C109 directly
      console.log('Reading Google Sheet cells B109:C109 directly via Google Sheets API...');
      const liveSheetRow109 = await fetchSheetCells(sheetId, "'Morning Report'!B109:C109");
      console.log('Google Sheets cells B109:C109 observed directly:', JSON.stringify(liveSheetRow109));
      assert.equal(liveSheetRow109[0][0], '11:00 AM', 'Physical Google Sheet PT cell (Col B) must be 11:00 AM');
      assert.equal(liveSheetRow109[0][1], '2:00 PM', 'Physical Google Sheet ET cell (Col C) must be 2:00 PM');
      console.log('✓ Physical Google Sheet write confirmed from Month table: Col B (PT) = 11:00 AM, Col C (ET) = 2:00 PM');

      // ROUND TRIP: Reload portal page and verify persistence from real sheet
      console.log('Reloading page to verify persistence from Google Sheets snapshot...');
      await p.reload();
      await p.waitForSelector('.mr-monthly-schedule-section');
      const reloadedMonthText = await p.locator('.mr-month-desktop-stream .mr-card-date [data-edit-time="Morning Report:109"]').innerText();
      console.log('Reloaded Month table button text:', reloadedMonthText);
      assert.match(reloadedMonthText, /2:00 PM/);
      console.log('✓ Full persistence cycle proven from Month table: Edit -> Google Sheets -> Reload');

      // ---------------------------------------------------------
      // TEST 2: Physical Write from Home Dashboard Next 7
      // (Sunday September 20, 2026 - Row 109, Morning Report:109)
      // ---------------------------------------------------------
      console.log('\n--- Test 2: Real Write initiated from Home Dashboard Next 7 ---');
      await p.goto(base + '/#Home');
      await p.waitForSelector('#home-next-vmrs');

      const homeRow109Btn = p.locator('#home-next-vmrs [data-edit-time="Morning Report:109"]');
      await homeRow109Btn.waitFor({ state: 'visible', timeout: 10000 });
      const initialHomeText = await homeRow109Btn.innerText();
      console.log('Row 109 initial button text on Home Dashboard:', initialHomeText);
      assert.match(initialHomeText, /2:00 PM/);

      // Click to open time picker from Home Dashboard
      await homeRow109Btn.click();
      await p.waitForSelector('#time-picker-dialog[open]');
      console.log('✓ Time picker clock dialog opened from Home Dashboard');

      // Change time to 1:00 PM ET (which corresponds to 10:00 AM PT)
      await p.locator('#tp-zone-select').selectOption('America/New_York');
      await p.locator('.tp-clock-number', { hasText: /^1$/ }).click();
      await p.locator('#tp-pm-btn').click();

      console.log('Clicking Save Time from Home Dashboard...');
      await p.locator('#tp-save-btn').click();
      await p.locator('#time-picker-dialog').waitFor({ state: 'hidden', timeout: 15000 });
      console.log('✓ Dialog closed cleanly upon save from Home Dashboard');

      // Verify Home Dashboard immediately reflects updated time
      const updatedHomeText = await homeRow109Btn.innerText();
      console.log('Home Dashboard button text after save:', updatedHomeText);
      assert.match(updatedHomeText, /1:00 PM/);

      // PHYSICALLY inspect Google Sheets cells B109:C109 directly
      console.log('Reading Google Sheet cells B109:C109 directly via Google Sheets API...');
      const liveSheetRow109Home = await fetchSheetCells(sheetId, "'Morning Report'!B109:C109");
      console.log('Google Sheets cells B109:C109 observed directly:', JSON.stringify(liveSheetRow109Home));
      assert.equal(liveSheetRow109Home[0][0], '10:00 AM', 'Physical Google Sheet PT cell (Col B) must be 10:00 AM');
      assert.equal(liveSheetRow109Home[0][1], '1:00 PM', 'Physical Google Sheet ET cell (Col C) must be 1:00 PM');
      console.log('✓ Physical Google Sheet write confirmed from Home Dashboard: Col B (PT) = 10:00 AM, Col C (ET) = 1:00 PM');

      // ---------------------------------------------------------
      // TEST 3: Physical Write on Row 108 (Time TBD) from Next 7
      // (Monday September 21, 2026 - Row 108, Morning Report:108)
      // ---------------------------------------------------------
      console.log('\n--- Test 3: Edit Time TBD session (Row 108) from Morning Report Schedule ---');
      await p.goto(base + '/#Morning%20Report');
      await p.waitForSelector('.agenda-view');

      const card108TimeBtn = p.locator('.mr-stream:not(.mr-month-stream) [data-edit-time="Morning Report:108"]').first();
      await card108TimeBtn.waitFor({ state: 'visible', timeout: 10000 });
      const initialText108 = await card108TimeBtn.innerText();
      console.log('Row 108 initial button text:', initialText108);
      assert.match(initialText108, /Time TBD/i);

      // Click to open time picker
      await card108TimeBtn.click();
      await p.waitForSelector('#time-picker-dialog[open]');

      // Select Eastern Time 9:00 AM (6:00 AM PT)
      await p.locator('#tp-zone-select').selectOption('America/New_York');
      await p.locator('.tp-clock-number', { hasText: /^9$/ }).click();
      await p.locator('#tp-am-btn').click();

      console.log('Clicking Save Time for Row 108...');
      await p.locator('#tp-save-btn').click();
      await p.locator('#time-picker-dialog').waitFor({ state: 'hidden', timeout: 15000 });

      // Verify UI immediately updated
      const immediateText108 = await card108TimeBtn.innerText();
      console.log('Row 108 text after save:', immediateText108);
      assert.match(immediateText108, /9:00 AM/);

      // PHYSICALLY check Google Sheet cells B108:C108
      const liveSheetRow108 = await fetchSheetCells(sheetId, "'Morning Report'!B108:C108");
      console.log('Google Sheets cells B108:C108 observed directly:', JSON.stringify(liveSheetRow108));
      assert.equal(liveSheetRow108[0][0], '6:00 AM', 'Physical Google Sheet PT cell (Col B) must be 6:00 AM');
      assert.equal(liveSheetRow108[0][1], '9:00 AM', 'Physical Google Sheet ET cell (Col C) must be 9:00 AM');
      console.log('✓ Physical Google Sheet write confirmed for Row 108: Col B (PT) = 6:00 AM, Col C (ET) = 9:00 AM');

    } finally {
      // ---------------------------------------------------------
      // RESTORATION: Restore both test records back to original values
      // ---------------------------------------------------------
      console.log('\n--- Restoring Test Records in Google Sheets to Original Production Values ---');
      
      // Restore Row 109 back to original values (9:00 AM / 12:00 PM)
      await writeSheetCells(sheetId, "'Morning Report'!B109:C109", [[origPt109, origEt109]]);
      const final109 = await fetchSheetCells(sheetId, "'Morning Report'!B109:C109");
      console.log('Final Row 109 cells in Google Sheet after restore:', JSON.stringify(final109));
      assert.equal(final109[0][0], origPt109);
      assert.equal(final109[0][1], origEt109);
      console.log(`✓ Row 109 verified restored to PT="${origPt109}", ET="${origEt109}"`);

      // Restore Row 108 back to original values (TBD / TBD)
      await writeSheetCells(sheetId, "'Morning Report'!B108:C108", [[origPt108, origEt108]]);
      const final108 = await fetchSheetCells(sheetId, "'Morning Report'!B108:C108");
      console.log('Final Row 108 cells in Google Sheet after restore:', JSON.stringify(final108));
      assert.equal(final108[0][0], origPt108);
      assert.equal(final108[0][1], origEt108);
      console.log(`✓ Row 108 verified restored to PT="${origPt108}", ET="${origEt108}"`);

      // Clean local workspace edits before final reload so it reflects the actual restored sheet snapshot
      await p.evaluate(() => {
        const KEY = 'cps-hub-workspace-v2';
        const ws = JSON.parse(localStorage.getItem(KEY) || '{}');
        if (ws.edits) {
          Object.keys(ws.edits).forEach(id => {
            if (id.includes('108') || id.includes('109')) delete ws.edits[id];
          });
          localStorage.setItem(KEY, JSON.stringify(ws));
        }
      });

      // Reload portal one last time to ensure restored production state is cleanly retrieved
      await p.goto(base + '/#Morning%20Report');
      await p.reload();
      await p.waitForSelector('.mr-monthly-schedule-section');
      const finalReload109 = await p.locator('.mr-month-desktop-stream .mr-card-date [data-edit-time="Morning Report:109"]').innerText();
      const finalReload108 = await p.locator('.mr-stream:not(.mr-month-stream) [data-edit-time="Morning Report:108"]').innerText();
      console.log('Final portal state after reload: Row 109 =', finalReload109, '| Row 108 =', finalReload108);
      assert.match(finalReload109, /12:00 PM/i);
      assert.match(finalReload108, /Time TBD/i);
      console.log('✓ Final portal reload confirms exact production state restored.');
    }
  } finally {
    await browser.close();
    await new Promise(r => server.close(r));
  }

  console.log('\n=== ALL PHYSICAL GOOGLE SHEETS CHECKS AND ROUND-TRIPS PASSED ===');
}

runLiveTrial().catch(err => {
  console.error('Physical trial error:', err);
  process.exit(1);
});
