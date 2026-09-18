(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SessionCore = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const VERSION = 'session-core-v1';
  const TIME_FIELDS = ['Pacific time (source)', 'Eastern time (source)'];
  const SPLIT_FIELDS = ['Date', ...TIME_FIELDS, 'Type', 'Facilitator', 'Presenter', 'Scribe / teaching points sign-ups'];
  const SHARED_FIELDS = new Set(['Date', 'Type', 'Notes', 'Meeting info']);
  const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const ZONES = { PST: -480, PDT: -420, EST: -300, EDT: -240, UTC: 0, GMT: 0, PT: 'America/Los_Angeles', ET: 'America/New_York' };
  const formatters = new Map();
  const text = value => String(value ?? '');
  const MAX_CACHE_SIZE = 4000;
  const splitCache = new Map();
  const timeResolutionCache = new Map();
  const timeFormatCache = new Map();
  const facilitatorCache = new Map();
  let splitCalls = 0, splitHits = 0;
  let facilitatorCalls = 0, facilitatorHits = 0;

  function splitField(value) {
    // Only a whole divider line denotes a new session. Co-staff names do not.
    return text(value).replace(/\r\n?/g, '\n').split(/\n[ \t]*(?:&|[-_─━=]{3,})[ \t]*(?:\n|$)/).map(s => s.trim());
  }

  function slugify(val) {
    return String(val || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 30);
  }

  function generateDeterministicId(dataset, fields, seenIds = new Set()) {
    let baseId = '';
    const f = fields || {};
    if (f._cps_id && String(f._cps_id).trim()) {
      baseId = String(f._cps_id).trim();
    } else if (dataset === 'Morning Report') {
      const d = f.Date || 'undated';
      const type = slugify(f.Type) || 'mr';
      const time = slugify(f['Pacific time (source)']) || 'time';
      baseId = `mr-${d}-${type}-${time}`;
    } else if (dataset === 'CPS Academy VMRs') {
      const d = f['Date / time (source)'] ? slugify(f['Date / time (source)']).slice(0, 15) : 'undated';
      const title = slugify(f['Session title']) || 'vmr';
      baseId = `vmr-${d}-${title}`;
    } else if (dataset === 'Members') {
      const emailSlug = f.Email ? slugify(f.Email.split('@')[0]) : '';
      const nameSlug = slugify(f.Name) || 'member';
      baseId = `mem-${emailSlug || nameSlug}`;
    } else if (dataset === 'OrgStructure') {
      const teamSlug = f['Team / responsibility'] ? slugify(f['Team / responsibility']) : 'team';
      const roleSlug = slugify(f.Role) || 'role';
      baseId = `org-${teamSlug}-${roleSlug}`;
    } else if (dataset === 'Important links') {
      baseId = `link-${slugify(f.Resource) || 'res'}`;
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

  function splitMorningReport(record) {
    if (record.session) return [record];
    splitCalls++;
    const cacheKey = `${record.id}::${SPLIT_FIELDS.map(k => record.fields?.[k] || '').join('||')}`;
    if (splitCache.has(cacheKey)) {
      splitHits++;
      return splitCache.get(cacheKey).map(r => ({
        ...r,
        fields: { ...r.fields },
        flags: [...r.flags],
        ...(r.session ? { session: { ...r.session, unresolved: [...r.session.unresolved] } } : {})
      }));
    }
    const fields = record.fields || {};
    const parts = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, splitField(value)]));
    const count = Math.max(1, ...SPLIT_FIELDS.map(key => (parts[key] || []).length));
    if (count === 1) {
      const res = [{ ...record, fields: { ...fields }, flags: [...(record.flags || [])] }];
      if (splitCache.size >= MAX_CACHE_SIZE) splitCache.delete(splitCache.keys().next().value);
      splitCache.set(cacheKey, res.map(r => Object.freeze({ ...r, fields: Object.freeze({ ...r.fields }), flags: Object.freeze([...r.flags]) })));
      return res;
    }
    const parentStableId = record.stableId || generateDeterministicId('Morning Report', fields);
    const unresolved = [];
    const unassignedFields = {};
    for (const [key, values] of Object.entries(parts)) {
      if (values.length !== count && text(fields[key]).trim() && !SHARED_FIELDS.has(key)) {
        unresolved.push(`${key}: ${values.length} source block(s) for ${count} sessions; assignment needs review.`);
        unassignedFields[key] = fields[key];
      }
      if (values.length > 1 && values.length !== count && SHARED_FIELDS.has(key)) {
        unresolved.push(`${key}: source block count does not match the session count.`);
      }
    }
    const children = Array.from({ length: count }, (_, index) => {
      const childFields = {};
      for (const [key, values] of Object.entries(parts)) {
        childFields[key] = values.length === count ? values[index]
          : values.length === 1 && SHARED_FIELDS.has(key) ? fields[key]
          : index === 0 ? fields[key] : '';
      }
      return {
        ...record,
        id: `${record.id}::session:${index + 1}`,
        stableId: `${parentStableId}#${index + 1}`,
        parentId: parentStableId,
        fields: childFields,
        links: { ...(record.links || {}) },
        flags: [...(record.flags || []), ...unresolved],
        session: {
          parentId: record.id,
          parentStableId: parentStableId,
          index: index + 1,
          count,
          unresolved: [...unresolved],
          sourceFields: { ...fields },
          unassignedFields: { ...unassignedFields },
          version: VERSION
        }
      };
    });
    if (splitCache.size >= MAX_CACHE_SIZE) splitCache.delete(splitCache.keys().next().value);
    splitCache.set(cacheKey, children.map(r => Object.freeze({
      ...r,
      fields: Object.freeze({ ...r.fields }),
      flags: Object.freeze([...r.flags]),
      session: Object.freeze({ ...r.session, unresolved: Object.freeze([...r.session.unresolved]) })
    })));
    return children;
  }

  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
    const stamp = Date.parse(`${value}T12:00:00Z`);
    return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === value ? value : '';
  }
  function parseDate(value) {
    const raw = text(value).trim();
    const found = [];
    for (const match of raw.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)) found.push(validDate(match[1]));
    const months = new RegExp(`\\b(${MONTHS.join('|')})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*,?\\s*(\\d{4})\\b`, 'gi');
    for (const m of raw.matchAll(months)) found.push(validDate(`${m[3]}-${String(MONTHS.indexOf(m[1].toLowerCase()) + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`));
    for (const m of raw.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)) {
      const a = Number(m[1]), b = Number(m[2]);
      if (a <= 12 && b <= 12 && a !== b) return '';
      found.push(validDate(`${m[3]}-${String(a > 12 ? b : a).padStart(2, '0')}-${String(a > 12 ? a : b).padStart(2, '0')}`));
    }
    return found.length && found.every(v => v && v === found[0]) ? found[0] : '';
  }

  function clockValue(value) {
    const m = text(value).trim().match(/^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*([ap])?\s*\.?\s*m?\.?$/i);
    if (!m) return null;
    let hour = Number(m[1]);
    const minute = Number(m[2] || 0), second = Number(m[3] || 0);
    if (minute > 59 || second > 59 || (!m[4] && !m[2])) return null;
    if (m[4]) {
      if (hour < 1 || hour > 12) return null;
      hour = hour % 12 + (m[4].toLowerCase() === 'p' ? 12 : 0);
    } else if (hour > 23) return null;
    return { hour, minute, second };
  }
  function parseClock(value, defaultZone) {
    let raw = text(value).trim().replace(/[\u00a0\u202f]/g, ' ');
    if (!raw || /\b(tbd|to be|cancelled|canceled)\b/i.test(raw)) return null;
    const z = raw.match(/\s*\b(PST|PDT|EST|EDT|PT|ET|UTC|GMT)\s*$/i);
    const zone = z ? z[1].toUpperCase() : defaultZone;
    if (!Object.hasOwn(ZONES, zone)) return null;
    if (z) raw = raw.slice(0, z.index).trim();
    const range = raw.split(/\s*(?:–|—|\s+to\s+|-)\s*/i);
    if (range.length > 2) return null;
    const start = clockValue(range[0]);
    const end = range.length === 2 ? clockValue(range[1]) : null;
    return start && (range.length === 1 || end) ? { start, end, zone } : null;
  }
  function dateParts(stamp, zone) {
    if (!formatters.has(zone)) formatters.set(zone, new Intl.DateTimeFormat('en-CA', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }));
    return Object.fromEntries(formatters.get(zone).formatToParts(new Date(stamp)).map(p => [p.type, p.value]));
  }
  function instant(date, clock, zone) {
    const wall = Date.parse(`${date}T${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')}:${String(clock.second).padStart(2, '0')}Z`);
    if (typeof ZONES[zone] === 'number') return wall - ZONES[zone] * 60000;
    const offsets = zone === 'PT' ? [-480, -420] : [-300, -240];
    const matches = offsets.map(offset => wall - offset * 60000).filter(stamp => {
      const p = dateParts(stamp, ZONES[zone]);
      return `${p.year}-${p.month}-${p.day}` === date && Number(p.hour) === clock.hour && Number(p.minute) === clock.minute && Number(p.second) === clock.second;
    });
    return matches.length === 1 ? matches[0] : null;
  }
  function addDays(date, days) { return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10); }
  function getWeekBounds(value) {
    const dStr = parseDate(value);
    if (!dStr) return null;
    const d = new Date(`${dStr}T12:00:00Z`);
    const day = d.getUTCDay();
    const diffToMon = day === 0 ? -6 : 1 - day;
    const start = addDays(dStr, diffToMon);
    const end = addDays(start, 6);
    return { start, end, convention: 'Monday to Sunday (UTC source date)' };
  }
  function addWeeks(isoDate, deltaWeeks) { return addDays(isoDate, deltaWeeks * 7); }
  function clockLabel(c) { return `${c.hour % 12 || 12}:${String(c.minute).padStart(2, '0')}${c.second ? ':' + String(c.second).padStart(2, '0') : ''} ${c.hour < 12 ? 'AM' : 'PM'}`; }
  function sourceTimeLabel(fields) {
    return TIME_FIELDS.map((key, i) => fields[key] ? `${text(fields[key]).trim()}${/\b(?:PST|PDT|EST|EDT|PT|ET)\b/i.test(fields[key]) ? '' : i === 0 ? ' PT' : ' ET'}` : '').filter(Boolean).join(' / ') || text(fields['Date / time (source)']) || 'Time TBD';
  }
  function parseSessionTime(record) {
    const fields = record.fields || {};
    const legacyKey = Object.keys(record.session?.legacyOverrides || {}).sort().join(';');
    const unresKey = (record.session?.unresolved || []).join(';');
    const recordId = record.id || '';
    const cacheKey = `${recordId}::${VERSION}::${fields.Date || ''}::${fields['Pacific time (source)'] || ''}::${fields['Eastern time (source)'] || ''}::${fields['Date / time (source)'] || ''}::${fields.Start || ''}::${fields.Type || ''}::${fields.Notes || ''}::${unresKey}::${legacyKey}`;
    if (timeResolutionCache.has(cacheKey)) {
      return timeResolutionCache.get(cacheKey);
    }
    const sourceLabel = sourceTimeLabel(fields);
    const fail = reason => {
      const res = { status: 'unresolved', startUtc: null, endUtc: null, sourceLabel, reason, durationAssumed: false };
      if (timeResolutionCache.size >= MAX_CACHE_SIZE) timeResolutionCache.delete(timeResolutionCache.keys().next().value);
      timeResolutionCache.set(cacheKey, res);
      return res;
    };
    if (Object.keys(record.session?.legacyOverrides || {}).some(key => /date|time/i.test(key))) return fail('Earlier row-level date/time edits need review for this session.');
    if (/\b(cancelled|canceled|moved\s+to|postponed)\b/i.test([fields.Type, fields.Notes, fields['Date / time (source)']].join(' '))) return fail('Source indicates a cancellation or changed schedule; verify the session first.');
    if (record.session?.unresolved?.some(s => /time|Date/i.test(s))) return fail('Time blocks do not align with the split sessions; verify source times.');
    const date = parseDate(fields.Date || fields['Date / time (source)'] || fields.Start);
    if (!date) return fail('Date is missing, invalid or ambiguous.');
    const clocks = [];
    for (let i = 0; i < TIME_FIELDS.length; i++) {
      const raw = text(fields[TIME_FIELDS[i]]).trim();
      if (!raw || /^(tbd|to be scheduled)$/i.test(raw)) continue;
      const clock = parseClock(raw, i === 0 ? 'PT' : 'ET');
      if (!clock) return fail('A source clock could not be read unambiguously.');
      clocks.push(clock);
    }
    if (!clocks.length && fields['Date / time (source)']) {
      const raw = text(fields['Date / time (source)']);
      const timePattern = /\b(\d{1,2}(?::\d{2})?(?::\d{2})?\s*(?:[ap]\s*\.?\s*m?\.?)?(?:\s*(?:-|–|—|to)\s*\d{1,2}(?::\d{2})?(?::\d{2})?\s*(?:[ap]\s*\.?\s*m?\.?)?)?\s*(?:PST|PDT|EST|EDT|PT|ET|UTC|GMT))\b/gi;
      const matches = [...raw.matchAll(timePattern)];
      for (const m of matches) {
        const clock = parseClock(m[1]);
        if (!clock) return fail('A source clock has missing AM/PM or invalid formatting.');
        clocks.push(clock);
      }
    }
    if (!clocks.length) return fail('Time or timezone is not specified.');
    if (clocks.length > 2) return fail('Multiple session times need to be separated first.');
    const starts = clocks.map(c => instant(date, c.start, c.zone));
    if (starts.some(s => s === null)) return fail('The source time falls in a daylight-saving gap or repeated hour.');
    // The first clock establishes the source day; eastern labels may cross midnight.
    if (starts.length === 2 && starts[0] !== starts[1]) {
      const c = clocks[1];
      const alternate = [-1, 1].map(delta => instant(addDays(date, delta), c.start, c.zone));
      if (alternate.includes(starts[0])) starts[1] = starts[0];
      else return fail('Pacific and Eastern source clocks disagree.');
    }
    const start = starts[0];
    const ends = clocks.map((c, i) => {
      if (!c.end) return null;
      let baseDate = date;
      if (i && instant(date, c.start, c.zone) !== start) baseDate = [-1, 1].map(d => addDays(date, d)).find(d => instant(d, c.start, c.zone) === start);
      let end = instant(baseDate, c.end, c.zone);
      if (end !== null && end <= start) end = instant(addDays(baseDate, 1), c.end, c.zone);
      return end;
    });
    if (clocks.some((c, i) => c.end && ends[i] === null)) return fail('End time is ambiguous during a daylight-saving change.');
    const knownEnds = ends.filter(e => e !== null);
    if (knownEnds.some(e => e !== knownEnds[0])) return fail('Source end times disagree.');
    const end = knownEnds[0] ?? start + 3600000;
    if (end <= start || end - start > 86400000) return fail('Session duration is invalid.');
    const resolved = { status: 'resolved', startUtc: new Date(start).toISOString(), endUtc: new Date(end).toISOString(),
      sourceLabel: clocks.map(c => `${clockLabel(c.start)}${c.end ? '–' + clockLabel(c.end) : ''} ${c.zone}`).join(' / '),
      reason: '', durationAssumed: !knownEnds.length, sourceDate: date };
    if (timeResolutionCache.size >= MAX_CACHE_SIZE) timeResolutionCache.delete(timeResolutionCache.keys().next().value);
    timeResolutionCache.set(cacheKey, resolved);
    return resolved;
  }

  function formatSessionTime(record, timeZone) {
    const time = parseSessionTime(record);
    const zone = timeZone || (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC');
    const recordId = record.id || '';
    const formatKey = `${recordId}::${time.status}::${time.startUtc}::${time.sourceLabel}::${time.reason}::${zone}`;
    if (timeFormatCache.has(formatKey)) return timeFormatCache.get(formatKey);

    if (time.status !== 'resolved') {
      const res = `${time.sourceLabel} • ${time.reason}`;
      if (timeFormatCache.size >= MAX_CACHE_SIZE) timeFormatCache.delete(timeFormatCache.keys().next().value);
      timeFormatCache.set(formatKey, res);
      return res;
    }
    try {
      const local = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(time.startUtc));
      const formatted = `${time.sourceLabel} • ${local} your time (${zone})`;
      if (timeFormatCache.size >= MAX_CACHE_SIZE) timeFormatCache.delete(timeFormatCache.keys().next().value);
      timeFormatCache.set(formatKey, formatted);
      return formatted;
    } catch {
      const fallback = `${time.sourceLabel} • Local timezone unavailable`;
      return fallback;
    }
  }

  function formatSessionTimeBreakdown(record, userZone) {
    const parsed = parseSessionTime(record);
    if (parsed.status !== 'resolved' || !parsed.startUtc) {
      return {
        status: 'unresolved',
        startUtc: null,
        primaryText: 'Time TBD',
        sourceLabel: parsed.sourceLabel || 'Time TBD',
        reason: parsed.reason || 'Time unconfirmed in source',
        hasDisclosure: false,
        isLocal: false,
        fallbackMode: null,
        userZoneName: null,
        local: null,
        eastern: null,
        pacific: null
      };
    }
    const d = new Date(parsed.startUtc);

    function formatZone(targetZone) {
      const formatter = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: targetZone,
        timeZoneName: 'short'
      });
      const parts = formatter.formatToParts(d);
      const time = parts.filter(p => p.type !== 'timeZoneName').map(p => p.value).join('').trim();
      const zoneLabel = parts.find(p => p.type === 'timeZoneName')?.value || targetZone;
      return { time, zoneLabel, zoneId: targetZone, text: `${time} ${zoneLabel}` };
    }

    const eastern = formatZone('America/New_York');
    const pacific = formatZone('America/Los_Angeles');

    let local = null;
    let isLocal = false;
    if (userZone && typeof userZone === 'string') {
      try {
        local = formatZone(userZone.trim());
        isLocal = true;
      } catch {}
    }

    if (isLocal && local) {
      return {
        status: 'resolved',
        startUtc: parsed.startUtc,
        primaryText: local.text,
        isLocal: true,
        fallbackMode: null,
        userZoneName: userZone,
        hasDisclosure: true,
        local,
        eastern,
        pacific,
        sourceLabel: parsed.sourceLabel
      };
    }

    return {
      status: 'resolved',
      startUtc: parsed.startUtc,
      primaryText: eastern.text,
      isLocal: false,
      fallbackMode: 'institutional-eastern',
      userZoneName: null,
      hasDisclosure: true,
      local: null,
      eastern,
      pacific,
      sourceLabel: parsed.sourceLabel
    };
  }

  function escapeCalendar(value) {
    return text(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
  }
  function foldCalendar(line) {
    const lines = []; let current = '', bytes = 0;
    for (const char of line) {
      const n = new TextEncoder().encode(char).length;
      if (bytes + n > 75) { lines.push(current); current = ' '; bytes = 1; }
      current += char; bytes += n;
    }
    lines.push(current); return lines.join('\r\n');
  }
  function createCalendar(record, options = {}) {
    const time = parseSessionTime(record);
    if (time.status !== 'resolved') throw new Error(time.reason);
    if (!record.id) throw new Error('A stable session ID is required for calendar export.');
    const stamp = value => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const now = options.now ?? new Date();
    if (!Number.isFinite(new Date(now).getTime())) throw new Error('Invalid calendar generation timestamp.');
    const fields = record.fields || {};
    const name = options.title || fields['Session title'] || fields.Topic || fields.Type || 'Academy session';
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CPS Academy//Local Portal//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      `UID:${encodeURIComponent(record.id)}@cps-academy.local`, `DTSTAMP:${stamp(now)}`, `DTSTART:${stamp(time.startUtc)}`, `DTEND:${stamp(time.endUtc)}`,
      `SUMMARY:${escapeCalendar(name)}`, 'CLASS:PRIVATE'];
    const details = [time.sourceLabel, `Source: ${record.source || 'Local draft'}${record.row ? ' row ' + record.row : ''}${record.session ? ' session ' + record.session.index : ''}`,
      'Workbook assignments; changes are saved on this device.', ...(time.durationAssumed ? ['Duration: 60 minutes assumed; source does not specify an end time.'] : []),
      ...Object.entries(fields).filter(([, v]) => text(v).trim()).map(([k, v]) => `${k}: ${v}`)];
    const links = [...new Set([...Object.values(fields), ...Object.values(record.links || {})].flatMap(v => text(v).match(/https?:\/\/[^\s<>"\u0000-\u001f]+/g) || []))];
    const meeting = links.find(link => { try { return /(^|\.)(zoom\.us|zoomgov\.com)$/.test(new URL(link).hostname); } catch { return false; } });
    if (meeting) lines.push(`LOCATION:${escapeCalendar(meeting)}`);
    details.push(...links.map(link => `Link: ${link}`));
    lines.push(`DESCRIPTION:${escapeCalendar(details.join('\n'))}`, 'END:VEVENT', 'END:VCALENDAR');
    return lines.map(foldCalendar).join('\r\n') + '\r\n';
  }
  function facilitatorNames(value) {
    facilitatorCalls++;
    const raw = text(value);
    if (facilitatorCache.has(raw)) {
      facilitatorHits++;
      return facilitatorCache.get(raw);
    }
    // Delimit people only outside parenthetical annotations.
    const pieces = []; let current = '', depth = 0;
    for (let i = 0; i < raw.length; i++) {
      const char = raw[i];
      if (char === '(') depth++;
      if (char === ')') depth = Math.max(0, depth - 1);
      const word = depth === 0 ? raw.slice(i).match(/^(?:\s+(?:and|with)\s+|\s+w\/\s*)/i) : null;
      if (depth === 0 && (/[&/+,;\n]/.test(char) || word)) {
        if (current.trim()) pieces.push(current.trim());
        current = ''; if (word) i += word[0].length - 1;
      } else current += char;
    }
    if (current.trim()) pieces.push(current.trim());
    const res = Object.freeze([...new Set(pieces)].filter(p => !/^(?:tbd|none|n\/a|-|—)$/i.test(p)));
    if (facilitatorCache.size >= MAX_CACHE_SIZE) facilitatorCache.delete(facilitatorCache.keys().next().value);
    facilitatorCache.set(raw, res);
    return res;
  }

  function normalizeSessionTypeName(raw) {
    const val = text(raw).trim();
    if (!val || /^(?:tbd|none|-|—|\?)$/i.test(val)) return 'Virtual Morning Report';
    if (/^spontaneous$/i.test(val)) return 'Virtual Morning Report';
    if (/^spontaneous\s*&\s*no\s*academy$/i.test(val)) return 'Virtual Morning Report (No Academy)';
    return val;
  }

  function getSessionDisplayTitle(record) {
    const f = (record && record.fields) || {};
    const rawType = text(f.Type).trim();
    const rawTopic = text(f['Topic / Case']).trim();
    const rawDetails = text(f.Details).trim();
    const typeDisplay = normalizeSessionTypeName(rawType);

    let specificTitle = '';
    if (rawTopic && !/^(?:tbd|none|-|—|\?)$/i.test(rawTopic)) specificTitle = rawTopic;
    else if (rawDetails && !/^(?:tbd|none|-|—|\?)$/i.test(rawDetails)) specificTitle = rawDetails;

    // If there is a distinct topic/case, title is that topic, type is contextual tag
    if (specificTitle && specificTitle.toLowerCase() !== typeDisplay.toLowerCase() && specificTitle.toLowerCase() !== rawType.toLowerCase()) {
      return {
        mainTitle: specificTitle,
        sessionTypeTag: typeDisplay,
        hasDistinctTag: true
      };
    }

    // Otherwise, title is the normalized session name once (no duplicate tag)
    return {
      mainTitle: typeDisplay,
      sessionTypeTag: '',
      hasDistinctTag: false
    };
  }

  function normalizePersonKey(name) {
    if (!name || typeof name !== 'string') return '';
    const cleaned = name.replace(/\([^)]*\)/g, '').trim();
    return cleaned.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function extractSessionRolePeople(r) {
    const f = r.fields || {};
    const getParsedPeople = (raw) => facilitatorNames(raw);

    const facilitator = getParsedPeople(f.Facilitator);
    let presenter = getParsedPeople(f.Presenter);
    let scribe = [];
    let teachingPoints = [];

    const signups = text(f['Scribe / teaching points sign-ups']);
    if (signups) {
      if (!presenter.length) {
        const presMatch = signups.match(/(?:^|[\r\n|])\s*(?:Case Presenter|Presenter):[^\S\r\n]*([^\r\n|]*)/i);
        if (presMatch && presMatch[1]) presenter = getParsedPeople(presMatch[1]);
      }
      const scribeMatch = signups.match(/(?:^|[\r\n|])\s*Scribe:[^\S\r\n]*([^\r\n|]*)/i);
      if (scribeMatch && scribeMatch[1]) scribe = getParsedPeople(scribeMatch[1]);

      const tpMatch = signups.match(/(?:^|[\r\n|])\s*(?:Teaching Points|TP):[^\S\r\n]*([^\r\n|]*)/i);
      if (tpMatch && tpMatch[1]) teachingPoints = getParsedPeople(tpMatch[1]);
    }

    return { Facilitator: facilitator, Presenter: presenter, Scribe: scribe, 'Teaching Points': teachingPoints };
  }

  function buildRoleMilestoneIndex(allRecords) {
    const validSessions = [];
    for (const r of allRecords) {
      const f = r.fields || {};
      const isCanceled = /canceled|cancelled|recess|blackout/i.test(text(f.Facilitator) + text(f.Type) + text(f.Notes));
      if (isCanceled) continue;
      const dateIso = validDate(f.Date);
      if (!dateIso) continue;

      const timing = parseSessionTime(r);
      const sortTime = timing.startUtc ? timing.startUtc : `${dateIso}T12:00:00.000Z`;
      validSessions.push({
        id: r.id,
        dateIso,
        sortTime,
        roles: extractSessionRolePeople(r)
      });
    }

    validSessions.sort((a, b) => a.sortTime.localeCompare(b.sortTime) || a.id.localeCompare(b.id));

    const roleHistories = { Facilitator: new Map(), Presenter: new Map(), Scribe: new Map(), 'Teaching Points': new Map() };
    const milestoneIndex = new Map();

    for (const session of validSessions) {
      const sessionMilestones = { Facilitator: {}, Presenter: {}, Scribe: {}, 'Teaching Points': {} };
      for (const role of ['Facilitator', 'Presenter', 'Scribe', 'Teaching Points']) {
        const people = session.roles[role] || [];
        const history = roleHistories[role];
        for (const person of people) {
          const key = normalizePersonKey(person);
          if (!key) continue;
          const priorCount = history.get(key) || 0;
          let ordinal = null;
          if (priorCount === 0) ordinal = '1st time';
          else if (priorCount === 1) ordinal = '2nd time';
          else if (priorCount === 2) ordinal = '3rd time';
          sessionMilestones[role][key] = { priorCount, ordinal };
        }
      }
      for (const role of ['Facilitator', 'Presenter', 'Scribe', 'Teaching Points']) {
        const people = session.roles[role] || [];
        const history = roleHistories[role];
        for (const person of people) {
          const key = normalizePersonKey(person);
          if (key) history.set(key, (history.get(key) || 0) + 1);
        }
      }
      milestoneIndex.set(session.id, sessionMilestones);
    }

    return {
      getMilestone: (sessionId, role, personName) => {
        const sessionMap = milestoneIndex.get(sessionId);
        if (!sessionMap || !sessionMap[role]) return null;
        const key = normalizePersonKey(personName);
        return sessionMap[role][key] || null;
      }
    };
  }

  function matchesFacets(record, selection = {}, gapFn = () => []) {
    const f = record.fields || {};
    return (!selection.type || text(f.Type) === selection.type)
      && (!selection.facilitator || facilitatorNames(f.Facilitator).some(name => name.toLowerCase() === text(selection.facilitator).toLowerCase()))
      && (!selection.gapsOnly || gapFn(record).length > 0);
  }
  function invalidateRecord(id) {
    if (!id) return;
    const prefix = `${id}::`;
    for (const key of splitCache.keys()) {
      if (key.startsWith(prefix)) splitCache.delete(key);
    }
    for (const key of timeResolutionCache.keys()) {
      if (key.startsWith(prefix)) timeResolutionCache.delete(key);
    }
    for (const key of timeFormatCache.keys()) {
      if (key.startsWith(prefix)) timeFormatCache.delete(key);
    }
  }
  function clearCaches() {
    splitCache.clear();
    timeResolutionCache.clear();
    timeFormatCache.clear();
    facilitatorCache.clear();
    splitCalls = 0;
    splitHits = 0;
    facilitatorCalls = 0;
    facilitatorHits = 0;
  }
  function getCacheStats() {
    return {
      splitSize: splitCache.size,
      timeResolutionSize: timeResolutionCache.size,
      timeFormatSize: timeFormatCache.size,
      facilitatorSize: facilitatorCache.size,
      splitCalls,
      splitHits,
      facilitatorCalls,
      facilitatorHits
    };
  }
  return Object.freeze({
    VERSION,
    splitField,
    splitMorningReport,
    validDate,
    parseDate,
    parseClock,
    parseSessionTime,
    formatSessionTime,
    formatSessionTimeBreakdown,
    createCalendar,
    facilitatorNames,
    normalizeSessionTypeName,
    getSessionDisplayTitle,
    buildRoleMilestoneIndex,
    matchesFacets,
    invalidateRecord,
    clearCaches,
    getCacheStats,
    getWeekBounds,
    addWeeks,
    slugify,
    generateDeterministicId
  });
});
