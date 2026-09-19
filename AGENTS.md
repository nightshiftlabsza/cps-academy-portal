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
- `app.js`: Client routes (`#/...`), view controllers, state management, filters, and UI mutations.
- `session-core.js`: Pure, zero-dependency engine for Morning Report splitting, deterministic IDs (`_cps_id`), timezone resolution, date math, and calendar generation (`createCalendar`).
- `search-core.js`: Search indexing, memoization, and safe highlight snippet extraction (`extractSnippets`).
- `windowed-list.js`: Virtual list controller windowing large DOM lists (>50 items) into bounded visible rows with top/bottom spacer rows.
- `identity.js`: Authentication state, member identity matching, and role detection.
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

1. **Private Institutional Data:** Real names, internal links, Zoom URLs, and member contact info exist in `workbook.json`. Never make this repo public, publish to GitHub Pages, or transmit data to external services.
2. **Resource-Level Mutation Rules (`api/mutate.js`):**
   - `Important links` & `OrgStructure`: Modifiable **only** by `admin`.
   - `Members`: Non-admins may **only** update their own record (matching session email or stable ID). Non-admins cannot edit protected administrative fields (`Sponsor`, `Email`, `_cps_id`, `Subspecialty`).
   - `Morning Report` & `CPS Academy VMRs`: Mutable by authenticated `member` and `admin`.
3. **Static Asset Allowlist Protection:**
   Only 11 public assets are ever bundled or served:
   `index.html`, `styles.css`, `session-core.js`, `search-core.js`, `identity.js`, `offline.js`, `logbook.js`, `windowed-list.js`, `app.js`, `workbook.json`, `sw.js`.
   All other paths (including `historical-contributions.json`, `data/*`, `.env*`, `.git/*`, docs, and credentials) **must 404** on the HTTP server.
4. **Historical Ledger Privacy:**
   `historical-contributions.json` and compiled ledgers are private institutional accounting records. They are **never** exposed to browser endpoints.

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

# Run 358 native Node unit and integration tests
npm test

# Build static bundle into dist/ (copies the 11 allowlisted assets)
npm run build

# Start local dev server at http://127.0.0.1:4173
npm start   # or: npm run dev

# Compile historical logbook ledger locally (offline utility)
npm run compile:logbooks

# Optional browser checks (requires Chromium / Edge CDP)
npm run test:tablet     # Verifies matrix sticky headers at 768/820/1024px
npm run test:perf       # Verifies virtual list DOM windowing benchmarks
npm run test:offline    # Verifies service worker cache rules & recovery
npm run test:mobile     # Verifies 18 routes across 320–1440px viewports
```

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

### Agents MUST Ask First:
- Running commands that change files outside the agreed plan, install new npm packages, or alter `package.json`.
- Modifying Google Sheets sync schema contracts or changing allowed writeback column mappings.
- Re-running logbook compilers with new canonical identity aliases.
- Any change that refactors or deletes existing working modules.
- Deploying or changing hosting configurations.

---

## 11. Definition of "Done" for Any Feature

A feature or change is considered **Done** only when all of the following pass:
1. **Plan & Review:** Proposed plan and diff were approved prior to application.
2. **Tests Pass:** `npm test` runs clean (0 failures out of 358+ tests).
3. **Static Build Passes:** `npm run build` succeeds and copies exactly the 11 allowlisted assets into `dist/`.
4. **No Security Leaks:** Static server rejects sensitive files (`historical-contributions.json`, `.env`, credentials) with 404.
5. **No Regressions:** Mobile viewports (320px–430px) and dark/light modes remain functional without horizontal scroll blowouts.
6. **Clean Git Status:** Working directory is left clean or in a verified staging state with working tests.
