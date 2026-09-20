'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  resolveBrowserExecutable,
  checkBrowserTooling,
  checkGeometricOverflow,
  verifyRouteLoaded
} = require('./test-browser-helper.cjs');

// -------------------------------------------------------------
// 1. Browser Selection & CHROMIUM_PATH Failure Detection Tests
// -------------------------------------------------------------

test('tooling-safety: resolveBrowserExecutable throws clear error when CHROMIUM_PATH is invalid', () => {
  const origEnv = process.env.CHROMIUM_PATH;
  try {
    process.env.CHROMIUM_PATH = path.resolve(__dirname, 'nonexistent-browser-binary.exe');
    assert.throws(() => {
      resolveBrowserExecutable();
    }, /CHROMIUM_PATH is explicitly set to .* but this file does not exist/);
  } finally {
    if (origEnv !== undefined) process.env.CHROMIUM_PATH = origEnv;
    else delete process.env.CHROMIUM_PATH;
  }
});

test('tooling-safety: checkBrowserTooling reports isReady=false when CHROMIUM_PATH is invalid', () => {
  const origEnv = process.env.CHROMIUM_PATH;
  try {
    process.env.CHROMIUM_PATH = path.resolve(__dirname, 'nonexistent-browser-binary.exe');
    const tooling = checkBrowserTooling();
    assert.equal(tooling.isReady, false);
    assert.ok(tooling.executableError);
    assert.match(tooling.executableError, /does not exist/);
  } finally {
    if (origEnv !== undefined) process.env.CHROMIUM_PATH = origEnv;
    else delete process.env.CHROMIUM_PATH;
  }
});

// -------------------------------------------------------------
// 2. Route Verification & Fallback Detection Tests
// -------------------------------------------------------------

test('tooling-safety: verifyRouteLoaded fails when invalid route is requested', async () => {
  const mockPage = {
    locator: () => ({
      first: () => ({ waitFor: async () => {} })
    }),
    evaluate: async (fn, arg) => {
      // Simulate browser environment with db and page
      const originalWindow = global.window;
      const originalDoc = global.document;
      const originalTab = global.tab;
      const originalDb = global.db;

      try {
        global.db = { 'Morning Report': {}, 'OrgStructure': {} };
        global.tab = 'Home'; // Did not switch because route is invalid
        global.document = {
          querySelector: (sel) => {
            if (sel.includes('h1')) return { innerText: 'Home Dashboard' };
            if (sel === '#page') return { children: [1] };
            return null;
          }
        };
        return fn(arg);
      } finally {
        global.window = originalWindow;
        global.document = originalDoc;
        global.tab = originalTab;
        global.db = originalDb;
      }
    }
  };

  const res = await verifyRouteLoaded(mockPage, 'NonexistentRoute123');
  assert.equal(res.loaded, false);
  assert.match(res.reason, /not recognized as a valid portal view/);
});

test('tooling-safety: verifyRouteLoaded detects silent fallback to Home Dashboard', async () => {
  const mockPage = {
    locator: () => ({
      first: () => ({ waitFor: async () => {} })
    }),
    evaluate: async (fn, arg) => {
      const originalDoc = global.document;
      const originalTab = global.tab;
      const originalDb = global.db;

      try {
        global.db = { 'Morning Report': {} };
        global.tab = 'Home'; // Fallback occurred
        global.document = {
          querySelector: (sel) => {
            if (sel.includes('h1')) return { innerText: 'Home Dashboard' };
            if (sel === '#page') return { children: [1] };
            return null;
          }
        };
        return fn(arg);
      } finally {
        global.document = originalDoc;
        global.tab = originalTab;
        global.db = originalDb;
      }
    }
  };

  const res = await verifyRouteLoaded(mockPage, 'Morning Report');
  assert.equal(res.loaded, false);
  assert.match(res.reason, /silently fell back to Home/);
});

// -------------------------------------------------------------
// 3. Geometric Overflow Failure Detection Tests
// -------------------------------------------------------------

test('tooling-safety: checkGeometricOverflow detects document-level scrollWidth overflow', async () => {
  const mockPage = {
    evaluate: async (fn, arg) => {
      const origWin = global.window;
      const origDoc = global.document;

      try {
        global.window = { innerWidth: 390, getComputedStyle: () => ({ overflowX: 'visible' }) };
        global.document = {
          documentElement: { scrollWidth: 450 }, // Overflow: 450 > 390
          body: { scrollWidth: 450 },
          querySelectorAll: () => []
        };
        return fn(arg);
      } finally {
        global.window = origWin;
        global.document = origDoc;
      }
    }
  };

  await assert.rejects(async () => {
    await checkGeometricOverflow(mockPage, 'mobile (390px)');
  }, /Document-level horizontal overflow detected/);
});

test('tooling-safety: checkGeometricOverflow detects unconstrained element exceeding viewport width', async () => {
  const mockPage = {
    evaluate: async (fn, arg) => {
      const origWin = global.window;
      const origDoc = global.document;

      try {
        global.window = {
          innerWidth: 390,
          getComputedStyle: () => ({ overflowX: 'visible' })
        };
        global.document = {
          documentElement: { scrollWidth: 390 },
          body: { scrollWidth: 390 },
          querySelectorAll: (sel) => {
            if (sel === '#page *') {
              return [{
                id: 'unconstrained-wide-card',
                className: '',
                tagName: 'DIV',
                getBoundingClientRect: () => ({ width: 450, left: 0, right: 450 }),
                parentElement: null
              }];
            }
            return []; // no open dialogs
          }
        };
        return fn(arg);
      } finally {
        global.window = origWin;
        global.document = origDoc;
      }
    }
  };

  await assert.rejects(async () => {
    await checkGeometricOverflow(mockPage, 'mobile (390px)');
  }, /Unconstrained element overflow detected.*#unconstrained-wide-card/);
});

test('tooling-safety: checkGeometricOverflow permits internal scrolling containers', async () => {
  const mockPage = {
    evaluate: async (fn, arg) => {
      const origWin = global.window;
      const origDoc = global.document;

      try {
        global.window = {
          innerWidth: 390,
          getComputedStyle: () => ({ overflowX: 'auto' }) // Intentional scroll container
        };
        global.document = {
          documentElement: { scrollWidth: 390 },
          body: { scrollWidth: 390 },
          querySelectorAll: (sel) => {
            if (sel === '#page *') {
              return [{
                id: 'scrollable-table-container',
                className: '',
                tagName: 'DIV',
                getBoundingClientRect: () => ({ width: 450, left: 0, right: 450 }),
                parentElement: null
              }];
            }
            return [];
          }
        };
        return fn(arg);
      } finally {
        global.window = origWin;
        global.document = origDoc;
      }
    }
  };

  const ok = await checkGeometricOverflow(mockPage, 'mobile (390px)');
  assert.equal(ok, true);
});

test('tooling-safety: checkGeometricOverflow detects dialog exceeding viewport width', async () => {
  const mockPage = {
    evaluate: async (fn, arg) => {
      const origWin = global.window;
      const origDoc = global.document;

      try {
        global.window = {
          innerWidth: 390,
          getComputedStyle: () => ({ overflowX: 'visible' })
        };
        global.document = {
          documentElement: { scrollWidth: 390 },
          body: { scrollWidth: 390 },
          querySelectorAll: (sel) => {
            if (sel === 'dialog[open]') {
              return [{
                getBoundingClientRect: () => ({ width: 420, left: 0, right: 420 }), // Exceeds 390
                querySelectorAll: () => []
              }];
            }
            return [];
          }
        };
        return fn(arg);
      } finally {
        global.window = origWin;
        global.document = origDoc;
      }
    }
  };

  await assert.rejects(async () => {
    await checkGeometricOverflow(mockPage, 'mobile (390px)');
  }, /Dialog overflow defect detected.*Dialog bounds \(420px\) exceed viewport width \(390px\)/);
});

test('tooling-safety: checkGeometricOverflow permits scrollable dialog fitting viewport with visible controls', async () => {
  const mockPage = {
    evaluate: async (fn, arg) => {
      const origWin = global.window;
      const origDoc = global.document;

      try {
        global.window = {
          innerWidth: 390,
          getComputedStyle: () => ({ overflowX: 'visible' })
        };
        global.document = {
          documentElement: { scrollWidth: 390 },
          body: { scrollWidth: 390 },
          querySelectorAll: (sel) => {
            if (sel === 'dialog[open]') {
              return [{
                // Fits viewport width
                getBoundingClientRect: () => ({ width: 380, left: 5, right: 385 }),
                querySelectorAll: (bSel) => [{
                  // Visible control inside bounds
                  getBoundingClientRect: () => ({ width: 80, height: 36, left: 20, right: 100 })
                }]
              }];
            }
            return [];
          }
        };
        return fn(arg);
      } finally {
        global.window = origWin;
        global.document = origDoc;
      }
    }
  };

  const ok = await checkGeometricOverflow(mockPage, 'mobile (390px)');
  assert.equal(ok, true);
});
