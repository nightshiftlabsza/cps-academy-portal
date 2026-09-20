'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { checkBrowserTooling } = require('../tests/test-browser-helper.cjs');

const ROOT_DIR = path.resolve(__dirname, '..');

// Map maintained test suites to distinct feature areas
const FEATURE_AREAS = {
  home: {
    description: 'Home Dashboard, commitments, birthdays, and theme verification',
    unitTests: ['tests/home-refinement.test.cjs'],
    browserTests: ['tests/browser-home-verification.cjs']
  },
  members: {
    description: 'Members directory, cohort groups, profile editing, and birthday calculations',
    unitTests: ['tests/members-directory.test.cjs', 'tests/profile-onboarding.test.cjs'],
    browserTests: ['tests/browser-members-directory.cjs']
  },
  schedule: {
    description: 'Morning Report schedule, week navigation, month UX, matrix, and windowing',
    unitTests: [
      'tests/session-core.test.cjs',
      'tests/staffing-tokens.test.cjs',
      'tests/ui-operations.test.cjs',
      'tests/month-schedule-weeks.test.cjs'
    ],
    browserTests: [
      'tests/browser-month-ux.cjs',
      'tests/browser-tablet.cjs',
      'tests/browser-performance.cjs'
    ]
  },
  operations: {
    description: 'Core mutations, journal persistence, search, ICS calendar, and workspace backups',
    unitTests: [
      'tests/mutate.test.cjs',
      'tests/reconcile.test.cjs',
      'tests/db-journal.test.cjs'
    ],
    browserTests: ['tests/browser-operations.cjs']
  },
  mobile: {
    description: 'Responsive layouts across all 18 routes, dialogs, logbook import, and issue triage',
    unitTests: [],
    browserTests: ['tests/browser-mobile.cjs', 'tests/browser-mobile-extra.cjs']
  },
  offline: {
    description: 'Service worker caching boundaries, offline fallback, and dirty-form protection',
    unitTests: [],
    browserTests: ['tests/browser-offline.cjs']
  },
  auth: {
    description: 'Authentication tokens, session cookies, and role-based data filtering',
    unitTests: [
      'tests/auth.test.cjs',
      'tests/auth-permissions.test.cjs',
      'tests/sync-auth-filtering.test.cjs'
    ],
    browserTests: []
  }
};

// Aliases for friendly CLI input
const AREA_ALIASES = {
  'morning-report': 'schedule',
  mr: 'schedule',
  sessions: 'schedule',
  people: 'members',
  directory: 'members',
  workspace: 'operations',
  responsive: 'mobile'
};

function parseArgs(args) {
  let mode = null; // 'feature' | 'full' | null
  let area = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--mode' && args[i + 1]) {
      mode = args[++i];
    } else if (arg === '--area' && args[i + 1]) {
      area = args[++i];
    } else if (arg.startsWith('--area=')) {
      area = arg.slice(7);
    } else if (!arg.startsWith('-')) {
      if (!area) area = arg;
    }
  }

  if (area) {
    area = area.toLowerCase().trim();
    if (AREA_ALIASES[area]) area = AREA_ALIASES[area];
  }

  return { mode, area };
}

function runCommand(command, args, description) {
  const start = Date.now();
  console.log(`\n▶ Running: ${description} (${command} ${args.join(' ')})`);
  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    shell: false
  });
  const durationMs = Date.now() - start;
  return {
    description,
    command: `${command} ${args.join(' ')}`,
    exitCode: result.status ?? 1,
    durationMs,
    passed: result.status === 0
  };
}

(async () => {
  const { mode, area } = parseArgs(process.argv.slice(2));
  const tooling = checkBrowserTooling();

  console.log('='.repeat(72));
  console.log('CPS ACADEMY PORTAL — QA TEST ORCHESTRATOR');
  console.log('='.repeat(72));
  console.log(`Platform: ${process.platform} | Node: ${process.version}`);
  console.log(`Playwright: ${tooling.playwrightInstalled ? 'Installed' : 'NOT INSTALLED'}`);
  console.log(`Browser: ${tooling.resolvedSource || 'none detected'}`);
  if (tooling.executableError) {
    console.error(`⚠️  Browser tooling configuration error: ${tooling.executableError}`);
  }
  console.log('─'.repeat(72));

  const suiteRuns = [];
  const skippedSuites = [];

  if (area) {
    const config = FEATURE_AREAS[area];
    if (!config) {
      console.error(`\n❌ Unknown feature area: "${area}".`);
      console.error(`Available areas: ${Object.keys(FEATURE_AREAS).join(', ')}`);
      process.exit(1);
    }

    console.log(`Target Feature Area: [${area.toUpperCase()}]`);
    console.log(`Scope: ${config.description}`);

    // 1. Run unit tests for this area
    if (config.unitTests.length > 0) {
      for (const unitTest of config.unitTests) {
        suiteRuns.push(runCommand('node', ['--test', unitTest], `Unit: ${path.basename(unitTest)}`));
      }
    }

    // 2. Run browser tests for this area
    if (config.browserTests.length > 0) {
      if (!tooling.isReady) {
        console.error(`\n❌ Required browser tooling unavailable for [${area}] browser checks.`);
        if (!tooling.playwrightInstalled) {
          console.error('Missing playwright-core. Run "npm ci" (or "npm install") to install test dependencies.');
        }
        if (tooling.executableError) {
          console.error(tooling.executableError);
        }
        process.exit(1);
      }

      for (const bTest of config.browserTests) {
        suiteRuns.push(runCommand('node', [bTest], `Browser: ${path.basename(bTest)}`));
      }
    }
  } else if (mode === 'feature') {
    console.log('Mode: [FAST FEATURE GATE]');
    console.log('Verifies core home presentation and essential operational workflows.');

    // Fast feature gate runs core browser verification
    if (!tooling.isReady) {
      console.error('\n❌ Required browser tooling unavailable for qa:feature.');
      process.exit(1);
    }

    suiteRuns.push(runCommand('node', ['tests/browser-home-verification.cjs'], 'Browser: Home Verification'));
    suiteRuns.push(runCommand('node', ['tests/browser-operations.cjs'], 'Browser: Core Operations & Workflows'));

    skippedSuites.push({
      name: 'Full tablet/perf/mobile/members/schedule matrix',
      reason: 'Intentional skip: fast feature gate runs core home + operations; run npm run qa:full for comprehensive gate or npm run test:area -- <area> for feature checks.'
    });
  } else if (mode === 'full') {
    console.log('Mode: [COMPREHENSIVE QA GATE]');
    console.log('Includes maintained checks for Members, Schedule interactions, Tablet, Perf, and Mobile.');

    if (!tooling.isReady) {
      console.error('\n❌ Required browser tooling unavailable for qa:full.');
      process.exit(1);
    }

    // Deliberate, maintained full gate suite selection (including previously omitted Members and Schedule interactions):
    const fullSuites = [
      { path: 'tests/browser-offline.cjs', name: 'Browser/Mock: Offline & Cache Boundaries' },
      { path: 'tests/browser-home-verification.cjs', name: 'Browser: Home Dashboard Verification' },
      { path: 'tests/browser-members-directory.cjs', name: 'Browser: Members Directory & Profile Management' },
      { path: 'tests/browser-month-ux.cjs', name: 'Browser: Schedule Month UX & Accordion Interactions' },
      { path: 'tests/browser-operations.cjs', name: 'Browser: Core Operations & Workflows' },
      { path: 'tests/browser-tablet.cjs', name: 'Browser: Tablet Sticky Matrix' },
      { path: 'tests/browser-performance.cjs', name: 'Browser: Virtualization & DOM Windowing' },
      { path: 'tests/browser-mobile.cjs', name: 'Browser: Mobile 18 Routes Responsive Audit' },
      { path: 'tests/browser-mobile-extra.cjs', name: 'Browser: Mobile Logbook Import & Issue Triage' }
    ];

    for (const suite of fullSuites) {
      suiteRuns.push(runCommand('node', [suite.path], suite.name));
    }

    // Deliberate skip reporting for historical phase-specific or disposable sheet tests
    skippedSuites.push({
      name: 'tests/live-disposable-sheet.test.cjs',
      reason: 'Intentional skip: live Google Sheets writeback requires disposable sheet credentials; protected against automated execution in local gates.'
    });
    skippedSuites.push({
      name: 'Historical phase verification scripts (e.g. browser-phase5-verification.cjs)',
      reason: 'Intentional skip: historical milestone scripts are superseded by maintained feature suites (home, members, schedule, operations, mobile).'
    });
  } else {
    console.log('Usage:');
    console.log('  node scripts/run-qa.cjs --area <home|members|schedule|operations|mobile|offline|auth>');
    console.log('  node scripts/run-qa.cjs --mode feature');
    console.log('  node scripts/run-qa.cjs --mode full');
    process.exit(0);
  }

  // Generate clear summary
  console.log('\n' + '='.repeat(72));
  console.log('QA EXECUTION SUMMARY');
  console.log('='.repeat(72));

  let passCount = 0;
  let failCount = 0;

  for (const run of suiteRuns) {
    const status = run.passed ? '✓ PASSED' : '❌ FAILED';
    const duration = (run.durationMs / 1000).toFixed(1) + 's';
    console.log(`[${status}] ${run.description.padEnd(52)} (${duration})`);
    if (run.passed) passCount++;
    else failCount++;
  }

  if (skippedSuites.length > 0) {
    console.log('\nIntentional Skips:');
    for (const skip of skippedSuites) {
      console.log(`[SKIP] ${skip.name}`);
      console.log(`       Reason: ${skip.reason}`);
    }
  }

  console.log('─'.repeat(72));
  console.log(`Total: ${suiteRuns.length} executed | Passed: ${passCount} | Failed: ${failCount} | Skipped: ${skippedSuites.length}`);
  console.log('='.repeat(72));

  if (failCount > 0) {
    console.error(`\n❌ QA GATE FAILED: ${failCount} test suite(s) failed.`);
    process.exit(1);
  } else {
    console.log('\n✓ ALL REQUIRED QA CHECKS PASSED CLEANLY.');
    process.exit(0);
  }
})().catch((err) => {
  console.error('\nQA Orchestrator fatal error:', err);
  process.exit(1);
});
