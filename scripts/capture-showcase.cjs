const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createServer } = require('./serve.cjs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const SHOWCASE_DIR = path.resolve(__dirname, '..', 'screenshots', 'showcase');
const DEBUG_PORT = 9223;

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

async function isPortOpen(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
      resolve(res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(600, () => {
      req.destroy();
      resolve(false);
    });
  });
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
  fs.mkdirSync(SHOWCASE_DIR, { recursive: true });

  // 1. Check or start local server
  let server = null;
  let targetPort = 8080;
  if (await isPortOpen(8080)) {
    console.log('Connected to existing server on port 8080');
  } else {
    server = createServer();
    try {
      await new Promise((resolve, reject) => {
        server.listen(8080, '127.0.0.1', resolve);
        server.on('error', reject);
      });
      console.log('Started server on port 8080');
    } catch {
      server = createServer();
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      targetPort = server.address().port;
      console.log(`Started server on fallback port ${targetPort}`);
    }
  }
  const baseUrl = `http://127.0.0.1:${targetPort}`;

  let edgeProc = null;
  const tempProfile = path.resolve(__dirname, '..', '.edge-showcase-profile');
  let ws = null;

  try {
    // 2. Launch headless Edge with remote debugging
    edgeProc = spawn(EDGE_PATH, [
      '--headless=new',
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${tempProfile}`,
      '--disable-gpu',
      '--no-first-run',
      'about:blank'
    ]);

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

    async function waitReadyAndCapture(filename) {
      await cdp.send('Runtime.evaluate', {
        expression: `document.fonts.ready`,
        awaitPromise: true
      });
      await new Promise((r) => setTimeout(r, 350));
      const outPath = path.join(SHOWCASE_DIR, filename);
      const res = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(outPath, Buffer.from(res.data, 'base64'));
      const stats = fs.statSync(outPath);
      console.log(`Captured: ${filename} (${stats.size} bytes)`);
    }

    async function navigateTo(targetTab, readySelector) {
      await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          const t = ${JSON.stringify(targetTab)};
          if (typeof navigate === 'function') navigate(t);
          else location.hash = encodeURIComponent(t);
        })()`,
        awaitPromise: true
      });
      await waitForSelector(cdp, readySelector);
    }

    // Initial load and inject session identity
    console.log('Loading portal...');
    await cdp.send('Page.navigate', { url: baseUrl });
    await waitForSelector(cdp, '.operational-grid');

    await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        localStorage.setItem('currentUser', 'Zakariyya G');
        sessionStorage.setItem('cps-mock-identity', JSON.stringify({ id: 'zg', name: 'Zakariyya G' }));
        if (window.Identity) {
          window.Identity.setMockUser({ id: 'zg', name: 'Zakariyya G' });
        }
        if (typeof render === 'function') render();
      })()`,
      awaitPromise: true
    });

    // --- 1. Desktop Showcase (1440 × 900, 2x) ---
    console.log('\n--- Capturing Desktop Showcase (1440x900) ---');
    await setViewport(1440, 900, false);

    // 01-desktop-home.png
    await navigateTo('Home', '.operational-grid');
    await waitReadyAndCapture('01-desktop-home.png');

    // 02-desktop-staffing-matrix.png
    await navigateTo('Morning Report', '.matrix-view');
    await cdp.send('Runtime.evaluate', {
      expression: `document.querySelector('[data-set-view="matrix"]')?.click()`
    });
    await waitForSelector(cdp, '.matrix-view');
    await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const target = document.querySelector('.matrix-card') || document.querySelector('.matrix-table');
        if (target) {
          const y = target.getBoundingClientRect().top + window.scrollY - 84;
          window.scrollTo({ top: Math.max(0, y), behavior: 'instant' });
        }
      })()`
    });
    await waitReadyAndCapture('02-desktop-staffing-matrix.png');

    // 03-desktop-weekly-agenda.png
    await cdp.send('Runtime.evaluate', {
      expression: `document.querySelector('[data-set-view="agenda"]')?.click()`
    });
    await waitForSelector(cdp, '.agenda-view');
    await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const target = document.querySelector('.agenda-week') || document.querySelector('.agenda-card');
        if (target) {
          const y = target.getBoundingClientRect().top + window.scrollY - 84;
          window.scrollTo({ top: Math.max(0, y), behavior: 'instant' });
        }
      })()`
    });
    await waitReadyAndCapture('03-desktop-weekly-agenda.png');

    // 04-desktop-production-kanban.png
    await navigateTo('Podcast Episodes', '.pipeline-auto');
    await waitReadyAndCapture('04-desktop-production-kanban.png');

    // 05-desktop-vmr-archive.png
    await navigateTo('CPS Academy VMRs', '.hub-grid');
    await waitReadyAndCapture('05-desktop-vmr-archive.png');

    // --- 2. Mobile Showcase (390 × 844, 2x) ---
    console.log('\n--- Capturing Mobile Showcase (390x844) ---');
    await setViewport(390, 844, true);

    // 06-mobile-home.png
    await navigateTo('Home', '.operational-grid');
    await waitReadyAndCapture('06-mobile-home.png');

    // 07-mobile-schedule-agenda.png
    await navigateTo('Morning Report', '.matrix-view');
    await cdp.send('Runtime.evaluate', {
      expression: `document.querySelector('[data-set-view="agenda"]')?.click()`
    });
    await waitForSelector(cdp, '.agenda-view');
    await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const target = document.querySelector('.agenda-card .staffing-role') || document.querySelector('.agenda-card');
        if (target) target.scrollIntoView({ block: 'center', behavior: 'instant' });
      })()`
    });
    await waitReadyAndCapture('07-mobile-schedule-agenda.png');

    // 08-mobile-quick-claim.png
    console.log('Opening quick-claim dialog on mobile...');
    await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const list = typeof records === 'function' ? records('Morning Report') : [];
        const r = list.find(x => x.id) || list[0];
        if (r && typeof openQuickClaim === 'function') {
          openQuickClaim(r.id, 'Presenter');
        } else {
          const btn = document.querySelector('.agenda-card [data-open]');
          if (btn) btn.click();
        }
      })()`,
      awaitPromise: true
    });
    await waitForSelector(cdp, '#quick-claim-dialog[open], #detail-dialog[open]');
    await waitReadyAndCapture('08-mobile-quick-claim.png');

    console.log('\nAll showcase screenshots successfully generated!');
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
    if (server) {
      await new Promise((r) => server.close(r));
    }
    try {
      fs.rmSync(tempProfile, { recursive: true, force: true });
    } catch {}
  }
})().catch((err) => {
  console.error('Showcase capture failed:', err);
  process.exit(1);
});
