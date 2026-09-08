# Historical assignment ledger

Run `node scripts/compile-logbooks.cjs --as-of 2026-09-07 [--aliases data/member-aliases.json]` from the repository. This reads the private snapshot, local identity registry, and optional reviewed aliases, and writes `historical-contributions.candidate.json` by default. It needs only Node.js and the shared session parser. It never connects to a network, publishes data, or adds the ledger to the browser build/server asset list.

The ledger is an auditable **assignment backfill**, not proof of attendance, completed contributions, or credentialing. Every resolved entry is labelled `unverified-workbook-assignment`; dated entries before the explicit cutoff are `past`, entries on/after it are `scheduled`, and dates without sufficient evidence are `unknown`. No current-clock dependency changes repeat builds. Use a new cutoff only intentionally.

## Source preservation and accounting

All 2,368 Morning Report rows and 255 Academy VMR rows receive a source audit entry, including empty and cancelled rows. Each row retains its sheet, row number, original ID and SHA-256 content digest. The ledger carries hashes of the complete workbook bytes, identity registry bytes, compiler code, session parser, and alias configuration. The original snapshot is never rewritten.

Session splitting uses the same parser as the portal. Deduplication is by canonical person, source session and role, never by calendar day: two sessions on one date remain two entries. Repeated same-session role mentions combine their evidence. Regex role boundaries recognize presenters embedded in Scribe / teaching points sign-ups. Token separators operate outside parentheses, retaining annotations. Unlabelled text and session-boundary issues enter the review queue. Cancellation/strikethrough tokens and placeholders are recorded as exclusions. Where cancellation scope is unclear, conservatively withhold the session instead of crediting it.

Audit token counts satisfy `tokenCount = resolvedTokens + unresolvedTokens + placeholderTokens + excludedTokens`. Resolved tokens include duplicate evidence; `uniqueAssignments = resolvedTokens - duplicateTokens`. Non-token issues have separate queue records and must not be mistaken for unresolved-token totals.

## Identity contract and reviewed aliases

`data/logbook-identities.json` contains 148 local canonical anchors from the 154-row Members table after removing six embedded headers. IDs are deterministic hashes of normalized canonical names at initial registry creation, not workbook row IDs or external account IDs. Once issued, preserve IDs when correcting names. Never regenerate canonical person IDs when alias strings or display names change. A reviewer must resolve any genuine duplicate people before merging identities.

Identity resolution follows a strict 4-stage hierarchy:
1. **Accepted occurrence-specific decision**: An accepted decision matching the session ID (or record ID), role constraint, and token string.
2. **Accepted global alias**: An accepted global alias matching the normalized token string across sessions.
3. **Existing exact registry resolution**: Full source names, lexical first-name/surname-initial variants, and explicitly parenthesized alternate names.
4. **Unresolved**: Remaining tokens enter the unresolved audit queue with disambiguation reasons (`unverified-short-name`, `unknown-alias`, `ambiguous-alias`, etc.).

Guards take strict precedence over identity decisions: identity decisions must **never** override cancellation, uncertain session boundaries (unassigned multi-session fields), or conditional participation (e.g. backup notes, questions).

Compilation provenance records `aliasHash` (SHA-256 digest of the aliases file) and `decisionIds` (sorted array of all accepted decision IDs applied during compilation).

The older architecture report contains unverified alias suggestions and mistaken roster assumptions. This implementation deliberately does not certify them. Full historical attribution cannot truthfully be completed without reviewed identity evidence. Review an unresolved token against its exact source; then add an evidence-backed alias to the correct existing identity in `data/member-aliases.json`. Do not add guessed mappings simply to increase the resolved count.

External account IDs remain `null`. Link each local ID to a verified authenticated account through a separately reviewed mapping. Never expose this whole ledger as a public asset or trust a browser-supplied person ID for access control. A future server must enforce self-only access and apply approved account mappings before returning records. The ledger omits source email addresses and meeting credentials.

## Repeatability, diffing, and safe updates

Re-running the same input, aliases and cutoff produces identical bytes. Candidate compilations output to `historical-contributions.candidate.json` by default.

Before replacing the approved ledger, inspect the diff between approved and candidate ledgers:
```powershell
node scripts/diff-logbooks.cjs
```
The diff tool displays:
1. Newly attributed entries (person, session, role, date, evidence).
2. Removed or reassigned entries (cross-person reassignments and revocations).
3. Unresolved-count changes broken down by reason.
4. Changed evidence for existing entries.
5. Audit totals and provenance hashes.

Never overwrite the approved ledger merely because a fuzzy score improved. Updating the approved ledger requires explicit replacement after human review:
```powershell
node scripts/compile-logbooks.cjs --as-of 2026-09-07 --aliases data/member-aliases.json --replace
```
Writes use a temporary file and rename, leaving the old ledger intact when compilation fails.

The file is operationally immutable by default, not cryptographically signed or filesystem write-protected. Store approved versions in private version control; the hashes establish provenance but do not prove workbook truth. Review changes and test before replacing the approved version.

Verification: `node --test tests/logbooks.test.cjs`, `npm test`, and `npm run build`. Tests cover boundaries, collisions, cancellations, duplicate evidence, same-day sessions, uncertain dates, temporal state, determinism, occurrence isolation, global alias counts, token accounting balance, safe replacement and all source-row accounting.
