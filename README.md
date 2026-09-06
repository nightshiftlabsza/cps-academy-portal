# CPS Academy Hub
Private workbook snapshot prototype. Site ID is in .openai/hosting.json.

The app loads workbook.json, retaining source worksheet and row references. It supports 13 views, search, pagination, source links, review flags, browser-local edits and JSON change export. No Google Sheets connection or shared database exists. Row-based identifiers apply only to this snapshot and must not be used blindly for later live writes.

Access must remain owner-only: the snapshot contains private Academy records and links. Do not change sharing without explicit approval.

Validation: Chromium at 1440px and 390px; navigation, empty search, persisted edits across reload, archive links, no horizontal overflow and no JavaScript page errors. Visually inspected desktop and mobile screenshots.

Next: confirm workflow usability with user; implement shared persistence and roles; design stable record IDs and read-only Sheets mapping before enabling any live writes.
