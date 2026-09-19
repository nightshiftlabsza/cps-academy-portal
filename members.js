(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MembersModule = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const MEMBERS_STRUCTURAL_IDS = new Map([
    ['Members:80', { role: 'cohort_heading', label: 'Core team members', cohort: 'Core team' }],
    ['Members:82', { role: 'column_header', label: 'Repeated header (Name / E-mail)', cohort: 'Core team' }],
    ['Members:146', { role: 'cohort_heading', label: 'Leaders', cohort: 'Leaders' }],
    ['Members:148', { role: 'column_header', label: 'Repeated header (Name / E-mail)', cohort: 'Leaders' }],
    ['Members:189', { role: 'cohort_heading', label: 'Members inactive', cohort: 'Marked inactive in source' }],
    ['Members:191', { role: 'column_header', label: 'Repeated header (Name / E-mail)', cohort: 'Marked inactive in source' }]
  ]);

  const MEMBER_COHORT_DEFS = [
    { id: 'participants', name: 'Participants', key: 'Participants', headingId: null, description: 'Academic year participants' },
    { id: 'core', name: 'Core team members', key: 'Core team', headingId: 'Members:80', description: 'Core team members' },
    { id: 'leaders', name: 'Leaders', key: 'Leaders', headingId: 'Members:146', description: 'Academy leadership cohort' },
    { id: 'inactive', name: 'Inactive members', key: 'Marked inactive in source', headingId: 'Members:189', description: 'Historical members marked inactive in source' }
  ];

  function getMemberCohortByRow(row) {
    if (typeof row !== 'number' || row == null || Number.isNaN(row)) return 'Local / unassigned';
    if (row >= 57 && row <= 71) return 'Participants';
    if (row >= 83 && row <= 137) return 'Core team';
    if (row >= 149 && row <= 185) return 'Leaders';
    if (row >= 193 && row <= 236) return 'Marked inactive in source';
    return 'Local / unassigned';
  }

  function parseBirthdayMonthDay(val) {
    if (!val || typeof val !== 'string') return null;
    const s = val.trim();
    if (!s || s === '—') return null;

    const MAX_DAYS = [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const MONTHS = {
      january: 1, jan: 1,
      february: 2, feb: 2,
      march: 3, mar: 3,
      april: 4, apr: 4,
      may: 5,
      june: 6, jun: 6,
      july: 7, jul: 7,
      august: 8, aug: 8,
      september: 9, sep: 9, sept: 9,
      october: 10, oct: 10,
      november: 11, nov: 11,
      december: 12, dec: 12
    };

    const iso = s.match(/^\d{4}-(\d{2})-(\d{2})$/);
    if (iso) {
      const m = parseInt(iso[1], 10);
      const d = parseInt(iso[2], 10);
      if (m >= 1 && m <= 12 && d >= 1 && d <= MAX_DAYS[m]) return { month: m, day: d };
      return null;
    }

    const monthOnly = s.match(/^([a-z]+)$/i);
    if (monthOnly) {
      const m = MONTHS[monthOnly[1].toLowerCase()];
      if (m) return { month: m, day: 0 };
      return null;
    }

    const monthDay = s.match(/^([a-z]+)[,\s]+(\d{1,2})\s*(?:st|nd|rd|th)?$/i);
    if (monthDay) {
      const m = MONTHS[monthDay[1].toLowerCase()];
      const d = parseInt(monthDay[2], 10);
      if (m && d >= 1 && d <= MAX_DAYS[m]) return { month: m, day: d };
      return null;
    }

    const dayMonth = s.match(/^(\d{1,2})\s*(?:st|nd|rd|th)?[,\s]+([a-z]+)$/i);
    if (dayMonth) {
      const d = parseInt(dayMonth[1], 10);
      const m = MONTHS[dayMonth[2].toLowerCase()];
      if (m && d >= 1 && d <= MAX_DAYS[m]) return { month: m, day: d };
      return null;
    }

    return null;
  }

  function formatBirthday(val) {
    if (!val || typeof val !== 'string') return '—';
    const trimmed = val.trim();
    if (!trimmed) return '—';
    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      const monthNum = parseInt(isoMatch[2], 10);
      const dayNum = parseInt(isoMatch[3], 10);
      const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      if (monthNum >= 1 && monthNum <= 12) {
        return `${months[monthNum - 1]} ${dayNum}`;
      }
    }
    return trimmed;
  }

  function findMemberInTeams(name) {
    if (!name) return;
    if (typeof orgSearchQuery !== 'undefined') orgSearchQuery = name.trim();
    if (typeof orgGroupFilter !== 'undefined') orgGroupFilter = 'all';
    if (typeof navigate === 'function') navigate('OrgStructure');
  }

  let memberSortCol = '';
  let memberSortDir = 'asc';
  let memberSearchQuery = '';

  function renderMemberDesktopRow(item) {
    const r = item.record;
    const f = r.fields || {};
    const bdayDisplay = formatBirthday(f.Birthday);
    const edits = (typeof workspace !== 'undefined' && workspace && workspace.edits) ? workspace.edits : {};
    const chipFn = typeof chip === 'function' ? chip : (t, cls) => `<span class="tag ${cls}">${t}</span>`;
    const localChip = edits[r.id] ? chipFn('Local changes', 'local-chip') : (r.id.startsWith('local:') ? chipFn('Locally added', 'local-chip') : '');

    return `<tr class="member-row" data-id="${esc(r.id)}">
      <td class="td-name" data-label="Name">
        <div class="member-name-cell">
          <button type="button" class="member-name-btn" data-open="${esc(r.id)}" data-area="Members" aria-label="Open details for ${esc(f.Name || 'member')}">${esc(f.Name || 'Unnamed member')}</button>
          ${localChip}
        </div>
      </td>
      <td class="td-sponsor" data-label="Sponsor">${esc(f.Sponsor || '—')}</td>
      <td class="td-social" data-label="Social handles">${esc(f['Social handles'] || '—')}</td>
      <td class="td-country" data-label="Country of origin">${esc(f.Country || '—')}</td>
      <td class="td-birthday" data-label="Birthday">${esc(bdayDisplay)}</td>
      <td class="td-email" data-label="Email">${f.Email ? `<a href="mailto:${esc(f.Email)}" class="member-email-link">${esc(f.Email)}</a>` : '—'}</td>
      <td class="td-location" data-label="Location / home">${esc(f.Location || '—')}</td>
      <td class="td-training" data-label="Training / specialty">${esc(f.Subspecialty || '—')}</td>
    </tr>`;
  }

  const renderMemberRow = renderMemberDesktopRow;

  function membersView() {
    const getRecords = typeof records === 'function' ? records : (t => (typeof db !== 'undefined' && db && db[t] ? db[t].records : []));
    const allRecords = getRecords('Members') || [];
    const getClassification = typeof getRecordClassification === 'function'
      ? getRecordClassification
      : (r => ({ isSubstantive: r.row >= 4 && !MEMBERS_STRUCTURAL_IDS.has(r.id), cohort: getMemberCohortByRow(r.row) }));

    const classified = allRecords.map(r => ({ record: r, classification: getClassification(r, 'Members') }));
    const substantiveMembers = classified.filter(x => x.classification.isSubstantive);
    const totalSubstantive = substantiveMembers.length;

    const queryTerms = memberSearchQuery.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const isFiltering = queryTerms.length > 0;

    function matchesSearch(x) {
      if (!queryTerms.length) return true;
      const f = x.record.fields || {};
      const bday = formatBirthday(f.Birthday);
      const hay = `${f.Name || ''} ${f.Sponsor || ''} ${f['Social handles'] || ''} ${f.Country || ''} ${f.Birthday || ''} ${bday} ${f.Email || ''} ${f.Location || ''} ${f.Subspecialty || ''} ${x.classification.cohort || ''}`.toLowerCase();
      return queryTerms.every(term => hay.includes(term));
    }

    const visibleMembers = substantiveMembers.filter(matchesSearch);

    function sortMemberItems(items) {
      if (!memberSortCol) return items;
      return [...items].sort((a, b) => {
        if (memberSortCol === 'Birthday') {
          const keyA = parseBirthdayMonthDay(a.record.fields?.Birthday);
          const keyB = parseBirthdayMonthDay(b.record.fields?.Birthday);
          const hasA = keyA !== null;
          const hasB = keyB !== null;
          if (!hasA && !hasB) return 0;
          if (!hasA) return 1; // missing/unrecognized at bottom in BOTH directions
          if (!hasB) return -1;
          const numA = keyA.month * 100 + keyA.day;
          const numB = keyB.month * 100 + keyB.day;
          const cmp = numA - numB;
          return memberSortDir === 'desc' ? -cmp : cmp;
        }
        let valA = (a.record.fields[memberSortCol] || '').trim();
        let valB = (b.record.fields[memberSortCol] || '').trim();
        const cmp = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
        return memberSortDir === 'desc' ? -cmp : cmp;
      });
    }

    // Group into audited cohort sections
    const cohortSections = MEMBER_COHORT_DEFS.map(def => {
      let items = visibleMembers.filter(x => x.classification.cohort === def.key);
      const totalCohortCount = substantiveMembers.filter(x => x.classification.cohort === def.key).length;
      items = sortMemberItems(items);
      return { def, items, totalCohortCount };
    });

    // Check if any unassigned local drafts exist
    const unassignedSubstantive = substantiveMembers.filter(x => x.classification.cohort === 'Local / unassigned');
    if (unassignedSubstantive.length > 0) {
      let unassignedItems = visibleMembers.filter(x => x.classification.cohort === 'Local / unassigned');
      unassignedItems = sortMemberItems(unassignedItems);
      cohortSections.push({
        def: { id: 'unassigned', name: 'Local / unassigned', key: 'Local / unassigned', description: 'Locally created member drafts' },
        items: unassignedItems,
        totalCohortCount: unassignedSubstantive.length
      });
    }

    const activeCohortsCount = cohortSections.filter(s => s.totalCohortCount > 0).length;
    const structuralCount = allRecords.length - totalSubstantive;
    const defaultMeta = `${totalSubstantive} named member rows (${activeCohortsCount} cohorts)${structuralCount > 0 ? ` · ${structuralCount} structural entries excluded` : ''} · ${allRecords.length} total records`;

    const totalVisible = visibleMembers.length;

    const sortIcon = col => {
      if (memberSortCol !== col) return '<span class="sort-icon-neutral" aria-hidden="true">↕</span>';
      return memberSortDir === 'asc' ? '<span class="sort-icon-active" aria-hidden="true">▲</span>' : '<span class="sort-icon-active" aria-hidden="true">▼</span>';
    };

    const toolbarHtml = `<div class="member-toolbar panel">
      <div class="member-toolbar-controls">
        <div class="member-search-wrap">
          <span class="member-search-icon" aria-hidden="true">⌕</span>
          <input type="search" id="member-search-input" class="input member-search-input" placeholder="Search members by name, sponsor, handle, country, email, location, training/specialty…" value="${esc(memberSearchQuery)}" aria-label="Search members">
          ${memberSearchQuery ? `<button type="button" class="icon-button member-search-clear" id="member-clear-input" aria-label="Clear search">×</button>` : ''}
        </div>
      </div>
      <div class="member-toolbar-meta">
        <p class="muted results-count" id="members-results-meta">
          ${isFiltering 
            ? `Showing ${totalVisible} of ${totalSubstantive} members matching “${esc(memberSearchQuery)}”`
            : defaultMeta}
        </p>
      </div>
    </div>`;

    let contentHtml = '';
    if (totalVisible === 0) {
      contentHtml = `<section class="empty-state panel">
        <h2>No matching members</h2>
        <p>No members matched “${esc(memberSearchQuery)}”.</p>
        <button type="button" class="button secondary" id="member-empty-clear">Clear search</button>
      </section>`;
    } else {
      const tableHeaderHtml = `<thead>
        <tr>
          <th scope="col" class="th-name sortable-th" data-sort="Name" tabindex="0" role="button" aria-label="Sort by Name">Name ${sortIcon('Name')}</th>
          <th scope="col" class="th-sponsor sortable-th" data-sort="Sponsor" tabindex="0" role="button" aria-label="Sort by Sponsor">Sponsor ${sortIcon('Sponsor')}</th>
          <th scope="col" class="th-social sortable-th" data-sort="Social handles" tabindex="0" role="button" aria-label="Sort by Social handles">Social handles ${sortIcon('Social handles')}</th>
          <th scope="col" class="th-country sortable-th" data-sort="Country" tabindex="0" role="button" aria-label="Sort by Country of origin">Country of origin ${sortIcon('Country')}</th>
          <th scope="col" class="th-birthday sortable-th" data-sort="Birthday" tabindex="0" role="button" aria-label="Sort by Birthday">Birthday ${sortIcon('Birthday')}</th>
          <th scope="col" class="th-email sortable-th" data-sort="Email" tabindex="0" role="button" aria-label="Sort by Email">Email ${sortIcon('Email')}</th>
          <th scope="col" class="th-location sortable-th" data-sort="Location" tabindex="0" role="button" aria-label="Sort by Location / home">Location / home ${sortIcon('Location')}</th>
          <th scope="col" class="th-training sortable-th" data-sort="Subspecialty" tabindex="0" role="button" aria-label="Sort by Training / specialty">Training / specialty ${sortIcon('Subspecialty')}</th>
        </tr>
      </thead>`;

      const sectionsTbodyHtml = cohortSections.map(({ def, items, totalCohortCount }) => {
        if (isFiltering && items.length === 0) return '';
        const rowsHtml = items.map(renderMemberRow).join('');
        const countLabel = isFiltering
          ? `${items.length} of ${totalCohortCount} ${items.length === 1 ? 'member' : 'members'}`
          : `${items.length} ${items.length === 1 ? 'member' : 'members'}`;

        return `
          <tr class="member-cohort-header-row" id="cohort-${def.id}">
            <th colspan="8" scope="colgroup" class="member-cohort-header-cell">
              <div class="member-cohort-header-content">
                <span class="member-cohort-title">${esc(def.name)}</span>
                <span class="tag tag-cohort member-cohort-badge">${esc(def.key)}</span>
                <span class="tag member-cohort-count">${countLabel}</span>
              </div>
            </th>
          </tr>
          ${rowsHtml}
        `;
      }).join('');

      contentHtml = `<div class="member-table-container panel">
        <table class="data-table member-table" id="member-directory-table">
          ${tableHeaderHtml}
          <tbody>
            ${sectionsTbodyHtml}
          </tbody>
        </table>
      </div>`;
    }

    const areas = (typeof groups !== 'undefined' && groups['People']) ? groups['People'] : ['OrgStructure', 'Members'];
    const getSecLabel = typeof sectionLabel === 'function' ? sectionLabel : t => t;
    const areaTabsHtml = `<div class="toolbar area-tabs">${areas.map(t => `<button class="button ${t==='Members'?'primary':'secondary'} small" ${t==='Members'?'aria-current="page"':''} data-go="${esc(t)}">${esc(getSecLabel(t))}</button>`).join('')}</div>`;

    const getHeader = typeof header === 'function' ? header : (t, d) => `<h1>${t}</h1><p>${d}</p>`;
    const getBanner = typeof banner === 'function' ? banner : () => '';
    const getAreaPicker = typeof areaPicker === 'function' ? areaPicker : () => '';
    const desc = (typeof descriptions !== 'undefined' && descriptions['Members']) ? descriptions['Members'] : 'Find Academy members, sponsors and social handles.';

    const pageEl = typeof $ === 'function' ? $('#page') : (typeof document !== 'undefined' ? document.getElementById('page') : null);
    if (pageEl) {
      pageEl.innerHTML = getHeader('Members', desc) +
        getBanner() +
        getAreaPicker() +
        areaTabsHtml +
        toolbarHtml +
        contentHtml;
      bindMembersEvents();
    }

    return toolbarHtml + contentHtml;
  }

  function bindMembersEvents() {
    if (typeof document === 'undefined') return;
    const searchInput = document.getElementById('member-search-input');
    if (searchInput) {
      searchInput.oninput = e => {
        memberSearchQuery = e.target.value;
        const start = e.target.selectionStart;
        const end = e.target.selectionEnd;
        if (typeof render === 'function') render();
        const el = document.getElementById('member-search-input');
        if (el) { el.focus(); try { el.setSelectionRange(start, end); } catch {} }
      };
    }
    const clearBtn = document.getElementById('member-clear-input');
    if (clearBtn) {
      clearBtn.onclick = () => {
        memberSearchQuery = '';
        if (typeof render === 'function') render();
        if (typeof focusAccessibleDestination === 'function') focusAccessibleDestination();
      };
    }
    const emptyClearBtn = document.getElementById('member-empty-clear');
    if (emptyClearBtn) {
      emptyClearBtn.onclick = () => {
        memberSearchQuery = '';
        if (typeof render === 'function') render();
        if (typeof focusAccessibleDestination === 'function') focusAccessibleDestination();
      };
    }
    document.querySelectorAll('.sortable-th').forEach(th => {
      const col = th.dataset.sort;
      const triggerSort = () => {
        if (memberSortCol === col) {
          memberSortDir = memberSortDir === 'asc' ? 'desc' : 'asc';
        } else {
          memberSortCol = col;
          memberSortDir = 'asc';
        }
        if (typeof render === 'function') render();
      };
      th.onclick = triggerSort;
      th.onkeydown = e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          triggerSort();
        }
      };
    });
  }

  function getBirthdaysToday(options = {}) {
    const refDate = options.referenceDate || (typeof today === 'function' ? today() : '2026-09-15');
    const parts = String(refDate).split('-');
    if (parts.length < 3) return [];
    const refMonth = parseInt(parts[1], 10);
    const refDay = parseInt(parts[2], 10);
    if (!refMonth || !refDay) return [];

    const getRecords = typeof records === 'function' ? records : (t => (typeof db !== 'undefined' && db && db[t] ? db[t].records : []));
    const members = options.records || getRecords('Members') || [];
    const matches = [];

    for (const m of members) {
      const bdayRaw = m.fields?.Birthday;
      if (!bdayRaw) continue;
      const parsed = parseBirthdayMonthDay(bdayRaw);
      if (!parsed || !parsed.month || !parsed.day || parsed.day <= 0) continue;
      if (parsed.month === refMonth && parsed.day === refDay) {
        matches.push(m);
      }
    }

    return matches;
  }

  function renderBirthdaysTodayWidget(options = {}) {
    const matches = getBirthdaysToday(options);
    if (!matches || matches.length === 0) {
      return '';
    }

    const namesList = matches
      .map(m => `<span class="birthday-name">${esc(m.fields?.Name || 'Academy Member')}</span>`)
      .join('<span class="birthday-sep"> · </span>');

    return `<section class="panel birthdays-today-panel" id="birthdays-today-section">
      <div class="birthdays-today-content">
        <div class="birthdays-today-badge">
          <span class="birthday-cake-icon" aria-hidden="true">🎂</span>
          <strong>Birthdays today</strong>
        </div>
        <div class="birthdays-today-names">
          ${namesList}
        </div>
      </div>
    </section>`;
  }

  // Profile Controller State
  let currentProfileRecord = null;
  let profileDialogMode = 'edit';
  let profileBirthdayTouched = false;
  let profileBirthdayCleared = false;
  let profileOriginalBirthday = '';

  function populateDayOptions(monthNum, selectedDay = '') {
    if (typeof document === 'undefined') return;
    const daySelect = document.getElementById('prof-bday-day');
    if (!daySelect) return;
    const prevVal = selectedDay || daySelect.value;
    daySelect.innerHTML = '<option value="">Day</option>';
    const maxDays = [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const count = monthNum && maxDays[monthNum] ? maxDays[monthNum] : 31;
    for (let d = 1; d <= count; d++) {
      const opt = document.createElement('option');
      opt.value = String(d);
      opt.textContent = String(d);
      if (String(d) === String(prevVal)) opt.selected = true;
      daySelect.appendChild(opt);
    }
  }

  async function loadOnlineProfile() {
    if (typeof document === 'undefined') return;
    const loadingEl = document.getElementById('profile-loading-state');
    const errorEl = document.getElementById('profile-error-state');
    const contentEl = document.getElementById('profile-form-content');
    const errorMsg = document.getElementById('profile-error-msg');
    const noticeEl = document.getElementById('prof-bday-raw-notice');
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('cps_token') : null;

    if (loadingEl) loadingEl.style.display = 'block';
    if (errorEl) errorEl.style.display = 'none';
    if (contentEl) contentEl.style.display = 'none';
    if (noticeEl) { noticeEl.textContent = ''; noticeEl.style.display = 'none'; }

    profileBirthdayTouched = false;
    profileBirthdayCleared = false;

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/profile', { headers });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Could not reach Google Sheets. Please verify your connection.');
      }

      const data = await res.json();
      if (!data || !data.member) throw new Error('Invalid profile response from server.');
      currentProfileRecord = data.member;

      const f = data.member.fields || {};
      const firstInput = document.getElementById('prof-first-name');
      const surnameInput = document.getElementById('prof-surname');
      const emailInput = document.getElementById('prof-email');
      const nickInput = document.getElementById('prof-nicknames');
      const singleChk = document.getElementById('prof-single-name-chk');
      const surnameGroup = document.getElementById('prof-surname-group');

      if (firstInput) firstInput.value = f['First Name'] || '';
      if (surnameInput) surnameInput.value = f['Surname'] || '';
      if (emailInput) emailInput.value = f['Email'] || '';
      if (nickInput) nickInput.value = f['AKA / Nicknames'] || '';

      const nameReviewBanner = document.getElementById('profile-name-review-banner');
      const originalNameDisplay = document.getElementById('prof-original-name-display');
      const nameSuggestionNote = document.getElementById('prof-name-suggestion-note');
      const existingFullName = String(f['Name'] || '').trim();
      const nameStatus = f['_nameStatus'] || 'unconfirmed';

      if (nameReviewBanner && originalNameDisplay && nameSuggestionNote) {
        if (existingFullName) {
          originalNameDisplay.textContent = existingFullName;
          if (nameStatus === 'complex') {
            nameSuggestionNote.innerHTML = `<strong>Review multi-part / preferred name:</strong> We derived candidate name components below from your directory record without modifying your full name. Please confirm or adjust your first name, surname, and nicknames as needed.`;
            nameReviewBanner.style.display = 'block';
          } else if (nameStatus === 'suggested') {
            nameSuggestionNote.innerHTML = `We prefilled candidate first name and surname suggestions for your review. Please confirm or adjust them before saving.`;
            nameReviewBanner.style.display = 'block';
          } else {
            nameSuggestionNote.innerHTML = `Confirmed name on file in Google Sheets.`;
            nameReviewBanner.style.display = 'block';
          }
        } else {
          nameReviewBanner.style.display = 'none';
        }
      }

      const isSingle = Boolean(f['First Name'] && !f['Surname'] && f['Name'] && f['Name'] === f['First Name']);
      if (singleChk) singleChk.checked = isSingle;
      if (surnameGroup) surnameGroup.style.display = isSingle ? 'none' : 'block';
      if (surnameInput) surnameInput.required = !isSingle;

      const bdayRaw = String(f['Birthday'] || '').trim();
      profileOriginalBirthday = bdayRaw;
      let bMonth = '';
      let bDay = '';
      let isParseable = false;

      if (bdayRaw) {
        const parsed = parseBirthdayMonthDay(bdayRaw);
        if (parsed) {
          isParseable = true;
          bMonth = String(parsed.month);
          bDay = parsed.day ? String(parsed.day) : '';
        }
      }

      if (bdayRaw && !isParseable) {
        if (noticeEl) {
          noticeEl.innerHTML = `<strong>Existing birthday on file:</strong> "${esc(bdayRaw)}"<br><span class="muted" style="font-size:11px;">Select month/day below to update, click Clear to remove, or leave untouched to preserve existing text verbatim.</span>`;
          noticeEl.style.display = 'block';
        }
      }

      const monthSelect = document.getElementById('prof-bday-month');
      if (monthSelect) monthSelect.value = bMonth;
      populateDayOptions(bMonth ? parseInt(bMonth, 10) : 0, bDay);

      if (loadingEl) loadingEl.style.display = 'none';
      if (contentEl) contentEl.style.display = 'block';
    } catch (err) {
      if (loadingEl) loadingEl.style.display = 'none';
      if (errorEl) errorEl.style.display = 'block';
      if (errorMsg) errorMsg.textContent = err.message || 'Failed to load member profile from Google Sheets.';
    }
  }

  function openProfileDialog(options = {}) {
    if (typeof document === 'undefined') return;
    const isFirstSignIn = Boolean(options.isFirstSignIn);
    profileDialogMode = isFirstSignIn ? 'onboarding' : 'edit';
    const dialog = document.getElementById('profile-onboarding-dialog');
    if (!dialog) return;

    const eyebrow = document.getElementById('profile-dialog-eyebrow');
    const title = document.getElementById('profile-dialog-title');
    const intro = document.getElementById('profile-dialog-intro');
    const closeBtn = document.getElementById('profile-dialog-close-btn');
    const cancelBtn = document.getElementById('profile-cancel-btn');
    const saveBtn = document.getElementById('profile-save-btn');
    const saveErr = document.getElementById('profile-save-error');

    if (saveErr) { saveErr.textContent = ''; saveErr.style.display = 'none'; }

    if (isFirstSignIn) {
      if (eyebrow) eyebrow.textContent = 'Welcome to CPS Academy';
      if (title) title.textContent = 'First Sign-In: Confirm Your Profile';
      if (intro) intro.textContent = 'Welcome! Before entering the Academy Portal, please review and confirm your personal details. This ensures your schedule assignments and directory entry are accurate.';
      if (closeBtn) closeBtn.style.display = 'none';
      if (cancelBtn) cancelBtn.style.display = 'none';
      if (saveBtn) saveBtn.textContent = 'Confirm Details & Enter Portal';
    } else {
      if (eyebrow) eyebrow.textContent = 'Personal Details';
      if (title) title.textContent = 'My Profile';
      if (intro) intro.textContent = 'Review and update your personal details. Changes update your member record in Google Sheets and synchronize across the portal.';
      if (closeBtn) closeBtn.style.display = '';
      if (cancelBtn) cancelBtn.style.display = '';
      if (saveBtn) saveBtn.textContent = 'Save Changes';
    }

    dialog.showModal();
    loadOnlineProfile();
  }

  function initProfileEvents() {
    if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return;
    const bdayMonthSelect = document.getElementById('prof-bday-month');
    if (bdayMonthSelect) {
      bdayMonthSelect.onchange = (e) => {
        profileBirthdayTouched = true;
        profileBirthdayCleared = false;
        const m = parseInt(e.target.value, 10);
        populateDayOptions(m);
      };
    }

    const bdayDaySelect = document.getElementById('prof-bday-day');
    if (bdayDaySelect) {
      bdayDaySelect.onchange = () => {
        profileBirthdayTouched = true;
        profileBirthdayCleared = false;
      };
    }

    const bdayClearBtn = document.getElementById('prof-bday-clear-btn');
    if (bdayClearBtn) {
      bdayClearBtn.onclick = () => {
        profileBirthdayTouched = true;
        profileBirthdayCleared = true;
        const m = document.getElementById('prof-bday-month');
        const d = document.getElementById('prof-bday-day');
        if (m) m.value = '';
        if (d) d.value = '';
        const noticeEl = document.getElementById('prof-bday-raw-notice');
        if (noticeEl) noticeEl.style.display = 'none';
      };
    }

    const singleNameChk = document.getElementById('prof-single-name-chk');
    if (singleNameChk) {
      singleNameChk.onchange = (e) => {
        const isSingle = e.target.checked;
        const surnameGroup = document.getElementById('prof-surname-group');
        const surnameInput = document.getElementById('prof-surname');
        if (surnameGroup) surnameGroup.style.display = isSingle ? 'none' : 'block';
        if (surnameInput) {
          surnameInput.required = !isSingle;
          if (isSingle) surnameInput.value = '';
        }
      };
    }

    const retryFetchBtn = document.getElementById('profile-retry-fetch-btn');
    if (retryFetchBtn) {
      retryFetchBtn.onclick = () => loadOnlineProfile();
    }

    const profileCloseBtn = document.getElementById('profile-dialog-close-btn');
    if (profileCloseBtn) {
      profileCloseBtn.onclick = () => {
        if (profileDialogMode === 'onboarding') return;
        document.getElementById('profile-onboarding-dialog')?.close();
      };
    }

    const profileCancelBtn = document.getElementById('profile-cancel-btn');
    if (profileCancelBtn) {
      profileCancelBtn.onclick = () => {
        if (profileDialogMode === 'onboarding') return;
        document.getElementById('profile-onboarding-dialog')?.close();
      };
    }

    const profileSaveBtn = document.getElementById('profile-save-btn');
    if (profileSaveBtn) {
      profileSaveBtn.onclick = async (e) => {
        if (e) e.preventDefault();
        const firstInput = document.getElementById('prof-first-name');
        const surnameInput = document.getElementById('prof-surname');
        const nickInput = document.getElementById('prof-nicknames');
        const monthSelect = document.getElementById('prof-bday-month');
        const daySelect = document.getElementById('prof-bday-day');
        const singleChk = document.getElementById('prof-single-name-chk');
        const saveErr = document.getElementById('profile-save-error');
        const btn = document.getElementById('profile-save-btn');

        if (saveErr) { saveErr.textContent = ''; saveErr.style.display = 'none'; }

        const firstName = firstInput?.value?.trim() || '';
        const isSingle = Boolean(singleChk?.checked);
        const surname = isSingle ? '' : (surnameInput?.value?.trim() || '');
        const nicknames = nickInput?.value?.trim() || '';

        if (!firstName) {
          if (saveErr) { saveErr.textContent = 'First name is required.'; saveErr.style.display = 'block'; }
          firstInput?.focus();
          return;
        }
        if (!isSingle && !surname) {
          if (saveErr) { saveErr.textContent = 'Surname is required (or check "I have a single legal name").'; saveErr.style.display = 'block'; }
          surnameInput?.focus();
          return;
        }

        let birthday = '';
        const mVal = monthSelect?.value ? parseInt(monthSelect.value, 10) : 0;
        const dVal = daySelect?.value ? parseInt(daySelect.value, 10) : 0;
        if (mVal) {
          const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
          birthday = dVal ? `${monthNames[mVal - 1]} ${dVal}` : monthNames[mVal - 1];
        }

        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('cps_token') : null;
        const isFirstSignIn = profileDialogMode === 'onboarding';

        if (btn) { btn.disabled = true; btn.textContent = 'Saving to Google Sheets...'; }

        try {
          const headers = { 'Content-Type': 'application/json' };
          if (token) headers['Authorization'] = `Bearer ${token}`;

          const originalFields = currentProfileRecord?.fields || {};
          const expectedPreviousValues = {
            'Name': originalFields['Name'] || '',
            'First Name': originalFields['First Name'] || '',
            'Surname': originalFields['Surname'] || '',
            'AKA / Nicknames': originalFields['AKA / Nicknames'] || '',
            'Birthday': originalFields['Birthday'] || ''
          };

          const res = await fetch('/api/profile', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              firstName,
              surname,
              isSingleName: isSingle,
              nicknames,
              birthday,
              birthdayTouched: profileBirthdayTouched,
              birthdayCleared: profileBirthdayCleared,
              originalBirthday: profileOriginalBirthday,
              expectedPreviousValues,
              stableId: currentProfileRecord?.stableId,
              markOnboarded: true
            })
          });

          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || 'Server error while saving profile to Google Sheets.');
          }

          if (typeof Identity !== 'undefined' && typeof Identity.setOnboarded === 'function') {
            Identity.setOnboarded(true, new Date().toISOString());
          }
          if (typeof localStorage !== 'undefined') {
            const updatedName = isSingle || !surname ? firstName : `${firstName} ${surname}`;
            localStorage.setItem('userName', updatedName);
          }

          document.getElementById('profile-onboarding-dialog')?.close();
          if (typeof updateProfileDisplay === 'function') updateProfileDisplay();
          if (typeof enforceAuthGate === 'function') enforceAuthGate();
          if (typeof render === 'function') render();

          if (typeof loadWb === 'function') {
            loadWb().then(freshData => {
              if (typeof hydrateRecordStableIds === 'function') {
                if (typeof db !== 'undefined') db = hydrateRecordStableIds(freshData);
              }
              if (typeof render === 'function') render();
            }).catch(() => {});
          }

          if (typeof toast === 'function') {
            toast(isFirstSignIn ? '✓ Welcome! Profile confirmed and saved to Google Sheets.' : '✓ Profile updated and saved to Google Sheets.');
          }
        } catch (err) {
          if (saveErr) {
            saveErr.textContent = err.message || 'Failed to save changes. Please try again.';
            saveErr.style.display = 'block';
          }
        } finally {
          if (btn) {
            btn.disabled = false;
            btn.textContent = isFirstSignIn ? 'Confirm Details & Enter Portal' : 'Save Changes';
          }
        }
      };
    }

    const navMyProfBtn = document.getElementById('nav-my-profile-btn');
    if (navMyProfBtn) {
      navMyProfBtn.onclick = () => {
        document.getElementById('admin-prefs-dialog')?.close();
        openProfileDialog({ isFirstSignIn: false });
      };
    }

    const authMyProfBtn = document.getElementById('auth-my-profile-btn');
    if (authMyProfBtn) {
      authMyProfBtn.onclick = () => {
        document.getElementById('auth-dialog')?.close();
        openProfileDialog({ isFirstSignIn: false });
      };
    }
  }

  // Auto-init profile events on DOMContentLoaded or immediately if DOM already loaded
  if (typeof document !== 'undefined' && typeof document.getElementById === 'function') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initProfileEvents);
    } else {
      initProfileEvents();
    }
  }

  return {
    MEMBERS_STRUCTURAL_IDS,
    MEMBER_COHORT_DEFS,
    getMemberCohortByRow,
    parseBirthdayMonthDay,
    formatBirthday,
    findMemberInTeams,
    renderMemberDesktopRow,
    renderMemberRow,
    membersView,
    bindMembersEvents,
    getBirthdaysToday,
    renderBirthdaysTodayWidget,
    populateDayOptions,
    loadOnlineProfile,
    openProfileDialog,
    initProfileEvents,
    get memberSortCol() { return memberSortCol; },
    set memberSortCol(v) { memberSortCol = v; },
    get memberSortDir() { return memberSortDir; },
    set memberSortDir(v) { memberSortDir = v; },
    get memberSearchQuery() { return memberSearchQuery; },
    set memberSearchQuery(v) { memberSearchQuery = v; }
  };
});
