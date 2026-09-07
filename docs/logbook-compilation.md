# Historical assignment ledger

Run `node scripts/compile-logbooks.cjs --as-of 2026-09-07` from the repository. This reads the private snapshot and local identity registry, and writes `historical-contributions.json`. It needs only Node.js and the shared session parser. It never connects to a network, publishes data, or adds the ledger to the browser build/server asset list.

The ledger is an auditable **assignment backfill**, not proof of attendance, completed contributions, or credentialing. Every resolved entry is labelled `unverified-workbook-assignment`; dated entries before the explicit cutoff are `past`, entries on/after it are `scheduled`, and dates without sufficient evidence are `unknown`. No current-clock dependency changes repeat builds. Use a new cutoff only intentionally.

## Source preservation and accounting

All 2,368 Morning Report rows and 255 Academy VMR rows receive a source audit entry, including empty and cancelled rows. Each row retains its sheet, row number, original ID and SHA-256 content digest. The ledger carries hashes of the complete workbook bytes and identity registry bytes. The original snapshot is never rewritten.

Session splitting uses the same parser as the portal. Deduplication is by canonical person, source session and role, never by calendar day: two sessions on one date remain two entries. Repeated same-session role mentions combine their evidence. Regex role boundaries recognize presenters embedded in Scribe / teaching points sign-ups. Token separators operate outside parentheses, retaining annotations. Unlabelled text and session-boundary issues enter the review queue. Cancellation/strikethrough tokens and placeholders are recorded as exclusions. Where cancellation scope is unclear, conservatively withhold the session instead of crediting it.

Audit token counts satisfy `tokenCount = resolvedTokens + unresolvedTokens + placeholderTokens + excludedTokens`. Resolved tokens include duplicate evidence; `uniqueAssignments = resolvedTokens - duplicateTokens`. Non-token issues have separate queue records and must not be mistaken for unresolved-token totals.

## Identity contract

`data/logbook-identities.json` contains 148 local canonical anchors from the 154-row Members table after removing six embedded headers. IDs are deterministic hashes of normalized canonical names at initial registry creation, not workbook row IDs or external account IDs. Once issued, preserve IDs when correcting names. A reviewer must resolve any genuine duplicate people before merging identities.

Allowed aliases come from full source names, lexical first-name/surname-initial variants, and explicitly parenthesized alternate names. Case, whitespace and periods normalize deterministically. Alias collisions return multiple candidates and never select the first. Bare first names are not inferred from team membership or cohort dates. Unknown guests and unverified nicknames remain in `unresolved`; candidate lists are suggestions for human review, not matches. Single-name source entries are exact registry names, not inferred full identities.

The older architecture report contains unverified alias suggestions and mistaken roster assumptions. This implementation deliberately does not certify them. Full historical attribution cannot truthfully be completed without reviewed identity evidence. Review an unresolved token against its exact source; then add an evidence-backed alias to the correct existing identity. Do not add guessed mappings simply to increase the resolved count.

External account IDs remain `null`. Link each local ID to a verified authenticated account through a separately reviewed mapping. Never expose this whole ledger as a public asset or trust a browser-supplied person ID for access control. A future server must enforce self-only access and apply approved account mappings before returning records. The ledger omits source email addresses and meeting credentials.

## Repeatability and updates

Re-running the same input, aliases and cutoff produces identical bytes. An identical output is left untouched. A differing output fails unless `--replace` is explicitly supplied; prefer `--output path/to/new-ledger.json` for review. Optional `--input` and `--identities` select local inputs. Writes use a temporary file and rename, leaving the old ledger intact when compilation fails.

The file is operationally immutable by default, not cryptographically signed or filesystem write-protected. Store approved versions in private version control; the hashes establish provenance but do not prove workbook truth. Review changes and test before replacing the approved version.

Verification: `node --test tests/logbooks.test.cjs`, `npm test`, and `npm run build`. Tests cover boundaries, collisions, cancellations, duplicate evidence, same-day sessions, uncertain dates, temporal state, determinism, safe replacement and all source-row accounting.
