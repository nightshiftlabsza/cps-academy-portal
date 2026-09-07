# Operational implementation and handoff

This milestone extends the existing Windows portal. It preserves the private workbook snapshot and browser workspace format. It does not introduce a framework, runtime dependency, backend, external integration or deployment.

## Execution sequence

1. Establish a shared, testable session model before changing the interface.
2. Integrate derived sessions, timezone display, calendar export and compound filters into existing views and editing flows.
3. Compile the historical assignment ledger with explicit identity resolution and source accounting.
4. Run regression tests, build and desktop/mobile browser workflows. Review changes in separate agent worktrees before integrating commits.

## Source data and session identity

`workbook.json` remains the original imported snapshot. The 2,368 Morning Report rows are source rows, not necessarily individual sessions. Standalone ampersand lines and horizontal divider lines in operational fields establish session boundaries. Inline cofacilitators such as `Alec & Austin` or `Steph/Zaven` do not.

`SessionCore.splitMorningReport(record)` projects a multi-session row into children with IDs such as `Morning Report:12::session:1`. Each child retains its original `source` and `row`, plus `session.parentId`, one-based `index`, `count`, `sourceFields`, unresolved alignment messages and unassigned source fields. The unsplit row and source snapshot are never overwritten by the projection. Single-session rows retain their original IDs.

Fields with the same number of blocks align by source order. A single date or session type is shared. Singleton staff or time fields cannot be reliably distributed across multiple sessions: the first display retains the text, later children remain blank, and the ambiguity is flagged. The historical compiler withholds uncertain attribution. Source notes remain available for review. Child IDs are durable only within this snapshot and splitting algorithm; they are not external account or live Sheet IDs.

Browser edits to children must not alter siblings. Legacy parent overrides stay recoverable and are applied only where their session alignment is established. Backup import validates derived child IDs against the original snapshot; the `cps-hub-backup-v2` marker, snapshot binding and workspace key `cps-hub-workspace-v2` are retained. Future snapshot migration requires an explicit source-to-target mapping, not row-number matching.

## Time interpretation

`parseSessionTime` returns either resolved UTC start/end timestamps or an explicit unresolved reason. `formatSessionTime` uses `Intl.DateTimeFormat().resolvedOptions().timeZone` to show the device zone and local calendar date alongside the original source labels. A local date is included because conversion can cross midnight.

- Explicit `PST` and `EST` mean fixed UTC−08:00 and UTC−05:00, including in summer. `PDT` and `EDT` mean UTC−07:00 and UTC−04:00.
- `PT` and `ET`, including bare clocks in the explicitly named Pacific/Eastern columns, mean `America/Los_Angeles` and `America/New_York`. Seasonal offsets come from the browser's timezone database.
- AM/PM clocks and colon-delimited 24-hour clocks are accepted. An unlabeled integer such as `12 ET` is ambiguous and remains unresolved.
- Valid ISO dates and written month/day/year dates are recognized. Numeric dates that admit two different interpretations are rejected for localization/export. Existing source date strings are never rewritten.
- Paired clocks must describe the same instant. Midnight rollover is reconciled, but contradictory clocks are not silently repaired. Repeated and nonexistent daylight-saving wall-clock times remain unresolved.
- Missing/TBD clocks, unresolved split time alignment, cancellation or rescheduling notices cannot produce a calendar export.

The workbook sometimes uses standard-time abbreviations informally. This implementation follows the written abbreviation literally. Any broader reinterpretation as regional time requires source-owner review.

## Calendar export

`createCalendar(record, { title, now })` returns an RFC 5545 VCALENDAR/VEVENT string. It uses UTC DTSTART/DTEND, CRLF, UTF-8-safe 75-octet line folding, escaped TEXT fields, a stable session UID and a generation timestamp. Calendar text includes staff, notes, source provenance and available links. A Zoom URL is included as LOCATION when one exists in that record. No external scheduler link is fabricated.

Explicit start/end ranges determine duration. Otherwise, the interface and exported description disclose a 60-minute assumed duration. Unresolved sessions show an explanation rather than downloading an invalid event. The client creates a Blob download; the user's operating system/calendar app determines how the file opens. No calendar provider receives a network request from the portal, and no invitations are sent.

References: [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545), [Intl.DateTimeFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat).

## Compound filters

Session type, individual facilitator membership and unstaffed gaps combine with AND. Existing date, record-status and search controls remain available. Facets operate on derived sessions and effective local edits, so each result describes one session. Facilitator parsing preserves parenthetical annotations and splits common cofacilitator separators outside parentheses. It is a display filter, not an identity-resolution authority.

## Historical contributions

`scripts/compile-logbooks.cjs` operates offline with Node built-ins. It audits all Morning Report and VMR source rows, applies the same splitter, extracts labelled role assignments and compiles an identity-keyed ledger. It preserves unresolved identities and source scope rather than treating assignments as verified participation. See `docs/logbook-compilation.md` for the schema, explicit aliases, accounting, reproducibility, immutable output and account-linking contract.

The ledger is not a public asset or browser logbook. Serving it would expose other members' histories before real account-level authorization exists. The server and build include only the five intended app assets.

## Acceptance checks

- Row 12 renders as two independent cards and matrix rows; edits to either survive reload without changing its sibling.
- A resolved source time displays correctly for a known device timezone and exports a valid UTC event.
- Contradictory clocks, invalid dates and daylight-saving ambiguity stay visible and do not export.
- Session type, facilitator and staffing gaps compose correctly and can be cleared.
- Search, VMR editing/restoration, draft creation/removal and backup export/import continue working on desktop and mobile.
- Compilation accounts for every source row and token, preserves identity collisions and reproduces identical bytes with identical inputs.
- The raw workbook hash and hosting metadata remain unchanged; no ledger or identity registry is exposed by the static server.

## Verified local milestone

The local milestone passes 52 native Node tests and the operations browser suite at 1440px and 390px using Microsoft Edge. The browser suite checks search, split cards and matrix rows, isolated edits after reload, compound filtering, timezone display, calendar download, VMR restore, drafts and backup import into a fresh workspace. Console errors and page overflow fail the suite. A 390px screenshot was also inspected.

The compiled ledger accounts for 2,623 source rows and 2,801 sessions: 10,630 role tokens comprise 681 resolved assignments, 9,672 unresolved tokens, 156 placeholders and 121 cancellation/strike exclusions. These are attribution results, not attendance totals. A second compilation with identical inputs returns `unchanged`. Source workbook and hosting metadata bytes were verified unchanged.

Reproduce with `npm test`, `npm run build`, `npm run test:operations` (optional browser tools described in README), and `node scripts/compile-logbooks.cjs --as-of 2026-09-07`. The original browser smoke test remains available as `npm run test:browser`.

## Production boundary and collaborator handoff

Shared auth and database tables are necessary, but are not the only production requirements. The browser's local admin switch is a testing preference, not authorization. A team launch still needs server-enforced account access, approved member/account mapping, stable record migration, optimistic concurrency, audit/restore transactions, protected staging/production deployment, backup restore verification and an explicit decision about Sheet read-only ingestion versus mirroring. Scheduler and publishing connections also need documented contracts and ownership.

Saketh's account IDs should be linked through a reviewed mapping to the ledger's canonical identity IDs. Do not rewrite the immutable historical ledger to substitute account IDs, auto-match bare first names, or expose the full ledger to a signed-in browser. A backend should return only the authorized member's slice.

Frontend readiness is therefore reported through completed checks and source-data exceptions, not an unsupported claim of 100% production readiness.
