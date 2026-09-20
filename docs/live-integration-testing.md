# Safe Live Disposable Sheet Integration Testing

This document details the safeguards, architecture, and prerequisites for executing live Google Sheets integration tests against an authorized disposable test fixture.

---

## 1. Safety Architecture & Safeguards

The live test suite (`tests/live-disposable-sheet.test.cjs`) and helper (`tests/live-disposable-sheet-helper.cjs`) implement six strict safety mechanisms:

### 1. Target Refusal & Production Protection
- **Explicit Opt-In Required**: The live suite is disabled by default. It will only run when `RUN_LIVE_SHEETS_TESTS=1` is explicitly set in the environment. Ordinary `npm test` leaves the suite skipped.
- **Separate Disposable Sheet ID**: The live suite requires a distinct `DISPOSABLE_TEST_SHEET_ID` environment variable. It **never** falls back to `SYNC_SHEET_ID`.
- **Production Collision Rejection**: If `DISPOSABLE_TEST_SHEET_ID` matches the production `SYNC_SHEET_ID`, the test throws a fatal refusal error immediately before any outbound network call or mutation.
- **Fixture Verification**: Before any write, the test fetches the target spreadsheet metadata and asserts that the title explicitly contains an authorized fixture keyword (`"disposable"`, `"test"`, `"fixture"`, or `"sandbox"`). If the title does not match, the test aborts.

### 2. Real Signed-Session Authentication
- The test authenticates via the production `api/_lib/auth-session.cjs` HMAC-SHA256 session token generator.
- Requests pass `Authorization: Bearer <signed-token>` headers.
- Supplying mock identity solely in `body.user` is rejected by `api/mutate.js` with `401 UNAUTHORIZED`.

### 3. Dynamic Fixture & Range Proof
- The test does not hard-code cell ranges (e.g. `G7`).
- Before mutating, the test queries the sheet via `sheetsReader.findRowByStableId(sheetId, dataset, stableId)` to dynamically locate the row number.
- The column letter is resolved via `mutateHandler.DATASET_CONFIG[dataset].cols[field]`.
- The target range (e.g. `'Morning Report'!G7`) is dynamically computed and proved to correspond to the target stable record.
- The mutation response's `updatedRange` is strictly asserted against this proven range.

### 4. Durable Pre-Write Crash Recovery
- **Limitation of `finally` Blocks**: A JavaScript `finally` block runs only when the Node.js process unwinds cleanly. If the process is terminated (e.g. SIGKILL, out-of-memory crash, unexpected abort, unhandled exception, power loss, or network drop), a `finally` block **will not run**, leaving the sheet in a mutated state without in-process recovery.
- **Pre-Write Persistence**: Before dispatching any write request, the helper synchronously writes the target coordinates and pre-mutation value to disk at `data/.live-test-recovery.json`.
- **Privacy Assurance**: The recovery log records only the sheet ID, target range, original value, timestamp, and operation ID. Credentials, secret tokens, private keys, and passwords are never logged or stored.

### 5. Verified Restoration & Cleanup
- Restoration dispatches a Google Sheets API `PUT` request with the original value.
- The HTTP response status must be `200 OK`; any non-200 response throws an error.
- The cell is re-read from Google Sheets to verify that the restored value strictly matches the pre-mutation value.
- Only upon verified restoration is the durable recovery file `data/.live-test-recovery.json` deleted.

---

## 2. Prerequisites for an Authorized Live Run

Before running the live suite against a physical Google Sheet, complete the following setup:

### Step 1: Create a Disposable Test Spreadsheet
1. Create a fresh Google Spreadsheet in Google Drive.
2. Title the sheet with an unambiguous fixture marker, e.g.:
   `CPS Academy [Disposable Test Fixture]`
3. Share the spreadsheet with the Service Account email (found in your `SYNC_SERVICE_ACCOUNT_KEY`) with **Editor** permissions.

### Step 2: Seed the Synthetic Fixture Record
1. Create a tab named `Morning Report`.
2. Add the standard column headers across rows 1–6 (or copy the header rows from the workbook).
3. In row 7 (or any row below header), add the synthetic fixture record:
   - Date: `12/31/2026`
   - Pacific time: `6:00 AM`
   - Eastern time: `9:00 AM`
   - Type: `Spontaneous`
   - Facilitator: `Rabih & TBD`
   - Presenter: `Original Unmutated Name` (or blank)

### Step 3: Configure Environment Variables
Set the following variables in `.env.local` or your terminal session:

```bash
# 1. Explicit live integration opt-in
RUN_LIVE_SHEETS_TESTS=1

# 2. Dedicated disposable test sheet ID (extract from spreadsheet URL)
DISPOSABLE_TEST_SHEET_ID="your-disposable-sheet-id-here"

# 3. Configured production sheet ID (must differ from disposable sheet ID)
SYNC_SHEET_ID="1QBgiknR05XihR1JkND8dBCY6NFfSum0142pGMIOquh8"

# 4. Google Service Account credentials JSON with access to the disposable sheet
SYNC_SERVICE_ACCOUNT_KEY='{"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}'

# 5. Session signing secret
SESSION_SECRET="your-test-session-secret"
```

---

## 3. Running the Live Test

To run the dedicated live integration test once authorized:

```bash
npm run test:live-disposable
```

Expected behavior when properly authorized:
1. Target refusal checks confirm `DISPOSABLE_TEST_SHEET_ID` is set and differs from `SYNC_SHEET_ID`.
2. Metadata check verifies the spreadsheet title contains `"disposable"`, `"test"`, or `"fixture"`.
3. Pre-write recovery file is created at `data/.live-test-recovery.json`.
4. Synthetic mutation lands on the disposable sheet.
5. Cell is restored to original value and verified.
6. Recovery file is cleaned up.

---

## 4. Crash Recovery Procedure

If a live test is forcefully interrupted (e.g. process termination or network failure) before restoration finishes:
1. Check if `data/.live-test-recovery.json` exists.
2. Inspect the file:
   ```json
   {
     "sheetId": "1a2b3c...",
     "dataset": "Morning Report",
     "targetRange": "'Morning Report'!G7",
     "originalValue": "Original Unmutated Name",
     "timestamp": "2026-09-20T15:30:00.000Z"
   }
   ```
3. Either restore the cell manually in Google Sheets using the recorded `targetRange` and `originalValue`, or re-run the test suite to let the automated restoration complete.
4. Delete `data/.live-test-recovery.json` once restored.
