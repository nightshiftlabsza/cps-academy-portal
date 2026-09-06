# CPS Academy Hub

Private workbook snapshot workspace. Site ID lives in .openai/hosting.json.

## Implemented
- Home dashboard with upcoming workbook sessions and pinned records
- VMR staffing cards and Academy archive with recording/resource links
- Member profiles, research skills, CRC, production, conferences and links
- Context filters, cross-area home search, alphabetical and exact-date ordering
- Card/table views and pagination
- Local record creation/editing, confirmed restore/removal, pins and activity history
- Validated JSON backup import/export

## Data boundary
The uploaded workbook is a snapshot. Records retain source worksheet and row references. No Google Sheets connection or shared database exists. Local edits persist in browser storage and are not shared across users or devices. Backups contain private records and should be handled accordingly. Row identifiers apply to this snapshot only; live integration needs stable IDs and explicit field mapping.

Access must remain owner-only unless the user explicitly approves otherwise. The deployed snapshot contains private Academy information and links.

## Validation
Chromium at 1440px and 390px: dashboard, edit persistence across reload, restore, pin, empty search, archive links, create/remove, facets, backup import/export, cross-area search, no horizontal overflow and no JavaScript page errors. Desktop and mobile screenshots inspected.

## Next shared-use milestone
Shared persistent storage, authorization per role, concurrent edit handling and audit history; only then an approved read-only Sheets integration. Original workbook is unchanged.
