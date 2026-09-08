'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');

function summarizeAudit(baseAudit, candidateAudit) {
  const keys = ['tokenCount', 'resolvedTokens', 'unresolvedTokens', 'duplicateTokens', 'placeholderTokens', 'excludedTokens', 'uniqueAssignments'];
  const summary = {};
  for (const k of keys) {
    const baseVal = baseAudit?.[k] ?? 0;
    const candVal = candidateAudit?.[k] ?? 0;
    summary[k] = { base: baseVal, candidate: candVal, delta: candVal - baseVal };
  }
  return summary;
}

function countUnresolvedReasons(unresolvedList) {
  const counts = Object.create(null);
  for (const item of unresolvedList || []) {
    const reason = item.reason || 'unspecified';
    counts[reason] = (counts[reason] || 0) + 1;
  }
  return counts;
}

function diffLedgers(baseLedger, candidateLedger) {
  if (!baseLedger || !candidateLedger) throw new Error('Both base and candidate ledgers are required for diffing');

  const summary = summarizeAudit(baseLedger.audit, candidateLedger.audit);

  const baseReasons = countUnresolvedReasons(baseLedger.unresolved);
  const candReasons = countUnresolvedReasons(candidateLedger.unresolved);
  const allReasons = [...new Set([...Object.keys(baseReasons), ...Object.keys(candReasons)])].sort();
  const unresolvedDeltas = {};
  for (const reason of allReasons) {
    const b = baseReasons[reason] || 0;
    const c = candReasons[reason] || 0;
    unresolvedDeltas[reason] = { base: b, candidate: c, delta: c - b };
  }

  const baseEntriesByPerson = new Map();
  const baseSessionAssignments = new Map();
  for (const [personId, person] of Object.entries(baseLedger.people || {})) {
    const entryMap = new Map();
    for (const entry of person.entries || []) {
      entryMap.set(entry.id, entry);
      baseSessionAssignments.set(`${entry.sessionId}|${entry.role}`, { personId, personName: person.name, entry });
    }
    baseEntriesByPerson.set(personId, entryMap);
  }

  const candEntriesByPerson = new Map();
  const candSessionAssignments = new Map();
  for (const [personId, person] of Object.entries(candidateLedger.people || {})) {
    const entryMap = new Map();
    for (const entry of person.entries || []) {
      entryMap.set(entry.id, entry);
      candSessionAssignments.set(`${entry.sessionId}|${entry.role}`, { personId, personName: person.name, entry });
    }
    candEntriesByPerson.set(personId, entryMap);
  }

  const newlyAttributed = [];
  const changedEvidence = [];

  for (const [personId, person] of Object.entries(candidateLedger.people || {})) {
    const basePersonEntries = baseEntriesByPerson.get(personId);
    for (const candEntry of person.entries || []) {
      const baseEntry = basePersonEntries?.get(candEntry.id);
      if (!baseEntry) {
        newlyAttributed.push({
          personId,
          personName: person.name,
          entryId: candEntry.id,
          sessionId: candEntry.sessionId,
          date: candEntry.date,
          role: candEntry.role,
          title: candEntry.title,
          evidence: candEntry.evidence
        });
      } else {
        const baseEvidenceTokens = (baseEntry.evidence || []).map(e => e.raw);
        const candEvidenceTokens = (candEntry.evidence || []).map(e => e.raw);
        const evidenceChanged = JSON.stringify(baseEntry.evidence) !== JSON.stringify(candEntry.evidence);
        if (evidenceChanged) {
          const added = candEvidenceTokens.filter(t => !baseEvidenceTokens.includes(t));
          const removed = baseEvidenceTokens.filter(t => !candEvidenceTokens.includes(t));
          changedEvidence.push({
            personId,
            personName: person.name,
            entryId: candEntry.id,
            sessionId: candEntry.sessionId,
            role: candEntry.role,
            baseEvidenceCount: baseEntry.evidence?.length || 0,
            candidateEvidenceCount: candEntry.evidence?.length || 0,
            addedTokens: added,
            removedTokens: removed,
            baseEvidence: baseEntry.evidence,
            candidateEvidence: candEntry.evidence
          });
        }
      }
    }
  }

  const removedOrReassigned = [];
  for (const [personId, person] of Object.entries(baseLedger.people || {})) {
    const candPersonEntries = candEntriesByPerson.get(personId);
    for (const baseEntry of person.entries || []) {
      if (!candPersonEntries?.has(baseEntry.id)) {
        const candAssignment = candSessionAssignments.get(`${baseEntry.sessionId}|${baseEntry.role}`);
        if (candAssignment && candAssignment.personId !== personId) {
          removedOrReassigned.push({
            type: 'reassigned',
            entryId: baseEntry.id,
            sessionId: baseEntry.sessionId,
            role: baseEntry.role,
            date: baseEntry.date,
            fromPersonId: personId,
            fromPersonName: person.name,
            toPersonId: candAssignment.personId,
            toPersonName: candAssignment.personName,
            evidence: baseEntry.evidence
          });
        } else {
          removedOrReassigned.push({
            type: 'removed',
            entryId: baseEntry.id,
            sessionId: baseEntry.sessionId,
            role: baseEntry.role,
            date: baseEntry.date,
            fromPersonId: personId,
            fromPersonName: person.name,
            evidence: baseEntry.evidence
          });
        }
      }
    }
  }

  const provenance = {
    base: {
      sourceHash: baseLedger.sourceHash,
      registryHash: baseLedger.registryHash,
      compilerHash: baseLedger.compilerHash,
      aliasHash: baseLedger.aliasHash || null,
      decisionCount: baseLedger.decisionIds?.length || 0
    },
    candidate: {
      sourceHash: candidateLedger.sourceHash,
      registryHash: candidateLedger.registryHash,
      compilerHash: candidateLedger.compilerHash,
      aliasHash: candidateLedger.aliasHash || null,
      decisionCount: candidateLedger.decisionIds?.length || 0
    }
  };

  return {
    summary,
    unresolvedDeltas,
    newlyAttributed,
    removedOrReassigned,
    changedEvidence,
    provenance
  };
}

function formatCliDiff(diff, basePath, candPath) {
  const lines = [
    '='.repeat(80),
    'HISTORICAL ASSIGNMENT LEDGER DIFF',
    '='.repeat(80),
    `Base:      ${basePath}`,
    `Candidate: ${candPath}`,
    '',
    'AUDIT TOTALS:'
  ];

  for (const [k, v] of Object.entries(diff.summary)) {
    const sign = v.delta > 0 ? `+${v.delta}` : `${v.delta}`;
    lines.push(`  ${k.padEnd(20)}: ${String(v.base).padStart(6)} -> ${String(v.candidate).padStart(6)} (${sign})`);
  }

  lines.push('', 'UNRESOLVED REASON DELTAS:');
  const deltaEntries = Object.entries(diff.unresolvedDeltas).filter(([, v]) => v.delta !== 0);
  if (deltaEntries.length === 0) {
    lines.push('  (no changes in unresolved reason counts)');
  } else {
    for (const [reason, v] of deltaEntries) {
      const sign = v.delta > 0 ? `+${v.delta}` : `${v.delta}`;
      lines.push(`  - ${reason.padEnd(28)}: ${String(v.base).padStart(5)} -> ${String(v.candidate).padStart(5)} (${sign})`);
    }
  }

  lines.push('', `NEWLY ATTRIBUTED ENTRIES (${diff.newlyAttributed.length}):`);
  if (diff.newlyAttributed.length === 0) {
    lines.push('  (none)');
  } else {
    for (const item of diff.newlyAttributed) {
      const tokens = (item.evidence || []).map(e => `"${e.raw}"`).join(', ');
      lines.push(`  + [${item.personId}] ${item.personName}`);
      lines.push(`    Session: ${item.sessionId} | Role: ${item.role} | Date: ${item.date || 'unknown'}`);
      lines.push(`    Evidence tokens: ${tokens}`);
    }
  }

  lines.push('', `REMOVED / REASSIGNED ENTRIES (${diff.removedOrReassigned.length}):`);
  if (diff.removedOrReassigned.length === 0) {
    lines.push('  (none)');
  } else {
    for (const item of diff.removedOrReassigned) {
      if (item.type === 'reassigned') {
        lines.push(`  ~ [${item.sessionId} | ${item.role}] Reassigned from ${item.fromPersonName} to ${item.toPersonName}`);
      } else {
        lines.push(`  - [${item.sessionId} | ${item.role}] Removed from ${item.fromPersonName}`);
      }
    }
  }

  lines.push('', `CHANGED EVIDENCE (${diff.changedEvidence.length}):`);
  if (diff.changedEvidence.length === 0) {
    lines.push('  (none)');
  } else {
    for (const item of diff.changedEvidence) {
      lines.push(`  * [${item.personId}] ${item.personName} (Session: ${item.sessionId} | Role: ${item.role})`);
      lines.push(`    Count: ${item.baseEvidenceCount} -> ${item.candidateEvidenceCount}`);
      if (item.addedTokens.length) lines.push(`    Added tokens:   ${item.addedTokens.join(', ')}`);
      if (item.removedTokens.length) lines.push(`    Removed tokens: ${item.removedTokens.join(', ')}`);
    }
  }

  lines.push('', 'PROVENANCE:');
  lines.push(`  Base compiler:       ${diff.provenance.base.compilerHash?.slice(0, 16) || 'none'}...`);
  lines.push(`  Candidate compiler:  ${diff.provenance.candidate.compilerHash?.slice(0, 16) || 'none'}...`);
  lines.push(`  Candidate aliasHash: ${diff.provenance.candidate.aliasHash?.slice(0, 16) || 'none'}${diff.provenance.candidate.aliasHash ? '...' : ''}`);
  lines.push(`  Applied decisions:   ${diff.provenance.candidate.decisionCount}`);
  lines.push('='.repeat(80));

  return lines.join('\n');
}

function main(args) {
  if (args.includes('--help')) {
    console.log('Compare base and candidate historical assignment ledgers.\nUsage: node scripts/diff-logbooks.cjs [baseLedger] [candidateLedger] [--json]\nDefaults: historical-contributions.json and historical-contributions.candidate.json');
    return;
  }
  const jsonOutput = args.includes('--json');
  const fileArgs = args.filter(a => a !== '--json');
  const basePath = path.resolve(fileArgs[0] || path.join(ROOT, 'historical-contributions.json'));
  const candPath = path.resolve(fileArgs[1] || path.join(ROOT, 'historical-contributions.candidate.json'));

  if (!fs.existsSync(basePath)) throw new Error(`Base ledger not found: ${basePath}`);
  if (!fs.existsSync(candPath)) throw new Error(`Candidate ledger not found: ${candPath}`);

  const baseLedger = JSON.parse(fs.readFileSync(basePath, 'utf8'));
  const candLedger = JSON.parse(fs.readFileSync(candPath, 'utf8'));

  const diff = diffLedgers(baseLedger, candLedger);
  if (jsonOutput) {
    console.log(JSON.stringify(diff, null, 2));
  } else {
    console.log(formatCliDiff(diff, basePath, candPath));
  }
}

module.exports = { diffLedgers, formatCliDiff };
if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
