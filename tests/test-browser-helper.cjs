'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Verified candidate browser executable paths by platform
const CANDIDATE_PATHS = {
  win32: [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  ],
  darwin: [
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ],
  linux: [
    '/usr/bin/microsoft-edge',
    '/usr/bin/microsoft-edge-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ]
};

/**
 * Resolves the browser executable path following strict, predictable rules:
 * 1. If CHROMIUM_PATH is explicitly set: verify existence. If missing, fail immediately (do not silently fall back).
 * 2. Look for verified installed browser candidates for the current OS platform.
 * 3. If no candidate exists, returns null without guessing or silent fallbacks.
 */
function resolveBrowserExecutable() {
  const envPath = process.env.CHROMIUM_PATH;
  if (envPath !== undefined && envPath !== null && String(envPath).trim() !== '') {
    const trimmedPath = String(envPath).trim();
    if (!fs.existsSync(trimmedPath)) {
      throw new Error(
        `CHROMIUM_PATH is explicitly set to "${trimmedPath}", but this file does not exist.\n` +
        'Please provide a valid browser executable path or unset CHROMIUM_PATH.'
      );
    }
    return { executablePath: trimmedPath, source: 'CHROMIUM_PATH environment variable' };
  }

  const platform = process.platform;
  const candidates = CANDIDATE_PATHS[platform] || [];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return { executablePath: candidate, source: `detected installed browser (${candidate})` };
    }
  }

  return { executablePath: null, source: 'none' };
}

/**
 * Verifies that playwright-core is installed and loadable.
 * Throws a clear, actionable error if missing.
 */
function getPlaywright() {
  try {
    return require('playwright-core');
  } catch (err) {
    throw new Error(
      'playwright-core is missing. Run "npm ci" (or "npm install") to install development tooling.\n' +
      'Note: Browser tooling is development-only; production runtime has zero external dependencies.'
    );
  }
}

/**
 * Launches a browser instance using playwright-core and verified local browser tooling.
 * Fails clearly with actionable diagnostics if tooling or browser is missing.
 * Never silently chooses an alternative browser when CHROMIUM_PATH is invalid.
 */
async function launchBrowser(options = {}) {
  const { chromium } = getPlaywright();
  const { executablePath, source } = resolveBrowserExecutable();

  if (!executablePath) {
    throw new Error(
      'No verified browser executable found.\n' +
      'Ensure Microsoft Edge or Google Chrome is installed, or set CHROMIUM_PATH to a valid browser executable.'
    );
  }

  const launchOptions = {
    headless: true,
    executablePath,
    ...options
  };

  try {
    const browser = await chromium.launch(launchOptions);
    return browser;
  } catch (err) {
    throw new Error(
      `Failed to start browser using executable "${executablePath}" (${source}): ${err.message}.\n` +
      'Ensure the browser binary is functional, or set CHROMIUM_PATH to a valid browser executable.'
    );
  }
}

/**
 * Checks whether browser tooling and executable are available without launching.
 * Returns isReady: false if CHROMIUM_PATH is invalid or no executable is found.
 */
function checkBrowserTooling() {
  let playwrightInstalled = false;
  try {
    require('playwright-core');
    playwrightInstalled = true;
  } catch {}

  let executableFound = false;
  let executableError = null;
  let resolvedSource = null;

  try {
    const res = resolveBrowserExecutable();
    executableFound = Boolean(res.executablePath);
    resolvedSource = res.source;
  } catch (err) {
    executableError = err.message;
  }

  return {
    playwrightInstalled,
    executableFound,
    executableError,
    resolvedSource,
    isReady: playwrightInstalled && Boolean(executableFound) && !executableError
  };
}

/**
 * Geometric check for horizontal overflow.
 * Internal scrolling containers (e.g. table container with overflow-x) are allowed as long as
 * their bounding box fits within the viewport.
 * Named table containers do NOT receive blanket exemptions that hide page-level overflow.
 * Open dialogs are verified to fit within viewport with accessible controls.
 */
async function checkGeometricOverflow(page, label = '') {
  const result = await page.evaluate((contextLabel) => {
    const winW = window.innerWidth;
    const docEl = document.documentElement;
    const body = document.body;

    const docScrollW = docEl.scrollWidth;
    const bodyScrollW = body ? body.scrollWidth : 0;
    const pageOverflow = docScrollW > winW + 1 || bodyScrollW > winW + 1;

    // Check unconstrained overflowing elements outside intentional scroll containers
    const overflowingElements = [];
    const allElements = Array.from(document.querySelectorAll('#page *'));
    for (const el of allElements) {
      const rect = el.getBoundingClientRect();
      if (rect.width > winW + 2) {
        const style = window.getComputedStyle(el);
        const isSelfScrollable = style.overflowX === 'auto' || style.overflowX === 'scroll';
        if (!isSelfScrollable) {
          let ancestor = el.parentElement;
          let insideScrollContainer = false;
          while (ancestor && ancestor !== document.body) {
            const aStyle = window.getComputedStyle(ancestor);
            if (aStyle.overflowX === 'auto' || aStyle.overflowX === 'scroll') {
              insideScrollContainer = true;
              break;
            }
            ancestor = ancestor.parentElement;
          }
          if (!insideScrollContainer) {
            const idOrClass = el.id ? `#${el.id}` : el.className ? `.${String(el.className).split(' ')[0]}` : el.tagName.toLowerCase();
            overflowingElements.push(`${idOrClass} (width: ${Math.round(rect.width)}px > viewport: ${winW}px)`);
          }
        }
      }
    }

    // Check open dialogs: A deliberately scrollable dialog is valid when it fits viewport width
    // and its controls remain accessible.
    const openDialogs = Array.from(document.querySelectorAll('dialog[open]'));
    const dialogErrors = [];
    for (const d of openDialogs) {
      const rect = d.getBoundingClientRect();
      const fitsViewportWidth = rect.right <= winW + 2 && rect.left >= -2;
      const buttons = d.querySelectorAll('button, [role="button"], input[type="submit"]');
      let hasVisibleControl = false;
      for (const btn of buttons) {
        const bRect = btn.getBoundingClientRect();
        if (bRect.width > 0 && bRect.height > 0 && bRect.right <= winW && bRect.left >= 0) {
          hasVisibleControl = true;
          break;
        }
      }
      if (!fitsViewportWidth) {
        dialogErrors.push(`Dialog bounds (${Math.round(rect.width)}px) exceed viewport width (${winW}px)`);
      } else if (buttons.length > 0 && !hasVisibleControl) {
        dialogErrors.push('Dialog controls are outside accessible viewport bounds');
      }
    }

    return {
      pageOverflow,
      docScrollW,
      bodyScrollW,
      winW,
      dialogErrors,
      overflowingElements: overflowingElements.slice(0, 5),
      contextLabel
    };
  }, label);

  if (result.pageOverflow) {
    throw new Error(
      `Document-level horizontal overflow detected at ${label || 'page'}: ` +
      `scrollWidth=${Math.max(result.docScrollW, result.bodyScrollW)}px exceeds viewport innerWidth=${result.winW}px`
    );
  }

  if (result.overflowingElements && result.overflowingElements.length > 0) {
    throw new Error(
      `Unconstrained element overflow detected at ${label || 'page'}: ` +
      result.overflowingElements.join('; ')
    );
  }

  if (result.dialogErrors.length > 0) {
    throw new Error(`Dialog overflow defect detected at ${label || 'dialog'}: ${result.dialogErrors.join('; ')}`);
  }

  return true;
}

/**
 * Verifies that the requested route actually loaded, and did not fall back to Home
 * when an invalid route was requested.
 */
async function verifyRouteLoaded(page, requestedRoute, timeoutMs = 8000) {
  try {
    await page.locator('#page h1, #page h2, #page .page-header, .agenda-view, .matrix-view, .hub-grid')
      .first()
      .waitFor({ timeout: timeoutMs });
  } catch {}

  return await page.evaluate((req) => {
    let normalized = (req || '').replace(/^#\/?/, '').trim();
    if (normalized === 'Sessions' || normalized === 'sessions') normalized = 'Morning Report';
    if (normalized === 'People') normalized = 'OrgStructure';

    // Sub-route handling
    const isScheduleSubRoute = normalized.startsWith('Morning Report/');
    const baseRoute = isScheduleSubRoute ? 'Morning Report' : normalized;

    // Active tab in global state
    const currentTab = typeof tab !== 'undefined' ? tab : null;

    // Check if recognized valid route
    const isKnown = (typeof db !== 'undefined' && db && Boolean(db[baseRoute])) ||
      ['Home', 'Workspace', 'profile/logbook', 'admin/issues'].includes(baseRoute);

    if (!isKnown) {
      return {
        loaded: false,
        reason: `Route "${req}" is not recognized as a valid portal view`
      };
    }

    // Did an invalid route silently fall back to Home?
    if (baseRoute !== 'Home' && currentTab === 'Home') {
      return {
        loaded: false,
        reason: `Route "${req}" failed to load and silently fell back to Home (active tab="${currentTab}")`
      };
    }

    if (currentTab && currentTab !== baseRoute) {
      return {
        loaded: false,
        reason: `Requested route "${req}" expected tab "${baseRoute}", but active tab is "${currentTab}"`
      };
    }

    // Check if heading or active representation matches
    const h1 = document.querySelector('#page h1, #page h2, #page .page-header')?.innerText?.trim() || '';
    const pageEl = document.querySelector('#page');
    if (!pageEl || pageEl.children.length === 0) {
      return {
        loaded: false,
        reason: `Route "${req}" rendered an empty page container`
      };
    }

    if (baseRoute !== 'Home' && h1 === 'Home Dashboard') {
      return {
        loaded: false,
        reason: `Route "${req}" failed to load and silently fell back to Home Dashboard`
      };
    }

    return {
      loaded: true,
      heading: h1,
      route: normalized,
      currentTab
    };
  }, requestedRoute);
}

module.exports = {
  resolveBrowserExecutable,
  getPlaywright,
  launchBrowser,
  checkBrowserTooling,
  checkGeometricOverflow,
  verifyRouteLoaded,
  CANDIDATE_PATHS
};
