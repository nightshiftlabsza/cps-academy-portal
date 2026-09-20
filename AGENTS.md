# CPS Academy Portal — Developer & Agent Handoff

Canonical handoff for human engineers and coding agents. Read before inspecting or modifying code. Preserve the existing architecture; do not rewrite or rebuild from scratch.

---

## 1. What the App Is

The **CPS Academy Portal** is a private, responsive operating hub for Clinical Problem Solvers (CPS) Academy operations, staffing, and clinical education archives. It manages:
- Morning Report scheduling and sub-session lineups (daily cases, clinical reasoning roles).
- CPS Academy VMRs, recordings, and bonus learning resources.
- Member directory, working group org structures, podcast and schema workflows, and resource links.
- Personal Activity Logbooks (clinical procedure logbook standard for academic promotion/CVs, without cheerleading, nudges, or gamification).

---

## 2. Architecture & Key Files

The portal uses a zero-runtime-dependency architecture: plain modern ES/browser JavaScript on the frontend, with Node.js built-ins powering the local server, APIs, and CLI utilities.

### Frontend Shell & Modules
- `index.html`: Main SPA application shell, modals, and templates.
- `app.js`: Main SPA orchestrator, client routes (`#/...`), top/bottom navigation, global workspace state (`workspace`), mutation orchestration (`mutate`), toast alerts, detail dialogs, search orchestration, and integration with `MembersModule` and `MorningReportModule`.
- `members.js`: Extracted Members directory module (`MembersModule`). Handles directory views (`membersView`, desktop table, mobile cards), sorting/filtering, cohort grouping (Participants, Core team, Leaders, Inactive), birthday calculations and widget (`renderBirthdaysTodayWidget`), and the self-service profile edit dialog. Shares and depends on global state and coordinator functions in `app.js` (including `workspace`, `render`, `navigate`, and date helpers), alongside `Identity` (`identity.js`) and the DOM.
- `members.css`: Dedicated styles for member tables, cards, cohort groups, birthday banners, and profile edit dialog.
- `morning-report.js`: Extracted Morning Report schedule module (`MorningReportModule`). Handles Agenda view (`agendaView`), Month view, staffing Matrix view (`matrixView`), compact and editorial session cards, vacancy indicator rails, staffing grid tools/actions, compound schedule filtering, and interactive time picker modal. Tightly integrates with and depends on shared runtime state and functions in `app.js` (including `workspace`, `records`, `mutate`, `render`, `toast`, active filters, and navigation), alongside `SessionCore` (`session-core.js`) and `WindowedList` (`windowed-list.js`).
- `morning-report.css`: Dedicated styles for Morning Report schedule views, matrix columns, vacancy indicator rails, and the interactive time picker modal.
- `session-core.js`: Pure, zero-dependency engine for Morning Report splitting, deterministic IDs (`_cps_id`), timezone resolution, date math, and calendar generation (`createCalendar`).
- `search-core.js`: Pure search indexing, memoization, and safe highlight snippet extraction (`extractSnippets`).
- `windowed-list.js`: Virtual list controller windowing large DOM lists (>50 items) into bounded visible rows with top/bottom spacer rows.
- `identity.js`: Authentication state, member identity matching, and role detection.
- `logbook.js`: Personal activity logbook views, category filtering, and procedural entry management.
- `offline.js` & `sw.js`: Service worker caching (`cps-portal-shell-v0.4.0`), offline fallback, and dirty-form protection.
- `styles.css`: CSS design system supporting dual-axis theming and responsive layouts.
- `workbook.json`: Canonical versioned snapshot of the Academy workbook data.

### Backend & API (`/api/`)
- `scripts/serve.cjs`: Local development HTTP server serving the static asset allowlist and routing `/api/*` endpoints.
- `api/login.js`: POST endpoint verifying credentials and issuing signed session cookies.
- `api/mutate.js`: Atomic writeback endpoint to live Google Sheets with optimistic concurrency checking and rollback.
- `api/sync.js`: Google Sheets sync contract (`/api/sync`) returning live snapshots or 503 `SYNC_NOT_CONFIGURED`.
- `api/sync-webhook.js`: Invalidation webhook clearing server caches on external sheet changes.
- `api/_lib/sheets-reader.cjs`: Google Sheets API client with JWT service-account auth and snapshot caching.
- `api/_lib/db.cjs`: Operations journal (`data/operations.jsonl` or PostgreSQL) and distributed lock manager (`data/locks/`).
- `api/_lib/auth-session.cjs`: HMAC-SHA256 session token generation and cookie validation (`cps_session`).
- `api/_lib/sync-contract.cjs`: Read-only sync contract schema validation.

---

## 3. Authentication & Session Model

- **Credentials:** Shared organization password configured via `UNIVERSAL_PASSWORD` environment variable, verified against member emails in the `Members` directory.
- **Session Tokens:** HMAC-SHA256 signed JSON web tokens stored in an `HttpOnly`, `SameSite=Lax` cookie named `cps_session` (or `Authorization: Bearer <token>`).
- **Roles:**
  - `admin`: Full administrative access (defined via `ADMIN_EMAILS` env var). Can mutate institutional resources (`OrgStructure`, `Important links`) and any directory profile.
  - `member`: Verified directory member. Can claim/unclaim open staffing roles, edit assigned Morning Report sessions, and update their own directory profile (`Members`).
  - `viewer`: Read-only session. Sensitive attributes (e.g. member birthdays) are redacted on API sync responses.
- **Local Fallback:** In offline/mock mode without server credentials, browser `localStorage` acts as a local workspace sandbox (`cps-hub-workspace-v2`), but UI clearly discloses local-only state.

---

## 4. Permissions & Privacy Boundaries

1. **Private Institutional Data:** Real names, internal links, Zoom URLs, and member contact info exist in `workbook.json`. Never make this repo public, publish to GitHub Pages, or transmit data to external services. (Note: While static serving and building redact birthdays from the snapshot, `workbook.json` is currently served as an allowlisted static asset; a separate privacy audit addresses unauthenticated snapshot access and tightening data boundaries.)
2. **Resource-Level Mutation Rules (`api/mutate.js`):**
   - `Important links` & `OrgStructure`: Modifiable **only** by `admin`.
   - `Members`: Non-admins may **only** update their own record (matching session email or stable ID). Non-admins cannot edit protected administrative fields (`Sponsor`, `Email`, `_cps_id`, `Subspecialty`).
   - `Morning Report` & `CPS Academy VMRs`: Mutable by authenticated `member` and `admin`.
3. **Static Asset Allowlist Protection:**
   Only 15 public static assets are bundled into `dist/` or served by the static file handler:
   `index.html`, `styles.css`, `members.css`, `morning-report.css`, `session-core.js`, `search-core.js`, `identity.js`, `offline.js`, `logbook.js`, `windowed-list.js`, `members.js`, `morning-report.js`, `app.js`, `workbook.json`, `sw.js`.
   All non-allowlisted static file paths (including `historical-contributions.json`, `data/*`, `.env*`, `.git/*`, docs, and credentials) **must 404** on the HTTP server. (Legitimate `/api/*` endpoints are handled separately by API route dispatchers.)
4. **Historical Ledger Privacy:**
   `historical-contributions.json` and compiled ledgers are private institutional accounting records. They are **never** exposed to browser endpoints and are blocked by the static allowlist.

---

## 5. Google Sheets Read, Write & Sync Architecture

- **Read / Ingestion:**
  `sheetsReader()` in `api/_lib/sheets-reader.cjs` parses the 4 active operational tabs (`Morning Report`, `CPS Academy VMRs`, `OrgStructure`, `Important links`) + `Members` directory via Google Sheets API v4 using Service Account JWT authentication. Results are cached in memory (60s TTL).
- **Deterministic Stable IDs:**
  Records use deterministic identifiers generated by `SessionCore.generateDeterministicId` (e.g. `mr-2026-09-21-general-medicine-10-00-am-pt` or preserved `_cps_id`). Never use volatile spreadsheet row numbers as durable keys.
- **Atomic Locking & Serialization:**
  Writes acquire atomic file/memory locks (`cell_<dataset>_<stableId>_<field>`) in `data/locks/` before reading and updating cells.
- **Optimistic Concurrency & Interrupted Writes:**
  Mutations require `expectedPreviousValue`. If the live sheet cell does not match `expectedPreviousValue`, the write is rejected with `409 CONCURRENT_MUTATION`.
  If the live sheet cell already matches the requested `value`, the server reconciles it as a successful prior interrupted write (`200 { reconciled: true }`).
- **Durable Operations Journal:**
  Every mutation is recorded in `data/operations.jsonl` with lifecycle events (`pending` -> `committed` / `failed` / `interrupted`).

---

## 6. How Data Mutations Work in the UI

1. **Optimistic Updates with Confirmed Save:**
   UI operations (quick role claim, staff token updates, session notes, general detail dialog) display pending feedback and await the server response.
2. **Rollback on Error:**
   On HTTP 200, the edit is confirmed and cached. On HTTP 409, 401, 403, or network failure, the optimistic edit is automatically rolled back to its previous state with user-facing error feedback.
3. **Child Session Lineage:**
   Rows containing multiple sessions (separated by standalone `&` or horizontal divider lines `---`) are split into independent child records (`Morning Report:12::session:1`). Mutations must pass `childSessionIndex` so only the targeted child slot is modified without clobbering sibling sessions.

---

## 7. How to Run, Build & Test

```powershell
# Install package lock and dependencies
npm install

# Run native Node unit and integration tests
npm test

# Fast development gate (build sanity, unit tests, Home 6-theme matrix, operations & console.error check)
npm run qa:feature

# Comprehensive QA gate (for significant, shared, security, data, release or PR work)
npm run qa:full

# Build static bundle into dist/ (copies the 15 allowlisted assets)
npm run build

# Start local dev server at http://127.0.0.1:4173
npm start   # or: npm run dev

# Compile historical logbook ledger locally (offline utility)
npm run compile:logbooks

# Granular browser check suites (requires Chromium / Edge CDP)
npm run test:tablet     # Verifies matrix sticky headers at 768/820/1024px
npm run test:perf       # Verifies virtual list DOM windowing benchmarks
npm run test:offline    # Verifies service worker cache rules & recovery
npm run test:mobile     # Verifies 18 routes across 320–1440px viewports
```

> **QA Workflow Guidelines for Agents:**
> - **One Consistent QA Policy:**
>   1. **Targeted checks during iteration:** Run tests directly relevant to the feature being changed for fast feedback.
>      Examples:
>      - Members change → relevant Members tests (`tests/members-directory.test.cjs`)
>      - Morning Report change → relevant Morning Report tests (`tests/session-core.test.cjs`, `tests/staffing-tokens.test.cjs`, `tests/ui-operations.test.cjs`)
>      - auth/permissions change → relevant auth/permission tests (`tests/auth.test.cjs`, `tests/auth-permissions.test.cjs`, `tests/sync-auth-filtering.test.cjs`)
>      - sync/mutation change → relevant sync/mutation tests (`tests/mutate.test.cjs`, `tests/sync-contract.test.cjs`, `tests/tier-expansion.test.cjs`)
>   2. **Feature QA before completion:** Run `npm run qa:feature` before completing routine or scoped feature work.
>   3. **Comprehensive QA gate:** Run `npm run qa:full` when changes involve significant multi-module refactoring, shared infrastructure, auth/security, data/sync contracts, releases, or PRs. Do not repeat the full suite after every minor edit.
>   4. **Documentation-only tasks:** Do not run browser test suites or visual captures for documentation-only tasks.
> - **Test Failure Guidance & Test Integrity:**
>   When tests fail, agents must diagnose the failure, repair any regressions caused by their own changes, rerun relevant checks, and report unrelated failures or genuine blockers. Never weaken, bypass, or delete tests just to obtain a pass.
> - **Visual Self-QA for UI Changes (MANDATORY):**
>   For any meaningful UI change, machine tests (`npm run qa:feature`) are the baseline, but visual verification is an additional requirement before handing work back to the user:
>   1. **Capture standard viewports:** Run `npm run visual:capture -- <Route>` (e.g. `npm run visual:capture -- Home` or `npm run visual:capture -- "Morning Report"`).
>      Standard checkpoints: 390px (mobile, 390×844), 820px (tablet, 820×900), 1280px (desktop, 1280×800). Screenshots are saved to `screenshots/visual-qa/<Route>-<width>.png`.
>      *Theme scope:* Standard captures do NOT need to test every theme/mode on ordinary UI changes (the default Emerald Light is sufficient). Additional dark-mode and theme captures (`--mode dark`, `--theme <theme>`) are required only when the change affects colours, tokens, themes, or shared/global styling.
>   2. **Inspect screenshots directly:** The agent must inspect the generated PNG images using available image viewing tools/capabilities to semantically inspect them multimodal—never merely generate them.
>   3. **Semantic visual checklist:**
>      - Horizontal overflow / unwanted sideways scrolling
>      - Clipped, truncated, or hidden content/dialogs
>      - Overlapping elements or awkward text wrapping
>      - Excessively tall cards/rows or unbalanced dead whitespace
>      - Poor visual hierarchy or low-contrast text
>      - Controls cramped, awkward, or unusable on mobile touch screens
>      - Inconsistent spacing, margins, and alignment
>      - Obvious theme/dark mode styling issues
>      - Obvious divergence from an approved screenshot or Stitch design reference (inspect reference via the available image-viewing tool or Stitch MCP `get_screen`)
>   4. **Autonomous Self-Healing:** If an obvious/high-confidence visual problem is observed, fix it automatically without asking the user about ordinary CSS/layout decisions. Re-run `npm run qa:feature`, recapture screenshots, and re-inspect until clean.
>   5. Only ask the user if there is a genuine product/design ambiguity with more than one materially different reasonable solution.

---

## 8. Responsive & UI Conventions

- **Dual-Axis Theme System:**
  Defined in `DESIGN.md`. Driven by DOM attributes:
  `data-theme="emerald" | "cobalt" | "plum"` and `data-mode="light" | "dark"`.
  All 6 combinations must work. Use CSS custom properties (`var(--surface)`, `var(--primary-text)`, etc.); do not hardcode ad-hoc hex colors in components.
- **Mobile-First Layouts:**
  - Phone (<768px): Stacked cards, vertical stage lists for boards, bottom navigation bar (Home, Sessions, People, Links, More), and native dropdown selectors.
  - Tablet (768px–1024px): Staffing matrix retains sticky top headers and sticky left dates.
  - Desktop (>1024px): Full data tables and side-by-side management tools.
- **DOM Virtualization:**
  Lists with >50 items must use `WindowedList` to constrain active DOM elements, with transparent spacer rows (`.matrix-spacer-row`) and Ctrl+F "Show all for Find" bypass.

---

## 9. Non-Negotiable Boundaries (Must Not Regress)

1. **Zero External Runtime Dependencies:** No React, Vue, Vite, Tailwind, or frontend build toolchains. Zero runtime npm packages in production; vanilla HTML5/CSS3/ES6+.
2. **Preserve Raw Snapshots:** `workbook.json` and `.openai/hosting.json` must remain byte-safe unless an explicit snapshot upgrade is conducted.
3. **Allowlist Security:** Never add unauthorized files to the public serve/build allowlist.
4. **Timezone Fidelity:** Never alter raw workbook date/time strings. Display local device time alongside original source strings using `SessionCore.formatSessionTime`. Ambiguous clocks remain unresolved.
5. **Logbook Tone:** Keep the personal logbook strictly aligned with clinical procedural log standards. No gamification, no cheerleading, no nudge copy.

---

## 10. Autonomous Decisions vs. Requiring User Approval

### Agents May Decide Autonomously:
- Fixing bugs or edge cases in existing utility modules (`session-core.js`, `search-core.js`, `windowed-list.js`).
- Adding automated unit or integration tests under `tests/*.test.cjs`.
- Adjusting CSS for responsive layout fixes, contrast, or theme token alignment consistent with `DESIGN.md`.
- Improving error handling, input validation, and logging in `api/` endpoints without breaking API contracts.
- Routine Git branch lifecycle for normal low-risk work (creating short-lived task branches, committing, merging into `main`, and deleting completed task branches).

### Agents MUST Ask First:
- Running commands that change files outside the agreed plan, install new npm packages, or alter `package.json`.
- Modifying Google Sheets sync schema contracts or changing allowed writeback column mappings.
- Re-running logbook compilers with new canonical identity aliases.
- Any change that refactors or deletes existing working modules.
- Deploying or changing hosting configurations.
- Irreversible Git or history operations (force pushes, hard resets, rebasing history).
- Destructive data changes or privacy/access-policy changes.
- Merging a genuinely high-risk change into `main` without user review.

---

## 11. Definition of "Done" for Any Feature

A feature or change is considered **Done** only when all of the following pass:
1. **Scope respected:** The implementation matches the agreed task/acceptance criteria and contains no unrelated changes. A plan is required only for risky/shared/ambiguous work as defined elsewhere in AGENTS.md.
2. **Targeted & Feature QA Passes:** Targeted tests relevant to the changed modules pass, and `npm run qa:feature` passes cleanly before completing routine or scoped feature work.
3. **Comprehensive QA Gate (when applicable):** `npm run qa:full` passes cleanly with 0 failures before completing significant, shared, security, data, release, or PR work. (Not required for routine scoped fixes or documentation-only updates.)
4. **Static Build Passes:** `npm run build` succeeds and copies exactly the 15 allowlisted assets into `dist/`.
5. **Static File Protection:** Non-allowlisted static file paths (`historical-contributions.json`, `.env`, credentials) return 404.
6. **No Regressions:** Mobile viewports (320px–430px) and dark/light modes remain functional without horizontal scroll blowouts.
7. **Visual Self-QA Passed (for UI changes):** Standard viewports (390px, 820px, 1280px) captured via `npm run visual:capture`, inspected by the agent using an available image viewing tool, and confirmed free of clipping, overflow, awkward wrapping, unusable touch targets, or poor hierarchy.
8. **Clean Git Status:** Completed work merged cleanly into `main`, short-lived task branches deleted, and working tree left clean with relevant tests passing.

---

## 12. Lightweight Git Safety Workflow (No Process Overhead)

To protect `main` without creating administrative clutter, agents must follow this lightweight safety workflow for meaningful code changes:

### The Normal Rule for Meaningful Code Changes
1. **Create a task branch:** Before editing code, branch off the current `main` into a short-lived task branch (e.g. `git checkout -b task/<short-description>`). The sole purpose is keeping `main` as the known-good version while work is in flight.
2. **Implement & test:** Make the code changes on that branch.
3. **Run targeted tests:** Execute existing or new tests relevant to the changed modules.
4. **Run feature gate:** Execute `npm run qa:feature`.
5. **Visual self-QA (for UI changes):** Run `npm run visual:capture -- <Route>` and inspect screenshots using the available image viewing tool. Fix any detected visual defects.
6. **Comprehensive gate:** Run `npm run qa:full` when the change is substantial enough to justify it (e.g. significant, shared, security, data, release or PR work). Documentation-only tasks do not require browser test runs or visual captures.
7. **Merge to `main`:** Once everything passes and the change is low-risk, merge back into `main`.
8. **Delete task branch:** Immediately delete the local task branch. Do not leave stale branches behind.

### No Mandatory GitHub Issues
Do **NOT** create GitHub Issues automatically. Only use or create an Issue if:
- Explicitly requested by the user,
- The task needs to sit in a backlog for later,
- The work spans multiple sessions,
- Or there is a distinct bug/feature being tracked.
For a normal interactive chat session where work is executed immediately, no Issue is required.

### Pull Requests Are Optional
Do **NOT** create PRs for ordinary isolated work. Use a PR only when the change is high-risk or especially broad:
- Authentication or permissions changes,
- Google Sheets write/sync logic,
- Major refactoring,
- Broad changes across multiple shared modules,
- Major UI/UX redesigns,
- Dependency or framework additions/upgrades,
- Or when reviewing the full diff before merge is clearly desirable.

### Repository Hygiene at Completion
At the end of a normal successful task, the repository must simply have:
- A clean, passing `main`,
- No stale branches,
- No unnecessary PRs,
- No unnecessary GitHub Issues.
