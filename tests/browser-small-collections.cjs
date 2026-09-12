'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createServer } = require('../scripts/serve.cjs');

(async () => {
  let chromium;
  try {
    chromium = require('playwright-core').chromium;
  } catch {
    console.log('[SKIP] playwright-core not found.');
    process.exit(0);
  }

  const EDGE_PATH = process.env.CHROMIUM_PATH || (
    fs.existsSync('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe')
      ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
      : 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  );

  const server = createServer();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;

  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: EDGE_PATH
    });

    for (const width of [1440, 820, 390, 320]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));

      // 1. Test Important links
      await page.goto(`${base}/#${encodeURIComponent('Important links')}`);
      await page.locator('#page h1').waitFor();
      assert.equal(await page.locator('#page h1').innerText(), 'Important links');

      // Zero horizontal overflow
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px overflow on Important links`);

      // All 13 resources reachable without pagination
      const resourceCards = page.locator('.resource-card');
      const count = await resourceCards.count();
      assert.equal(count, 13, `All 13 resources visible simultaneously at ${width}px without pagination`);
      assert.equal(await page.locator('#next').count(), 0, 'No Next pagination button on Important links');
      assert.equal(await page.locator('#prev').count(), 0, 'No Prev pagination button on Important links');

      // Verify category headers
      assert.ok(await page.locator('text=Clinical Sessions & VMR').count() > 0, 'Clinical Sessions & VMR category exists');
      assert.ok(await page.locator('text=Schemas & Video Production').count() > 0, 'Schemas & Video Production category exists');
      assert.ok(await page.locator('text=Podcasts, Media & Publishing').count() > 0, 'Podcasts, Media & Publishing category exists');
      assert.ok(await page.locator('text=Operating Procedures & Guides').count() > 0, 'Operating Procedures & Guides category exists');

      // Verify Row 2 (VMR overview) has subtitle and correct link
      const vmrCard = page.locator('.resource-card:has-text("VMR overview")');
      assert.ok(await vmrCard.locator('.resource-subtitle:has-text("CPSolvers morning report - Overview")').count() > 0, 'VMR overview displays human subtitle');
      const vmrBtn = vmrCard.locator('a.resource-action-btn');
      assert.equal(await vmrBtn.getAttribute('target'), '_blank');
      assert.equal(await vmrBtn.getAttribute('rel'), 'noopener noreferrer');
      assert.equal(await vmrBtn.getAttribute('href'), 'https://docs.google.com/document/d/1YCvE9XG8IHtbihgJjT9iPCrABmqy3qPoLrzvNwGOq_A/edit');

      // Verify Row 3 (Creating schema videos) does NOT display raw URL as subtitle
      const schemaCard = page.locator('.resource-card:has-text("Creating schema videos")');
      assert.equal(await schemaCard.locator('.resource-subtitle').count(), 0, 'No raw URL displayed as subtitle for schema videos');
      const schemaBtn = schemaCard.locator('a.resource-action-btn');
      assert.equal(await schemaBtn.getAttribute('href'), 'https://docs.google.com/document/d/1MCKyXSHtvb65nuDVxSUC-2mEH1cEoiNnAIsK9R4kwDw/edit?usp=sharing');

      // Verify Row 5 (Audio editing) missing link explicit state
      const audioCard = page.locator('.resource-card:has-text("Audio editing")');
      assert.equal(await audioCard.locator('a.resource-action-btn').count(), 0, 'No link button for Audio editing');
      assert.ok(await audioCard.locator('.link-unavailable-badge').count() > 0, 'Audio editing has Link unavailable badge');

      // Test Details button opens dialog
      await vmrCard.locator('[data-open]').click();
      await page.locator('#detail-dialog[open]').waitFor();
      await page.keyboard.press('Escape');

      // Test Search filtering
      await page.locator('#links-search-input').fill('whiteboard');
      assert.equal(await page.locator('.resource-card').count(), 2, 'Searching "whiteboard" filters to 2 resources');
      await page.locator('#links-search-input').fill('');

      // 2. Test Conferences
      await page.goto(`${base}/#${encodeURIComponent('Conferences')}`);
      await page.locator('#page h1').waitFor();
      assert.equal(await page.locator('#page h1').innerText(), 'Conferences');

      // Zero horizontal overflow
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px overflow on Conferences`);

      // Verify no generic pagination
      assert.equal(await page.locator('#next').count(), 0, 'No Next pagination button on Conferences');
      assert.equal(await page.locator('#prev').count(), 0, 'No Prev pagination button on Conferences');

      // Verify EULAR Congress event brief and all essential fields
      const confBrief = page.locator('.conference-brief-card');
      assert.equal(await confBrief.count(), 1, '1 conference brief rendered');
      assert.ok(await confBrief.locator('h2:has-text("EULAR Congress")').count() > 0, 'Congress title displayed');
      assert.ok(await confBrief.locator('text=Rheumatology').count() > 0, 'Subspecialty displayed');
      assert.ok(await confBrief.locator('text=2025-06-11 – 2025-06-14').count() > 0, 'Dates displayed');
      assert.ok(await confBrief.locator('text=Barcelona').count() > 0, 'City displayed');
      assert.ok(await confBrief.locator('text=Julia').count() > 0, 'Attendee Julia displayed');
      assert.ok(await confBrief.locator('text=Lea').count() > 0, 'Attendee Lea displayed');
      assert.ok(await confBrief.locator('text=yes (Lea)').count() > 0, 'Scholarship displayed');

      // Verify conference link
      const confLink = confBrief.locator('a.conference-action-btn');
      assert.equal(await confLink.getAttribute('href'), 'https://congress.eular.org/');
      assert.equal(await confLink.getAttribute('target'), '_blank');
      assert.equal(await confLink.getAttribute('rel'), 'noopener noreferrer');

      // Verify map link
      const mapLink = confBrief.locator('a.conference-map-link');
      assert.ok(await mapLink.getAttribute('href').then(h => h.includes('google.com/maps')), 'Google Maps link preserved');

      // Test Edit / Details dialog button
      await confBrief.locator('[data-open]').click();
      await page.locator('#detail-dialog[open]').waitFor();
      await page.keyboard.press('Escape');

      assert.deepEqual(errors, [], `No page errors at ${width}px`);
      await context.close();
    }

    console.log('All browser checks for Important Links and Conferences passed successfully at 1440px, 820px, 390px, and 320px.');
  } finally {
    if (browser) await browser.close();
    await new Promise(r => server.close(r));
  }
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
