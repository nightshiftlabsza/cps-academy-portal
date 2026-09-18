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

const sheetsReaderModule = require('./_lib/sheets-reader.cjs');
const { getSessionUser } = require('./_lib/auth-session.cjs');
const mutateHandler = require('./mutate.js');

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

module.exports = async function profileHandler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  function sendJson(status, obj) {
    res.statusCode = status;
    res.end(JSON.stringify(obj));
  }

  // 1. Session verification
  const sessionUser = getSessionUser(req);
  if (!sessionUser || !sessionUser.isAuthenticated) {
    return sendJson(401, {
      error: 'UNAUTHORIZED',
      message: 'Active authenticated session required to access profile'
    });
  }

  const userEmail = String(sessionUser.email || '').trim().toLowerCase();

  // 2. GET /api/profile: retrieve fresh online record directly from Google Sheets
  if (req.method === 'GET') {
    try {
      const snapshot = await sheetsReaderModule.sheetsReader();
      const members = snapshot?.workbook?.Members?.records || [];

      // Find member by matching email or stableId
      const matched = members.find(m => {
        const e = String(m.fields?.Email || '').trim().toLowerCase();
        return (e && e === userEmail) || (m.stableId && m.stableId === sessionUser.id) || (m.id && m.id === sessionUser.id);
      });

      if (!matched) {
        return sendJson(404, {
          error: 'MEMBER_NOT_FOUND',
          message: `No member record found matching "${userEmail}" in current online directory`
        });
      }

      const f = matched.fields || {};

      let firstName = f['First Name'] || '';
      let surname = f['Surname'] || '';
      const existingName = f['Name'] || sessionUser.name || '';
      let nameStatus = (firstName || surname) ? 'confirmed' : 'unconfirmed';

      if (!firstName && !surname && existingName) {
        const hasParentheses = existingName.includes('(');
        const cleanName = existingName.replace(/\([^)]*\)/g, '').trim();
        const parts = cleanName.split(/\s+/).filter(Boolean);

        if (parts.length === 1) {
          firstName = parts[0];
          surname = '';
          nameStatus = hasParentheses ? 'complex' : 'suggested';
        } else if (parts.length === 2) {
          firstName = parts[0];
          surname = parts[1];
          nameStatus = hasParentheses ? 'complex' : 'suggested';
        } else if (parts.length > 2) {
          // Complex or compound name (e.g. Praveen Bharath Saravanan)
          firstName = parts.slice(0, -1).join(' ');
          surname = parts[parts.length - 1];
          nameStatus = 'complex';
        }
      }

      let nicknames = f['AKA / Nicknames'] || '';
      if (!nicknames && existingName.includes('(')) {
        const nickMatch = existingName.match(/\(([^)]+)\)/);
        if (nickMatch && nickMatch[1]) {
          nicknames = nickMatch[1].trim();
        }
      }

      return sendJson(200, {
        success: true,
        member: {
          id: matched.id,
          stableId: matched.stableId || matched.id,
          source: matched.source || 'OrgStructure',
          fields: {
            'First Name': firstName,
            'Surname': surname,
            'Name': f['Name'] || existingName,
            '_nameStatus': nameStatus,
            'Email': f['Email'] || sessionUser.email,
            'AKA / Nicknames': nicknames,
            'Birthday': f['Birthday'] || '',
            'Onboarded': f['Onboarded'] || '',
            'Onboarded At': f['Onboarded At'] || '',
            'Country': f['Country'] || '',
            'Location': f['Location'] || '',
            'Social handles': f['Social handles'] || '',
            'Subspecialty': f['Subspecialty'] || '',
            'Sponsor': f['Sponsor'] || ''
          }
        }
      });
    } catch (err) {
      return sendJson(503, {
        error: 'SHEETS_UNAVAILABLE',
        message: 'Could not load current online record from Google Sheets: ' + err.message
      });
    }
  }

  // 3. POST /api/profile: Save profile updates through mutation pipeline
  if (req.method === 'POST') {
    let body;
    try {
      body = await parseBody(req);
    } catch (err) {
      return sendJson(400, { error: 'INVALID_JSON', message: 'Malformed JSON payload' });
    }

    const {
      firstName,
      surname,
      isSingleName,
      nicknames,
      birthday,
      birthdayTouched,
      birthdayCleared,
      originalBirthday,
      expectedPreviousValues,
      stableId,
      markOnboarded
    } = body || {};

    const cleanFirst = String(firstName || '').trim();
    const cleanSurname = String(surname || '').trim();
    const cleanNicknames = String(nicknames || '').trim();

    if (!cleanFirst) {
      return sendJson(400, { error: 'MISSING_FIRST_NAME', message: 'First name is required' });
    }
    if (!isSingleName && !cleanSurname) {
      return sendJson(400, { error: 'MISSING_SURNAME', message: 'Surname is required (or check single legal name)' });
    }

    // Reconstruct familiar visible Name column:
    // If the client provided a confirmed displayName (e.g. customized/reviewed), use it.
    // Otherwise, construct naturally: "First Surname (Nicknames)" while preserving preferred aliases.
    let combinedName = '';
    if (body?.confirmedDisplayName && String(body.confirmedDisplayName).trim()) {
      combinedName = String(body.confirmedDisplayName).trim();
    } else {
      combinedName = isSingleName || !cleanSurname ? cleanFirst : `${cleanFirst} ${cleanSurname}`;
      if (cleanNicknames) {
        if (!combinedName.includes(`(${cleanNicknames})`)) {
          combinedName = `${combinedName} (${cleanNicknames})`;
        }
      }
    }

    // Determine final birthday value:
    // If explicitly cleared by user, set to empty string
    // If touched/selected by user, use provided birthday
    // If untouched, preserve originalBirthday verbatim (even if unparseable or custom)
    let finalBirthday = '';
    if (birthdayCleared) {
      finalBirthday = '';
    } else if (birthdayTouched) {
      finalBirthday = String(birthday || '').trim();
    } else if (originalBirthday !== undefined) {
      finalBirthday = String(originalBirthday || '').trim();
    } else {
      finalBirthday = String(birthday || '').trim();
    }

    const timestamp = new Date().toISOString();
    const fieldsToUpdate = {
      'First Name': cleanFirst,
      'Surname': isSingleName ? '' : cleanSurname,
      'Name': combinedName,
      'AKA / Nicknames': cleanNicknames,
      'Birthday': finalBirthday
    };

    if (markOnboarded) {
      fieldsToUpdate['Onboarded'] = 'true';
      fieldsToUpdate['Onboarded At'] = timestamp;
    }

    const mutateReq = {
      method: 'POST',
      headers: req.headers,
      body: {
        dataset: 'Members',
        stableId: stableId || sessionUser.id,
        fields: fieldsToUpdate,
        expectedPreviousValues: expectedPreviousValues && typeof expectedPreviousValues === 'object' ? expectedPreviousValues : undefined,
        operationId: `op_profile_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      }
    };

    return mutateHandler(mutateReq, res);
  }

  res.setHeader('Allow', 'GET, POST');
  return sendJson(405, { error: 'METHOD_NOT_ALLOWED', message: 'Only GET and POST supported' });
};
