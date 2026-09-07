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

  function splitField(value) {
    // Only a whole divider line denotes a new session. Co-staff names do not.
    return text(value).replace(/\r\n?/g, '\n').split(/\n[ \t]*(?:&|[-_─━=]{3,})[ \t]*(?:\n|$)/).map(s => s.trim());
  }

  function splitMorningReport(record) {
    if (record.session) return [record];
    const fields = record.fields || {};
    const parts = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, splitField(value)]));
    const count = Math.max(1, ...SPLIT_FIELDS.map(key => (parts[key] || []).length));
    if (count === 1) return [{ ...record, fields: { ...fields }, flags: [...(record.flags || [])] }];
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
    return Array.from({ length: count }, (_, index) => {
      const childFields = {};
      for (const [key, values] of Object.entries(parts)) {
        childFields[key] = values.length === count ? values[index]
          : values.length === 1 && SHARED_FIELDS.has(key) ? fields[key]
          : index === 0 ? fields[key] : '';
      }
      return {
        ...record, id: `${record.id}::session:${index + 1}`, fields: childFields,
        links: { ...(record.links || {}) }, flags: [...(record.flags || []), ...unresolved],
        session: { parentId: record.id, index: index + 1, count, unresolved: [...unresolved],
          sourceFields: { ...fields }, unassignedFields: { ...unassignedFields }, version: VERSION }
      };
    });
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
  function clockLabel(c) { return `${c.hour % 12 || 12}:${String(c.minute).padStart(2, '0')}${c.second ? ':' + String(c.second).padStart(2, '0') : ''} ${c.hour < 12 ? 'AM' : 'PM'}`; }
  function sourceTimeLabel(fields) {
    return TIME_FIELDS.map((key, i) => fields[key] ? `${text(fields[key]).trim()}${/\b(?:PST|PDT|EST|EDT|PT|ET)\b/i.test(fields[key]) ? '' : i === 0 ? ' PT' : ' ET'}` : '').filter(Boolean).join(' / ') || text(fields['Date / time (source)']) || 'Time TBD';
  }
  function parseSessionTime(record) {
    const fields = record.fields || {};
    const sourceLabel = sourceTimeLabel(fields);
    const fail = reason => ({ status: 'unresolved', startUtc: null, endUtc: null, sourceLabel, reason, durationAssumed: false });
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
    return { status: 'resolved', startUtc: new Date(start).toISOString(), endUtc: new Date(end).toISOString(),
      sourceLabel: clocks.map(c => `${clockLabel(c.start)}${c.end ? '–' + clockLabel(c.end) : ''} ${c.zone}`).join(' / '),
      reason: '', durationAssumed: !knownEnds.length, sourceDate: date };
  }

  function formatSessionTime(record, timeZone) {
    const time = parseSessionTime(record);
    if (time.status !== 'resolved') return `${time.sourceLabel} • ${time.reason}`;
    try {
      const zone = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      const local = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(time.startUtc));
      return `${time.sourceLabel} • ${local} your time (${zone})`;
    } catch { return `${time.sourceLabel} • Local timezone unavailable`; }
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
    // Delimit people only outside parenthetical annotations.
    const pieces = []; let current = '', depth = 0;
    const raw = text(value);
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
    return [...new Set(pieces)].filter(p => !/^(?:tbd|none|n\/a|-|—)$/i.test(p));
  }
  function matchesFacets(record, selection = {}, gapFn = () => []) {
    const f = record.fields || {};
    return (!selection.type || text(f.Type) === selection.type)
      && (!selection.facilitator || facilitatorNames(f.Facilitator).some(name => name.toLowerCase() === text(selection.facilitator).toLowerCase()))
      && (!selection.gapsOnly || gapFn(record).length > 0);
  }
  return Object.freeze({ VERSION, splitField, splitMorningReport, validDate, parseDate, parseClock, parseSessionTime, formatSessionTime, createCalendar, facilitatorNames, matchesFacets });
});
