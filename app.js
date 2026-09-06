const navItems = [
  { id: "dashboard", label: "Home", desktop: "Overview", icon: "⌂" },
  { id: "vmr", label: "VMRs", desktop: "Morning Reports", icon: "◫", badge: 3 },
  { id: "members", label: "People", desktop: "Members & leadership", icon: "♙" },
  { id: "work", label: "Work", desktop: "Content & projects", icon: "◇", badge: 4 },
  { id: "links", label: "Links", desktop: "Important links", icon: "↗" },
  { id: "integration", label: "Data connection", desktop: "Data connection", icon: "↻", desktopOnly: true },
];

const vmrs = [
  { id: 1, date: "10 Sep", day: "Thursday", title: "Fever, cytopenias & a hidden exposure", type: "Global VMR", facilitator: "Amina K.", discussant: "Diego M.", status: "ready", time: "18:00 SAST", platform: "Zoom", tasks: ["Case deck received", "Facilitator confirmed", "Social card approved"] },
  { id: 2, date: "15 Sep", day: "Tuesday", title: "Progressive dyspnoea in a young adult", type: "Pulmonary VMR", facilitator: "Zakariyya G.", discussant: "Maya R.", status: "progress", time: "19:00 SAST", platform: "Zoom", tasks: ["Case deck received", "Discussant pending", "Social copy drafted"] },
  { id: 3, date: "19 Sep", day: "Saturday", title: "Acute weakness: localisation before labels", type: "Neuro VMR", facilitator: "Omar S.", discussant: "Rachel T.", status: "scheduled", time: "16:00 SAST", platform: "Zoom", tasks: ["Case selected", "Facilitator confirmed", "Promotion not started"] },
  { id: 4, date: "27 Aug", day: "Thursday", title: "The jaundiced patient with a normal scan", type: "Global VMR", facilitator: "Leila N.", discussant: "Sam P.", status: "published", time: "18:00 SAST", platform: "YouTube", tasks: ["Recording uploaded", "Pearls reviewed", "Archive published"] },
  { id: 5, date: "20 Aug", day: "Thursday", title: "Shock beyond the blood pressure", type: "ICU VMR", facilitator: "Nandi B.", discussant: "Chris H.", status: "published", time: "18:00 SAST", platform: "YouTube", tasks: ["Recording uploaded", "Pearls reviewed", "Archive published"] },
];

const members = [
  { name: "Rabih Geha", initials: "RG", role: "Faculty lead", region: "United States", teams: ["Leadership", "VMR"], active: "This week" },
  { name: "Zakariyya Gardee", initials: "ZG", role: "VMR leadership", region: "South Africa", teams: ["VMR", "Welcome"], active: "Today" },
  { name: "Amina Khan", initials: "AK", role: "Academy member", region: "United Kingdom", teams: ["VMR", "Podcast"], active: "Yesterday" },
  { name: "Diego Morales", initials: "DM", role: "Academy member", region: "Colombia", teams: ["VMR", "Research"], active: "3 days ago" },
  { name: "Leila Nasser", initials: "LN", role: "Project lead", region: "Lebanon", teams: ["Podcast", "Schemas"], active: "Today" },
  { name: "Nandi Botha", initials: "NB", role: "Academy member", region: "South Africa", teams: ["Research", "Welcome"], active: "This week" },
];

const workItems = {
  podcast: [
    { stage: "Ideas", title: "Diagnostic timeout: when to restart", owner: "AK", meta: "Pitch · 6 Sep", progress: 15 },
    { stage: "Pre-production", title: "Illness scripts that survive the bedside", owner: "LN", meta: "Outline due · 12 Sep", progress: 40 },
    { stage: "Recording", title: "Why the problem representation matters", owner: "ZG", meta: "Guest confirmed", progress: 62 },
    { stage: "Publishing", title: "The clinical reasoning learner's toolkit", owner: "DM", meta: "Audio approved", progress: 88 },
  ],
  projects: [
    { stage: "Proposed", title: "Cognitive forcing strategies survey", owner: "NB", meta: "Research · protocol", progress: 12 },
    { stage: "In review", title: "Academy outcomes registry", owner: "DM", meta: "Research · methods", progress: 52 },
    { stage: "Accepted", title: "AMEE 2027 workshop submission", owner: "RG", meta: "Conference · abstract", progress: 78 },
    { stage: "Complete", title: "Virtual teaching collaboration poster", owner: "AK", meta: "Conference · archived", progress: 100 },
  ],
  schemas: [
    { stage: "Submitted", title: "Approach to hyperbilirubinaemia", owner: "ZG", meta: "Hepatology · v1", progress: 20 },
    { stage: "Clinical review", title: "Acute flaccid weakness", owner: "NB", meta: "Neurology · v3", progress: 48 },
    { stage: "Design review", title: "Nephrotic syndrome mechanisms", owner: "LN", meta: "Nephrology · v2", progress: 74 },
    { stage: "Approved", title: "Pulmonary hypertension", owner: "RG", meta: "Cardiology · final", progress: 100 },
  ],
};

const links = [
  { icon: "▶", title: "VMR meeting room", text: "Standing link for live Virtual Morning Reports", category: "VMR", label: "Open Zoom ↗" },
  { icon: "▣", title: "Case submission form", text: "Submit a case for faculty and facilitator review", category: "VMR", label: "Open form ↗" },
  { icon: "△", title: "Academy shared drive", text: "Working documents, media and programme folders", category: "Operations", label: "Open Drive ↗" },
  { icon: "◎", title: "Podcast production guide", text: "Recording, editing, show notes and release checklist", category: "Podcast", label: "View guide ↗" },
  { icon: "⌁", title: "Research registry", text: "Active proposals, contributors and project milestones", category: "Research", label: "View registry ↗" },
  { icon: "◇", title: "Schema review rubric", text: "Clinical, editorial and design quality standards", category: "Schemas", label: "View rubric ↗" },
  { icon: "▦", title: "Conference calendar", text: "Abstract deadlines and Academy presentations", category: "Events", label: "View calendar ↗" },
  { icon: "✦", title: "Social media toolkit", text: "Templates, handles, captions and release assets", category: "Operations", label: "Open toolkit ↗" },
  { icon: "?", title: "Who to contact", text: "Fast routing for programme and platform questions", category: "Members", label: "View contacts ↗" },
];

const tasks = [
  { title: "Confirm discussant for Pulmonary VMR", sub: "Due today · Amina", status: "overdue" },
  { title: "Review podcast episode show notes", sub: "Due 8 Sep · Zakariyya", status: "review" },
  { title: "Approve hyperbilirubinaemia schema", sub: "Due 9 Sep · Clinical review", status: "review" },
  { title: "Add presenters to AMEE abstract", sub: "Due 14 Sep · Research team", status: "planned" },
];

const state = { route: "dashboard", vmrFilter: "Upcoming", workTab: "podcast", search: "" };
const page = document.querySelector("#page");
const globalSearch = document.querySelector("#global-search");

function navMarkup(item, mobile = false) {
  if (mobile && item.desktopOnly) return "";
  return `<button class="nav-button ${state.route === item.id ? "active" : ""}" data-route="${item.id}"><span class="nav-icon">${item.icon}</span><span class="nav-label">${mobile ? item.label : item.desktop}</span>${item.badge ? `<span class="nav-badge">${item.badge}</span>` : ""}</button>`;
}

function renderNav() {
  document.querySelector("#desktop-nav").innerHTML = navItems.map(i => navMarkup(i)).join("");
  document.querySelector("#mobile-nav").innerHTML = navItems.map(i => navMarkup(i, true)).join("");
}

function heading(eyebrow, title, subtitle, action = "") {
  return `<div class="page-heading"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p>${subtitle}</p></div>${action || `<span class="date-pill">● Sunday, 6 September</span>`}</div>`;
}

function statusLabel(status) {
  const labels = { ready: "Ready", progress: "In progress", blocked: "Blocked", scheduled: "Scheduled", published: "Published", review: "Needs review", overdue: "Overdue", planned: "Planned", active: "Active", approved: "Approved", recording: "Recording" };
  return `<span class="status ${status}">${labels[status] || status}</span>`;
}

function renderDashboard() {
  page.innerHTML = `
    ${heading("Sunday briefing", "Good morning, Zakariyya", "The Academy's priorities, people and next live session in one place.")}
    <section class="hero" data-searchable="next global vmr fever cytopenias hidden exposure amina diego thursday">
      <div class="hero-copy">
        <p class="eyebrow">Next live session · 4 days</p>
        <h2>Fever, cytopenias & a hidden exposure</h2>
        <p>Case materials are complete. The session team is confirmed and the social card is ready for release.</p>
        <div class="hero-actions"><button class="button primary" data-vmr-id="1">Open VMR brief</button><button class="button secondary" data-demo-action="Copied meeting link">Copy meeting link</button></div>
      </div>
      <div class="hero-meta">
        <div class="meta-row"><span class="meta-icon">▣</span><div><strong>Thursday, 10 September</strong><span>18:00 SAST · 16:00 UTC</span></div></div>
        <div class="meta-row"><span class="meta-icon">♙</span><div><strong>Amina K. · Diego M.</strong><span>Facilitator · Discussant</span></div></div>
        <div class="meta-row"><span class="meta-icon">✓</span><div><strong>Ready to run</strong><span>3 of 3 checks complete</span></div></div>
      </div>
    </section>
    <section class="stat-grid">
      <article class="stat-card"><div class="stat-top"><p>Upcoming VMRs</p><span class="trend">Next 30d</span></div><strong>3</strong></article>
      <article class="stat-card"><div class="stat-top"><p>Needs attention</p><span class="trend" style="color:#a94840;background:#fbeae8">2 urgent</span></div><strong>4</strong></article>
      <article class="stat-card"><div class="stat-top"><p>Active members</p><span class="trend">+6 this year</span></div><strong>47</strong></article>
      <article class="stat-card"><div class="stat-top"><p>Schemas in review</p><span class="trend">2 this week</span></div><strong>5</strong></article>
    </section>
    <section class="content-grid">
      <article class="panel">
        <div class="panel-head"><div><h2>Attention queue</h2><p>Work that could block the next release or session</p></div><button class="text-button" data-route="work">Open board →</button></div>
        <div class="task-list">${tasks.map((t, i) => `<div class="task-row" data-searchable="${t.title} ${t.sub}"><input class="task-check" type="checkbox" aria-label="Complete ${t.title}" data-task="${i}"><div><p class="task-title">${t.title}</p><p class="task-sub">${t.sub}</p></div>${statusLabel(t.status)}</div>`).join("")}</div>
      </article>
      <article class="panel">
        <div class="panel-head"><div><h2>Coming up</h2><p>Academy dates</p></div><button class="text-button" data-route="work">Full calendar →</button></div>
        <div class="event-list">
          <div class="event" data-searchable="vmr september"><div class="event-date"><strong>10</strong><span>SEP</span></div><div><p>Global VMR</p><small>18:00 SAST · Zoom</small></div></div>
          <div class="event" data-searchable="podcast september"><div class="event-date"><strong>12</strong><span>SEP</span></div><div><p>Podcast outline due</p><small>Pre-production milestone</small></div></div>
          <div class="event" data-searchable="conference amee october"><div class="event-date"><strong>02</strong><span>OCT</span></div><div><p>AMEE workshop deadline</p><small>Abstract submission</small></div></div>
        </div>
      </article>
    </section>
    <button class="source-banner source-button" data-route="integration"><span class="meta-icon" style="background:#dff2ee">↻</span><div><strong>Prototype data · Google Sheets not connected</strong><span>See the safe, staged path from the current workbook to this app.</span></div><span aria-hidden="true">→</span></button>`;
}

function renderVMR() {
  const filtered = vmrs.filter(v => state.vmrFilter === "All" || (state.vmrFilter === "Upcoming" ? !["published"].includes(v.status) : v.status === "published"));
  page.innerHTML = `
    ${heading("Core programme", "Morning Reports & VMRs", "Plan live sessions, see readiness and retrieve the archive.", `<button class="button primary" data-open-new>＋ Schedule VMR</button>`)}
    <div class="source-banner"><span class="meta-icon" style="background:#ffe8bb">i</span><div><strong>Showing realistic sample data</strong><span>This prototype is not connected to the Academy workbook. A later integration can map Sheet rows into these views without changing the navigation.</span></div></div>
    <div class="toolbar"><div class="segmented">${["Upcoming","Archive","All"].map(x => `<button class="${state.vmrFilter === x ? "active" : ""}" data-vmr-filter="${x}">${x}</button>`).join("")}</div><span class="spacer"></span><select class="select" aria-label="Filter VMR type"><option>All programmes</option><option>Global VMR</option><option>Special VMR</option></select></div>
    <section class="panel table-panel">
      <table class="data-table"><thead><tr><th>Session</th><th>Date</th><th>Facilitator</th><th>Discussant</th><th>Status</th></tr></thead><tbody>
        ${filtered.map(v => `<tr data-vmr-id="${v.id}" data-searchable="${v.title} ${v.type} ${v.facilitator} ${v.discussant} ${v.status}"><td><div class="primary-cell"><span class="type-dot"></span><div><strong>${v.title}</strong><span>${v.type}</span></div></div></td><td data-label="Date"><strong>${v.date}</strong><br><span class="muted">${v.day}</span></td><td data-label="Facilitator">${v.facilitator}</td><td data-label="Discussant">${v.discussant}</td><td data-label="Status">${statusLabel(v.status)}</td></tr>`).join("")}
      </tbody></table>
      <div class="empty-state search-hidden" id="empty-search">No sessions match this search.</div>
    </section>`;
}

function renderMembers() {
  page.innerHTML = `
    ${heading("People", "Members & leadership", "Find the right person, understand roles and keep collaborations moving.", `<button class="button secondary" data-demo-action="Directory export prepared">Export directory</button>`)}
    <div class="toolbar"><div class="segmented"><button class="active">All members</button><button>Leadership</button><button>Project teams</button></div><span class="spacer"></span><select class="select"><option>All regions</option><option>Africa</option><option>Americas</option><option>Europe</option></select></div>
    <p class="section-label">Leadership at a glance</p>
    <section class="leadership-strip">
      <article class="leader-card" data-searchable="faculty leadership rabih"><strong>Faculty & strategy</strong><span>Rabih G. · Core faculty</span><div class="mini-metric">● 2 active priorities</div></article>
      <article class="leader-card" data-searchable="vmr leadership zakariyya"><strong>VMR programme</strong><span>Zakariyya G. · Leadership team</span><div class="mini-metric">● Next session 10 Sep</div></article>
      <article class="leader-card" data-searchable="podcast leila"><strong>Podcast workflow</strong><span>Leila N. · Project lead</span><div class="mini-metric">● 3 episodes active</div></article>
      <article class="leader-card" data-searchable="research diego"><strong>Research registry</strong><span>Diego M. · Project lead</span><div class="mini-metric">● 2 projects in review</div></article>
    </section>
    <p class="section-label">Directory · 47 active members</p>
    <section class="card-grid">${members.map((m, i) => `<article class="person-card" data-searchable="${m.name} ${m.role} ${m.region} ${m.teams.join(" ")}"><div class="person-top"><div class="avatar" style="background:hsl(${185 + i*18} 32% ${37 + (i%3)*7}%)">${m.initials}</div><div><h3>${m.name}</h3><p>${m.role} · ${m.region}</p></div></div><div class="person-meta">${m.teams.map(t => `<span class="tag">${t}</span>`).join("")}</div><div class="mini-metric">● Active ${m.active.toLowerCase()}</div></article>`).join("")}</section>
    <div class="empty-state search-hidden" id="empty-search">No members match this search.</div>`;
}

function renderWork() {
  const labels = { podcast: "Podcast", projects: "Conferences & research", schemas: "Schema review" };
  const items = workItems[state.workTab];
  const stages = [...new Set(items.map(x => x.stage))];
  page.innerHTML = `
    ${heading("Production", "Content & projects", "See ownership, handoffs and bottlenecks across Academy work.", `<button class="button primary" data-open-new>＋ Add work item</button>`)}
    <div class="toolbar"><div class="segmented">${Object.entries(labels).map(([id,label]) => `<button class="${state.workTab === id ? "active" : ""}" data-work-tab="${id}">${label}</button>`).join("")}</div></div>
    <section class="pipeline">${stages.map(stage => `<div class="lane"><div class="lane-head"><span>${stage}</span><span class="lane-count">${items.filter(i => i.stage === stage).length}</span></div>${items.filter(i => i.stage === stage).map(item => `<article class="work-card" data-work-item="${item.title}" data-searchable="${item.title} ${item.owner} ${item.meta} ${stage}"><span class="tag">${item.meta.split(" · ")[0]}</span><h3>${item.title}</h3><p>${item.meta}</p><div class="progress"><span style="width:${item.progress}%"></span></div><div class="work-card-foot"><span class="muted">${item.progress}% complete</span><div class="avatar">${item.owner}</div></div></article>`).join("")}</div>`).join("")}</section>
    <div class="empty-state search-hidden" id="empty-search">No work items match this search.</div>`;
}

function renderLinks() {
  page.innerHTML = `
    ${heading("Knowledge base", "Important links", "The Academy's recurring destinations—named, grouped and searchable.", `<button class="button primary" data-open-new>＋ Add link</button>`)}
    <div class="toolbar"><div class="segmented"><button class="active">All</button><button>VMR</button><button>Operations</button><button>Research</button></div></div>
    <section class="link-grid">${links.map(l => `<a class="link-card" href="#" data-searchable="${l.title} ${l.text} ${l.category}" data-demo-action="Sample link — no live Academy destination connected"><span class="link-card-icon">${l.icon}</span><h3>${l.title}</h3><p>${l.text}</p><small>${l.category} · ${l.label}</small></a>`).join("")}</section>
    <div class="empty-state search-hidden" id="empty-search">No links match this search.</div>`;
}

function renderIntegration() {
  page.innerHTML = `
    ${heading("Safe by design", "Data connection", "A clear path from this prototype to the trusted Academy workbook.", `<span class="status planned">Not connected</span>`)}
    <div class="source-banner"><span class="meta-icon" style="background:#ffe8bb">!</span><div><strong>No real Academy data has been read or changed</strong><span>Everything visible in this prototype is sample content. Connecting Google Sheets should be a deliberate, permissioned next phase.</span></div></div>
    <section class="integration-grid">
      <article class="panel integration-card"><p class="eyebrow">Proposed mapping</p><h2>Workbook → app views</h2><p>Keep the Sheet as the initial source of truth while replacing the tab-hunting experience.</p><div class="integration-list">
        ${[["Morning Report + CPS Academy VMRs","VMR programme"],["OrgStructure","Members & leadership"],["Podcast Episodes","Podcast board"],["Conferences + Research @CPSolvers","Projects board"],["Schema review","Review pipeline"],["Important links","Link directory"]].map(([a,b]) => `<div class="integration-row"><span class="type-dot"></span><div><strong>${a}</strong><span>Maps to ${b}</span></div><span>→</span></div>`).join("")}
      </div></article>
      <article class="panel integration-card"><p class="eyebrow">Recommended first connection</p><h2>Read-only sync, then controlled writes</h2><p>Start by importing rows into a staging layer. Validate identifiers, dates and permissions before the app can update anything.</p><div class="integration-list">
        <div class="integration-row"><span class="status ready">1</span><div><strong>Read-only Sheet access</strong><span>Import selected tabs on a schedule</span></div></div>
        <div class="integration-row"><span class="status planned">2</span><div><strong>Field mapping & validation</strong><span>Stable IDs, owners, statuses and links</span></div></div>
        <div class="integration-row"><span class="status planned">3</span><div><strong>Approval-gated updates</strong><span>Write only after Academy sign-off</span></div></div>
      </div><button class="button secondary" style="margin-top:16px" data-demo-action="Integration brief noted — no connection made">Prepare integration brief</button></article>
    </section>`;
}

function render() {
  renderNav();
  ({ dashboard: renderDashboard, vmr: renderVMR, members: renderMembers, work: renderWork, links: renderLinks, integration: renderIntegration }[state.route] || renderDashboard)();
  globalSearch.value = "";
  state.search = "";
  bindPageEvents();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function routeTo(route) {
  state.route = route;
  history.replaceState(null, "", `#${route}`);
  render();
  page.focus({ preventScroll: true });
}

function bindPageEvents() {
  document.querySelectorAll("[data-route]").forEach(el => el.onclick = () => routeTo(el.dataset.route));
  document.querySelectorAll("[data-vmr-id]").forEach(el => el.onclick = () => openVMR(Number(el.dataset.vmrId)));
  document.querySelectorAll("[data-vmr-filter]").forEach(el => el.onclick = () => { state.vmrFilter = el.dataset.vmrFilter; renderVMR(); bindPageEvents(); });
  document.querySelectorAll("[data-work-tab]").forEach(el => el.onclick = () => { state.workTab = el.dataset.workTab; renderWork(); bindPageEvents(); });
  document.querySelectorAll("[data-open-new]").forEach(el => el.onclick = () => document.querySelector("#new-dialog").showModal());
  document.querySelectorAll("[data-demo-action]").forEach(el => el.onclick = e => { e.preventDefault(); showToast(el.dataset.demoAction); });
  document.querySelectorAll("[data-work-item]").forEach(el => el.onclick = () => showToast(`Opened “${el.dataset.workItem}” · prototype detail`));
  restoreChecks();
}

function openVMR(id) {
  const v = vmrs.find(x => x.id === id);
  if (!v) return;
  document.querySelector("#dialog-eyebrow").textContent = `${v.type} · ${v.date}`;
  document.querySelector("#dialog-title").textContent = v.title;
  document.querySelector("#dialog-content").innerHTML = `<div class="detail-grid"><div class="detail-box"><span>Facilitator</span><strong>${v.facilitator}</strong></div><div class="detail-box"><span>Discussant</span><strong>${v.discussant}</strong></div><div class="detail-box"><span>Time</span><strong>${v.time}</strong></div><div class="detail-box"><span>Platform</span><strong>${v.platform}</strong></div></div><p class="section-label">Readiness checklist</p><ul class="checklist">${v.tasks.map(t => `<li>${t}</li>`).join("")}</ul>`;
  document.querySelector("#dialog-primary").textContent = v.status === "published" ? "Open archive" : "Mark ready";
  document.querySelector("#detail-dialog").showModal();
}

function filterCurrentView(query) {
  const q = query.trim().toLowerCase();
  const items = [...page.querySelectorAll("[data-searchable]")];
  let visible = 0;
  items.forEach(el => {
    const show = !q || el.dataset.searchable.toLowerCase().includes(q);
    el.classList.toggle("search-hidden", !show);
    if (show) visible++;
  });
  const empty = document.querySelector("#empty-search");
  if (empty) empty.classList.toggle("search-hidden", visible !== 0);
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2400);
}

function restoreChecks() {
  const saved = JSON.parse(localStorage.getItem("cps-demo-tasks") || "[]");
  document.querySelectorAll(".task-check").forEach(input => {
    input.checked = saved.includes(input.dataset.task);
    input.onchange = () => {
      const checked = [...document.querySelectorAll(".task-check:checked")].map(x => x.dataset.task);
      localStorage.setItem("cps-demo-tasks", JSON.stringify(checked));
      showToast(input.checked ? "Task completed in this prototype" : "Task returned to queue");
    };
  });
}

document.addEventListener("click", e => {
  const route = e.target.closest("[data-route]");
  if (route && !page.contains(route)) routeTo(route.dataset.route);
});
globalSearch.addEventListener("input", e => filterCurrentView(e.target.value));
document.addEventListener("keydown", e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); globalSearch.focus(); }
});
document.querySelector("#new-item-button").onclick = () => document.querySelector("#new-dialog").showModal();
document.querySelector("#save-draft").onclick = e => {
  const title = document.querySelector("#new-title").value.trim();
  if (!title) { e.preventDefault(); document.querySelector("#new-title").focus(); return; }
  const drafts = JSON.parse(localStorage.getItem("cps-demo-drafts") || "[]");
  drafts.push({ area: document.querySelector("#new-area").value, title, owner: document.querySelector("#new-owner").value, created: new Date().toISOString() });
  localStorage.setItem("cps-demo-drafts", JSON.stringify(drafts));
  showToast("Draft saved in this browser only");
  document.querySelector("#new-item-form").reset();
};
document.querySelector("#dialog-primary").onclick = () => showToast("Prototype updated locally — no live system changed");

const initialRoute = location.hash.slice(1);
if (navItems.some(x => x.id === initialRoute)) state.route = initialRoute;
render();
