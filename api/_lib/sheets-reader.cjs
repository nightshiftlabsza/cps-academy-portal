'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const CACHE_TTL_MS = 60 * 1000;
let cachedSnapshot = null;
let cacheExpiresAt = 0;
let cachedToken = null;
let tokenExpiresAt = 0;

function getCredentials() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    try {
      return typeof process.env.GOOGLE_SERVICE_ACCOUNT_KEY === 'string'
        ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY)
        : process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    } catch (e) {
      throw new Error('Invalid GOOGLE_SERVICE_ACCOUNT_KEY JSON string');
    }
  }

  const candidatePaths = [
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    path.resolve(__dirname, '../../credentials/google-service-account.json'),
    path.resolve(__dirname, '../../../credentials/google-service-account.json'),
    'C:\\Users\\mzaka.ZAK-PC\\Documents\\CPS\\cps-academy-portal-local\\credentials\\google-service-account.json'
  ].filter(Boolean);

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      try {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
      } catch (e) {
        throw new Error(`Failed to parse credentials file at ${p}: ${e.message}`);
      }
    }
  }

  throw new Error('Google service account credentials not found');
}

async function getAccessToken(creds) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now < tokenExpiresAt - 60) {
    return cachedToken;
  }

  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const unsigned = `${b64(header)}.${b64(claim)}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(unsigned);
  const signature = sign.sign(creds.private_key, 'base64url');
  const assertion = `${unsigned}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google OAuth token exchange failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = now + (data.expires_in || 3600);
  return cachedToken;
}

function normalizeDate(val) {
  if (!val) return '';
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (!isNaN(d.getTime()) && d.getFullYear() > 2000 && d.getFullYear() < 2100) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return s;
}

function slugify(val) {
  return String(val || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
}

// Generate deterministic collision-resistant stable IDs for bulk row additions
function generateDeterministicId(dataset, fields, seenIds = new Set()) {
  let baseId = '';
  if (fields._cps_id && String(fields._cps_id).trim()) {
    baseId = String(fields._cps_id).trim();
  } else if (dataset === 'Morning Report') {
    const d = fields.Date || 'undated';
    const type = slugify(fields.Type) || 'mr';
    const time = slugify(fields['Pacific time (source)']) || 'time';
    baseId = `mr-${d}-${type}-${time}`;
  } else if (dataset === 'CPS Academy VMRs') {
    const d = fields['Date / time (source)'] ? slugify(fields['Date / time (source)']).slice(0, 15) : 'undated';
    const title = slugify(fields['Session title']) || 'vmr';
    baseId = `vmr-${d}-${title}`;
  } else if (dataset === 'Members') {
    const emailSlug = fields.Email ? slugify(fields.Email.split('@')[0]) : '';
    const nameSlug = slugify(fields.Name) || 'member';
    baseId = `mem-${emailSlug || nameSlug}`;
  } else if (dataset === 'OrgStructure') {
    const teamSlug = slugify(fields['Team / responsibility']) || 'team';
    const roleSlug = slugify(fields.Role) || 'role';
    baseId = `org-${teamSlug}-${roleSlug}`;
  } else if (dataset === 'Important links') {
    baseId = `link-${slugify(fields.Resource) || 'res'}`;
  } else {
    baseId = `${slugify(dataset)}-rec`;
  }

  let candidateId = baseId;
  let counter = 1;
  while (seenIds.has(candidateId)) {
    counter++;
    candidateId = `${baseId}-seq${counter}`;
  }
  seenIds.add(candidateId);
  return candidateId;
}

function parseMorningReport(rows) {
  const columns = [
    'Date', 'Pacific time (source)', 'Eastern time (source)', 'Type',
    'Facilitator', 'Presenter', 'Active participant 1', 'Active participant 2',
    'Active participant 3', 'Active participant 4', 'Chat support', 'Notes',
    'Scribe / teaching points sign-ups', 'Available team', 'Attendance',
    'Chat comments', 'Unique commenters'
  ];

  const records = [];
  const seen = new Set();

  for (let i = 6; i < rows.length; i++) {
    const rowNum = i + 1;
    const r = rows[i] || [];
    if (!r.some((c) => String(c).trim())) continue;

    const rawDate = r[0] || '';
    const dateVal = normalizeDate(rawDate);

    const fields = {
      'Date': dateVal,
      'Pacific time (source)': String(r[1] ?? '').trim(),
      'Eastern time (source)': String(r[2] ?? '').trim(),
      'Type': String(r[3] ?? '').trim(),
      'Facilitator': String(r[5] ?? '').trim(),
      'Presenter': String(r[6] ?? '').trim(),
      'Active participant 1': String(r[7] ?? '').trim(),
      'Active participant 2': String(r[8] ?? '').trim(),
      'Active participant 3': String(r[9] ?? '').trim(),
      'Active participant 4': String(r[10] ?? '').trim(),
      'Chat support': String(r[11] ?? '').trim(),
      'Notes': String(r[12] ?? '').trim(),
      'Scribe / teaching points sign-ups': String(r[13] ?? '').trim(),
      'Available team': String(r[14] ?? '').trim(),
      'Attendance': String(r[15] ?? '').trim(),
      'Chat comments': String(r[16] ?? '').trim(),
      'Unique commenters': String(r[17] ?? '').trim(),
      '_cps_id': String(r[18] ?? '').trim()
    };

    const stableId = generateDeterministicId('Morning Report', fields, seen);

    records.push({
      id: `Morning Report:${rowNum}`,
      stableId,
      row: rowNum,
      source: 'Morning Report',
      fields,
      links: {},
      flags: []
    });
  }

  return { columns, records };
}

function parseVMRs(rows) {
  const columns = [
    'Facilitator', 'Session title', 'Topic', 'Date / time (source)',
    'Meeting info', 'Recording', 'Public flag (source)', 'Bonus learning'
  ];

  const records = [];
  const seen = new Set();

  for (let i = 3; i < rows.length; i++) {
    const rowNum = i + 1;
    const r = rows[i] || [];
    if (!r.some((c) => String(c).trim())) continue;

    const fields = {
      'Facilitator': String(r[0] ?? '').trim(),
      'Session title': String(r[1] ?? '').trim(),
      'Topic': String(r[2] ?? '').trim(),
      'Date / time (source)': String(r[3] ?? '').trim(),
      'Meeting info': String(r[4] ?? '').trim(),
      'Recording': String(r[5] ?? '').trim(),
      'Public flag (source)': String(r[6] ?? '').trim(),
      'Bonus learning': String(r[7] ?? '').trim(),
      '_cps_id': String(r[8] ?? '').trim()
    };

    const links = {};
    if (fields.Recording && fields.Recording.startsWith('http')) {
      links.Recording = fields.Recording;
    }

    const stableId = generateDeterministicId('CPS Academy VMRs', fields, seen);

    records.push({
      id: `CPS Academy VMRs:${rowNum}`,
      stableId,
      row: rowNum,
      source: 'CPS Academy VMRs',
      fields,
      links,
      flags: []
    });
  }

  return { columns, records };
}

function parseOrgStructure(rows) {
  const orgColumns = ['Team / responsibility', 'Members', 'Role'];
  const orgRecords = [];
  const seenOrg = new Set();

  const memberColumns = [
    'Name', 'Sponsor', 'Social handles', 'Country', 'Birthday',
    'Email', 'Location', 'Subspecialty'
  ];
  const memberRecords = [];
  const seenMem = new Set();

  const orgEnd = Math.min(rows.length, 55);
  for (let i = 2; i < orgEnd; i++) {
    const rowNum = i + 1;
    const r = rows[i] || [];
    if (!r.some((c) => String(c).trim())) continue;

    const fields = {
      'Team / responsibility': String(r[0] ?? '').trim(),
      'Members': String(r[1] ?? '').trim(),
      'Role': String(r[2] ?? '').trim(),
      '_cps_id': String(r[3] ?? '').trim()
    };

    const stableId = generateDeterministicId('OrgStructure', fields, seenOrg);

    orgRecords.push({
      id: `OrgStructure:${rowNum}`,
      stableId,
      row: rowNum,
      source: 'OrgStructure',
      fields,
      links: {},
      flags: []
    });
  }

  for (let i = 56; i < rows.length; i++) {
    const rowNum = i + 1;
    const r = rows[i] || [];
    if (!r.some((c) => String(c).trim())) continue;

    const fields = {
      'Name': String(r[0] ?? '').trim(),
      'Sponsor': String(r[1] ?? '').trim(),
      'Social handles': String(r[2] ?? '').trim(),
      'Country': String(r[3] ?? '').trim(),
      'Birthday': String(r[4] ?? '').trim(),
      'Email': String(r[5] ?? '').trim(),
      'Location': String(r[6] ?? '').trim(),
      'Subspecialty': String(r[7] ?? '').trim(),
      '_cps_id': String(r[8] ?? '').trim()
    };

    const stableId = generateDeterministicId('Members', fields, seenMem);

    memberRecords.push({
      id: `Members:${rowNum}`,
      stableId,
      row: rowNum,
      source: 'OrgStructure',
      fields,
      links: {},
      flags: []
    });
  }

  return {
    OrgStructure: { columns: orgColumns, records: orgRecords },
    Members: { columns: memberColumns, records: memberRecords }
  };
}

function parseImportantLinks(rows) {
  const columns = ['Resource', 'Link'];
  const records = [];
  const seen = new Set();

  for (let i = 1; i < rows.length; i++) {
    const rowNum = i + 1;
    const r = rows[i] || [];
    if (!r.some((c) => String(c).trim())) continue;

    const fields = {
      'Resource': String(r[0] ?? '').trim(),
      'Link': String(r[1] ?? '').trim(),
      '_cps_id': String(r[2] ?? '').trim()
    };
    const links = {};
    if (fields.Link && fields.Link.startsWith('http')) {
      links.Link = fields.Link;
    }

    const stableId = generateDeterministicId('Important links', fields, seen);

    records.push({
      id: `Important links:${rowNum}`,
      stableId,
      row: rowNum,
      source: 'Important links',
      fields,
      links,
      flags: []
    });
  }

  return { columns, records };
}

// Find live row in Google Sheets matching stableId regardless of shifting
async function findRowByStableId(sheetId, tabName, targetStableId) {
  const creds = getCredentials();
  const token = await getAccessToken(creds);

  let range = '';
  if (tabName === 'Morning Report') range = "'Morning Report'!A1:S2500";
  else if (tabName === 'CPS Academy VMRs') range = "'CPS Academy VMRs'!A1:I400";
  else if (tabName === 'OrgStructure' || tabName === 'Members') range = "'OrgStructure'!A1:I300";
  else if (tabName === 'Important links') range = "'Important links'!A1:C50";
  else range = `'${tabName}'!A1:Z500`;

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Failed to scan rows for stableId: ${res.statusText}`);

  const data = await res.json();
  const rows = data.values || [];

  const seen = new Set();
  const startIndex = tabName === 'Morning Report' ? 6 : tabName === 'CPS Academy VMRs' ? 3 : tabName === 'Members' ? 56 : (tabName === 'Important links' ? 1 : 2);

  for (let i = startIndex; i < rows.length; i++) {
    const rowNum = i + 1;
    const r = rows[i] || [];
    if (!r.some((c) => String(c).trim())) continue;

    let rowStableId = '';
    if (tabName === 'Morning Report') {
      const rawDate = r[0] || '';
      const dateVal = normalizeDate(rawDate);
      const fields = {
        _cps_id: String(r[18] ?? '').trim(),
        Date: dateVal,
        'Pacific time (source)': String(r[1] ?? '').trim(),
        Type: String(r[3] ?? '').trim()
      };
      rowStableId = generateDeterministicId('Morning Report', fields, seen);
    } else if (tabName === 'CPS Academy VMRs') {
      const fields = {
        _cps_id: String(r[8] ?? '').trim(),
        'Date / time (source)': String(r[3] ?? '').trim(),
        'Session title': String(r[1] ?? '').trim()
      };
      rowStableId = generateDeterministicId('CPS Academy VMRs', fields, seen);
    } else if (tabName === 'Members') {
      if (rowNum >= 57) {
        const fields = {
          _cps_id: String(r[8] ?? '').trim(),
          Email: String(r[5] ?? '').trim(),
          Name: String(r[0] ?? '').trim()
        };
        rowStableId = generateDeterministicId('Members', fields, seen);
      }
    } else if (tabName === 'OrgStructure') {
      if (rowNum <= 55) {
        const fields = {
          _cps_id: String(r[3] ?? '').trim(),
          'Team / responsibility': String(r[0] ?? '').trim(),
          Role: String(r[2] ?? '').trim()
        };
        rowStableId = generateDeterministicId('OrgStructure', fields, seen);
      }
    } else if (tabName === 'Important links') {
      const fields = {
        _cps_id: String(r[2] ?? '').trim(),
        Resource: String(r[0] ?? '').trim()
      };
      rowStableId = generateDeterministicId('Important links', fields, seen);
    }

    if (rowStableId === targetStableId || `${tabName}:${rowNum}` === targetStableId) {
      return {
        rowNumber: rowNum,
        stableId: rowStableId,
        values: r
      };
    }
  }

  return null;
}

function loadBaselineWorkbook() {
  const p = path.resolve(__dirname, '../../workbook.json');
  if (fs.existsSync(p)) {
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {}
  }
  return {};
}

async function sheetsReader(config = {}, options = {}) {
  const sheetId = config.sheetId || process.env.SYNC_SHEET_ID;
  if (!sheetId) {
    throw new Error('Missing sheetId configuration');
  }

  const now = Date.now();
  if (cachedSnapshot && now < cacheExpiresAt) {
    if (options.knownSnapshotHash && options.knownSnapshotHash === cachedSnapshot.snapshotHash) {
      return {
        snapshotHash: cachedSnapshot.snapshotHash,
        snapshotDate: cachedSnapshot.snapshotDate,
        modified: false
      };
    }
    return cachedSnapshot;
  }

  const creds = getCredentials();
  const token = await getAccessToken(creds);

  const ranges = [
    "'Morning Report'!A1:S2500",
    "'CPS Academy VMRs'!A1:I400",
    "'OrgStructure'!A1:I300",
    "'Important links'!A1:C50"
  ];

  const params = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join('&');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchGet?${params}&valueRenderOption=FORMATTED_VALUE`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Sheets batchGet failed (${res.status}): ${text}`);
  }

  const batchData = await res.json();
  const valueRanges = batchData.valueRanges || [];

  const rawMR = valueRanges[0]?.values || [];
  const rawVMR = valueRanges[1]?.values || [];
  const rawOrg = valueRanges[2]?.values || [];
  const rawLinks = valueRanges[3]?.values || [];

  const baseline = loadBaselineWorkbook();
  const parsedMR = parseMorningReport(rawMR);
  const parsedVMR = parseVMRs(rawVMR);
  const parsedOrg = parseOrgStructure(rawOrg);
  const parsedLinks = parseImportantLinks(rawLinks);

  const workbook = {
    ...baseline,
    'Morning Report': parsedMR,
    'CPS Academy VMRs': parsedVMR,
    'OrgStructure': parsedOrg.OrgStructure,
    'Members': parsedOrg.Members,
    'Important links': parsedLinks
  };

  const snapshotDate = new Date().toISOString();
  const serialized = JSON.stringify(workbook);
  const snapshotHash = crypto.createHash('sha256').update(serialized).digest('hex');

  cachedSnapshot = {
    snapshotHash,
    snapshotDate,
    modified: true,
    workbook
  };
  cacheExpiresAt = now + CACHE_TTL_MS;

  if (options.knownSnapshotHash && options.knownSnapshotHash === snapshotHash) {
    return {
      snapshotHash,
      snapshotDate,
      modified: false
    };
  }

  return cachedSnapshot;
}

function clearCache() {
  cachedSnapshot = null;
  cacheExpiresAt = 0;
  cachedToken = null;
  tokenExpiresAt = 0;
}

module.exports = {
  sheetsReader,
  getCredentials,
  getAccessToken,
  clearCache,
  normalizeDate,
  slugify,
  generateDeterministicId,
  findRowByStableId,
  parseMorningReport,
  parseVMRs,
  parseOrgStructure,
  parseImportantLinks
};
