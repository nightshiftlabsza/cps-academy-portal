(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MorningReportModule = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const KEY = 'cps-hub-workspace-v2';

  // State
  let mrMonthSelectedWeekIndex = null;
  let mrMonthExpandedId = null;
  let mrFiltersPanelCollapsed = false;
  let scheduleFiltersOpen = false;
  let activeTimePickerState = null;
  let _cachedMilestoneIndex = null;
  let _cachedMilestoneRecordCount = 0;

  function getDefaultScheduleMonth() {
    const t = typeof today === 'function' ? today() : (typeof root.today === 'function' ? root.today() : '2026-09-08');
    return t.slice(0, 7);
  }

  function mrShiftMonth(monthStr, delta) {
    const cur = monthStr || getDefaultScheduleMonth();
    const [y, m] = cur.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    return d.toISOString().slice(0, 7);
  }

  function mrMonthLabel(monthStr) {
    const cur = monthStr || getDefaultScheduleMonth();
    const [y, m] = cur.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1, 1));
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }

  function getDefaultScheduleWeekStart() {
    const t = typeof today === 'function' ? today() : (typeof root.today === 'function' ? root.today() : '2026-09-08');
    const b = typeof SessionCore !== 'undefined' && SessionCore.getWeekBounds ? SessionCore.getWeekBounds(t) : (typeof root.SessionCore !== 'undefined' ? root.SessionCore.getWeekBounds(t) : null);
    return b ? b.start : '2026-09-07';
  }

  function getMonthCalendarWeeks(yearMonth) {
    const [yStr, mStr] = (yearMonth || getDefaultScheduleMonth()).split('-');
    const year = parseInt(yStr, 10);
    const month = parseInt(mStr, 10);
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const weeks = [];
    let curWeek = null;
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const d = new Date(`${dateStr}T12:00:00Z`);
      const dayOfWeek = d.getUTCDay(); // 0 = Sun, 1 = Mon ...
      if (!curWeek || dayOfWeek === 1) {
        if (curWeek) weeks.push(curWeek);
        curWeek = { index: weeks.length + 1, startDate: dateStr, endDate: dateStr, days: [dateStr] };
      } else {
        curWeek.endDate = dateStr;
        curWeek.days.push(dateStr);
      }
    }
    if (curWeek) weeks.push(curWeek);
    return weeks;
  }

  function formatMonthWeekLabel(startDateStr, endDateStr) {
    const sObj = new Date(`${startDateStr}T12:00:00Z`);
    const eObj = new Date(`${endDateStr}T12:00:00Z`);
    const sMonth = sObj.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
    const eMonth = eObj.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
    const sDay = sObj.getUTCDate();
    const eDay = eObj.getUTCDate();
    if (sMonth === eMonth) {
      return `${sMonth} ${sDay} – ${eDay}`;
    }
    return `${sMonth} ${sDay} – ${eMonth} ${eDay}`;
  }

  function staffingTools() {
    return `<section class="staffing-tools"><h3>Quick staffing entry</h3><p>Choose a role and enter a name. This fills the form; use Save changes to keep it.</p><label>Role<select id="staff-role" class="select">${['Facilitator','Presenter','Scribe','Teaching Points','Active participant 1','Active participant 2','Active participant 3','Active participant 4','Chat support','Available team'].map(k=>`<option>${k}</option>`).join('')}</select></label><label>Name<input id="staff-name" placeholder="Name or team" autocomplete="off"></label><button type="button" class="button secondary" id="assign-name">Fill assignment</button><p id="staff-message" role="status"></p></section>`;
  }

  function bindStaffingTools(targetRole) {
    const assignBtn = document.getElementById('assign-name');
    if (!assignBtn) return;
    const staffRole = document.getElementById('staff-role');
    const staffName = document.getElementById('staff-name');
    const staffMessage = document.getElementById('staff-message');

    if (targetRole && staffRole) {
      staffRole.value = targetRole;
      if (typeof window !== 'undefined' && (window.innerWidth || 0) > 760) {
        setTimeout(() => staffName?.focus(), 60);
      }
    }
    assignBtn.onclick = () => {
      const name = (staffName ? staffName.value : '').trim();
      const role = staffRole ? staffRole.value : '';
      if (!name) {
        if (staffMessage) staffMessage.textContent = 'Enter a name first.';
        return;
      }
      const dialogContent = document.getElementById('dialog-content');
      if (!dialogContent) return;

      if (role === 'Scribe' || role === 'Teaching Points') {
        const el = [...dialogContent.querySelectorAll('[data-field]')].find(e => e.dataset.field === 'Scribe / teaching points sign-ups');
        if (el) {
          const rolePat = role === 'Teaching Points' ? '(?:Teaching Points|TP)' : 'Scribe';
          const lineRegex = new RegExp(`(^|\\r?\\n)([^\\S\\r\\n]*${rolePat}:[^\\S\\r\\n]*)([^\\r\\n|]*)(.*?)($|\\r?\\n)`, 'i');
          if (lineRegex.test(el.value)) {
            el.value = el.value.replace(lineRegex, (match, p1, p2, p3, p4, p5) => `${p1}${p2}${name}${p4}${p5}`);
          } else {
            el.value = (el.value ? el.value + '\n' : '') + `${role}: ${name}`;
          }
          el.dispatchEvent(new Event('input', { bubbles: true }));
          if (staffMessage) staffMessage.textContent = `${role} filled. Save changes to keep the assignment.`;
          el.focus();
          return;
        }
      }
      const el = [...dialogContent.querySelectorAll('[data-field]')].find(e => e.dataset.field === role);
      if (!el) return;
      const current = el.value.trim();
      if (current && !/^(tbd|none|-|na|n\/a|—)$/i.test(current)) {
        if (current.split(/[,;\n&+/]/).some(s => s.trim().toLowerCase() === name.toLowerCase())) {
          if (staffMessage) staffMessage.textContent = 'That name is already assigned.';
          return;
        }
        if (/\b(tbd|none|-)\b/i.test(current)) {
          el.value = current.replace(/\b(tbd|none|-)\b/i, name);
        } else {
          el.value = current + ', ' + name;
        }
      } else {
        el.value = name;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      if (staffMessage) staffMessage.textContent = `${role} filled. Save changes to keep the assignment.`;
      el.focus();
    };
  }

  function mrGaps(r) {
    if (!r || !r.fields) return [];
    const f = r.fields;
    const fac = (f.Facilitator || '').trim();
    if (/canceled|cancelled/i.test(fac) || fac.toLowerCase() === 'none' || (f.Type || '').trim().toLowerCase() === 'none') return [];
    const gaps = [];
    if (!fac || /^(tbd|none|-|na|n\/a|—)$/i.test(fac) || /\b(tbd)\b/i.test(fac)) gaps.push('Facilitator');
    const signups = f['Scribe / teaching points sign-ups'] || '';
    const cleanSignups = signups.split(/\r?\n[-_]{3,}/)[0];
    const pres = (f.Presenter || '').trim() || (cleanSignups.match(/(?:^|[\r\n|])[^\S\r\n]*(?:Case Presenter|Presenter):[^\S\r\n]*([^\r\n|]+)/i)?.[1] || '').trim();
    if (!pres || /^(tbd|none|-|na|n\/a|—)$/i.test(pres)) gaps.push('Presenter');
    const scribe = (cleanSignups.match(/(?:^|[\r\n|])[^\S\r\n]*Scribe:[^\S\r\n]*([^\r\n|]+)/i)?.[1] || '').trim();
    if (!scribe || /^(tbd|none|-|na|n\/a|—)$/i.test(scribe)) gaps.push('Scribe');
    const tp = (cleanSignups.match(/(?:^|[\r\n|])[^\S\r\n]*(?:Teaching Points|TP):[^\S\r\n]*([^\r\n|]+)/i)?.[1] || '').trim();
    if (!tp || /^(tbd|none|-|na|n\/a|—)$/i.test(tp)) gaps.push('Teaching Points');
    return gaps;
  }

  function getStaffingUrgency(sessionDate, referenceDate) {
    const ref = referenceDate || (typeof today === 'function' ? today() : (typeof root.today === 'function' ? root.today() : '2026-09-08'));
    const days = staffingDays(sessionDate, ref);
    return days === null || days < 0 || days > 7 ? 'open' : days < 2 ? 'urgent' : 'upcoming';
  }

  function staffingDays(sessionDate, referenceDate) {
    const sc = typeof SessionCore !== 'undefined' ? SessionCore : root.SessionCore;
    const ref = referenceDate || (typeof today === 'function' ? today() : (typeof root.today === 'function' ? root.today() : '2026-09-08'));
    if (!sc || !sc.validDate(sessionDate) || !sc.validDate(ref)) return null;
    return Math.round((Date.parse(sessionDate + 'T00:00:00Z') - Date.parse(ref + 'T00:00:00Z')) / 86400000);
  }

  function staffingHealth(rr, referenceDate) {
    const sc = typeof SessionCore !== 'undefined' ? SessionCore : root.SessionCore;
    const ref = referenceDate || (typeof today === 'function' ? today() : (typeof root.today === 'function' ? root.today() : '2026-09-08'));
    const getDateVal = typeof dateValue === 'function' ? dateValue : (typeof root.dateValue === 'function' ? root.dateValue : (r => r?.fields?.Date || ''));
    let count = 0, tomorrow = 0, sessions = 0;
    for (const r of rr) {
      const d = staffingDays(sc ? sc.parseDate(getDateVal(r)) : getDateVal(r), ref);
      if (d === null || d < 0 || d > 7) continue;
      sessions++;
      const n = mrGaps(r).length;
      count += n;
      if (d === 1) tomorrow += n;
    }
    return { count, tomorrow, sessions };
  }

  function staffingHealthBadge(rr) {
    const h = staffingHealth(rr);
    return `<span class="tag ${h.tomorrow ? 'slot-urgent' : h.count ? 'slot-upcoming' : h.sessions ? 'staffing-ready' : 'slot-open'}">${h.tomorrow ? `${h.tomorrow} open slot${h.tomorrow === 1 ? '' : 's'} tomorrow` : h.count ? `${h.count} open slot${h.count === 1 ? '' : 's'} this week` : h.sessions ? '✓ Next 7 days fully staffed' : 'No sessions in the next 7 days'}</span>`;
  }

  function staffingRoleValue(r, role) {
    if (!r || !r.fields) return '';
    if (role === 'Facilitator') return r.fields.Facilitator || '';
    if (role === 'Presenter' && r.fields.Presenter) return r.fields.Presenter;
    const labels = role === 'Presenter' ? '(?:Case Presenter|Presenter)' : role === 'Teaching Points' ? '(?:Teaching Points|TP)' : 'Scribe';
    const m = String(r.fields['Scribe / teaching points sign-ups'] || '').match(new RegExp('(?:^|[\\n|])\\s*' + labels + ':[^\\S\\r\\n]*([^\\r\\n|]*)', 'i'));
    return m ? m[1].trim() : '';
  }

  function tokenizeStaff(raw) {
    if (!raw || typeof raw !== 'string') return [];
    const text = raw.trim();
    if (!text || /^(?:tbd|none|n\/a|-|—)$/i.test(text)) return [];
    let depth = 0, current = '', parts = [];
    const flush = () => {
      const s = current.trim();
      if (s && !/^(?:tbd|none|n\/a|-|—)$/i.test(s)) parts.push(s);
      current = '';
    };
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '(') depth++;
      if (c === ')') depth = Math.max(0, depth - 1);
      const natural = depth === 0 && text.slice(i).match(/^(?:\s+(?:and|with)\s+|\s+w\/)/i);
      if (natural) { flush(); i += natural[0].length - 1; }
      else if (!depth && /[&+/,|\n]/.test(c)) { flush(); }
      else { current += c; }
    }
    flush();
    return parts;
  }

  function getRoleMilestoneIndex() {
    const getRecs = typeof records === 'function' ? records : (typeof root.records === 'function' ? root.records : () => []);
    const allMr = getRecs('Morning Report') || [];
    const sc = typeof SessionCore !== 'undefined' ? SessionCore : root.SessionCore;
    if (!_cachedMilestoneIndex || _cachedMilestoneRecordCount !== allMr.length) {
      if (sc && typeof sc.buildRoleMilestoneIndex === 'function') {
        _cachedMilestoneIndex = sc.buildRoleMilestoneIndex(allMr);
        _cachedMilestoneRecordCount = allMr.length;
      }
    }
    return _cachedMilestoneIndex;
  }

  function renderStaffTokens(namesArray, role, sessionId, options = {}) {
    const tokens = Array.isArray(namesArray) ? namesArray : tokenizeStaff(namesArray);
    if (!tokens.length) return '';
    const isAdm = typeof isAdmin === 'function' ? isAdmin() : (typeof root.isAdmin === 'function' ? root.isAdmin() : true);
    const userIsAdmin = isAdm && !options.hideAdd;
    const isTP = role === 'Teaching Points';
    const mIndex = getRoleMilestoneIndex();
    const tokensHtml = tokens.map(name => {
      const noteMatch = name.match(/^([^(]+)(\([^)]+\))$/);
      const main = noteMatch ? noteMatch[1].trim() : name;
      const note = noteMatch ? ` <span class="staff-token-note">${esc(noteMatch[2])}</span>` : '';

      let milestoneBadgeHtml = '';
      if (mIndex && sessionId) {
        const info = mIndex.getMilestone(sessionId, role, main);
        if (info && info.ordinal) {
          const cls = info.ordinal === '1st time' ? 'milestone-1st' : (info.ordinal === '2nd time' ? 'milestone-2nd' : 'milestone-3rd');
          milestoneBadgeHtml = `<span class="milestone-badge ${cls}">${esc(info.ordinal)}</span>`;
        }
      }

      const tokenBtn = (!userIsAdmin) ?
        `<span class="staff-token${isTP ? ' tp-token' : ''} is-readonly-token" data-token-name="${esc(name)}" data-role="${esc(role)}" data-session-id="${esc(sessionId)}" title="${esc(main)}"><span class="staff-token-name">${esc(main)}</span>${note}</span>` :
        `<button type="button" class="staff-token${isTP ? ' tp-token' : ''}" data-token-name="${esc(name)}" data-role="${esc(role)}" data-session-id="${esc(sessionId)}" title="Click to swap or remove ${esc(main)}"><span class="staff-token-name">${esc(main)}</span>${note}</button>`;

      return `<div class="staff-token-wrapper">${tokenBtn}${milestoneBadgeHtml}</div>`;
    }).join('');
    const addBtn = userIsAdmin ? `<button type="button" class="staff-add-btn" data-add-role="${esc(role)}" data-session-id="${esc(sessionId)}" title="Add another ${esc(role)}">＋ Add</button>` : '';
    return `<div class="staff-tokens-container" data-session-id="${esc(sessionId)}" data-role="${esc(role)}">${tokensHtml}${addBtn}</div>`;
  }

  function updateRoleAssignment(sessionId, role, updateFn) {
    const doMutate = typeof mutate === 'function' ? mutate : root.mutate;
    const doRender = typeof render === 'function' ? render : root.render;
    const doToast = typeof toast === 'function' ? toast : root.toast;
    const getRecs = typeof records === 'function' ? records : root.records;
    const doLog = typeof log === 'function' ? log : root.log;

    try {
      const latest = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (latest && latest.edits && typeof workspace !== 'undefined') workspace = latest;
    } catch {}

    const mrRecs = getRecs ? getRecs('Morning Report') : [];
    const r = (mrRecs || []).find(x => x.id === sessionId);
    if (!r) return { success: false, reason: 'not-found' };

    const ws = typeof workspace !== 'undefined' ? workspace : (root.workspace || {});
    const mergedFields = { ...r.fields, ...(ws.edits?.[sessionId] || {}) };
    const mergedR = { ...r, fields: mergedFields };
    const currentVal = staffingRoleValue(mergedR, role);
    const currentTokens = tokenizeStaff(currentVal);
    const nextTokens = updateFn([...currentTokens]);
    if (!Array.isArray(nextTokens)) return { success: false, reason: 'invalid-update' };
    const usesSlash = /\s+\/\s+/.test(currentVal) && !/\s+&\s+/.test(currentVal);
    const newRoleString = nextTokens.join(usesSlash ? ' / ' : ' & ');
    let changedField = role;
    let newValue = newRoleString;

    if (role === 'Scribe' || role === 'Teaching Points') {
      changedField = 'Scribe / teaching points sign-ups';
      const currentSignups = r.fields[changedField] || '';
      const rolePat = role === 'Teaching Points' ? '(?:Teaching Points|TP)' : 'Scribe';
      const segmentRegex = new RegExp(`(^|[\\r\\n|])([^\\S\\r\\n]*${rolePat}:[^\\S\\r\\n]*)([^|\\r\\n]*)(?=[|\\r\\n]|$)`, 'i');
      if (segmentRegex.test(currentSignups)) {
        newValue = currentSignups.replace(segmentRegex, (m, p1, p2) => {
          const labelWithSpace = p2.endsWith(' ') ? p2 : p2 + ' ';
          return `${p1}${labelWithSpace}${newRoleString}`;
        });
      } else {
        newValue = currentSignups ? `${currentSignups}\n${role}: ${newRoleString}` : `${role}: ${newRoleString}`;
      }
    } else if (role === 'Presenter' && !r.fields.Presenter && r.fields['Scribe / teaching points sign-ups']) {
      const currentSignups = r.fields['Scribe / teaching points sign-ups'] || '';
      const presRegex = /(^|[\r\n|])([^\S\r\n]*(?:Case Presenter|Presenter):[^\S\r\n]*)([^|\r\n]*)(?=[|\r\n]|$)/i;
      if (presRegex.test(currentSignups)) {
        changedField = 'Scribe / teaching points sign-ups';
        newValue = currentSignups.replace(presRegex, (m, p1, p2) => {
          const labelWithSpace = p2.endsWith(' ') ? p2 : p2 + ' ';
          return `${p1}${labelWithSpace}${newRoleString}`;
        });
      } else {
        changedField = 'Presenter';
        newValue = newRoleString;
      }
    } else {
      changedField = role;
      newValue = newRoleString;
    }

    const success = doMutate ? doMutate(w => {
      w.edits[sessionId] = { ...(w.edits[sessionId] || {}), [changedField]: newValue };
      if (doLog) doLog(w, `Updated ${role}`, r, 'Morning Report');
    }, sessionId) : false;

    if (success) {
      if (doRender) doRender();
      const idMod = typeof Identity !== 'undefined' ? Identity : root.Identity;
      const user = idMod ? idMod.getCurrentUser() : null;
      if (user && user.isAuthenticated && !user.isMock && typeof fetch === 'function') {
        const targetStableId = r.session?.parentStableId || r.parentId || r.stableId || r.id;
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('cps_token') : null;
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const previousSnapshotVal = (r.fields && r.fields[changedField]) || '';
        const childIndex = r.session?.index || null;

        fetch('/api/mutate', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            dataset: 'Morning Report',
            stableId: targetStableId,
            childSessionIndex: childIndex,
            field: changedField,
            value: newValue,
            expectedPreviousValue: previousSnapshotVal,
            operationId: `op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
          })
        }).then(async (res) => {
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            if (doMutate) {
              doMutate(w => {
                if (w.edits && w.edits[sessionId]) {
                  delete w.edits[sessionId][changedField];
                  if (Object.keys(w.edits[sessionId]).length === 0) delete w.edits[sessionId];
                }
              }, sessionId);
            }
            if (doRender) doRender();
            if (doToast) {
              if (res.status === 409) {
                doToast(`Conflict: Slot is already claimed by ${err.currentValue || 'another member'}.`);
              } else {
                doToast(`Failed to sync to Google Sheets: ${err.message || 'Server error'}`);
              }
            }
          } else {
            if (doToast) doToast(`✓ Saved: ${role} updated.`);
          }
        }).catch(err => {
          console.warn('Staff token mutation network error:', err);
          if (doToast) doToast('Network error: Change kept locally on this device.');
        });
      }
      return { success: true, newTokens: nextTokens, value: newValue };
    }
    return { success: false };
  }

  function swapStaffToken(sessionId, role, oldName, newName) {
    if (!newName || !newName.trim()) return { success: false, reason: 'empty-name' };
    return updateRoleAssignment(sessionId, role, tokens => {
      const idx = tokens.findIndex(t => t.toLowerCase() === oldName.trim().toLowerCase());
      if (idx !== -1) tokens[idx] = newName.trim();
      else tokens.push(newName.trim());
      return tokens;
    });
  }

  function removeStaffToken(sessionId, role, nameToRemove) {
    return updateRoleAssignment(sessionId, role, tokens => {
      return tokens.filter(t => t.toLowerCase() !== nameToRemove.trim().toLowerCase());
    });
  }

  function addStaffToken(sessionId, role, newName) {
    if (!newName || !newName.trim()) return { success: false, reason: 'empty-name' };
    return updateRoleAssignment(sessionId, role, tokens => {
      if (!tokens.some(t => t.toLowerCase() === newName.trim().toLowerCase())) {
        tokens.push(newName.trim());
      }
      return tokens;
    });
  }

  function updateSessionNote(sessionId, newNote) {
    const doMutate = typeof mutate === 'function' ? mutate : root.mutate;
    const doRender = typeof render === 'function' ? render : root.render;
    const doToast = typeof toast === 'function' ? toast : root.toast;
    const getRecs = typeof records === 'function' ? records : root.records;
    const doLog = typeof log === 'function' ? log : root.log;

    try {
      const latest = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (latest && latest.edits && typeof workspace !== 'undefined') workspace = latest;
    } catch {}

    const r = (getRecs ? getRecs('Morning Report') : []).find(x => x.id === sessionId);
    if (!r) return { success: false, reason: 'not-found' };
    const val = String(newNote ?? '').trim();
    const prevNote = (r.fields && r.fields.Notes) || '';
    const success = doMutate ? doMutate(w => {
      w.edits[sessionId] = { ...(w.edits[sessionId] || {}), Notes: val };
      if (doLog) doLog(w, 'Updated Session Note', r, 'Morning Report');
    }, sessionId) : false;

    if (success) {
      if (doRender) doRender();
      const idMod = typeof Identity !== 'undefined' ? Identity : root.Identity;
      const user = idMod ? idMod.getCurrentUser() : null;
      if (user && user.isAuthenticated && !user.isMock && typeof fetch === 'function') {
        const targetStableId = r.session?.parentStableId || r.parentId || r.stableId || r.id;
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('cps_token') : null;
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        fetch('/api/mutate', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            dataset: 'Morning Report',
            stableId: targetStableId,
            childSessionIndex: r.session?.index || null,
            field: 'Notes',
            value: val,
            expectedPreviousValue: prevNote,
            operationId: `op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
          })
        })
        .then(async res => {
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            if (doMutate) {
              doMutate(w => {
                if (w.edits && w.edits[sessionId]) {
                  delete w.edits[sessionId].Notes;
                  if (Object.keys(w.edits[sessionId]).length === 0) delete w.edits[sessionId];
                }
              }, sessionId);
            }
            if (doRender) doRender();
            if (doToast) {
              if (res.status === 409) {
                doToast(`Conflict: Note was modified by another member.`);
              } else {
                doToast(`Failed to sync note: ${errData.message || 'Server error'}`);
              }
            }
          } else {
            if (doToast) doToast('✓ Saved session note.');
          }
        })
        .catch(err => {
          console.warn('Note mutation error:', err);
          if (doToast) doToast('Network error: Note kept locally on this device.');
        });
      }
      return { success: true, value: val };
    }
    return { success: false };
  }

  function staffingSlot(r, role, options = {}) {
    const sc = typeof SessionCore !== 'undefined' ? SessionCore : root.SessionCore;
    const getDateVal = typeof dateValue === 'function' ? dateValue : (typeof root.dateValue === 'function' ? root.dateValue : (rec => rec?.fields?.Date || ''));
    const getRecDate = typeof recordDate === 'function' ? recordDate : (typeof root.recordDate === 'function' ? root.recordDate : getDateVal);
    const isTP = role === 'Teaching Points';

    if (!mrGaps(r).includes(role)) {
      const val = staffingRoleValue(r, role);
      const tokens = tokenizeStaff(val);
      if (tokens.length) return `<div class="matrix-slot-assigned staffing-people${isTP ? ' tp-assigned-slot' : ''}">${renderStaffTokens(tokens, role, r.id, options)}</div>`;
      return `<span class="matrix-slot-assigned staffing-people" title="${esc(val)}">${esc(val || 'Not scheduled')}</span>`;
    }
    const timing = sc && sc.parseSessionTime ? sc.parseSessionTime(r) : { status: 'unresolved' };
    const isUncertain = (r.flags && r.flags.some(f => /moved|rescheduled|tentative|uncertain|verify|tbd/i.test(f))) || (r.session?.unresolved && r.session.unresolved.length > 0) || /moved|tentative|\?|tbd/i.test(r.fields?.Date || '') || timing.status !== 'resolved';
    const baseTier = getStaffingUrgency(sc && sc.parseDate ? sc.parseDate(getDateVal(r)) : getDateVal(r));
    const tier = isUncertain ? 'open' : baseTier;
    const dateDisplay = getRecDate(r) || 'session';
    const ariaLabel = `Volunteer as ${role} for ${dateDisplay}`;
    return `<div class="mr-slot-vacant-wrap"><span class="mr-slot-vacant-status">Open</span><button type="button" class="status-chip matrix-slot-btn matrix-slot-gap gap-action-btn mr-volunteer-btn slot-${tier}${isTP ? ' slot-tp' : ''}" data-status="${tier}" data-open="${esc(r.id)}" data-role="${esc(role)}" aria-label="${esc(ariaLabel)}" title="${esc(ariaLabel)}">Volunteer</button></div>`;
  }

  function staffingGrid(r) {
    return `<div class="staffing-grid">${['Facilitator','Presenter','Scribe','Teaching Points'].map(role => `<div class="staffing-role"><small>${role}</small>${staffingSlot(r, role)}</div>`).join('')}</div>`;
  }

  function weekKey(isoDate) {
    const d = new Date(isoDate + 'T12:00:00Z'), day = d.getUTCDay(), diffToMon = (day === 0 ? -6 : 1 - day);
    const mon = new Date(d);
    mon.setUTCDate(d.getUTCDate() + diffToMon);
    const sun = new Date(mon);
    sun.setUTCDate(mon.getUTCDate() + 6);
    const toIso = dt => dt.toISOString().slice(0, 10);
    return { start: toIso(mon), end: toIso(sun) };
  }

  function weekLabel(start, end) {
    const s = new Date(start + 'T12:00:00Z'), e = new Date(end + 'T12:00:00Z');
    return `Week of ${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })} – ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`;
  }

  function scheduleGroups(rr) {
    const getRecDate = typeof recordDate === 'function' ? recordDate : (typeof root.recordDate === 'function' ? root.recordDate : (r => r?.fields?.Date || ''));
    const weeks = new Map(), unresolved = [];
    for (const r of [...rr].sort((a, b) => getRecDate(a).localeCompare(getRecDate(b)))) {
      const date = getRecDate(r);
      if (!date) { unresolved.push(r); continue; }
      const k = weekKey(date);
      if (!weeks.has(k.start)) weeks.set(k.start, { ...k, records: [] });
      weeks.get(k.start).records.push(r);
    }
    return { weeks: [...weeks.values()], unresolved };
  }

  function scheduleSummary(rr) {
    const getRecs = typeof records === 'function' ? records : (typeof root.records === 'function' ? root.records : () => []);
    const mrRecords = getRecs('Morning Report') || [];
    return `<div class="agenda-summary panel"><strong>${rr.length} session${rr.length === 1 ? '' : 's'} in this view</strong>${staffingHealthBadge(mrRecords)}</div>`;
  }

  function renderMatrixItem(item, index) {
    const sc = typeof SessionCore !== 'undefined' ? SessionCore : root.SessionCore;
    const getRecDate = typeof recordDate === 'function' ? recordDate : (typeof root.recordDate === 'function' ? root.recordDate : (r => r?.fields?.Date || ''));
    const getSessionNotice = typeof sessionNotice === 'function' ? sessionNotice : (typeof root.sessionNotice === 'function' ? root.sessionNotice : () => '');
    const getCalBtn = typeof calendarButton === 'function' ? calendarButton : (typeof root.calendarButton === 'function' ? root.calendarButton : () => '');
    const ws = typeof workspace !== 'undefined' ? workspace : (root.workspace || { favorites: [] });

    if (item.type === 'week') {
      const gapsInWeek = item.week.records.reduce((acc, r) => acc + mrGaps(r).length, 0);
      const gapSummary = gapsInWeek > 0 ? `<span class="matrix-week-gaps-badge">⚠ ${gapsInWeek} vacanc${gapsInWeek === 1 ? 'y' : 'ies'}</span>` : `<span class="matrix-week-staffed-badge">✓ Fully staffed</span>`;
      return `<tr class="matrix-week-row" data-index="${index}"><td colspan="7"><div class="matrix-week-header-content"><span class="matrix-week-title">📅 ${esc(weekLabel(item.week.start, item.week.end))}</span><span class="matrix-week-meta"><span class="matrix-week-count">${item.week.records.length} session${item.week.records.length === 1 ? '' : 's'}</span>${gapSummary}</span></div></td></tr>`;
    }
    const r = item.record;
    const dStr = getRecDate(r);
    let dayBadge = 'TBD';
    let dateFormatted = dStr || 'Date TBD';
    if (dStr) {
      const dObj = new Date(dStr + 'T12:00:00Z');
      if (!Number.isNaN(dObj.getTime())) {
        dayBadge = dObj.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }).toUpperCase();
        dateFormatted = dObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
      }
    }
    const titleMeta = sc && sc.getSessionDisplayTitle ? sc.getSessionDisplayTitle(r) : { mainTitle: r.fields?.['Topic / Case'] || r.fields?.Type || 'Morning Report', sessionTypeTag: r.fields?.Type || 'Morning Report' };
    const rawSessionType = titleMeta.sessionTypeTag || r.fields?.Type || 'Morning Report';
    const sessionType = sc && sc.normalizeSessionTypeName ? sc.normalizeSessionTypeName(rawSessionType) : rawSessionType;
    const isSpecial = /neuro|special|syndrome|solvers/i.test(sessionType);
    const timeFormatted = sc && sc.formatSessionTime ? sc.formatSessionTime(r) : '';
    const isFav = ws.favorites && ws.favorites.includes(r.id);

    return `<tr class="matrix-row${mrGaps(r).length ? ' matrix-row-has-gap' : ''}" data-index="${index}"><td class="matrix-col-date"><div class="matrix-date-cell"><span class="matrix-day-badge">${esc(dayBadge)}</span><div><div class="matrix-date-text">${esc(dateFormatted)}</div><span class="matrix-time-sub">${esc(timeFormatted)}</span></div></div></td><td class="matrix-col-type"><div class="matrix-type-wrapper"><span class="matrix-type-badge${isSpecial ? ' matrix-type-special' : ''}">${esc(sessionType)}</span></div></td>${['Facilitator','Presenter','Scribe','Teaching Points'].map(role => `<td class="matrix-col-role matrix-col-${role.toLowerCase().replace(/[^a-z]/g,'')}">${staffingSlot(r, role, {hideAdd:true})}</td>`).join('')}<td class="matrix-col-actions">${getSessionNotice(r)}<div class="matrix-actions"><button type="button" class="button secondary small matrix-action-primary" data-open="${esc(r.id)}" data-area="Morning Report" title="View session details and roster">Details</button><button class="icon-button star ${isFav ? 'is-starred' : ''}" data-star="${esc(r.id)}" aria-label="${isFav ? 'Unpin' : 'Pin'} record">${isFav ? '★' : '☆'}</button><button type="button" class="icon-button record-menu-btn" data-record-menu="${esc(r.id)}" data-area="Morning Report" title="Session actions" aria-label="Open session actions" aria-haspopup="dialog">⋯</button><span class="visually-hidden-accessible" style="position:absolute;left:0;top:0;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);">${getCalBtn(r, 'Morning Report', { compact: true })}</span></div></td></tr>`;
  }

  function matrixView(rr) {
    const wl = typeof WindowedList !== 'undefined' ? WindowedList : root.WindowedList;
    const { weeks, unresolved } = scheduleGroups(rr);
    const flatItems = [];
    for (const w of weeks) {
      flatItems.push({ type: 'week', week: w });
      for (const r of w.records) {
        flatItems.push({ type: 'record', record: r });
      }
    }
    const threshold = 50;
    const isWindowed = typeof wl !== 'undefined' && flatItems.length > threshold;
    let rows = '';
    if (!isWindowed) {
      rows = flatItems.map((it, idx) => renderMatrixItem(it, idx)).join('');
    } else {
      const initialWin = wl.computeWindow({ totalItems: flatItems.length, itemHeight: 48, containerHeight: 600, scrollTop: 0, overscan: 8 });
      const topSpacer = wl.defaultSpacer(initialWin.topSpacerHeight, 'top', 7);
      const bottomSpacer = wl.defaultSpacer(initialWin.bottomSpacerHeight, 'bottom', 7);
      const slice = flatItems.slice(initialWin.startIndex, initialWin.endIndex).map((it, i) => renderMatrixItem(it, initialWin.startIndex + i)).join('');
      rows = topSpacer + slice + bottomSpacer;
    }
    const windowToggleHtml = flatItems.length > threshold ? `<div class="window-toggle-bar" style="display:none;" aria-hidden="true"><button type="button" id="matrix-window-toggle-btn">Load all records</button></div>` : '';
    const unresHtml = unresolved.length ? `<section class="panel unresolved-panel"><h2>Unresolved dates</h2>${unresolved.map(r => agendaCard(r, true)).join('')}</section>` : '';
    return `<section class="matrix-view">${scheduleSummary(rr)}${windowToggleHtml}<div class="matrix-card"><div class="matrix-container"><table class="matrix-table"><thead><tr>${['Date / Day','Session / Type','Facilitator','Presenter','Scribe','Teaching Points','Actions'].map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${rows || '<tr><td colspan="7">No dated sessions match these filters.</td></tr>'}</tbody></table></div></div>${unresHtml}</section>`;
  }

  function getNextSevenVMRs(options = {}) {
    const sc = typeof SessionCore !== 'undefined' ? SessionCore : root.SessionCore;
    const getRecDate = typeof recordDate === 'function' ? recordDate : (typeof root.recordDate === 'function' ? root.recordDate : (r => r?.fields?.Date || ''));
    const isCancelled = typeof isSessionCancelled === 'function' ? isSessionCancelled : (typeof root.isSessionCancelled === 'function' ? root.isSessionCancelled : (() => false));
    const refDate = typeof options === 'string' ? options : (options.referenceDate || (typeof today === 'function' ? today() : (typeof root.today === 'function' ? root.today() : '2026-09-15')));
    const refTimestamp = options.referenceTimestamp || (typeof options === 'object' && options.now ? new Date(options.now).toISOString() : `${refDate}T00:00:00.000Z`);
    const allMr = options.records || (typeof records === 'function' ? records('Morning Report') : (typeof root.records === 'function' ? root.records('Morning Report') : (root.db?.['Morning Report']?.records || [])));
    const allSplit = allMr.flatMap(r => sc && sc.splitMorningReport ? sc.splitMorningReport(r) : [r]);

    const upcoming = allSplit.filter(r => {
      if (isCancelled(r)) return false;
      const timeInfo = sc && sc.parseSessionTime ? sc.parseSessionTime(r) : null;
      if (timeInfo && timeInfo.status === 'resolved' && timeInfo.startUtc) {
        const sessionCutoff = timeInfo.endUtc || timeInfo.startUtc;
        return sessionCutoff >= refTimestamp;
      }
      const d = getRecDate(r);
      return d && d >= refDate;
    }).sort((a, b) => {
      const timeA = sc && sc.parseSessionTime ? sc.parseSessionTime(a) : null;
      const timeB = sc && sc.parseSessionTime ? sc.parseSessionTime(b) : null;
      const stampA = (timeA?.status === 'resolved' && timeA.startUtc) ? timeA.startUtc : null;
      const stampB = (timeB?.status === 'resolved' && timeB.startUtc) ? timeB.startUtc : null;

      if (stampA && stampB) {
        const stampCmp = stampA.localeCompare(stampB);
        if (stampCmp !== 0) return stampCmp;
      }
      const dateA = getRecDate(a) || '';
      const dateB = getRecDate(b) || '';
      const dateCmp = dateA.localeCompare(dateB);
      if (dateCmp !== 0) return dateCmp;

      if (stampA && !stampB) return -1;
      if (!stampA && stampB) return 1;
      return (a.id || '').localeCompare(b.id || '');
    });
    return upcoming.slice(0, 7);
  }

  function mrFilledStats(sessionList) {
    let total = 0, filled = 0;
    for (const r of sessionList) {
      for (const role of ['Facilitator','Presenter','Scribe','Teaching Points']) {
        total++;
        if (!mrGaps(r).includes(role)) filled++;
      }
    }
    const pct = total ? Math.round(filled / total * 100) : 0;
    return { filled, total, pct };
  }

  function editorialCardRail(r) {
    const sc = typeof SessionCore !== 'undefined' ? SessionCore : root.SessionCore;
    const getDateVal = typeof dateValue === 'function' ? dateValue : (typeof root.dateValue === 'function' ? root.dateValue : (rec => rec?.fields?.Date || ''));
    const gaps = mrGaps(r);
    const fac = (r.fields?.Facilitator || '').trim();
    if (/canceled|cancelled/i.test(fac) || /canceled|cancelled/i.test(r.fields?.Type || '') || /canceled|cancelled/i.test(r.fields?.Notes || '')) return 'rail-canceled';
    const d = sc && sc.parseDate ? sc.parseDate(getDateVal(r)) : getDateVal(r);
    const urgency = getStaffingUrgency(d);
    if (gaps.length > 0) {
      if (urgency === 'urgent') return 'rail-urgent';
      return 'rail-warning';
    }
    return '';
  }

  function editorialCardStatus(r) {
    return '';
  }

  function isScheduleEditor() {
    const idMod = typeof Identity !== 'undefined' ? Identity : root.Identity;
    const user = idMod ? idMod.getCurrentUser() : null;
    return Boolean(user && user.isAuthenticated);
  }

  function editorialCard(r) {
    const sc = typeof SessionCore !== 'undefined' ? SessionCore : root.SessionCore;
    const getRecDate = typeof recordDate === 'function' ? recordDate : (typeof root.recordDate === 'function' ? root.recordDate : (rec => rec?.fields?.Date || ''));
    const dStr = getRecDate(r);
    let dayNum = '?', wday = 'TBD', mon = '';
    if (dStr) {
      const dObj = new Date(dStr + 'T12:00:00Z');
      if (!Number.isNaN(dObj.getTime())) {
        dayNum = dObj.getUTCDate();
        wday = dObj.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }).toUpperCase();
        mon = dObj.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }).toUpperCase();
      }
    }
    const userZone = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : null;
    const tzBreakdown = sc && sc.formatSessionTimeBreakdown ? sc.formatSessionTimeBreakdown(r, userZone) : { status: 'unresolved', primaryText: 'Time TBD', hasDisclosure: false };
    const fac = (r.fields?.Facilitator || '').trim();
    const isCanceled = /canceled|cancelled/i.test(fac) || /canceled|cancelled/i.test(r.fields?.Type || '') || /canceled|cancelled/i.test(r.fields?.Notes || '');
    const railClass = editorialCardRail(r);
    const gaps = mrGaps(r);
    const sessionType = r.fields?.Type || 'Morning Report';
    const statusHtml = editorialCardStatus(r);

    const rawTopic = (r.fields?.['Topic / Case'] || '').trim();
    const rawDetails = (r.fields?.['Details'] || '').trim();
    const rawType = (r.fields?.['Type'] || '').trim();
    const rawNotes = (r.fields?.['Notes'] || '').trim();

    let titleText = 'Morning Report Session';
    if (rawTopic && !/^(tbd|none|-|—|\?)$/i.test(rawTopic)) titleText = rawTopic;
    else if (rawDetails && !/^(tbd|none|-|—|\?)$/i.test(rawDetails)) titleText = rawDetails;
    else if (rawType && !/^(tbd|none|-|—|\?)$/i.test(rawType)) titleText = rawType;

    const staffingCells = ['Facilitator','Presenter','Scribe','Teaching Points'].map(role => {
      const isVacant = gaps.includes(role);
      const roleLabel = role === 'Teaching Points' ? 'TEACHING POINTS' : role.toUpperCase();
      return `<div class="mr-role-cell${isVacant ? ' role-cell-vacant is-vacant' : ''}">
        <span class="mr-role-label${isVacant ? ' role-vacant' : ''}">${roleLabel}</span>
        <div class="mr-role-value">${staffingSlot(r, role, { hideAdd: true })}</div>
      </div>`;
    }).join('');

    const bypassMessage = /grand rounds/i.test(fac + rawNotes + sessionType) ? 'Session team bypassed for Grand Rounds' :
      (/recess/i.test(fac + rawNotes + sessionType) ? 'Session team bypassed for Recess' : 'Session cancelled — team not required');

    const staffingZone = (isCanceled || (gaps.length === 4 && /none|recess/i.test(fac))) ? `
      <div class="mr-card-bypassed">
        <span>${esc(bypassMessage)}</span>
      </div>` : `
      <div class="mr-card-staffing">
        ${staffingCells}
      </div>`;

    let timeHtml = '';
    if (isCanceled) {
      timeHtml = '<span class="mr-time-canceled">⊘ No Session</span>';
    } else if (tzBreakdown.hasDisclosure) {
      const disclosureDetails = `
        <span class="mr-tz-details">
          <span class="mr-tz-line"><strong>Your time:</strong> ${esc(tzBreakdown.local ? tzBreakdown.local.text : tzBreakdown.eastern.text + ' (ET default)')}</span>
          <span class="mr-tz-line"><strong>Eastern:</strong> ${esc(tzBreakdown.eastern.text)}</span>
          <span class="mr-tz-line"><strong>Pacific:</strong> ${esc(tzBreakdown.pacific.text)}</span>
        </span>`;
      timeHtml = `
        <div class="mr-tz-popover-anchor" tabindex="0" role="button" aria-haspopup="true" title="Click to view timezone breakdown (Local / ET / PT)">
          <span class="mr-clock-icon" aria-hidden="true">🕒</span>
          ${isScheduleEditor() ? `<button type="button" class="mr-time-edit-trigger" data-edit-time="${esc(r.id)}" title="Click to edit session time">${esc(tzBreakdown.primaryText)}</button>` : `<span class="mr-time-primary">${esc(tzBreakdown.primaryText)}</span>`}
          ${disclosureDetails}
        </div>`;
    } else {
      timeHtml = `<span>🕒</span> <span>${isScheduleEditor() ? `<button type="button" class="mr-time-edit-trigger" data-edit-time="${esc(r.id)}" title="Click to edit session time">${esc(tzBreakdown.primaryText)}</button>` : esc(tzBreakdown.primaryText)}</span>`;
    }

    let noteHtml = '';
    if (rawNotes && !/^(tbd|none|-|—|\?)$/i.test(rawNotes)) {
      noteHtml = `<div class="mr-session-note"><em>${esc(rawNotes)}</em><button type="button" class="mr-note-edit-trigger" data-edit-note="${esc(r.id)}" title="Edit session note">✎</button></div>`;
    } else {
      noteHtml = `<div class="mr-note-hover-wrap"><button type="button" class="mr-note-edit-trigger" data-edit-note="${esc(r.id)}" title="Add session note">+ Note</button></div>`;
    }

    const titleMeta = sc && sc.getSessionDisplayTitle ? sc.getSessionDisplayTitle(r) : { mainTitle: titleText, sessionTypeTag: sessionType, hasDistinctTag: false };
    const typeTagHtml = titleMeta.hasDistinctTag && titleMeta.sessionTypeTag ? `<span class="mr-card-type-tag">${esc(titleMeta.sessionTypeTag)}</span>` : '';

    return `<article class="mr-card" data-record-id="${esc(r.id)}">
      <div class="mr-card-rail ${railClass}"></div>
      <div class="mr-card-date">
        <div class="mr-card-day-row">
          <div class="mr-card-day-num${gaps.length ? ' day-warning' : ''}">${dayNum}</div>
          <div class="mr-card-day-meta">
            <span class="mr-card-weekday">${esc(wday)}</span>
            <span class="mr-card-month">${esc(mon)}</span>
          </div>
        </div>
        <div class="mr-card-time">${timeHtml}</div>
      </div>
      <div class="mr-card-content">
        ${(typeTagHtml || statusHtml) ? `<div class="mr-card-tags">${typeTagHtml}${statusHtml}</div>` : ''}
        <h3 class="mr-card-title"><button type="button" class="mr-card-title-btn" data-open="${esc(r.id)}" data-area="Morning Report" title="View details for ${esc(titleMeta.mainTitle)}">${esc(titleMeta.mainTitle)}</button></h3>
        ${noteHtml}
      </div>
      ${staffingZone}
      <div class="mr-card-actions">
        <button type="button" class="icon-button mr-card-menu-btn" data-record-menu="${esc(r.id)}" data-area="Morning Report" title="Session actions" aria-label="Open session actions" aria-haspopup="dialog">⋯</button>
      </div>
    </article>`;
  }

  function renderCompactMonthCard(r, index, options = {}) {
    const sc = typeof SessionCore !== 'undefined' ? SessionCore : root.SessionCore;
    const getRecDate = typeof recordDate === 'function' ? recordDate : (typeof root.recordDate === 'function' ? root.recordDate : (rec => rec?.fields?.Date || ''));
    const isCancelled = typeof isSessionCancelled === 'function' ? isSessionCancelled : (typeof root.isSessionCancelled === 'function' ? root.isSessionCancelled : (() => false));
    const dStr = getRecDate(r);
    let dayNum = '?', wday = 'TBD', mon = '', dateFormatted = dStr || 'Date TBD';
    if (dStr) {
      const dObj = new Date(dStr + 'T12:00:00Z');
      if (!Number.isNaN(dObj.getTime())) {
        dayNum = dObj.getUTCDate();
        wday = dObj.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }).toUpperCase();
        mon = dObj.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase();
        dateFormatted = dObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
      }
    }

    const userZone = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : null;
    const tzBreakdown = sc && sc.formatSessionTimeBreakdown ? sc.formatSessionTimeBreakdown(r, userZone) : { status: 'unresolved', primaryText: 'Time TBD', hasDisclosure: false };
    const fac = (r.fields?.Facilitator || '').trim();
    const isCanceled = isCancelled(r);
    const gaps = mrGaps(r);
    const railClass = editorialCardRail(r);
    const sessionType = r.fields?.Type || 'Morning Report';

    const rawTopic = (r.fields?.['Topic / Case'] || '').trim();
    const rawDetails = (r.fields?.['Details'] || '').trim();
    const rawType = (r.fields?.['Type'] || '').trim();
    const rawNotes = (r.fields?.['Notes'] || '').trim();

    let titleText = 'Virtual Morning Report';
    if (rawTopic && !/^(tbd|none|-|—|\?)$/i.test(rawTopic)) titleText = rawTopic;
    else if (rawDetails && !/^(tbd|none|-|—|\?)$/i.test(rawDetails)) titleText = rawDetails;
    else if (rawType && !/^(tbd|none|-|—|\?)$/i.test(rawType)) titleText = rawType;

    const titleMeta = sc && sc.getSessionDisplayTitle ? sc.getSessionDisplayTitle(r) : { mainTitle: titleText, sessionTypeTag: sessionType, hasDistinctTag: false };
    const typeTagHtml = titleMeta.hasDistinctTag && titleMeta.sessionTypeTag ? `<span class="mr-card-type-tag">${esc(titleMeta.sessionTypeTag)}</span>` : '';

    let timeHtml = '';
    if (isCanceled) {
      timeHtml = '<span class="mr-time-canceled">⊘ No Session</span>';
    } else if (tzBreakdown.hasDisclosure) {
      timeHtml = `
        <div class="mr-tz-popover-anchor" tabindex="0" role="button" aria-haspopup="true" title="Click to view timezone breakdown (Local / ET / PT)">
          <span class="mr-clock-icon" aria-hidden="true">🕒</span>
          ${isScheduleEditor() ? `<button type="button" class="mr-time-edit-trigger" data-edit-time="${esc(r.id)}" title="Click to edit session time">${esc(tzBreakdown.primaryText)}</button>` : `<span class="mr-time-primary">${esc(tzBreakdown.primaryText)}</span>`}
          <span class="mr-tz-details">
            <span class="mr-tz-line"><strong>Your time:</strong> ${esc(tzBreakdown.local ? tzBreakdown.local.text : tzBreakdown.eastern.text + ' (ET default)')}</span>
            <span class="mr-tz-line"><strong>Eastern:</strong> ${esc(tzBreakdown.eastern.text)}</span>
            <span class="mr-tz-line"><strong>Pacific:</strong> ${esc(tzBreakdown.pacific.text)}</span>
          </span>
        </div>`;
    } else {
      timeHtml = `<span>🕒</span> <span>${isScheduleEditor() ? `<button type="button" class="mr-time-edit-trigger" data-edit-time="${esc(r.id)}" title="Click to edit session time">${esc(tzBreakdown.primaryText)}</button>` : esc(tzBreakdown.primaryText)}</span>`;
    }

    let noteHtml = '';
    if (rawNotes && !/^(tbd|none|-|—|\?)$/i.test(rawNotes)) {
      noteHtml = `<div class="mr-session-note"><em>${esc(rawNotes)}</em><button type="button" class="mr-note-edit-trigger" data-edit-note="${esc(r.id)}" title="Edit session note">✎</button></div>`;
    } else {
      noteHtml = `<div class="mr-note-hover-wrap"><button type="button" class="mr-note-edit-trigger" data-edit-note="${esc(r.id)}" title="Add session note">+ Note</button></div>`;
    }

    const staffingCells = ['Facilitator', 'Presenter', 'Scribe', 'Teaching Points'].map(role => {
      const isVacant = gaps.includes(role);
      const roleLabel = role === 'Teaching Points' ? 'TEACHING POINTS' : role.toUpperCase();
      return `
        <div class="mr-role-cell mr-month-role-cell${isVacant ? ' role-cell-vacant is-vacant' : ''}">
          <span class="mr-role-label${isVacant ? ' role-vacant' : ''}">${roleLabel}</span>
          <div class="mr-role-value mr-month-role-value">${staffingSlot(r, role, { hideAdd: true })}</div>
        </div>`;
    }).join('');

    const bypassMessage = /grand rounds/i.test(fac + rawNotes + sessionType) ? 'Session team bypassed for Grand Rounds' :
      (/recess/i.test(fac + rawNotes + sessionType) ? 'Session team bypassed for Recess' : 'Session cancelled — team not required');

    const staffingZone = (isCanceled || (gaps.length === 4 && /none|recess/i.test(fac))) ? `
      <div class="mr-card-bypassed mr-month-card-bypassed">
        <span>${esc(bypassMessage)}</span>
      </div>` : `
      <div class="mr-card-staffing mr-month-card-staffing">
        ${staffingCells}
      </div>`;

    const isExpanded = options.isExpanded || (mrMonthExpandedId === r.id);

    return `
      <article class="mr-card mr-month-card${isExpanded ? ' is-mobile-expanded' : ''}" data-record-id="${esc(r.id)}">
        <div class="mr-card-rail ${railClass}"></div>
        <div class="mr-month-mobile-toggle" role="button" tabindex="0" data-toggle-month-session="${esc(r.id)}" aria-expanded="${isExpanded ? 'true' : 'false'}" aria-label="Toggle details for ${esc(titleMeta.mainTitle)} on ${esc(dateFormatted)}">
          <div class="mr-month-mobile-summary">
            <div class="mr-month-mobile-date-line">
              <span class="mr-month-mobile-date">${esc(dayNum)} ${esc(wday)} · ${esc(mon)}</span>
              <div class="mr-month-mobile-time">${timeHtml}</div>
            </div>
            <div class="mr-month-mobile-title-line">
              <span class="mr-month-mobile-title">${esc(titleMeta.mainTitle)}</span>
              <span class="mr-month-mobile-chevron" aria-hidden="true">${isExpanded ? '▲' : '›'}</span>
            </div>
          </div>
        </div>

        <div class="mr-card-date mr-month-card-date">
          <div class="mr-card-day-row">
            <div class="mr-card-day-num${gaps.length ? ' day-warning' : ''}">${dayNum}</div>
            <div class="mr-card-day-meta">
              <span class="mr-card-weekday">${esc(wday)}</span>
              <span class="mr-card-month">${esc(mon)}</span>
            </div>
          </div>
          <div class="mr-card-time">${timeHtml}</div>
        </div>

        <div class="mr-card-content mr-month-card-content">
          ${typeTagHtml ? `<div class="mr-card-tags">${typeTagHtml}</div>` : ''}
          <h3 class="mr-card-title"><button type="button" class="mr-card-title-btn" data-open="${esc(r.id)}" data-area="Morning Report" title="View details for ${esc(titleMeta.mainTitle)}">${esc(titleMeta.mainTitle)}</button></h3>
          <div class="mr-card-notes-wrap">
            ${noteHtml}
          </div>
          <div class="mr-month-mobile-footer-actions">
            <button type="button" class="icon-button mr-card-menu-btn" data-record-menu="${esc(r.id)}" data-area="Morning Report" title="Session actions" aria-label="Open session actions" aria-haspopup="dialog">⋯</button>
          </div>
        </div>

        ${staffingZone}

        <div class="mr-card-actions mr-month-card-actions">
          <button type="button" class="icon-button mr-card-menu-btn" data-record-menu="${esc(r.id)}" data-area="Morning Report" title="Session actions" aria-label="Open session actions" aria-haspopup="dialog">⋯</button>
        </div>
      </article>`;
  }

  function agendaCard(r, isUnresolved = false) {
    const sc = typeof SessionCore !== 'undefined' ? SessionCore : root.SessionCore;
    const getRecDate = typeof recordDate === 'function' ? recordDate : (typeof root.recordDate === 'function' ? root.recordDate : (rec => rec?.fields?.Date || ''));
    const getDateVal = typeof dateValue === 'function' ? dateValue : (typeof root.dateValue === 'function' ? root.dateValue : (rec => rec?.fields?.Date || ''));
    const getSessionNotice = typeof sessionNotice === 'function' ? sessionNotice : (typeof root.sessionNotice === 'function' ? root.sessionNotice : () => '');
    const getCalBtn = typeof calendarButton === 'function' ? calendarButton : (typeof root.calendarButton === 'function' ? root.calendarButton : () => '');

    return `<article class="agenda-card"><div class="agenda-card-date"><strong>${esc(getRecDate(r) || getDateVal(r) || 'Date TBD')}</strong></div><div class="agenda-card-body"><div class="agenda-card-top"><span class="tag">${esc(r.fields?.Type || 'Morning Report')}</span><span class="muted agenda-times">${esc(sc && sc.formatSessionTime ? sc.formatSessionTime(r) : '')}</span></div>${staffingGrid(r)}</div><div class="agenda-card-actions">${getSessionNotice(r)}${getCalBtn(r, 'Morning Report', { compact: true })}<button type="button" class="button secondary small agenda-card-details-btn" data-open="${esc(r.id)}" data-area="Morning Report" title="View session details">Details</button><button type="button" class="icon-button record-menu-btn" data-record-menu="${esc(r.id)}" data-area="Morning Report" title="Session actions" aria-label="Open session actions" aria-haspopup="dialog">⋯</button></div></article>`;
  }

  function agendaView(rr, context = {}) {
    const sc = typeof SessionCore !== 'undefined' ? SessionCore : root.SessionCore;
    const getRecDate = typeof recordDate === 'function' ? recordDate : (typeof root.recordDate === 'function' ? root.recordDate : (r => r?.fields?.Date || ''));
    const rangeMode = context.rangeMode || (typeof mrScheduleRangeMode !== 'undefined' ? mrScheduleRangeMode : (root.mrScheduleRangeMode || 'default'));
    const { weeks, unresolved } = scheduleGroups(rr);

    if (rangeMode === 'unresolved') {
      const unres = rr.filter(r => !getRecDate(r));
      return `<section class="agenda-view"><section class="panel unresolved-panel"><h2>Unresolved source dates (${unres.length})</h2><p class="muted">These records have spreadsheet errors, TBD values, or unrecognised date strings in the source workbook. They are excluded from calendar weeks until reviewed.</p><div class="agenda-session-list">${unres.map(r => agendaCard(r, true)).join('')}</div></section></section>`;
    }
    if (!weeks.length && !unresolved.length && rangeMode === 'all') {
      return `<section class="agenda-view"><section class="panel empty-state"><h3>No sessions found</h3><p class="muted">No Morning Report sessions match your active filters.</p></section></section>`;
    }

    const next7 = getNextSevenVMRs();
    const next7Html = next7.length ? `
      <section style="display:flex;flex-direction:column;gap:10px;">
        <div class="mr-section-head">
          <div class="mr-section-title-wrap">
            <h2>Next 7 VMR Sessions</h2>
            <a href="#vmr-month-schedule" class="mr-jump-to-schedule-link" title="Jump to full monthly schedule">Browse Month ↓</a>
          </div>
        </div>
        <div class="mr-stream">${next7.map(r => editorialCard(r)).join('')}</div>
      </section>` : '';

    const curScheduleMonth = context.month || (typeof mrScheduleMonth !== 'undefined' ? mrScheduleMonth : (root.mrScheduleMonth || getDefaultScheduleMonth()));
    const currentMonth = curScheduleMonth || getDefaultScheduleMonth();
    const monthLabel = mrMonthLabel(currentMonth);
    const prevMonth = mrShiftMonth(currentMonth, -1);
    const nextMonth = mrShiftMonth(currentMonth, 1);
    const thisMonth = getDefaultScheduleMonth();
    const isThisMonth = currentMonth === thisMonth;

    const [curYearStr, curMonthNumStr] = currentMonth.split('-');
    const curYear = parseInt(curYearStr, 10);
    const curMonthNum = parseInt(curMonthNumStr, 10);
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const curMonthName = monthNames[curMonthNum - 1] || 'Current Month';
    const baseYears = [2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027];
    if (!baseYears.includes(curYear)) baseYears.push(curYear);
    const yearOptions = Array.from(new Set(baseYears)).sort((a, b) => a - b);

    const getRecs = typeof records === 'function' ? records : (typeof root.records === 'function' ? root.records : () => []);
    const allMrRecords = getRecs('Morning Report') || (root.db?.['Morning Report']?.records || []);
    const allSplitSessions = allMrRecords.flatMap(r => sc && sc.splitMorningReport ? sc.splitMorningReport(r) : [r]);

    let monthSessions = allSplitSessions.filter(r => {
      const d = getRecDate(r);
      return d && d.startsWith(currentMonth);
    });

    const sType = typeof context.sessionType !== 'undefined' ? context.sessionType : (typeof sessionType !== 'undefined' ? sessionType : (root.sessionType || ''));
    const sFac = typeof context.sessionFacilitator !== 'undefined' ? context.sessionFacilitator : (typeof sessionFacilitator !== 'undefined' ? sessionFacilitator : (root.sessionFacilitator || ''));
    const gOnly = typeof context.gapsOnly !== 'undefined' ? context.gapsOnly : (typeof gapsOnly !== 'undefined' ? gapsOnly : (root.gapsOnly || false));
    if (sType || sFac || gOnly) {
      monthSessions = monthSessions.filter(r => sc && sc.matchesFacets ? sc.matchesFacets(r, { type: sType, facilitator: sFac, gapsOnly: gOnly }, mrGaps) : true);
    }
    const mySessions = typeof context.mySessionsOnly !== 'undefined' ? context.mySessionsOnly : (typeof mySessionsOnly !== 'undefined' ? mySessionsOnly : (root.mySessionsOnly || false));
    if (mySessions) {
      const ident = typeof Identity !== 'undefined' ? Identity : root.Identity;
      const user = ident && ident.getCurrentUser ? ident.getCurrentUser() : null;
      const ws = typeof workspace !== 'undefined' ? workspace : (root.workspace || {});
      const profile = user || (ws.reporterName ? { name: ws.reporterName } : null);
      const isAssigned = typeof isUserAssignedToSession === 'function' ? isUserAssignedToSession : (typeof root.isUserAssignedToSession === 'function' ? root.isUserAssignedToSession : (() => false));
      monthSessions = monthSessions.filter(r => Boolean(profile && isAssigned(r, profile)));
    }
    const secQuery = typeof context.sectionQuery !== 'undefined' ? context.sectionQuery : (typeof sectionQuery !== 'undefined' ? sectionQuery : (root.sectionQuery || ''));
    const mainQuery = typeof context.query !== 'undefined' ? context.query : (typeof query !== 'undefined' ? query : (root.query || ''));
    if (secQuery || mainQuery) {
      const q = (secQuery || mainQuery).toLowerCase().trim();
      monthSessions = monthSessions.filter(r => Object.values(r.fields || {}).join(' ').toLowerCase().includes(q));
    }

    monthSessions.sort((a, b) => {
      const dateA = getRecDate(a) || '';
      const dateB = getRecDate(b) || '';
      const dateCmp = dateA.localeCompare(dateB);
      if (dateCmp !== 0) return dateCmp;
      const timeA = sc && sc.parseSessionTime ? sc.parseSessionTime(a) : null;
      const timeB = sc && sc.parseSessionTime ? sc.parseSessionTime(b) : null;
      if (timeA?.startUtc && timeB?.startUtc) {
        return timeA.startUtc.localeCompare(timeB.startUtc);
      }
      return 0;
    });

    const monthSessionsCount = monthSessions.length;
    const desktopMonthCardsHtml = monthSessions.length
      ? monthSessions.map((r, i) => renderCompactMonthCard(r, i, { isExpanded: true })).join('')
      : `<div class="empty-state panel" style="text-align:center;padding:32px 16px;color:var(--text-muted);">No sessions scheduled for ${esc(monthLabel)}.</div>`;

    const calWeeks = getMonthCalendarWeeks(currentMonth);
    const todayIso = typeof today === 'function' ? today() : (typeof root.today === 'function' ? root.today() : '2026-09-08');

    if (mrMonthSelectedWeekIndex === null) {
      if (isThisMonth) {
        const matchIdx = calWeeks.findIndex(w => w.days.includes(todayIso));
        mrMonthSelectedWeekIndex = matchIdx !== -1 ? matchIdx + 1 : 1;
      } else {
        mrMonthSelectedWeekIndex = 1;
      }
    } else if (mrMonthSelectedWeekIndex > calWeeks.length) {
      mrMonthSelectedWeekIndex = 1;
    }

    const activeWeekObj = calWeeks.find(w => w.index === mrMonthSelectedWeekIndex) || calWeeks[0] || { startDate: '', endDate: '', days: [] };
    const weekRangeFormatted = formatMonthWeekLabel(activeWeekObj.startDate, activeWeekObj.endDate);

    const mobileWeekSessions = monthSessions.filter(r => {
      const d = getRecDate(r);
      return d && activeWeekObj.days.includes(d);
    });
    const mobileWeekCount = mobileWeekSessions.length;

    const mobileWeekCardsHtml = mobileWeekSessions.length
      ? mobileWeekSessions.map((r, i) => renderCompactMonthCard(r, i)).join('')
      : `<div class="empty-state panel mr-month-empty-week">No VMR sessions scheduled this week.</div>`;

    const monthWeekTabsHtml = calWeeks.map(w => {
      const isSel = w.index === mrMonthSelectedWeekIndex;
      return `<button type="button" class="mr-month-week-tab${isSel ? ' active' : ''}" data-month-week-index="${w.index}" aria-selected="${isSel}">Week ${w.index}</button>`;
    }).join('');

    const monthlyScheduleSection = `
      <section class="mr-monthly-schedule-section" id="vmr-month-schedule" style="margin-top:24px;">
        <div class="mr-monthly-schedule-header desktop-only-header">
          <div class="mr-monthly-schedule-title-wrap">
            <h3 class="mr-monthly-schedule-title">VMR Schedule</h3>
            <span class="mr-monthly-count">${monthLabel} · ${monthSessionsCount} session${monthSessionsCount === 1 ? '' : 's'}</span>
          </div>
          <div class="mr-monthly-nav-controls">
            <button type="button" class="mr-month-btn" data-month-jump="${esc(prevMonth)}" title="Previous month" aria-label="Previous month">‹</button>
            <div class="mr-month-year-pickers">
              <select class="select small mr-picker-select" id="mr-month-select" aria-label="Select month">
                ${monthNames.map((name, idx) => `<option value="${String(idx + 1).padStart(2, '0')}" ${idx + 1 === curMonthNum ? 'selected' : ''}>${name}</option>`).join('')}
              </select>
              <select class="select small mr-picker-select" id="mr-year-select" aria-label="Select year">
                ${yearOptions.map(yr => `<option value="${yr}" ${yr === curYear ? 'selected' : ''}>${yr}</option>`).join('')}
              </select>
            </div>
            <button type="button" class="mr-month-btn" data-month-jump="${esc(nextMonth)}" title="Next month" aria-label="Next month">›</button>
            <button type="button" class="button ${isThisMonth ? 'secondary' : 'primary'} small mr-this-month-btn" data-month-jump="${esc(thisMonth)}" ${isThisMonth ? 'disabled' : ''}>This month</button>
          </div>
        </div>

        <div class="mr-monthly-mobile-header mobile-only-header">
          <div class="mr-mobile-title-row">
            <h3 class="mr-monthly-schedule-title">VMR Schedule</h3>
            <button type="button" class="button secondary small mr-mobile-today-btn" data-month-jump="${esc(thisMonth)}" ${isThisMonth && mrMonthSelectedWeekIndex === (calWeeks.findIndex(w => w.days.includes(todayIso)) + 1) ? 'disabled' : ''}>This month</button>
          </div>
          <div class="mr-mobile-month-bar">
            <button type="button" class="mr-month-btn" data-month-jump="${esc(prevMonth)}" title="Previous month" aria-label="Previous month">‹</button>
            <div class="mr-mobile-month-display">
              <button type="button" class="mr-mobile-month-picker-trigger" id="mr-mobile-month-trigger" aria-haspopup="listbox" aria-expanded="false" title="Click to choose month">
                <span class="mr-mobile-month-name">${esc(curMonthName)}</span>
                <span class="mr-mobile-year-context">${curYear}</span>
              </button>
              <div class="mr-mobile-month-dropdown" id="mr-mobile-month-dropdown" style="display:none;" role="listbox">
                <div class="mr-mobile-dropdown-year-bar">
                  <button type="button" class="mr-dropdown-yr-btn" data-month-jump="${esc(mrShiftMonth(currentMonth, -12))}" title="Previous year">‹</button>
                  <span class="mr-dropdown-year-label">${curYear}</span>
                  <button type="button" class="mr-dropdown-yr-btn" data-month-jump="${esc(mrShiftMonth(currentMonth, 12))}" title="Next year">›</button>
                </div>
                <div class="mr-mobile-dropdown-months-grid">
                  ${monthNames.map((mName, idx) => {
                    const mNumStr = String(idx + 1).padStart(2, '0');
                    const isCurM = idx + 1 === curMonthNum;
                    return `<button type="button" class="mr-mobile-month-opt${isCurM ? ' selected' : ''}" data-month-jump="${curYear}-${mNumStr}">${mName}${isCurM ? ' ✓' : ''}</button>`;
                  }).join('')}
                </div>
              </div>
            </div>
            <button type="button" class="mr-month-btn" data-month-jump="${esc(nextMonth)}" title="Next month" aria-label="Next month">›</button>
          </div>
          <div class="mr-month-week-tabs-container">
            <div class="mr-month-week-tabs" role="tablist" aria-label="Month calendar weeks">
              ${monthWeekTabsHtml}
            </div>
          </div>
          <div class="mr-mobile-week-meta-bar">
            <span class="mr-mobile-week-range">${esc(weekRangeFormatted)}</span>
            <span class="mr-mobile-meta-dot" aria-hidden="true">·</span>
            <span class="mr-mobile-week-count">${mobileWeekCount} session${mobileWeekCount === 1 ? '' : 's'}</span>
          </div>
        </div>

        <div class="mr-month-desktop-stream desktop-only-stream">
          <div class="mr-stream mr-month-stream">${desktopMonthCardsHtml}</div>
        </div>
        <div class="mr-month-mobile-stream mobile-only-stream">
          <div class="mr-stream mr-month-stream">${mobileWeekCardsHtml}</div>
        </div>
      </section>`;

    const weekContent = (rangeMode === 'all') ? weeks.map(w => {
      const dayGroups = new Map();
      for (const r of w.records) {
        const d = getRecDate(r) || 'Date TBD';
        if (!dayGroups.has(d)) dayGroups.set(d, []);
        dayGroups.get(d).push(r);
      }
      const dayGroupsHtml = [...dayGroups.entries()].map(([dateStr, dayRecs]) => {
        const dObj = new Date(dateStr + 'T12:00:00Z');
        const dayLabel = Number.isNaN(dObj.getTime()) ? dateStr : dObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
        return `<div class="agenda-day-group"><div class="agenda-day-head"><h4>${esc(dayLabel)}</h4><span class="badge">${dayRecs.length} session${dayRecs.length === 1 ? '' : 's'}</span></div><div class="agenda-session-list">${dayRecs.map(r => agendaCard(r)).join('')}</div></div>`;
      }).join('');
      return `<section class="agenda-week panel"><div class="agenda-week-head"><h3>${esc(weekLabel(w.start, w.end))}</h3><span>${w.records.length} sessions</span></div>${dayGroupsHtml}</section>`;
    }).join('') : '';

    const unresSection = unresolved.length ? `<section class="panel unresolved-panel"><h2>Unresolved dates (${unresolved.length})</h2><p class="muted">These records have unrecognised or ambiguous source dates.</p><div class="agenda-session-list">${unresolved.map(r => agendaCard(r, true)).join('')}</div></section>` : '';

    return `<section class="agenda-view">${next7Html}${monthlyScheduleSection}${weekContent}${unresSection}</section>`;
  }

  function compoundSessionFilters() {
    const getTab = typeof tab !== 'undefined' ? tab : (root.tab || 'Morning Report');
    if (!['Morning Report','CPS Academy VMRs'].includes(getTab)) return '';
    const getRecs = typeof records === 'function' ? records : (typeof root.records === 'function' ? root.records : () => []);
    const rr = getRecs();
    const sc = typeof SessionCore !== 'undefined' ? SessionCore : root.SessionCore;
    const types = [...new Set(rr.map(r => r.fields?.Type).filter(Boolean))].sort();
    const facilitators = [...new Set(rr.flatMap(r => sc && sc.facilitatorNames ? sc.facilitatorNames(r.fields?.Facilitator) : (r.fields?.Facilitator ? [r.fields.Facilitator] : [])).filter(Boolean))].sort();
    const sType = typeof sessionType !== 'undefined' ? sessionType : (root.sessionType || '');
    const sFac = typeof sessionFacilitator !== 'undefined' ? sessionFacilitator : (root.sessionFacilitator || '');
    const gOnly = typeof gapsOnly !== 'undefined' ? gapsOnly : (root.gapsOnly || false);

    let html = `<label class="filter-field-label"><span>Session type</span><select class="select" id="session-type"><option value="">All types</option>${types.map(v => `<option value="${esc(v)}" ${sType === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label><label class="filter-field-label"><span>Facilitator</span><select class="select" id="session-facilitator"><option value="">All facilitators</option>${facilitators.map(v => `<option value="${esc(v)}" ${sFac === v ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>`;
    if (getTab === 'Morning Report') html += `<label class="compound-checkbox"><input id="gaps-only" type="checkbox" ${gOnly ? 'checked' : ''}><span>Unstaffed gaps only</span></label>`;
    return html;
  }

  function bindCompoundSessionFilters() {
    const doRender = typeof render === 'function' ? render : root.render;
    for (const id of ['session-type', 'session-facilitator', 'gaps-only', 'section-query']) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.onchange = e => {
        if (id === 'session-type') { if (typeof sessionType !== 'undefined') sessionType = e.target.value; root.sessionType = e.target.value; }
        else if (id === 'session-facilitator') { if (typeof sessionFacilitator !== 'undefined') sessionFacilitator = e.target.value; root.sessionFacilitator = e.target.value; }
        else if (id === 'gaps-only') { if (typeof gapsOnly !== 'undefined') gapsOnly = e.target.checked; root.gapsOnly = e.target.checked; }
        else { if (typeof sectionQuery !== 'undefined') sectionQuery = e.target.value; root.sectionQuery = e.target.value; }
        if (typeof page !== 'undefined') page = 0;
        root.page = 0;
        if (doRender) doRender();
      };
    }
  }

  function arrangeScheduleFilters() {
    const bar = document.querySelector('.filter-bar');
    if (!bar) return;
    const details = bar.querySelector('.schedule-secondary-filters');
    if (details) {
      details.ontoggle = () => {
        if (window.innerWidth <= 760) scheduleFiltersOpen = details.open;
      };
    }
    const getMode = typeof mode !== 'undefined' ? mode : (root.mode || 'cards');
    const getTab = typeof tab !== 'undefined' ? tab : (root.tab || 'Morning Report');
    const getRecs = typeof records === 'function' ? records : (typeof root.records === 'function' ? root.records : () => []);
    if ((getMode === 'cards' || getMode === 'table') && getTab === 'Morning Report' && !document.querySelector('.schedule-health')) {
      const health = document.createElement('div');
      health.className = 'schedule-health';
      health.innerHTML = staffingHealthBadge(getRecs('Morning Report'));
      bar.after(health);
    }
  }

  function updateActivePickerInstant() {
    if (!activeTimePickerState) return;
    const s = activeTimePickerState;
    const sc = typeof SessionCore !== 'undefined' ? SessionCore : root.SessionCore;
    const userZone = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'America/New_York';
    const effZone = (s.inputZone === 'local' || !s.inputZone) ? userZone : s.inputZone;
    let hour24 = s.hour % 12;
    if (s.ampm === 'PM') hour24 += 12;
    try {
      if (sc && sc.resolveInstantFromZone) {
        const ms = sc.resolveInstantFromZone(s.dateIso, hour24, s.minute, effZone);
        s.instantUtc = new Date(ms).toISOString();
      }
    } catch {}
  }

  function openTimePicker(sessionId) {
    if (!sessionId) return;
    const sc = typeof SessionCore !== 'undefined' ? SessionCore : root.SessionCore;
    const getRecs = typeof records === 'function' ? records : (typeof root.records === 'function' ? root.records : () => []);
    const doToast = typeof toast === 'function' ? toast : root.toast;
    const getRecDate = typeof recordDate === 'function' ? recordDate : (typeof root.recordDate === 'function' ? root.recordDate : (r => r?.fields?.Date || ''));

    const allMr = getRecs('Morning Report') || (root.db?.['Morning Report']?.records || []);
    const allSplit = allMr.flatMap(r => sc && sc.splitMorningReport ? sc.splitMorningReport(r) : [r]);
    const r = allSplit.find(x => x.id === sessionId || x.stableId === sessionId);
    if (!r) {
      if (doToast) doToast('Could not locate session record.');
      return;
    }

    const baseDateIso = getRecDate(r) || r.fields?.Date || '';
    if (!baseDateIso) {
      if (doToast) doToast('This session does not have a confirmed date.');
      return;
    }

    const dlg = document.getElementById('time-picker-dialog');
    if (!dlg) return;

    const userZone = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'America/New_York';
    const parsed = sc && sc.parseSessionTime ? sc.parseSessionTime(r) : null;
    let initialInstantUtc;

    if (parsed && parsed.status === 'resolved' && parsed.startUtc) {
      initialInstantUtc = new Date(parsed.startUtc).toISOString();
    } else {
      const defaultMs = sc && sc.resolveInstantFromZone
        ? sc.resolveInstantFromZone(baseDateIso, 9, 0, userZone)
        : Date.parse(`${baseDateIso}T09:00:00Z`);
      initialInstantUtc = new Date(defaultMs).toISOString();
    }

    const initialParts = sc && sc.getZoneDateTimeParts
      ? sc.getZoneDateTimeParts(initialInstantUtc, userZone)
      : { dateIso: baseDateIso, hour12: 9, minute: 0, ampm: 'AM' };

    activeTimePickerState = {
      record: r,
      sessionId: r.id,
      dateIso: initialParts.dateIso,
      instantUtc: initialInstantUtc,
      mode: 'hour',
      hour: initialParts.hour12,
      minute: initialParts.minute,
      ampm: initialParts.ampm,
      inputZone: 'local',
      saving: false
    };

    const zoneSelect = document.getElementById('tp-zone-select');
    if (zoneSelect) zoneSelect.value = 'local';

    renderTimePickerClock();
    dlg.showModal();
  }

  function renderTimePickerClock() {
    if (!activeTimePickerState) return;
    const s = activeTimePickerState;
    const sc = typeof SessionCore !== 'undefined' ? SessionCore : root.SessionCore;
    const hourDisp = document.getElementById('tp-hour-disp');
    const minDisp = document.getElementById('tp-min-disp');
    const amBtn = document.getElementById('tp-am-btn');
    const pmBtn = document.getElementById('tp-pm-btn');
    const clockFace = document.getElementById('tp-clock-face');
    const previewEl = document.getElementById('tp-tz-preview');
    const savingEl = document.getElementById('tp-saving-indicator');
    const saveBtn = document.getElementById('tp-save-btn');
    const cancelBtn = document.getElementById('tp-cancel-btn');
    const infoEl = document.getElementById('time-picker-session-info');

    if (infoEl && s.record) {
      const titleMeta = sc && sc.getSessionDisplayTitle
        ? sc.getSessionDisplayTitle(s.record)
        : { mainTitle: s.record.fields?.['Topic / Case'] || s.record.fields?.Type || 'Virtual Morning Report' };
      const zoneName = s.inputZone === 'local' ? 'Local' : (s.inputZone === 'America/Los_Angeles' ? 'PT' : 'ET');
      infoEl.textContent = `${titleMeta.mainTitle} · ${s.dateIso} (${zoneName})`;
    }

    if (hourDisp) {
      hourDisp.textContent = String(s.hour).padStart(2, '0');
      hourDisp.classList.toggle('active', s.mode === 'hour');
    }
    if (minDisp) {
      minDisp.textContent = String(s.minute).padStart(2, '0');
      minDisp.classList.toggle('active', s.mode === 'minute');
    }
    if (amBtn) amBtn.classList.toggle('active', s.ampm === 'AM');
    if (pmBtn) pmBtn.classList.toggle('active', s.ampm === 'PM');

    if (savingEl) savingEl.style.display = s.saving ? 'block' : 'none';
    if (saveBtn) saveBtn.disabled = s.saving;
    if (cancelBtn) cancelBtn.disabled = s.saving;

    if (clockFace) {
      clockFace.innerHTML = '';
      const radius = 80;
      const centerX = 105;
      const centerY = 105;

      if (s.mode === 'hour') {
        const hours = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
        hours.forEach((h, idx) => {
          const angle = (idx * 30 - 90) * (Math.PI / 180);
          const x = centerX + radius * Math.cos(angle);
          const y = centerY + radius * Math.sin(angle);
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'tp-clock-number' + (s.hour === h ? ' selected' : '');
          btn.style.left = `${x}px`;
          btn.style.top = `${y}px`;
          btn.textContent = String(h);
          btn.setAttribute('aria-label', `${h} o'clock`);
          btn.onclick = (e) => {
            e.preventDefault();
            s.hour = h;
            s.mode = 'minute';
            updateActivePickerInstant();
            renderTimePickerClock();
          };
          clockFace.appendChild(btn);
        });
      } else {
        const minutes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
        minutes.forEach((m, idx) => {
          const angle = (idx * 30 - 90) * (Math.PI / 180);
          const x = centerX + radius * Math.cos(angle);
          const y = centerY + radius * Math.sin(angle);
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'tp-clock-number' + (s.minute === m ? ' selected' : '');
          btn.style.left = `${x}px`;
          btn.style.top = `${y}px`;
          btn.textContent = String(m).padStart(2, '0');
          btn.setAttribute('aria-label', `${m} minutes`);
          btn.onclick = (e) => {
            e.preventDefault();
            s.minute = m;
            updateActivePickerInstant();
            renderTimePickerClock();
          };
          clockFace.appendChild(btn);
        });
      }
    }

    if (previewEl && sc && sc.computeSheetsTimes) {
      try {
        const userZone = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'America/New_York';
        const effZone = (s.inputZone === 'local' || !s.inputZone) ? userZone : s.inputZone;
        let hour24 = s.hour % 12;
        if (s.ampm === 'PM') hour24 += 12;

        const computed = sc.computeSheetsTimes(s.dateIso, hour24, s.minute, effZone);
        previewEl.innerHTML = `
          <div class="tp-preview-line">
            <strong>Pacific Time (Sheet Col B):</strong>
            <span>${esc(computed.ptValue)} (${esc(computed.ptZone)}) · ${esc(computed.ptDate)}</span>
          </div>
          <div class="tp-preview-line">
            <strong>Eastern Time (Sheet Col C):</strong>
            <span>${esc(computed.etValue)} (${esc(computed.etZone)}) · ${esc(computed.etDate)}</span>
          </div>
          <div class="tp-preview-line" style="color:var(--text-muted);font-size:11px;margin-top:2px;">
            <span>Instant: ${esc(computed.instantUtc.slice(0, 16).replace('T', ' '))} UTC</span>
            <span>Input date: ${esc(s.dateIso)}</span>
          </div>
        `;
      } catch (err) {
        previewEl.innerHTML = `<span style="color:var(--urgent-fg);">${esc(err.message)}</span>`;
      }
    }
  }

  async function saveTimePickerSelection() {
    if (!activeTimePickerState || activeTimePickerState.saving) return;
    const s = activeTimePickerState;
    const r = s.record;
    const sc = typeof SessionCore !== 'undefined' ? SessionCore : root.SessionCore;
    const doToast = typeof toast === 'function' ? toast : root.toast;
    const doMutate = typeof mutate === 'function' ? mutate : root.mutate;
    const doRender = typeof render === 'function' ? render : root.render;
    const doLog = typeof log === 'function' ? log : root.log;

    const userZone = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'America/New_York';
    const effZone = (s.inputZone === 'local' || !s.inputZone) ? userZone : s.inputZone;
    let hour24 = s.hour % 12;
    if (s.ampm === 'PM') hour24 += 12;

    let computed;
    try {
      if (sc && sc.computeSheetsTimes) {
        computed = sc.computeSheetsTimes(s.dateIso, hour24, s.minute, effZone);
      } else {
        throw new Error('computeSheetsTimes unavailable');
      }
    } catch (err) {
      if (doToast) doToast(`Invalid time: ${err.message}`);
      return;
    }

    s.saving = true;
    renderTimePickerClock();

    const prevPt = (r.fields && r.fields['Pacific time (source)']) || '';
    const prevEt = (r.fields && r.fields['Eastern time (source)']) || '';
    const newPt = computed.ptValue;
    const newEt = computed.etValue;

    const idMod = typeof Identity !== 'undefined' ? Identity : root.Identity;
    const user = idMod ? idMod.getCurrentUser() : null;
    const isOnlineEligible = user && user.isAuthenticated && !user.isMock && typeof fetch === 'function';

    if (isOnlineEligible) {
      const targetStableId = r.session?.parentStableId || r.parentId || r.stableId || r.id;
      const token = typeof localStorage !== 'undefined' ? localStorage.getItem('cps_token') : null;
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      try {
        const res = await fetch('/api/mutate', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            dataset: 'Morning Report',
            stableId: targetStableId,
            childSessionIndex: r.session?.index || null,
            fields: {
              'Pacific time (source)': newPt,
              'Eastern time (source)': newEt
            },
            expectedPreviousValues: {
              'Pacific time (source)': prevPt,
              'Eastern time (source)': prevEt
            },
            operationId: `op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
          })
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          s.saving = false;
          renderTimePickerClock();
          if (doToast) {
            if (res.status === 409) {
              doToast('Conflict: The session time was modified by another scheduler. Please reload.');
            } else {
              doToast(`Could not update the session time. No changes were saved. (${err.message || 'Server error'})`);
            }
          }
          return;
        }
      } catch (netErr) {
        s.saving = false;
        renderTimePickerClock();
        if (doToast) doToast('Could not update the session time. No changes were saved.');
        return;
      }
    }

    if (doMutate) {
      doMutate(w => {
        w.edits[s.sessionId] = {
          ...(w.edits[s.sessionId] || {}),
          'Pacific time (source)': newPt,
          'Eastern time (source)': newEt
        };
        if (doLog) doLog(w, 'Updated Session Time', r, 'Morning Report');
      }, s.sessionId);
    }

    if (r.fields) {
      r.fields['Pacific time (source)'] = newPt;
      r.fields['Eastern time (source)'] = newEt;
    }
    if (sc && sc.invalidateRecord) {
      sc.invalidateRecord(s.sessionId);
    }

    const dlg = document.getElementById('time-picker-dialog');
    if (dlg) dlg.close();
    activeTimePickerState = null;

    if (doRender) doRender();
    if (doToast) doToast(`✓ Time updated: ${newPt} PT / ${newEt} ET`);
  }

  function initTimePickerEvents() {
    if (typeof document === 'undefined') return;

    document.addEventListener('click', e => {
      const editBtn = e.target.closest('[data-edit-note]');
      if (editBtn) {
        e.preventDefault();
        e.stopPropagation();
        const sessionId = editBtn.dataset.editNote;
        const getRecs = typeof records === 'function' ? records : (typeof root.records === 'function' ? root.records : () => []);
        const r = (getRecs('Morning Report') || []).find(x => x.id === sessionId);
        if (!r) return;
        const existing = (r.fields && r.fields.Notes) || '';
        const newNote = window.prompt('Session Note:\n(Optional context about this VMR. Keep role fields limited to names.)', existing);
        if (newNote !== null) {
          updateSessionNote(sessionId, newNote);
        }
        return;
      }

      const timeBtn = e.target.closest('[data-edit-time]');
      if (timeBtn) {
        e.preventDefault();
        e.stopPropagation();
        openTimePicker(timeBtn.dataset.editTime);
        return;
      }

      const toggleMonthSessionBtn = e.target.closest('[data-toggle-month-session]');
      if (toggleMonthSessionBtn) {
        e.preventDefault();
        e.stopPropagation();
        const sessionId = toggleMonthSessionBtn.dataset.toggleMonthSession;
        if (mrMonthExpandedId === sessionId) {
          mrMonthExpandedId = null;
        } else {
          mrMonthExpandedId = sessionId;
        }
        const doRender = typeof render === 'function' ? render : root.render;
        if (doRender) doRender();
        return;
      }

      const mobileDropdown = document.querySelector('#mr-mobile-month-dropdown');
      if (mobileDropdown && mobileDropdown.style.display !== 'none' && !e.target.closest('#mr-mobile-month-trigger') && !e.target.closest('#mr-mobile-month-dropdown')) {
        mobileDropdown.style.display = 'none';
        const trigger = document.querySelector('#mr-mobile-month-trigger');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
      }
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        const toggleBtn = e.target.closest('[data-toggle-month-session]');
        if (toggleBtn && !e.target.closest('button, a, input, select')) {
          e.preventDefault();
          toggleBtn.click();
        }
      }
    });

    const hourDispBtn = document.getElementById('tp-hour-disp');
    if (hourDispBtn) {
      hourDispBtn.onclick = () => {
        if (!activeTimePickerState) return;
        activeTimePickerState.mode = 'hour';
        renderTimePickerClock();
      };
    }

    const minDispBtn = document.getElementById('tp-min-disp');
    if (minDispBtn) {
      minDispBtn.onclick = () => {
        if (!activeTimePickerState) return;
        activeTimePickerState.mode = 'minute';
        renderTimePickerClock();
      };
    }

    const amBtn = document.getElementById('tp-am-btn');
    if (amBtn) {
      amBtn.onclick = () => {
        if (!activeTimePickerState) return;
        activeTimePickerState.ampm = 'AM';
        updateActivePickerInstant();
        renderTimePickerClock();
      };
    }

    const pmBtn = document.getElementById('tp-pm-btn');
    if (pmBtn) {
      pmBtn.onclick = () => {
        if (!activeTimePickerState) return;
        activeTimePickerState.ampm = 'PM';
        updateActivePickerInstant();
        renderTimePickerClock();
      };
    }

    const zoneSelect = document.getElementById('tp-zone-select');
    if (zoneSelect) {
      zoneSelect.onchange = (e) => {
        if (!activeTimePickerState) return;
        const newZone = e.target.value;
        const sc = typeof SessionCore !== 'undefined' ? SessionCore : root.SessionCore;
        const userZone = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'America/New_York';
        const effZone = (newZone === 'local' || !newZone) ? userZone : newZone;
        activeTimePickerState.inputZone = newZone;
        if (activeTimePickerState.instantUtc && sc && sc.getZoneDateTimeParts) {
          const parts = sc.getZoneDateTimeParts(activeTimePickerState.instantUtc, effZone);
          activeTimePickerState.dateIso = parts.dateIso;
          activeTimePickerState.hour = parts.hour12;
          activeTimePickerState.minute = parts.minute;
          activeTimePickerState.ampm = parts.ampm;
        }
        renderTimePickerClock();
      };
    }

    const saveBtn = document.getElementById('tp-save-btn');
    if (saveBtn) {
      saveBtn.onclick = () => saveTimePickerSelection();
    }

    const cancelBtn = document.getElementById('tp-cancel-btn');
    if (cancelBtn) {
      cancelBtn.onclick = () => {
        const dlg = document.getElementById('time-picker-dialog');
        if (dlg) dlg.close();
        activeTimePickerState = null;
      };
    }
  }

  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initTimePickerEvents);
    } else {
      initTimePickerEvents();
    }
  }

  return {
    mrGaps,
    getStaffingUrgency,
    staffingDays,
    staffingHealth,
    staffingHealthBadge,
    staffingRoleValue,
    tokenizeStaff,
    getRoleMilestoneIndex,
    renderStaffTokens,
    updateRoleAssignment,
    swapStaffToken,
    removeStaffToken,
    addStaffToken,
    updateSessionNote,
    staffingSlot,
    staffingGrid,
    staffingTools,
    bindStaffingTools,
    weekKey,
    weekLabel,
    scheduleGroups,
    scheduleSummary,
    renderMatrixItem,
    matrixView,
    getNextSevenVMRs,
    mrFilledStats,
    editorialCardRail,
    editorialCardStatus,
    editorialCard,
    renderCompactMonthCard,
    agendaView,
    agendaCard,
    compoundSessionFilters,
    bindCompoundSessionFilters,
    arrangeScheduleFilters,
    isScheduleEditor,
    openTimePicker,
    renderTimePickerClock,
    saveTimePickerSelection,
    initTimePickerEvents,
    mrShiftMonth,
    mrMonthLabel,
    getDefaultScheduleWeekStart,
    getDefaultScheduleMonth,
    getMonthCalendarWeeks,
    formatMonthWeekLabel,
    get mrMonthSelectedWeekIndex() { return mrMonthSelectedWeekIndex; },
    set mrMonthSelectedWeekIndex(v) { mrMonthSelectedWeekIndex = v; },
    get mrMonthExpandedId() { return mrMonthExpandedId; },
    set mrMonthExpandedId(v) { mrMonthExpandedId = v; },
    get activeTimePickerState() { return activeTimePickerState; },
    set activeTimePickerState(v) { activeTimePickerState = v; }
  };
});
