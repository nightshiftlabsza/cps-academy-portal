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

Copies the four site assets into `dist/`. It does not deploy anything. The development server binds only to this computer and intentionally does not expose Git files, secrets or original uploads.

## Optional real browser checks

```powershell
npm install --no-save --package-lock=false playwright-core
npx --yes --package playwright-core playwright-core install chromium
npm run test:browser
```

The normal tests require only Node.js. Browser tests need Chromium. `CHROMIUM_PATH` can point to an existing compatible executable. These checks run locally and do not change the hosted site.

## Stack and structure
- `index.html`: page shell and dialogs.
- `app.js`: views, navigation, filtering, editing, backups and date handling.
- `styles.css`: shared desktop/mobile design.
- `workbook.json`: real private workbook snapshot, including private links; intentionally versioned in this private repository.
- `scripts/`: local server, static build and targeted import refinement.
- `tests/`: basic validation and browser workflow checks.
- `.openai/hosting.json`: existing Sites project identity/configuration. Preserve it.
- `AGENTS.md` / `CLAUDE.md`: shared instructions for coding agents.

## What works and what remains
Dashboard, pins, search, cards/tables, date and skill filters, staffing helper, archive links, local drafts/edits/restore, backup import/export and activity history work. Edits are device-local; there is no shared database, member authorization or live Sheets connection. Source dates remain intact; ambiguous dates are not guessed.

Moving source code does NOT transfer browser-local edits from the hosted URL to localhost. On the hosted portal, use Workspace → Download backup, then import it at the local URL. Keep backups private. The original uploaded workbook is not part of this code archive; retain it separately if needed for later import work.

Priorities: shared saving and permissions, concurrent edit protection, stable IDs, then approved read-only Sheets integration. The importer repair script expects the original workbook in ignored upload/; it is not needed to run this app.

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
Prepared and validated in the remote build workspace. Actual extraction, execution on Windows, Local project selection and private GitHub creation still require access to the user's PC/account. No Windows path has been selected or verified by this chat.
