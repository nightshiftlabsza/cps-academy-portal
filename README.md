# CPS Academy Portal

The existing private Academy operating hub, preserved from the ChatGPT Work build. It contains staffing schedules, VMR archives, people and leadership, CRC, podcasts, schema production, research collaborators, conferences and links.

## Run on Windows
Install Node.js 22 or newer and Git for Windows. Extract the migration ZIP into your selected Local project folder (open the inner `cps-academy-portal` folder). It already includes its Git history.

Open a terminal in that folder:

```powershell
npm install
npm test
npm start
```

Open http://127.0.0.1:4173 in your browser. Stop with Ctrl+C. No application dependencies or API keys are required. `npm install` only establishes the package lock and local package metadata. `npm run dev` is an alias for start. Do not double-click index.html: the app loads JSON over HTTP.

```powershell
npm run build
```

Copies the five site assets into `dist/`. It does not deploy anything. The development server binds only to this computer and intentionally does not expose Git files, secrets, original uploads or the historical contributions ledger.

## Optional real browser checks

```powershell
npm install --no-save --package-lock=false playwright-core
npx --yes --package playwright-core playwright-core install chromium
npm run test:browser
npm run test:mobile
```

The normal tests require only Node.js. Browser tests need Chromium. `CHROMIUM_PATH` can point to an existing compatible executable. These checks run locally and do not change the hosted site.

The mobile suite covers all 18 sections at 320, 360, 390, 430, 820 and 1440 pixels, alternate views and details, synthetic long content, and mobile admin/logbook workflows. Set `CPS_QA_SCREENSHOTS=1` to save private screenshots in the ignored `screenshots/` folder. See [mobile audit notes](docs/mobile-ux-audit.md) for design decisions and validation limits.

## Stack and structure
- `index.html`: page shell and dialogs.
- `app.js`: views, navigation, filtering, editing, backups and date handling.
- `session-core.js`: shared, zero-dependency session splitting, timezone resolution, calendar generation and compound filtering.
- `styles.css`: shared desktop/mobile design.
- `workbook.json`: real private workbook snapshot, including private links; intentionally versioned in this private repository.
- `scripts/`: local server, static build and targeted import refinement.
- `tests/`: basic validation and browser workflow checks.
- `.openai/hosting.json`: existing Sites project identity/configuration. Preserve it.
- `AGENTS.md` / `CLAUDE.md`: shared instructions for coding agents.

## What works and what remains
Dashboard, pins, search with match snippets, cards/tables, date and skill filters, staffing helper, archive links, local drafts/edits/restore, backup import/export, versioned offline loading via service worker (`sw.js`), cache recovery, and activity history work.

### Live Synchronization & Shared Architecture
- **Authentication & Access Model:** Shared organization password with verified directory email identification for the small, high-trust team. Sessions are signed with HMAC-SHA256 cookies. Directory profile updates strictly enforce email-matching session ownership.
- **Confirmed Save & Rollback:** UI save paths (quick role claim, staff token updates, session notes, and the general detail dialog) await server HTTP response. Saves show confirmed success feedback only on HTTP 200; on HTTP 409 conflict or network failure, optimistic local edits are automatically rolled back without losing earlier valid state.
- **Concurrency & Write Serialization:** Writes coordinate atomic locks before reading current sheet values, serializing concurrent single-field and batch updates across instances and rejecting conflicts.
- **Split Session Lineage:** Morning Report split sessions (sub-sessions within compound rows) validate positive child indexes and isolate writes to the targeted child segment without clobbering sibling sessions.
- **Operations Journal & Interrupted Recovery:** Operations are logged durably (`data/operations.jsonl` or PostgreSQL) with persistent lookup. Interrupted writes reconcile by verifying whether target sheet cells already reflect the intended value before retrying.
- **Deterministic Reconciliation:** `scripts/reconcile-workbooks.cjs` validates independent remote snapshots against local snapshots across all 15 datasets, reporting field discrepancies, missing rows, and rejecting duplicate stable IDs.

### Remaining Limitations (Do Not Deploy Yet)
- Live synchronization requires configuring server environment variables (`SYNC_SHEET_ID`, `GOOGLE_APPLICATION_CREDENTIALS`).
- Stronger multi-factor or per-user account authentication remains a planned future improvement beyond the current shared-credential model.
- Deployment cutover is intentionally held until final end-to-end rehearsal and administrative review are completed.

## Make this the canonical project
Open this extracted folder as your ChatGPT Work Local project, in VS Code, Claude Code or Antigravity. Keep one main GitHub repository. Use separate branches/worktrees for simultaneous agents, and merge reviewed changes. Do not run multiple agents against the same working files at once.

## Private GitHub setup (after local verification)
The archive has no Git remote or credentials. Git history is preserved. If `git status` warns about ownership, follow Git's instructions only for this specific trusted folder.

Using GitHub CLI after installing it:

```powershell
gh auth login
gh repo create cps-academy-portal --private --source . --remote origin --push
gh repo view --json nameWithOwner,isPrivate
```

Verify `isPrivate` is true. If that name already exists, stop and inspect the existing repository instead of overwriting it. Alternatively create an EMPTY private repo in GitHub (no README/license), then use its exact URL:

```powershell
git remote add origin https://github.com/YOUR-USERNAME/cps-academy-portal.git
git push -u origin main
```

Do not add colleagues until you deliberately choose who may access the private records. Do not turn on GitHub Pages. This archive does not change the existing private Sites deployment:
https://cps-academy-ops-hub.m-zakariyya-g.chatgpt.site

## Migration status
The Windows Local checkout is canonical. The existing private GitHub remote is `nightshiftlabsza/cps-academy-portal`. The earlier repository creation instructions are migration reference, not steps to repeat.

## Operational features and historical ledger

See [Operational implementation and handoff](docs/operational-completion.md) for session identity, timezone policy, calendar behavior, recovery compatibility and remaining production requirements.

The Morning Report snapshot is preserved byte-for-byte. Sessions separated inside a source row are projected into independent records, retaining their parent row and source text. Ambiguous source times remain visible but cannot be exported as a misleading calendar event. Calendar exports use a clearly labelled 60-minute duration when the source specifies no end time.

Compile the private historical assignment ledger locally:

```powershell
node scripts/compile-logbooks.cjs --as-of 2026-09-07
```

Read `node scripts/compile-logbooks.cjs --help` and [the compiler guide](docs/logbook-compilation.md) before replacing a compiled ledger. The ledger records workbook assignments, not verified attendance. Identity collisions and uncertain aliases require review. It is intentionally excluded from both the static build and local HTTP allowlist.
