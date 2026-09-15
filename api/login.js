'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Auto-load .env.local if present in local dev
const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath) && typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(envPath);
  } catch {}
}

const { sheetsReader } = require('./_lib/sheets-reader.cjs');
const { createSessionToken } = require('./_lib/auth-session.cjs');

const UNIVERSAL_PASSWORD = process.env.UNIVERSAL_PASSWORD || 'cpsvmr143';
const ADMIN_EMAILS = new Set((process.env.ADMIN_EMAILS || 'zak@cpsolvers.com,saketh@cpsolvers.com,admin@cpsolvers.com,zak@example.com,admin@example.com').toLowerCase().split(',').map(s => s.trim()).filter(Boolean));

function parseBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let raw = '';
    req.on('data', chunk => { raw += chunk.toString('utf8'); });
    req.on('end', () => {
      if (!raw.trim()) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

module.exports = async function loginHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  function sendJson(status, obj) {
    res.statusCode = status;
    res.end(JSON.stringify(obj));
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(405, { error: 'METHOD_NOT_ALLOWED', message: 'Only POST supported' });
  }

  let body;
  try {
    body = await parseBody(req);
  } catch (err) {
    return sendJson(400, { error: 'INVALID_JSON', message: 'Malformed JSON payload' });
  }

  const { email, password } = body || {};
  if (!email || !String(email).trim()) {
    return sendJson(400, { error: 'MISSING_EMAIL', message: 'Email address is required' });
  }
  if (!password) {
    return sendJson(400, { error: 'MISSING_PASSWORD', message: 'Password is required' });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  if (password !== UNIVERSAL_PASSWORD) {
    return sendJson(401, { error: 'INVALID_CREDENTIALS', message: 'Incorrect password' });
  }

  // Look up member in live sheets snapshot
  let memberName = cleanEmail.split('@')[0];
  let memberId = `mem-${cleanEmail.replace(/[^a-z0-9]+/g, '-')}`;
  let isAcademyMember = false;

  try {
    const snapshot = await sheetsReader();
    const members = snapshot.workbook?.Members?.records || [];
    const matched = members.find(m => {
      const e = String(m.fields?.Email || '').trim().toLowerCase();
      return e === cleanEmail;
    });

    if (matched) {
      isAcademyMember = true;
      memberName = matched.fields?.Name || memberName;
      memberId = matched.stableId || matched.id;
    }
  } catch (err) {
    // If sheets reader fails or is offline, allow login with email fallback
    console.warn('Login sheet lookup warning:', err.message);
  }

  const isAdmin = ADMIN_EMAILS.has(cleanEmail);
  const role = isAdmin ? 'admin' : isAcademyMember ? 'member' : 'viewer';

  const user = {
    email: cleanEmail,
    name: memberName,
    role,
    id: memberId,
    isAuthenticated: true
  };

  const token = createSessionToken(user);
  res.setHeader('Set-Cookie', `cps_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);

  return sendJson(200, {
    success: true,
    token,
    user
  });
};
