const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const KEY='cps-hub-workspace-v2';

// Lightweight Error Ring Buffer & Diagnostics
const MAX_ERROR_LOGS = 10;
const errorRingBuffer = [];
function captureRuntimeError(err) {
  errorRingBuffer.push({
    message: String(err?.message || err || 'Unknown error'),
    source: err?.source || err?.filename || '',
    lineno: err?.lineno || null,
    colno: err?.colno || null,
    time: new Date().toISOString(),
    stack: err?.error?.stack || err?.stack || null
  });
  if (errorRingBuffer.length > MAX_ERROR_LOGS) errorRingBuffer.shift();
}
if (typeof window !== 'undefined') {
  window.onerror = function(message, source, lineno, colno, error) {
    captureRuntimeError({ message, source, lineno, colno, error });
  };
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('unhandledrejection', function(e) {
      captureRuntimeError({ message: 'Unhandled rejection: ' + (e.reason?.message || e.reason), stack: e.reason?.stack });
    });
    window.addEventListener('storage', function(e) {
      if (e.key === KEY && e.newValue) {
        try {
          const next = JSON.parse(e.newValue);
          if (next && next.edits) { workspace = next; render(); }
        } catch {}
      }
    });
    window.addEventListener('beforeunload', function(e) {
      if (typeof isFormDirty === 'function' && isFormDirty() && document.querySelector('#detail-dialog')?.open) {
        e.preventDefault(); e.returnValue = '';
      }
    });
  }
}
function captureDiagnostics() {
  const w = typeof window !== 'undefined' ? (window.innerWidth || document.documentElement?.clientWidth || 0) : 0;
  const h = typeof window !== 'undefined' ? (window.innerHeight || document.documentElement?.clientHeight || 0) : 0;
  const profile = w <= 760 ? 'Mobile' : w <= 1050 ? 'Tablet' : 'Desktop';
  const currentUser = typeof Identity !== 'undefined' ? Identity.getCurrentUser() : null;
  return {
    route: typeof location !== 'undefined' ? (location.hash || '#Home') : '#Home',
    viewport: `${w}x${h} (${profile})`,
    workspaceVersion: KEY,
    timestamp: new Date().toISOString(),
    ...(currentUser ? { user: { id: currentUser.id, name: currentUser.name, isMock: Boolean(currentUser.isMock) } } : {}),
    errorLogs: [...errorRingBuffer]
  };
}

const groups={Sessions:['Morning Report','CPS Academy VMRs','Special VMRs','Student Forum','Residency Programs','Leader of the Week'],People:['Members','OrgStructure','CRC','CRC - retired'],Production:['Podcast Episodes','Schema review'],Research:['Research @CPSolvers','Conferences'],Links:['Important links']};
const descriptions={'Morning Report':'The session team, sign-ups and teaching support in one place.','CPS Academy VMRs':'Explore the Academy’s learning archive. Find a topic, facilitator or recording.','CRC':'Follow presenters, mentoring assignments and case progress.','CRC - retired':'Archived and legacy clinical reasoning case mentorship records.','Members':'Find Academy members, sponsors and social handles.','OrgStructure':'Responsibilities and teams, as recorded in the workbook.','Research @CPSolvers':'Find collaborators by research skills and availability.','Podcast Episodes':'Coordinate ownership and editing. The workbook target is readiness two days before release.','Schema review':'Coordinate video, infographic and review assignments. Friday review → Monday upload.','Important links':'Your recurring Academy resources, ready to open.','Residency Programs':'Partner hospital residency programs, discussants and session facilitators.'};
const titles={'Morning Report':'Date','CPS Academy VMRs':'Session title','Members':'Name','OrgStructure':'Team / responsibility','CRC':'Presenter','CRC - retired':'MENTEE','Research @CPSolvers':'Name','Podcast Episodes':'Episode','Schema review':'Schema','Conferences':'Congress','Important links':'Resource','Leader of the Week':'Member','Special VMRs':'Details','Student Forum':'Topic','Residency Programs':'Residency Programs'};
const facets={'Morning Report':'Type','CPS Academy VMRs':'Facilitator','Members':'Country','CRC':'Status','CRC - retired':"PRESENTER'S COUNTRY",'Research @CPSolvers':'Availability','Schema review':'Status','Podcast Episodes':'Audio editor','OrgStructure':'Role','Special VMRs':'Type','Residency Programs':'Facilitator'};
const tabAliases={'Morning Report':'morning report mr vmr daily session','CPS Academy VMRs':'cps academy vmrs vmr archive session recording learning','CRC':'crc clinical reasoning case presenter mentor','CRC - retired':'crc retired mentorship archive legacy mentee mentor case presentation rounds round','OrgStructure':'orgstructure org structure org chart leadership teams teams & leadership teams and leadership','Members':'members orgstructure org structure directory sponsors country participants core team leaders inactive cohort','Research @CPSolvers':'research cpsolvers collaborators publications skills','Podcast Episodes':'podcast episodes audio editor release','Schema review':'schema review infographic video pipeline','Conferences':'conferences congress scholarship meeting','Important links':'important links resources bookmarks recurring','Leader of the Week':'leader of the week member','Special VMRs':'special vmrs vmr details','Student Forum':'student forum topic expert vmr','Residency Programs':'residency programs partner hospital discussants junior member facilitator allegheny october november december january february'};
const sectionLabels={'OrgStructure':'Teams & leadership'};
function sectionLabel(t){return sectionLabels[t]||t;}
const ORG_GROUPS=[
  {id:'leadership',name:'Internal Leadership & Co-founders',headingId:null,recordIds:['OrgStructure:3','OrgStructure:4']},
  {id:'vmr',name:'VMR',headingId:'OrgStructure:5',recordIds:['OrgStructure:6','OrgStructure:7','OrgStructure:8','OrgStructure:9','OrgStructure:10','OrgStructure:11','OrgStructure:12','OrgStructure:13','OrgStructure:14','OrgStructure:15','OrgStructure:16','OrgStructure:17','OrgStructure:18','OrgStructure:19','OrgStructure:20','OrgStructure:21','OrgStructure:22','OrgStructure:23']},
  {id:'journal',name:'Journal',headingId:'OrgStructure:24',recordIds:['OrgStructure:25','OrgStructure:26','OrgStructure:27','OrgStructure:28','OrgStructure:29','OrgStructure:30','OrgStructure:31']},
  {id:'academy',name:'Academy',headingId:'OrgStructure:32',recordIds:['OrgStructure:33','OrgStructure:34']},
  {id:'podcasts',name:'Podcasts',headingId:'OrgStructure:35',recordIds:['OrgStructure:36','OrgStructure:37','OrgStructure:38','OrgStructure:39','OrgStructure:40','OrgStructure:41','OrgStructure:42','OrgStructure:43']},
  {id:'operations',name:'CPS Operations',headingId:'OrgStructure:44',recordIds:['OrgStructure:45','OrgStructure:46','OrgStructure:47','OrgStructure:48']},
  {id:'website',name:'CPS Website',headingId:'OrgStructure:49',recordIds:['OrgStructure:50','OrgStructure:51']}
];
const ORG_HEADING_IDS=new Set(ORG_GROUPS.map(g=>g.headingId).filter(Boolean));
function getOrgRecordGroup(id){
  for(const g of ORG_GROUPS){
    if(g.headingId===id||g.recordIds.includes(id))return g;
  }
  return null;
}

// ==========================================
// Display Classification Layer (Prompt 2)
// ==========================================
const RECORD_CATEGORY = {
  SOURCE_HEADING: 'source heading',
  NAMED_ENTRY: 'named entry',
  PLACEHOLDER: 'placeholder',
  UNKNOWN: 'unknown'
};

const CRC_RETIRED_ROUNDS = [
  { round: 'Round 1', headingRow: 2, startRow: 3, endRow: 34 },
  { round: 'Round 2', headingRow: 35, startRow: 36, endRow: 53 },
  { round: 'Round 3', headingRow: 54, startRow: 55, endRow: 76 },
  { round: 'Round 4', headingRow: 77, startRow: 78, endRow: 100 },
  { round: 'Round 5', headingRow: 101, startRow: 102, endRow: 124 },
  { round: 'Round 6', headingRow: 125, startRow: 126, endRow: 146 },
  { round: 'Round 7', headingRow: 147, startRow: 148, endRow: 167 },
  { round: 'Round 8', headingRow: 168, startRow: 169, endRow: 189 },
  { round: 'Round 9', headingRow: 190, startRow: 191, endRow: 209 },
  { round: 'Round 10', headingRow: 210, startRow: 211, endRow: 233 },
  { round: 'Round 11', headingRow: 234, startRow: 235, endRow: 265 },
  { round: 'Round 12', headingRow: 266, startRow: 267, endRow: 295 },
  { round: 'Round 13', headingRow: 296, startRow: 297, endRow: 330 },
  { round: 'Round 14', headingRow: 331, startRow: 332, endRow: 367 },
  { round: 'Round 15', headingRow: 368, startRow: 369, endRow: 419 }
];

const MEMBERS_STRUCTURAL_IDS = new Map([
  ['Members:80', { role: 'cohort_heading', label: 'Core team members', cohort: 'Core team' }],
  ['Members:82', { role: 'column_header', label: 'Repeated header (Name / E-mail)', cohort: 'Core team' }],
  ['Members:146', { role: 'cohort_heading', label: 'Leaders', cohort: 'Leaders' }],
  ['Members:148', { role: 'column_header', label: 'Repeated header (Name / E-mail)', cohort: 'Leaders' }],
  ['Members:189', { role: 'cohort_heading', label: 'Members inactive', cohort: 'Marked inactive in source' }],
  ['Members:191', { role: 'column_header', label: 'Repeated header (Name / E-mail)', cohort: 'Marked inactive in source' }]
]);

const RESIDENCY_MONTH_HEADINGS = new Map([
  ['Residency Programs:3', { month: 'October', label: 'OCTOBER' }],
  ['Residency Programs:8', { month: 'November', label: 'NOVEMBER' }],
  ['Residency Programs:13', { month: 'December', label: 'DECEMBER' }],
  ['Residency Programs:17', { month: 'January', label: 'JANUARY' }],
  ['Residency Programs:21', { month: 'February', label: 'FEBRUARY' }]
]);

function getMemberCohortByRow(row) {
  if (row < 80) return 'Participants';
  if (row >= 83 && row < 146) return 'Core team';
  if (row >= 149 && row < 189) return 'Leaders';
  if (row >= 192) return 'Marked inactive in source';
  return 'Members';
}

function classifyRecord(record, t = (record?.tab || (typeof tab !== 'undefined' ? tab : '')), edits = null) {
  if (!record || typeof record !== 'object' || !record.id || !record.fields || typeof record.fields !== 'object') {
    return { category: RECORD_CATEGORY.UNKNOWN, isStructural: false, isSubstantive: false, label: 'Invalid record', reviewNotice: 'Record data is null or invalid' };
  }
  const effectiveTab = t || record.tab || (record.id ? record.id.split(':')[0] : '');
  const activeEdits = edits !== null ? edits : (typeof workspace !== 'undefined' ? workspace?.edits : {});
  const localEdit = activeEdits?.[record.id] || null;
  const rawFields = record.fields || {};
  const fields = localEdit ? { ...rawFields, ...localEdit } : rawFields;
  const hasLocalEdits = Boolean(localEdit && Object.keys(localEdit).length > 0);

  if (effectiveTab === 'Members') {
    if (MEMBERS_STRUCTURAL_IDS.has(record.id)) {
      const meta = MEMBERS_STRUCTURAL_IDS.get(record.id);
      const name = (fields.Name || '').trim();
      const email = (fields.Email || '').trim();
      const isStillHeading = (!name || name === rawFields.Name || name.toLowerCase() === 'name' || name.toLowerCase().includes('core team') || name.toLowerCase().includes('leaders') || name.toLowerCase().includes('members inactive')) && !email;
      if (hasLocalEdits && !isStillHeading) {
        return { category: RECORD_CATEGORY.NAMED_ENTRY, cohort: meta.cohort, role: 'member', label: name, isStructural: false, isSubstantive: true, hasLocalEdits: true, wasHeading: true, reviewNotice: `Locally edited from ${meta.role === 'column_header' ? 'repeated header' : 'source heading'}` };
      }
      return { category: RECORD_CATEGORY.SOURCE_HEADING, cohort: meta.cohort, role: meta.role, label: meta.label, isStructural: true, isSubstantive: false, hasLocalEdits, wasHeading: false, reviewNotice: null };
    }
    const name = (fields.Name || '').trim();
    const cohort = getMemberCohortByRow(record.row);
    if (!name && !fields.Email && !fields.Country && !fields.Sponsor) {
      return { category: RECORD_CATEGORY.PLACEHOLDER, cohort, role: 'empty_row', label: 'Empty member row', isStructural: true, isSubstantive: false, hasLocalEdits, wasPlaceholder: false, reviewNotice: 'All member fields are empty' };
    }
    return { category: RECORD_CATEGORY.NAMED_ENTRY, cohort, role: 'member', label: name || 'Unnamed member', isStructural: false, isSubstantive: true, hasLocalEdits, wasPlaceholder: false, reviewNotice: null };
  }

  if (effectiveTab === 'Residency Programs') {
    if (RESIDENCY_MONTH_HEADINGS.has(record.id)) {
      const meta = RESIDENCY_MONTH_HEADINGS.get(record.id);
      const prog = (fields['Residency Programs'] || '').trim();
      const fac = (fields.Facilitator || '').trim();
      const discussant = (fields['Resident/attending discussant'] || '').trim();
      const junior = (fields['Junior Member'] || '').trim();
      if (hasLocalEdits && (fac || discussant || junior || (prog && prog !== meta.label))) {
        return { category: RECORD_CATEGORY.NAMED_ENTRY, month: meta.month, role: 'session', label: prog || 'Residency Session', isStructural: false, isSubstantive: true, hasLocalEdits: true, wasHeading: true, reviewNotice: 'Locally edited from month heading: now a session' };
      }
      return { category: RECORD_CATEGORY.SOURCE_HEADING, month: meta.month, role: 'month_heading', label: meta.label, isStructural: true, isSubstantive: false, hasLocalEdits, wasHeading: false, reviewNotice: null };
    }
    const prog = (fields['Residency Programs'] || '').trim();
    if (!prog && !fields.Facilitator && !fields['Resident/attending discussant']) {
      return { category: RECORD_CATEGORY.PLACEHOLDER, month: 'October', role: 'empty_session', label: 'Empty session row', isStructural: true, isSubstantive: false, hasLocalEdits, wasPlaceholder: false, reviewNotice: 'All session fields are empty' };
    }
    return { category: RECORD_CATEGORY.NAMED_ENTRY, month: 'October', role: 'session', label: prog || 'Residency Session', isStructural: false, isSubstantive: true, hasLocalEdits, wasPlaceholder: false, reviewNotice: null };
  }

  if (effectiveTab === 'CRC - retired') {
    const roundConfig = CRC_RETIRED_ROUNDS.find(cfg => record.row === cfg.headingRow || (record.row >= cfg.startRow && record.row <= cfg.endRow));
    const roundName = roundConfig ? roundConfig.round : 'Round';
    if (roundConfig && record.row === roundConfig.headingRow) {
      const mentee = (fields.MENTEE || '').trim();
      if (hasLocalEdits && mentee && !mentee.toUpperCase().startsWith('ROUND')) {
        return { category: RECORD_CATEGORY.NAMED_ENTRY, round: roundName, role: 'mentorship_case', label: mentee, isStructural: false, isSubstantive: true, hasLocalEdits: true, wasHeading: true, reviewNotice: 'Locally edited from round heading: now a mentorship case' };
      }
      return { category: RECORD_CATEGORY.SOURCE_HEADING, round: roundName, role: 'round_heading', label: fields.MENTEE || roundName.toUpperCase(), isStructural: true, isSubstantive: false, hasLocalEdits, wasHeading: false, reviewNotice: null };
    }
    const mentee = (fields.MENTEE || '').trim();
    const mentor = (fields['CPSOLVERS MENTOR'] || '').trim();
    const contact = (fields['CONTACT INFO'] || '').trim();
    const datePres = (fields['DATE OF PRESENTATION'] || '').trim();
    const country = (fields["PRESENTER'S COUNTRY"] || '').trim();
    const issues = (fields['ISSUES/CONCERNS'] || '').trim();
    const hasSubstantiveCase = Boolean(mentee || mentor || contact || datePres || country || issues);
    const isBaselinePlaceholder = record.id === 'CRC - retired:418' || record.id === 'CRC - retired:419';
    if (!hasSubstantiveCase) {
      return { category: RECORD_CATEGORY.PLACEHOLDER, round: roundName, role: 'template_placeholder', label: 'Empty template row', isStructural: true, isSubstantive: false, hasLocalEdits, wasPlaceholder: false, reviewNotice: null };
    }
    if (isBaselinePlaceholder && hasSubstantiveCase) {
      return { category: RECORD_CATEGORY.NAMED_ENTRY, round: roundName, role: 'mentorship_case', label: mentee || 'Mentorship case', isStructural: false, isSubstantive: true, hasLocalEdits: true, wasPlaceholder: true, reviewNotice: 'Locally edited from placeholder: now a mentorship case' };
    }
    return { category: RECORD_CATEGORY.NAMED_ENTRY, round: roundName, role: 'mentorship_case', label: mentee || 'Mentorship case', isStructural: false, isSubstantive: true, hasLocalEdits, wasPlaceholder: false, reviewNotice: null };
  }

  if (effectiveTab === 'OrgStructure') {
    const isHeading = ORG_HEADING_IDS.has(record.id);
    const parentGroup = getOrgRecordGroup(record.id);
    const groupName = parentGroup ? parentGroup.name : 'Teams & leadership';
    if (isHeading) {
      const resp = (fields['Team / responsibility'] || '').trim();
      const mems = (fields.Members || '').trim();
      const role = (fields.Role || '').trim();
      if (hasLocalEdits && (mems || role)) {
        return { category: RECORD_CATEGORY.NAMED_ENTRY, group: groupName, role: role || 'responsibility', label: resp || groupName, isStructural: false, isSubstantive: true, hasLocalEdits: true, wasHeading: true, reviewNotice: 'Locally edited from group heading' };
      }
      return { category: RECORD_CATEGORY.SOURCE_HEADING, group: groupName, role: 'group_heading', label: resp || groupName, isStructural: true, isSubstantive: false, hasLocalEdits, wasHeading: false, reviewNotice: null };
    }
    return { category: RECORD_CATEGORY.NAMED_ENTRY, group: groupName, role: fields.Role || 'responsibility', label: fields['Team / responsibility'] || 'Responsibility', isStructural: false, isSubstantive: true, hasLocalEdits, wasHeading: false, reviewNotice: null };
  }

  const allFieldVals = Object.values(fields).map(v => String(v ?? '').trim()).filter(Boolean);
  if (allFieldVals.length === 0) {
    return { category: RECORD_CATEGORY.PLACEHOLDER, role: 'empty_record', label: 'Empty record', isStructural: true, isSubstantive: false, hasLocalEdits, wasPlaceholder: false, reviewNotice: 'All fields are empty' };
  }
  if (!record.id || !record.fields) {
    return { category: RECORD_CATEGORY.UNKNOWN, role: 'unknown', label: 'Unknown format', isStructural: false, isSubstantive: false, hasLocalEdits, wasPlaceholder: false, reviewNotice: 'Record missing required ID or fields structure' };
  }
  return { category: RECORD_CATEGORY.NAMED_ENTRY, role: 'standard', label: title(record, effectiveTab), isStructural: false, isSubstantive: true, hasLocalEdits, wasPlaceholder: false, reviewNotice: null };
}

function getRecordClassification(record, t = tab) {
  return classifyRecord(record, t);
}

function getClassificationCounts(recordList, t = tab) {
  let namedEntries = 0, sourceHeadings = 0, placeholders = 0, unknowns = 0;
  const cohortCounts = {};
  const monthCounts = {};
  const roundCounts = {};
  for (const r of recordList) {
    const c = classifyRecord(r, t);
    if (c.category === RECORD_CATEGORY.NAMED_ENTRY) {
      namedEntries++;
      if (c.cohort) cohortCounts[c.cohort] = (cohortCounts[c.cohort] || 0) + 1;
      if (c.month) monthCounts[c.month] = (monthCounts[c.month] || 0) + 1;
      if (c.round) roundCounts[c.round] = (roundCounts[c.round] || 0) + 1;
    } else if (c.category === RECORD_CATEGORY.SOURCE_HEADING) {
      sourceHeadings++;
    } else if (c.category === RECORD_CATEGORY.PLACEHOLDER) {
      placeholders++;
    } else {
      unknowns++;
    }
  }
  return { total: recordList.length, namedEntries, sourceHeadings, placeholders, unknowns, cohortCounts, monthCounts, roundCounts };
}

function formatResultsCount(filteredList, t, allList) {
  const totalCounts = getClassificationCounts(allList, t);
  const isFiltered = filteredList.length !== allList.length;
  const filteredCounts = isFiltered ? getClassificationCounts(filteredList, t) : totalCounts;
  if (t === 'Members') {
    if (isFiltered) {
      return `Showing ${filteredCounts.namedEntries} named rows (${filteredCounts.sourceHeadings} structural entries) · ${totalCounts.namedEntries} named member rows (4 cohorts) · ${totalCounts.sourceHeadings} structural entries · ${totalCounts.total} total records`;
    }
    return `${totalCounts.namedEntries} named member rows (4 cohorts) · ${totalCounts.sourceHeadings} structural entries (headings & repeated headers) · ${totalCounts.total} total records`;
  }
  if (t === 'Residency Programs') {
    if (isFiltered) {
      return `Showing ${filteredCounts.namedEntries} session (${filteredCounts.sourceHeadings} month labels) · ${totalCounts.namedEntries} session · ${totalCounts.sourceHeadings} month labels · ${totalCounts.total} total records`;
    }
    return `${totalCounts.namedEntries} session · ${totalCounts.sourceHeadings} month labels · ${totalCounts.total} total records`;
  }
  if (t === 'CRC - retired') {
    if (isFiltered) {
      return `Showing ${filteredCounts.namedEntries} cases (${filteredCounts.sourceHeadings} round headings, ${filteredCounts.placeholders} placeholders) · ${totalCounts.namedEntries} cases · ${totalCounts.sourceHeadings} round headings · ${totalCounts.placeholders} placeholders · ${totalCounts.total} total records`;
    }
    return `${totalCounts.namedEntries} cases · ${totalCounts.sourceHeadings} round headings · ${totalCounts.placeholders} placeholders · ${totalCounts.total} total records`;
  }
  return `${filteredList.length} matches · ${allList.length} records`;
}

const recordSearchCache = new Map();
function invalidateAppCaches(affectedId = null) {
  if (typeof SessionCore !== 'undefined') {
    if (affectedId && SessionCore.invalidateRecord) SessionCore.invalidateRecord(affectedId);
    else if (SessionCore.clearCaches) SessionCore.clearCaches();
  }
  if (typeof SearchCore !== 'undefined') {
    if (affectedId && SearchCore.invalidateSearchRecord) SearchCore.invalidateSearchRecord(affectedId);
    else if (SearchCore.clearSearchCache) SearchCore.clearSearchCache();
  }
  if (affectedId) {
    for (const key of recordSearchCache.keys()) {
      if (key.startsWith(`${affectedId}::`)) recordSearchCache.delete(key);
    }
  } else {
    recordSearchCache.clear();
  }
}
function buildSearchIndex(r,t){
  const c = typeof getRecordClassification === 'function' ? getRecordClassification(r, t) : null;
  const meta = c ? [c.category, c.cohort, c.month, c.round, c.role, c.label].filter(Boolean).join(' ') : '';
  return `${t} ${r.source||''} ${tabAliases[t]||''} ${meta} ${Object.values(r.fields).join(' ')}`.toLowerCase();
}
function recordSearchText(r,t){
  if(r._search && !workspace.edits[r.id]) return r._search;
  const editSig = JSON.stringify(workspace.edits[r.id] || {});
  const cacheKey = `${r.id}::${t}::${editSig}`;
  if(recordSearchCache.has(cacheKey)) return recordSearchCache.get(cacheKey);
  const text = `${buildSearchIndex(r,t)} ${Object.values(r.fields).join(' ').toLowerCase()}`;
  if(recordSearchCache.size > 2000) recordSearchCache.delete(recordSearchCache.keys().next().value);
  recordSearchCache.set(cacheKey, text);
  return text;
}
function searchMatches(r,t,terms){const txt=recordSearchText(r,t);return terms.every(term=>txt.includes(term))}
let skill='',dateFrom='',dateTo='',owner='',showAll=false,sessionType='',sessionFacilitator='',gapsOnly=false,sectionQuery='';
let db={},tab='Home',query='',searchPage=0,filter='All',facet='',sort='source',page=0,mode='cards',selected=null,editingTab='',quickClaimRecord=null,quickClaimRole='',issueFilter='All',issueSectionFilter='',workspace={edits:{},added:[],favorites:[],history:[],recent:[],issues:[],isAdmin:false,role:'VMR Leadership'},storageIssue=false;
let initialFormValues={};
let reviewedSessionFields=new Set();
function changedFields(fields,initial,confirmed=[]){
 const approved=new Set(confirmed);
 return Object.fromEntries(Object.entries(fields).filter(([key,value])=>String(value)!==String(initial[key]??'')||approved.has(key)));
}
try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');if(saved&&saved.edits&&Array.isArray(saved.added)&&Array.isArray(saved.favorites)&&Array.isArray(saved.history)){workspace=saved;if(!Array.isArray(workspace.recent))workspace.recent=[];if(!Array.isArray(workspace.issues))workspace.issues=[];if(typeof workspace.isAdmin==='undefined')workspace.isAdmin=false;if(!workspace.role)workspace.role=workspace.isAdmin?'Super admin':'VMR Leadership';}else{workspace.edits=JSON.parse(localStorage.getItem('cps-workbook-edits-v1')||'{}')||{};workspace.issues=[];workspace.isAdmin=false;workspace.role='VMR Leadership';}}catch{storageIssue=true}
function toast(message,options){const t=$('#toast');if(!t)return;t.innerHTML=`<span>${esc(message)}</span>`+(options?.undo?`<button type="button" class="toast-undo-btn" id="toast-undo-action">Undo</button>`:'');t.classList.add('show');clearTimeout(toast.timer);if(options?.undo){const u=t.querySelector('#toast-undo-action');if(u)u.onclick=()=>undoClaim();}toast.timer=setTimeout(()=>t.classList.remove('show'),options?.undo?6000:3500)}
function save(next){try{localStorage.setItem(KEY,JSON.stringify(next));workspace=next;return true}catch{toast('Could not save. Export a backup before closing this browser.');return false}}
function mutate(fn, affectedId = null){const next=structuredClone(workspace);fn(next);if(typeof invalidateAppCaches==='function')invalidateAppCaches(affectedId);return save(next)}
function sessionRecords(base,t,edits=workspace.edits){
 const children=t==='Morning Report'?SessionCore.splitMorningReport(base):[{...base,fields:{...base.fields}}];
 const parentEdits=edits[base.id]||{};
 return children.map((child,index)=>{
  const fields={...child.fields},pending={};
  for(const [key,value] of Object.entries(parentEdits)){
   if(children.length===1)fields[key]=value;
   else if(String(value)===String(base.fields[key]??''))continue;
   else{
    const parts=SessionCore.splitField(value);
    if(parts.length===children.length)fields[key]=parts[index];
    else pending[key]=value;
   }
  }
  const childEdits=child.id!==base.id?edits[child.id]||{}:{};
  Object.assign(fields,childEdits);
  for(const key of Object.keys(childEdits))delete pending[key];
  const flags=[...(child.flags||[])];
  if(Object.keys(pending).length)flags.push('Earlier row-level edits need review for this session; they remain in your backup.');
  return {...child,fields,flags,_search:undefined,...(child.session?{session:{...child.session,unresolved:(child.session.unresolved||[]).filter(message=>!Object.keys(childEdits).some(key=>message.startsWith(key+':'))),legacyOverrides:pending}}:{})};
 });
}
function records(t=tab){return [...(db[t]?.records||[]),...workspace.added.filter(r=>r.tab===t)].flatMap(r=>sessionRecords(r,t))}
function originalRecord(id,t){const bases=[...(db[t]?.records||[]),...workspace.added.filter(r=>r.tab===t)];return bases.find(r=>r.id===id)||bases.flatMap(r=>sessionRecords(r,t,{})).find(r=>r.id===id)}
function removeLocalRecord(w,r){
 if(r.session?.count>1&&r.id.startsWith('local:')){
  const parent=r.session.parentId;
  w.added=w.added.filter(a=>a.id!==parent);
  for(const id of Object.keys(w.edits))if(id===parent||id.startsWith(parent+'::session:'))delete w.edits[id];
  w.favorites=w.favorites.filter(id=>id!==parent&&!id.startsWith(parent+'::session:'));
 }else{delete w.edits[r.id];if(r.id.startsWith('local:')){w.added=w.added.filter(a=>a.id!==r.id);w.favorites=w.favorites.filter(id=>id!==r.id)}}
}
function calendarButton(r,t,options={}){
 if(!['Morning Report','CPS Academy VMRs','Special VMRs','Student Forum','Residency Programs'].includes(t))return '';
 const c = typeof getRecordClassification === 'function' ? getRecordClassification(r, t) : null;
 if (c && (c.category === RECORD_CATEGORY.SOURCE_HEADING || c.category === RECORD_CATEGORY.PLACEHOLDER)) return '';
 const pendingTime=Object.keys(r.session?.legacyOverrides||{}).some(k=>/Date|time/i.test(k));
 const timing=pendingTime?{status:'unresolved',reason:'review earlier row-level date/time edits first'}:SessionCore.parseSessionTime(r);
 if(timing.status!=='resolved')return `<span class="calendar-status muted" title="${esc(timing.reason||'confirm date and time')}">Calendar unavailable: ${esc(timing.reason||'confirm the source date and time')}</span>`;
 const assumedText = timing.durationAssumed ? ' (60m duration assumed)' : '';
 if(options.compact)return `<span class="calendar-control compact"><button type="button" class="icon-button calendar-icon-btn" data-calendar="${esc(r.id)}" data-area="${esc(t)}" title="Download .ics calendar event${assumedText}" aria-label="Add to calendar${assumedText}">📅</button>${timing.durationAssumed ? '<small class="calendar-assumed-badge" title="60m duration assumed">60m*</small>' : ''}</span>`;
 return `<span class="calendar-control"><button type="button" class="button secondary small" data-calendar="${esc(r.id)}" data-area="${esc(t)}" title="Download .ics calendar event${assumedText}" aria-label="Add to calendar${assumedText}">Add to calendar</button>${timing.durationAssumed ? '<small class="muted">60m duration assumed</small>' : ''}</span>`;
}
function sessionNotice(r){
 if(!r.session)return '';
 const issues=[...(r.session.unresolved||[])],legacy=Object.entries(r.session.legacyOverrides||{});
 return `${r.session.count>1?`<span class="tag">Session ${r.session.index} of ${r.session.count}</span>`:''}${issues.length||legacy.length?`<details class="session-review"><summary>Review session source details</summary>${issues.map(x=>`<p>${esc(x)}</p>`).join('')}${legacy.length?'<p>Earlier row edits are preserved below. Assign each value to the correct session using its form.</p>'+legacy.map(([k,v])=>`<p><strong>${esc(k)}:</strong> ${esc(v)}</p>`).join(''):''}</details>`:''}`;
}
function downloadCalendar(id,t){
 const r=records(t).find(x=>x.id===id);if(!r)return toast('Session no longer available.');
 try{
  if(Object.keys(r.session?.legacyOverrides||{}).some(k=>/Date|time/i.test(k)))throw Error('Review earlier row-level date/time edits first.');
  const payload=SessionCore.createCalendar(r,{title:title(r,t)});
  const blob=new Blob([payload],{type:'text/calendar;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='cps-session-'+id.replace(/[^a-z0-9_-]/gi,'-')+'.ics';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast('Calendar file downloaded. Open it in your calendar app.');
 }catch(error){toast('Calendar unavailable: '+error.message)}
}
function sessionReviewControls(r){
 const keys=[...new Set([...Object.keys(r.session?.legacyOverrides||{}),...Object.keys(r.session?.unassignedFields||{})])].filter(key=>!Object.hasOwn(workspace.edits[r.id]||{},key));
 return keys.length?`<div class="session-review"><p>Review the earlier values above and each field below. Editing a field confirms that value for this session. To keep its displayed value, use its confirmation button and then save.</p>${keys.map(key=>`<button type="button" class="button secondary small" data-confirm-session-field="${esc(key)}">Use displayed ${esc(key)} for this session</button>`).join('')}</div>`:'';
}
function bindCalendarButtons(scope=document){scope.querySelectorAll('[data-calendar]').forEach(b=>b.onclick=()=>downloadCalendar(b.dataset.calendar,b.dataset.area))}
function title(r,t=tab){return r.fields[titles[t]]||r.fields.Topic||r.fields.Type||'Untitled record'}
function source(r){const base=r.row?`${r.source} · row ${r.row}`:'Created in this browser';return base+(r.session?.count>1?` · session ${r.session.index}/${r.session.count}`:'')}
function dateValue(r){return r.fields.Date||r.fields['Date / time (source)']||r.fields['Release date']||r.fields.Start||r.fields['VMR date']||r.fields['DATE OF PRESENTATION']||''}
const iso=v=>/^\d{4}-\d{2}-\d{2}$/.test(v);
const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Los_Angeles'});
function urls(r,key){return [...new Set([r.links?.[key],...(String(r.fields[key]||'').match(/https?:\/\/[^\s<>]+/g)||[])].filter(u=>u&&/^https?:\/\//i.test(u)))]}
function anchor(url,label){return `<a class="button secondary small" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`}
function chip(s,kind=''){return `<span class="tag ${kind}">${esc(s)}</span>`}
function isAdmin(){return Boolean(workspace.isAdmin||workspace.role==='Super admin'||workspace.role==='admin'||workspace.profile==='@admin')}
function updateProfileDisplay(){
  const r=$('#profile-role');
  if(r)r.textContent=isAdmin()?'Super admin (@admin)':'VMR Leadership';
  const t=$('#admin-toggle');
  if(t)t.checked=isAdmin();
  const user=typeof Identity!=='undefined'?Identity.getCurrentUser():null;
  const pName=$('#profile-name'),pAvatar=$('#profile-avatar'),badge=$('#profile-identity-badge'),statusEl=$('#mock-profile-status');
  if(user){
    if(pName)pName.textContent=user.name;
    if(pAvatar){const parts=user.name.split(' ').map(s=>s[0]).join('').slice(0,2).toUpperCase();pAvatar.textContent=parts||'ZG';}
    if(badge){badge.style.display='inline-block';badge.textContent='Local test profile';}
    if(statusEl)statusEl.textContent=`Active: ${user.name} (Local test profile)`;
  }else{
    if(pName)pName.textContent='Signed Out';
    if(pAvatar)pAvatar.textContent='--';
    if(badge)badge.style.display='none';
    if(statusEl)statusEl.textContent='No local profile selected (Signed out).';
  }
}
function setAdminMode(active){mutate(w=>{w.isAdmin=Boolean(active);w.role=active?'Super admin':'VMR Leadership'});updateProfileDisplay();if(!isAdmin()&&(tab==='admin/issues'||tab==='Admin Issues'))navigate('Home');else render();toast(isAdmin()?'Super admin mode enabled':'Switched to standard member profile')}
async function dispatchIssueReport(issueData){const WEBHOOK_URL='';if(WEBHOOK_URL){try{await fetch(WEBHOOK_URL,{method:'POST',mode:'no-cors',headers:{'Content-Type':'application/json'},body:JSON.stringify(issueData)})}catch(e){console.warn('Webhook dispatch error:',e)}}}
function navigate(t){
  if(t!==tab)scheduleFiltersOpen=false;
  const dialog=$('#detail-dialog');
  if(dialog?.open){
    if(typeof confirmDiscard==='function'&&!confirmDiscard())return;
    dialog.close();
  }
  if(t==='admin/issues'||t==='/admin/issues'||t==='Issue Reports'){
    if(!isAdmin()){toast('Admin access required.');navigate('Home');return}
    tab='admin/issues';query='';searchPage=0;filter='All';page=0;$('#global-search').value='';location.hash='/admin/issues';render();window.scrollTo(0,0);return;
  }
  if(t==='profile/logbook'||t==='/profile/logbook'||t==='#/profile/logbook'){
    tab='profile/logbook';query='';searchPage=0;filter='All';page=0;$('#global-search').value='';location.hash='/profile/logbook';render();window.scrollTo(0,0);return;
  }
  tab=t;query='';searchPage=0;filter=t==='Morning Report'?'Upcoming':'All';owner='';facet='';sessionType='';sessionFacilitator='';gapsOnly=false;sectionQuery='';skill='';dateFrom='';dateTo='';sort=t==='CPS Academy VMRs'?'date':'source';page=0;if(t==='Morning Report')mode=(typeof window!=='undefined'&&window.innerWidth<=760)?'agenda':'matrix';else if(['Podcast Episodes','Schema review'].includes(t))mode=mode==='cards'||mode==='table'?mode:'board';else if(mode==='agenda'||mode==='matrix'||mode==='board')mode='cards';$('#global-search').value='';location.hash=encodeURIComponent(t);render();window.scrollTo(0,0)
}
function nav(){
  const entries=['Home',...Object.keys(groups),'Workspace',...(isAdmin()?['Issue Reports']:[])];
  const current=tab==='admin/issues'?'Issue Reports':tab==='profile/logbook'?'':(Object.keys(groups).find(g=>groups[g].includes(tab))||tab);
  $('#desktop-nav').innerHTML=entries.map(g=>`<button class="nav-button ${current===g?'active':''}" data-nav="${g}">${g}${g==='Issue Reports'&&workspace.issues.filter(i=>i.status==='Open').length?` <span class="nav-badge">${workspace.issues.filter(i=>i.status==='Open').length}</span>`:''}</button>`).join('');
  const primary=['Home','Sessions','People','Links'];
  $('#mobile-nav').innerHTML=primary.map(g=>`<button class="nav-button ${current===g?'active':''}" ${current===g?'aria-current="page"':''} data-nav="${g}">${g}</button>`).join('')+`<button class="nav-button ${!primary.includes(current)?'active':''}" id="more-navigation" aria-haspopup="dialog">More</button>`;
  $('#all-sections').innerHTML=entries.map(g=>`<button type="button" class="button ${current===g?'primary':'secondary'}" data-nav="${g}" ${current===g?'aria-current="page"':''}>${g}</button>`).join('')+`<button type="button" class="button secondary" data-nav="profile/logbook">My logbook</button>`;
  $('#more-navigation').onclick=()=>$('#navigation-dialog').showModal();
  document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>{$('#navigation-dialog')?.close();if(b.dataset.nav==='Issue Reports')navigate('admin/issues');else navigate(groups[b.dataset.nav]?.[0]||b.dataset.nav)});
  $('#new-item-button').textContent=tab==='Home'||tab==='Workspace'||tab==='admin/issues'||tab==='profile/logbook'?'+ New session':'+ Add record';
}
function header(t,sub){return `<div class="page-heading"><div><p class="eyebrow">CPS Academy · private workspace</p><h1>${esc(t)}</h1><p>${esc(sub)}</p></div></div>`}
function banner(){return `<div class="mobile-snapshot">Workbook snapshot · saved on this device <button class="text-button" data-go="Workspace">Backups &amp; status</button></div>`+`<div class="snapshot-note"><span class="snapshot-dot"></span><span>Workbook snapshot (2026-09-06) · local changes saved on this device · no live Sheets connection · <button class="text-button" data-go="Workspace">Backups & activity</button></span></div>`}
function actionButtons(r,t){return `${calendarButton(r,t)}<button class="button primary small" data-open="${esc(r.id)}" data-area="${esc(t)}">${t==='Morning Report'?'Staff session':'Open details'}</button><button class="icon-button star ${workspace.favorites.includes(r.id)?'is-starred':''}" aria-label="${workspace.favorites.includes(r.id)?'Unpin':'Pin'} record" data-star="${esc(r.id)}">${workspace.favorites.includes(r.id)?'★':'☆'}</button>`}
function card(r,t=tab,inSearch=false){const f=r.fields;let body='',tag='';
 const c = typeof getRecordClassification === 'function' ? getRecordClassification(r, t) : null;
 if(t==='Morning Report'){tag=f.Type||'Morning Report';body=`<p class="muted">${esc(SessionCore.formatSessionTime(r))}</p>${staffingGrid(r)}`}
 else if(t==='CPS Academy VMRs'){tag=f.Topic||'Academy learning';body=`<p>${esc(f.Facilitator||'Facilitator not entered')}</p><p class="muted">${esc(SessionCore.formatSessionTime(r))}</p><div class="card-links">${urls(r,'Recording').map(u=>anchor(u,'Watch recording')).join('')}${urls(r,'Bonus learning').map(u=>anchor(u,'Bonus learning')).join('')}</div>`}
 else if(t==='Members'){
  if(c && c.category === RECORD_CATEGORY.SOURCE_HEADING){
    tag = c.role === 'column_header' ? 'Repeated header' : 'Source heading';
    body = `<p class="card-line"><small>Structural entry</small><strong>${esc(c.label || 'Workbook heading')}</strong></p>` +
           `<p class="muted" style="font-size:12px;">Workbook section separator or column header. Not an individual member.</p>`;
  } else {
    const cohortName = c?.cohort || 'Members';
    tag = cohortName;
    body = `<p class="card-line"><small>Cohort</small><span>${esc(cohortName)}</span></p>` +
           (cohortName === 'Marked inactive in source' ? `<p class="muted" style="font-size:11px;">Historical context: marked inactive in source workbook tab.</p>` : '') +
           `<p>${esc(f.Subspecialty||f.Location||'Academy member')}</p>` +
           `<p class="muted">Sponsor: ${esc(f.Sponsor||'Not entered')}</p><p>${esc(f['Social handles']||'No social handle entered')}</p>`;
  }
 }
 else if(t==='OrgStructure'){
  const parentGroup=getOrgRecordGroup(r.id);
  const isHeading=ORG_HEADING_IDS.has(r.id);
  const groupName=parentGroup?parentGroup.name:'Teams & leadership';
  tag=isHeading?`Group: ${groupName}`:(f.Role?`${groupName} · ${f.Role}`:groupName);
  body=`<p class="card-line"><small>Group</small><strong>${esc(groupName)}</strong></p>`+
       `<p class="card-line"><small>Members</small><span style="white-space:pre-line;">${esc(f.Members||(isHeading?'Group heading record':'Not entered'))}</span></p>`+
       (f.Role?`<p class="card-line"><small>Role</small><span style="white-space:pre-line;">${esc(f.Role)}</span></p>`:'');
 }
 else if(t==='Research @CPSolvers'){tag=f.Availability||'Availability not entered';body=`<div class="person-meta">${['Research writing','Data analytics','Cross-sectional studies','Systematic reviews','Qualitative studies','Case reports'].filter(k=>f[k]==='Yes').map(k=>chip(k)).join('')||'No skills entered'}</div>`}
 else if(t==='Important links'){tag='Academy resource';body=`<div class="card-links">${urls(r,'Link').map(u=>anchor(u,'Open resource')).join('')||'<p class="muted">No usable link in source. Open details to add one.</p>'}</div>`}
 else if(t==='Residency Programs'){
  if(c && c.category === RECORD_CATEGORY.SOURCE_HEADING){
    tag = `Month label · ${c.month || 'Source heading'}`;
    body = `<p class="card-line"><small>Month heading</small><strong>${esc(c.label || f['Residency Programs'] || 'Month')}</strong></p>` +
           `<p class="muted" style="font-size:12px;">Month heading from workbook source. No session scheduled under this header in snapshot.</p>`;
  } else {
    tag = `Session · ${c?.month || 'Scheduled'}`;
    body = `<div class="assignments"><div><small>Resident / Attending Discussant</small><strong>${esc(f['Resident/attending discussant']||'Not entered')}</strong></div><div><small>Junior Member</small><strong>${esc(f['Junior Member']||'Not entered')}</strong></div></div>${f.Facilitator?`<p class="card-line"><small>Facilitator</small><span>${esc(f.Facilitator)}</span></p>`:''}`;
  }
 }
 else if(t==='CRC - retired'){
  if(c && c.category === RECORD_CATEGORY.SOURCE_HEADING){
    tag = `Round heading · ${c.round || 'Boundary'}`;
    body = `<p class="card-line"><small>Round boundary</small><strong>${esc(c.label || f.MENTEE || 'Round')}</strong></p>` +
           `<p class="muted" style="font-size:12px;">Source section boundary for ${esc(c.round || 'mentorship round')}.</p>`;
  } else if(c && c.category === RECORD_CATEGORY.PLACEHOLDER){
    tag = `Placeholder · ${c.round || 'Template'}`;
    body = `<p class="card-line"><small>Template placeholder</small><span>Empty template row</span></p>` +
           `<p class="muted" style="font-size:12px;">Checkbox-only template row in source workbook.</p>`;
  } else {
    tag = `${c?.round || 'Legacy Round'} · ${f["PRESENTER'S COUNTRY"]||'Legacy Mentee'}`;
    body = `<p><strong>Mentor:</strong> ${esc(f['CPSOLVERS MENTOR']||'Unassigned')}</p><p class="muted">${f['DATE OF PRESENTATION']?`Presented: ${esc(f['DATE OF PRESENTATION'])}`:''}${f['CONTACT INFO']?` · ${esc(f['CONTACT INFO'])}`:''}</p><div class="record-markers">${f['CASE COMPLETE?']==='1'?chip('Case complete','ready-chip'):''}${f['PRESENTED?']==='1'?chip('Presented','ready-chip'):''}</div>`;
  }
 }
 else{tag=f.Status||f.Role||f.Type||t;const fields=db[t].columns.filter(c=>c!==titles[t]&&!/email|contact|link|meeting|remarks/i.test(c)).slice(0,3);body=fields.map(k=>`<p class="card-line"><small>${esc(k)}</small><span>${esc(f[k]||'Not entered')}</span></p>`).join('')}

 let localMarker = '';
 if(c && c.wasPlaceholder) {
   localMarker = chip('Locally edited from placeholder', 'local-chip');
 } else if(c && c.wasHeading) {
   localMarker = chip('Locally edited from heading', 'local-chip');
 } else if(workspace.edits[r.id]) {
   localMarker = chip('Local changes', 'local-chip');
 }
 const unknownMarker = (c && c.category === RECORD_CATEGORY.UNKNOWN) ? chip('Unknown format (needs review)', 'review-chip') : '';

 return `<article class="hub-card">${inSearch&&tag!==sectionLabel(t)?chip(sectionLabel(t)):''}${chip(tag)}<h2>${esc(title(r,t))}</h2>${body}${inSearch?`<div class="search-snippets" data-snippet-target="${esc(r.id)}"></div>`:''}${sessionNotice(r)}<div class="record-markers">${r.flags.length?chip('Verify source details','review-chip'):''}${localMarker}${unknownMarker}</div><footer><div class="card-actions">${actionButtons(r,t)}</div><small class="muted">${esc(source(r))}</small></footer></article>`}
function currentLeader(){const list=records('Leader of the Week');const now=today();for(const r of list){const raw=r.fields.Dates||'';const m=raw.match(/^(\d{1,2})\s*\/\s*(\d{1,2})\s*-\s*(\d{1,2})\s*\/\s*(\d{1,2})$/);if(m){const sm=m[1].padStart(2,'0'),sd=m[2].padStart(2,'0'),em=m[3].padStart(2,'0'),ed=m[4].padStart(2,'0');const curYear=new Date().getFullYear();const sYear=sm==='12'&&em==='01'?String(curYear-1):String(curYear),eYear=String(curYear);const start=`${sYear}-${sm}-${sd}`,end=`${eYear}-${em}-${ed}`;if(now>=start&&now<=end)return r;}const isoM=raw.match(/^(\d{4}-\d{2}-\d{2})\s*(?:-|to)\s*(\d{4}-\d{2}-\d{2})$/);if(isoM&&now>=isoM[1]&&now<=isoM[2])return r;}return null;}
function sessionCountdown(isoDate){const d1=new Date(today()+'T00:00:00Z'),d2=new Date(isoDate+'T00:00:00Z');const diff=Math.round((d2-d1)/86400000);if(diff===0)return'Today';if(diff===1)return'Tomorrow';if(diff>1)return`In ${diff} days`;return'Concluded';}
function backupAgeText(){if(!workspace.lastBackup)return'Never downloaded';const diffHours=Math.floor((Date.now()-new Date(workspace.lastBackup).getTime())/3600000);if(diffHours<1)return'< 1h ago';if(diffHours<24)return`${diffHours}h ago`;return`${Math.floor(diffHours/24)}d ago`;}

function sessionZoomUrl(r) {
  if (!r) return '';
  const fields = r.fields || {};
  const links = [...new Set([...Object.values(fields), ...Object.values(r.links || {})].flatMap(v => String(v ?? '').match(/https?:\/\/[^\s<>"\u0000-\u001f]+/g) || []))];
  const meeting = links.find(link => {
    try {
      if (typeof URL !== 'undefined') {
        const u = new URL(link);
        return /(^|\.)(zoom\.us|zoomgov\.com)$/i.test(u.hostname);
      }
    } catch {}
    return /https?:\/\/(?:[a-zA-Z0-9-]+\.)*(zoom\.us|zoomgov\.com)(\/|$)/i.test(link);
  });
  return meeting || '';
}

function getUserAliases(userProfile, options = {}) {
  if (!userProfile) return new Set();
  const names = new Set();
  const add = s => {
    if (!s) return;
    const clean = String(s).trim().toLowerCase();
    if (clean) names.add(clean);
  };

  if (typeof userProfile === 'string') {
    add(userProfile);
    return names;
  }

  if (userProfile.name) {
    add(userProfile.name);
    const parts = userProfile.name.trim().split(/\s+/);
    if (parts.length > 1) {
      const first = parts[0], last = parts[parts.length - 1];
      add(`${first} ${last[0]}`);
      add(`${first} ${last[0]}.`);
    }
  }

  if (Array.isArray(userProfile.aliases)) {
    userProfile.aliases.forEach(a => add(a));
  }

  const aliasesObj = options.aliases || null;
  const personId = userProfile.personId || (typeof Identity !== 'undefined' && typeof Identity.getLedgerPersonId === 'function' ? Identity.getLedgerPersonId(userProfile.id) : null);
  if (aliasesObj) {
    const decisions = Array.isArray(aliasesObj.decisions) ? aliasesObj.decisions : [];
    for (const d of decisions) {
      if (d && (d.personId === personId || d.personId === userProfile.id || (userProfile.name && d.canonicalName && d.canonicalName.toLowerCase() === userProfile.name.toLowerCase()))) {
        add(d.raw || d.rawToken || d.alias || d.target?.alias || d.target?.raw);
      }
    }
    const globals = Array.isArray(aliasesObj.globalAliases) ? aliasesObj.globalAliases : [];
    for (const g of globals) {
      if (g && (g.personId === personId || g.personId === userProfile.id)) {
        add(g.alias || g.raw);
      }
    }
  }

  return names;
}

function isUserAssignedToSession(r, userProfile, options = {}) {
  if (!r || !userProfile) return false;
  const userNames = getUserAliases(userProfile, options);
  if (!userNames.size) return false;

  const rolesToCheck = ['Facilitator', 'Presenter', 'Scribe', 'Teaching Points'];

  for (const role of rolesToCheck) {
    const val = typeof staffingRoleValue === 'function' ? staffingRoleValue(r, role) : (r.fields?.[role] || '');
    if (!val) continue;
    const tokens = typeof SessionCore !== 'undefined' && SessionCore.facilitatorNames ? SessionCore.facilitatorNames(val) : [val];
    for (const token of tokens) {
      const cleanToken = token.replace(/\([^)]*\)/g, '').trim().toLowerCase();
      if (cleanToken && !/^(?:tbd|none|n\/a|-|—)$/i.test(cleanToken) && userNames.has(cleanToken)) return true;
    }
  }
  return false;
}

function getUserCommitments(userProfile, windowDays = 7, options = {}) {
  const profile = userProfile || (typeof Identity !== 'undefined' ? Identity.getCurrentUser() : null) || (workspace?.reporterName ? { name: workspace.reporterName } : null);
  if (!profile) return [];

  const userNames = getUserAliases(profile, options);
  if (!userNames.size) return [];

  const refDate = options.referenceDate || today();
  const sessionList = options.records || [
    ...(typeof records === 'function' ? records('Morning Report') : (db['Morning Report']?.records || [])),
    ...(typeof records === 'function' ? records('CPS Academy VMRs') : (db['CPS Academy VMRs']?.records || []))
  ];

  const commitments = [];
  const rolesToCheck = ['Facilitator', 'Presenter', 'Scribe', 'Teaching Points'];

  for (const r of sessionList) {
    const sDate = typeof recordDate === 'function' ? recordDate(r) : (r.fields?.Date?.slice(0, 10) || '');
    if (!sDate) continue;
    const d = staffingDays(sDate, refDate);
    if (d === null || d < 0 || d > windowDays) continue;

    const assignedRoles = [];

    for (const role of rolesToCheck) {
      const val = typeof staffingRoleValue === 'function' ? staffingRoleValue(r, role) : (r.fields?.[role] || '');
      if (!val) continue;
      const tokens = typeof SessionCore !== 'undefined' && SessionCore.facilitatorNames ? SessionCore.facilitatorNames(val) : [val];
      for (const token of tokens) {
        const cleanToken = token.replace(/\([^)]*\)/g, '').trim().toLowerCase();
        if (cleanToken && !/^(?:tbd|none|n\/a|-|—)$/i.test(cleanToken) && userNames.has(cleanToken) && !assignedRoles.includes(role)) {
          assignedRoles.push(role);
        }
      }
    }

    if (assignedRoles.length > 0) {
      const coStaff = [];
      for (const role of rolesToCheck) {
        const val = typeof staffingRoleValue === 'function' ? staffingRoleValue(r, role) : (r.fields?.[role] || '');
        if (!val) continue;
        const tokens = typeof SessionCore !== 'undefined' && SessionCore.facilitatorNames ? SessionCore.facilitatorNames(val) : [val];
        const others = tokens
          .map(t => t.replace(/\([^)]*\)/g, '').trim())
          .filter(t => t && !/^(?:tbd|none|n\/a|-|—)$/i.test(t) && !userNames.has(t.toLowerCase()));
        if (others.length > 0) {
          coStaff.push(`${role}: ${others.join(', ')}`);
        }
      }

      const urgency = d < 2 ? 'urgent' : 'upcoming';
      const parsedTime = typeof SessionCore !== 'undefined' ? SessionCore.parseSessionTime(r) : null;
      const timeStr = typeof SessionCore !== 'undefined' ? SessionCore.formatSessionTime(r) : (r.fields?.['Pacific time (source)'] || '');

      commitments.push({
        record: r,
        sessionId: r.id,
        tab: r.tab || 'Morning Report',
        date: sDate,
        daysUntil: d,
        urgency,
        roles: assignedRoles,
        role: assignedRoles.join(', '),
        coStaff: coStaff.join(' · ') || 'None scheduled',
        zoomUrl: sessionZoomUrl(r),
        timeLabel: timeStr,
        sessionTime: parsedTime,
        type: r.fields?.Type || 'Morning Report',
        title: typeof title === 'function' ? title(r, r.tab || 'Morning Report') : (r.fields?.Date || 'Academy session')
      });
    }
  }

  commitments.sort((a, b) => a.date.localeCompare(b.date));
  return commitments;
}

function formatUrgencyBadge(commitment) {
  const d = commitment.daysUntil;
  let timeStr = '';
  if (commitment.sessionTime?.startUtc) {
    try {
      const zone = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC';
      timeStr = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' }).format(new Date(commitment.sessionTime.startUtc));
    } catch {}
  }
  if (d === 0) {
    return `<span class="urgency-badge-urgent">Today${timeStr ? ' at ' + timeStr : ''}</span>`;
  }
  if (d === 1) {
    return `<span class="urgency-badge-urgent">Tomorrow${timeStr ? ' at ' + timeStr : ''}</span>`;
  }
  if (d === 2) {
    return `<span class="urgency-badge-urgent">In 2 days${timeStr ? ' at ' + timeStr : ''}</span>`;
  }
  return `<span class="urgency-badge-calm">Upcoming: in ${d} days</span>`;
}

function renderMyCommitmentsWidget() {
  const user = typeof Identity !== 'undefined' ? Identity.getCurrentUser() : null;
  const profile = user || (workspace.reporterName ? { name: workspace.reporterName } : null);

  if (!profile) {
    return `<div class="commitments-quiet compact-prompt" id="my-commitments-widget" style="padding:12px 18px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;font-size:13px;">
      <span><strong>Signed out · Personal schedule:</strong> Activate a local profile to view personal session commitments and reminders.</span>
      <button type="button" class="button secondary small" id="commitments-open-prefs-btn">Activate Profile</button>
    </div>`;
  }

  const commitments = getUserCommitments(profile, 7);

  if (commitments.length === 0) {
    return `<section class="commitments-quiet" id="my-commitments-widget">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <div>
          <p class="eyebrow" style="margin-bottom:2px;">My Upcoming Commitments</p>
          <p class="commitments-quiet-text">No scheduled commitments in the next 7 days.</p>
        </div>
        <button type="button" class="button secondary small" data-go="Morning Report">Browse schedule →</button>
      </div>
    </section>`;
  }

  const itemsHtml = commitments.map(c => {
    const zoomButton = c.zoomUrl
      ? `<a href="${esc(c.zoomUrl)}" target="_blank" rel="noopener noreferrer" class="button primary small zoom-launch-btn">🎥 Launch Zoom</a>`
      : `<button type="button" class="button secondary small zoom-launch-btn" disabled title="No direct Zoom link entered in workbook">No Zoom link</button>`;
    const calButton = `<button type="button" class="button secondary small commitment-cal-btn" data-calendar="${esc(c.sessionId)}" data-area="${esc(c.tab)}">Add to Calendar</button>`;
    const swapLink = `<button type="button" class="text-button swap-link" data-swap="${esc(c.sessionId)}" data-role="${esc(c.roles[0])}">Need to swap?</button>`;

    return `<article class="commitment-card">
      <div class="commitment-card-head">
        <div class="commitment-badges">
          ${formatUrgencyBadge(c)}
          ${c.roles.map(role => `<span class="role-pill">${esc(role)}</span>`).join(' ')}
          <span class="tag">${esc(c.type)}</span>
        </div>
        <div class="commitment-date-time">
          <strong>${esc(c.date)}</strong> · <span>${esc(c.timeLabel)}</span>
        </div>
      </div>
      <div class="commitment-meta-grid">
        <div class="commitment-meta-item">
          <small>Role</small>
          <strong>${esc(c.role)}</strong>
        </div>
        <div class="commitment-meta-item">
          <small>Co-Staff</small>
          <span class="co-staff-text">${esc(c.coStaff)}</span>
        </div>
      </div>
      <div class="commitment-actions">
        <div class="commitment-action-group">
          ${zoomButton}
          ${calButton}
          <button type="button" class="button secondary small" data-open="${esc(c.sessionId)}" data-area="${esc(c.tab)}">View Session</button>
        </div>
        <div>
          ${swapLink}
        </div>
      </div>
    </article>`;
  }).join('');

  return `<section class="commitments-widget" id="my-commitments-widget">
    <div class="commitments-widget-head">
      <h2><span>📋</span> My Upcoming Commitments (${commitments.length})</h2>
      <span class="tag ready-chip">Active Schedule</span>
    </div>
    <div class="commitments-list">
      ${itemsHtml}
    </div>
  </section>`;
}

function openSwapDialog(sessionId, role) {
  const r = (records('Morning Report') || []).find(x => x.id === sessionId) || (records('CPS Academy VMRs') || []).find(x => x.id === sessionId);
  if (!r) return toast('Session not found.');

  const dialog = $('#swap-dialog');
  if (!dialog) return;

  $('#swap-session-id').value = sessionId;
  $('#swap-role').value = role || 'Facilitator';
  $('#swap-session-summary').textContent = `Session: ${recordDate(r)} · ${SessionCore.formatSessionTime(r)} · Role: ${role || 'Assigned slot'}`;
  $('#swap-action-type').value = 'release';
  $('#swap-transfer-label').style.display = 'none';
  $('#swap-colleague-name').value = '';

  dialog.showModal();
}

function bindSwapEvents() {
  const actionSel = $('#swap-action-type');
  if (actionSel) {
    actionSel.onchange = () => {
      const transLabel = $('#swap-transfer-label');
      if (transLabel) transLabel.style.display = actionSel.value === 'transfer' ? 'block' : 'none';
    };
  }

  const form = $('#swap-form');
  if (form) {
    form.onsubmit = e => {
      e.preventDefault();
      const sessionId = $('#swap-session-id').value;
      const role = $('#swap-role').value;
      const reason = $('#swap-reason').value;
      const action = $('#swap-action-type').value;
      const colleague = $('#swap-colleague-name').value.trim();

      if (action === 'transfer' && !colleague) {
        toast("Please enter the colleague's name.");
        return;
      }

      const r = records('Morning Report').find(x => x.id === sessionId) || records('CPS Academy VMRs').find(x => x.id === sessionId);
      if (!r) { toast('Session not found.'); return; }

      const changedField = (role === 'Scribe' || role === 'Teaching Points') ? 'Scribe / teaching points sign-ups' : role;
      const currentVal = r.fields[changedField] || '';
      let newVal = '';

      if (role === 'Scribe' || role === 'Teaching Points') {
        const rolePat = role === 'Teaching Points' ? '(?:Teaching Points|TP)' : 'Scribe';
        const segRegex = new RegExp(`(^|[\\r\\n|])([^\\S\\r\\n]*${rolePat}:[^\\S\\r\\n]*)([^|\\r\\n]*)(?=[|\\r\\n]|$)`, 'i');
        if (action === 'release') {
          newVal = currentVal.replace(segRegex, (m, p1, p2) => `${p1}${p2}`);
        } else {
          newVal = currentVal.replace(segRegex, (m, p1, p2) => `${p1}${p2}${colleague}`);
        }
      } else {
        if (action === 'release') {
          newVal = '';
        } else {
          newVal = colleague;
        }
      }

      mutate(w => {
        w.edits[sessionId] = {
          ...(w.edits[sessionId] || {}),
          [changedField]: newVal
        };
        log(w, action === 'release' ? `Released ${role} (${reason})` : `Swapped ${role} with ${colleague} (${reason})`, r, r.tab || 'Morning Report');
      }, sessionId);

      $('#swap-dialog')?.close();
      render();
      toast(action === 'release' ? `Slot released for volunteers (${reason}).` : `Slot transferred to ${colleague}.`);
    };
  }
}

function home(){
 const upcoming=records('Morning Report').filter(r=>recordDate(r)&&recordDate(r)>=today()).sort((a,b)=>recordDate(a).localeCompare(recordDate(b)));
 const next=upcoming.slice(0,3);
 const nextSession=upcoming[0];
 const pinned=Object.keys(db).flatMap(t=>records(t).filter(r=>workspace.favorites.includes(r.id)).map(r=>({r,t})));
 const leader=currentLeader();
 const recents=(workspace.recent||[]).map(item=>{const r=records(item.tab).find(x=>x.id===item.id);return r?{r,t:item.tab}:null;}).filter(Boolean).slice(0,3);
 const localChanges=workspace.history.filter(h=>h.tab!=='Workspace').slice(0,4);
 const editCount=Object.keys(workspace.edits).length+workspace.added.length;
 const allLinks=records('Important links');
 const pinnedLinks=allLinks.filter(r=>workspace.favorites.includes(r.id));
 const defaultLinkKeys=['Google Drive Academy Folder - Schemas','VMR overview','CPS VMR New Whiteboard','Case Review Operating Procedures'];
 const displayLinks=pinnedLinks.length?pinnedLinks:allLinks.filter(r=>defaultLinkKeys.includes(r.fields.Resource)).slice(0,4);
 const commitmentsHtml = renderMyCommitmentsWidget();
 let leaderHtml='';
 if(leader){
  const f=leader.fields;
  leaderHtml=`<section class="panel leader-banner"><div class="leader-badge">${chip('Active Leader of the Week')}<span class="snapshot-label">Workbook snapshot · ${esc(f.Dates||'')}</span></div><div class="leader-content"><div><h2>${esc(f.Member||'Unassigned')}</h2><p class="muted">${esc(f.Week||'Current week')}${f.Comments?` · ${esc(f.Comments)}`:''}</p></div><div class="card-actions"><button class="button secondary small" data-open="${esc(leader.id)}" data-area="Leader of the Week">Open details</button><button class="button secondary small" data-go="Leader of the Week">All leaders →</button></div></div></section>`;
 }
 let nextSessionCard='';
 if(nextSession){
  const nf=nextSession.fields,countdown=sessionCountdown(dateValue(nextSession));
  const timeStr=SessionCore.formatSessionTime(nextSession);
  const cleanSignups=(nf['Scribe / teaching points sign-ups']||'').split(/\r?\n[-_]{3,}/)[0];
  const pres=nf.Presenter||cleanSignups.match(/(?:Case Presenter|Presenter):[^\S\r\n]*([^\r\n|]+)/i)?.[1]?.trim()||'Unassigned';
  nextSessionCard=`<article class="panel op-card"><div class="op-card-head"><span class="tag ${countdown==='Today'?'ready-chip':''}">${esc(countdown)} · ${esc(dateValue(nextSession))}</span><span class="op-sub">${esc(timeStr)}</span></div><div class="op-card-body"><small class="op-label">Next Scheduled Session</small><h3 class="op-title">${esc(title(nextSession,'Morning Report'))}</h3><div class="op-meta-grid"><div><small>Type</small><strong>${esc(nf.Type||'Morning Report')}</strong></div><div><small>Facilitator</small><strong>${esc(nf.Facilitator||'Unassigned')}</strong></div><div><small>Presenter</small><strong>${esc(pres)}</strong></div></div></div><div class="op-card-foot">${calendarButton(nextSession,'Morning Report')}<button class="button primary small" data-open="${esc(nextSession.id)}" data-area="Morning Report">Staff session</button><button class="button secondary small" data-go="Morning Report">Open staffing schedule</button></div></article>`;
 }else{
  nextSessionCard=`<article class="panel op-card"><div class="op-card-head"><span class="tag">Schedule</span></div><div class="op-card-body"><small class="op-label">Next Scheduled Session</small><h3 class="op-title">No upcoming dated sessions</h3><p class="muted">Check schedule for pending or past sessions.</p></div><div class="op-card-foot"><button class="button secondary small" data-go="Morning Report">Open staffing schedule</button></div></article>`;
 }
 const backupCard=`<article class="panel op-card"><div class="op-card-head"><span class="tag ${editCount>0?'gap-chip':'ready-chip'}">${editCount>0?`⚠ ${editCount} local edit${editCount===1?'':'s'}`:'✓ Clean state'}</span><span class="op-sub">Last backup: ${esc(backupAgeText())}</span></div><div class="op-card-body"><small class="op-label">Backup Health</small><h3 class="op-title">${editCount>0?`${editCount} local change${editCount===1?'':'s'} pending backup`:'Snapshot data healthy'}</h3><p class="muted">${editCount>0?'Edits exist only in this browser. Download a backup to preserve them.':'No unbacked browser changes. Workspace matches snapshot.'}</p></div><div class="op-card-foot"><button class="button secondary small" id="home-backup-btn">Download backup</button><button class="text-button" data-go="Workspace">Backups & activity →</button></div></article>`;
 const linksCard=`<article class="panel op-card"><div class="op-card-head"><span class="tag">Resources</span><span class="op-sub">${pinnedLinks.length?`${pinnedLinks.length} pinned`:'Core Drives & Guidelines'}</span></div><div class="op-card-body"><small class="op-label">Important Links</small><h3 class="op-title">Essential Resources</h3><div class="quick-links-grid">${displayLinks.map(r=>{const u=urls(r,'Link')[0]||r.links?.Link||'';return u?`<a class="button secondary small quick-resource-btn" href="${esc(u)}" target="_blank" rel="noopener noreferrer">↗ ${esc(r.fields.Resource)}</a>`:`<button class="button secondary small quick-resource-btn" data-open="${esc(r.id)}" data-area="Important links">${esc(r.fields.Resource)}</button>`;}).join('')}</div></div><div class="op-card-foot"><button class="button secondary small" data-go="Important links">All ${allLinks.length} resources →</button></div></article>`;
 $('#page').innerHTML=`<div class="home-container" id="Home">${header('Home Dashboard','Operational status, upcoming sessions and active Academy resources.')}${banner()}<section class="operational-lead-grid" style="display:grid;gap:16px;margin-bottom:20px;">${nextSessionCard}</section>${commitmentsHtml}<section class="operational-grid">${backupCard}${linksCard}</section>${leaderHtml}<div class="dashboard-heading"><div><h2>Upcoming in the workbook</h2><p class="muted">Workbook snapshot records (2026-09-06)</p></div><button class="text-button" data-go="Morning Report">View schedule →</button></div><section class="hub-grid">${next.map(r=>card(r,'Morning Report')).join('')||'<div class="empty-state">No future dated sessions in this snapshot.</div>'}</section><div class="dashboard-heading"><h2>Recently opened records</h2><span class="muted">Opened in this browser</span></div><section class="hub-grid">${recents.map(({r,t})=>card(r,t)).join('')||'<div class="empty-state panel">Records you open will appear here for quick access.</div>'}</section><div class="dashboard-heading"><h2>Recent local changes</h2><button class="text-button" data-go="Workspace">All activity & backups →</button></div><section class="panel activity-list">${localChanges.map(h=>`<div><strong>${esc(h.action)} · ${esc(h.title)}</strong><small>${esc(h.tab)} · ${esc(new Date(h.at).toLocaleString())} · Saved on this device</small></div>`).join('')||'<div class="empty-state">No local changes yet. Edits and drafts saved on this device will appear here.</div>'}</section><div class="dashboard-heading"><h2>Pinned for quick access</h2><span class="muted">Use ☆ on any record</span></div><section class="hub-grid">${pinned.slice(0,9).map(({r,t})=>card(r,t)).join('')||'<div class="empty-state panel">Pin a session, member or resource to keep it here.</div>'}</section></div>`;
 if($('#home-backup-btn'))$('#home-backup-btn').onclick=()=>{exportBackup();render();};
}
function filtered(){let rr=records().filter(r=>Object.values(r.fields).join(' ').toLowerCase().includes((sectionQuery||query).toLowerCase()));if(['Morning Report','CPS Academy VMRs'].includes(tab))rr=rr.filter(r=>SessionCore.matchesFacets(r,{type:sessionType,facilitator:sessionFacilitator,gapsOnly},mrGaps));if(owner){if(tab==='Podcast Episodes')rr=rr.filter(r=>(r.fields['Audio editor']||'').split(/[/,;]/).map(s=>s.trim()).includes(owner)||(r.fields['Point person']||'').split(/[/,;]/).map(s=>s.trim()).includes(owner)||r.fields['Audio editor']===owner||r.fields['Point person']===owner);else if(tab==='Schema review')rr=rr.filter(r=>(r.fields['Video owner']||'').trim()===owner||(r.fields['Infographic owner']||'').trim()===owner);}if(skill)rr=rr.filter(r=>r.fields[skill]==='Yes');if(dateFrom)rr=rr.filter(r=>recordDate(r)&&recordDate(r)>=dateFrom);if(dateTo)rr=rr.filter(r=>recordDate(r)&&recordDate(r)<=dateTo);if(facet)rr=rr.filter(r=>r.fields[facets[tab]]===facet);if(filter==='Needs review')rr=rr.filter(r=>r.flags.length);if(filter==='Local edits')rr=rr.filter(r=>workspace.edits[r.id]||r.id.startsWith('local:'));if(filter==='Pinned')rr=rr.filter(r=>workspace.favorites.includes(r.id));if(filter==='Upcoming')rr=rr.filter(r=>recordDate(r)&&recordDate(r)>=today());if(filter==='This Week')rr=rr.filter(r=>{const d=staffingDays(SessionCore.parseDate(dateValue(r)));return d!==null&&d>=0&&d<=7});if(filter==='Needs Volunteers')rr=rr.filter(r=>{const d=staffingDays(SessionCore.parseDate(dateValue(r)));return d!==null&&d>=0&&mrGaps(r).length>0});if(filter==='My Sessions'){const user=typeof Identity!=='undefined'?Identity.getCurrentUser():null;const profile=user||(workspace.reporterName?{name:workspace.reporterName}:null);rr=rr.filter(r=>profile&&isUserAssignedToSession(r,profile));}if(filter==='Staffing gaps')rr=rr.filter(r=>mrGaps(r).length>0);if(filter==='Has recording')rr=rr.filter(r=>urls(r,'Recording').length);if(filter==='Missing facilitator')rr=rr.filter(r=>!r.fields.Facilitator||/tbd/i.test(r.fields.Facilitator));if(sort==='az')rr.sort((a,b)=>title(a).localeCompare(title(b)));else if(filter==='Upcoming')rr.sort((a,b)=>recordDate(a).localeCompare(recordDate(b)));else if(sort==='date')rr.sort((a,b)=>{const x=recordDate(a),y=recordDate(b);return x&&y?y.localeCompare(x):x?-1:y?1:0});return rr}
function renderFilters(rr, t, filters, field, options, viewSwitcher) {
  const count=[filter!=='All',facet,owner,skill,sessionType,sessionFacilitator,dateFrom,dateTo,sort!==(t==='CPS Academy VMRs'?'date':'source'),gapsOnly,showAll].filter(Boolean).length;
  return `<div class="filter-toolbar filter-bar schedule-filter-bar roster-toolbar">
    <details class="schedule-secondary-filters" ${scheduleFiltersOpen || (typeof window!=='undefined' && window.innerWidth>760) ? 'open' : ''}>
      <summary>Filters (Active: ${count})</summary>
      <div class="schedule-filter-panel">
        <label>Show<select class="select" id="filter">${filters.map(f=>`<option ${f===filter?'selected':''}>${f}</option>`).join('')}</select></label>
        ${field?`<label>${esc(field)}<select class="select" id="facet"><option value="">All</option>${options.map(v=>`<option value="${esc(v)}" ${v===facet?'selected':''}>${esc(v)}</option>`).join('')}</select></label>`:''}
        <label>Order<select class="select" id="sort"><option value="source">Workbook order</option><option value="az" ${sort==='az'?'selected':''}>Title A–Z</option><option value="date" ${sort==='date'?'selected':''}>Newest recognised dates</option></select></label>
        ${extraFilters()}
        <label class="ctrl-f-label"><input type="checkbox" id="show-all-toggle" ${showAll?'checked':''}> <span>Show all (${rr.length}) for Ctrl+F</span></label>
        <button class="button secondary" id="clear">Clear filters</button>
      </div>
    </details>
    ${viewSwitcher}
  </div>`;
}

function areaPicker(){const areas=groups[Object.keys(groups).find(g=>groups[g].includes(tab))];return `<label class="mobile-area-picker">Section<select id="area-picker" aria-label="Academy section">${areas.map(t=>`<option value="${esc(t)}" ${t===tab?'selected':''}>${esc(sectionLabel(t))}</option>`).join('')}</select></label>`}
function listing(){let rr=filtered();const pageSize=showAll?rr.length:12;page=showAll?0:Math.min(page,Math.max(0,Math.ceil(rr.length/pageSize)-1));const current=showAll?rr:rr.slice(page*pageSize,page*pageSize+pageSize),field=['Morning Report','CPS Academy VMRs'].includes(tab)?'':facets[tab],options=field?[...new Set(records().map(r=>r.fields[field]).filter(Boolean))].sort():[];const filters=['All',...(['Morning Report','CPS Academy VMRs'].includes(tab)?['Upcoming','This Week','Needs Volunteers','My Sessions','Staffing gaps','Missing facilitator']:[]),...(db[tab].columns.includes('Recording')?['Has recording']:[]),'Pinned','Needs review','Local edits'];const viewSwitcher=tab==='Morning Report'?`<div class="segmented"><button class="${mode==='matrix'?'active':''}" data-set-view="matrix">Matrix</button><button class="${mode==='agenda'?'active':''}" data-set-view="agenda">Weekly Agenda</button><button class="${mode==='cards'?'active':''}" data-set-view="cards">Cards</button><button class="${mode==='table'?'active':''}" data-set-view="table">Table</button></div>`:['Podcast Episodes','Schema review'].includes(tab)?`<div class="segmented"><button class="${mode==='board'?'active':''}" data-set-view="board">Board</button><button class="${mode==='cards'?'active':''}" data-set-view="cards">Cards</button><button class="${mode==='table'?'active':''}" data-set-view="table">Table</button></div>`:`<button class="button secondary" id="view">${mode==='cards'?'Table view':'Card view'}</button>`;$('#page').innerHTML=header(sectionLabel(tab),descriptions[tab]||'Programme records, assignments and source details.')+banner()+sopBanner(tab)+areaPicker()+`<div class="toolbar area-tabs">${groups[Object.keys(groups).find(g=>groups[g].includes(tab))].map(t=>`<button class="button ${t===tab?'primary':'secondary'} small" data-go="${esc(t)}">${esc(sectionLabel(t))}</button>`).join('')}</div>${renderFilters(rr,tab,filters,field,options,viewSwitcher)}<p class="muted results-count">${formatResultsCount(rr,tab,records())}${sort==='date'?' · Unresolved dates follow recognised dates':''}${dateFrom||dateTo?' · Records with unresolved dates are excluded from this range':''}</p>${rr.length?(mode==='matrix'&&tab==='Morning Report'?matrixView(rr):(mode==='agenda'&&tab==='Morning Report'?agendaView(rr):(mode==='board'&&['Podcast Episodes','Schema review'].includes(tab)?workflowBoard(rr,tab):(mode==='cards'?`<section class="hub-grid">${current.map(r=>card(r)).join('')}</section>`:table(current))))): '<section class="empty-state panel"><h2>No matching records</h2><p>Clear the filters or try a broader search.</p><button class="button secondary" data-clear-filters>Clear filters</button></section>'}${(mode==='matrix'&&tab==='Morning Report')||(mode==='agenda'&&tab==='Morning Report')||(mode==='board'&&['Podcast Episodes','Schema review'].includes(tab))||showAll?'':`<div class="toolbar pagination"><button class="button secondary" id="prev" ${page===0?'disabled':''}>Previous</button><span>Page ${page+1} of ${Math.max(1,Math.ceil(rr.length/12))}</span><button class="button secondary" id="next" ${(page+1)*12>=rr.length?'disabled':''}>Next</button></div>`}${tab==='CRC'&&db['CRC - retired']?crcDrawer():''}`;bindExtraFilters();if($('#area-picker'))$('#area-picker').onchange=e=>navigate(e.target.value);$('#filter').onchange=e=>{filter=e.target.value;page=0;render()};if($('#facet'))$('#facet').onchange=e=>{facet=e.target.value;page=0;render()};$('#sort').onchange=e=>{sort=e.target.value;render()};if($('#show-all-toggle'))$('#show-all-toggle').onchange=e=>{showAll=e.target.checked;page=0;render()};$('#clear').onclick=()=>{query='';filter='All';facet='';owner='';sessionType='';sessionFacilitator='';gapsOnly=false;sectionQuery='';skill='';dateFrom='';dateTo='';sort='source';page=0;showAll=false;$('#global-search').value='';render()};if($('#view'))$('#view').onclick=()=>{mode=mode==='cards'?'table':'cards';render()};document.querySelectorAll('[data-set-view]').forEach(b=>b.onclick=()=>{mode=b.dataset.setView;render()});if($('#prev'))$('#prev').onclick=()=>{page--;render();window.scrollTo(0,0)};if($('#next'))$('#next').onclick=()=>{page++;render();window.scrollTo(0,0)};if(mode==='board'&&['Podcast Episodes','Schema review'].includes(tab))bindBoardEvents(tab);}
function crcDrawer(){const retired=records('CRC - retired');const c=getClassificationCounts(retired,'CRC - retired');return `<details class="panel legacy-drawer" style="margin-top:24px"><summary style="cursor:pointer;padding:16px 20px;font-weight:700;display:flex;align-items:center;justify-content:space-between;user-select:none"><span>📁 Archived / Legacy Mentorship (${c.namedEntries} cases in 15 rounds)</span><span class="muted" style="font-size:12px;font-weight:normal">Expand archive records ↓</span></summary><div style="padding:16px 20px;border-top:1px solid var(--line)"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px"><p class="muted" style="margin:0">Historical mentorship rounds preserved from original workbook (${c.namedEntries} cases, 15 round headings, ${c.placeholders} placeholders). Active cases remain front-and-center above.</p><button class="button secondary small" data-go="CRC - retired">Full Archive View →</button></div><div class="hub-grid">${retired.slice(0,9).map(r=>card(r,'CRC - retired')).join('')}</div><div style="margin-top:16px;text-align:center"><button class="button secondary small" data-go="CRC - retired">Browse all ${retired.length} archived records →</button></div></div></details>`}
function table(rr){
 if(window.innerWidth<=760){
  const cols=db[tab].columns.filter(c=>c!==titles[tab]);
  const fields=(r,keys)=>keys.map(c=>`<div><dt>${esc(c)}</dt><dd>${esc(r.fields[c]||'—')}</dd></div>`).join('');
  return `<section class="mobile-record-list">${rr.map(r=>{const c=typeof getRecordClassification==='function'?getRecordClassification(r,tab):null;const tagBadge=c&&c.category!==RECORD_CATEGORY.NAMED_ENTRY?`<span class="tag tag-heading" style="margin-bottom:6px;display:inline-block;">${esc(c.label||c.category)}</span>`:(c&&c.cohort?`<span class="tag tag-cohort" style="margin-bottom:6px;display:inline-block;">${esc(c.cohort)}</span>`:'');return `<article class="panel mobile-record">${tagBadge}<h2>${esc(title(r,tab))}</h2><dl>${fields(r,cols.slice(0,3))}</dl>${cols.length>3?`<details><summary>All fields (${cols.length-3} more)</summary><dl>${fields(r,cols.slice(3))}</dl></details>`:''}${sessionNotice(r)}${['Morning Report','CPS Academy VMRs','Special VMRs','Student Forum','Residency Programs'].includes(tab)?`<p class="session-time">${esc(SessionCore.formatSessionTime(r))}</p>`:''}<div class="card-links">${urls(r,'Recording').map(u=>anchor(u,'Watch recording')).join('')}${urls(r,'Link').map(u=>anchor(u,'Open resource')).join('')}</div><div class="card-actions">${actionButtons(r,tab)}</div><small class="muted">${esc(source(r))}</small></article>`;}).join('')}</section>`;
 }
 const cols=[titles[tab],...db[tab].columns.filter(c=>c!==titles[tab])];return `<section class="panel table-panel"><table class="data-table"><thead><tr>${cols.map(c=>`<th>${esc(c)}</th>`).join('')}<th>Action</th></tr></thead><tbody>${rr.map(r=>`<tr>${cols.map(c=>`<td data-label="${esc(c)}">${esc(r.fields[c]||'—')}</td>`).join('')}<td>${sessionNotice(r)}${['Morning Report','CPS Academy VMRs','Special VMRs','Student Forum','Residency Programs'].includes(tab)?`<p class="session-time">${esc(SessionCore.formatSessionTime(r))}</p>`:''}${actionButtons(r,tab)}</td></tr>`).join('')}</tbody></table></section>`}
function sopBanner(t){
  if(t==='Schema review'){
    return `<details class="panel sop-banner" ${window.innerWidth>760?'open':''}><summary>📋 Operational Guidelines &amp; Production Timeline</summary><div class="sop-content"><div class="sop-grid"><div><strong>Team Leads</strong><p>Umbish &amp; Sawsan · Core Team: Tansu, Masah, Oumaima, Rahul, Ibrahim, Parisa, Zakariyya, Simmy, Daniel, Anmolpreet</p></div><div><strong>Weekly Timeline</strong><p>• <strong>Friday:</strong> Submit draft video for review to <code>sawsansweilmeen2001@gmail.com</code> / <code>umbish21@gmail.com</code>.<br>• <strong>Monday:</strong> Upload final video &amp; infographic (Sawsan).</p></div><div><strong>Video Requirements</strong><p>• 2–3 min max (split longer schemas).<br>• Appear on camera directly (visually engaging; avoid voice-over only).<br>• Link to a CPS Episode with practical examples.<br><a class="button secondary small" href="https://clinicalproblemsolving.com/reasoning-content/" target="_blank" rel="noopener noreferrer">Reasoning Content ↗</a></p></div></div></div></details>`;
  }
  if(t==='Student Forum'){
    return `<details class="panel sop-banner" ${window.innerWidth>760?'open':''}><summary>📋 Student Forum Standard Operating Procedures (SOP)</summary><div class="sop-content"><p>Expert clinical reasoning case sessions paired with junior members and student discussants. Past forums archived below.</p><a class="button primary small" href="https://docs.google.com/document/d/1kYRo8gkHKPyVpRAtQEqhGOkid03kM8qnrcv32S-9Fq0/edit?tab=t.0" target="_blank" rel="noopener noreferrer">📄 Open Official SOP &amp; How-To Guide ↗</a></div></details>`;
  }
  if(t==='Podcast Episodes'){
    return `<details class="panel sop-banner"><summary>📋 Production Target &amp; Audio Editing Guidelines</summary><div class="sop-content"><p><strong>Production Goal:</strong> Coordinate efforts across the line so episodes are finalized and ready for upload <strong>2 days prior to release date</strong>.<br>The audio editor emails the finalized episode to the point person 2 days prior to release.</p></div></details>`;
  }
  return '';
}
function workspaceView(){
  const hasRollback = !!sessionStorage.getItem('cps-rollback-snapshot');
  const offlineInfo = typeof OfflineManager !== 'undefined' ? OfflineManager.getOfflineStatus() : null;
  $('#page').innerHTML=header('Workspace','Keep a portable backup and review your local activity.')+banner()+`<section class="integration-grid"><article class="panel integration-card"><h2>Your changes, safely portable</h2><p>Changes are stored in this browser. Export a backup before switching devices or clearing browser data. Import merges a backup, with incoming values taking priority for the same record.</p><div class="toolbar"><button class="button primary" id="export">Download backup</button><label class="button secondary">Import backup<input type="file" id="import" accept="application/json" hidden></label><button class="button secondary" id="export-patch-top">Export Spreadsheet Patch JSON</button><button class="button secondary" id="clear-offline-btn">Clear offline copy</button>${hasRollback?'<button class="button secondary" id="undo-rollback-btn">↺ Undo Last Import (Rollback)</button>':''}</div><p class="muted">${Object.keys(workspace.edits).length} edited records · ${workspace.added.length} new records · ${workspace.favorites.length} pins</p></article><article class="panel integration-card"><h2>Connection status</h2><p>${offlineInfo?.isFallback?`<strong>${esc(offlineInfo.label)}</strong>`:'This is a copy of the uploaded workbook. No live Google Sheets connection or shared saving is enabled.'}</p><p>Next integration phase: stable record IDs, shared storage, then permissioned read-only Sheets sync. Source row references are retained for review.</p></article><article class="panel integration-card"><h2>Developer &amp; Admin Settings</h2><p>Toggle local administration privileges for local testing and issue triage.</p><div class="pref-item" style="margin:12px 0;"><div class="pref-meta"><strong>Super Admin Profile (@admin)</strong><p class="muted">Access the Issue Reports triage dashboard (${workspace.issues?.length || 0} issues logged).</p></div><label class="toggle-switch"><input type="checkbox" id="workspace-admin-toggle" ${isAdmin()?'checked':''}><span class="toggle-slider"></span></label></div></article></section>${workbookDiffHtml()}<div class="dashboard-heading"><h2>Recent local activity</h2></div><section class="panel activity-list">${workspace.history.slice(0,30).map(h=>`<div><strong>${esc(h.action)} · ${esc(h.title)}</strong><small>${esc(h.tab)} · ${esc(new Date(h.at).toLocaleString())}</small></div>`).join('')||'<div class="empty-state">Your saved changes will appear here.</div>'}</section>`;
  $('#export').onclick=exportBackup;
  $('#import').onchange=importBackup;
  if($('#export-patch-top'))$('#export-patch-top').onclick=exportPatchJson;
  if($('#export-patch-btn'))$('#export-patch-btn').onclick=exportPatchJson;
  if($('#undo-rollback-btn'))$('#undo-rollback-btn').onclick=rollbackImport;
  if($('#clear-offline-btn'))$('#clear-offline-btn').onclick=async()=>{if(typeof OfflineManager!=='undefined'){await OfflineManager.clearOfflineCopy();toast('Offline cache cleared.');}};
  if($('#workspace-admin-toggle'))$('#workspace-admin-toggle').onchange=e=>setAdminMode(e.target.checked);
}
let currentLogbookSlice=null;
function personalLogbookView(){
  const user=typeof Identity!=='undefined'?Identity.getCurrentUser():null;
  if(!user){
    $('#page').innerHTML=header('Personal Assignment Logbook','Clinical procedure logbook for a single authenticated CPS Academy member.')+banner()+`<section class="panel empty-state"><h2>Signed out</h2><p class="muted">A local test profile is required to view personal assignment records. Open preferences to select or set your local profile.</p><div style="margin-top:16px;"><button class="button primary" id="logbook-open-prefs-btn">Developer &amp; Profile Preferences</button></div></section>`;
    if($('#logbook-open-prefs-btn'))$('#logbook-open-prefs-btn').onclick=()=>$('#admin-prefs-dialog')?.showModal();
    return;
  }
  const expectedPersonId=typeof Identity!=='undefined'?Identity.getLedgerPersonId(user.id):null;
  const slice=(typeof Logbook!=='undefined'?Logbook.getPersonalSlice():null)||currentLogbookSlice;
  let content='';
  if(!slice){
    content=`<section class="panel"><div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;"><div><h2>Import Personal Assignment Slice</h2><p class="muted" style="margin:4px 0 12px 0;">Import a personal slice generated offline via the CLI command:</p><pre style="background:#f1f5f9;padding:10px 14px;border-radius:8px;font-size:12px;overflow-x:auto;"><code>node scripts/export-personal-logbook.cjs --person-id ${esc(expectedPersonId||'<canonical-id>')} --output private-logbook.json</code></pre><p class="muted" style="font-size:12px;margin-top:8px;">Saved only in browser memory. Discarded upon profile change or page reload.</p></div><div><label class="button primary" style="cursor:pointer;display:inline-flex;align-items:center;gap:6px;"><span>📁 Import Slice JSON</span><input type="file" id="logbook-slice-file" accept="application/json,.json" hidden></label></div></div><div id="logbook-error" class="alert-error" style="display:none;margin-top:16px;padding:12px;background:#fee2e2;border:1px solid #fca5a5;border-radius:8px;color:#991b1b;font-size:13px;"></div></section>`;
  }else{
    const data=Logbook.processLogbook(slice);
    const m=data.metrics;
    const logbookWindowed = window.innerWidth>760 && typeof WindowedList !== 'undefined' && data.pastEntries.length > 50;
    let pastRowsHtml = '';
    if (!logbookWindowed) {
      pastRowsHtml = data.pastEntries.map((e, idx) => renderLogbookPastRow(e, idx)).join('') || '<tr><td colspan="5" class="empty-state">No completed assignments recorded.</td></tr>';
    } else {
      const initWin = WindowedList.computeWindow({ totalItems: data.pastEntries.length, itemHeight: 44, containerHeight: 600, scrollTop: 0, overscan: 6 });
      const topSp = WindowedList.defaultSpacer(initWin.topSpacerHeight, 'top', 5);
      const botSp = WindowedList.defaultSpacer(initWin.bottomSpacerHeight, 'bottom', 5);
      const sliceRows = data.pastEntries.slice(initWin.startIndex, initWin.endIndex).map((e, i) => renderLogbookPastRow(e, initWin.startIndex + i)).join('');
      pastRowsHtml = topSp + sliceRows + botSp;
    }
    const logbookToggleHtml = data.pastEntries.length > 50 ? `<div class="window-toggle-bar"><span>Showing virtualized assignments (<strong>${data.pastEntries.length}</strong> total)</span><button type="button" class="button secondary small window-toggle-btn" id="logbook-window-toggle-btn">Show all for Find (Ctrl+F)</button></div>` : '';

    content=`<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:18px;"><div style="display:flex;align-items:center;gap:8px;"><span class="tag local-profile-tag">Local test profile</span><span class="tag">Local preview</span><span class="muted" style="font-size:12px;">Canonical ID: <code>${esc(slice.personId)}</code></span></div><div style="display:flex;gap:8px;"><label class="button secondary small" style="cursor:pointer;">Switch Slice<input type="file" id="logbook-slice-file" accept="application/json,.json" hidden></label><button class="button secondary small" id="unload-logbook-btn">Unload Slice</button></div></div><div class="logbook-metrics-grid"><div class="logbook-metric-card"><strong>${m.recordedAssignments}</strong><span>Recorded assignments</span><small class="muted" style="font-size:11px;">Completed historical session assignments</small></div><div class="logbook-metric-card"><strong>${m.distinctSessions}</strong><span>Distinct sessions</span><small class="muted" style="font-size:11px;">Individual morning report and VMR dates</small></div><div class="logbook-metric-card"><strong>${Object.keys(m.roleBreakdown).length}</strong><span>Roles performed</span><div class="logbook-role-grid">${Object.entries(m.roleBreakdown).map(([rName,count])=>`<div class="logbook-role-item"><small>${esc(rName)}</small><strong>${count}</strong></div>`).join('')||'<span class="muted">None recorded</span>'}</div></div></div><section class="panel table-panel" style="margin-bottom:24px;"><div style="padding:16px 20px 10px;border-bottom:1px solid var(--line);"><h2 style="margin:0;font-size:16px;">Completed Clinical Assignments (${data.pastEntries.length})</h2><p class="muted" style="margin:4px 0 0 0;font-size:12px;">Reverse-chronological history of verified workbook engagements.</p></div>${logbookToggleHtml}<div class="logbook-table-container"><table class="data-table"><thead><tr><th>Date</th><th>Series</th><th>Role</th><th>Session Title / Topic</th><th>Source ID</th></tr></thead><tbody>${pastRowsHtml}</tbody></table></div></section>${data.scheduledEntries.length?`<section class="panel table-panel" style="margin-bottom:24px;"><div style="padding:16px 20px 10px;border-bottom:1px solid var(--line);"><h2 style="margin:0;font-size:16px;">Scheduled Upcoming Assignments (${data.scheduledEntries.length})</h2><p class="muted" style="margin:4px 0 0 0;font-size:12px;">Upcoming assignments excluded from completed totals.</p></div><table class="data-table"><thead><tr><th>Scheduled Date</th><th>Series</th><th>Role</th><th>Session Title</th><th>Source ID</th></tr></thead><tbody>${data.scheduledEntries.map(e=>`<tr><td data-label="Scheduled Date"><strong>${esc(e.date)}</strong></td><td data-label="Series">${esc(e.series||'Morning Report')}</td><td data-label="Role"><span class="tag slot-upcoming">${esc(e.role||'Unspecified')}</span></td><td data-label="Title">${esc(e.title||'Morning Report')}</td><td data-label="Source"><small class="muted">${esc(e.sessionId||e.id)}</small></td></tr>`).join('')}</tbody></table></section>`:''}${data.unresolvedEntries.length?`<section class="panel table-panel"><div style="padding:16px 20px 10px;border-bottom:1px solid var(--line);"><h2 style="margin:0;font-size:16px;">Unresolved Date Records (${data.unresolvedEntries.length})</h2><p class="muted" style="margin:4px 0 0 0;font-size:12px;">Entries without unambiguous calendar dates (sequestered from historical totals).</p></div><table class="data-table"><thead><tr><th>Source Date Raw</th><th>Series</th><th>Role</th><th>Session Title</th><th>Source ID</th></tr></thead><tbody>${data.unresolvedEntries.map(e=>`<tr><td data-label="Date Raw"><span class="tag slot-urgent">${esc(e.date||'Unspecified date')}</span></td><td data-label="Series">${esc(e.series||'Morning Report')}</td><td data-label="Role"><span class="tag">${esc(e.role||'Unspecified')}</span></td><td data-label="Title">${esc(e.title||'Morning Report')}</td><td data-label="Source"><small class="muted">${esc(e.sessionId||e.id)}</small></td></tr>`).join('')}</tbody></table></section>`:''}`;
  }
  $('#page').innerHTML=header('Personal Assignment Logbook','Clinical procedure logbook for a single authenticated member.')+banner()+content;
  if($('#logbook-slice-file'))$('#logbook-slice-file').onchange=(e)=>{
    const file=e.target.files?.[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=(evt)=>{
      try{
        const parsed=JSON.parse(evt.target.result);
        const validation=Logbook.validateSlice(parsed,expectedPersonId);
        if(!validation.valid){
          const errEl=$('#logbook-error');
          if(errEl){errEl.style.display='block';errEl.textContent=validation.error;}
          else toast('Slice error: '+validation.error);
          return;
        }
        Logbook.setPersonalSlice(parsed);
        currentLogbookSlice=parsed;
        render();
        toast('Personal logbook slice loaded into memory.');
      }catch(parseErr){toast('Could not parse JSON slice: '+parseErr.message);}
    };
    reader.readAsText(file);
  };
  if($('#unload-logbook-btn'))$('#unload-logbook-btn').onclick=()=>{
    Logbook.clearPersonalSlice();
    currentLogbookSlice=null;
    render();
    toast('Personal logbook slice unloaded.');
  };
}

let orgSearchQuery='';
let orgGroupFilter='all';
let orgFullGroupShows=new Set();
let orgExpandedGroups=new Set(ORG_GROUPS.map(g=>g.id).concat(['other']));

function renderOrgRow(r){
  const f=r.fields;
  const resp=f['Team / responsibility']||'Untitled responsibility';
  const members=f.Members||'—';
  const role=f.Role||'—';
  const isStarred=workspace.favorites.includes(r.id);
  const hasEdits=Boolean(workspace.edits[r.id]);
  const isDraft=r.id.startsWith('local:');
  const isSLS=r.row===36||r.id==='OrgStructure:36';

  return `<tr class="org-row ${hasEdits?'has-local-edits':''}">
    <td class="org-cell-resp" data-label="Responsibility">
      <div class="org-resp-name">
        <strong>${esc(resp)}</strong>
        ${hasEdits?chip('Local changes','local-chip'):''}
        ${isDraft?chip('Local draft','local-chip'):''}
        ${r.flags?.length?chip('Verify','review-chip'):''}
      </div>
      <small class="muted org-source-ref">${esc(source(r))}</small>
    </td>
    <td class="org-cell-people" data-label="Recorded people">
      <div class="org-people-text ${isSLS?'org-multiline-text':''}">${esc(members)}</div>
    </td>
    <td class="org-cell-role" data-label="Recorded role">
      <div class="org-role-text ${isSLS?'org-multiline-text':''}">${esc(role)}</div>
    </td>
    <td class="org-cell-actions" data-label="Actions">
      <div class="org-action-buttons">
        <button type="button" class="button primary small" data-open="${esc(r.id)}" data-area="OrgStructure">Details</button>
        <button type="button" class="icon-button star ${isStarred?'is-starred':''}" aria-label="${isStarred?'Unpin':'Pin'} ${esc(resp)}" data-star="${esc(r.id)}">${isStarred?'★':'☆'}</button>
      </div>
    </td>
  </tr>`;
}

function orgStructureView(){
  const allRecords=records('OrgStructure');
  const recordMap=new Map(allRecords.map(r=>[r.id,r]));

  const groupsData=ORG_GROUPS.map(g=>{
    const headingRecord=g.headingId?recordMap.get(g.headingId):null;
    const items=g.recordIds.map(id=>recordMap.get(id)).filter(Boolean);
    return {id:g.id,name:g.name,headingRecord,items};
  });

  const mappedIds=new Set([...ORG_GROUPS.flatMap(g=>g.recordIds),...ORG_HEADING_IDS]);
  const otherItems=allRecords.filter(r=>!mappedIds.has(r.id));
  if(otherItems.length>0){
    groupsData.push({
      id:'other',
      name:'Other source entries',
      headingRecord:null,
      items:otherItems
    });
  }

  const totalResponsibilities=groupsData.reduce((sum,g)=>sum+g.items.length,0);
  const queryTerms=orgSearchQuery.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const isFiltering=queryTerms.length>0||orgGroupFilter!=='all';

  function itemMatches(r){
    if(!queryTerms.length)return true;
    const hay=`${r.fields['Team / responsibility']||''} ${r.fields.Members||''} ${r.fields.Role||''}`.toLowerCase();
    return queryTerms.every(t=>hay.includes(t));
  }

  const processedGroups=groupsData.map(g=>{
    if(orgGroupFilter!=='all'&&g.id!==orgGroupFilter){
      return {...g,visibleItems:[],matchesCount:0,showFull:false,hiddenByGroupFilter:true};
    }
    const matchingItems=g.items.filter(itemMatches);
    const showFull=orgFullGroupShows.has(g.id);
    const visibleItems=(showFull||!queryTerms.length)?g.items:matchingItems;
    return {
      ...g,
      visibleItems,
      matchesCount:matchingItems.length,
      showFull,
      hiddenByGroupFilter:false
    };
  });

  const visibleResponsibilities=processedGroups.reduce((sum,g)=>sum+(g.hiddenByGroupFilter?0:g.visibleItems.length),0);

  const indexHtml=`<nav class="org-group-index" aria-label="Teams and leadership group overview">
    <div class="org-index-label">Overview:</div>
    <div class="org-index-chips">
      ${groupsData.map(g=>`
        <a href="#org-group-${g.id}" class="org-index-chip ${orgGroupFilter===g.id?'active':''}" data-jump-group="${g.id}">
          <span class="org-index-name">${esc(g.name)}</span>
          <span class="org-index-count">${g.items.length}</span>
        </a>
      `).join('')}
    </div>
  </nav>`;

  const toolbarHtml=`<div class="org-toolbar panel">
    <div class="org-toolbar-controls">
      <div class="org-search-wrap">
        <span class="org-search-icon" aria-hidden="true">⌕</span>
        <input type="search" id="org-search-input" class="input org-search-input" placeholder="Search responsibilities, people, or roles…" value="${esc(orgSearchQuery)}" aria-label="Filter teams and leadership">
        ${orgSearchQuery?`<button type="button" class="icon-button org-search-clear" id="org-clear-input" aria-label="Clear filter">×</button>`:''}
      </div>
      <label class="org-group-select-label">
        <span class="muted">Group:</span>
        <select class="select org-group-select" id="org-group-select" aria-label="Filter by group">
          <option value="all" ${orgGroupFilter==='all'?'selected':''}>All groups (${groupsData.length})</option>
          ${groupsData.map(g=>`<option value="${g.id}" ${orgGroupFilter===g.id?'selected':''}>${esc(g.name)} (${g.items.length})</option>`).join('')}
        </select>
      </label>
      <div class="org-expand-actions">
        <button type="button" class="button secondary small" id="org-expand-all">Expand all</button>
        <button type="button" class="button secondary small" id="org-collapse-all">Collapse all</button>
        ${isFiltering?`<button type="button" class="button secondary small" id="org-reset-filters">Reset view</button>`:''}
      </div>
    </div>
    <div class="org-toolbar-meta">
      <p class="muted" id="org-results-meta">
        ${isFiltering 
          ? `Showing ${visibleResponsibilities} of ${totalResponsibilities} responsibilities across ${processedGroups.filter(g=>!g.hiddenByGroupFilter&&g.visibleItems.length>0).length} groups.`
          : `${totalResponsibilities} responsibilities across ${groupsData.length} verified groups in workbook source order.`}
      </p>
    </div>
  </div>`;

  const groupsHtml=processedGroups.map(g=>{
    if(g.hiddenByGroupFilter)return '';
    if(queryTerms.length>0&&g.visibleItems.length===0&&!g.showFull)return '';

    const isOpen=queryTerms.length>0?(g.visibleItems.length>0):orgExpandedGroups.has(g.id);

    let filterNotice='';
    if(queryTerms.length>0&&!g.showFull&&g.matchesCount<g.items.length){
      filterNotice=`<div class="org-group-filter-banner">
        <span>Showing ${g.visibleItems.length} of ${g.items.length} responsibilities matching “${esc(orgSearchQuery)}”.</span>
        <button type="button" class="text-button org-toggle-full-btn" data-group="${g.id}">Show full group (${g.items.length})</button>
      </div>`;
    }else if(queryTerms.length>0&&g.showFull&&g.matchesCount<g.items.length){
      filterNotice=`<div class="org-group-filter-banner">
        <span>Showing all ${g.items.length} responsibilities (${g.matchesCount} matched “${esc(orgSearchQuery)}”).</span>
        <button type="button" class="text-button org-toggle-matches-btn" data-group="${g.id}">Show matches only (${g.matchesCount})</button>
      </div>`;
    }

    const rowsHtml=g.visibleItems.map(r=>renderOrgRow(r)).join('');

    return `<details class="panel org-group-section" id="org-group-${g.id}" ${isOpen?'open':''} data-group-id="${g.id}">
      <summary class="org-group-summary">
        <div class="org-group-header-info">
          <span class="org-group-chevron" aria-hidden="true">▾</span>
          <h2 class="org-group-title">${esc(g.name)}</h2>
          <span class="tag org-count-badge">${g.items.length} responsibilities</span>
        </div>
        <div class="org-group-header-actions" onclick="event.stopPropagation()">
          ${g.headingRecord?`
            <button type="button" class="button secondary small org-heading-btn" data-open="${esc(g.headingRecord.id)}" data-area="OrgStructure" title="Open source heading record ${esc(g.headingRecord.id)} (row ${g.headingRecord.row})">
              Source heading (row ${g.headingRecord.row}) ↗
            </button>
          `:''}
        </div>
      </summary>
      <div class="org-group-body">
        ${filterNotice}
        <div class="org-table-container">
          <table class="data-table org-table">
            <thead>
              <tr>
                <th scope="col" class="th-resp">Responsibility</th>
                <th scope="col" class="th-people">Recorded people</th>
                <th scope="col" class="th-role">Recorded role</th>
                <th scope="col" class="th-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml||'<tr><td colspan="4" class="empty-state">No matching responsibilities in this group.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </details>`;
  }).join('');

  const emptyStateHtml=(processedGroups.every(g=>g.hiddenByGroupFilter||(queryTerms.length>0&&g.visibleItems.length===0)))
    ? `<section class="empty-state panel">
        <h2>No matching responsibilities</h2>
        <p>No responsibilities or members matched “${esc(orgSearchQuery)}”.</p>
        <button type="button" class="button secondary" id="org-empty-clear">Clear filter</button>
      </section>`
    : '';

  const areas=groups['People']||['Members','OrgStructure','CRC','CRC - retired'];
  const areaTabsHtml=`<div class="toolbar area-tabs">${areas.map(t=>`<button class="button ${t==='OrgStructure'?'primary':'secondary'} small" data-go="${esc(t)}">${esc(sectionLabel(t))}</button>`).join('')}</div>`;

  $('#page').innerHTML=header('Teams & leadership',descriptions['OrgStructure']||'Responsibilities and teams, as recorded in the workbook.')+
    banner()+
    areaPicker()+
    areaTabsHtml+
    indexHtml+
    toolbarHtml+
    `<section class="org-groups-container">${groupsHtml||emptyStateHtml}</section>`;

  bindOrgEvents();
}

function bindOrgEvents(){
  const searchInput=$('#org-search-input');
  if(searchInput){
    searchInput.oninput=e=>{
      orgSearchQuery=e.target.value;
      render();
      const el=$('#org-search-input');
      if(el){el.focus();el.setSelectionRange(el.value.length,el.value.length);}
    };
  }
  if($('#org-clear-input')){
    $('#org-clear-input').onclick=()=>{
      orgSearchQuery='';
      orgFullGroupShows.clear();
      render();
    };
  }
  if($('#org-empty-clear')){
    $('#org-empty-clear').onclick=()=>{
      orgSearchQuery='';
      orgGroupFilter='all';
      orgFullGroupShows.clear();
      render();
    };
  }
  if($('#org-group-select')){
    $('#org-group-select').onchange=e=>{
      orgGroupFilter=e.target.value;
      render();
    };
  }
  if($('#org-expand-all')){
    $('#org-expand-all').onclick=()=>{
      document.querySelectorAll('.org-group-section').forEach(d=>{
        d.open=true;
        if(d.dataset.groupId)orgExpandedGroups.add(d.dataset.groupId);
      });
    };
  }
  if($('#org-collapse-all')){
    $('#org-collapse-all').onclick=()=>{
      document.querySelectorAll('.org-group-section').forEach(d=>{
        d.open=false;
        if(d.dataset.groupId)orgExpandedGroups.delete(d.dataset.groupId);
      });
    };
  }
  if($('#org-reset-filters')){
    $('#org-reset-filters').onclick=()=>{
      orgSearchQuery='';
      orgGroupFilter='all';
      orgFullGroupShows.clear();
      orgExpandedGroups=new Set(ORG_GROUPS.map(g=>g.id).concat(['other']));
      render();
    };
  }
  document.querySelectorAll('.org-toggle-full-btn').forEach(b=>{
    b.onclick=()=>{
      orgFullGroupShows.add(b.dataset.group);
      render();
    };
  });
  document.querySelectorAll('.org-toggle-matches-btn').forEach(b=>{
    b.onclick=()=>{
      orgFullGroupShows.delete(b.dataset.group);
      render();
    };
  });
  document.querySelectorAll('.org-group-section').forEach(d=>{
    d.ontoggle=()=>{
      if(!orgSearchQuery&&d.dataset.groupId){
        if(d.open)orgExpandedGroups.add(d.dataset.groupId);
        else orgExpandedGroups.delete(d.dataset.groupId);
      }
    };
  });
  document.querySelectorAll('[data-jump-group]').forEach(a=>{
    a.onclick=e=>{
      const gId=a.dataset.jumpGroup;
      const target=$(`#org-group-${gId}`);
      if(target){
        target.open=true;
        orgExpandedGroups.add(gId);
      }
    };
  });
}

function render(){
  nav();
  updateProfileDisplay();
  if(query.trim())globalResults();
  else if(tab==='Home')home();
  else if(tab==='Workspace')workspaceView();
  else if(tab==='admin/issues')adminIssuesView();
  else if(tab==='profile/logbook')personalLogbookView();
  else if(tab==='OrgStructure')orgStructureView();
  else listing();
  bindCalendarButtons();
  document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>navigate(b.dataset.go));
  document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>openRecord(b.dataset.open,b.dataset.area,b.dataset.role));
  document.querySelectorAll('[data-record-menu]').forEach(b=>b.onclick=e=>{e.stopPropagation();openRecordActionsMenu(b.dataset.recordMenu,b.dataset.area||tab);});
  document.querySelectorAll('.gap-action-btn').forEach(b=>b.onclick=e=>{e.stopPropagation();claimRole(b.dataset.open,b.dataset.role);});
  document.querySelectorAll('.staff-token').forEach(b=>b.onclick=e=>{e.stopPropagation();openStaffTokenDialog(b.dataset.sessionId,b.dataset.role,b.dataset.tokenName);});
  document.querySelectorAll('.staff-add-btn').forEach(b=>b.onclick=e=>{e.stopPropagation();openStaffAddDialog(b.dataset.sessionId,b.dataset.addRole);});
  document.querySelectorAll('[data-swap]').forEach(b=>b.onclick=()=>openSwapDialog(b.dataset.swap,b.dataset.role));
  if($('#commitments-open-prefs-btn'))$('#commitments-open-prefs-btn').onclick=()=>{const t=$('#admin-toggle');if(t)t.checked=isAdmin();updateProfileDisplay();$('#admin-prefs-dialog')?.showModal()};
  document.querySelectorAll('[data-star]').forEach(b=>b.onclick=e=>{e.stopPropagation();const id=b.dataset.star;const willBeStarred=!workspace.favorites.includes(id);if(mutate(w=>{w.favorites=willBeStarred?[...w.favorites,id]:w.favorites.filter(x=>x!==id)})){document.querySelectorAll(`[data-star="${CSS.escape?CSS.escape(id):id}"]`).forEach(starBtn=>{starBtn.textContent=willBeStarred?'★':'☆';starBtn.classList.toggle('is-starred',willBeStarred);starBtn.setAttribute('aria-label',`${willBeStarred?'Unpin':'Pin'} record`);});if(filter==='Pinned'||tab==='Home')render();else toast(willBeStarred?'Pinned to favorites':'Unpinned from favorites');}});
  document.querySelectorAll('.schedule-secondary-filters').forEach(d=>d.ontoggle=()=>{if(window.innerWidth<=760)scheduleFiltersOpen=d.open});
  document.querySelectorAll('[data-clear-filters]').forEach(b=>b.onclick=()=>$('#clear')?.click());
  $('#global-search').placeholder='Search all Academy records…';if(db[tab]&&!query.trim())arrangeScheduleFilters();
  attachMatrixWindowing();
  attachLogbookWindowing();
}

let currentMatrixWindow = null;
function attachMatrixWindowing() {
  if (typeof WindowedList === 'undefined' || mode !== 'matrix' || tab !== 'Morning Report') {
    if (currentMatrixWindow) { currentMatrixWindow.destroy(); currentMatrixWindow = null; }
    return;
  }
  const container = document.querySelector('.matrix-container');
  if (!container) return;
  const currentFiltered = filtered();
  const { weeks } = scheduleGroups(currentFiltered);
  const flatItems = [];
  for (const w of weeks) {
    flatItems.push({ type: 'week', week: w });
    for (const r of w.records) {
      flatItems.push({ type: 'record', record: r });
    }
  }
  if (flatItems.length <= 50) return;

  if (currentMatrixWindow) currentMatrixWindow.destroy();

  currentMatrixWindow = WindowedList.attach(container, {
    items: flatItems,
    itemHeight: 48,
    overscan: 8,
    colspan: 7,
    tbodySelector: 'tbody',
    renderRow: renderMatrixItem,
    onWindowChange: ({ isExpanded }) => {
      const btn = document.querySelector('#matrix-window-toggle-btn');
      if (btn) btn.textContent = isExpanded ? 'Collapse to virtual scroll' : 'Show all for Find (Ctrl+F)';
      bindCalendarButtons(container);
    }
  });

  const toggleBtn = document.querySelector('#matrix-window-toggle-btn');
  if (toggleBtn) {
    toggleBtn.onclick = () => {
      if (currentMatrixWindow) currentMatrixWindow.toggleShowAll();
    };
  }

  if (!container.dataset.eventsBound) {
    container.dataset.eventsBound = 'true';
    container.addEventListener('click', e => {
      const star = e.target.closest('[data-star]');
      if (star) {
        e.stopPropagation();
        const id = star.dataset.star;
        const willBeStarred = !workspace.favorites.includes(id);
        if (mutate(w => {
          w.favorites = willBeStarred ? [...w.favorites, id] : w.favorites.filter(x => x !== id);
        })) {
          container.querySelectorAll(`[data-star="${CSS.escape ? CSS.escape(id) : id}"]`).forEach(starBtn => {
            starBtn.textContent = willBeStarred ? '★' : '☆';
            starBtn.classList.toggle('is-starred', willBeStarred);
            starBtn.setAttribute('aria-label', `${willBeStarred ? 'Unpin' : 'Pin'} record`);
          });
          if (filter === 'Pinned') render();
          else toast(willBeStarred ? 'Pinned to favorites' : 'Unpinned from favorites');
        }
        return;
      }
      const token = e.target.closest('.staff-token');
      if (token) {
        e.stopPropagation();
        openStaffTokenDialog(token.dataset.sessionId, token.dataset.role, token.dataset.tokenName);
        return;
      }
      const addBtn = e.target.closest('.staff-add-btn');
      if (addBtn) {
        e.stopPropagation();
        openStaffAddDialog(addBtn.dataset.sessionId, addBtn.dataset.addRole);
        return;
      }
      const gap = e.target.closest('.gap-action-btn');
      if (gap) {
        e.stopPropagation();
        claimRole(gap.dataset.open, gap.dataset.role);
        return;
      }
      const menuBtn = e.target.closest('[data-record-menu]');
      if (menuBtn) {
        e.stopPropagation();
        openRecordActionsMenu(menuBtn.dataset.recordMenu, menuBtn.dataset.area || tab);
        return;
      }
      const open = e.target.closest('[data-open]');
      if (open) {
        openRecord(open.dataset.open, open.dataset.area, open.dataset.role);
        return;
      }
    });
  }
}

let currentLogbookWindow = null;
function renderLogbookPastRow(e, index) {
  return `<tr data-index="${index}"><td data-label="Date"><strong>${esc(e.date)}</strong></td><td data-label="Series">${esc(e.series || 'Morning Report')}</td><td data-label="Role"><span class="tag">${esc(e.role || 'Unspecified')}</span></td><td data-label="Title">${esc(e.title || 'Morning Report')}</td><td data-label="Source"><small class="muted">${esc(e.sessionId || e.id)}</small></td></tr>`;
}

function attachLogbookWindowing() {
  if (window.innerWidth<=760 || typeof WindowedList === 'undefined' || tab !== 'profile/logbook') {
    if (currentLogbookWindow) { currentLogbookWindow.destroy(); currentLogbookWindow = null; }
    return;
  }
  const container = document.querySelector('.logbook-table-container');
  if (!container) return;
  const slice = typeof Logbook !== 'undefined' ? Logbook.getPersonalSlice() : null;
  if (!slice || !Array.isArray(slice.entries)) return;
  const data = Logbook.processLogbook(slice);
  if (data.pastEntries.length <= 50) return;

  if (currentLogbookWindow) currentLogbookWindow.destroy();

  currentLogbookWindow = WindowedList.attach(container, {
    items: data.pastEntries,
    itemHeight: 44,
    overscan: 6,
    colspan: 5,
    tbodySelector: 'tbody',
    renderRow: renderLogbookPastRow,
    onWindowChange: ({ isExpanded }) => {
      const btn = document.querySelector('#logbook-window-toggle-btn');
      if (btn) btn.textContent = isExpanded ? 'Collapse to virtual scroll' : 'Show all for Find (Ctrl+F)';
    }
  });

  const toggleBtn = document.querySelector('#logbook-window-toggle-btn');
  if (toggleBtn) {
    toggleBtn.onclick = () => {
      if (currentLogbookWindow) currentLogbookWindow.toggleShowAll();
    };
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
      if (currentMatrixWindow && !currentMatrixWindow.isExpanded()) {
        currentMatrixWindow.toggleShowAll(true);
      }
      if (currentLogbookWindow && !currentLogbookWindow.isExpanded()) {
        currentLogbookWindow.toggleShowAll(true);
      }
    }
  });
}

let lastClaim = null;
const claimInFlight = new Set();

function claimRole(sessionId, role) {
  const user = typeof Identity !== 'undefined' ? Identity.getCurrentUser() : null;
  if (!user || !user.name) {
    openQuickClaim(sessionId, role);
    return { success: false, fallback: true };
  }

  try {
    const latest = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (latest && latest.edits) workspace = latest;
  } catch {}

  const r = records('Morning Report').find(x => x.id === sessionId);
  if (!r) return { success: false, reason: 'not-found' };

  const SUPPORTED_ROLES = ['Facilitator', 'Presenter', 'Scribe', 'Teaching Points'];
  if (!SUPPORTED_ROLES.includes(role)) return { success: false, reason: 'unsupported-role' };

  if (!mrGaps(r).includes(role)) {
    const currentVal = staffingRoleValue(r, role);
    toast(`Role already assigned: ${currentVal || 'Occupied'}`);
    return { success: false, reason: 'occupied', currentVal };
  }

  const norm = s => String(s || '').trim().toLowerCase();
  const currentVal = staffingRoleValue(r, role);
  if (norm(currentVal) === norm(user.name)) {
    return { success: true, deduplicated: true };
  }

  const clickKey = `${sessionId}::${role}`;
  if (claimInFlight.has(clickKey)) {
    return { success: true, deduplicated: true };
  }
  claimInFlight.add(clickKey);
  setTimeout(() => claimInFlight.delete(clickKey), 400);

  let changedField = role;
  let newValue = user.name;
  let prevValue = '';

  if (role === 'Scribe' || role === 'Teaching Points') {
    changedField = 'Scribe / teaching points sign-ups';
    const currentSignups = r.fields[changedField] || '';
    prevValue = (workspace.edits[r.id]?.[changedField] !== undefined)
      ? workspace.edits[r.id][changedField]
      : currentSignups;

    const rolePat = role === 'Teaching Points' ? '(?:Teaching Points|TP)' : 'Scribe';
    const segmentRegex = new RegExp(`(^|[\\r\\n|])([^\\S\\r\\n]*${rolePat}:[^\\S\\r\\n]*)([^|\\r\\n]*)(?=[|\\r\\n]|$)`, 'i');

    if (segmentRegex.test(currentSignups)) {
      newValue = currentSignups.replace(segmentRegex, (m, p1, p2) => {
        const labelWithSpace = p2.endsWith(' ') ? p2 : p2 + ' ';
        return `${p1}${labelWithSpace}${user.name}`;
      });
    } else {
      newValue = currentSignups ? `${currentSignups}\n${role}: ${user.name}` : `${role}: ${user.name}`;
    }
  } else {
    changedField = role;
    prevValue = (workspace.edits[r.id]?.[changedField] !== undefined)
      ? workspace.edits[r.id][changedField]
      : (r.fields[changedField] || '');
    newValue = user.name;
  }

  if (mutate(w => {
    w.edits[r.id] = {
      ...(w.edits[r.id] || {}),
      [changedField]: newValue
    };
    log(w, `Claimed ${role}`, r, 'Morning Report');
    if (user.name) w.reporterName = user.name;
  }, r.id)) {
    lastClaim = {
      sessionId: r.id,
      role,
      field: changedField,
      previousValue: prevValue,
      claimedValue: newValue,
      timestamp: Date.now()
    };
    render();
    toast(`Assigned ${user.name} as ${role} (Local test profile). Saved on this device.`, { undo: true });
    return { success: true, sessionId: r.id, role, field: changedField, value: newValue };
  }
  return { success: false };
}

function undoClaim() {
  if (!lastClaim) return false;
  const { sessionId, role, field, previousValue, claimedValue } = lastClaim;

  try {
    const latest = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (latest && latest.edits) workspace = latest;
  } catch {}

  const currentEdit = workspace.edits[sessionId]?.[field];
  if (currentEdit !== claimedValue) {
    toast('Cannot undo: assignment was modified since.');
    return false;
  }

  mutate(w => {
    if (previousValue === '' || previousValue === undefined) {
      if (w.edits[sessionId]) {
        delete w.edits[sessionId][field];
        if (Object.keys(w.edits[sessionId]).length === 0) {
          delete w.edits[sessionId];
        }
      }
    } else {
      w.edits[sessionId] = {
        ...(w.edits[sessionId] || {}),
        [field]: previousValue
      };
    }
    log(w, `Undid claim for ${role}`, originalRecord(sessionId, 'Morning Report') || { id: sessionId, fields: {} }, 'Morning Report');
  }, sessionId);

  lastClaim = null;
  render();
  toast(`Undid ${role} claim. Saved on this device.`);
  return true;
}

function openQuickClaim(id, role){
  const r = records('Morning Report').find(x => x.id === id);
  if (!r) return;
  quickClaimRecord = r;
  quickClaimRole = role;
  const diag = $('#quick-claim-dialog');
  if (!diag) return;
  $('#qc-eyebrow').textContent = `Morning Report · ${dateValue(r) || 'Upcoming'}`;
  $('#qc-title').textContent = `Sign Up for ${role}`;
  $('#qc-session-desc').textContent = `${title(r, 'Morning Report')} · ${SessionCore.formatSessionTime(r)}`;
  const nameInput = $('#qc-name');
  if (nameInput) {
    nameInput.value = workspace.reporterName || $('#profile-name')?.textContent || '';
  }
  diag.showModal();
}
if ($('#quick-claim-form')) {
  $('#quick-claim-form').onsubmit = (e) => {
    e.preventDefault();
    const name = $('#qc-name')?.value.trim();
    if (!name || !quickClaimRecord) return;
    const r = quickClaimRecord, role = quickClaimRole;
    const currentEdits = { ...r.fields, ...(workspace.edits[r.id] || {}) };
    if (role === 'Scribe' || role === 'Teaching Points') {
      const currentVal = currentEdits['Scribe / teaching points sign-ups'] || '';
      const rolePat = role === 'Teaching Points' ? '(?:Teaching Points|TP)' : 'Scribe';
      const lineRegex = new RegExp(`(^|\\r?\\n)([^\\S\\r\\n]*${rolePat}:[^\\S\\r\\n]*)([^\\r\\n|]*)(.*?)($|\\r?\\n)`, 'i');
      if (lineRegex.test(currentVal)) {
        currentEdits['Scribe / teaching points sign-ups'] = currentVal.replace(lineRegex, (match, p1, p2, p3, p4, p5) => `${p1}${p2}${name}${p4}${p5}`);
      } else {
        currentEdits['Scribe / teaching points sign-ups'] = (currentVal ? currentVal + '\n' : '') + `${role}: ${name}`;
      }
    } else {
      const cur = (currentEdits[role] || '').trim();
      currentEdits[role] = (cur && !/^(tbd|none|-|na|n\/a|—)$/i.test(cur)) ? `${cur}, ${name}` : name;
    }
    if (mutate(w => {
      const changedKey=(role==='Scribe'||role==='Teaching Points')?'Scribe / teaching points sign-ups':role;
      w.edits[r.id] = {...(w.edits[r.id]||{}),[changedKey]:currentEdits[changedKey]};
      log(w, `Claimed ${role}`, r, 'Morning Report');
      if (name) w.reporterName = name;
    }, r.id)) {
      $('#quick-claim-dialog').close();
      render();
      toast(`Assigned ${name} as ${role}! Saved on this device.`);
    }
  };
}

let activeStaffToken = null;

function openStaffTokenDialog(sessionId, role, name) {
  const diag = $('#staff-token-dialog');
  if (!diag) return;
  activeStaffToken = { sessionId, role, name };
  const titleEl = $('#st-dialog-title');
  if (titleEl) {
    titleEl.textContent = `${name} (${role})`;
  }
  const swapContainer = $('#st-swap-input-container');
  const actionsBody = $('#st-dialog-body');
  if (swapContainer) swapContainer.style.display = 'none';
  if (actionsBody) actionsBody.style.display = 'flex';
  const newNameInput = $('#st-new-name');
  if (newNameInput) newNameInput.value = '';
  diag.showModal();
}

function openStaffAddDialog(sessionId, role) {
  const diag = $('#staff-token-dialog');
  if (!diag) return;
  activeStaffToken = { sessionId, role, name: '', isAdd: true };
  const titleEl = $('#st-dialog-title');
  if (titleEl) {
    titleEl.textContent = `Add ${role}`;
  }
  const swapContainer = $('#st-swap-input-container');
  const actionsBody = $('#st-dialog-body');
  if (actionsBody) actionsBody.style.display = 'none';
  if (swapContainer) {
    swapContainer.style.display = 'block';
    const label = swapContainer.querySelector('label');
    if (label) label.firstChild.textContent = `New ${role}'s name`;
    const confirmBtn = $('#st-swap-confirm-btn');
    if (confirmBtn) confirmBtn.textContent = 'Add Person';
  }
  const newNameInput = $('#st-new-name');
  if (newNameInput) {
    newNameInput.value = '';
    setTimeout(() => newNameInput.focus(), 50);
  }
  diag.showModal();
}

function bindStaffTokenDialogEvents() {
  const diag = $('#staff-token-dialog');
  if (!diag || diag.dataset.eventsBound) return;
  diag.dataset.eventsBound = 'true';

  const swapBtn = $('#st-swap-btn');
  const removeBtn = $('#st-remove-btn');
  const swapContainer = $('#st-swap-input-container');
  const actionsBody = $('#st-dialog-body');
  const swapBackBtn = $('#st-swap-back-btn');
  const swapConfirmBtn = $('#st-swap-confirm-btn');
  const newNameInput = $('#st-new-name');

  if (swapBtn) {
    swapBtn.onclick = () => {
      if (actionsBody) actionsBody.style.display = 'none';
      if (swapContainer) {
        swapContainer.style.display = 'block';
        const label = swapContainer.querySelector('label');
        if (label) label.firstChild.textContent = "Replacement person's name";
        if (swapConfirmBtn) swapConfirmBtn.textContent = 'Confirm Swap';
        if (newNameInput) {
          newNameInput.value = '';
          newNameInput.focus();
        }
      }
    };
  }

  if (swapBackBtn) {
    swapBackBtn.onclick = () => {
      if (activeStaffToken?.isAdd) {
        diag.close();
      } else {
        if (swapContainer) swapContainer.style.display = 'none';
        if (actionsBody) actionsBody.style.display = 'flex';
      }
    };
  }

  if (removeBtn) {
    removeBtn.onclick = () => {
      if (!activeStaffToken) return;
      const { sessionId, role, name } = activeStaffToken;
      removeStaffToken(sessionId, role, name);
      diag.close();
      toast(`Removed ${name} from ${role}.`);
    };
  }

  if (swapConfirmBtn) {
    swapConfirmBtn.onclick = () => {
      if (!activeStaffToken) return;
      const newName = newNameInput ? newNameInput.value.trim() : '';
      if (!newName) {
        if (newNameInput) newNameInput.focus();
        return;
      }
      const { sessionId, role, name, isAdd } = activeStaffToken;
      if (isAdd) {
        addStaffToken(sessionId, role, newName);
        diag.close();
        toast(`Added ${newName} as ${role}.`);
      } else {
        swapStaffToken(sessionId, role, name, newName);
        diag.close();
        toast(`Swapped ${name} with ${newName} for ${role}.`);
      }
    };
  }

  if (newNameInput) {
    newNameInput.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        swapConfirmBtn?.click();
      }
    };
  }
}
bindStaffTokenDialogEvents();
function openIssueModal(){
  const dialog=$('#issue-dialog');
  if(!dialog)return;
  const desc=$('#issue-description');if(desc)desc.value='';
  const rep=$('#issue-reporter');if(rep)rep.value=workspace.reporterName||'';
  const secSelect=$('#issue-section');
  if(secSelect){
    const knownSections=['Home','Morning Report','CPS Academy VMRs','Podcast Episodes','Schema review','Members','OrgStructure','CRC','CRC - retired','Research @CPSolvers','Conferences','Important links','Residency Programs','Special VMRs','Student Forum','Leader of the Week','Workspace'];
    const curSection=tab==='admin/issues'?'Home':tab;
    secSelect.innerHTML=knownSections.map(s=>`<option value="${esc(s)}" ${s===curSection?'selected':''}>${esc(s)}</option>`).join('');
  }
  if(!dialog.dataset.cancelBound){
    dialog.dataset.cancelBound='true';
    dialog.addEventListener('cancel',e=>{
      const text=$('#issue-description')?.value?.trim();
      if(text&&!confirm('You have an unsaved issue report. Discard it?')){e.preventDefault();}
    });
    dialog.querySelectorAll('[value="cancel"]').forEach(b=>{
      b.onclick=e=>{
        const text=$('#issue-description')?.value?.trim();
        if(text&&!confirm('You have an unsaved issue report. Discard it?')){e.preventDefault();e.stopPropagation();}
      };
    });
  }
  dialog.showModal();
}
function submitIssueReport(e){
  if(e)e.preventDefault();
  const desc=$('#issue-description')?.value.trim();
  if(!desc){toast('Please enter a description of what went wrong.');return;}
  const section=$('#issue-section')?.value||tab;
  const reporter=$('#issue-reporter')?.value.trim()||'Anonymous';
  if(reporter!=='Anonymous')workspace.reporterName=reporter;
  const newIssue={
    id:'issue:'+(typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():String(Date.now())),
    timestamp:new Date().toISOString(),
    reporter,
    section,
    description:desc,
    diagnostics:captureDiagnostics(),
    status:'Open'
  };
  if(mutate(w=>{
    if(!Array.isArray(w.issues))w.issues=[];
    w.issues.unshift(newIssue);
    w.history.unshift({action:'Reported issue',title:desc.slice(0,32)+(desc.length>32?'…':''),tab:section,at:new Date().toISOString()});
    w.history=w.history.slice(0,100);
    w.issues=w.issues.slice(0,50);
  })){
    dispatchIssueReport(newIssue);
    $('#issue-dialog')?.close();
    toast("Thanks! We've logged this and the team will look into it");
    if(tab==='admin/issues')render();
  }
}
function adminIssuesView(){
  if(!isAdmin()){navigate('Home');return;}
  const issues=workspace.issues||[];
  const total=issues.length;
  const openCount=issues.filter(i=>i.status==='Open').length;
  const inProgressCount=issues.filter(i=>i.status==='In Progress').length;
  const resolvedCount=issues.filter(i=>i.status==='Resolved').length;
  let filtered=[...issues];
  if(issueFilter!=='All')filtered=filtered.filter(i=>i.status===issueFilter);
  if(issueSectionFilter)filtered=filtered.filter(i=>i.section===issueSectionFilter);
  const sections=[...new Set(issues.map(i=>i.section).filter(Boolean))].sort();
  const cardsHtml=filtered.length?filtered.map(issue=>{
    const d=issue.diagnostics||{},errors=d.errorLogs||[];
    const statusClass=issue.status==='Resolved'?'ready-chip':issue.status==='In Progress'?'progress':'gap-chip';
    return `<article class="issue-card" data-issue-card="${esc(issue.id)}"><div class="issue-card-head"><div class="issue-badges"><span class="tag">${esc(issue.section||'General')}</span><span class="tag ${statusClass}">${esc(issue.status)}</span></div><span class="issue-time">${esc(new Date(issue.timestamp).toLocaleString())}</span></div><p class="issue-desc">${esc(issue.description)}</p><div class="issue-card-foot"><div class="issue-reporter">Reporter: <strong>${esc(issue.reporter||'Anonymous')}</strong></div><div style="display:flex;align-items:center;gap:8px;"><label style="font-size:11px;font-weight:700;color:var(--muted)">Status: <select class="issue-status-select" data-update-status="${esc(issue.id)}"><option value="Open" ${issue.status==='Open'?'selected':''}>Open</option><option value="In Progress" ${issue.status==='In Progress'?'selected':''}>In Progress</option><option value="Resolved" ${issue.status==='Resolved'?'selected':''}>Resolved</option></select></label></div></div><details class="issue-diagnostics"><summary><span>🛠 Technical Details &amp; Diagnostics</span> <small class="muted">${errors.length?`⚠ ${errors.length} error trace(s)`:'✓ Clean buffer'}</small></summary><div class="issue-diag-grid"><div class="issue-diag-box"><span>Route</span><strong>${esc(d.route||'Unknown')}</strong></div><div class="issue-diag-box"><span>Viewport</span><strong>${esc(d.viewport||'Unknown')}</strong></div><div class="issue-diag-box"><span>Workspace Ver.</span><strong>${esc(d.workspaceVersion||'cps-hub-workspace-v2')}</strong></div></div>${errors.length?`<div class="issue-error-trace">${errors.map(e=>`[${esc(e.time||'')}] ${esc(e.message||'')}${e.source?` (${esc(e.source)}:${esc(e.lineno||'')})`:''}${e.stack?'\n'+esc(e.stack):''}`).join('\n\n')}</div>`:'<p class="muted" style="margin:8px 0 0;font-size:11px;">No runtime errors captured in ring buffer at submission time.</p>'}</details></article>`;
  }).join(''):`<div class="empty-state panel"><h2>No issues match your filter</h2><p>Submitted member reports will appear here.</p></div>`;
  $('#page').innerHTML=header('Admin Issue Triage','Review member feedback, troubleshoot with background diagnostics, and manage resolution.')+banner()+`<section class="issue-stat-grid"><div class="issue-stat-card"><span>Total Issues</span><strong>${total}</strong></div><div class="issue-stat-card"><span>Open</span><strong style="color:var(--amber)">${openCount}</strong></div><div class="issue-stat-card"><span>Under Review</span><strong style="color:var(--blue)">${inProgressCount}</strong></div><div class="issue-stat-card"><span>Resolved</span><strong style="color:var(--teal)">${resolvedCount}</strong></div></section><div class="toolbar filter-bar"><label>Status<select class="select" id="issue-filter-select"><option value="All" ${issueFilter==='All'?'selected':''}>All statuses</option><option value="Open" ${issueFilter==='Open'?'selected':''}>Open (${openCount})</option><option value="In Progress" ${issueFilter==='In Progress'?'selected':''}>In Progress (${inProgressCount})</option><option value="Resolved" ${issueFilter==='Resolved'?'selected':''}>Resolved (${resolvedCount})</option></select></label>${sections.length?`<label>Section<select class="select" id="issue-section-filter-select"><option value="">All sections</option>${sections.map(s=>`<option value="${esc(s)}" ${issueSectionFilter===s?'selected':''}>${esc(s)}</option>`).join('')}</select></label>`:''}<button class="button secondary small" id="clear-issue-filters">Clear filters</button><div class="toolbar spacer"></div><button class="button secondary small" id="export-issues-json-btn">Export Issues (JSON)</button><button class="button secondary small" id="export-issues-csv-btn">Export Issues (CSV)</button></div><section class="issue-feed">${cardsHtml}</section>`;
  $('#issue-filter-select').onchange=e=>{issueFilter=e.target.value;render();};
  if($('#issue-section-filter-select'))$('#issue-section-filter-select').onchange=e=>{issueSectionFilter=e.target.value;render();};
  $('#clear-issue-filters').onclick=()=>{issueFilter='All';issueSectionFilter='';render();};
  $('#export-issues-json-btn').onclick=exportIssuesJson;
  $('#export-issues-csv-btn').onclick=exportIssuesCsv;
  document.querySelectorAll('[data-update-status]').forEach(sel=>{
    sel.onchange=e=>{
      const issueId=sel.dataset.updateStatus,nextStatus=e.target.value;
      if(mutate(w=>{
        const item=(w.issues||[]).find(i=>i.id===issueId);
        if(item){
          item.status=nextStatus;
          w.history.unshift({action:`Issue marked ${nextStatus}`,title:item.description.slice(0,30),tab:'Admin Issues',at:new Date().toISOString()});
          w.history=w.history.slice(0,100);
        }
      })){render();toast(`Issue status updated to ${nextStatus}`);}
    };
  });
}
function exportIssuesJson(){
  const issues=workspace.issues||[];
  const blob=new Blob([JSON.stringify({format:'cps-issues-v1',exported:new Date().toISOString(),total:issues.length,issues},null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`cps-academy-issues-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Issues log exported as JSON');
}
function exportIssuesCsv(){
  const issues=workspace.issues||[];
  const headers=['ID','Timestamp','Status','Section','Reporter','Description','Route','Viewport','WorkspaceVersion','ErrorCount'];
  const rows=issues.map(i=>{
    const d=i.diagnostics||{};
    return [i.id,i.timestamp,i.status,i.section,i.reporter,i.description,d.route||'',d.viewport||'',d.workspaceVersion||'',(d.errorLogs||[]).length].map(val=>`"${String(val??'').replace(/"/g,'""')}"`).join(',');
  });
  const blob=new Blob([[headers.join(','),...rows].join('\r\n')],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`cps-academy-issues-${today()}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Issues log exported as CSV');
}
function openRecordActionsMenu(id, area=tab){
 const r=records(area).find(x=>x.id===id);if(!r)return;
 const dialog=$('#record-actions-dialog');if(!dialog)return;
 $('#record-actions-eyebrow').textContent=`${area} · ${recordDate(r)||'Date TBD'}`;
 $('#record-actions-title').textContent=title(r,area);
 const isFav=workspace.favorites.includes(r.id);
 const pendingTime=Object.keys(r.session?.legacyOverrides||{}).some(k=>/Date|time/i.test(k));
 const timing=pendingTime?{status:'unresolved'}:SessionCore.parseSessionTime(r);
 const canCal=timing.status==='resolved'&&['Morning Report','CPS Academy VMRs','Special VMRs','Student Forum','Residency Programs'].includes(area);
 $('#record-actions-body').innerHTML=`
  <button type="button" class="button primary" id="menu-act-open" style="width:100%;justify-content:flex-start;">✎ Staff &amp; Edit Details</button>
  ${canCal?`<button type="button" class="button secondary" id="menu-act-cal" style="width:100%;justify-content:flex-start;">📅 Add to Calendar (${timing.durationAssumed?'60m assumed':'Export .ics'})</button>`:''}
  <button type="button" class="button secondary" id="menu-act-star" style="width:100%;justify-content:flex-start;">${isFav?'★ Unpin from Quick Access':'☆ Pin to Quick Access'}</button>
 `;
 $('#menu-act-open').onclick=()=>{dialog.close();openRecord(id,area);};
 if(canCal&&$('#menu-act-cal'))$('#menu-act-cal').onclick=()=>{dialog.close();downloadCalendar(id,area);};
 $('#menu-act-star').onclick=()=>{dialog.close();const willBeStarred=!workspace.favorites.includes(id);if(mutate(w=>{w.favorites=willBeStarred?[...w.favorites,id]:w.favorites.filter(x=>x!==id)})){render();toast(willBeStarred?'Pinned to favorites':'Unpinned from favorites');}};
 dialog.showModal();
}
function openRecord(id,t,role){editingTab=t;selected=records(t).find(r=>r.id===id);mutate(w=>{w.recent=[{id,tab:t,at:new Date().toISOString()},...(w.recent||[]).filter(x=>x.id!==id)].slice(0,10);});editDialog(false,role)}
function createRecord(){editingTab=db[tab]?tab:'Morning Report';selected={id:'local:'+crypto.randomUUID(),tab:editingTab,source:'Local draft',row:null,fields:Object.fromEntries(db[editingTab].columns.map(k=>[k,''])),links:{},flags:[]};editDialog(true)}
function getFormValues(){const f={};$('#dialog-content').querySelectorAll('[data-field]').forEach(el=>f[el.dataset.field]=el.value.trim());return f}
function isFormDirty(){if(reviewedSessionFields.size)return true;const cur=getFormValues();for(const k of Object.keys(initialFormValues)){if((cur[k]??'')!==(initialFormValues[k]??''))return true}return false}
function confirmDiscard(e){if(isFormDirty()){if(!confirm('You have unsaved changes. Discard them?')){if(e){e.preventDefault();e.stopPropagation()}return false}}return true}
function renderFieldControl(c,val,r,req){
 const multiline=/notes|remarks|meeting|sign-ups|comments|details|social handles/i.test(c);
 if(multiline)return `<textarea data-field="${esc(c)}" ${req} rows="${/notes|remarks|sign-ups/i.test(c)?3:2}">${esc(val)}</textarea>`;
 const isDateCol=['Date','Release date','Start','End'].includes(c)||(editingTab==='CRC'&&c==='VMR date');
 if(isDateCol){
  if(!val||iso(val))return `<input class="input" type="date" data-field="${esc(c)}" value="${esc(val)}" ${req}>`;
  return `<div class="uncertain-field"><input class="input" type="text" data-field="${esc(c)}" value="${esc(val)}" ${req}><div class="uncertain-meta"><span class="field-hint">Uncertain source date (kept intact)</span><button type="button" class="text-button convert-date-btn" data-date-col="${esc(c)}">Pick calendar date</button></div></div>`;
 }
 const isLinkCol=['Link','Recording','Bonus learning'].includes(c);
 if(isLinkCol){
  if(!val||/^https?:\/\//i.test(val))return `<input class="input" type="url" inputmode="url" data-field="${esc(c)}" value="${esc(val)}" placeholder="https://..." ${req}>`;
  return `<input class="input" type="text" data-field="${esc(c)}" value="${esc(val)}" ${req}>`;
 }
 const yesNoCols=['Research writing','Data analytics','Cross-sectional studies','Systematic reviews','Qualitative studies','Case reports','Prior CPS publications','Uploaded'];
 if(yesNoCols.includes(c)){
  let opts=['','Yes','No'];if(val&&!opts.includes(val))opts.unshift(val);
  return `<select class="select" data-field="${esc(c)}" ${req}>${opts.map(o=>`<option value="${esc(o)}" ${o===val?'selected':''}>${esc(o||'Select…')}</option>`).join('')}</select>`;
 }
 if(editingTab==='CRC'&&c==='Status'){
  let opts=['','Presented','Inactive','Scheduled','Mentoring'];if(val&&!opts.includes(val))opts.unshift(val);
  return `<select class="select" data-field="${esc(c)}" ${req}>${opts.map(o=>`<option value="${esc(o)}" ${o===val?'selected':''}>${esc(o||'Select status…')}</option>`).join('')}</select>`;
 }
 if(editingTab==='Schema review'&&c==='Status'){
  let opts=['','uploaded','in review','ready','recorded','assigned'];if(val&&!opts.includes(val))opts.unshift(val);
  return `<select class="select" data-field="${esc(c)}" ${req}>${opts.map(o=>`<option value="${esc(o)}" ${o===val?'selected':''}>${esc(o||'Select status…')}</option>`).join('')}</select>`;
 }
 if(editingTab==='Research @CPSolvers'&&c==='Availability'){
  let opts=['','Available','NOT available (YET)','Limited'];if(val&&!opts.includes(val))opts.unshift(val);
  return `<select class="select" data-field="${esc(c)}" ${req}>${opts.map(o=>`<option value="${esc(o)}" ${o===val?'selected':''}>${esc(o||'Select availability…')}</option>`).join('')}</select>`;
 }
 return `<input class="input" type="text" data-field="${esc(c)}" value="${esc(val)}" ${req}>`;
}
function editDialog(isNew,targetRole){reviewedSessionFields=new Set();const r=selected;$('#dialog-eyebrow').textContent=isNew?'New '+editingTab:source(r);$('#dialog-title').textContent=isNew?'Create a record':title(r,editingTab);$('#dialog-content').innerHTML=`<p class="form-note">Saved on this device. No changes are sent to the live workbook.</p>${r.flags.length?`<details class="review-details"><summary>${r.flags.length} source details to verify</summary>${r.flags.map(f=>`<p>${esc(f)}</p>`).join('')}</details>`:''}${sessionNotice(r)}${sessionReviewControls(r)}${!isNew?calendarButton(r,editingTab):''}${editingTab==='Morning Report'?staffingTools():''}<div class="record-form">${db[editingTab].columns.map(c=>`<label class="record-field">${esc(c)}${c===titles[editingTab]?' *':''}${renderFieldControl(c,r.fields[c]??'',r,c===titles[editingTab]?'required':'')}${urls(r,c).map(u=>anchor(u,'Open '+c)).join('')}</label>`).join('')}</div>${!isNew?`<button type="button" class="text-button" id="restore-record">${r.id.startsWith('local:')?(r.session?.count>1?'Remove entire multi-session local draft':'Remove this local draft'):'Restore original workbook values'}</button><div id="restore-confirm"></div>`:''}`;$('#dialog-primary').textContent=isNew?'Create local record':'Save changes';$('#dialog-primary').dataset.isNew=String(isNew);if($('#restore-record'))$('#restore-record').onclick=()=>{$('#restore-confirm').innerHTML='<p>This discards this record’s local changes.</p><button type="button" class="button secondary" id="confirm-restore">Confirm restore / removal</button>';$('#confirm-restore').onclick=()=>{if(mutate(w=>{removeLocalRecord(w,r);log(w,'Restored / removed',r,editingTab)}, r.id)){initialFormValues=getFormValues();reviewedSessionFields.clear();$('#detail-dialog').close();render();toast('Local record restored or removed')}}};bindCalendarButtons($('#dialog-content'));$('#dialog-content').querySelectorAll('[data-confirm-session-field]').forEach(b=>b.onclick=()=>{reviewedSessionFields.add(b.dataset.confirmSessionField);b.textContent='Displayed value will be confirmed when saved';b.disabled=true});bindStaffingTools(targetRole);$('#dialog-content').querySelectorAll('.convert-date-btn').forEach(btn=>{btn.onclick=()=>{const col=btn.dataset.dateCol,input=$('#dialog-content').querySelector(`[data-field="${col}"]`);if(input){input.type='date';input.value='';input.focus();btn.closest('.uncertain-field')?.querySelector('.uncertain-meta')?.remove()}}});initialFormValues=getFormValues();$('#detail-dialog').showModal()}
function log(w,action,r,t){w.history.unshift({action,title:title(r,t),tab:t,at:new Date().toISOString()});w.history=w.history.slice(0,100)}
$('#dialog-primary').onclick=e=>{e.preventDefault();const form=$('#detail-dialog form');if(!form.reportValidity())return;const fields={};$('#dialog-content').querySelectorAll('[data-field]').forEach(el=>fields[el.dataset.field]=el.value.trim());if(!fields[titles[editingTab]]){toast('Please enter the required title or name.');return}const isNew=e.currentTarget.dataset.isNew==='true',r={...selected,fields};if(mutate(w=>{if(isNew)w.added.push(r);else w.edits[r.id]={...(w.edits[r.id]||{}),...changedFields(fields,initialFormValues,reviewedSessionFields)};log(w,isNew?'Created':'Updated',r,editingTab)}, r.id)){initialFormValues=getFormValues();reviewedSessionFields.clear();$('#detail-dialog').close();render();toast('Saved on this device')}};
$('#detail-dialog').addEventListener('cancel',e=>{if(!confirmDiscard(e))e.preventDefault()});
$('#detail-dialog').querySelectorAll('[value="cancel"]').forEach(b=>{b.onclick=e=>{if(!confirmDiscard(e)){e.preventDefault();e.stopPropagation()}}});
function exportBackup(){mutate(w=>{w.lastBackup=new Date().toISOString()});const blob=new Blob([JSON.stringify({format:'cps-hub-backup-v2',snapshot:'workbook-2026-09-06',exported:new Date().toISOString(),...workspace},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='cps-hub-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Backup downloaded')}
function workbookDiffHtml(){
  const editEntries = Object.entries(workspace.edits);
  const addedList = workspace.added;
  const totalDiffs = editEntries.length + addedList.length;

  if (totalDiffs === 0) {
    return `<section class="panel diff-summary-panel">
      <div class="panel-head">
        <div>
          <h2>Workbook Diff Summary</h2>
          <p>Local modifications compared against master workbook snapshot</p>
        </div>
        <span class="tag ready-chip">✓ Clean (0 modifications)</span>
      </div>
      <div class="empty-state" style="padding:24px 16px;">
        <p>No local modifications. Current workspace matches master workbook snapshot 100%.</p>
      </div>
    </section>`;
  }

  const diffItems = editEntries.map(([id, fields]) => {
    let orig = null;
    let tabName = '';
    for (const [t, grp] of Object.entries(db)) {
      const found = originalRecord(id,t);
      if (found) { orig = found; tabName = t; break; }
    }
    const changedKeys = Object.keys(fields).filter(k => (orig?.fields[k] ?? '') !== fields[k]);
    const recTitle = orig ? title(orig, tabName) : id;
    return `<div class="diff-entry">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
        <strong>${esc(recTitle)}</strong>
        <span class="tag">${esc(tabName)} · ${esc(id)}</span>
      </div>
      <div class="diff-keys">
        ${changedKeys.map(k => `<span class="diff-key">${esc(k)}</span>`).join('') || '<span class="muted">No changed keys</span>'}
      </div>
    </div>`;
  }).join('');

  const addedItems = addedList.map(r => `
    <div class="diff-entry">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
        <strong>${esc(title(r, r.tab))} (New Draft)</strong>
        <span class="tag ready-chip">${esc(r.tab)}</span>
      </div>
    </div>
  `).join('');

  return `<section class="panel diff-summary-panel">
    <div class="panel-head">
      <div>
        <h2>Workbook Diff Summary</h2>
        <p>Active local modifications compared against master workbook snapshot</p>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <button class="button secondary small" id="export-patch-btn">Export Spreadsheet Patch JSON</button>
        <span class="tag gap-chip">${totalDiffs} modification${totalDiffs===1?'':'s'}</span>
      </div>
    </div>
    <div class="diff-stat-grid">
      <div class="diff-stat-box"><span>Modified Records</span><strong>${editEntries.length}</strong></div>
      <div class="diff-stat-box"><span>New Records (Drafts)</span><strong>${addedList.length}</strong></div>
      <div class="diff-stat-box"><span>Total Modifications</span><strong>${totalDiffs}</strong></div>
    </div>
    <div class="diff-list" style="margin-top:12px;">
      ${diffItems}
      ${addedItems}
    </div>
  </section>`;
}

let pendingImportData = null;
async function importBackup(e){
  try{
    const file = e.target.files[0];
    if(!file) return;
    if(file.size > 10000000) throw Error('Backup exceeds 10 MB');
    const b = JSON.parse(await file.text());
    if(b.format !== 'cps-hub-backup-v2' || b.snapshot !== 'workbook-2026-09-06' || !Array.isArray(b.added) || !Array.isArray(b.favorites) || !b.edits || typeof b.edits !== 'object' || Array.isArray(b.edits)) throw Error('Unsupported backup format');
    const known = new Map();
    const register=(r,t)=>{known.set(r.id,t);sessionRecords(r,t,{}).forEach(child=>known.set(child.id,t))};
    Object.entries(db).forEach(([t,v])=>v.records.forEach(r=>register(r,t)));
    workspace.added.forEach(r => register(r,r.tab));
    const added = b.added.map(r => {
      if(!r.id?.startsWith('local:') || !db[r.tab] || !r.fields) throw Error('Invalid draft');
      validateFields(r.fields,r.tab);
      const draft={id:r.id,tab:r.tab,fields:{...r.fields},source:'Local draft',row:null,flags:[],links:{}};
      register(draft,draft.tab);return draft;
    });
    for(const r of added) validateFields(r.fields, r.tab);
    for(const [id, fields] of Object.entries(b.edits)){
      if(!known.has(id)) throw Error('Record is not in this snapshot');
      validateFields(fields, known.get(id));
    }
    if(!b.favorites.every(id => typeof id === 'string' && known.has(id))) throw Error('Invalid pin');

    const existingDraftIds = new Set(workspace.added.map(a => a.id));
    const newDraftsCount = added.filter(a => !existingDraftIds.has(a.id)).length;
    const modifiedRecordsCount = Object.keys(b.edits).length;
    const overwrittenLocalEdits = Object.keys(b.edits).filter(id => workspace.edits[id]).length;
    const newPinsCount = b.favorites.filter(id => !workspace.favorites.includes(id)).length;

    pendingImportData = { b, added, fileName: file.name };

    $('#import-preview-body').innerHTML = `
      <p>Review incoming changes before applying them to your workspace.</p>
      <div class="preview-stat-grid">
        <div class="preview-stat-box"><span>New Drafts</span><strong>${newDraftsCount}</strong></div>
        <div class="preview-stat-box"><span>Records Merged</span><strong>${modifiedRecordsCount}</strong></div>
        <div class="preview-stat-box"><span>Local Overwrites</span><strong class="${overwrittenLocalEdits ? 'gap-text' : ''}">${overwrittenLocalEdits}</strong></div>
      </div>
      <p class="muted" style="font-size:11px;">Snapshot: <code>${esc(b.snapshot)}</code> · ${newPinsCount} new pin(s)</p>
      <div class="preview-list">
        <strong>Sample affected records:</strong>
        ${Object.keys(b.edits).slice(0, 5).map(id => `<div>• Record <code>${esc(id)}</code> (${esc(known.get(id))})</div>`).join('') || '<div>No modified records</div>'}
        ${added.slice(0, 5).map(r => `<div>• Draft: <code>${esc(title(r, r.tab))}</code> (${esc(r.tab)})</div>`).join('')}
      </div>
      <p class="form-note">An automatic rollback snapshot will be saved to sessionStorage before applying.</p>
    `;

    $('#modal-download-backup').onclick = () => exportBackup();
    $('#confirm-import-btn').onclick = () => confirmImport();
    $('#import-preview-dialog').showModal();
    e.target.value = '';
  }catch(error){
    toast('Import failed: ' + error.message);
    e.target.value = '';
  }
}

function confirmImport(){
  if(!pendingImportData) return;
  const { b, added, fileName } = pendingImportData;
  try {
    sessionStorage.setItem('cps-rollback-snapshot', JSON.stringify(workspace));
  } catch {
    toast('Import paused: this browser could not save a rollback copy. Download your backup and free browser storage before retrying.');
    return;
  }

  if(mutate(w=>{
    w.edits = {...w.edits, ...b.edits};
    const map = new Map(w.added.map(r => [r.id, r]));
    added.forEach(r => map.set(r.id, r));
    w.added = [...map.values()];
    w.favorites = [...new Set([...w.favorites, ...b.favorites])];
    w.history.unshift({action:'Imported backup', title:fileName, tab:'Workspace', at:new Date().toISOString()});
    w.history = w.history.slice(0, 100);
  })){
    $('#import-preview-dialog').close();
    pendingImportData = null;
    render();
    toast('Backup imported successfully. Rollback snapshot saved to session.');
  }
}

function rollbackImport(){
  try{
    const raw = sessionStorage.getItem('cps-rollback-snapshot');
    if(!raw) return toast('No rollback snapshot available.');
    const previous = JSON.parse(raw);
    invalidateAppCaches(null);
    if(save(previous)){
      sessionStorage.removeItem('cps-rollback-snapshot');
      render();
      toast('Rolled back to previous workspace snapshot.');
    }
  }catch(e){
    toast('Rollback failed: ' + e.message);
  }
}

function exportPatchJson(){
  const patch = {
    format: 'cps-hub-patch-v1',
    snapshot: 'workbook-2026-09-06',
    generated: new Date().toISOString(),
    edits: workspace.edits,
    added: workspace.added,
    diffSummary: {
      totalEditedRecords: Object.keys(workspace.edits).length,
      totalNewRecords: workspace.added.length
    }
  };
  const blob = new Blob([JSON.stringify(patch, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'cps-workbook-patch.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Spreadsheet patch exported');
}
function validateFields(fields,t){if(!fields||Array.isArray(fields)||typeof fields!=='object')throw Error('Invalid fields');for(const [k,v] of Object.entries(fields))if(!db[t].columns.includes(k)||(typeof v!=='string'&&typeof v!=='number'&&typeof v!=='boolean')||String(v).length>50000)throw Error('Invalid record field')}
function globalResults(){
  const terms=query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const searchFn = typeof SearchCore !== 'undefined' ? SearchCore.searchRecord : null;
  const found = Object.keys(db).flatMap(t => records(t).map(r => {
    if (searchFn) {
      const match = searchFn(r, t, terms);
      return match ? { r, t, matchInfo: match } : null;
    }
    return searchMatches(r, t, terms) ? { r, t } : null;
  }).filter(Boolean));
  const PAGE_SIZE=24,totalPages=Math.max(1,Math.ceil(found.length/PAGE_SIZE));
  searchPage=Math.min(searchPage,totalPages-1);
  const current=found.slice(searchPage*PAGE_SIZE,searchPage*PAGE_SIZE+PAGE_SIZE),start=found.length===0?0:searchPage*PAGE_SIZE+1,end=Math.min((searchPage+1)*PAGE_SIZE,found.length);
  const subtitle=found.length>PAGE_SIZE?`${found.length} matches across all workbook areas. Showing ${start}–${end} (page ${searchPage+1} of ${totalPages}).`:`${found.length} matches across all workbook areas.`;
  $('#page').innerHTML=header('Search the Academy',subtitle)+`<div class="toolbar"><button class="button secondary small" id="clear-search">← Return to ${esc(tab)}</button></div><section class="hub-grid">${current.map(({r,t})=>card(r,t,true)).join('')||'<div class="empty-state panel"><h2>No matching records</h2><p>Try searching for a name, topic, date, or workbook tab (e.g. Morning Report, OrgStructure, Podcasts).</p><button class="button secondary" id="empty-clear-search">Clear search</button></div>'}</section>${totalPages>1?`<div class="toolbar pagination"><button class="button secondary" id="search-prev" ${searchPage===0?'disabled':''}>Previous</button><span>Page ${searchPage+1} of ${totalPages}</span><button class="button secondary" id="search-next" ${(searchPage+1)*PAGE_SIZE>=found.length?'disabled':''}>Next</button></div>`:''}`;
  document.querySelectorAll('[data-snippet-target]').forEach(target => {
    const recId = target.dataset.snippetTarget;
    const item = current.find(x => x.r.id === recId);
    if (item && item.matchInfo && typeof SearchCore !== 'undefined') {
      target.replaceChildren();
      item.matchInfo.snippets.forEach(snip => {
        target.appendChild(SearchCore.createSnippetElement(snip));
      });
    }
  });
  document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>openRecord(b.dataset.open,b.dataset.area));
  document.querySelectorAll('[data-star]').forEach(b=>b.onclick=()=>{if(mutate(w=>{w.favorites=w.favorites.includes(b.dataset.star)?w.favorites.filter(id=>id!==b.dataset.star):[...w.favorites,b.dataset.star]}))globalResults()});
  const clearHandler=()=>{query='';searchPage=0;$('#global-search').value='';render()};
  if($('#clear-search'))$('#clear-search').onclick=clearHandler;
  if($('#empty-clear-search'))$('#empty-clear-search').onclick=clearHandler;
  if($('#search-prev'))$('#search-prev').onclick=()=>{searchPage--;globalResults();window.scrollTo(0,0)};
  if($('#search-next'))$('#search-next').onclick=()=>{searchPage++;globalResults();window.scrollTo(0,0)};
}
$('#global-search').oninput=e=>{query=e.target.value;searchPage=0;render()};$('#new-item-button').onclick=()=>{if(!db['Morning Report'])return toast('Please wait for the workbook to load');createRecord()};
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='k'){e.preventDefault();$('#global-search').focus()};if(e.key==='Escape'&&document.activeElement===$('#global-search')&&query.trim()){query='';searchPage=0;$('#global-search').value='';render()}});
$('.sync-card').onclick=()=>navigate('Workspace');$('.sync-card strong').textContent='Workbook snapshot';$('.sync-card small').textContent='Local changes · no live sync';$('.notification-button')?.remove();
if($('#feedback-trigger-btn'))$('#feedback-trigger-btn').onclick=openIssueModal;
if($('#issue-report-form'))$('#issue-report-form').onsubmit=submitIssueReport;
if($('#profile-options-btn'))$('#profile-options-btn').onclick=()=>{
  const t=$('#admin-toggle');if(t)t.checked=isAdmin();updateProfileDisplay();
  if(window.cpsAppearance){
    const cur=window.cpsAppearance.get(),th=$('#appearance-theme'),mo=$('#appearance-mode');
    if(th)th.value=cur.theme;if(mo)mo.value=cur.mode;
  }
  $('#admin-prefs-dialog')?.showModal();
};
if($('#mobile-prefs-btn'))$('#mobile-prefs-btn').onclick=()=>$('#profile-options-btn')?.click();
if($('#appearance-theme'))$('#appearance-theme').onchange=e=>{if(window.cpsAppearance)window.cpsAppearance.set({theme:e.target.value})};
if($('#appearance-mode'))$('#appearance-mode').onchange=e=>{if(window.cpsAppearance)window.cpsAppearance.set({mode:e.target.value})};
if($('#admin-toggle'))$('#admin-toggle').onchange=e=>setAdminMode(e.target.checked);
if($('#activate-mock-profile-btn'))$('#activate-mock-profile-btn').onclick=()=>{if(typeof Identity!=='undefined'){Identity.setMockUser(Identity.getDevelopmentProfile());updateProfileDisplay();render();toast('Local test profile active: Zakariyya G');}};
if($('#clear-mock-profile-btn'))$('#clear-mock-profile-btn').onclick=()=>{if(typeof Identity!=='undefined'){Identity.clearMockUser();updateProfileDisplay();render();toast('Local test profile cleared.');}};
if($('#nav-logbook-btn'))$('#nav-logbook-btn').onclick=()=>{($('#admin-prefs-dialog')?.close());navigate('profile/logbook');};
bindSwapEvents();
if(typeof Identity!=='undefined'){
  Identity.subscribe(user=>{
    if(typeof Logbook!=='undefined')Logbook.clearPersonalSlice();
    currentLogbookSlice=null;
    invalidateAppCaches(null);
    updateProfileDisplay();
    if(tab==='profile/logbook'||tab==='Workspace'||tab==='Home')render();
  });
}
window.addEventListener('hashchange',()=>{
  let t=decodeURIComponent(location.hash.slice(1));
  if(t.startsWith('/'))t=t.slice(1);
  if(t==='admin/issues'){if(!isAdmin()){toast('Admin access required.');navigate('Home');return}tab='admin/issues';render();window.scrollTo(0,0);return}
  if(t==='profile/logbook'){tab='profile/logbook';render();window.scrollTo(0,0);return}
  if(t!==tab&&(db[t]||['Home','Workspace'].includes(t)))navigate(t);
});
const loadWb = (typeof OfflineManager !== 'undefined' && OfflineManager.loadWorkbook) ? OfflineManager.loadWorkbook : () => fetch('workbook.json').then(r => { if (!r.ok) throw Error(); return r.json(); });
loadWb().then(data=>{db=data;for(const[t,grp]of Object.entries(db))for(const r of grp.records)r._search=buildSearchIndex(r,t);let hash=decodeURIComponent(location.hash.slice(1));if(hash.startsWith('/'))hash=hash.slice(1);if(hash==='admin/issues'){if(isAdmin())tab='admin/issues';else tab='Home';}else if(hash==='profile/logbook'){tab='profile/logbook';}else if(db[hash]||['Home','Workspace'].includes(hash))tab=hash;if(tab==='Morning Report')mode=(typeof window!=='undefined'&&window.innerWidth<=760)?'agenda':'matrix';sort=tab==='CPS Academy VMRs'?'date':'source';filter=tab==='Morning Report'?'Upcoming':'All';render();if(storageIssue)toast('Browser storage could not be read. Export changes before leaving.')}).catch(()=>{
  $('#page').innerHTML='<div class="empty-state"><h1>Could not load the workbook</h1><p>You appear to be offline without a cached copy, or the network request failed.</p><div style="margin-top:16px;"><button class="button primary" onclick="location.reload()">Retry connection</button></div></div>';
});

// Recognise only unambiguous calendar dates; leave the source text and timezones intact.
function recordDate(r){const raw=dateValue(r);if(!raw)return '';const isoCand=String(raw).trim().slice(0,10);if(iso(isoCand))return validDate(isoCand);const usM=String(raw).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(usM)return validDate(`${usM[3]}-${usM[1].padStart(2,'0')}-${usM[2].padStart(2,'0')}`);const months=['january','february','march','april','may','june','july','august','september','october','november','december'];const m=String(raw).toLowerCase().match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(\d{4})\b/);if(!m)return '';return validDate(`${m[3]}-${String(months.indexOf(m[1])+1).padStart(2,'0')}-${m[2].padStart(2,'0')}`)}
function validDate(s){const d=new Date(s+'T12:00:00Z');return Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==s?'':s}
function extraFilters(){let html=compoundSessionFilters();if(tab==='Podcast Episodes'){const owners=[...new Set(records('Podcast Episodes').flatMap(r=>[r.fields['Point person'],r.fields['Audio editor']].flatMap(v=>(v||'').split(/[/,;]/).map(s=>s.trim())).filter(Boolean)))].sort();html+=`<label>Owner<select class="select" id="owner-filter"><option value="">All owners</option>${owners.map(o=>`<option value="${esc(o)}" ${owner===o?'selected':''}>${esc(o)}</option>`).join('')}</select></label>`;}else if(tab==='Schema review'){const owners=[...new Set(records('Schema review').flatMap(r=>[r.fields['Video owner'],r.fields['Infographic owner']].map(s=>(s||'').trim()).filter(Boolean)))].sort();html+=`<label>Owner<select class="select" id="owner-filter"><option value="">All owners</option>${owners.map(o=>`<option value="${esc(o)}" ${owner===o?'selected':''}>${esc(o)}</option>`).join('')}</select></label>`;}if(tab==='Research @CPSolvers')html+=`<label>Research skill<select class="select" id="skill"><option value="">Any skill</option>${['Research writing','Data analytics','Cross-sectional studies','Systematic reviews','Qualitative studies','Case reports'].map(k=>`<option ${skill===k?'selected':''}>${esc(k)}</option>`).join('')}</select></label>`;if(records().some(r=>dateValue(r)))html+=`<label>From<input class="select" type="date" id="date-from" value="${esc(dateFrom)}"></label><label>To<input class="select" type="date" id="date-to" value="${esc(dateTo)}"></label>`;return html}
function bindExtraFilters(){bindCompoundSessionFilters();if($('#owner-filter'))$('#owner-filter').onchange=e=>{owner=e.target.value;page=0;render()};if($('#skill'))$('#skill').onchange=e=>{skill=e.target.value;page=0;render()};for(const id of ['date-from','date-to'])if($('#'+id))$('#'+id).onchange=e=>{if(id==='date-from')dateFrom=e.target.value;else dateTo=e.target.value;page=0;render()}}
function staffingTools(){return `<section class="staffing-tools"><h3>Quick staffing entry</h3><p>Choose a role and enter a name. This fills the form; use Save changes to keep it.</p><label>Role<select id="staff-role" class="select">${['Facilitator','Presenter','Scribe','Teaching Points','Active participant 1','Active participant 2','Active participant 3','Active participant 4','Chat support','Available team'].map(k=>`<option>${k}</option>`).join('')}</select></label><label>Name<input id="staff-name" placeholder="Name or team" autocomplete="off"></label><button type="button" class="button secondary" id="assign-name">Fill assignment</button><p id="staff-message" role="status"></p></section>`}
function bindStaffingTools(targetRole){if(!$('#assign-name'))return;if(targetRole&&$('#staff-role')){$('#staff-role').value=targetRole;if(typeof window!=='undefined'&&(window.innerWidth||0)>760){setTimeout(()=>$('#staff-name')?.focus(),60);}}$('#assign-name').onclick=()=>{const name=$('#staff-name').value.trim(),role=$('#staff-role').value;if(!name){$('#staff-message').textContent='Enter a name first.';return}if(role==='Scribe'||role==='Teaching Points'){const el=[...$('#dialog-content').querySelectorAll('[data-field]')].find(el=>el.dataset.field==='Scribe / teaching points sign-ups');if(el){const rolePat=role==='Teaching Points'?'(?:Teaching Points|TP)':'Scribe';const lineRegex=new RegExp(`(^|\\r?\\n)([^\\S\\r\\n]*${rolePat}:[^\\S\\r\\n]*)([^\\r\\n|]*)(.*?)($|\\r?\\n)`,`i`);if(lineRegex.test(el.value)){el.value=el.value.replace(lineRegex,(match,p1,p2,p3,p4,p5)=>`${p1}${p2}${name}${p4}${p5}`);}else{el.value=(el.value?el.value+'\n':'')+`${role}: ${name}`}el.dispatchEvent(new Event('input',{bubbles:true}));$('#staff-message').textContent=`${role} filled. Save changes to keep the assignment.`;el.focus();return}}const el=[...$('#dialog-content').querySelectorAll('[data-field]')].find(el=>el.dataset.field===role);if(!el)return;const current=el.value.trim();if(current&&!/^(tbd|none|-|na|n\/a|—)$/i.test(current)){if(current.split(/[,;\n&+/]/).some(s=>s.trim().toLowerCase()===name.toLowerCase())){$('#staff-message').textContent='That name is already assigned.';return}if(/\b(tbd|none|-)\b/i.test(current)){el.value=current.replace(/\b(tbd|none|-)\b/i,name)}else{el.value=current+', '+name}}else el.value=name;el.dispatchEvent(new Event('input',{bubbles:true}));$('#staff-message').textContent=`${role} filled. Save changes to keep the assignment.`;el.focus()}}

function mrGaps(r){const f=r.fields,fac=(f.Facilitator||'').trim();if(/canceled|cancelled/i.test(fac)||fac.toLowerCase()==='none'||(f.Type||'').trim().toLowerCase()==='none')return[];const gaps=[];if(!fac||/^(tbd|none|-|na|n\/a|—)$/i.test(fac)||/\b(tbd)\b/i.test(fac))gaps.push('Facilitator');const signups=f['Scribe / teaching points sign-ups']||'';const cleanSignups=signups.split(/\r?\n[-_]{3,}/)[0];const pres=(f.Presenter||'').trim()||(cleanSignups.match(/(?:^|[\r\n|])[^\S\r\n]*(?:Case Presenter|Presenter):[^\S\r\n]*([^\r\n|]+)/i)?.[1]||'').trim();if(!pres||/^(tbd|none|-|na|n\/a|—)$/i.test(pres))gaps.push('Presenter');const scribe=(cleanSignups.match(/(?:^|[\r\n|])[^\S\r\n]*Scribe:[^\S\r\n]*([^\r\n|]+)/i)?.[1]||'').trim();if(!scribe||/^(tbd|none|-|na|n\/a|—)$/i.test(scribe))gaps.push('Scribe');const tp=(cleanSignups.match(/(?:^|[\r\n|])[^\S\r\n]*(?:Teaching Points|TP):[^\S\r\n]*([^\r\n|]+)/i)?.[1]||'').trim();if(!tp||/^(tbd|none|-|na|n\/a|—)$/i.test(tp))gaps.push('Teaching Points');return gaps}

function getStaffingUrgency(sessionDate,referenceDate=today()){
 const days=staffingDays(sessionDate,referenceDate);
 return days===null||days<0||days>7?'open':days<2?'urgent':'upcoming';
}
function staffingDays(sessionDate,referenceDate=today()){
 if(!SessionCore.validDate(sessionDate)||!SessionCore.validDate(referenceDate))return null;
 return Math.round((Date.parse(sessionDate+'T00:00:00Z')-Date.parse(referenceDate+'T00:00:00Z'))/86400000);
}
function staffingHealth(rr,referenceDate=today()){
 let count=0,tomorrow=0,sessions=0;
 for(const r of rr){const d=staffingDays(SessionCore.parseDate(dateValue(r)),referenceDate);if(d===null||d<0||d>7)continue;sessions++;const n=mrGaps(r).length;count+=n;if(d===1)tomorrow+=n;}
 return {count,tomorrow,sessions};
}
function staffingHealthBadge(rr){
 const h=staffingHealth(rr);
 return `<span class="tag ${h.tomorrow?'slot-urgent':h.count?'slot-upcoming':h.sessions?'staffing-ready':'slot-open'}">${h.tomorrow?`${h.tomorrow} open slot${h.tomorrow===1?'':'s'} tomorrow`:h.count?`${h.count} open slot${h.count===1?'':'s'} this week`:h.sessions?'✓ Next 7 days fully staffed':'No sessions in the next 7 days'}</span>`;
}
function staffingRoleValue(r,role){
 if(role==='Facilitator')return r.fields.Facilitator||'';
 if(role==='Presenter'&&r.fields.Presenter)return r.fields.Presenter;
 const labels=role==='Presenter'?'(?:Case Presenter|Presenter)':role==='Teaching Points'?'(?:Teaching Points|TP)':'Scribe';
 const m=String(r.fields['Scribe / teaching points sign-ups']||'').match(new RegExp('(?:^|[\\n|])\\s*'+labels+':[^\\S\\r\\n]*([^\\r\\n|]*)','i'));
 return m?m[1].trim():'';
}
function tokenizeStaff(raw){
 if(!raw||typeof raw!=='string')return [];
 const text=raw.trim();
 if(!text||/^(?:tbd|none|n\/a|-|—)$/i.test(text))return [];
 let depth=0,current='',parts=[];
 const flush=()=>{
  const s=current.trim();
  if(s&&!/^(?:tbd|none|n\/a|-|—)$/i.test(s))parts.push(s);
  current='';
 };
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='(')depth++;
  if(c===')')depth=Math.max(0,depth-1);
  const natural=depth===0&&text.slice(i).match(/^(?:\s+(?:and|with)\s+|\s+w\/)/i);
  if(natural){flush();i+=natural[0].length-1;}
  else if(!depth&&/[&+/,|\n]/.test(c)){flush();}
  else{current+=c;}
 }
 flush();
 return parts;
}

function renderStaffTokens(namesArray, role, sessionId){
 const tokens=Array.isArray(namesArray)?namesArray:tokenizeStaff(namesArray);
 if(!tokens.length)return '';
 const tokensHtml=tokens.map(name=>{
  const noteMatch=name.match(/^([^(]+)(\([^)]+\))$/);
  const main=noteMatch?noteMatch[1].trim():name;
  const note=noteMatch?` <span class="staff-token-note">${esc(noteMatch[2])}</span>`:'';
  return `<button type="button" class="staff-token" data-token-name="${esc(name)}" data-role="${esc(role)}" data-session-id="${esc(sessionId)}" title="Click to swap or remove ${esc(main)}"><span class="staff-token-name">${esc(main)}</span>${note}</button>`;
 }).join('');
 return `<div class="staff-tokens-container" data-session-id="${esc(sessionId)}" data-role="${esc(role)}">${tokensHtml}<button type="button" class="staff-add-btn" data-add-role="${esc(role)}" data-session-id="${esc(sessionId)}" title="Add another ${esc(role)}">＋ Add</button></div>`;
}

function updateRoleAssignment(sessionId, role, updateFn){
 try{const latest=JSON.parse(localStorage.getItem(KEY)||'null');if(latest&&latest.edits)workspace=latest;}catch{}
  const r=records('Morning Report').find(x=>x.id===sessionId);
  if(!r)return {success:false,reason:'not-found'};
  const mergedFields={...r.fields,...(workspace.edits?.[sessionId]||{})};
  const mergedR={...r,fields:mergedFields};
  const currentVal=staffingRoleValue(mergedR,role);
 const currentTokens=tokenizeStaff(currentVal);
 const nextTokens=updateFn([...currentTokens]);
 if(!Array.isArray(nextTokens))return {success:false,reason:'invalid-update'};
 const usesSlash=/\s+\/\s+/.test(currentVal)&&!/\s+&\s+/.test(currentVal);
 const newRoleString=nextTokens.join(usesSlash?' / ':' & ');
 let changedField=role;
 let newValue=newRoleString;
 if(role==='Scribe'||role==='Teaching Points'){
  changedField='Scribe / teaching points sign-ups';
  const currentSignups=r.fields[changedField]||'';
  const rolePat=role==='Teaching Points'?'(?:Teaching Points|TP)':'Scribe';
  const segmentRegex=new RegExp(`(^|[\\r\\n|])([^\\S\\r\\n]*${rolePat}:[^\\S\\r\\n]*)([^|\\r\\n]*)(?=[|\\r\\n]|$)`,'i');
  if(segmentRegex.test(currentSignups)){
   newValue=currentSignups.replace(segmentRegex,(m,p1,p2)=>{
    const labelWithSpace=p2.endsWith(' ')?p2:p2+' ';
    return `${p1}${labelWithSpace}${newRoleString}`;
   });
  }else{
   newValue=currentSignups?`${currentSignups}\n${role}: ${newRoleString}`:`${role}: ${newRoleString}`;
  }
 }else if(role==='Presenter'&&!r.fields.Presenter&&r.fields['Scribe / teaching points sign-ups']){
  const currentSignups=r.fields['Scribe / teaching points sign-ups']||'';
  const presRegex=/(^|[\r\n|])([^\S\r\n]*(?:Case Presenter|Presenter):[^\S\r\n]*)([^|\r\n]*)(?=[|\r\n]|$)/i;
  if(presRegex.test(currentSignups)){
   changedField='Scribe / teaching points sign-ups';
   newValue=currentSignups.replace(presRegex,(m,p1,p2)=>{
    const labelWithSpace=p2.endsWith(' ')?p2:p2+' ';
    return `${p1}${labelWithSpace}${newRoleString}`;
   });
  }else{
   changedField='Presenter';
   newValue=newRoleString;
  }
 }else{
  changedField=role;
  newValue=newRoleString;
 }
 const success=mutate(w=>{
  w.edits[sessionId]={...(w.edits[sessionId]||{}),[changedField]:newValue};
  log(w,`Updated ${role}`,r,'Morning Report');
 },sessionId);
 if(success){
  render();
  return {success:true,newTokens:nextTokens,value:newValue};
 }
 return {success:false};
}

function swapStaffToken(sessionId, role, oldName, newName){
 if(!newName||!newName.trim())return {success:false,reason:'empty-name'};
 return updateRoleAssignment(sessionId,role,tokens=>{
  const idx=tokens.findIndex(t=>t.toLowerCase()===oldName.trim().toLowerCase());
  if(idx!==-1)tokens[idx]=newName.trim();
  else tokens.push(newName.trim());
  return tokens;
 });
}

function removeStaffToken(sessionId, role, nameToRemove){
 return updateRoleAssignment(sessionId,role,tokens=>{
  return tokens.filter(t=>t.toLowerCase()!==nameToRemove.trim().toLowerCase());
 });
}

function addStaffToken(sessionId, role, newName){
 if(!newName||!newName.trim())return {success:false,reason:'empty-name'};
 return updateRoleAssignment(sessionId,role,tokens=>{
  if(!tokens.some(t=>t.toLowerCase()===newName.trim().toLowerCase())){
   tokens.push(newName.trim());
  }
  return tokens;
 });
}

function staffingSlot(r,role){
 if(!mrGaps(r).includes(role)){
  const val=staffingRoleValue(r,role);
  const tokens=tokenizeStaff(val);
  if(tokens.length)return `<div class="matrix-slot-assigned staffing-people">${renderStaffTokens(tokens,role,r.id)}</div>`;
  return `<span class="matrix-slot-assigned staffing-people" title="${esc(val)}">${esc(val||'Not scheduled')}</span>`;
 }
 const timing=SessionCore.parseSessionTime(r);
 const isUncertain=(r.flags&&r.flags.some(f=>/moved|rescheduled|tentative|uncertain|verify|tbd/i.test(f)))||(r.session?.unresolved&&r.session.unresolved.length>0)||/moved|tentative|\?|tbd/i.test(r.fields.Date||'')||timing.status!=='resolved';
 const baseTier=getStaffingUrgency(SessionCore.parseDate(dateValue(r)));
 const tier=isUncertain?'open':baseTier;
 const label=isUncertain?`+ Open ${role} (Verify Date)`:(tier==='urgent'?`⚠ Urgent: ${role} Needed`:tier==='upcoming'?`◷ ${role} Needed`:`+ Open ${role}`);
 return `<button type="button" class="status-chip matrix-slot-btn matrix-slot-gap gap-action-btn slot-${tier}" data-status="${tier}" data-open="${esc(r.id)}" data-role="${esc(role)}" aria-label="${esc(label)}">${esc(label)}</button>`;
}
function staffingGrid(r){return `<div class="staffing-grid">${['Facilitator','Presenter','Scribe','Teaching Points'].map(role=>`<div class="staffing-role"><small>${role}</small>${staffingSlot(r,role)}</div>`).join('')}</div>`;}

function weekKey(isoDate){const d=new Date(isoDate+'T12:00:00Z'),day=d.getUTCDay(),diffToMon=(day===0?-6:1-day);const mon=new Date(d);mon.setUTCDate(d.getUTCDate()+diffToMon);const sun=new Date(mon);sun.setUTCDate(mon.getUTCDate()+6);const toIso=dt=>dt.toISOString().slice(0,10);return{start:toIso(mon),end:toIso(sun)}}
function weekLabel(start,end){const s=new Date(start+'T12:00:00Z'),e=new Date(end+'T12:00:00Z');return `Week of ${s.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'})} – ${e.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'})}`}
function scheduleGroups(rr){
 const weeks=new Map(),unresolved=[];
 for(const r of [...rr].sort((a,b)=>recordDate(a).localeCompare(recordDate(b)))){const date=recordDate(r);if(!date){unresolved.push(r);continue;}const k=weekKey(date);if(!weeks.has(k.start))weeks.set(k.start,{...k,records:[]});weeks.get(k.start).records.push(r);}
 return {weeks:[...weeks.values()],unresolved};
}
function scheduleSummary(rr){return `<div class="agenda-summary panel"><strong>${rr.length} session${rr.length===1?'':'s'} in this view</strong>${staffingHealthBadge(records('Morning Report'))}</div>`;}
function renderMatrixItem(item, index) {
 if (item.type === 'week') {
  return `<tr class="matrix-week-row" data-index="${index}"><td colspan="7">${esc(weekLabel(item.week.start, item.week.end))} · ${item.week.records.length} sessions</td></tr>`;
 }
 const r = item.record;
 return `<tr class="matrix-row${mrGaps(r).length ? ' matrix-row-has-gap' : ''}" data-index="${index}"><td><div class="matrix-date-cell"><strong>${esc(recordDate(r))}</strong><span class="matrix-time-sub">${esc(SessionCore.formatSessionTime(r))}</span></div></td><td><strong>${esc(r.fields.Type || 'Morning Report')}</strong></td>${['Facilitator','Presenter','Scribe','Teaching Points'].map(role => `<td>${staffingSlot(r, role)}</td>`).join('')}<td>${sessionNotice(r)}<div class="matrix-actions">${calendarButton(r, 'Morning Report', { compact: true })}<button class="icon-button star ${workspace.favorites.includes(r.id)?'is-starred':''}" data-star="${esc(r.id)}" aria-label="${workspace.favorites.includes(r.id) ? 'Unpin' : 'Pin'} record">${workspace.favorites.includes(r.id) ? '★' : '☆'}</button><button type="button" class="icon-button record-menu-btn" data-record-menu="${esc(r.id)}" data-area="Morning Report" title="Session actions" aria-label="Open session actions" aria-haspopup="dialog">⋯</button></div></td></tr>`;
}
function matrixView(rr){
 const {weeks,unresolved}=scheduleGroups(rr);
 const flatItems=[];
 for(const w of weeks){
  flatItems.push({type:'week',week:w});
  for(const r of w.records){
   flatItems.push({type:'record',record:r});
  }
 }
 const threshold = 50;
 const isWindowed = typeof WindowedList !== 'undefined' && flatItems.length > threshold;
 let rows = '';
 if (!isWindowed) {
  rows = flatItems.map((it, idx) => renderMatrixItem(it, idx)).join('');
 } else {
  const initialWin = WindowedList.computeWindow({ totalItems: flatItems.length, itemHeight: 48, containerHeight: 600, scrollTop: 0, overscan: 8 });
  const topSpacer = WindowedList.defaultSpacer(initialWin.topSpacerHeight, 'top', 7);
  const bottomSpacer = WindowedList.defaultSpacer(initialWin.bottomSpacerHeight, 'bottom', 7);
  const slice = flatItems.slice(initialWin.startIndex, initialWin.endIndex).map((it, i) => renderMatrixItem(it, initialWin.startIndex + i)).join('');
  rows = topSpacer + slice + bottomSpacer;
 }
 const windowToggleHtml = flatItems.length > threshold ? `<div class="window-toggle-bar"><span>Showing virtualized window (<strong>${flatItems.length}</strong> total items)</span><button type="button" class="button secondary small window-toggle-btn" id="matrix-window-toggle-btn">Show all for Find (Ctrl+F)</button></div>` : '';
 return `<section class="matrix-view">${scheduleSummary(rr)}${windowToggleHtml}<div class="matrix-card"><div class="matrix-container"><table class="matrix-table"><thead><tr>${['Date / Day','Session / Type','Facilitator','Presenter','Scribe','Teaching Points','Actions'].map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows||'<tr><td colspan="7">No dated sessions match these filters.</td></tr>'}</tbody></table></div></div>${unresolved.length?`<section class="panel unresolved-panel"><h2>Unresolved dates</h2>${unresolved.map(r=>agendaCard(r,true)).join('')}</section>`:''}</section>`;
}
function agendaView(rr){const {weeks,unresolved}=scheduleGroups(rr);return `<section class="agenda-view">${scheduleSummary(rr)}${weeks.map(w=>`<section class="agenda-week panel"><div class="agenda-week-head"><h3>${esc(weekLabel(w.start,w.end))}</h3><span>${w.records.length} sessions</span></div><div class="agenda-session-list">${w.records.map(r=>agendaCard(r)).join('')}</div></section>`).join('')}${unresolved.length?`<section class="panel unresolved-panel"><h2>Unresolved dates</h2>${unresolved.map(r=>agendaCard(r,true)).join('')}</section>`:''}</section>`;}
function agendaCard(r,isUnresolved=false){return `<article class="agenda-card"><div class="agenda-card-date"><strong>${esc(recordDate(r)||dateValue(r)||'Date TBD')}</strong></div><div class="agenda-card-body"><div class="agenda-card-top"><span class="tag">${esc(r.fields.Type||'Morning Report')}</span><span class="muted agenda-times">${esc(SessionCore.formatSessionTime(r))}</span></div>${staffingGrid(r)}</div><div class="agenda-card-actions">${sessionNotice(r)}${calendarButton(r,'Morning Report',{compact:true})}<button class="icon-button star ${workspace.favorites.includes(r.id)?'is-starred':''}" data-star="${esc(r.id)}" aria-label="${workspace.favorites.includes(r.id)?'Unpin':'Pin'} record">${workspace.favorites.includes(r.id)?'★':'☆'}</button><button type="button" class="icon-button record-menu-btn" data-record-menu="${esc(r.id)}" data-area="Morning Report" title="Session actions" aria-label="Open session actions" aria-haspopup="dialog">⋯</button></div></article>`;}
function recordStage(r,t){const f=r.fields;if(t==='Schema review'){const st=(f.Status||'').trim();if(!st)return 'Draft / Needs review';const lower=st.toLowerCase();if(lower==='uploaded')return 'Uploaded';if(lower==='in review')return 'In review';if(lower==='ready')return 'Ready';if(lower==='recorded')return 'Recorded';if(lower==='assigned')return 'Assigned';return st;}if(t==='Podcast Episodes'){const custom=(f.Status||'').trim();if(custom)return custom;const rel=f['Release date'];if(rel&&iso(rel)&&rel<=today())return 'Released';if(!f['Audio editor'])return 'Needs Audio Editor';if(!f['Point person'])return 'Needs Point Person';return 'In Editing';}return f.Status||'Active';}
function boardStages(rr,t){if(t==='Schema review'){const base=['Draft / Needs review','Assigned','In review','Ready','Uploaded'],custom=[...new Set(rr.map(r=>recordStage(r,t)))].filter(s=>!base.includes(s));return[...base.slice(0,base.length-1),...custom,base[base.length-1]];}if(t==='Podcast Episodes'){const base=['Needs Audio Editor','Needs Point Person','In Editing','Released'],custom=[...new Set(rr.map(r=>recordStage(r,t)))].filter(s=>!base.includes(s));return[...base.slice(0,base.length-1),...custom,base[base.length-1]];}return[...new Set(rr.map(r=>recordStage(r,t)))];}
function workflowCard(r,t,stages,stageIndex){const f=r.fields,stage=stages[stageIndex],prevStage=stageIndex>0?stages[stageIndex-1]:null,nextStage=stageIndex<stages.length-1?stages[stageIndex+1]:null;let metaHtml='';if(t==='Schema review'){metaHtml=`<p class="work-card-line"><small>Video:</small> <strong>${esc(f['Video owner']||'Unassigned')}</strong></p><p class="work-card-line"><small>Infographic:</small> <strong>${esc(f['Infographic owner']||'Unassigned')}</strong></p>${f['Review deadline (source)']?`<p class="work-card-line"><small>Deadline:</small> <span>${esc(f['Review deadline (source)'])}</span></p>`:''}`;}else if(t==='Podcast Episodes'){metaHtml=`<p class="work-card-line"><small>Editor:</small> <strong>${esc(f['Audio editor']||'None')}</strong></p><p class="work-card-line"><small>Point person:</small> <strong>${esc(f['Point person']||'Unassigned')}</strong></p>${f['Release date']?`<p class="work-card-line"><small>Release:</small> <span>${esc(f['Release date'])}</span></p>`:''}`;}let quickBtn='';if(t==='Schema review'){if(stage!=='Uploaded'){quickBtn=`<button type="button" class="button primary small" data-move-id="${esc(r.id)}" data-target-stage="Uploaded">✓ Uploaded</button>`;}else{quickBtn=`<button type="button" class="button secondary small" data-move-id="${esc(r.id)}" data-target-stage="Draft / Needs review">↺ Draft</button>`;}}else if(t==='Podcast Episodes'){if(stage==='Needs Audio Editor'){quickBtn=`<button type="button" class="button primary small quick-editor-btn" data-record-id="${esc(r.id)}">＋ Editor</button>`;}else if(stage==='In Editing'){quickBtn=`<button type="button" class="button primary small" data-move-id="${esc(r.id)}" data-target-stage="Released">✓ Released</button>`;}else if(stage==='Released'){quickBtn=`<button type="button" class="button secondary small" data-move-id="${esc(r.id)}" data-target-stage="Needs Audio Editor">↺ Needs Editor</button>`;}}return `<article class="work-card" draggable="true" data-drag-id="${esc(r.id)}"><div class="work-card-head"><span class="tag">${esc(stage)}</span><div class="record-markers">${r.flags.length?chip('Verify','review-chip'):''}${workspace.edits[r.id]?chip('Local','local-chip'):''}</div></div><h3>${esc(title(r,t))}</h3><div class="work-card-meta">${metaHtml}</div><div class="work-card-foot"><div class="work-card-actions">${prevStage?`<button type="button" class="button secondary small stage-nav-btn" data-move-id="${esc(r.id)}" data-target-stage="${esc(prevStage)}" title="Move left to ${esc(prevStage)}" aria-label="Move left to ${esc(prevStage)}">← ${esc(prevStage)}</button>`:''}${nextStage?`<button type="button" class="button secondary small stage-nav-btn" data-move-id="${esc(r.id)}" data-target-stage="${esc(nextStage)}" title="Move right to ${esc(nextStage)}" aria-label="Move right to ${esc(nextStage)}">${esc(nextStage)} →</button>`:''}${quickBtn}<button type="button" class="button secondary small" data-open="${esc(r.id)}" data-area="${esc(t)}">Details</button><button class="icon-button star ${workspace.favorites.includes(r.id)?'is-starred':''}" aria-label="${workspace.favorites.includes(r.id)?'Unpin':'Pin'} record" data-star="${esc(r.id)}">${workspace.favorites.includes(r.id)?'★':'☆'}</button></div></div></article>`;}
function workflowBoard(rr,t){const stages=boardStages(rr,t);const byStage={};stages.forEach(s=>byStage[s]=[]);rr.forEach(r=>{const s=recordStage(r,t);if(!byStage[s])byStage[s]=[];byStage[s].push(r);});return `<section class="pipeline-auto">${stages.map((st,idx)=>{const list=byStage[st]||[];return `<div class="lane" data-lane-stage="${esc(st)}"><div class="lane-head"><span>${esc(st)}</span><span class="lane-count">${list.length}</span></div><div class="lane-items">${list.map(r=>workflowCard(r,t,stages,idx)).join('')||'<div class="empty-state" style="padding:20px 8px;font-size:11px">No records in this stage</div>'}</div></div>`;}).join('')}</section>`;}
function applyStageChange(id,t,targetStage){const r=records(t).find(x=>x.id===id);if(!r)return;const updates={};if(t==='Schema review'){if(targetStage==='Uploaded'){updates.Status='uploaded';updates.Uploaded='Yes';}else if(targetStage==='Draft / Needs review'){updates.Status='';updates.Uploaded='';}else if(targetStage==='In review'){updates.Status='in review';}else if(targetStage==='Ready'){updates.Status='ready';}else if(targetStage==='Assigned'){updates.Status='assigned';}else{updates.Status=targetStage;}}else if(t==='Podcast Episodes'){if(targetStage==='Needs Audio Editor'){updates['Audio editor']='';}else if(targetStage==='Needs Point Person'){updates['Point person']='';}else if(targetStage==='In Editing'){if(!r.fields['Audio editor'])updates['Audio editor']='Zakariyya';}else if(targetStage==='Released'){updates['Release date']=today();}else if(db[t].columns.includes('Status')){updates.Status=targetStage;}}if(Object.keys(updates).length){if(mutate(w=>{w.edits[id]={...(w.edits[id]||{}),...updates};log(w,`Moved to ${targetStage}`,r,t);})){render();toast(`Moved to ${targetStage}`);}}}
function quickAssignEditor(id){const r=records('Podcast Episodes').find(x=>x.id===id);if(!r)return;const val=prompt('Enter Audio Editor name:',r.fields['Audio editor']||'Zakariyya');if(val!==null&&val.trim()){if(mutate(w=>{w.edits[id]={...(w.edits[id]||{}),'Audio editor':val.trim()};log(w,'Assigned Audio Editor',r,'Podcast Episodes');})){render();toast(`Audio editor assigned: ${val.trim()}`);}}}
function bindBoardEvents(t){document.querySelectorAll('[data-drag-id]').forEach(el=>{el.ondragstart=e=>e.dataTransfer.setData('text/plain',el.dataset.dragId);});document.querySelectorAll('[data-lane-stage]').forEach(lane=>{lane.ondragover=e=>{e.preventDefault();lane.classList.add('drag-over');};lane.ondragleave=()=>lane.classList.remove('drag-over');lane.ondrop=e=>{e.preventDefault();lane.classList.remove('drag-over');const id=e.dataTransfer.getData('text/plain');if(id)applyStageChange(id,t,lane.dataset.laneStage);};});document.querySelectorAll('[data-move-id]').forEach(b=>{b.onclick=()=>applyStageChange(b.dataset.moveId,t,b.dataset.targetStage);});document.querySelectorAll('.quick-editor-btn').forEach(b=>{b.onclick=()=>quickAssignEditor(b.dataset.recordId);});}

function compoundSessionFilters(){
 let html=`<label>Search this section<input class="select" id="section-query" type="search" value="${esc(sectionQuery)}" placeholder="Search within filters"></label>`;
 if(!['Morning Report','CPS Academy VMRs'].includes(tab))return html;
 const rr=records(),types=[...new Set(rr.map(r=>r.fields.Type).filter(Boolean))].sort();
 const facilitators=[...new Set(rr.flatMap(r=>SessionCore.facilitatorNames(r.fields.Facilitator)).filter(Boolean))].sort();
 html+=`<label>Session type<select class="select" id="session-type"><option value="">All types</option>${types.map(v=>`<option value="${esc(v)}" ${sessionType===v?'selected':''}>${esc(v)}</option>`).join('')}</select></label><label>Facilitator<select class="select" id="session-facilitator"><option value="">All facilitators</option>${facilitators.map(v=>`<option value="${esc(v)}" ${sessionFacilitator===v?'selected':''}>${esc(v)}</option>`).join('')}</select></label>`;
 if(tab==='Morning Report')html+=`<label class="compound-checkbox"><input id="gaps-only" type="checkbox" ${gapsOnly?'checked':''}> Unstaffed gaps only</label>`;
 return html;
}
function bindCompoundSessionFilters(){
 for(const id of ['session-type','session-facilitator','gaps-only','section-query']){
  const el=$('#'+id);if(!el)continue;
  el.onchange=e=>{if(id==='session-type')sessionType=e.target.value;else if(id==='session-facilitator')sessionFacilitator=e.target.value;else if(id==='gaps-only')gapsOnly=e.target.checked;else sectionQuery=e.target.value;page=0;render()};
 }
}

let scheduleFiltersOpen=false;
function arrangeScheduleFilters(){
 const bar=document.querySelector('.filter-bar');if(!bar||bar.dataset.arranged)return;bar.dataset.arranged='true';bar.classList.add('schedule-filter-bar','filter-toolbar','roster-toolbar');
 const search=bar.querySelector('#section-query')?.closest('label'),views=bar.querySelector('.segmented')||bar.querySelector('#view');
 const details=bar.querySelector('.schedule-secondary-filters');
 details.classList.add('roster-filter');
 details.ontoggle=()=>{if(window.innerWidth<=760)scheduleFiltersOpen=details.open};
 if(search){search.classList.add('schedule-quick-search','roster-search');search.querySelector('input').placeholder=['Morning Report','CPS Academy VMRs'].includes(tab)?'Search sessions':'Search this section';bar.append(search);}
 const chips=document.createElement('div');chips.className='schedule-filter-chips';chips.setAttribute('aria-label','Schedule views');
 const activeUser=typeof Identity!=='undefined'?Identity.getCurrentUser():null;
 const hasUser=Boolean(activeUser?.name||workspace.reporterName);
 const chipNames=tab==='Morning Report'?['Upcoming','This Week','Needs Volunteers','My Sessions']:tab==='CPS Academy VMRs'?['Upcoming','Needs Volunteers','My Sessions']:[];
 for(const name of chipNames){
  const b=document.createElement('button');b.type='button';b.className='button secondary small';b.textContent=name;b.setAttribute('aria-pressed',String(filter===name));
  if(name==='My Sessions'&&!hasUser){b.disabled=true;b.title='Sign in with a local profile or claim a role to enable My Sessions';}
  b.onclick=()=>{filter=filter===name?'All':name;page=0;render()};chips.append(b);
 }
 if(chipNames.length)bar.append(chips);bar.append(details);if(views){views.classList.add('roster-view-switch');bar.append(views);}if((mode==='cards'||mode==='table')&&tab==='Morning Report'){const health=document.createElement('div');health.className='schedule-health';health.innerHTML=staffingHealthBadge(records('Morning Report'));bar.after(health);}
}

if(typeof window!=='undefined'&&window.matchMedia){window.matchMedia('(max-width:760px)').addEventListener('change',()=>{if(!document.querySelector('dialog[open]'))render()});}
if(typeof globalThis!=='undefined'){
  globalThis.RECORD_CATEGORY=RECORD_CATEGORY;
  globalThis.CRC_RETIRED_ROUNDS=CRC_RETIRED_ROUNDS;
  globalThis.MEMBERS_STRUCTURAL_IDS=MEMBERS_STRUCTURAL_IDS;
  globalThis.RESIDENCY_MONTH_HEADINGS=RESIDENCY_MONTH_HEADINGS;
  globalThis.classifyRecord=classifyRecord;
  globalThis.getRecordClassification=getRecordClassification;
  globalThis.getClassificationCounts=getClassificationCounts;
  globalThis.formatResultsCount=formatResultsCount;
}
