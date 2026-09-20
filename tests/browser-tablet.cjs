'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { createServer } = require('../scripts/serve.cjs');

const EDGE_PATH = process.env.CHROMIUM_PATH || (
  fs.existsSync('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe')
    ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    : 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
);

class CDPClient {
  constructor(ws) {
    this.ws = ws;
    this.id = 1;
    this.callbacks = new Map();
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.callbacks.has(msg.id)) {
        const { resolve, reject } = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    };
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(fnOrString) {
    const expression = typeof fnOrString === 'function' ? `(${fnOrString.toString()})()` : fnOrString;
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    }
    return res.result?.value;
  }
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function runAssertionsOnPage(width, evaluate) {
  // 1. Verify no document-level horizontal overflow
  const noOverflow = await evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  assert.ok(noOverflow, `${width}px: Document-level horizontal overflow detected`);

  // 2. Initial state verification
  const initGeom = await evaluate(() => {
    const container = document.querySelector('.matrix-container');
    const firstTh = document.querySelector('.matrix-table thead th:first-child');
    const firstTd = document.querySelector('.matrix-table tbody tr.matrix-row td:first-child');
    const cRect = container.getBoundingClientRect();
    const thRect = firstTh.getBoundingClientRect();
    const tdRect = firstTd.getBoundingClientRect();
    return {
      cLeft: cRect.left,
      cTop: cRect.top,
      thRelLeft: thRect.left - cRect.left,
      thRelTop: thRect.top - cRect.top,
      tdRelLeft: tdRect.left - cRect.left,
      thZIndex: parseInt(window.getComputedStyle(firstTh).zIndex || '0', 10),
      tdZIndex: parseInt(window.getComputedStyle(firstTd).zIndex || '0', 10)
    };
  });

  assert.ok(initGeom.thZIndex >= 10, `${width}px: Top-left th z-index must be >= 10, got ${initGeom.thZIndex}`);
  assert.ok(initGeom.tdZIndex >= 4, `${width}px: Sticky td z-index must be >= 4, got ${initGeom.tdZIndex}`);

  // 3. Horizontal scrolling keeps date-cell left stable
  const horizScroll = await evaluate(() => {
    const container = document.querySelector('.matrix-container');
    container.scrollLeft = 300;
    const cRect = container.getBoundingClientRect();
    const firstTh = document.querySelector('.matrix-table thead th:first-child');
    const firstTd = document.querySelector('.matrix-table tbody tr.matrix-row td:first-child');
    return {
      scrollLeft: container.scrollLeft,
      thRelLeft: firstTh.getBoundingClientRect().left - cRect.left,
      tdRelLeft: firstTd.getBoundingClientRect().left - cRect.left
    };
  });
  assert.ok(horizScroll.scrollLeft > 50, `${width}px: Container failed to scroll horizontally`);
  assert.ok(Math.abs(horizScroll.thRelLeft - initGeom.thRelLeft) <= 2, `${width}px: Top-left th left moved on horizontal scroll`);
  assert.ok(Math.abs(horizScroll.tdRelLeft - initGeom.tdRelLeft) <= 2, `${width}px: Date cell left moved on horizontal scroll`);

  // 4. Vertical scrolling keeps header top stable
  const vertScroll = await evaluate(() => {
    const container = document.querySelector('.matrix-container');
    container.scrollLeft = 0;
    container.scrollTop = 250;
    const cRect = container.getBoundingClientRect();
    const firstTh = document.querySelector('.matrix-table thead th:first-child');
    const secondTh = document.querySelector('.matrix-table thead th:nth-child(2)');
    return {
      scrollTop: container.scrollTop,
      th1RelTop: firstTh.getBoundingClientRect().top - cRect.top,
      th2RelTop: secondTh.getBoundingClientRect().top - cRect.top
    };
  });
  assert.ok(vertScroll.scrollTop > 50, `${width}px: Container failed to scroll vertically`);
  assert.ok(Math.abs(vertScroll.th1RelTop - initGeom.thRelTop) <= 2, `${width}px: Top-left th top moved on vertical scroll`);
  assert.ok(Math.abs(vertScroll.th2RelTop - initGeom.thRelTop) <= 2, `${width}px: Second th top moved on vertical scroll`);

  // 5. Intersecting scroll position (both horizontal and vertical)
  const intersect = await evaluate(() => {
    const container = document.querySelector('.matrix-container');
    container.scrollLeft = 250;
    container.scrollTop = 200;
    const cRect = container.getBoundingClientRect();
    const firstTh = document.querySelector('.matrix-table thead th:first-child');
    const thRect = firstTh.getBoundingClientRect();
    return {
      relLeft: thRect.left - cRect.left,
      relTop: thRect.top - cRect.top,
      text: (firstTh.textContent || firstTh.innerText || '').trim(),
      bg: window.getComputedStyle(firstTh).backgroundColor
    };
  });
  assert.ok(Math.abs(intersect.relLeft - initGeom.thRelLeft) <= 2, `${width}px: Intersection th left stable`);
  assert.ok(Math.abs(intersect.relTop - initGeom.thRelTop) <= 2, `${width}px: Intersection th top stable`);
  assert.ok(intersect.text.includes('Date'), `${width}px: Top-left header remains readable`);
  assert.notEqual(intersect.bg, 'rgba(0, 0, 0, 0)', `${width}px: Top-left th background must be opaque`);

  // 6. Action column reachability
  const actionReachable = await evaluate(() => {
    const container = document.querySelector('.matrix-container');
    container.scrollLeft = container.scrollWidth;
    const actions = document.querySelectorAll('.matrix-actions button, .matrix-slot-btn');
    let reachableCount = 0;
    const cRect = container.getBoundingClientRect();
    actions.forEach(btn => {
      const bRect = btn.getBoundingClientRect();
      if (bRect.right > cRect.left && bRect.left < cRect.right) {
        reachableCount++;
      }
    });
    return reachableCount;
  });
  assert.ok(actionReachable > 0, `${width}px: Controls must be reachable at right edge`);

  // 7. Both themes remain legible
  const themeChecks = await evaluate(() => {
    const firstTh = document.querySelector('.matrix-table thead th:first-child');
    const lightBg = window.getComputedStyle(firstTh).backgroundColor;
    const lightColor = window.getComputedStyle(firstTh).color;

    document.documentElement.setAttribute('data-theme', 'dark');
    const darkBg = window.getComputedStyle(firstTh).backgroundColor;
    const darkColor = window.getComputedStyle(firstTh).color;
    document.documentElement.removeAttribute('data-theme');

    return { lightBg, lightColor, darkBg, darkColor };
  });
  assert.notEqual(themeChecks.lightBg, 'rgba(0, 0, 0, 0)', 'Light theme th bg is opaque');
  assert.notEqual(themeChecks.darkBg, 'rgba(0, 0, 0, 0)', 'Dark theme th bg is opaque');
  assert.notEqual(themeChecks.lightBg, themeChecks.darkBg, 'Dark theme has different background token');
}

const { injectAuth, injectAuthCDP } = require('./test-auth-helper.cjs');

async function runWithCDP(baseUrl) {
  const DEBUG_PORT = 9225;
  const tempProfile = path.resolve(__dirname, '..', '.edge-tmp-tablet-profile');
  fs.mkdirSync(tempProfile, { recursive: true });

  const edgeProc = spawn(EDGE_PATH, [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${tempProfile}`,
    '--disable-gpu',
    '--no-first-run',
    'about:blank'
  ]);

  let ws = null;
  try {
    let versionInfo = null;
    for (let i = 0; i < 30; i++) {
      try {
        versionInfo = await fetchJson(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
        if (versionInfo) break;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    if (!versionInfo) throw new Error('Could not connect to Edge DevTools.');

    const targets = await fetchJson(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
    const pageTarget = targets.find((t) => t.type === 'page') || targets[0];
    ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    const cdp = new CDPClient(ws);

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await injectAuthCDP(cdp, 'admin');

    for (const width of [768, 820, 1024]) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width,
        height: 900,
        deviceScaleFactor: 2,
        mobile: false
      });
      await cdp.send('Page.navigate', { url: `${baseUrl}/#Morning%20Report` });
      for (let i = 0; i < 40; i++) {
        const loaded = await cdp.evaluate(() => {
          const btn = document.querySelector('[data-set-view="matrix"]');
          if (btn) btn.click();
          return !!document.querySelector('.matrix-container');
        });
        if (loaded) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      await runAssertionsOnPage(width, async (fn) => cdp.evaluate(fn));
      console.log(`✓ Tablet sticky matrix verified at ${width}px via Edge CDP`);
    }
  } finally {
    if (ws) ws.close();
    edgeProc.kill('SIGTERM');
  }
}

async function runWithPlaywright(baseUrl) {
  const { launchBrowser } = require('./test-browser-helper.cjs');
  const browser = await launchBrowser({ headless: true });
  try {
    for (const width of [768, 820, 1024]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await injectAuth(context, 'admin');
      const page = await context.newPage();
      await page.goto(baseUrl + '/#Morning%20Report');
      await page.locator('#page h1').waitFor();
      if (await page.locator('[data-set-view="matrix"]').count()) {
        await page.locator('[data-set-view="matrix"]').click();
      }
      await page.locator('.matrix-container').waitFor();
      await runAssertionsOnPage(width, async (fn) => page.evaluate(fn));
      await context.close();
      console.log(`✓ Tablet sticky matrix verified at ${width}px via Playwright`);
    }
  } finally {
    await browser.close();
  }
}

(async () => {
  const server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const serverPort = server.address().port;
  const baseUrl = `http://127.0.0.1:${serverPort}`;

  try {
    let hasPlaywright = false;
    try {
      require('playwright-core');
      hasPlaywright = true;
    } catch {}

    if (hasPlaywright) {
      console.log('Running tablet regression test via Playwright...');
      await runWithPlaywright(baseUrl);
    } else if (fs.existsSync(EDGE_PATH)) {
      console.log(`Running tablet regression test via Edge CDP (${EDGE_PATH})...`);
      await runWithCDP(baseUrl);
    } else {
      throw new Error('Neither Playwright nor Edge executable found.');
    }
    console.log('All tablet sticky header and date assertions passed.');
  } finally {
    await new Promise((r) => server.close(r));
  }
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
