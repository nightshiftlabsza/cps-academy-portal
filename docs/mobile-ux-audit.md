# Mobile usability audit — September 10, 2026

Local-only work against the existing implementation. Existing in-progress interface changes were retained. Workbook data, storage keys, migration, backup format and hosting identity were not changed.

## Problems repaired

- A late 960px table minimum width defeated stacked mobile rows; hidden page overflow concealed inaccessible content.
- Session filters were nested twice, burying search and view controls. Section search is now outside one collapsible filter panel across all lists; filter counts include the actual active filters.
- The bottom bar hid destinations off-screen. Five visible targets now offer Home, Sessions, People, Links and More; the modal menu includes all groups and the personal logbook. A native section picker replaces wrapped mobile area tabs.
- Long forms, small staffing/calendar/menu buttons, wide preferences and overlapping feedback controls impeded touch use. Controls wrap, form labels stack, dialogs follow dynamic viewport height, footer actions remain in document flow, and feedback follows page content.
- Generic mobile table mode now uses compact key/value records with expandable remaining fields. Source references, timing caveats, recordings and resource links remain available. Desktop retains tables.
- Podcast and schema boards stack stages vertically on phones. Existing stage buttons work without dragging. Operational guidance starts collapsed on mobile.
- Mobile logbook rows use normal page scrolling without fixed-height virtualization, keeping long wrapped records and the final entry reachable. Desktop virtualization remains.
- Existing staffing mutation referenced undefined `nextTokens`, breaking add/swap/remove. The update callback is now applied. Undo buttons previously inherited disabled pointer events; Undo now receives taps.
- Dark search highlighting had malformed CSS. Preferences and navigation now use theme colors.

## Intentional choices

Morning Report still defaults to the weekly agenda on phones. The explicitly selected staffing matrix remains a horizontal comparison surface with sticky dates/headers; it is not the default phone workflow. Other mobile tables do not require sideways scrolling. Additional staffing shortcuts remain accessible in Filters.

The phone top bar scrolls with the page to free reading space; bottom navigation remains available. Search, filters, section switching and cards remain ordinary browser controls, without framework or runtime dependencies.

## Validation

- `npm test`: 135 passing unit/integration checks.
- `npm run build`: successful static build, no deployment.
- `npm run test:browser`: desktop/mobile smoke workflows.
- `npm run test:operations`: edits/reload, independent split sessions, compound filters, calendar export, claim/undo, restore, draft creation/removal, backup preview/cancel/import and fresh-browser recovery at 1440 and 390px.
- `npm run test:mobile`: 18 routes at 320/360/390/430/820/1440px, available views and edit dialogs, navigation, preferences, no-result search, long names/participant lists/URLs; additional 80-row logbook import and local admin issue triage at all four phone widths.
- `npm run test:tablet`: matrix sticky headers/dates at 768/820/1024px.
- `npm run test:offline`: cache recovery, invalid JSON and first-load retry.

Automated browser checks use installed Chromium-based Edge, isolated browser contexts, and local loopback servers. Private screenshots stay in the ignored screenshots folder. No external meeting/resource link was opened, and no data was published or uploaded.

## Limits

This is browser viewport testing, not physical iOS/Safari or Android keyboard testing. The app still saves on one device; real shared authentication, shared editing and live Sheets synchronization remain outside this audit. Explicitly choosing Matrix still involves comparison scrolling. Very large mobile logbook slices render all rows for correctness and can be slower than the desktop virtualized view.
