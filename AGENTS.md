# CPS Academy Portal handoff

Read README.md before editing. Preserve the existing implementation; do not rebuild it from scratch.

## Product and architecture
Private mobile-first operating hub adapted from the Academy workbook. Plain HTML/CSS/browser JavaScript; no framework or runtime dependencies. app.js renders hash routes and uses localStorage; workbook.json is the imported snapshot. scripts/serve.cjs serves only four app assets on loopback. scripts/build.cjs copies those assets into dist. No backend, account system, shared edits or live Google Sheets integration exists.

## Boundaries
- Real private Academy information and meeting links are present in workbook.json and Git history. Never publish the repository, share the site, upload data elsewhere or change visibility without explicit user authorization.
- .openai/hosting.json identifies the existing Site; preserve it. It is metadata, not a secret. Do not create a replacement Site. Building is not deploying.
- Preserve localStorage keys cps-hub-workspace-v2 and the legacy edit migration. Backup format cps-hub-backup-v2 is snapshot-bound.
- Preserve original workbook fields, source tab/row references and uncertain values. Do not infer ambiguous dates or timezone conversions. Row IDs are not durable live integration IDs.
- Never commit credentials, original uploaded workbooks, personal environment files, browser backups, build output or dependencies.

## Collaboration
After Windows migration, the user's Local checkout and its private GitHub remote are canonical. Do not keep editing a stale remote-workspace copy. Inspect git status first. Use one feature branch/worktree per concurrent agent; don't overwrite or discard another agent's work. Keep changes scoped, review the diff and run tests before committing. Do not force-push. No collaborator invitations without an explicit request naming the recipient.

## Verification
npm test; npm run build. Optional npm run test:browser after installing the documented browser tools. Validate home search, VMR edits/persistence, restore, draft creation/removal, backup import/export, filters and mobile overflow. Never claim tests that were not run.

## Next priorities
Shared persistent storage, roles and concurrency; stable record IDs; reviewed read-only Sheets integration. Improve import completeness (for example Residency Programs and retired CRC remain in the original workbook, not active app views). The included refine_import.py is a targeted repair script, not a full workbook importer. Keep the UI honest about device-local saving.
