# CPS Academy Portal - Sync API Contract (Version 1)

This specification defines the Version 1 server contract for read-only snapshot synchronization between Google Sheets and the Academy portal.

## Overview
- **Endpoint**: `/api/sync`
- **Method**: `POST` only
- **Status**: Disabled by default (`503 SYNC_NOT_CONFIGURED`) until server credentials and Sheet targets are explicitly configured.
- **Writeback**: Out of scope for Version 1. Writeback remains a separate future contract.

## Headers
- `Content-Type`: `application/json` (Required)
- `Authorization`: `Bearer <token>` (Required in production)
- Response Header: `Cache-Control: no-store`

## Request Payload Specification

The request body is bounded to **64 KiB** (65,536 bytes). Any larger payload returns `413 Payload Too Large`.

```json
{
  "schemaVersion": 1,
  "operation": "readSnapshot",
  "requestId": "req-12345678-abcd",
  "knownSnapshotHash": "optional-sha256-hash"
}
```

### Fields
| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `schemaVersion` | Integer (`1`) | Yes | Must strictly be `1`. Other versions return `400`. |
| `operation` | String (`"readSnapshot"`) | Yes | Must strictly be `"readSnapshot"`. |
| `requestId` | String (1–128 chars) | Yes | Correlation identifier for request tracing. |
| `knownSnapshotHash` | String (1–128 chars) | No | Optional hash of current client snapshot. |

### Strict Security Validation
- Any unknown properties (such as `credentials`, `sheetUrl`, `sheetId`, `range`) cause immediate rejection with `400 Bad Request`.
- Source Google Sheet IDs, allowed tabs, and Google Service Account credentials are drawn **exclusively** from server environment variables (`SYNC_SHEET_ID`, `SYNC_AUTH_TOKEN`). The server never accepts arbitrary URLs or credentials from the browser.

## Response Specification

### Successful Read (200 OK)
When a new or modified snapshot is available:
```json
{
  "schemaVersion": 1,
  "operation": "readSnapshot",
  "requestId": "req-12345678-abcd",
  "snapshotHash": "sha256-hash-value",
  "snapshotDate": "2026-09-08T00:00:00Z",
  "modified": true,
  "workbook": {
    "Morning Report": { "columns": [...], "records": [...] }
  }
}
```

When `knownSnapshotHash` matches the current server snapshot:
```json
{
  "schemaVersion": 1,
  "operation": "readSnapshot",
  "requestId": "req-12345678-abcd",
  "snapshotHash": "sha256-hash-value",
  "snapshotDate": "2026-09-08T00:00:00Z",
  "modified": false
}
```

## Error Codes and Statuses

| HTTP Status | Error Code | Trigger Condition |
| :--- | :--- | :--- |
| `405` | `METHOD_NOT_ALLOWED` | Request method is not `POST`. Sets `Allow: POST`. |
| `415` | `UNSUPPORTED_MEDIA_TYPE` | Missing or non-`application/json` Content-Type. |
| `413` | `PAYLOAD_TOO_LARGE` | Body size exceeds 64 KiB. |
| `400` | `INVALID_SCHEMA` / `INVALID_JSON` | Malformed JSON, wrong schemaVersion, or unknown fields. |
| `401` | `UNAUTHORIZED` | Missing or invalid authorization token. |
| `503` | `SYNC_NOT_CONFIGURED` | Server missing `SYNC_SHEET_ID` or reader implementation. |

## Information Disclosure Guard
Error responses never reflect client-supplied credentials, raw request payloads, server secret keys, or partial workbook data.
