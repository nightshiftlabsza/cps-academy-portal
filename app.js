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
  return {
    route: typeof location !== 'undefined' ? (location.hash || '#Home') : '#Home',
    viewport: `${w}x${h} (${profile})`,
    workspaceVersion: KEY,
    timestamp: new Date().toISOString(),
    errorLogs: [...errorRingBuffer]
  };
}

const groups={Sessions:['Morning Report','CPS Academy VMRs','Special VMRs','Student Forum','Residency Programs','Leader of the Week'],People:['Members','OrgStructure','CRC','CRC - retired'],Production:['Podcast Episodes','Schema review'],Research:['Research @CPSolvers','Conferences'],Links:['Important links']};
const descriptions={'Morning Report':'The session team, sign-ups and teaching support in one place.','CPS Academy VMRs':'Explore the Academy’s learning archive. Find a topic, facilitator or recording.','CRC':'Follow presenters, mentoring assignments and case progress.','CRC - retired':'Archived and legacy clinical reasoning case mentorship records.','Members':'Find Academy members, sponsors and social handles.','OrgStructure':'Responsibilities and teams, as recorded in the workbook.','Research @CPSolvers':'Find collaborators by research skills and availability.','Podcast Episodes':'Coordinate ownership and editing. The workbook target is readiness two days before release.','Schema review':'Coordinate video, infographic and review assignments. Friday review → Monday upload.','Important links':'Your recurring Academy resources, ready to open.','Residency Programs':'Partner hospital residency programs, discussants and session facilitators.'};
const titles={'Morning Report':'Date','CPS Academy VMRs':'Session title','Members':'Name','OrgStructure':'Team / responsibility','CRC':'Presenter','CRC - retired':'MENTEE','Research @CPSolvers':'Name','Podcast Episodes':'Episode','Schema review':'Schema','Conferences':'Congress','Important links':'Resource','Leader of the Week':'Member','Special VMRs':'Details','Student Forum':'Topic','Residency Programs':'Residency Programs'};
const facets={'Morning Report':'Type','CPS Academy VMRs':'Facilitator','Members':'Country','CRC':'Status','CRC - retired':"PRESENTER'S COUNTRY",'Research @CPSolvers':'Availability','Schema review':'Status','Podcast Episodes':'Audio editor','OrgStructure':'Role','Special VMRs':'Type','Residency Programs':'Facilitator'};
const tabAliases={'Morning Report':'morning report mr vmr daily session','CPS Academy VMRs':'cps academy vmrs vmr archive session recording learning','CRC':'crc clinical reasoning case presenter mentor','CRC - retired':'crc retired mentorship archive legacy mentee mentor case presentation','OrgStructure':'orgstructure org structure org chart leadership teams','Members':'members orgstructure org structure directory sponsors country','Research @CPSolvers':'research cpsolvers collaborators publications skills','Podcast Episodes':'podcast episodes audio editor release','Schema review':'schema review infographic video pipeline','Conferences':'conferences congress scholarship meeting','Important links':'important links resources bookmarks recurring','Leader of the Week':'leader of the week member','Special VMRs':'special vmrs vmr details','Student Forum':'student forum topic expert vmr','Residency Programs':'residency programs partner hospital discussants junior member facilitator allegheny'};
function buildSearchIndex(r,t){return `${t} ${r.source||''} ${tabAliases[t]||''} ${Object.values(r.fields).join(' ')}`.toLowerCase()}
function recordSearchText(r,t){return r._search&&!workspace.edits[r.id]?r._search:`${buildSearchIndex(r,t)} ${Object.values(r.fields).join(' ').toLowerCase()}`}
function searchMatches(r,t,terms){const txt=recordSearchText(r,t);return terms.every(term=>txt.includes(term))}
let skill='',dateFrom='',dateTo='',owner='',showAll=false;
let db={},tab='Home',query='',searchPage=0,filter='All',facet='',sort='source',page=0,mode='cards',selected=null,editingTab='',quickClaimRecord=null,quickClaimRole='',issueFilter='All',issueSectionFilter='',workspace={edits:{},added:[],favorites:[],history:[],recent:[],issues:[],isAdmin:false,role:'VMR Leadership'},storageIssue=false;
let initialFormValues={};
try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');if(saved&&saved.edits&&Array.isArray(saved.added)&&Array.isArray(saved.favorites)&&Array.isArray(saved.history)){workspace=saved;if(!Array.isArray(workspace.recent))workspace.recent=[];if(!Array.isArray(workspace.issues))workspace.issues=[];if(typeof workspace.isAdmin==='undefined')workspace.isAdmin=false;if(!workspace.role)workspace.role=workspace.isAdmin?'Super admin':'VMR Leadership';}else{workspace.edits=JSON.parse(localStorage.getItem('cps-workbook-edits-v1')||'{}')||{};workspace.issues=[];workspace.isAdmin=false;workspace.role='VMR Leadership';}}catch{storageIssue=true}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),3500)}
function save(next){try{localStorage.setItem(KEY,JSON.stringify(next));workspace=next;return true}catch{toast('Could not save. Export a backup before closing this browser.');return false}}
function mutate(fn){const next=structuredClone(workspace);fn(next);return save(next)}
function records(t=tab){return [...(db[t]?.records||[]),...workspace.added.filter(r=>r.tab===t)].map(r=>({...r,fields:{...r.fields,...workspace.edits[r.id]}}))}
function title(r,t=tab){return r.fields[titles[t]]||r.fields.Topic||r.fields.Type||'Untitled record'}
function source(r){return r.row?`${r.source} · row ${r.row}`:'Created in this browser'}
function dateValue(r){return r.fields.Date||r.fields['Date / time (source)']||r.fields['Release date']||r.fields.Start||r.fields['VMR date']||r.fields['DATE OF PRESENTATION']||''}
const iso=v=>/^\d{4}-\d{2}-\d{2}$/.test(v);
const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Los_Angeles'});
function urls(r,key){return [...new Set([r.links?.[key],...(String(r.fields[key]||'').match(/https?:\/\/[^\s<>]+/g)||[])].filter(u=>u&&/^https?:\/\//i.test(u)))]}
function anchor(url,label){return `<a class="button secondary small" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`}
function chip(s,kind=''){return `<span class="tag ${kind}">${esc(s)}</span>`}
function isAdmin(){return Boolean(workspace.isAdmin||workspace.role==='Super admin'||workspace.role==='admin'||workspace.profile==='@admin')}
function updateProfileDisplay(){const r=$('#profile-role');if(r)r.textContent=isAdmin()?'Super admin (@admin)':'VMR Leadership';const t=$('#admin-toggle');if(t)t.checked=isAdmin()}
function setAdminMode(active){mutate(w=>{w.isAdmin=Boolean(active);w.role=active?'Super admin':'VMR Leadership'});updateProfileDisplay();if(!isAdmin()&&(tab==='admin/issues'||tab==='Admin Issues'))navigate('Home');else render();toast(isAdmin()?'Super admin mode enabled':'Switched to standard member profile')}
async function dispatchIssueReport(issueData){const WEBHOOK_URL='';if(WEBHOOK_URL){try{await fetch(WEBHOOK_URL,{method:'POST',mode:'no-cors',headers:{'Content-Type':'application/json'},body:JSON.stringify(issueData)})}catch(e){console.warn('Webhook dispatch error:',e)}}}
function navigate(t){
  const dialog=$('#detail-dialog');
  if(dialog?.open){
    if(typeof confirmDiscard==='function'&&!confirmDiscard())return;
    dialog.close();
  }
  if(t==='admin/issues'||t==='/admin/issues'||t==='Issue Reports'){
    if(!isAdmin()){toast('Admin access required.');navigate('Home');return}
    tab='admin/issues';query='';searchPage=0;filter='All';page=0;$('#global-search').value='';location.hash='/admin/issues';render();window.scrollTo(0,0);return;
  }
  tab=t;query='';searchPage=0;filter=t==='Morning Report'?'Upcoming':'All';owner='';facet='';skill='';dateFrom='';dateTo='';sort=t==='CPS Academy VMRs'?'date':'source';page=0;if(t==='Morning Report')mode='matrix';else if(['Podcast Episodes','Schema review'].includes(t))mode=mode==='cards'||mode==='table'?mode:'board';else if(mode==='agenda'||mode==='matrix'||mode==='board')mode='cards';$('#global-search').value='';location.hash=encodeURIComponent(t);render();window.scrollTo(0,0)
}
function nav(){
  const entries=['Home',...Object.keys(groups),'Workspace',...(isAdmin()?['Issue Reports']:[])];
  const current=tab==='admin/issues'?'Issue Reports':(Object.keys(groups).find(g=>groups[g].includes(tab))||tab);
  $('#desktop-nav').innerHTML=entries.map(g=>`<button class="nav-button ${current===g?'active':''}" data-nav="${g}">${g}${g==='Issue Reports'&&workspace.issues.filter(i=>i.status==='Open').length?` <span class="nav-badge">${workspace.issues.filter(i=>i.status==='Open').length}</span>`:''}</button>`).join('');
  $('#mobile-nav').innerHTML=entries.map(g=>`<button class="nav-button ${current===g?'active':''}" data-nav="${g}">${g}</button>`).join('');
  document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>{if(b.dataset.nav==='Issue Reports')navigate('admin/issues');else navigate(groups[b.dataset.nav]?.[0]||b.dataset.nav)});
  $('#new-item-button').textContent=tab==='Home'||tab==='Workspace'||tab==='admin/issues'?'+ New session':'+ Add record';
}
function header(t,sub){return `<div class="page-heading"><div><p class="eyebrow">CPS Academy · private workspace</p><h1>${esc(t)}</h1><p>${esc(sub)}</p></div></div>`}
function banner(){return `<div class="snapshot-note"><span class="snapshot-dot"></span><span>Workbook snapshot (2026-09-06) · local changes saved on this device · no live Sheets connection · <button class="text-button" data-go="Workspace">Backups & activity</button></span></div>`}
function actionButtons(r,t){return `<button class="button primary small" data-open="${esc(r.id)}" data-area="${esc(t)}">${t==='Morning Report'?'Staff session':'Open details'}</button><button class="icon-button star ${workspace.favorites.includes(r.id)?'is-starred':''}" aria-label="${workspace.favorites.includes(r.id)?'Unpin':'Pin'} record" data-star="${esc(r.id)}">${workspace.favorites.includes(r.id)?'★':'☆'}</button>`}
function card(r,t=tab,inSearch=false){const f=r.fields;let body='',tag='';
 if(t==='Morning Report'){tag=f.Type||'Morning Report';const cleanSignups=(f['Scribe / teaching points sign-ups']||'').split(/\r?\n[-_]{3,}/)[0];const pres=f.Presenter||cleanSignups.match(/(?:Case Presenter|Presenter):[^\S\r\n]*([^\r\n|]+)/i)?.[1]?.trim()||'Not entered';body=`<p class="muted">${esc(f['Pacific time (source)']||'Time TBD')} Pacific · ${esc(f['Eastern time (source)']||'TBD')} Eastern (source)</p><div class="assignments"><div><small>Facilitator</small><strong>${esc(f.Facilitator||'Unassigned')}</strong></div><div><small>Presenter</small><strong>${esc(pres)}</strong></div></div><p class="assignment-note">${esc(f['Scribe / teaching points sign-ups']||'Scribe / teaching points not assigned')}</p>`}
 else if(t==='CPS Academy VMRs'){tag=f.Topic||'Academy learning';body=`<p>${esc(f.Facilitator||'Facilitator not entered')}</p><p class="muted">${esc(f['Date / time (source)']||'Date not entered')}</p><div class="card-links">${urls(r,'Recording').map(u=>anchor(u,'Watch recording')).join('')}${urls(r,'Bonus learning').map(u=>anchor(u,'Bonus learning')).join('')}</div>`}
 else if(t==='Members'){tag=f.Country||'Country not entered';body=`<p>${esc(f.Subspecialty||f.Location||'Academy member')}</p><p class="muted">Sponsor: ${esc(f.Sponsor||'Not entered')}</p><p>${esc(f['Social handles']||'No social handle entered')}</p>`}
 else if(t==='Research @CPSolvers'){tag=f.Availability||'Availability not entered';body=`<div class="person-meta">${['Research writing','Data analytics','Cross-sectional studies','Systematic reviews','Qualitative studies','Case reports'].filter(k=>f[k]==='Yes').map(k=>chip(k)).join('')||'No skills entered'}</div>`}
 else if(t==='Important links'){tag='Academy resource';body=`<div class="card-links">${urls(r,'Link').map(u=>anchor(u,'Open resource')).join('')||'<p class="muted">No usable link in source. Open details to add one.</p>'}</div>`}
 else if(t==='Residency Programs'){tag=f.Facilitator?`Facilitator: ${f.Facilitator}`:'Residency Program';body=`<div class="assignments"><div><small>Resident / Attending Discussant</small><strong>${esc(f['Resident/attending discussant']||'Not entered')}</strong></div><div><small>Junior Member</small><strong>${esc(f['Junior Member']||'Not entered')}</strong></div></div>${f.Facilitator?`<p class="card-line"><small>Facilitator</small><span>${esc(f.Facilitator)}</span></p>`:''}`}
 else if(t==='CRC - retired'){tag=f["PRESENTER'S COUNTRY"]||'Legacy Mentee';body=`<p><strong>Mentor:</strong> ${esc(f['CPSOLVERS MENTOR']||'Unassigned')}</p><p class="muted">${f['DATE OF PRESENTATION']?`Presented: ${esc(f['DATE OF PRESENTATION'])}`:''}${f['CONTACT INFO']?` · ${esc(f['CONTACT INFO'])}`:''}</p><div class="record-markers">${f['CASE COMPLETE?']==='1'?chip('Case complete','ready-chip'):''}${f['PRESENTED?']==='1'?chip('Presented','ready-chip'):''}</div>`}
 else{tag=f.Status||f.Role||f.Type||t;const fields=db[t].columns.filter(c=>c!==titles[t]&&!/email|contact|link|meeting|remarks/i.test(c)).slice(0,3);body=fields.map(k=>`<p class="card-line"><small>${esc(k)}</small><span>${esc(f[k]||'Not entered')}</span></p>`).join('')}
 return `<article class="hub-card">${inSearch&&tag!==t?chip(t):''}${chip(tag)}<h2>${esc(title(r,t))}</h2>${body}<div class="record-markers">${r.flags.length?chip('Verify source details','review-chip'):''}${workspace.edits[r.id]?chip('Local changes','local-chip'):''}</div><footer><div class="card-actions">${actionButtons(r,t)}</div><small class="muted">${esc(source(r))}</small></footer></article>`}
function currentLeader(){const list=records('Leader of the Week');const now=today();for(const r of list){const raw=r.fields.Dates||'';const m=raw.match(/^(\d{1,2})\s*\/\s*(\d{1,2})\s*-\s*(\d{1,2})\s*\/\s*(\d{1,2})$/);if(m){const sm=m[1].padStart(2,'0'),sd=m[2].padStart(2,'0'),em=m[3].padStart(2,'0'),ed=m[4].padStart(2,'0');const curYear=new Date().getFullYear();const sYear=sm==='12'&&em==='01'?String(curYear-1):String(curYear),eYear=String(curYear);const start=`${sYear}-${sm}-${sd}`,end=`${eYear}-${em}-${ed}`;if(now>=start&&now<=end)return r;}const isoM=raw.match(/^(\d{4}-\d{2}-\d{2})\s*(?:-|to)\s*(\d{4}-\d{2}-\d{2})$/);if(isoM&&now>=isoM[1]&&now<=isoM[2])return r;}return null;}
function sessionCountdown(isoDate){const d1=new Date(today()+'T00:00:00Z'),d2=new Date(isoDate+'T00:00:00Z');const diff=Math.round((d2-d1)/86400000);if(diff===0)return'Today';if(diff===1)return'Tomorrow';if(diff>1)return`In ${diff} days`;return'Concluded';}
function backupAgeText(){if(!workspace.lastBackup)return'Never downloaded';const diffHours=Math.floor((Date.now()-new Date(workspace.lastBackup).getTime())/3600000);if(diffHours<1)return'< 1h ago';if(diffHours<24)return`${diffHours}h ago`;return`${Math.floor(diffHours/24)}d ago`;}
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
 let leaderHtml='';
 if(leader){
  const f=leader.fields;
  leaderHtml=`<section class="panel leader-banner"><div class="leader-badge">${chip('Active Leader of the Week')}<span class="snapshot-label">Workbook snapshot · ${esc(f.Dates||'')}</span></div><div class="leader-content"><div><h2>${esc(f.Member||'Unassigned')}</h2><p class="muted">${esc(f.Week||'Current week')}${f.Comments?` · ${esc(f.Comments)}`:''}</p></div><div class="card-actions"><button class="button secondary small" data-open="${esc(leader.id)}" data-area="Leader of the Week">Open details</button><button class="button secondary small" data-go="Leader of the Week">All leaders →</button></div></div></section>`;
 }
 let nextSessionCard='';
 if(nextSession){
  const nf=nextSession.fields,countdown=sessionCountdown(dateValue(nextSession));
  const timeStr=`${nf['Pacific time (source)']||'Time TBD'} PT · ${nf['Eastern time (source)']||'TBD'} ET`;
  const cleanSignups=(nf['Scribe / teaching points sign-ups']||'').split(/\r?\n[-_]{3,}/)[0];
  const pres=nf.Presenter||cleanSignups.match(/(?:Case Presenter|Presenter):[^\S\r\n]*([^\r\n|]+)/i)?.[1]?.trim()||'Unassigned';
  nextSessionCard=`<article class="panel op-card"><div class="op-card-head"><span class="tag ${countdown==='Today'?'ready-chip':''}">${esc(countdown)} · ${esc(dateValue(nextSession))}</span><span class="op-sub">${esc(timeStr)}</span></div><div class="op-card-body"><small class="op-label">Next Scheduled Session</small><h3 class="op-title">${esc(title(nextSession,'Morning Report'))}</h3><div class="op-meta-grid"><div><small>Type</small><strong>${esc(nf.Type||'Morning Report')}</strong></div><div><small>Facilitator</small><strong>${esc(nf.Facilitator||'Unassigned')}</strong></div><div><small>Presenter</small><strong>${esc(pres)}</strong></div></div></div><div class="op-card-foot"><button class="button primary small" data-open="${esc(nextSession.id)}" data-area="Morning Report">Staff session</button><button class="button secondary small" data-go="Morning Report">Open staffing schedule</button></div></article>`;
 }else{
  nextSessionCard=`<article class="panel op-card"><div class="op-card-head"><span class="tag">Schedule</span></div><div class="op-card-body"><small class="op-label">Next Scheduled Session</small><h3 class="op-title">No upcoming dated sessions</h3><p class="muted">Check schedule for pending or past sessions.</p></div><div class="op-card-foot"><button class="button secondary small" data-go="Morning Report">Open staffing schedule</button></div></article>`;
 }
 const backupCard=`<article class="panel op-card"><div class="op-card-head"><span class="tag ${editCount>0?'gap-chip':'ready-chip'}">${editCount>0?`⚠ ${editCount} local edit${editCount===1?'':'s'}`:'✓ Clean state'}</span><span class="op-sub">Last backup: ${esc(backupAgeText())}</span></div><div class="op-card-body"><small class="op-label">Backup Health</small><h3 class="op-title">${editCount>0?`${editCount} local change${editCount===1?'':'s'} pending backup`:'Snapshot data healthy'}</h3><p class="muted">${editCount>0?'Edits exist only in this browser. Download a backup to preserve them.':'No unbacked browser changes. Workspace matches snapshot.'}</p></div><div class="op-card-foot"><button class="button secondary small" id="home-backup-btn">Download backup</button><button class="text-button" data-go="Workspace">Backups & activity →</button></div></article>`;
 const linksCard=`<article class="panel op-card"><div class="op-card-head"><span class="tag">Resources</span><span class="op-sub">${pinnedLinks.length?`${pinnedLinks.length} pinned`:'Core Drives & Guidelines'}</span></div><div class="op-card-body"><small class="op-label">Important Links</small><h3 class="op-title">Essential Resources</h3><div class="quick-links-grid">${displayLinks.map(r=>{const u=urls(r,'Link')[0]||r.links?.Link||'';return u?`<a class="button secondary small quick-resource-btn" href="${esc(u)}" target="_blank" rel="noopener noreferrer">↗ ${esc(r.fields.Resource)}</a>`:`<button class="button secondary small quick-resource-btn" data-open="${esc(r.id)}" data-area="Important links">${esc(r.fields.Resource)}</button>`;}).join('')}</div></div><div class="op-card-foot"><button class="button secondary small" data-go="Important links">All ${allLinks.length} resources →</button></div></article>`;
 $('#page').innerHTML=header('Home Dashboard','Operational status, upcoming sessions and active Academy resources.')+banner()+leaderHtml+`<section class="operational-grid">${nextSessionCard}${backupCard}${linksCard}</section><div class="dashboard-heading"><div><h2>Upcoming in the workbook</h2><p class="muted">Workbook snapshot records (2026-09-06)</p></div><button class="text-button" data-go="Morning Report">View schedule →</button></div><section class="hub-grid">${next.map(r=>card(r,'Morning Report')).join('')||'<div class="empty-state">No future dated sessions in this snapshot.</div>'}</section><div class="dashboard-heading"><h2>Recently opened records</h2><span class="muted">Opened in this browser</span></div><section class="hub-grid">${recents.map(({r,t})=>card(r,t)).join('')||'<div class="empty-state panel">Records you open will appear here for quick access.</div>'}</section><div class="dashboard-heading"><h2>Recent local changes</h2><button class="text-button" data-go="Workspace">All activity & backups →</button></div><section class="panel activity-list">${localChanges.map(h=>`<div><strong>${esc(h.action)} · ${esc(h.title)}</strong><small>${esc(h.tab)} · ${esc(new Date(h.at).toLocaleString())} · Saved on this device</small></div>`).join('')||'<div class="empty-state">No local changes yet. Edits and drafts saved on this device will appear here.</div>'}</section><div class="dashboard-heading"><h2>Pinned for quick access</h2><span class="muted">Use ☆ on any record</span></div><section class="hub-grid">${pinned.slice(0,9).map(({r,t})=>card(r,t)).join('')||'<div class="empty-state panel">Pin a session, member or resource to keep it here.</div>'}</section>`;
 if($('#home-backup-btn'))$('#home-backup-btn').onclick=()=>{exportBackup();render();};
}
function filtered(){let rr=records().filter(r=>Object.values(r.fields).join(' ').toLowerCase().includes(query.toLowerCase()));if(owner){if(tab==='Podcast Episodes')rr=rr.filter(r=>(r.fields['Audio editor']||'').split(/[/,;]/).map(s=>s.trim()).includes(owner)||(r.fields['Point person']||'').split(/[/,;]/).map(s=>s.trim()).includes(owner)||r.fields['Audio editor']===owner||r.fields['Point person']===owner);else if(tab==='Schema review')rr=rr.filter(r=>(r.fields['Video owner']||'').trim()===owner||(r.fields['Infographic owner']||'').trim()===owner);}if(skill)rr=rr.filter(r=>r.fields[skill]==='Yes');if(dateFrom)rr=rr.filter(r=>recordDate(r)&&recordDate(r)>=dateFrom);if(dateTo)rr=rr.filter(r=>recordDate(r)&&recordDate(r)<=dateTo);if(facet)rr=rr.filter(r=>r.fields[facets[tab]]===facet);if(filter==='Needs review')rr=rr.filter(r=>r.flags.length);if(filter==='Local edits')rr=rr.filter(r=>workspace.edits[r.id]||r.id.startsWith('local:'));if(filter==='Pinned')rr=rr.filter(r=>workspace.favorites.includes(r.id));if(filter==='Upcoming')rr=rr.filter(r=>recordDate(r)&&recordDate(r)>=today());if(filter==='Staffing gaps')rr=rr.filter(r=>mrGaps(r).length>0);if(filter==='Has recording')rr=rr.filter(r=>urls(r,'Recording').length);if(filter==='Missing facilitator')rr=rr.filter(r=>!r.fields.Facilitator||/tbd/i.test(r.fields.Facilitator));if(sort==='az')rr.sort((a,b)=>title(a).localeCompare(title(b)));else if(filter==='Upcoming')rr.sort((a,b)=>recordDate(a).localeCompare(recordDate(b)));else if(sort==='date')rr.sort((a,b)=>{const x=recordDate(a),y=recordDate(b);return x&&y?y.localeCompare(x):x?-1:y?1:0});return rr}
function listing(){let rr=filtered();const pageSize=showAll?rr.length:12;page=showAll?0:Math.min(page,Math.max(0,Math.ceil(rr.length/pageSize)-1));const current=showAll?rr:rr.slice(page*pageSize,page*pageSize+pageSize),field=facets[tab],options=field?[...new Set(records().map(r=>r.fields[field]).filter(Boolean))].sort():[];const filters=['All',...(tab==='Morning Report'?['Upcoming','Staffing gaps','Missing facilitator']:[]),...(db[tab].columns.includes('Recording')?['Has recording']:[]),'Pinned','Needs review','Local edits'];const viewSwitcher=tab==='Morning Report'?`<div class="segmented"><button class="${mode==='matrix'?'active':''}" data-set-view="matrix">Matrix</button><button class="${mode==='agenda'?'active':''}" data-set-view="agenda">Weekly Agenda</button><button class="${mode==='cards'?'active':''}" data-set-view="cards">Cards</button><button class="${mode==='table'?'active':''}" data-set-view="table">Table</button></div>`:['Podcast Episodes','Schema review'].includes(tab)?`<div class="segmented"><button class="${mode==='board'?'active':''}" data-set-view="board">Board</button><button class="${mode==='cards'?'active':''}" data-set-view="cards">Cards</button><button class="${mode==='table'?'active':''}" data-set-view="table">Table</button></div>`:`<button class="button secondary" id="view">${mode==='cards'?'Table view':'Card view'}</button>`;$('#page').innerHTML=header(tab,descriptions[tab]||'Programme records, assignments and source details.')+banner()+sopBanner(tab)+`<div class="toolbar area-tabs">${groups[Object.keys(groups).find(g=>groups[g].includes(tab))].map(t=>`<button class="button ${t===tab?'primary':'secondary'} small" data-go="${esc(t)}">${esc(t)}</button>`).join('')}</div><div class="filter-bar"><label>Show<select class="select" id="filter">${filters.map(f=>`<option ${f===filter?'selected':''}>${f}</option>`).join('')}</select></label>${field?`<label>${esc(field)}<select class="select" id="facet"><option value="">All</option>${options.map(v=>`<option value="${esc(v)}" ${v===facet?'selected':''}>${esc(v)}</option>`).join('')}</select></label>`:''}<label>Order<select class="select" id="sort"><option value="source">Workbook order</option><option value="az" ${sort==='az'?'selected':''}>Title A–Z</option><option value="date" ${sort==='date'?'selected':''}>Newest recognised dates</option></select></label>${extraFilters()}<label class="ctrl-f-label"><input type="checkbox" id="show-all-toggle" ${showAll?'checked':''}> <span>Show all (${rr.length}) for Ctrl+F</span></label><button class="button secondary" id="clear">Clear filters</button>${viewSwitcher}</div><p class="muted results-count">${rr.length} matches · ${records().length} records${sort==='date'?' · Unresolved dates follow recognised dates':''}${dateFrom||dateTo?' · Records with unresolved dates are excluded from this range':''}</p>${rr.length?(mode==='matrix'&&tab==='Morning Report'?matrixView(rr):(mode==='agenda'&&tab==='Morning Report'?agendaView(rr):(mode==='board'&&['Podcast Episodes','Schema review'].includes(tab)?workflowBoard(rr,tab):(mode==='cards'?`<section class="hub-grid">${current.map(r=>card(r)).join('')}</section>`:table(current))))): '<section class="empty-state panel"><h2>No matching records</h2><p>Clear the filters or try a broader search.</p></section>'}${(mode==='matrix'&&tab==='Morning Report')||(mode==='agenda'&&tab==='Morning Report')||(mode==='board'&&['Podcast Episodes','Schema review'].includes(tab))||showAll?'':`<div class="toolbar pagination"><button class="button secondary" id="prev" ${page===0?'disabled':''}>Previous</button><span>Page ${page+1} of ${Math.max(1,Math.ceil(rr.length/12))}</span><button class="button secondary" id="next" ${(page+1)*12>=rr.length?'disabled':''}>Next</button></div>`}${tab==='CRC'&&db['CRC - retired']?crcDrawer():''}`;bindExtraFilters();$('#filter').onchange=e=>{filter=e.target.value;page=0;render()};if($('#facet'))$('#facet').onchange=e=>{facet=e.target.value;page=0;render()};$('#sort').onchange=e=>{sort=e.target.value;render()};if($('#show-all-toggle'))$('#show-all-toggle').onchange=e=>{showAll=e.target.checked;page=0;render()};$('#clear').onclick=()=>{query='';filter='All';facet='';owner='';skill='';dateFrom='';dateTo='';sort='source';page=0;showAll=false;$('#global-search').value='';render()};if($('#view'))$('#view').onclick=()=>{mode=mode==='cards'?'table':'cards';render()};document.querySelectorAll('[data-set-view]').forEach(b=>b.onclick=()=>{mode=b.dataset.setView;render()});if($('#prev'))$('#prev').onclick=()=>{page--;render();window.scrollTo(0,0)};if($('#next'))$('#next').onclick=()=>{page++;render();window.scrollTo(0,0)};if(mode==='board'&&['Podcast Episodes','Schema review'].includes(tab))bindBoardEvents(tab);}
function crcDrawer(){const retired=records('CRC - retired');return `<details class="panel legacy-drawer" style="margin-top:24px"><summary style="cursor:pointer;padding:16px 20px;font-weight:700;display:flex;align-items:center;justify-content:space-between;user-select:none"><span>📁 Archived / Legacy Mentorship (${retired.length} records)</span><span class="muted" style="font-size:12px;font-weight:normal">Expand archive records ↓</span></summary><div style="padding:16px 20px;border-top:1px solid var(--line)"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px"><p class="muted" style="margin:0">Historical mentorship rounds preserved from original workbook. Active cases remain front-and-center above.</p><button class="button secondary small" data-go="CRC - retired">Full Archive View →</button></div><div class="hub-grid">${retired.slice(0,9).map(r=>card(r,'CRC - retired')).join('')}</div><div style="margin-top:16px;text-align:center"><button class="button secondary small" data-go="CRC - retired">Browse all ${retired.length} archived records →</button></div></div></details>`}
function table(rr){const cols=[titles[tab],...db[tab].columns.filter(c=>c!==titles[tab])];return `<section class="panel table-panel"><table class="data-table"><thead><tr>${cols.map(c=>`<th>${esc(c)}</th>`).join('')}<th>Action</th></tr></thead><tbody>${rr.map(r=>`<tr>${cols.map(c=>`<td data-label="${esc(c)}">${esc(r.fields[c]||'—')}</td>`).join('')}<td>${actionButtons(r,tab)}</td></tr>`).join('')}</tbody></table></section>`}
function sopBanner(t){
  if(t==='Schema review'){
    return `<details class="panel sop-banner" open><summary>📋 Operational Guidelines &amp; Production Timeline</summary><div class="sop-content"><div class="sop-grid"><div><strong>Team Leads</strong><p>Umbish &amp; Sawsan · Core Team: Tansu, Masah, Oumaima, Rahul, Ibrahim, Parisa, Zakariyya, Simmy, Daniel, Anmolpreet</p></div><div><strong>Weekly Timeline</strong><p>• <strong>Friday:</strong> Submit draft video for review to <code>sawsansweilmeen2001@gmail.com</code> / <code>umbish21@gmail.com</code>.<br>• <strong>Monday:</strong> Upload final video &amp; infographic (Sawsan).</p></div><div><strong>Video Requirements</strong><p>• 2–3 min max (split longer schemas).<br>• Appear on camera directly (visually engaging; avoid voice-over only).<br>• Link to a CPS Episode with practical examples.<br><a class="button secondary small" href="https://clinicalproblemsolving.com/reasoning-content/" target="_blank" rel="noopener noreferrer">Reasoning Content ↗</a></p></div></div></div></details>`;
  }
  if(t==='Student Forum'){
    return `<details class="panel sop-banner" open><summary>📋 Student Forum Standard Operating Procedures (SOP)</summary><div class="sop-content"><p>Expert clinical reasoning case sessions paired with junior members and student discussants. Past forums archived below.</p><a class="button primary small" href="https://docs.google.com/document/d/1kYRo8gkHKPyVpRAtQEqhGOkid03kM8qnrcv32S-9Fq0/edit?tab=t.0" target="_blank" rel="noopener noreferrer">📄 Open Official SOP &amp; How-To Guide ↗</a></div></details>`;
  }
  if(t==='Podcast Episodes'){
    return `<details class="panel sop-banner"><summary>📋 Production Target &amp; Audio Editing Guidelines</summary><div class="sop-content"><p><strong>Production Goal:</strong> Coordinate efforts across the line so episodes are finalized and ready for upload <strong>2 days prior to release date</strong>.<br>The audio editor emails the finalized episode to the point person 2 days prior to release.</p></div></details>`;
  }
  return '';
}
function workspaceView(){
  const hasRollback = !!sessionStorage.getItem('cps-rollback-snapshot');
  $('#page').innerHTML=header('Workspace','Keep a portable backup and review your local activity.')+banner()+`<section class="integration-grid"><article class="panel integration-card"><h2>Your changes, safely portable</h2><p>Changes are stored in this browser. Export a backup before switching devices or clearing browser data. Import merges a backup, with incoming values taking priority for the same record.</p><div class="toolbar"><button class="button primary" id="export">Download backup</button><label class="button secondary">Import backup<input type="file" id="import" accept="application/json" hidden></label><button class="button secondary" id="export-patch-top">Export Spreadsheet Patch JSON</button>${hasRollback?'<button class="button secondary" id="undo-rollback-btn">↺ Undo Last Import (Rollback)</button>':''}</div><p class="muted">${Object.keys(workspace.edits).length} edited records · ${workspace.added.length} new records · ${workspace.favorites.length} pins</p></article><article class="panel integration-card"><h2>Connection status</h2><p>This is a copy of the uploaded workbook. No live Google Sheets connection or shared saving is enabled.</p><p>Next integration phase: stable record IDs, shared storage, then permissioned read-only Sheets sync. Source row references are retained for review.</p></article><article class="panel integration-card"><h2>Developer &amp; Admin Settings</h2><p>Toggle local administration privileges for local testing and issue triage.</p><div class="pref-item" style="margin:12px 0;"><div class="pref-meta"><strong>Super Admin Profile (@admin)</strong><p class="muted">Access the Issue Reports triage dashboard (${workspace.issues?.length || 0} issues logged).</p></div><label class="toggle-switch"><input type="checkbox" id="workspace-admin-toggle" ${isAdmin()?'checked':''}><span class="toggle-slider"></span></label></div></article></section>${workbookDiffHtml()}<div class="dashboard-heading"><h2>Recent local activity</h2></div><section class="panel activity-list">${workspace.history.slice(0,30).map(h=>`<div><strong>${esc(h.action)} · ${esc(h.title)}</strong><small>${esc(h.tab)} · ${esc(new Date(h.at).toLocaleString())}</small></div>`).join('')||'<div class="empty-state">Your saved changes will appear here.</div>'}</section>`;
  $('#export').onclick=exportBackup;
  $('#import').onchange=importBackup;
  if($('#export-patch-top'))$('#export-patch-top').onclick=exportPatchJson;
  if($('#export-patch-btn'))$('#export-patch-btn').onclick=exportPatchJson;
  if($('#undo-rollback-btn'))$('#undo-rollback-btn').onclick=rollbackImport;
  if($('#workspace-admin-toggle'))$('#workspace-admin-toggle').onchange=e=>setAdminMode(e.target.checked);
}
function render(){
  nav();
  updateProfileDisplay();
  if(query.trim())globalResults();
  else if(tab==='Home')home();
  else if(tab==='Workspace')workspaceView();
  else if(tab==='admin/issues')adminIssuesView();
  else listing();
  document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>navigate(b.dataset.go));
  document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>openRecord(b.dataset.open,b.dataset.area,b.dataset.role));
  document.querySelectorAll('.gap-action-btn').forEach(b=>b.onclick=e=>{e.stopPropagation();openQuickClaim(b.dataset.open,b.dataset.role);});
  document.querySelectorAll('[data-star]').forEach(b=>b.onclick=e=>{e.stopPropagation();const id=b.dataset.star;const willBeStarred=!workspace.favorites.includes(id);if(mutate(w=>{w.favorites=willBeStarred?[...w.favorites,id]:w.favorites.filter(x=>x!==id)})){document.querySelectorAll(`[data-star="${CSS.escape?CSS.escape(id):id}"]`).forEach(starBtn=>{starBtn.textContent=willBeStarred?'★':'☆';starBtn.classList.toggle('is-starred',willBeStarred);starBtn.setAttribute('aria-label',`${willBeStarred?'Unpin':'Pin'} record`);});if(filter==='Pinned'||tab==='Home')render();else toast(willBeStarred?'Pinned to favorites':'Unpinned from favorites');}});
  $('#global-search').placeholder='Search all Academy records…';
}
function openQuickClaim(id, role){
  const r = records('Morning Report').find(x => x.id === id);
  if (!r) return;
  quickClaimRecord = r;
  quickClaimRole = role;
  const diag = $('#quick-claim-dialog');
  if (!diag) return;
  $('#qc-eyebrow').textContent = `Morning Report · ${dateValue(r) || 'Upcoming'}`;
  $('#qc-title').textContent = `Claim ${role}`;
  $('#qc-session-desc').textContent = `${title(r, 'Morning Report')} · ${r.fields['Pacific time (source)'] || 'TBD'} PT`;
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
    const currentEdits = { ...(workspace.edits[r.id] || r.fields) };
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
      w.edits[r.id] = currentEdits;
      log(w, `Claimed ${role}`, r, 'Morning Report');
      if (name) w.reporterName = name;
    })) {
      $('#quick-claim-dialog').close();
      render();
      toast(`Assigned ${name} as ${role}! Saved on this device.`);
    }
  };
}
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
function openRecord(id,t,role){editingTab=t;selected=records(t).find(r=>r.id===id);mutate(w=>{w.recent=[{id,tab:t,at:new Date().toISOString()},...(w.recent||[]).filter(x=>x.id!==id)].slice(0,10);});editDialog(false,role)}
function createRecord(){editingTab=db[tab]?tab:'Morning Report';selected={id:'local:'+crypto.randomUUID(),tab:editingTab,source:'Local draft',row:null,fields:Object.fromEntries(db[editingTab].columns.map(k=>[k,''])),links:{},flags:[]};editDialog(true)}
function getFormValues(){const f={};$('#dialog-content').querySelectorAll('[data-field]').forEach(el=>f[el.dataset.field]=el.value.trim());return f}
function isFormDirty(){const cur=getFormValues();for(const k of Object.keys(initialFormValues)){if((cur[k]??'')!==(initialFormValues[k]??''))return true}return false}
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
function editDialog(isNew,targetRole){const r=selected;$('#dialog-eyebrow').textContent=isNew?'New '+editingTab:source(r);$('#dialog-title').textContent=isNew?'Create a record':title(r,editingTab);$('#dialog-content').innerHTML=`<p class="form-note">Saved on this device. No changes are sent to the live workbook.</p>${r.flags.length?`<details class="review-details"><summary>${r.flags.length} source details to verify</summary>${r.flags.map(f=>`<p>${esc(f)}</p>`).join('')}</details>`:''}${editingTab==='Morning Report'?staffingTools():''}<div class="record-form">${db[editingTab].columns.map(c=>`<label class="record-field">${esc(c)}${c===titles[editingTab]?' *':''}${renderFieldControl(c,r.fields[c]??'',r,c===titles[editingTab]?'required':'')}${urls(r,c).map(u=>anchor(u,'Open '+c)).join('')}</label>`).join('')}</div>${!isNew?`<button type="button" class="text-button" id="restore-record">${r.id.startsWith('local:')?'Remove this local draft':'Restore original workbook values'}</button><div id="restore-confirm"></div>`:''}`;$('#dialog-primary').textContent=isNew?'Create local record':'Save changes';$('#dialog-primary').dataset.isNew=String(isNew);if($('#restore-record'))$('#restore-record').onclick=()=>{$('#restore-confirm').innerHTML='<p>This discards this record’s local changes.</p><button type="button" class="button secondary" id="confirm-restore">Confirm restore / removal</button>';$('#confirm-restore').onclick=()=>{if(mutate(w=>{delete w.edits[r.id];if(r.id.startsWith('local:')){w.added=w.added.filter(a=>a.id!==r.id);w.favorites=w.favorites.filter(id=>id!==r.id)}log(w,'Restored / removed',r,editingTab)})){initialFormValues=getFormValues();$('#detail-dialog').close();render();toast('Local record restored or removed')}}};bindStaffingTools(targetRole);$('#dialog-content').querySelectorAll('.convert-date-btn').forEach(btn=>{btn.onclick=()=>{const col=btn.dataset.dateCol,input=$('#dialog-content').querySelector(`[data-field="${col}"]`);if(input){input.type='date';input.value='';input.focus();btn.closest('.uncertain-field')?.querySelector('.uncertain-meta')?.remove()}}});initialFormValues=getFormValues();$('#detail-dialog').showModal()}
function log(w,action,r,t){w.history.unshift({action,title:title(r,t),tab:t,at:new Date().toISOString()});w.history=w.history.slice(0,100)}
$('#dialog-primary').onclick=e=>{e.preventDefault();const form=$('#detail-dialog form');if(!form.reportValidity())return;const fields={};$('#dialog-content').querySelectorAll('[data-field]').forEach(el=>fields[el.dataset.field]=el.value.trim());if(!fields[titles[editingTab]]){toast('Please enter the required title or name.');return}const isNew=e.currentTarget.dataset.isNew==='true',r={...selected,fields};if(mutate(w=>{if(isNew)w.added.push(r);else w.edits[r.id]=fields;log(w,isNew?'Created':'Updated',r,editingTab)})){initialFormValues=getFormValues();$('#detail-dialog').close();render();toast('Saved on this device')}};
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
      const found = grp.records.find(r => r.id === id);
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
    if(b.format !== 'cps-hub-backup-v2' || typeof b.snapshot !== 'string' || !Array.isArray(b.added) || !Array.isArray(b.favorites) || !b.edits || typeof b.edits !== 'object' || Array.isArray(b.edits)) throw Error('Unsupported backup format');
    const known = new Map(Object.entries(db).flatMap(([t, v]) => v.records.map(r => [r.id, t])));
    workspace.added.forEach(r => known.set(r.id, r.tab));
    const added = b.added.map(r => {
      if(!r.id?.startsWith('local:') || !db[r.tab] || !r.fields) throw Error('Invalid draft');
      known.set(r.id, r.tab);
      return {...r, source:'Local draft', row:null, flags:[], links:{}};
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
  } catch {}

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
function globalResults(){const terms=query.toLowerCase().trim().split(/\s+/).filter(Boolean);const found=Object.keys(db).flatMap(t=>records(t).filter(r=>searchMatches(r,t,terms)).map(r=>({r,t})));const PAGE_SIZE=24,totalPages=Math.max(1,Math.ceil(found.length/PAGE_SIZE));searchPage=Math.min(searchPage,totalPages-1);const current=found.slice(searchPage*PAGE_SIZE,searchPage*PAGE_SIZE+PAGE_SIZE),start=found.length===0?0:searchPage*PAGE_SIZE+1,end=Math.min((searchPage+1)*PAGE_SIZE,found.length);const subtitle=found.length>PAGE_SIZE?`${found.length} matches across all workbook areas. Showing ${start}–${end} (page ${searchPage+1} of ${totalPages}).`:`${found.length} matches across all workbook areas.`;$('#page').innerHTML=header('Search the Academy',subtitle)+`<div class="toolbar"><button class="button secondary small" id="clear-search">← Return to ${esc(tab)}</button></div><section class="hub-grid">${current.map(({r,t})=>card(r,t,true)).join('')||'<div class="empty-state panel"><h2>No matching records</h2><p>Try searching for a name, topic, date, or workbook tab (e.g. Morning Report, OrgStructure, Podcasts).</p><button class="button secondary" id="empty-clear-search">Clear search</button></div>'}</section>${totalPages>1?`<div class="toolbar pagination"><button class="button secondary" id="search-prev" ${searchPage===0?'disabled':''}>Previous</button><span>Page ${searchPage+1} of ${totalPages}</span><button class="button secondary" id="search-next" ${(searchPage+1)*PAGE_SIZE>=found.length?'disabled':''}>Next</button></div>`:''}`;document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>openRecord(b.dataset.open,b.dataset.area));document.querySelectorAll('[data-star]').forEach(b=>b.onclick=()=>{if(mutate(w=>{w.favorites=w.favorites.includes(b.dataset.star)?w.favorites.filter(id=>id!==b.dataset.star):[...w.favorites,b.dataset.star]}))globalResults()});const clearHandler=()=>{query='';searchPage=0;$('#global-search').value='';render()};if($('#clear-search'))$('#clear-search').onclick=clearHandler;if($('#empty-clear-search'))$('#empty-clear-search').onclick=clearHandler;if($('#search-prev'))$('#search-prev').onclick=()=>{searchPage--;globalResults();window.scrollTo(0,0)};if($('#search-next'))$('#search-next').onclick=()=>{searchPage++;globalResults();window.scrollTo(0,0)};}
$('#global-search').oninput=e=>{query=e.target.value;searchPage=0;render()};$('#new-item-button').onclick=()=>{if(!db['Morning Report'])return toast('Please wait for the workbook to load');createRecord()};
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='k'){e.preventDefault();$('#global-search').focus()};if(e.key==='Escape'&&document.activeElement===$('#global-search')&&query.trim()){query='';searchPage=0;$('#global-search').value='';render()}});
$('.sync-card').onclick=()=>navigate('Workspace');$('.sync-card strong').textContent='Workbook snapshot';$('.sync-card small').textContent='Local changes · no live sync';$('.notification-button')?.remove();
if($('#feedback-trigger-btn'))$('#feedback-trigger-btn').onclick=openIssueModal;
if($('#issue-report-form'))$('#issue-report-form').onsubmit=submitIssueReport;
if($('#profile-options-btn'))$('#profile-options-btn').onclick=()=>{const t=$('#admin-toggle');if(t)t.checked=isAdmin();$('#admin-prefs-dialog')?.showModal()};
if($('#admin-toggle'))$('#admin-toggle').onchange=e=>setAdminMode(e.target.checked);
window.addEventListener('hashchange',()=>{
  let t=decodeURIComponent(location.hash.slice(1));
  if(t.startsWith('/'))t=t.slice(1);
  if(t==='admin/issues'){if(!isAdmin()){toast('Admin access required.');navigate('Home');return}tab='admin/issues';render();window.scrollTo(0,0);return}
  if(t!==tab&&(db[t]||['Home','Workspace'].includes(t)))navigate(t);
});
fetch('workbook.json').then(r=>{if(!r.ok)throw Error();return r.json()}).then(data=>{db=data;for(const[t,grp]of Object.entries(db))for(const r of grp.records)r._search=buildSearchIndex(r,t);let hash=decodeURIComponent(location.hash.slice(1));if(hash.startsWith('/'))hash=hash.slice(1);if(hash==='admin/issues'){if(isAdmin())tab='admin/issues';else tab='Home';}else if(db[hash]||['Home','Workspace'].includes(hash))tab=hash;if(tab==='Morning Report')mode='matrix';sort=tab==='CPS Academy VMRs'?'date':'source';filter=tab==='Morning Report'?'Upcoming':'All';render();if(storageIssue)toast('Browser storage could not be read. Export changes before leaving.')}).catch(()=>{$('#page').innerHTML='<div class="empty-state"><h1>Could not load the workbook</h1><p>Please reload this page.</p></div>'});

// Recognise only unambiguous calendar dates; leave the source text and timezones intact.
function recordDate(r){const raw=dateValue(r);if(!raw)return '';const isoCand=String(raw).trim().slice(0,10);if(iso(isoCand))return validDate(isoCand);const usM=String(raw).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(usM)return validDate(`${usM[3]}-${usM[1].padStart(2,'0')}-${usM[2].padStart(2,'0')}`);const months=['january','february','march','april','may','june','july','august','september','october','november','december'];const m=String(raw).toLowerCase().match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(\d{4})\b/);if(!m)return '';return validDate(`${m[3]}-${String(months.indexOf(m[1])+1).padStart(2,'0')}-${m[2].padStart(2,'0')}`)}
function validDate(s){const d=new Date(s+'T12:00:00Z');return Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==s?'':s}
function extraFilters(){let html='';if(tab==='Podcast Episodes'){const owners=[...new Set(records('Podcast Episodes').flatMap(r=>[r.fields['Point person'],r.fields['Audio editor']].flatMap(v=>(v||'').split(/[/,;]/).map(s=>s.trim())).filter(Boolean)))].sort();html+=`<label>Owner<select class="select" id="owner-filter"><option value="">All owners</option>${owners.map(o=>`<option value="${esc(o)}" ${owner===o?'selected':''}>${esc(o)}</option>`).join('')}</select></label>`;}else if(tab==='Schema review'){const owners=[...new Set(records('Schema review').flatMap(r=>[r.fields['Video owner'],r.fields['Infographic owner']].map(s=>(s||'').trim()).filter(Boolean)))].sort();html+=`<label>Owner<select class="select" id="owner-filter"><option value="">All owners</option>${owners.map(o=>`<option value="${esc(o)}" ${owner===o?'selected':''}>${esc(o)}</option>`).join('')}</select></label>`;}if(tab==='Research @CPSolvers')html+=`<label>Research skill<select class="select" id="skill"><option value="">Any skill</option>${['Research writing','Data analytics','Cross-sectional studies','Systematic reviews','Qualitative studies','Case reports'].map(k=>`<option ${skill===k?'selected':''}>${esc(k)}</option>`).join('')}</select></label>`;if(records().some(r=>dateValue(r)))html+=`<label>From<input class="select" type="date" id="date-from" value="${esc(dateFrom)}"></label><label>To<input class="select" type="date" id="date-to" value="${esc(dateTo)}"></label>`;return html}
function bindExtraFilters(){if($('#owner-filter'))$('#owner-filter').onchange=e=>{owner=e.target.value;page=0;render()};if($('#skill'))$('#skill').onchange=e=>{skill=e.target.value;page=0;render()};for(const id of ['date-from','date-to'])if($('#'+id))$('#'+id).onchange=e=>{if(id==='date-from')dateFrom=e.target.value;else dateTo=e.target.value;page=0;render()}}
function staffingTools(){return `<section class="staffing-tools"><h3>Quick staffing entry</h3><p>Choose a role and enter a name. This fills the form; use Save changes to keep it.</p><label>Role<select id="staff-role" class="select">${['Facilitator','Presenter','Scribe','Teaching Points','Active participant 1','Active participant 2','Active participant 3','Active participant 4','Chat support','Available team'].map(k=>`<option>${k}</option>`).join('')}</select></label><label>Name<input id="staff-name" placeholder="Name or team" autocomplete="off"></label><button type="button" class="button secondary" id="assign-name">Fill assignment</button><p id="staff-message" role="status"></p></section>`}
function bindStaffingTools(targetRole){if(!$('#assign-name'))return;if(targetRole&&$('#staff-role')){$('#staff-role').value=targetRole;if(typeof window!=='undefined'&&(window.innerWidth||0)>760){setTimeout(()=>$('#staff-name')?.focus(),60);}}$('#assign-name').onclick=()=>{const name=$('#staff-name').value.trim(),role=$('#staff-role').value;if(!name){$('#staff-message').textContent='Enter a name first.';return}if(role==='Scribe'||role==='Teaching Points'){const el=[...$('#dialog-content').querySelectorAll('[data-field]')].find(el=>el.dataset.field==='Scribe / teaching points sign-ups');if(el){const rolePat=role==='Teaching Points'?'(?:Teaching Points|TP)':'Scribe';const lineRegex=new RegExp(`(^|\\r?\\n)([^\\S\\r\\n]*${rolePat}:[^\\S\\r\\n]*)([^\\r\\n|]*)(.*?)($|\\r?\\n)`,`i`);if(lineRegex.test(el.value)){el.value=el.value.replace(lineRegex,(match,p1,p2,p3,p4,p5)=>`${p1}${p2}${name}${p4}${p5}`);}else{el.value=(el.value?el.value+'\n':'')+`${role}: ${name}`}el.dispatchEvent(new Event('input',{bubbles:true}));$('#staff-message').textContent=`${role} filled. Save changes to keep the assignment.`;el.focus();return}}const el=[...$('#dialog-content').querySelectorAll('[data-field]')].find(el=>el.dataset.field===role);if(!el)return;const current=el.value.trim();if(current&&!/^(tbd|none|-|na|n\/a|—)$/i.test(current)){if(current.split(/[,;\n&+/]/).some(s=>s.trim().toLowerCase()===name.toLowerCase())){$('#staff-message').textContent='That name is already assigned.';return}if(/\b(tbd|none|-)\b/i.test(current)){el.value=current.replace(/\b(tbd|none|-)\b/i,name)}else{el.value=current+', '+name}}else el.value=name;el.dispatchEvent(new Event('input',{bubbles:true}));$('#staff-message').textContent=`${role} filled. Save changes to keep the assignment.`;el.focus()}}

function mrGaps(r){const f=r.fields,fac=(f.Facilitator||'').trim();if(/canceled|cancelled/i.test(fac)||fac.toLowerCase()==='none'||(f.Type||'').trim().toLowerCase()==='none')return[];const gaps=[];if(!fac||/^(tbd|none|-|na|n\/a|—)$/i.test(fac)||/\b(tbd)\b/i.test(fac))gaps.push('Facilitator');const signups=f['Scribe / teaching points sign-ups']||'';const cleanSignups=signups.split(/\r?\n[-_]{3,}/)[0];const pres=(f.Presenter||'').trim()||(cleanSignups.match(/(?:Case Presenter|Presenter):[^\S\r\n]*([^\r\n|]+)/i)?.[1]||'').trim();if(!pres||/^(tbd|none|-|na|n\/a|—)$/i.test(pres))gaps.push('Presenter');const scribe=(cleanSignups.match(/(?:^|\r?\n)[^\S\r\n]*Scribe:[^\S\r\n]*([^\r\n|]+)/i)?.[1]||'').trim();if(!scribe||/^(tbd|none|-|na|n\/a|—)$/i.test(scribe))gaps.push('Scribe');const tp=(cleanSignups.match(/(?:^|\r?\n)[^\S\r\n]*(?:Teaching Points|TP):[^\S\r\n]*([^\r\n|]+)/i)?.[1]||'').trim();if(!tp||/^(tbd|none|-|na|n\/a|—)$/i.test(tp))gaps.push('Teaching Points');return gaps}
function weekKey(isoDate){const d=new Date(isoDate+'T12:00:00Z'),day=d.getUTCDay(),diffToMon=(day===0?-6:1-day);const mon=new Date(d);mon.setUTCDate(d.getUTCDate()+diffToMon);const sun=new Date(mon);sun.setUTCDate(mon.getUTCDate()+6);const toIso=dt=>dt.toISOString().slice(0,10);return{start:toIso(mon),end:toIso(sun)}}
function weekLabel(start,end){const s=new Date(start+'T12:00:00Z'),e=new Date(end+'T12:00:00Z');return `Week of ${s.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'})} – ${e.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'})}`}
function matrixView(rr){const dated=[],unresolved=[];for(const r of rr){if(recordDate(r))dated.push(r);else unresolved.push(r)}dated.sort((a,b)=>recordDate(a).localeCompare(recordDate(b)));const weeksMap=new Map();for(const r of dated){const k=weekKey(recordDate(r));if(!weeksMap.has(k.start))weeksMap.set(k.start,{start:k.start,end:k.end,records:[]});weeksMap.get(k.start).records.push(r)}const weeks=[...weeksMap.values()].sort((a,b)=>a.start.localeCompare(b.start));const totalGaps=rr.reduce((acc,r)=>acc+mrGaps(r).length,0);const rows=[];for(const w of weeks){const weekGaps=w.records.reduce((acc,r)=>acc+mrGaps(r).length,0);rows.push(`<tr class="matrix-week-row"><td colspan="7"><div style="display:flex;justify-content:space-between;align-items:center;"><span>${esc(weekLabel(w.start,w.end))} · ${w.records.length} session${w.records.length===1?'':'s'}</span><span class="tag ${weekGaps?'gap-chip':'ready-chip'}">${weekGaps?`⚠ ${weekGaps} gap${weekGaps===1?'':'s'}`:'✓ Fully staffed'}</span></div></td></tr>`);for(const r of w.records){const f=r.fields,isoD=recordDate(r),gaps=mrGaps(r);const signups=f['Scribe / teaching points sign-ups']||'';const cleanSignups=signups.split(/\r?\n[-_]{3,}/)[0];const pres=(f.Presenter||'').trim()||(cleanSignups.match(/(?:Case Presenter|Presenter):[^\S\r\n]*([^\r\n|]+)/i)?.[1]||'').trim();const scribe=(cleanSignups.match(/(?:^|\r?\n)[^\S\r\n]*Scribe:[^\S\r\n]*([^\r\n|]+)/i)?.[1]||'').trim();const tp=(cleanSignups.match(/(?:^|\r?\n)[^\S\r\n]*(?:Teaching Points|TP):[^\S\r\n]*([^\r\n|]+)/i)?.[1]||'').trim();const dObj=isoD?new Date(isoD+'T12:00:00Z'):null;const dayName=dObj?dObj.toLocaleDateString('en-US',{weekday:'short',timeZone:'UTC'}):'Date';const dayNum=dObj?dObj.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'}):(dateValue(r)||'Unresolved');const timeStr=f['Pacific time (source)']?`${esc(f['Pacific time (source)'])} PT`:'';const hasGaps=gaps.length>0;const facBtn=gaps.includes('Facilitator')?`<button type="button" class="matrix-slot-btn matrix-slot-gap gap-action-btn" data-open="${esc(r.id)}" data-role="Facilitator">＋ Missing Facilitator</button>`:`<span class="matrix-slot-assigned" title="${esc(f.Facilitator)}">${esc(f.Facilitator)}</span>`;const presBtn=gaps.includes('Presenter')?`<button type="button" class="matrix-slot-btn matrix-slot-gap gap-action-btn" data-open="${esc(r.id)}" data-role="Presenter">＋ Missing Presenter</button>`:`<span class="matrix-slot-assigned" title="${esc(pres)}">${esc(pres)}</span>`;const scribeBtn=gaps.includes('Scribe')?`<button type="button" class="matrix-slot-btn matrix-slot-gap gap-action-btn" data-open="${esc(r.id)}" data-role="Scribe">＋ Missing Scribe</button>`:`<span class="matrix-slot-assigned" title="${esc(scribe)}">${esc(scribe)}</span>`;const tpBtn=gaps.includes('Teaching Points')?`<button type="button" class="matrix-slot-btn matrix-slot-gap gap-action-btn" data-open="${esc(r.id)}" data-role="Teaching Points">＋ Missing TP</button>`:`<span class="matrix-slot-assigned" title="${esc(tp)}">${esc(tp)}</span>`;rows.push(`<tr class="matrix-row ${hasGaps?'matrix-row-has-gap':''}"><td><div class="matrix-date-cell"><span class="matrix-day-badge">${esc(dayName)}</span><div><span class="matrix-date-text">${esc(dayNum)}</span>${timeStr?`<span class="matrix-time-sub">${timeStr}</span>`:''}</div></div></td><td><strong style="font-size:12px;">${esc(title(r,'Morning Report'))}</strong>${f.Type&&f.Type!=='Morning Report'?`<span class="tag" style="margin-left:4px;font-size:9px;">${esc(f.Type)}</span>`:''}</td><td>${facBtn}</td><td>${presBtn}</td><td>${scribeBtn}</td><td>${tpBtn}</td><td><div class="matrix-actions">${hasGaps?`<span class="tag gap-chip" style="font-size:10px;padding:2px 6px;">⚠ ${gaps.length}</span>`:`<span class="tag ready-chip" style="font-size:10px;padding:2px 6px;">✓</span>`}<button class="button secondary small" style="min-height:28px;padding:0 8px;font-size:11px;" data-open="${esc(r.id)}" data-area="Morning Report">Staff</button><button class="icon-button star ${workspace.favorites.includes(r.id)?'is-starred':''}" style="width:28px;height:28px;font-size:16px;" aria-label="${workspace.favorites.includes(r.id)?'Unpin':'Pin'} record" data-star="${esc(r.id)}">${workspace.favorites.includes(r.id)?'★':'☆'}</button></div></td></tr>`);}}return `<section class="matrix-view"><div class="agenda-summary panel"><div><strong>${dated.length} scheduled session${dated.length===1?'':'s'}</strong><span class="muted"> across ${weeks.length} week${weeks.length===1?'':'s'} (Desktop Staffing Matrix)</span></div><div>${totalGaps?`<span class="tag gap-chip">⚠ ${totalGaps} staffing gap${totalGaps===1?'':'s'}</span>`:`<span class="tag ready-chip">✓ All sessions fully staffed</span>`}</div>${unresolved.length?`<a class="text-button" href="#unresolved-dates">↓ ${unresolved.length} unresolved date record${unresolved.length===1?'':'s'}</a>`:''}</div><div class="matrix-card"><div class="matrix-container"><table class="matrix-table"><thead><tr><th>Date / Day</th><th>Session / Type</th><th>Facilitator</th><th>Presenter</th><th>Scribe</th><th>Teaching Points</th><th>Actions</th></tr></thead><tbody>${rows.join('')||'<tr><td colspan="7" class="empty-state">No dated sessions match the current filters.</td></tr>'}</tbody></table></div></div>${unresolved.length?`<section class="panel unresolved-panel" id="unresolved-dates"><div class="panel-head"><div><h2>Unresolved & Pending Dates</h2><p>Sessions with non-standard date text, unconfirmed dates or missing calendar entries.</p></div><span class="tag review-chip">${unresolved.length} unresolved record${unresolved.length===1?'':'s'}</span></div><div class="agenda-session-list">${unresolved.map(r=>agendaCard(r,true)).join('')}</div></section>`:''}</section>`}
function agendaView(rr){const dated=[],unresolved=[];for(const r of rr){if(recordDate(r))dated.push(r);else unresolved.push(r)}dated.sort((a,b)=>recordDate(a).localeCompare(recordDate(b)));const weeksMap=new Map();for(const r of dated){const k=weekKey(recordDate(r));if(!weeksMap.has(k.start))weeksMap.set(k.start,{start:k.start,end:k.end,records:[]});weeksMap.get(k.start).records.push(r)}const weeks=[...weeksMap.values()].sort((a,b)=>a.start.localeCompare(b.start));const totalGaps=rr.reduce((acc,r)=>acc+mrGaps(r).length,0);return `<section class="agenda-view"><div class="agenda-summary panel"><div><strong>${dated.length} scheduled session${dated.length===1?'':'s'}</strong><span class="muted"> across ${weeks.length} week${weeks.length===1?'':'s'}</span></div><div>${totalGaps?`<span class="tag gap-chip">⚠ ${totalGaps} staffing gap${totalGaps===1?'':'s'}</span>`:`<span class="tag ready-chip">✓ All sessions fully staffed</span>`}</div>${unresolved.length?`<a class="text-button" href="#unresolved-dates">↓ ${unresolved.length} unresolved date record${unresolved.length===1?'':'s'}</a>`:''}</div>${weeks.length?weeks.map(w=>{const weekGaps=w.records.reduce((acc,r)=>acc+mrGaps(r).length,0);return `<div class="agenda-week panel"><div class="agenda-week-head"><div><h3>${weekLabel(w.start,w.end)}</h3><span class="muted">${w.records.length} session${w.records.length===1?'':'s'}</span></div>${weekGaps?`<span class="tag gap-chip">⚠ ${weekGaps} staffing gap${weekGaps===1?'':'s'}</span>`:`<span class="tag ready-chip">✓ Fully staffed</span>`}</div><div class="agenda-session-list">${w.records.map(r=>agendaCard(r)).join('')}</div></div>`}).join(''):'<div class="empty-state panel">No dated sessions match the current filters.</div>'}<section class="panel unresolved-panel" id="unresolved-dates"><div class="panel-head"><div><h2>Unresolved & Pending Dates</h2><p>Sessions with non-standard date text, unconfirmed dates or missing calendar entries. Preserved from source without guessing.</p></div><span class="tag review-chip">${unresolved.length} unresolved record${unresolved.length===1?'':'s'}</span></div>${unresolved.length?`<div class="agenda-session-list">${unresolved.map(r=>agendaCard(r,true)).join('')}</div>`:'<div class="empty-state"><p>No unresolved date records in this filter.</p></div>'}</section></section>`}
function agendaCard(r,isUnresolved=false){const f=r.fields,isoD=recordDate(r),gaps=mrGaps(r);const signups=f['Scribe / teaching points sign-ups']||'';const cleanSignups=signups.split(/\r?\n[-_]{3,}/)[0];const pres=(f.Presenter||'').trim()||(cleanSignups.match(/(?:Case Presenter|Presenter):[^\S\r\n]*([^\r\n|]+)/i)?.[1]||'').trim();const scribe=(cleanSignups.match(/(?:^|\r?\n)[^\S\r\n]*Scribe:[^\S\r\n]*([^\r\n|]+)/i)?.[1]||'').trim();const tp=(cleanSignups.match(/(?:^|\r?\n)[^\S\r\n]*(?:Teaching Points|TP):[^\S\r\n]*([^\r\n|]+)/i)?.[1]||'').trim();const dObj=isoD?new Date(isoD+'T12:00:00Z'):null;const dayName=dObj?dObj.toLocaleDateString('en-US',{weekday:'short',timeZone:'UTC'}):'Date';const dayNum=dObj?dObj.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'}):(dateValue(r)||'Unresolved');return `<article class="agenda-card"><div class="agenda-card-date"><span class="agenda-card-day">${esc(dayName)}</span><strong>${esc(dayNum)}</strong></div><div class="agenda-card-body"><div class="agenda-card-top"><span class="tag">${esc(f.Type||'Morning Report')}</span><span class="muted agenda-times">${esc(f['Pacific time (source)']||'Time TBD')} PT · ${esc(f['Eastern time (source)']||'TBD')} ET</span>${r.flags.length?chip('Verify source details','review-chip'):''}${workspace.edits[r.id]?chip('Local changes','local-chip'):''}</div><h4 class="agenda-card-title">${esc(title(r,'Morning Report'))}</h4><div class="agenda-staff-grid"><div class="agenda-staff-slot"><small>Facilitator</small><strong>${f.Facilitator?esc(f.Facilitator):'<span class="gap-text">Missing</span>'}</strong></div><div class="agenda-staff-slot"><small>Presenter</small><strong>${pres?esc(pres):'<span class="gap-text">Missing</span>'}</strong></div><div class="agenda-staff-slot"><small>Scribe</small><strong>${scribe?esc(scribe):'<span class="gap-text">Missing</span>'}</strong></div><div class="agenda-staff-slot"><small>Teaching Points</small><strong>${tp?esc(tp):'<span class="gap-text">Missing</span>'}</strong></div></div>${gaps.length?`<div class="agenda-gaps-bar"><span class="gap-bar-label">Gaps:</span><div class="gap-buttons">${gaps.map(g=>`<button type="button" class="button small gap-action-btn" data-open="${esc(r.id)}" data-area="Morning Report" data-role="${esc(g)}">＋ Assign ${esc(g)}</button>`).join('')}</div></div>`:''}</div><div class="agenda-card-actions"><button class="button primary small" data-open="${esc(r.id)}" data-area="Morning Report">Staff session</button><button class="icon-button star ${workspace.favorites.includes(r.id)?'is-starred':''}" aria-label="${workspace.favorites.includes(r.id)?'Unpin':'Pin'} record" data-star="${esc(r.id)}">${workspace.favorites.includes(r.id)?'★':'☆'}</button></div></article>`}

function recordStage(r,t){const f=r.fields;if(t==='Schema review'){const st=(f.Status||'').trim();if(!st)return 'Draft / Needs review';const lower=st.toLowerCase();if(lower==='uploaded')return 'Uploaded';if(lower==='in review')return 'In review';if(lower==='ready')return 'Ready';if(lower==='recorded')return 'Recorded';if(lower==='assigned')return 'Assigned';return st;}if(t==='Podcast Episodes'){const custom=(f.Status||'').trim();if(custom)return custom;const rel=f['Release date'];if(rel&&iso(rel)&&rel<=today())return 'Released';if(!f['Audio editor'])return 'Needs Audio Editor';if(!f['Point person'])return 'Needs Point Person';return 'In Editing';}return f.Status||'Active';}
function boardStages(rr,t){if(t==='Schema review'){const base=['Draft / Needs review','Assigned','In review','Ready','Uploaded'],custom=[...new Set(rr.map(r=>recordStage(r,t)))].filter(s=>!base.includes(s));return[...base.slice(0,base.length-1),...custom,base[base.length-1]];}if(t==='Podcast Episodes'){const base=['Needs Audio Editor','Needs Point Person','In Editing','Released'],custom=[...new Set(rr.map(r=>recordStage(r,t)))].filter(s=>!base.includes(s));return[...base.slice(0,base.length-1),...custom,base[base.length-1]];}return[...new Set(rr.map(r=>recordStage(r,t)))];}
function workflowCard(r,t,stages,stageIndex){const f=r.fields,stage=stages[stageIndex],prevStage=stageIndex>0?stages[stageIndex-1]:null,nextStage=stageIndex<stages.length-1?stages[stageIndex+1]:null;let metaHtml='';if(t==='Schema review'){metaHtml=`<p class="work-card-line"><small>Video:</small> <strong>${esc(f['Video owner']||'Unassigned')}</strong></p><p class="work-card-line"><small>Infographic:</small> <strong>${esc(f['Infographic owner']||'Unassigned')}</strong></p>${f['Review deadline (source)']?`<p class="work-card-line"><small>Deadline:</small> <span>${esc(f['Review deadline (source)'])}</span></p>`:''}`;}else if(t==='Podcast Episodes'){metaHtml=`<p class="work-card-line"><small>Editor:</small> <strong>${esc(f['Audio editor']||'None')}</strong></p><p class="work-card-line"><small>Point person:</small> <strong>${esc(f['Point person']||'Unassigned')}</strong></p>${f['Release date']?`<p class="work-card-line"><small>Release:</small> <span>${esc(f['Release date'])}</span></p>`:''}`;}let quickBtn='';if(t==='Schema review'){if(stage!=='Uploaded'){quickBtn=`<button type="button" class="button primary small" data-move-id="${esc(r.id)}" data-target-stage="Uploaded">✓ Uploaded</button>`;}else{quickBtn=`<button type="button" class="button secondary small" data-move-id="${esc(r.id)}" data-target-stage="Draft / Needs review">↺ Draft</button>`;}}else if(t==='Podcast Episodes'){if(stage==='Needs Audio Editor'){quickBtn=`<button type="button" class="button primary small quick-editor-btn" data-record-id="${esc(r.id)}">＋ Editor</button>`;}else if(stage==='In Editing'){quickBtn=`<button type="button" class="button primary small" data-move-id="${esc(r.id)}" data-target-stage="Released">✓ Released</button>`;}else if(stage==='Released'){quickBtn=`<button type="button" class="button secondary small" data-move-id="${esc(r.id)}" data-target-stage="Needs Audio Editor">↺ Needs Editor</button>`;}}return `<article class="work-card" draggable="true" data-drag-id="${esc(r.id)}"><div class="work-card-head"><span class="tag">${esc(stage)}</span><div class="record-markers">${r.flags.length?chip('Verify','review-chip'):''}${workspace.edits[r.id]?chip('Local','local-chip'):''}</div></div><h3>${esc(title(r,t))}</h3><div class="work-card-meta">${metaHtml}</div><div class="work-card-foot"><div class="work-card-actions">${prevStage?`<button type="button" class="button secondary small stage-nav-btn" data-move-id="${esc(r.id)}" data-target-stage="${esc(prevStage)}" title="Move left to ${esc(prevStage)}" aria-label="Move left to ${esc(prevStage)}">← ${esc(prevStage)}</button>`:''}${nextStage?`<button type="button" class="button secondary small stage-nav-btn" data-move-id="${esc(r.id)}" data-target-stage="${esc(nextStage)}" title="Move right to ${esc(nextStage)}" aria-label="Move right to ${esc(nextStage)}">${esc(nextStage)} →</button>`:''}${quickBtn}<button type="button" class="button secondary small" data-open="${esc(r.id)}" data-area="${esc(t)}">Details</button><button class="icon-button star ${workspace.favorites.includes(r.id)?'is-starred':''}" aria-label="${workspace.favorites.includes(r.id)?'Unpin':'Pin'} record" data-star="${esc(r.id)}">${workspace.favorites.includes(r.id)?'★':'☆'}</button></div></div></article>`;}
function workflowBoard(rr,t){const stages=boardStages(rr,t);const byStage={};stages.forEach(s=>byStage[s]=[]);rr.forEach(r=>{const s=recordStage(r,t);if(!byStage[s])byStage[s]=[];byStage[s].push(r);});return `<section class="pipeline-auto">${stages.map((st,idx)=>{const list=byStage[st]||[];return `<div class="lane" data-lane-stage="${esc(st)}"><div class="lane-head"><span>${esc(st)}</span><span class="lane-count">${list.length}</span></div><div class="lane-items">${list.map(r=>workflowCard(r,t,stages,idx)).join('')||'<div class="empty-state" style="padding:20px 8px;font-size:11px">No records in this stage</div>'}</div></div>`;}).join('')}</section>`;}
function applyStageChange(id,t,targetStage){const r=records(t).find(x=>x.id===id);if(!r)return;const updates={};if(t==='Schema review'){if(targetStage==='Uploaded'){updates.Status='uploaded';updates.Uploaded='Yes';}else if(targetStage==='Draft / Needs review'){updates.Status='';updates.Uploaded='';}else if(targetStage==='In review'){updates.Status='in review';}else if(targetStage==='Ready'){updates.Status='ready';}else if(targetStage==='Assigned'){updates.Status='assigned';}else{updates.Status=targetStage;}}else if(t==='Podcast Episodes'){if(targetStage==='Needs Audio Editor'){updates['Audio editor']='';}else if(targetStage==='Needs Point Person'){updates['Point person']='';}else if(targetStage==='In Editing'){if(!r.fields['Audio editor'])updates['Audio editor']='Zakariyya';}else if(targetStage==='Released'){updates['Release date']=today();}else if(db[t].columns.includes('Status')){updates.Status=targetStage;}}if(Object.keys(updates).length){if(mutate(w=>{w.edits[id]={...(w.edits[id]||{}),...updates};log(w,`Moved to ${targetStage}`,r,t);})){render();toast(`Moved to ${targetStage}`);}}}
function quickAssignEditor(id){const r=records('Podcast Episodes').find(x=>x.id===id);if(!r)return;const val=prompt('Enter Audio Editor name:',r.fields['Audio editor']||'Zakariyya');if(val!==null&&val.trim()){if(mutate(w=>{w.edits[id]={...(w.edits[id]||{}),'Audio editor':val.trim()};log(w,'Assigned Audio Editor',r,'Podcast Episodes');})){render();toast(`Audio editor assigned: ${val.trim()}`);}}}
function bindBoardEvents(t){document.querySelectorAll('[data-drag-id]').forEach(el=>{el.ondragstart=e=>e.dataTransfer.setData('text/plain',el.dataset.dragId);});document.querySelectorAll('[data-lane-stage]').forEach(lane=>{lane.ondragover=e=>{e.preventDefault();lane.classList.add('drag-over');};lane.ondragleave=()=>lane.classList.remove('drag-over');lane.ondrop=e=>{e.preventDefault();lane.classList.remove('drag-over');const id=e.dataTransfer.getData('text/plain');if(id)applyStageChange(id,t,lane.dataset.laneStage);};});document.querySelectorAll('[data-move-id]').forEach(b=>{b.onclick=()=>applyStageChange(b.dataset.moveId,t,b.dataset.targetStage);});document.querySelectorAll('.quick-editor-btn').forEach(b=>{b.onclick=()=>quickAssignEditor(b.dataset.recordId);});}
