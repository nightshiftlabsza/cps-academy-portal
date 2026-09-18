const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
test('source parses and workbook references remain unique',()=>{
 new vm.Script(fs.readFileSync(path.join(root,'app.js'),'utf8'));
 const data=JSON.parse(fs.readFileSync(path.join(root,'workbook.json'),'utf8'));const ids=new Set();
 for(const area of Object.values(data))for(const record of area.records){assert(!ids.has(record.id));ids.add(record.id);assert(record.source);assert(record.fields);assert(Array.isArray(record.flags))}
 assert(ids.size>3000);
});
test('local server serves assets but hides repository and original workbook',async()=>{
 const {createServer}=require('../scripts/serve.cjs');const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const base=`http://127.0.0.1:${server.address().port}`;for(const url of ['/','/app.js','/session-core.js','/styles.css','/workbook.json'])assert.equal((await fetch(base+url)).status,200);for(const url of ['/.git/config','/.env','/README.md','/upload/file.xlsx','/%2e%2e/package.json','/historical-contributions.json','/data/logbook-identities.json'])assert.equal((await fetch(base+url)).status,404)}finally{await new Promise(r=>server.close(r))}
});
test('Leader of the Week yearless snapshot records do not designate current leader without explicit year',()=>{
 const appCode=fs.readFileSync(path.join(root,'app.js'),'utf8');
 const data=JSON.parse(fs.readFileSync(path.join(root,'workbook.json'),'utf8'));
 const sandbox={
   db: data,
   records: t=>data[t]?.records||[],
   iso: v=>/^\d{4}-\d{2}-\d{2}$/.test(v),
   validDate: s=>{const d=new Date(s+'T12:00:00Z');return Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==s?'':s;},
   today: ()=>'2026-09-07'
 };
 vm.runInNewContext(appCode.slice(appCode.indexOf('function parseLeaderDateRange'), appCode.indexOf('function sessionCountdown')), sandbox);
 // All snapshot records are yearless, so currentLeader must be null for any reference date
 assert.equal(sandbox.currentLeader('2026-09-07'), null, 'Yearless dates must not claim active leader');
 assert.equal(sandbox.currentLeader('2026-09-13'), null, 'Yearless dates must not claim active leader');
 // An explicit range correctly matches
 const explicitList=[{ fields: { Dates: '2026-09-07 - 2026-09-13', Member: 'Ravi' } }];
 sandbox.records=()=>explicitList;
 assert.equal(sandbox.currentLeader('2026-09-07')?.fields.Member, 'Ravi', 'Explicit range matches start');
 assert.equal(sandbox.currentLeader('2026-09-10')?.fields.Member, 'Ravi', 'Explicit range matches midpoint');
 assert.equal(sandbox.currentLeader('2026-09-14'), null, 'Explicit range returns null when out of range');
});

test('app.js parses cleanly and contains workflow board functions', () => {
  const appCode = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.doesNotThrow(() => new vm.Script(appCode));
  assert(appCode.includes('function recordStage'));
  assert(appCode.includes('function boardStages'));
  assert(appCode.includes('function workflowBoard'));
  assert(appCode.includes('function applyStageChange'));
});

test('Schema review stage derivation maps empty to Draft and keeps unfamiliar statuses visible', () => {
  const appCode = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const sandbox = {
    iso: v => /^\d{4}-\d{2}-\d{2}$/.test(v),
    today: () => '2026-09-07'
  };
  vm.runInNewContext(
    appCode.slice(appCode.indexOf('function recordStage'), appCode.indexOf('function workflowCard')),
    sandbox
  );

  const emptyRec = { fields: { Status: '' } };
  assert.equal(sandbox.recordStage(emptyRec, 'Schema review'), 'Draft / Needs review');

  const uploadedRec = { fields: { Status: 'uploaded' } };
  assert.equal(sandbox.recordStage(uploadedRec, 'Schema review'), 'Uploaded');

  const unfamiliarRec = { fields: { Status: 'Clinical review requested' } };
  assert.equal(sandbox.recordStage(unfamiliarRec, 'Schema review'), 'Clinical review requested');

  const stages = sandbox.boardStages([emptyRec, uploadedRec, unfamiliarRec], 'Schema review');
  assert(stages.includes('Draft / Needs review'));
  assert(stages.includes('Uploaded'));
  assert(stages.includes('Clinical review requested'), 'Unfamiliar status must be visible in board stages');
});

test('Podcast Episodes stage derivation accurately classifies editor readiness and release dates', () => {
  const appCode = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const sandbox = {
    iso: v => /^\d{4}-\d{2}-\d{2}$/.test(v),
    today: () => '2026-09-07'
  };
  vm.runInNewContext(
    appCode.slice(appCode.indexOf('function recordStage'), appCode.indexOf('function workflowCard')),
    sandbox
  );

  const needsEditor = { fields: { 'Audio editor': '', 'Point person': 'Sharmin', 'Release date': '2026-09-20' } };
  assert.equal(sandbox.recordStage(needsEditor, 'Podcast Episodes'), 'Needs Audio Editor');

  const inEditing = { fields: { 'Audio editor': 'Nic', 'Point person': 'Sharmin', 'Release date': '2026-09-20' } };
  assert.equal(sandbox.recordStage(inEditing, 'Podcast Episodes'), 'In Editing');

  const released = { fields: { 'Audio editor': 'Sumeet', 'Point person': '', 'Release date': '2020-11-19' } };
  assert.equal(sandbox.recordStage(released, 'Podcast Episodes'), 'Release date passed');

  const customStatus = { fields: { Status: 'Recording in progress', 'Audio editor': '', 'Point person': '' } };
  assert.equal(sandbox.recordStage(customStatus, 'Podcast Episodes'), 'Recording in progress');

  const stages = sandbox.boardStages([needsEditor, inEditing, released, customStatus], 'Podcast Episodes');
  assert(stages.includes('Needs Audio Editor'));
  assert(stages.includes('In Editing'));
  assert(stages.includes('Release date passed'));
  assert(stages.includes('Recording in progress'), 'Custom podcast status must be visible');
});

test('Residency Programs and CRC retired records achieve full workbook parity', () => {
  const data = JSON.parse(fs.readFileSync(path.join(root, 'workbook.json'), 'utf8'));
  assert(data['Residency Programs'], 'Residency Programs dataset must exist');
  assert.equal(data['Residency Programs'].records.length, 6, 'Residency Programs must contain 6 records');
  assert(data['Residency Programs'].columns.includes('Residency Programs'));
  assert(data['Residency Programs'].columns.includes('Facilitator'));

  assert(data['CRC - retired'], 'CRC - retired dataset must exist');
  assert.equal(data['CRC - retired'].records.length, 417, 'CRC - retired must contain 417 records');
  assert(data['CRC - retired'].columns.includes('MENTEE'));
  assert(data['CRC - retired'].columns.includes('CPSOLVERS MENTOR'));
});

test('Residency Programs and CRC retired views render appropriate cards and fields', () => {
  const data = JSON.parse(fs.readFileSync(path.join(root, 'workbook.json'), 'utf8'));
  const appCode = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

  // Verify app.js defines titles, facets, and descriptions for both datasets
  assert(appCode.includes("'Residency Programs':'Residency Programs'"));
  assert(appCode.includes("'CRC - retired':'MENTEE'"));
  assert(appCode.includes("Residency Programs"));
  assert(appCode.includes("CRC - retired"));
  assert(appCode.includes("crcDrawer"));

  const resRecords = data['Residency Programs'].records;
  assert(resRecords.some(r => r.fields.Facilitator === 'Vini'), 'Facilitator Vini found in Residency Programs');
  assert(resRecords.every(r => typeof r.fields['Residency Programs'] === 'string'));

  const crcRecord = data['CRC - retired'].records[0];
  assert(crcRecord.fields['MENTEE'], 'Mentee name exists');
  assert(crcRecord.fields['CPSOLVERS MENTOR'] !== undefined);
});

test('Backup recovery diff calculation detects modified records, drafts, and overwrite conflicts', () => {
  const snapshotDb = {
    'Morning Report': {
      records: [
        { id: 'mr:1', fields: { Facilitator: 'Alice', Presenter: 'Bob' } },
        { id: 'mr:2', fields: { Facilitator: 'Charlie', Presenter: 'Dave' } }
      ]
    }
  };

  const localEdits = {
    'mr:1': { Facilitator: 'Alice Updated' }
  };
  const localDrafts = [
    { id: 'local:101', tab: 'Morning Report', fields: { Facilitator: 'Eve' } }
  ];

  // Calculate diff items against snapshot
  const editEntries = Object.entries(localEdits);
  const diffItems = editEntries.map(([id, fields]) => {
    const orig = snapshotDb['Morning Report'].records.find(r => r.id === id);
    const changedKeys = Object.keys(fields).filter(k => (orig?.fields[k] ?? '') !== fields[k]);
    return { id, changedKeys };
  });

  assert.equal(diffItems.length, 1);
  assert.equal(diffItems[0].id, 'mr:1');
  assert.deepEqual(diffItems[0].changedKeys, ['Facilitator']);
  assert.equal(localDrafts.length, 1);

  // Test incoming backup conflict / overwrite detection
  const incomingBackup = {
    format: 'cps-hub-backup-v2',
    snapshot: 'workbook-2026-09-06',
    edits: {
      'mr:1': { Facilitator: 'Alice Incoming Overwrite' },
      'mr:2': { Facilitator: 'Charlie New Edit' }
    },
    added: [
      { id: 'local:101', tab: 'Morning Report', fields: { Facilitator: 'Eve Existing' } },
      { id: 'local:102', tab: 'Morning Report', fields: { Facilitator: 'Frank New' } }
    ],
    favorites: ['mr:1']
  };

  const existingDraftIds = new Set(localDrafts.map(a => a.id));
  const newDraftsCount = incomingBackup.added.filter(a => !existingDraftIds.has(a.id)).length;
  const overwrittenLocalEdits = Object.keys(incomingBackup.edits).filter(id => localEdits[id]).length;
  const modifiedRecordsCount = Object.keys(incomingBackup.edits).length;

  assert.equal(newDraftsCount, 1, 'Detects 1 new draft (local:102) vs existing (local:101)');
  assert.equal(overwrittenLocalEdits, 1, 'Detects 1 local overwrite on mr:1');
  assert.equal(modifiedRecordsCount, 2, 'Detects 2 total records merged from incoming backup');
});

test('error ring buffer maintains max capacity and captures error metadata', () => {
  const appCode = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert(appCode.includes('const MAX_ERROR_LOGS = 10;'));
  assert(appCode.includes('function captureRuntimeError'));
  assert(appCode.includes('function captureDiagnostics'));

  const sandbox = {
    KEY: 'cps-hub-workspace-v2',
    location: { hash: '#/morning-report' },
    window: { innerWidth: 390, innerHeight: 844, addEventListener: () => {} },
    document: { documentElement: { clientWidth: 390, clientHeight: 844 } }
  };

  const bufferCode = appCode.slice(
    appCode.indexOf('const MAX_ERROR_LOGS = 10;'),
    appCode.indexOf('const groups={')
  );

  vm.runInNewContext(bufferCode, sandbox);

  // Log 12 errors to verify 10-item ring buffer behavior
  for (let i = 1; i <= 12; i++) {
    sandbox.captureRuntimeError({
      message: `Test error ${i}`,
      source: 'app.js',
      lineno: i * 10,
      colno: 5
    });
  }

  const diagnostics = sandbox.captureDiagnostics();
  assert.equal(diagnostics.errorLogs.length, 10, 'Ring buffer must cap at 10 errors');
  assert.equal(diagnostics.errorLogs[0].message, 'Test error 3', 'Oldest entries shifted out');
  assert.equal(diagnostics.errorLogs[9].message, 'Test error 12', 'Newest entry present');
  assert.equal(diagnostics.route, '#/morning-report');
  assert.equal(diagnostics.viewport, '390x844 (Mobile)');
  assert.equal(diagnostics.workspaceVersion, 'cps-hub-workspace-v2');
  assert(diagnostics.timestamp);
});

test('issue reporting schema persists to workspace.issues and tracks status transitions', () => {
  const workspace = {
    issues: [],
    history: [],
    isAdmin: false
  };

  const mockIssue = {
    id: 'issue:test-uuid-1',
    timestamp: new Date().toISOString(),
    reporter: 'Dr. Rivera',
    section: 'Morning Report',
    description: 'The date on Morning Report did not save when tapped.',
    diagnostics: {
      route: '#/morning-report',
      viewport: '390x844 (Mobile)',
      workspaceVersion: 'cps-hub-workspace-v2',
      timestamp: new Date().toISOString(),
      errorLogs: []
    },
    status: 'Open'
  };

  // Simulate report submission
  workspace.issues.unshift(mockIssue);
  assert.equal(workspace.issues.length, 1);
  assert.equal(workspace.issues[0].status, 'Open');
  assert.equal(workspace.issues[0].reporter, 'Dr. Rivera');
  assert.equal(workspace.issues[0].diagnostics.workspaceVersion, 'cps-hub-workspace-v2');

  // Simulate status progression by admin
  workspace.issues[0].status = 'In Progress';
  assert.equal(workspace.issues[0].status, 'In Progress');

  workspace.issues[0].status = 'Resolved';
  assert.equal(workspace.issues[0].status, 'Resolved');
});

test('admin role guard permits Super admin and restricts standard member', () => {
  const sandbox = {};

  const adminCheckCode = `
    function isAdmin(workspace) {
      return Boolean(workspace.isAdmin || workspace.role === 'Super admin' || workspace.role === 'admin' || workspace.profile === '@admin');
    }
    function canAccessAdminIssues(workspace, targetRoute) {
      if (targetRoute === 'admin/issues' || targetRoute === '/admin/issues' || targetRoute === 'Issue Reports') {
        return isAdmin(workspace);
      }
      return true;
    }
  `;

  vm.runInNewContext(adminCheckCode, sandbox);

  // Standard member profile
  const memberWorkspace = { isAdmin: false, role: 'VMR Leadership' };
  assert.equal(sandbox.isAdmin(memberWorkspace), false, 'Standard member is not admin');
  assert.equal(sandbox.canAccessAdminIssues(memberWorkspace, 'admin/issues'), false, 'Standard member blocked from admin/issues');
  assert.equal(sandbox.canAccessAdminIssues(memberWorkspace, 'Morning Report'), true, 'Standard member can access standard routes');

  // Super admin profile (@admin)
  const adminWorkspace1 = { isAdmin: true, role: 'Super admin' };
  assert.equal(sandbox.isAdmin(adminWorkspace1), true, 'Super admin workspace has admin rights');
  assert.equal(sandbox.canAccessAdminIssues(adminWorkspace1, 'admin/issues'), true, 'Super admin permitted to access admin/issues');

  const adminWorkspace2 = { isAdmin: false, profile: '@admin' };
  assert.equal(sandbox.isAdmin(adminWorkspace2), true, '@admin profile recognized');
  assert.equal(sandbox.canAccessAdminIssues(adminWorkspace2, 'admin/issues'), true);
});

test('staffing entry preserves adjacent coworker lines, pipe roles, and handles TP shorthand', () => {
  const role = 'Scribe', name = 'Dr. Alice';
  const rolePat = role === 'Teaching Points' ? '(?:Teaching Points|TP)' : 'Scribe';
  const lineRegex = new RegExp(`(^|\\r?\\n)([^\\S\\r\\n]*${rolePat}:[^\\S\\r\\n]*)([^\\r\\n|]*)(.*?)($|\\r?\\n)`, 'i');

  // Case 1: Empty Scribe followed by assigned Teaching Points coworker
  const input1 = "Scribe: \nTeaching Points: Dr. Bob\nCase Presenter: ";
  const result1 = input1.replace(lineRegex, (match, p1, p2, p3, p4, p5) => `${p1}${p2}${name}${p4}${p5}`);
  assert(result1.includes("Scribe: Dr. Alice"));
  assert(result1.includes("Teaching Points: Dr. Bob"), "Adjacent coworker Dr. Bob must NOT be deleted");

  // Case 2: Pipe-separated roles on a single line
  const input2 = "Scribe: Dr. Old | Teaching Points: Dr. Bob";
  const result2 = input2.replace(lineRegex, (match, p1, p2, p3, p4, p5) => `${p1}${p2}${name}${p4}${p5}`);
  assert(result2.includes("Scribe: Dr. Alice"));
  assert(result2.includes("| Teaching Points: Dr. Bob"), "Pipe-separated Teaching Points must be preserved");

  // Case 3: TP shorthand for Teaching Points
  const tpRole = 'Teaching Points', tpName = 'Dr. Charlie';
  const tpRolePat = '(?:Teaching Points|TP)';
  const tpRegex = new RegExp(`(^|\\r?\\n)([^\\S\\r\\n]*${tpRolePat}:[^\\S\\r\\n]*)([^\\r\\n|]*)(.*?)($|\\r?\\n)`, 'i');
  const input3 = "Scribe: Dr. Alice\nTP: TBD\nCase Presenter: ";
  const result3 = input3.replace(tpRegex, (match, p1, p2, p3, p4, p5) => `${p1}${p2}${tpName}${p4}${p5}`);
  assert(result3.includes("TP: Dr. Charlie"), "TP shorthand must be populated");
  assert(result3.includes("Scribe: Dr. Alice"));
});

test('mrGaps accurately detects unassigned slots without label bleed', () => {
  const appCode = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const sandbox = {};
  vm.runInNewContext(
    appCode.slice(appCode.indexOf('function mrGaps'), appCode.indexOf('function weekKey')),
    sandbox
  );

  // Totally unassigned row
  const emptyRec = {
    fields: {
      Facilitator: 'TBD',
      Presenter: '',
      'Scribe / teaching points sign-ups': 'Scribe: \nTeaching Points: \nCase Presenter:'
    }
  };
  const gaps = sandbox.mrGaps(emptyRec);
  assert(gaps.includes('Facilitator'), 'Facilitator TBD must be a gap');
  assert(gaps.includes('Presenter'), 'Empty Presenter must be a gap');
  assert(gaps.includes('Scribe'), 'Empty Scribe must be a gap (no label bleed)');
  assert(gaps.includes('Teaching Points'), 'Empty Teaching Points must be a gap');
  assert.equal(gaps.length, 4, 'All 4 roles must be flagged as gaps');

  // Fully assigned row
  const filledRec = {
    fields: {
      Facilitator: 'Rabih & Reza',
      Presenter: 'Kaleem',
      'Scribe / teaching points sign-ups': 'Scribe: Lukas\nTeaching Points: Varsha\nCase Presenter: Kaleem'
    }
  };
  assert.equal(sandbox.mrGaps(filledRec).length, 0, 'Fully assigned session has zero gaps');

  // Stacked session delimiter boundary
  const stackedRec = {
    fields: {
      Facilitator: 'Youssef',
      Presenter: '',
      'Scribe / teaching points sign-ups': 'Scribe: \nTeaching Points: \nCase Presenter: \n_____________________________________\n\nScribe: \nTeaching Points: \nCase Presenter: Eyron'
    }
  };
  const stackedGaps = sandbox.mrGaps(stackedRec);
  assert(stackedGaps.includes('Presenter'), 'Blank first session presenter must be detected as gap');
});

test('recordDate reliably normalizes non-ISO dates, timestamps, US formats, and CRC fields', () => {
  const appCode = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const sandbox = {
    iso: v => /^\d{4}-\d{2}-\d{2}$/.test(v),
  };
  vm.runInNewContext(
    appCode.slice(appCode.indexOf('function dateValue'), appCode.indexOf('const iso=')) + '\n' +
    appCode.slice(appCode.indexOf('function recordDate'), appCode.indexOf('function extraFilters')),
    sandbox
  );

  // Written date from Row 30
  assert.equal(sandbox.recordDate({ fields: { Date: 'Thursday - October 8, 2026' } }), '2026-10-08');

  // Timestamp format
  assert.equal(sandbox.recordDate({ fields: { Date: '2026-10-31 00:00:00' } }), '2026-10-31');

  // US format from CRC
  assert.equal(sandbox.recordDate({ fields: { 'VMR date': '6/8/2023' } }), '2023-06-08');
  assert.equal(sandbox.recordDate({ fields: { 'DATE OF PRESENTATION': '5/19/2023' } }), '2023-05-19');

  // Blank and placeholder dates
  assert.equal(sandbox.recordDate({ fields: { Date: 'TBD' } }), '');
  assert.equal(sandbox.recordDate({ fields: { Date: '#VALUE!' } }), '');
});

test('Leader of the Week recognizes embedded spaces in date ranges', () => {
  const raw = '07/13 - 07 /19';
  const m = raw.match(/^(\d{1,2})\s*\/\s*(\d{1,2})\s*-\s*(\d{1,2})\s*\/\s*(\d{1,2})$/);
  assert(m, 'Space-tolerant regex matches row 23 date format');
  assert.equal(m[1], '07');
  assert.equal(m[2], '13');
  assert.equal(m[3], '07');
  assert.equal(m[4], '19');
});

test('app.js defines matrixView and integrates into Morning Report view switcher', () => {
  const appCode = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert(appCode.includes('function matrixView'), 'matrixView function must be defined');
  assert(appCode.includes('data-set-view="matrix"'), 'Matrix button must exist in view switcher');
  assert(appCode.includes("mode==='matrix'&&tab==='Morning Report'?matrixView(rr)"), 'matrixView must be invoked in mode matrix');
});

test('matrixView renders 2D tabular rows with date badges and assigned/gap role cells', () => {
  const appCode = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const sandbox = {
    esc: v => String(v ?? ''),
    today: () => '2026-09-07',
    iso: v => /^\d{4}-\d{2}-\d{2}$/.test(v),
    SessionCore: require('../session-core.js'),
    workspace: { favorites: ['mr:1'], edits: {}, added: [] },
    db: {
      'Morning Report': {
        columns: ['Date', 'Type', 'Facilitator', 'Presenter', 'Scribe / teaching points sign-ups']
      }
    }
  };

  const helperCode = `${appCode.slice(appCode.indexOf('function calendarButton'), appCode.indexOf('function downloadCalendar'))}
    ${appCode.slice(appCode.indexOf('function dateValue'), appCode.indexOf('const iso='))}
    ${appCode.slice(appCode.indexOf('function recordDate'), appCode.indexOf('function extraFilters'))}
    ${appCode.slice(appCode.indexOf('function mrGaps'), appCode.indexOf('function workflowCard'))}
  `;
  vm.runInNewContext(helperCode, sandbox);

  const mockRecords = [
    {
      id: 'mr:1',
      tab: 'Morning Report',
      fields: {
        Date: '2026-09-07',
        Type: 'Morning Report',
        Facilitator: 'Dr. House',
        Presenter: 'Dr. Chase',
        'Scribe / teaching points sign-ups': 'Scribe: Dr. Cameron\nTeaching Points: Dr. Foreman'
      },
      flags: []
    },
    {
      id: 'mr:2',
      tab: 'Morning Report',
      fields: {
        Date: '2026-09-08',
        Type: 'Morning Report',
        Facilitator: 'TBD',
        Presenter: '',
        'Scribe / teaching points sign-ups': 'Scribe: \nTeaching Points: '
      },
      flags: []
    }
  ];

  sandbox.title = (r) => r.fields.Date;
  sandbox.records=()=>mockRecords;
  const html = sandbox.matrixView(mockRecords);

  assert(html.includes('class="matrix-table"'), 'Table container rendered');
  assert(html.includes('class="matrix-week-row"'), 'Week header row rendered');
  assert(html.includes('Dr. House'), 'Assigned facilitator rendered');
  assert(html.includes('Dr. Chase'), 'Assigned presenter rendered');
  assert(html.includes('Dr. Cameron'), 'Assigned scribe rendered');
  assert(html.includes('Dr. Foreman'), 'Assigned teaching points rendered');

  assert(html.includes('data-role="Facilitator"'), 'Gap button for missing Facilitator');
  assert(html.includes('data-role="Presenter"'), 'Gap button for missing Presenter');
  assert(html.includes('data-role="Scribe"'), 'Gap button for missing Scribe');
  assert(html.includes('data-role="Teaching Points"'), 'Gap button for missing Teaching Points');
  assert(html.includes('matrix-slot-gap'), 'Gap styling class applied');
  assert(html.includes('gap-action-btn'), 'Action button class attached for quick claim');
});

test('styles.css contains high-contrast gap tokens and matrix layout definitions', () => {
  const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  assert(css.includes('--gap-bg: #fef2f2'), 'High-contrast gap background token');
  assert(css.includes('--gap-text: #991b1b'), 'High-contrast gap text token (WCAG AAA)');
  assert(css.includes('--gap-border: #fecaca'), 'High-contrast gap border token');
  assert(css.includes('.matrix-table'), '.matrix-table defined');
  assert(css.includes('.matrix-slot-gap'), '.matrix-slot-gap defined');
  assert(css.includes('max-width: 2560px'), 'Ultrawide container expansion up to 2560px');
});

test('getUserCommitments extracts user commitments within 7-day bounds and excludes past or distant sessions', () => {
  const appCode = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const SessionCore = require('../session-core.js');

  const sandbox = {
    URL,
    SessionCore,
    today: () => '2026-09-08',
    iso: v => /^\d{4}-\d{2}-\d{2}$/.test(v),
    workspace: { edits: {}, added: [] },
    db: { 'Morning Report': { records: [] }, 'CPS Academy VMRs': { records: [] } }
  };

  const helperCode = `
    ${appCode.slice(appCode.indexOf('function dateValue'), appCode.indexOf('const iso='))}
    ${appCode.slice(appCode.indexOf('function recordDate'), appCode.indexOf('function extraFilters'))}
    ${appCode.slice(appCode.indexOf('function mrGaps'), appCode.indexOf('function weekKey'))}
    ${appCode.slice(appCode.indexOf('function sessionZoomUrl'), appCode.indexOf('function home()'))}
  `;

  vm.runInNewContext(helperCode, sandbox);

  const mockRecords = [
    {
      id: 'mr:past',
      tab: 'Morning Report',
      fields: {
        Date: '2026-09-07',
        Facilitator: 'Dr. House',
        Presenter: '',
        'Scribe / teaching points sign-ups': 'Scribe: Dr. House'
      },
      flags: []
    },
    {
      id: 'mr:today',
      tab: 'Morning Report',
      fields: {
        Date: '2026-09-08',
        Facilitator: 'Dr. House',
        Presenter: 'Dr. Chase',
        'Scribe / teaching points sign-ups': 'Scribe: \nTeaching Points: '
      },
      flags: []
    },
    {
      id: 'mr:day2',
      tab: 'Morning Report',
      fields: {
        Date: '2026-09-10',
        Facilitator: 'Dr. Cuddy',
        Presenter: 'Dr. Wilson',
        'Scribe / teaching points sign-ups': 'Scribe: Dr. House\nTeaching Points: Dr. Cameron'
      },
      flags: []
    },
    {
      id: 'mr:day5',
      tab: 'Morning Report',
      fields: {
        Date: '2026-09-13',
        Facilitator: 'Dr. Foreman',
        Presenter: 'Dr. House',
        'Scribe / teaching points sign-ups': ''
      },
      flags: []
    },
    {
      id: 'mr:day8',
      tab: 'Morning Report',
      fields: {
        Date: '2026-09-16',
        Facilitator: 'Dr. House',
        Presenter: '',
        'Scribe / teaching points sign-ups': ''
      },
      flags: []
    }
  ];

  const profile = { name: 'Dr. House' };
  const commitments = sandbox.getUserCommitments(profile, 7, {
    referenceDate: '2026-09-08',
    records: mockRecords
  });

  assert.equal(commitments.length, 3, 'Must extract exactly 3 sessions within 7-day bounds');
  assert.equal(commitments[0].date, '2026-09-08');
  assert.equal(commitments[0].daysUntil, 0);
  assert.equal(commitments[0].urgency, 'urgent');
  assert.deepEqual([...commitments[0].roles], ['Facilitator']);

  assert.equal(commitments[1].date, '2026-09-10');
  assert.equal(commitments[1].daysUntil, 2);
  assert.equal(commitments[1].urgency, 'upcoming');
  assert.deepEqual([...commitments[1].roles], ['Scribe']);

  assert.equal(commitments[2].date, '2026-09-13');
  assert.equal(commitments[2].daysUntil, 5);
  assert.equal(commitments[2].urgency, 'upcoming');
  assert.deepEqual([...commitments[2].roles], ['Presenter']);
});

test('Accurate role attribution across multi-person tokenized cells, TP shorthand, and alias matching', () => {
  const appCode = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const SessionCore = require('../session-core.js');

  const sandbox = {
    URL,
    SessionCore,
    today: () => '2026-09-08',
    iso: v => /^\d{4}-\d{2}-\d{2}$/.test(v),
    workspace: { edits: {}, added: [] },
    db: { 'Morning Report': { records: [] }, 'CPS Academy VMRs': { records: [] } }
  };

  const helperCode = `
    ${appCode.slice(appCode.indexOf('function dateValue'), appCode.indexOf('const iso='))}
    ${appCode.slice(appCode.indexOf('function recordDate'), appCode.indexOf('function extraFilters'))}
    ${appCode.slice(appCode.indexOf('function mrGaps'), appCode.indexOf('function weekKey'))}
    ${appCode.slice(appCode.indexOf('function sessionZoomUrl'), appCode.indexOf('function home()'))}
  `;

  vm.runInNewContext(helperCode, sandbox);

  const mockSession = {
    id: 'mr:multi-token',
    tab: 'Morning Report',
    fields: {
      Date: '2026-09-09',
      Facilitator: 'Rabih & Reza',
      Presenter: '',
      'Scribe / teaching points sign-ups': 'Scribe: Dr. Alice | TP: Dr. Bob (can switch)\nCase Presenter: Dr. Charlie',
      'Meeting info': 'https://us02web.zoom.us/j/9876543210'
    },
    flags: []
  };

  const rezaCommitments = sandbox.getUserCommitments({ name: 'Reza' }, 7, {
    referenceDate: '2026-09-08',
    records: [mockSession]
  });
  assert.equal(rezaCommitments.length, 1);
  assert.equal(rezaCommitments[0].role, 'Facilitator');
  assert(rezaCommitments[0].coStaff.includes('Rabih'), 'Rabih identified as co-facilitator');
  assert(rezaCommitments[0].coStaff.includes('Dr. Charlie'), 'Dr. Charlie identified as presenter');
  assert.equal(rezaCommitments[0].zoomUrl, 'https://us02web.zoom.us/j/9876543210');

  const bobCommitments = sandbox.getUserCommitments({ name: 'Dr. Bob' }, 7, {
    referenceDate: '2026-09-08',
    records: [mockSession]
  });
  assert.equal(bobCommitments.length, 1);
  assert.equal(bobCommitments[0].role, 'Teaching Points');
  assert(bobCommitments[0].coStaff.includes('Dr. Alice'), 'Dr. Alice identified as scribe coworker');

  const aliasDecisionFixture = {
    schemaVersion: 1,
    decisions: [
      { id: 'd:1', personId: 'person-zg', raw: 'Zak G', canonicalName: 'Zakariyya Gardee' }
    ]
  };

  const aliasSession = {
    id: 'mr:alias-session',
    tab: 'Morning Report',
    fields: {
      Date: '2026-09-11',
      Facilitator: 'Zak G + Reza',
      Presenter: '',
      'Scribe / teaching points sign-ups': ''
    },
    flags: []
  };

  const zgCommitments = sandbox.getUserCommitments(
    { id: 'zg', personId: 'person-zg', name: 'Zakariyya Gardee', aliases: ['Zakariyya G'] },
    7,
    {
      referenceDate: '2026-09-08',
      records: [aliasSession],
      aliases: aliasDecisionFixture
    }
  );
  assert.equal(zgCommitments.length, 1, 'Alias Zak G resolves to Zakariyya Gardee');
  assert.equal(zgCommitments[0].role, 'Facilitator');
});

test('Graceful empty states when no sessions are assigned (zero guilt, zero cheerleading)', () => {
  const appCode = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const SessionCore = require('../session-core.js');

  const sandbox = {
    URL,
    SessionCore,
    today: () => '2026-09-08',
    iso: v => /^\d{4}-\d{2}-\d{2}$/.test(v),
    workspace: { edits: {}, added: [], reporterName: 'Dr. Unassigned' },
    db: { 'Morning Report': { records: [] }, 'CPS Academy VMRs': { records: [] } },
    Identity: {
      getCurrentUser: () => ({ id: 'unassigned-member', name: 'Dr. Unassigned' })
    }
  };

  const helperCode = `
    ${appCode.slice(appCode.indexOf('function dateValue'), appCode.indexOf('const iso='))}
    ${appCode.slice(appCode.indexOf('function recordDate'), appCode.indexOf('function extraFilters'))}
    ${appCode.slice(appCode.indexOf('function mrGaps'), appCode.indexOf('function weekKey'))}
    ${appCode.slice(appCode.indexOf('function sessionZoomUrl'), appCode.indexOf('function home()'))}
  `;

  vm.runInNewContext(helperCode, sandbox);

  const emptyCommitments = sandbox.getUserCommitments({ name: 'Dr. Unassigned' }, 7, {
    referenceDate: '2026-09-08',
    records: []
  });
  assert.equal(emptyCommitments.length, 0);

  const html = sandbox.renderMyCommitmentsWidget();
  assert(html.includes('No scheduled commitments in the next 7 days.'), 'Displays exact quiet phrase');
  assert(html.includes('commitments-quiet'), 'Applies calm unobtrusive styling class');
  assert(!html.includes('great job'), 'Zero cheerleading');
  assert(!html.includes('missed'), 'Zero guilt');

  sandbox.Identity.getCurrentUser = () => null;
  sandbox.workspace.reporterName = '';
  const signedOutHtml = sandbox.renderMyCommitmentsWidget();
  assert(signedOutHtml.includes('Signed out'), 'Handles signed-out state cleanly');
  assert(signedOutHtml.includes('commitments-open-prefs-btn'), 'Provides preferences button');
});

test('Temporal urgency badge and Zoom launch link formatting adhere to clinical spec', () => {
  const appCode = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const SessionCore = require('../session-core.js');

  const sandbox = {
    URL,
    SessionCore,
    today: () => '2026-09-08',
    iso: v => /^\d{4}-\d{2}-\d{2}$/.test(v)
  };

  const helperCode = `
    ${appCode.slice(appCode.indexOf('function sessionZoomUrl'), appCode.indexOf('function home()'))}
  `;
  vm.runInNewContext(helperCode, sandbox);

  const todayBadge = sandbox.formatUrgencyBadge({ daysUntil: 0, sessionTime: { startUtc: '2026-09-08T16:00:00Z' } });
  assert(todayBadge.includes('urgency-badge-urgent'), 'Today has urgent badge class');
  assert(todayBadge.includes('Today'), 'Today formatted');

  const tomorrowBadge = sandbox.formatUrgencyBadge({ daysUntil: 1, sessionTime: { startUtc: '2026-09-09T18:00:00Z' } });
  assert(tomorrowBadge.includes('urgency-badge-urgent'), 'Tomorrow has urgent badge class');
  assert(tomorrowBadge.includes('Tomorrow'), 'Tomorrow formatted');

  const calmBadge = sandbox.formatUrgencyBadge({ daysUntil: 4, sessionTime: null });
  assert(calmBadge.includes('urgency-badge-calm'), '4 days has calm amber badge class');
  assert(calmBadge.includes('Upcoming: in 4 days'), 'Calm badge text formatted');

  const withZoom = {
    fields: { Notes: 'Discussion on zoom https://us02web.zoom.us/j/123456789 passcode 42' },
    links: {}
  };
  assert.equal(sandbox.sessionZoomUrl(withZoom), 'https://us02web.zoom.us/j/123456789');

  const withoutZoom = {
    fields: { Notes: 'In person meeting' },
    links: {}
  };
  assert.equal(sandbox.sessionZoomUrl(withoutZoom), '');
});

test('backupAgeText returns "Never requested" when lastBackup is absent or invalid, and formats relative age', () => {
  const appCode = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const sandbox = {
    workspace: { lastBackup: null },
    Date,
    Math
  };
  vm.runInNewContext(appCode.slice(appCode.indexOf('function backupAgeText'), appCode.indexOf('function sessionZoomUrl')), sandbox);

  assert.equal(sandbox.backupAgeText(), 'Never requested');
  sandbox.workspace.lastBackup = undefined;
  assert.equal(sandbox.backupAgeText(), 'Never requested');
  sandbox.workspace.lastBackup = 'invalid-date';
  assert.equal(sandbox.backupAgeText(), 'Never requested');

  sandbox.workspace.lastBackup = new Date().toISOString();
  assert.equal(sandbox.backupAgeText(), '< 1h ago');
  sandbox.workspace.lastBackup = new Date(Date.now() - 3 * 3600000).toISOString();
  assert.equal(sandbox.backupAgeText(), '3h ago');
  sandbox.workspace.lastBackup = new Date(Date.now() - 48 * 3600000).toISOString();
  assert.equal(sandbox.backupAgeText(), '2d ago');
});

test('Workspace backup panel displays accurate local change counts and avoids "pending backup"', () => {
  const appCode = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const createWorkspaceHarness = (edits = {}, added = [], lastBackup = null) => {
    const ctx = {
      workspace: { edits, added, favorites: [], history: [], lastBackup },
      Date,
      Math,
      esc: s => String(s ?? ''),
      sessionStorage: { getItem: () => null },
      OfflineManager: { getOfflineStatus: () => null },
      header: () => '',
      banner: () => '',
      workbookDiffHtml: () => '',
      isAdmin: () => false,
      exportBackup: () => {},
      importBackup: () => {},
      exportPatchJson: () => {},
      rollbackImport: () => {},
      $: () => ({})
    };
    const helper = `
      ${appCode.slice(appCode.indexOf('function backupAgeText'), appCode.indexOf('function sessionZoomUrl'))}
      let html = '';
      const $ = () => ({ set innerHTML(val) { html = val; } });
      ${appCode.slice(appCode.indexOf('function workspaceView(){'), appCode.indexOf('let currentLogbookSlice=null;'))}
      function renderCard() {
        workspaceView();
        return html;
      }
    `;
    vm.runInNewContext(helper, ctx);
    return ctx.renderCard();
  };

  // Clean state
  const clean = createWorkspaceHarness();
  assert(clean.includes('0 edited records · 0 new drafts'));
  assert(clean.includes('Last backup export requested: Never requested'));
  assert(!clean.includes('pending backup'));

  // Edits retained before export
  const withEdits = createWorkspaceHarness({ 'MR:1': { Facilitator: 'Test' } }, [{ id: 'local:draft1' }]);
  assert(withEdits.includes('1 edited record · 1 new draft'));
  assert(withEdits.includes('Last backup export requested: Never requested'));
  assert(!withEdits.includes('pending backup'));

  // Edits retained after export requested
  const afterExport = createWorkspaceHarness({ 'MR:1': { Facilitator: 'Test' } }, [{ id: 'local:draft1' }], new Date().toISOString());
  assert(afterExport.includes('1 edited record · 1 new draft'), 'Edits remain retained after export');
  assert(afterExport.includes('Last backup export requested: < 1h ago'));
  assert(!afterExport.includes('pending backup'), 'Must never claim pending backup');
  assert(!afterExport.includes('All changes backed up'), 'Must not make unverified claims about filesystem storage');
});

test('Workspace, Logbook and Issue reporting copy accurately reflects local profile and attendance distinction', () => {
  const appCode = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert(!appCode.includes('Clinical procedure logbook for a single authenticated'), 'Logbook must not claim member authentication');
  assert(!appCode.includes('Reverse-chronological history of verified workbook engagements'), 'Engagements must not be termed verified attendance');
  assert(appCode.includes('assignments are not verified attendance'), 'Must preserve distinction between assignments and verified attendance');
  assert(appCode.includes('Local changes &amp; portable backups'), 'Workspace card must accurately describe local changes');
  assert(appCode.includes('bound to the supported snapshot'), 'Workspace card must note snapshot binding');
  assert(!appCode.includes("the team will look into it"), 'Must not imply issue was transmitted to a remote team');
  assert(appCode.includes('Issue report saved locally to your device workspace.'), 'Must explicitly state report was saved locally');
});


