'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const { createServer } = require('./serve.cjs');
const { injectAuth } = require('../tests/test-auth-helper.cjs');

const ROOT_DIR = path.resolve(__dirname, '..');
const VISUAL_QA_DIR = path.resolve(ROOT_DIR, 'screenshots', 'visual-qa');

const EDGE_PATH = process.env.CHROMIUM_PATH || (
  fs.existsSync('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe')
    ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    : fs.existsSync('C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe')
      ? 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
      : undefined
);

const STANDARD_VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844, isMobile: true },
  { name: 'tablet', width: 820, height: 900, isMobile: false },
  { name: 'desktop', width: 1280, height: 800, isMobile: false }
];

function parseArgs(args) {
  let route = 'Home';
  let theme = 'emerald';
  let mode = 'light';
  let auth = 'admin';
  let fullPage = false;

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
    } else if (!arg.startsWith('-')) {
      route = arg.replace(/^#/, '');
    }
  }
  return { route, theme, mode, auth, fullPage };
}

(async () => {
  const { route, theme, mode, auth, fullPage } = parseArgs(process.argv.slice(2));
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
    browser = await chromium.launch({
      headless: true,
      ...(EDGE_PATH ? { executablePath: EDGE_PATH } : {})
    });

    console.log(`\n=== Visual Self-QA Capture: Route "${route}" [Theme: ${theme}, Mode: ${mode}, Auth: ${auth}] ===`);

    const sanitizedRoute = route.replace(/[^a-zA-Z0-9_-]/g, '-');
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
      page.on('pageerror', (err) => pageErrors.push(err.message));

      const targetUrl = `${baseUrl}/#${encodeURIComponent(route)}`;
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

      // Wait for route container / heading
      try {
        await page.locator('#page h1, #page h2, #page .page-header, .agenda-view, .matrix-view, .hub-grid')
          .first()
          .waitFor({ timeout: 8000 });
      } catch {
        console.warn(`Note: Specific content locator not observed within 8s for route "${route}"; waiting for DOM idle.`);
      }

      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);

      // Check DOM metrics
      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1
      }));

      const filename = `${sanitizedRoute}-${vp.width}.png`;
      const outPath = path.join(VISUAL_QA_DIR, filename);

      await page.screenshot({
        path: outPath,
        fullPage: false
      });

      capturedFiles.push(outPath);
      console.log(`✓ [${vp.name.toUpperCase()} ${vp.width}px] Captured -> ${path.relative(ROOT_DIR, outPath)} ${metrics.hasHorizontalOverflow ? '⚠️  WARNING: Horizontal overflow detected!' : '(no overflow)'}`);

      if (fullPage) {
        const fullFilename = `${sanitizedRoute}-${vp.width}-full.png`;
        const fullOutPath = path.join(VISUAL_QA_DIR, fullFilename);
        await page.screenshot({ path: fullOutPath, fullPage: true });
        capturedFiles.push(fullOutPath);
        console.log(`  └─ Full page -> ${path.relative(ROOT_DIR, fullOutPath)}`);
      }

      if (pageErrors.length > 0) {
        console.warn(`  ⚠️ Page console errors:`, pageErrors);
      }

      await context.close();
    }

    console.log(`\nVisual capture complete! ${capturedFiles.length} screenshots saved to ${path.relative(ROOT_DIR, VISUAL_QA_DIR)}`);
    console.log(`Next step for agent: Inspect each screenshot using view_file before completing UI changes.`);
  } finally {
    await cleanup();
  }
})().catch((err) => {
  console.error('Visual capture error:', err);
  process.exit(1);
});
