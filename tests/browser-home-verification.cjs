'use strict';
const assert = require('node:assert/strict');
const { createServer } = require('../scripts/serve.cjs');
const { injectAuth } = require('./test-auth-helper.cjs');
const { launchBrowser } = require('./test-browser-helper.cjs');

(async () => {
  const server = createServer();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;

  try {
    browser = await launchBrowser({ headless: true });

    console.log('--- Starting Desktop & Responsive Home Screen Verification ---');

    // 1. Desktop Verification (1440x900)
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await injectAuth(context, 'member'); // authenticated member
      const p = await context.newPage();
      const pageErrors = [];
      p.on('pageerror', err => pageErrors.push(err.message));

      await p.goto(base + '/#Home');
      await p.getByRole('heading', { name: 'Home Dashboard' }).waitFor();

      // Populate isolated fixture so all 5 sections are present simultaneously
      await p.evaluate(() => {
        const todayStr = (typeof today === 'function' ? today() : '2026-09-18');
        // Ensure active leader of the week
        if (typeof db !== 'undefined' && db['Leader of the Week']) {
          db['Leader of the Week'].records = [
            { id: 'leader-fixture-1', fields: { Member: 'Dr. Leader Smith', Dates: `${todayStr} - 2030-12-31`, Week: 'Week 38', Comments: 'Active leadership' } }
          ];
        }
        // Ensure birthday today
        if (typeof db !== 'undefined' && db['Members']) {
          db['Members'].records = [
            ...(db['Members'].records || []),
            { id: 'member-bday-today', fields: { Name: 'Dr. Birthday Physician', Birthday: todayStr } }
          ];
        }
        // Ensure user commitment in next 7 days for current user
        if (typeof Identity !== 'undefined' && typeof db !== 'undefined' && db['Morning Report']) {
          const user = Identity.getCurrentUser();
          if (user && user.name) {
            db['Morning Report'].records = [
              { id: 'mr-commitment-fixture', fields: { Date: todayStr, Facilitator: user.name, Type: 'Virtual Morning Report' } },
              ...(db['Morning Report'].records || [])
            ];
          }
        }
        if (typeof render === 'function') render();
      });

      // Check strictly all 5 sections in exact order
      const allFiveSelectors = [
        '#my-commitments-widget',
        '#birthdays-today-section',
        '#home-next-vmrs',
        '.leader-banner',
        '#home-essential-resources'
      ];

      for (const sel of allFiveSelectors) {
        const count = await p.locator(sel).count();
        console.log(`Section ${sel} present count: ${count}`);
        assert(count > 0, `Expected section ${sel} to be present on Home`);
      }

      // Verify strict section order in DOM
      const positions = await p.evaluate(() => {
        const c = document.querySelector('#my-commitments-widget');
        const b = document.querySelector('#birthdays-today-section');
        const v = document.querySelector('#home-next-vmrs');
        const l = document.querySelector('.leader-banner');
        const r = document.querySelector('#home-essential-resources');

        return {
          commitments: c ? c.getBoundingClientRect().top : -1,
          birthdays: b ? b.getBoundingClientRect().top : -1,
          next7: v ? v.getBoundingClientRect().top : -1,
          leader: l ? l.getBoundingClientRect().top : -1,
          resources: r ? r.getBoundingClientRect().top : -1
        };
      });

      console.log('Section vertical positions on Desktop:', positions);
      assert(positions.commitments !== -1, 'Commitments present');
      assert(positions.birthdays !== -1, 'Birthdays present');
      assert(positions.next7 !== -1, 'Next 7 present');
      assert(positions.leader !== -1, 'Leader present');
      assert(positions.resources !== -1, 'Resources present');

      // Strict vertical order: 1 -> 2 -> 3 -> 4 -> 5
      assert(positions.commitments < positions.birthdays, 'Section 1 (Commitments) precedes Section 2 (Birthdays)');
      assert(positions.birthdays < positions.next7, 'Section 2 (Birthdays) precedes Section 3 (Next 7 VMRs)');
      assert(positions.next7 < positions.leader, 'Section 3 (Next 7 VMRs) precedes Section 4 (Leader of the Week)');
      assert(positions.leader < positions.resources, 'Section 4 (Leader) precedes Section 5 (Essential resources)');

      // Verify removed sections are completely absent
      const deadSections = [
        'Pinned for quick access',
        'Recently opened records',
        'Local storage & backup',
        'Recent local changes'
      ];
      const pageText = await p.innerText('#page');
      for (const title of deadSections) {
        assert(!pageText.includes(title), `Dead section "${title}" must not exist on Home`);
      }
      console.log('✓ Dead sections (pinned, recents, backup panels) confirmed removed from Home');

      // Check Next 7 VMRs stream has editorial cards and verify card geometry
      const editorialCards = await p.locator('#home-next-vmrs .mr-card').count();
      console.log(`Next 7 VMRs rendered ${editorialCards} editorial cards`);
      assert(editorialCards > 0 && editorialCards <= 7, 'Next 7 VMRs renders at most 7 editorial cards');

      // Geometry checks on the editorial cards: date width, staffing grid width, no overlap
      const cardGeom = await p.evaluate(() => {
        const card = document.querySelector('#home-next-vmrs .mr-card');
        if (!card) return null;
        const cRect = card.getBoundingClientRect();
        const dateEl = card.querySelector('.mr-card-date');
        const contentEl = card.querySelector('.mr-card-content');
        const staffingEl = card.querySelector('.mr-card-staffing') || card.querySelector('.mr-card-bypassed');
        const dRect = dateEl ? dateEl.getBoundingClientRect() : null;
        const contRect = contentEl ? contentEl.getBoundingClientRect() : null;
        const sRect = staffingEl ? staffingEl.getBoundingClientRect() : null;
        return {
          cardWidth: cRect.width,
          dateWidth: dRect ? dRect.width : 0,
          contentLeft: contRect ? contRect.left : 0,
          dateRight: dRect ? dRect.right : 0,
          staffingLeft: sRect ? sRect.left : 0,
          contentRight: contRect ? contRect.right : 0
        };
      });
      assert(cardGeom !== null, 'Card exists for geometry validation');
      assert(cardGeom.contentLeft >= cardGeom.dateRight - 1, 'Content column does not overlap date block');
      if (cardGeom.staffingLeft > 0) {
        assert(cardGeom.staffingLeft >= cardGeom.contentRight - 1, 'Staffing column does not overlap content block');
      }
      console.log('✓ Editorial card internal geometry and non-overlapping column bounds confirmed');

      // Check editorial card interactions on Home: click session title to open details dialog
      const firstCardTitle = p.locator('#home-next-vmrs .mr-card-title-btn').first();
      await firstCardTitle.click();
      await p.locator('#detail-dialog[open]').waitFor();
      console.log('✓ Editorial card details dialog opened cleanly from Home');
      await p.keyboard.press('Escape');

      // Check timezone disclosure on editorial cards
      if (await p.locator('#home-next-vmrs .mr-tz-popover-anchor').count() > 0) {
        await p.locator('#home-next-vmrs .mr-tz-popover-anchor').first().hover();
        assert(await p.locator('#home-next-vmrs .mr-tz-details').first().isVisible(), 'Timezone details disclosure visible on hover');
        console.log('✓ Timezone breakdown disclosure verified on Home editorial cards');
      }

      // Check Themes: Emerald, Cobalt, Plum in Light & Dark mode using data-mode attribute
      const themes = ['emerald', 'cobalt', 'plum'];
      for (const theme of themes) {
        // Light mode check
        await p.evaluate((t) => {
          document.documentElement.setAttribute('data-theme', t);
          document.documentElement.setAttribute('data-mode', 'light');
        }, theme);
        const lightBg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
        const lightSurface = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--surface').trim());

        // Dark mode check
        await p.evaluate((t) => {
          document.documentElement.setAttribute('data-theme', t);
          document.documentElement.setAttribute('data-mode', 'dark');
        }, theme);
        const darkBg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
        const darkSurface = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--surface').trim());

        assert.notEqual(lightBg, darkBg, `Theme ${theme}: Body background color must change between light and dark mode (light=${lightBg}, dark=${darkBg})`);
        assert.notEqual(lightSurface, darkSurface, `Theme ${theme}: --surface must change between light and dark mode`);

        for (const dark of [false, true]) {
          await p.evaluate(({ t, d }) => {
            document.documentElement.setAttribute('data-theme', t);
            document.documentElement.setAttribute('data-mode', d ? 'dark' : 'light');
          }, { t: theme, d: dark });
          const noOverflow = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
          assert(noOverflow, `Desktop layout overflow defect detected in theme: ${theme} (dark=${dark})`);
        }
      }
      console.log('✓ Themes (Emerald, Cobalt, Plum in Light/Dark via data-mode) verified with actual color changes and zero overflow');

      assert.deepEqual(pageErrors, [], `No uncaught page errors on Desktop: ${pageErrors.join(', ')}`);
      await context.close();
    }

    // 2. Responsive Usability Checks (Tablet 820px, Mobile 390px, 320px)
    for (const width of [820, 390, 320]) {
      const context = await browser.newContext({ viewport: { width, height: 800 } });
      await injectAuth(context, 'member');
      const p = await context.newPage();
      const pageErrors = [];
      p.on('pageerror', err => pageErrors.push(err.message));

      await p.goto(base + '/#Home');
      await p.getByRole('heading', { name: 'Home Dashboard' }).waitFor();

      const noOverflow = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
      assert(noOverflow, `Responsive layout overflow detected at width ${width}px: scrollWidth=${await p.evaluate(() => document.documentElement.scrollWidth)} vs innerWidth=${width}`);

      assert.deepEqual(pageErrors, [], `No page errors at width ${width}px`);
      console.log(`✓ Usability and zero-overflow regression verified at ${width}px`);
      await context.close();
    }

    console.log('--- ALL DESKTOP AND RESPONSIVE CHECKS PASSED CLEANLY ---');
  } finally {
    if (browser) await browser.close();
    await new Promise(r => server.close(r));
  }
})().catch(err => {
  console.error('FAILED:', err);
  process.exit(1);
});
