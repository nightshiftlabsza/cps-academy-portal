const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createServer } = require('./serve.cjs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const SCREENSHOTS_DIR = path.resolve(__dirname, '..', 'screenshots');
const DEBUG_PORT = 9222;

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
}

async function waitForSelector(cdp, selector, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const res = await cdp.send('Runtime.evaluate', {
      expression: `!!document.querySelector(${JSON.stringify(selector)})`,
      returnByValue: true
    });
    if (res.result?.value) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Timed out waiting for selector: ${selector}`);
}

async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

(async () => {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  // 1. Start loopback HTTP server on an available ephemeral port
  const server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Server running at ${baseUrl}`);

  let edgeProc = null;
  const tempProfile = path.resolve(__dirname, '..', '.edge-tmp-profile');

  let ws = null;
  try {
    // 2. Launch headless Edge
    edgeProc = spawn(EDGE_PATH, [
      '--headless=new',
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${tempProfile}`,
      '--disable-gpu',
      '--no-first-run',
      'about:blank'
    ]);

    // Wait for DevTools endpoint to become available
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

    async function setViewport(width, height, mobile = false) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 2,
        mobile
      });
    }

    async function navigateTo(targetTab, readySelector) {
      await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          const t = ${JSON.stringify(targetTab)};
          if (typeof navigate === 'function') {
            navigate(t);
          } else {
            location.hash = encodeURIComponent(t);
          }
        })()`,
        awaitPromise: true
      });
      await waitForSelector(cdp, readySelector);
      await new Promise((r) => setTimeout(r, 400));
    }

    async function capture(filename) {
      const outPath = path.join(SCREENSHOTS_DIR, filename);
      const res = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(outPath, Buffer.from(res.data, 'base64'));
      console.log(`Saved: ${outPath}`);
    }

    // Initial load
    console.log('Loading portal...');
    await cdp.send('Page.navigate', { url: baseUrl });
    await waitForSelector(cdp, '.operational-grid');

    // --- Desktop Captures (1440 × 900) ---
    console.log('\nCapturing Desktop Views (1440x900)...');
    await setViewport(1440, 900, false);

    // 1. Desktop Home
    await navigateTo('Home', '.operational-grid');
    await capture('desktop-home.png');

    // 2. Desktop Morning Report (Weekly Agenda view)
    await navigateTo('Morning Report', '.matrix-view');
    await cdp.send('Runtime.evaluate', {
      expression: `document.querySelector('[data-set-view="agenda"]')?.click()`
    });
    await waitForSelector(cdp, '.agenda-view');
    await new Promise((r) => setTimeout(r, 300));
    await capture('desktop-morning-report.png');

    // 2b. Desktop Staffing Matrix (Clinical Matrix view from Feature 4)
    await cdp.send('Runtime.evaluate', {
      expression: `document.querySelector('[data-set-view="matrix"]')?.click()`
    });
    await waitForSelector(cdp, '.matrix-view');
    await new Promise((r) => setTimeout(r, 300));
    await capture('desktop-staffing-matrix.png');

    // 3. Desktop Podcast Board
    await navigateTo('Podcast Episodes', '.pipeline-auto');
    await capture('desktop-podcast-board.png');

    // 4. Desktop VMR Library
    await navigateTo('CPS Academy VMRs', '.hub-grid');
    await capture('desktop-vmr-library.png');

    // --- Mobile Captures (390 × 844) ---
    console.log('\nCapturing Mobile Views (390x844)...');
    await setViewport(390, 844, true);

    // 5. Mobile Home
    await navigateTo('Home', '.operational-grid');
    await capture('mobile-home.png');

    // 6. Mobile Morning Report (Agenda cards with single-tap assignment buttons)
    await navigateTo('Morning Report', '.matrix-view');
    await cdp.send('Runtime.evaluate', {
      expression: `document.querySelector('[data-set-view="agenda"]')?.click()`
    });
    await waitForSelector(cdp, '.agenda-view');
    await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const gapCard = document.querySelector('.gap-action-btn')?.closest('.agenda-card') || document.querySelector('.agenda-card');
        if (gapCard) gapCard.scrollIntoView({ block: 'center', behavior: 'instant' });
      })()`
    });
    await new Promise((r) => setTimeout(r, 250));
    await capture('mobile-morning-report.png');

    // 7. Mobile Edit Sheet
    console.log('Opening mobile edit sheet...');
    await cdp.send('Runtime.evaluate', {
      expression: `document.querySelector('[data-open]').click()`
    });
    await waitForSelector(cdp, '#detail-dialog[open]');
    await new Promise((r) => setTimeout(r, 400));
    await capture('mobile-edit-sheet.png');

    console.log('\nAll captures successfully completed!');
    try {
      fs.rmSync(tempProfile, { recursive: true, force: true });
    } catch {}
    process.exit(0);
  } finally {
    if (ws) {
      try { ws.close(); } catch {}
    }
    if (edgeProc) {
      edgeProc.kill();
    }
    await new Promise((r) => server.close(r));
    try {
      fs.rmSync(tempProfile, { recursive: true, force: true });
    } catch {}
  }
})().catch((err) => {
  console.error('Capture failed:', err);
  process.exit(1);
});
