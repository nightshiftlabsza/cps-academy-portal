'use strict';

/**
 * scripts/reconcile-workbooks.cjs
 * Deterministic reconciliation script between local workbook.json snapshot
 * and remote Google Sheets / live sync data.
 */

const fs = require('node:fs');
const path = require('node:path');
const { generateDeterministicId } = require('../api/_lib/sheets-reader.cjs');

function reconcileWorkbooks(localWorkbook, remoteWorkbook) {
  if (!localWorkbook || typeof localWorkbook !== 'object') {
    throw new Error('Valid localWorkbook object is required for reconciliation');
  }
  if (!remoteWorkbook || typeof remoteWorkbook !== 'object') {
    throw new Error('Explicit remoteWorkbook object is required for reconciliation');
  }
  if (localWorkbook === remoteWorkbook) {
    throw new Error('Independent remote snapshot is required; cannot self-reconcile identical object reference');
  }

  const report = {
    timestamp: new Date().toISOString(),
    datasets: {},
    summary: {
      totalLocal: 0,
      totalRemote: 0,
      totalDiscrepancies: 0,
      totalMissingInRemote: 0,
      totalNewInRemote: 0,
      totalDuplicateStableIds: 0
    }
  };

  const EXPECTED_DATASETS = [
    'Morning Report',
    'CPS Academy VMRs',
    'OrgStructure',
    'Members',
    'Important links',
    'Conferences',
    'Residency Programs'
  ];

  const allTabs = new Set([
    ...EXPECTED_DATASETS,
    ...Object.keys(localWorkbook || {}),
    ...Object.keys(remoteWorkbook || {})
  ]);

  for (const tab of allTabs) {
    const localRecords = localWorkbook[tab]?.records || [];
    const remoteRecords = remoteWorkbook[tab]?.records || [];

    const localByStableId = new Map();
    const remoteByStableId = new Map();
    const duplicateStableIds = [];

    const seenLocal = new Set();
    const seenRemote = new Set();

    localRecords.forEach((r, idx) => {
      const stableId = r.stableId || generateDeterministicId(tab, r.fields, seenLocal);
      if (localByStableId.has(stableId)) {
        duplicateStableIds.push({ dataset: tab, source: 'local', stableId, id: r.id });
      }
      localByStableId.set(stableId, { record: r, index: idx });
    });

    remoteRecords.forEach((r, idx) => {
      const stableId = r.stableId || generateDeterministicId(tab, r.fields, seenRemote);
      if (remoteByStableId.has(stableId)) {
        duplicateStableIds.push({ dataset: tab, source: 'remote', stableId, id: r.id });
      }
      remoteByStableId.set(stableId, { record: r, index: idx });
    });

    const missingInRemote = [];
    const newInRemote = [];
    const fieldDiscrepancies = [];

    // Check records present in local
    for (const [id, localEntry] of localByStableId.entries()) {
      if (!remoteByStableId.has(id)) {
        missingInRemote.push({
          stableId: id,
          id: localEntry.record.id,
          row: localEntry.record.row
        });
      } else {
        const remoteEntry = remoteByStableId.get(id);
        const lFields = localEntry.record.fields || {};
        const rFields = remoteEntry.record.fields || {};
        const diffs = {};

        const allFields = new Set([...Object.keys(lFields), ...Object.keys(rFields)]);
        for (const f of allFields) {
          if (f === '_cps_id') continue;
          const lVal = String(lFields[f] ?? '').trim();
          const rVal = String(rFields[f] ?? '').trim();
          if (lVal !== rVal) {
            diffs[f] = { local: lVal, remote: rVal };
          }
        }

        if (Object.keys(diffs).length > 0) {
          fieldDiscrepancies.push({
            stableId: id,
            localRow: localEntry.record.row,
            remoteRow: remoteEntry.record.row,
            differences: diffs
          });
        }
      }
    }

    // Check records present only in remote
    for (const [id, remoteEntry] of remoteByStableId.entries()) {
      if (!localByStableId.has(id)) {
        newInRemote.push({
          stableId: id,
          id: remoteEntry.record.id,
          row: remoteEntry.record.row
        });
      }
    }

    report.datasets[tab] = {
      localCount: localRecords.length,
      remoteCount: remoteRecords.length,
      missingInRemoteCount: missingInRemote.length,
      newInRemoteCount: newInRemote.length,
      discrepanciesCount: fieldDiscrepancies.length,
      duplicateStableIdsCount: duplicateStableIds.length,
      duplicateStableIds,
      discrepancies: fieldDiscrepancies,
      missingInRemote,
      newInRemote
    };

    report.summary.totalLocal += localRecords.length;
    report.summary.totalRemote += remoteRecords.length;
    report.summary.totalDiscrepancies += fieldDiscrepancies.length;
    report.summary.totalMissingInRemote += missingInRemote.length;
    report.summary.totalNewInRemote += newInRemote.length;
    report.summary.totalDuplicateStableIds += duplicateStableIds.length;
  }

  return report;
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const localPath = args[0];
  const remotePath = args[1];

  if (!localPath || !remotePath) {
    console.error('Usage: node scripts/reconcile-workbooks.cjs <local-snapshot.json> <remote-snapshot.json>');
    process.exit(1);
  }

  if (path.resolve(localPath) === path.resolve(remotePath)) {
    console.error('Error: Independent remote snapshot is required. Cannot reconcile identical file path.');
    process.exit(1);
  }

  if (!fs.existsSync(localPath)) {
    console.error(`Local file not found: ${localPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(remotePath)) {
    console.error(`Remote file not found: ${remotePath}`);
    process.exit(1);
  }

  const localWb = JSON.parse(fs.readFileSync(localPath, 'utf8'));
  const remoteWb = JSON.parse(fs.readFileSync(remotePath, 'utf8'));

  const report = reconcileWorkbooks(localWb, remoteWb);
  console.log(JSON.stringify(report, null, 2));
}

module.exports = { reconcileWorkbooks };
