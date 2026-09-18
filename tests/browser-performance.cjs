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

async function runPerformanceAudit() {
  console.log('='.repeat(60));
  console.log('CPS ACADEMY PORTAL - BROWSER PERFORMANCE & WINDOWING AUDIT');
  console.log('='.repeat(60));

  if (!fs.existsSync(EDGE_PATH)) {
    console.log(`[SKIP] Edge executable not found at ${EDGE_PATH}`);
    return;
  }

  // 1. Start test server
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Test server running at ${baseUrl}`);

  const debugPort = 9224;
  const tmpProfile = path.join(__dirname, '..', '.edge-perf-profile');
  if (fs.existsSync(tmpProfile)) fs.rmSync(tmpProfile, { recursive: true, force: true });

  const edgeProc = spawn(EDGE_PATH, [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${tmpProfile}`,
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ]);

  let cdp = null;

  try {
    // 2. Connect CDP
    let versionData = null;
    for (let i = 0; i < 30; i++) {
      try {
        versionData = await fetchJson(`http://127.0.0.1:${debugPort}/json/version`);
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    assert.ok(versionData, 'CDP connection failed');

    const targets = await fetchJson(`http://127.0.0.1:${debugPort}/json/list`);
    const pageTarget = targets.find((t) => t.type === 'page') || targets[0];
    assert.ok(pageTarget, 'No page target found');

    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });
    cdp = new CDPClient(ws);

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    const { injectAuthCDP } = require('./test-auth-helper.cjs');
    await injectAuthCDP(cdp, 'admin');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1024,
      height: 768,
      deviceScaleFactor: 1,
      mobile: false
    });

    // 3. Navigate to Morning Report Matrix
    await cdp.send('Page.navigate', { url: `${baseUrl}/#Morning%20Report` });
    for (let i = 0; i < 50; i++) {
      const ready = await cdp.evaluate(() => (typeof db !== 'undefined' && db && Object.keys(db).length > 0));
      if (ready) break;
      await new Promise((r) => setTimeout(r, 100));
    }

    // Ensure full historical records are rendered
    await cdp.evaluate(() => {
      if (typeof mode !== 'undefined') mode = 'matrix';
      if (typeof mrScheduleRangeMode !== 'undefined') mrScheduleRangeMode = 'all';
      if (typeof filter !== 'undefined') {
        filter = 'All history';
        if (typeof render === 'function') render();
      }
    });

    for (let i = 0; i < 50; i++) {
      const hasRows = await cdp.evaluate(() => (document.querySelectorAll('.matrix-table tbody tr').length > 0));
      if (hasRows) break;
      await new Promise((r) => setTimeout(r, 100));
    }

    // 4. Measure initial windowed DOM node count
    const initialStats = await cdp.evaluate(() => {
      const container = document.querySelector('.matrix-container');
      const table = document.querySelector('.matrix-table');
      const tbody = table ? table.querySelector('tbody') : null;
      const rows = tbody ? Array.from(tbody.querySelectorAll('tr')) : [];
      const spacerTop = tbody ? tbody.querySelector('.matrix-spacer-row.spacer-top') : null;
      const spacerBottom = tbody ? tbody.querySelector('.matrix-spacer-row.spacer-bottom') : null;
      const toggleBtn = document.querySelector('#matrix-window-toggle-btn');

      return {
        hasContainer: Boolean(container),
        hasTable: Boolean(table),
        totalRenderedRows: rows.length,
        hasTopSpacer: Boolean(spacerTop),
        hasBottomSpacer: Boolean(spacerBottom),
        bottomSpacerHeight: spacerBottom ? parseFloat(spacerBottom.style.height || '0') : 0,
        hasToggleBtn: Boolean(toggleBtn),
        toggleBtnText: toggleBtn ? toggleBtn.textContent.trim() : ''
      };
    });

    console.log('\n[Initial Matrix View Audit]');
    console.log(`Rendered DOM rows: ${initialStats.totalRenderedRows}`);
    console.log(`Bottom spacer height: ${initialStats.bottomSpacerHeight}px`);
    console.log(`Toggle button label: "${initialStats.toggleBtnText}"`);

    assert.ok(initialStats.hasContainer, 'Matrix container exists');
    assert.ok(initialStats.hasTable, 'Matrix table exists');
    assert.ok(initialStats.totalRenderedRows <= 100, `DOM rows must be bounded (< 100), got ${initialStats.totalRenderedRows}`);
    assert.ok(initialStats.hasBottomSpacer, 'Bottom virtual spacer must be present');
    assert.ok(initialStats.bottomSpacerHeight > 5000, `Bottom spacer height must represent remaining items, got ${initialStats.bottomSpacerHeight}`);

    // 5. Scroll downwards and verify dynamic windowing updates
    const scrollStats = await cdp.evaluate(() => {
      const container = document.querySelector('.matrix-container');
      container.scrollTop = 2500;
      container.dispatchEvent(new Event('scroll'));
      return { scrollTop: container.scrollTop };
    });

    let postScrollStats = null;
    for (let i = 0; i < 20; i++) {
      postScrollStats = await cdp.evaluate(() => {
        const tbody = document.querySelector('.matrix-table tbody');
        const spacerTop = tbody.querySelector('.matrix-spacer-row.spacer-top');
        const spacerBottom = tbody.querySelector('.matrix-spacer-row.spacer-bottom');
        const rows = tbody.querySelectorAll('tr:not(.matrix-spacer-row)');

        return {
          renderedRows: rows.length,
          topSpacerHeight: spacerTop ? parseFloat(spacerTop.style.height || '0') : 0,
          bottomSpacerHeight: spacerBottom ? parseFloat(spacerBottom.style.height || '0') : 0
        };
      });
      if (postScrollStats && postScrollStats.topSpacerHeight > 0) break;
      await new Promise((r) => setTimeout(r, 100));
    }

    console.log('\n[Post-Scroll Audit]');
    console.log(`Top spacer height after scroll: ${postScrollStats.topSpacerHeight}px`);
    console.log(`Rendered rows: ${postScrollStats.renderedRows}`);

    assert.ok(postScrollStats.topSpacerHeight > 0, 'Top spacer must grow after scrolling down');
    assert.ok(postScrollStats.renderedRows <= 100, 'Rendered rows must remain bounded after scroll');

    // 6. Test "Show all for Find (Ctrl+F)" toggle
    await cdp.evaluate(() => {
      const btn = document.querySelector('#matrix-window-toggle-btn');
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 500));

    const expandedStats = await cdp.evaluate(() => {
      const tbody = document.querySelector('.matrix-table tbody');
      const rows = tbody.querySelectorAll('tr:not(.matrix-spacer-row)');
      const spacers = tbody.querySelectorAll('.matrix-spacer-row');
      const toggleBtn = document.querySelector('#matrix-window-toggle-btn');

      return {
        renderedRows: rows.length,
        spacerCount: spacers.length,
        btnText: toggleBtn ? toggleBtn.textContent.trim() : ''
      };
    });

    console.log('\n[Expanded "Show all" Audit]');
    console.log(`Rendered rows in expanded mode: ${expandedStats.renderedRows}`);
    console.log(`Active spacers: ${expandedStats.spacerCount}`);
    console.log(`Toggle button label: "${expandedStats.btnText}"`);

    assert.ok(expandedStats.renderedRows > 200, `Expanded mode must mount all rows, got ${expandedStats.renderedRows}`);
    assert.equal(expandedStats.spacerCount, 0, 'Spacers must be absent in expanded mode');

    // 7. Collapse back to virtualized scrolling
    await cdp.evaluate(() => {
      const btn = document.querySelector('#matrix-window-toggle-btn');
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 300));

    const collapsedStats = await cdp.evaluate(() => {
      const tbody = document.querySelector('.matrix-table tbody');
      const rows = tbody.querySelectorAll('tr:not(.matrix-spacer-row)');
      return { renderedRows: rows.length };
    });

    console.log('\n[Collapsed Window Audit]');
    console.log(`Rendered rows restored to: ${collapsedStats.renderedRows}`);
    assert.ok(collapsedStats.renderedRows <= 100, 'Collapsed mode must restore bounded row count');

    console.log('\n' + '='.repeat(60));
    console.log('✓ ALL BROWSER PERFORMANCE & WINDOWING ASSERTIONS PASSED');
    console.log('='.repeat(60));
  } finally {
    if (edgeProc) {
      try { edgeProc.kill('SIGKILL'); } catch {}
    }
    server.close();
    await new Promise(r => setTimeout(r, 600));
    try {
      if (fs.existsSync(tmpProfile)) fs.rmSync(tmpProfile, { recursive: true, force: true });
    } catch {}
  }
}

if (require.main === module) {
  runPerformanceAudit().catch((err) => {
    console.error('Audit failed:', err);
    process.exit(1);
  });
}

module.exports = { runPerformanceAudit };
