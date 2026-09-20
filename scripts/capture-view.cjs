'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createServer } = require('./serve.cjs');
const { injectAuth } = require('../tests/test-auth-helper.cjs');
const {
  launchBrowser,
  checkGeometricOverflow,
  verifyRouteLoaded
} = require('../tests/test-browser-helper.cjs');

const ROOT_DIR = path.resolve(__dirname, '..');
// Screenshots are saved in screenshots/visual-qa/ which is NOT in the static serve allowlist or dist bundle
const VISUAL_QA_DIR = path.resolve(ROOT_DIR, 'screenshots', 'visual-qa');

const STANDARD_VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844, isMobile: true },
  { name: 'tablet', width: 820, height: 900, isMobile: false },
  { name: 'desktop', width: 1280, height: 800, isMobile: false }
];

// Specific documented benign errors that should not cause false-positive failures
// (e.g. browser favicon 404s or mock sync warnings). Blanket suppression is strictly forbidden.
const DOCUMENTED_EXPECTED_ERRORS = [
  /favicon\.ico.*404/i,
  /Failed to load resource.*favicon/i
];

function isDocumentedExpectedError(message) {
  return DOCUMENTED_EXPECTED_ERRORS.some((pattern) => pattern.test(message));
}

function parseArgs(args) {
  let route = 'Home';
  let theme = 'emerald';
  let mode = 'light';
  let auth = 'admin';
  let fullPage = false;
  let clickSelector = null;
  let fillInput = null; // { selector, value }
  let waitForSelector = null;
  let customLabel = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--full-page' || arg === '-f') {
      fullPage = true;
    } else if (arg === '--theme' && args[i + 1]) {
      theme = args[++i];
    } else if (arg === '--mode' && args[i + 1]) {
      mode = args[++i];
    } else if (arg === '--auth' && args[i + 1]) {
      auth = args[++i];
    } else if (arg === '--click' && args[i + 1]) {
      clickSelector = args[++i];
    } else if (arg === '--fill' && args[i + 1]) {
      const expr = args[++i];
      const eqIdx = expr.indexOf('=');
      if (eqIdx !== -1) {
        fillInput = {
          selector: expr.slice(0, eqIdx).trim(),
          value: expr.slice(eqIdx + 1)
        };
      }
    } else if (arg === '--wait-for' && args[i + 1]) {
      waitForSelector = args[++i];
    } else if (arg === '--label' && args[i + 1]) {
      customLabel = args[++i].replace(/[^a-zA-Z0-9_-]/g, '-');
    } else if (!arg.startsWith('-')) {
      route = arg.replace(/^#/, '');
    }
  }

  return { route, theme, mode, auth, fullPage, clickSelector, fillInput, waitForSelector, customLabel };
}

(async () => {
  const {
    route,
    theme,
    mode,
    auth,
    fullPage,
    clickSelector,
    fillInput,
    waitForSelector,
    customLabel
  } = parseArgs(process.argv.slice(2));

  fs.mkdirSync(VISUAL_QA_DIR, { recursive: true });

  const server = createServer();
  server.on('error', (err) => {
    console.error('Local server error:', err);
  });
  await new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', resolve);
    server.once('error', reject);
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  let browser;
  const cleanup = async () => {
    if (browser) {
      try { await browser.close(); } catch {}
      browser = null;
    }
    if (server && server.listening) {
      try {
        if (typeof server.closeAllConnections === 'function') {
          server.closeAllConnections();
        }
        await new Promise((resolve) => server.close(resolve));
      } catch {}
    }
  };

  process.on('SIGINT', async () => {
    await cleanup();
    process.exit(130);
  });
  process.on('SIGTERM', async () => {
    await cleanup();
    process.exit(143);
  });

  try {
    browser = await launchBrowser({ headless: true });

    console.log(`\n=== Visual Self-QA Capture: Route "${route}" [Theme: ${theme}, Mode: ${mode}, Auth: ${auth}] ===`);
    if (customLabel) console.log(`Interaction label: "${customLabel}"`);

    const sanitizedRoute = route.replace(/[^a-zA-Z0-9_-]/g, '-');
    const labelSuffix = customLabel ? `-${customLabel}` : '';
    const capturedFiles = [];

    for (const vp of STANDARD_VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        isMobile: vp.isMobile,
        serviceWorkers: 'block'
      });

      if (auth !== 'none') {
        await injectAuth(context, auth);
      }

      await context.addInitScript(({ theme, mode }) => {
        try {
          const KEY = 'cps-hub-appearance-v1';
          localStorage.setItem(KEY, JSON.stringify({ theme, mode }));
        } catch {}
      }, { theme, mode });

      const page = await context.newPage();
      const pageErrors = [];
      const consoleErrors = [];

      page.on('pageerror', (err) => {
        const msg = String(err?.message || err);
        if (!isDocumentedExpectedError(msg)) {
          pageErrors.push(msg);
        }
      });

      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          const text = msg.text();
          if (!isDocumentedExpectedError(text)) {
            consoleErrors.push(text);
          }
        }
      });

      const targetUrl = `${baseUrl}/#${encodeURIComponent(route)}`;
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

      // 1. Confirm requested route loaded (fail if route does not render or falls back to Home)
      try {
        await page.waitForSelector('#page', { timeout: 8000 });
        const routeStatus = await verifyRouteLoaded(page, route);
        if (!routeStatus.loaded) {
          throw new Error(routeStatus.reason || `Route "${route}" failed to load`);
        }
      } catch (err) {
        // Save failure screenshot before exiting
        const failPath = path.join(VISUAL_QA_DIR, `FAILURE-${sanitizedRoute}${labelSuffix}-${vp.width}.png`);
        try { await page.screenshot({ path: failPath, fullPage: false }); } catch {}
        console.error(`\n❌ ROUTE LOAD VERIFICATION FAILED [${vp.name} ${vp.width}px]:`, err.message);
        console.error(`Diagnostic screenshot saved to: ${path.relative(ROOT_DIR, failPath)}`);
        await context.close();
        process.exit(1);
      }

      // 2. Perform simple ordered interaction states if requested
      if (fillInput) {
        try {
          const loc = page.locator(fillInput.selector).first();
          await loc.waitFor({ timeout: 5000 });
          await loc.fill(fillInput.value);
          await page.waitForTimeout(200);
        } catch (err) {
          console.error(`❌ Interaction error: Failed to fill "${fillInput.selector}": ${err.message}`);
          await context.close();
          process.exit(1);
        }
      }

      if (clickSelector) {
        try {
          const loc = page.locator(clickSelector).first();
          await loc.waitFor({ timeout: 5000 });
          await loc.click();
          await page.waitForTimeout(300);
        } catch (err) {
          console.error(`❌ Interaction error: Failed to click "${clickSelector}": ${err.message}`);
          await context.close();
          process.exit(1);
        }
      }

      if (waitForSelector) {
        try {
          await page.locator(waitForSelector).first().waitFor({ timeout: 6000 });
        } catch (err) {
          console.error(`❌ Interaction error: Target "${waitForSelector}" did not appear: ${err.message}`);
          await context.close();
          process.exit(1);
        }
      }

      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);

      // 3. Fail on unexpected page errors or console errors
      if (pageErrors.length > 0 || consoleErrors.length > 0) {
        const failPath = path.join(VISUAL_QA_DIR, `FAILURE-${sanitizedRoute}${labelSuffix}-${vp.width}.png`);
        try { await page.screenshot({ path: failPath, fullPage: false }); } catch {}
        console.error(`\n❌ CONSOLE/PAGE ERROR DEFECT DETECTED [${vp.name} ${vp.width}px]`);
        if (pageErrors.length > 0) console.error('  Page errors:', pageErrors);
        if (consoleErrors.length > 0) console.error('  Console errors:', consoleErrors);
        console.error(`Diagnostic screenshot saved to: ${path.relative(ROOT_DIR, failPath)}`);
        await context.close();
        process.exit(1);
      }

      // 4. Fail on unintended geometric page overflow (preserving internal scrolling containers)
      try {
        await checkGeometricOverflow(page, `${vp.name} (${vp.width}px)`);
      } catch (err) {
        const failPath = path.join(VISUAL_QA_DIR, `FAILURE-${sanitizedRoute}${labelSuffix}-${vp.width}.png`);
        try { await page.screenshot({ path: failPath, fullPage: false }); } catch {}
        console.error(`\n❌ GEOMETRIC OVERFLOW DEFECT DETECTED [${vp.name} ${vp.width}px]:`, err.message);
        console.error(`Diagnostic screenshot saved to: ${path.relative(ROOT_DIR, failPath)}`);
        await context.close();
        process.exit(1);
      }

      // 5. Capture screenshots
      const filename = `${sanitizedRoute}${labelSuffix}-${vp.width}.png`;
      const outPath = path.join(VISUAL_QA_DIR, filename);

      await page.screenshot({
        path: outPath,
        fullPage: false
      });

      capturedFiles.push(outPath);
      console.log(`✓ [${vp.name.toUpperCase()} ${vp.width}px] Captured -> ${path.relative(ROOT_DIR, outPath)} (verified: route loaded, zero page overflow, zero console errors)`);

      if (fullPage) {
        const fullFilename = `${sanitizedRoute}${labelSuffix}-${vp.width}-full.png`;
        const fullOutPath = path.join(VISUAL_QA_DIR, fullFilename);
        await page.screenshot({ path: fullOutPath, fullPage: true });
        capturedFiles.push(fullOutPath);
        console.log(`  └─ Full page -> ${path.relative(ROOT_DIR, fullOutPath)}`);
      }

      await context.close();
    }

    console.log(`\nCapture complete: ${capturedFiles.length} screenshots saved to ${path.relative(ROOT_DIR, VISUAL_QA_DIR)}`);
    console.log('─────────────────────────────────────────────────────────────────────────────');
    console.log('⚠️  IMPORTANT VISUAL-QA NOTICE:');
    console.log('A successful screenshot write is NOT a visual-quality pass.');
    console.log('The agent must inspect each captured image directly using image viewing tools');
    console.log('to confirm visual hierarchy, text legibility, contrast, and absence of clipping.');
    console.log('─────────────────────────────────────────────────────────────────────────────\n');
  } finally {
    await cleanup();
  }
})().catch((err) => {
  console.error('\nVisual capture error:', err.message);
  process.exit(1);
});
