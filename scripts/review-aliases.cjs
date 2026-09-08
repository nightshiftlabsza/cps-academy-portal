'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

// Use compiler's existing normalization function and tokenizer
const { normalize, peopleTokens } = require('./compile-logbooks.cjs');

/**
 * Deterministic Damerau-Levenshtein distance calculation.
 * Supports insertions, deletions, substitutions, and adjacent transpositions.
 */
function damerauLevenshtein(a, b) {
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;

  const matrix = Array.from({ length: al + 1 }, () => new Array(bl + 1).fill(0));
  for (let i = 0; i <= al; i++) matrix[i][0] = i;
  for (let j = 0; j <= bl; j++) matrix[0][j] = j;

  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,       // deletion
        matrix[i][j - 1] + 1,       // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + cost); // transposition
      }
    }
  }
  return matrix[al][bl];
}

/**
 * Computes deterministic similarity between a raw/normalized token string and an identity candidate.
 * Evaluates Damerau-Levenshtein distance plus surname/initial agreement.
 * Returns score in [0.0, 1.0] and match breakdown.
 */
function computeSimilarity(tokenStr, candidate) {
  // Strip parenthetical annotations for name comparison while keeping original raw text intact
  const stripped = tokenStr.replace(/\([^)]*\)/g, '').trim();
  const tNorm = normalize(stripped);
  if (!tNorm) return { score: 0, bestTarget: candidate.name, agreement: 'none' };

  const tParts = tNorm.split(/\s+/).filter(Boolean);
  const targets = [candidate.name, ...(candidate.aliases || [])];

  let bestScore = 0;
  let bestTarget = candidate.name;
  let bestAgreement = 'none';

  for (const target of targets) {
    const cNorm = normalize(target);
    const cParts = cNorm.split(/\s+/).filter(Boolean);

    const dist = damerauLevenshtein(tNorm, cNorm);
    const maxLen = Math.max(tNorm.length, cNorm.length);
    const baseSim = maxLen === 0 ? 1 : Math.max(0, 1 - dist / maxLen);

    let bonus = 0;
    let agreement = 'levenshtein-only';

    if (tNorm === cNorm) {
      bonus = 0.5;
      agreement = 'exact-match';
    } else if (tParts.length > 1 && cParts.length > 1) {
      const tFirst = tParts[0];
      const tLast = tParts[tParts.length - 1];
      const cFirst = cParts[0];
      const cLast = cParts[cParts.length - 1];

      if (tFirst === cFirst && tLast === cLast) {
        bonus = 0.35;
        agreement = 'full-name-agreement';
      } else if (tFirst === cLast && tLast === cFirst) {
        bonus = 0.30;
        agreement = 'inverted-name-agreement';
      } else if (tFirst === cFirst && tLast.length === 1 && cLast.startsWith(tLast)) {
        bonus = 0.25;
        agreement = 'first-name-and-surname-initial-agreement';
      } else if (tFirst.length === 1 && cFirst.startsWith(tFirst) && tLast === cLast) {
        bonus = 0.25;
        agreement = 'first-initial-and-surname-agreement';
      } else if (tLast === cLast) {
        bonus = 0.20;
        agreement = 'surname-agreement';
      } else if (tFirst === cFirst) {
        bonus = 0.15;
        agreement = 'first-name-agreement';
      }
    } else if (tParts.length === 1 && cParts.length > 1) {
      const tSingle = tParts[0];
      const cFirst = cParts[0];
      const cLast = cParts[cParts.length - 1];

      if (tSingle === cFirst) {
        bonus = 0.15;
        agreement = 'first-name-only-agreement';
      } else if (tSingle === cLast) {
        bonus = 0.15;
        agreement = 'surname-only-agreement';
      }
    }

    const total = Math.min(1.0, Math.max(0.0, Number((baseSim * 0.65 + bonus * 0.7).toFixed(4))));
    if (total > bestScore || (total === bestScore && target === candidate.name)) {
      bestScore = total;
      bestTarget = target;
      bestAgreement = agreement;
    }
  }

  return {
    score: bestScore,
    bestTarget,
    agreement: bestAgreement
  };
}

/**
 * Ranks all candidate identities from registry deterministically for a given token string.
 * Rejected candidate IDs are marked or ranked below active suggestions.
 */
function rankCandidates(tokenStr, identities, rejectedPersonIds = new Set()) {
  const list = [];
  for (const identity of identities) {
    const isRejected = rejectedPersonIds.has(identity.id);
    const { score, bestTarget, agreement } = computeSimilarity(tokenStr, identity);
    list.push({
      personId: identity.id,
      name: identity.name,
      aliases: identity.aliases || [],
      score,
      bestTarget,
      agreement,
      rejected: isRejected
    });
  }

  // Deterministic sorting:
  // 1. Non-rejected before rejected
  // 2. Score descending
  // 3. Name ascending
  // 4. ID ascending
  list.sort((a, b) => {
    if (a.rejected !== b.rejected) return a.rejected ? 1 : -1;
    if (b.score !== a.score) return b.score - a.score;
    const nameCmp = a.name.localeCompare(b.name);
    if (nameCmp !== 0) return nameCmp;
    return a.personId.localeCompare(b.personId);
  });

  return list;
}

/**
 * Format score display.
 * Explicitly states suggestion status, never a confidence guarantee.
 */
function formatScoreSuggestion(score) {
  return `${(score * 100).toFixed(1)}% (Suggestion only - human review required)`;
}

/**
 * Computes deterministic ledger file hash or returns recorded hash.
 */
function computeLedgerHash(ledgerData, rawLedgerString = null) {
  if (rawLedgerString) return hash(rawLedgerString);
  return ledgerData.sourceHash || hash(JSON.stringify(ledgerData));
}

/**
 * Validates decisions against registry and ledger.
 * Throws if unknown canonical ID, stale ledger reference, or conflicting alias.
 */
function validateDecisions(decisions, identities, ledgerData, currentLedgerHash) {
  const identityMap = new Map(identities.map(i => [i.id, i]));
  const existingAliases = new Map(); // alias -> personId

  for (const identity of identities) {
    existingAliases.set(normalize(identity.name), identity.id);
    for (const a of identity.aliases || []) {
      existingAliases.set(normalize(a), identity.id);
    }
  }

  // Build valid occurrence ledger reference lookup
  const validLedgerRefs = new Set();
  if (ledgerData && Array.isArray(ledgerData.unresolved)) {
    for (const u of ledgerData.unresolved) {
      if (u.sessionId && u.field && u.role && u.raw) {
        validLedgerRefs.add(`${u.sessionId}|${u.row}|${u.field}|${u.role}|${u.raw}`);
      }
    }
  }

  const activeAliasDecisions = new Map(); // token -> { personId, decisionId }

  // Process in append order; corrections supersede earlier decisions
  for (const d of decisions) {
    // 1. Unknown canonical ID check
    if (d.personId && !identityMap.has(d.personId)) {
      throw new Error(`Unknown canonical person ID: "${d.personId}"`);
    }

    // 2. Stale or invalid ledger reference check for occurrence scope
    if (d.scope === 'occurrence' && d.action === 'accept') {
      if (!d.reference) {
        throw new Error(`Occurrence decision "${d.id}" missing occurrence reference`);
      }
      const refKey = `${d.reference.sessionId}|${d.reference.row}|${d.reference.field}|${d.reference.role}|${d.reference.raw}`;
      if (!validLedgerRefs.has(refKey)) {
        throw new Error(`Stale or unknown ledger reference: "${refKey}" in decision "${d.id}"`);
      }
      if (currentLedgerHash && d.ledgerHash && d.ledgerHash !== currentLedgerHash) {
        // Ledger hash mismatch indicates stale ledger context
        throw new Error(`Stale ledger reference: decision ledgerHash ${d.ledgerHash} does not match current ${currentLedgerHash}`);
      }
    }

    // 3. Alias conflict checks
    if (d.scope === 'alias' && d.action === 'accept') {
      const normToken = normalize(d.token);
      // Conflict with existing identity in registry (another person already has this name/alias)
      const existingOwner = existingAliases.get(normToken);
      if (existingOwner && existingOwner !== d.personId) {
        throw new Error(
          `Conflicting accepted alias: "${d.token}" is already registered to identity "${existingOwner}" (${identityMap.get(existingOwner)?.name})`
        );
      }

      // Conflict with another active decision for a different person
      if (activeAliasDecisions.has(normToken)) {
        const prior = activeAliasDecisions.get(normToken);
        if (prior.personId !== d.personId && !d.supersedes?.includes(prior.decisionId)) {
          // If not explicitly superseding, it is a conflict
          throw new Error(
            `Conflicting accepted alias: "${d.token}" is accepted for identity "${d.personId}", conflicting with decision "${prior.decisionId}" for identity "${prior.personId}"`
          );
        }
      }
      activeAliasDecisions.set(normToken, { personId: d.personId, decisionId: d.id });
    }
  }

  return true;
}

/**
 * Loads the full alias review queue from disk or passed objects.
 */
function loadQueue(options = {}) {
  const ledgerPath = path.resolve(options.ledgerPath || path.join(ROOT, 'historical-contributions.json'));
  const identitiesPath = path.resolve(options.identitiesPath || path.join(ROOT, 'data/logbook-identities.json'));
  const aliasesPath = path.resolve(options.aliasesPath || path.join(ROOT, 'data/member-aliases.json'));

  const rawLedger = options.ledgerData ? null : fs.readFileSync(ledgerPath, 'utf8');
  const ledger = options.ledgerData || JSON.parse(rawLedger);
  const rawIdentities = options.identitiesData ? null : fs.readFileSync(identitiesPath, 'utf8');
  const identitiesDoc = options.identitiesData || JSON.parse(rawIdentities);
  const identities = identitiesDoc.identities || [];

  let aliasesDoc = { schemaVersion: 1, decisions: [] };
  if (options.aliasesData) {
    aliasesDoc = options.aliasesData;
  } else if (fs.existsSync(aliasesPath)) {
    aliasesDoc = JSON.parse(fs.readFileSync(aliasesPath, 'utf8'));
  }

  const currentLedgerHash = computeLedgerHash(ledger, rawLedger);

  // Validate loaded decisions
  validateDecisions(aliasesDoc.decisions || [], identities, ledger, currentLedgerHash);

  // Index decisions by token and occurrence reference
  // Later decisions supersede earlier decisions for the exact same target
  const decisionsByToken = new Map(); // token -> list of decisions
  const decisionsByRef = new Map();   // refKey -> list of decisions

  for (const d of (aliasesDoc.decisions || [])) {
    if (d.token) {
      const norm = normalize(d.token);
      if (!decisionsByToken.has(norm)) decisionsByToken.set(norm, []);
      decisionsByToken.get(norm).push(d);
    }
    if (d.reference) {
      const refKey = `${d.reference.sessionId}|${d.reference.row}|${d.reference.field}|${d.reference.role}|${d.reference.raw}`;
      if (!decisionsByRef.has(refKey)) decisionsByRef.set(refKey, []);
      decisionsByRef.get(refKey).push(d);
    }
  }

  // Filter unresolved identity tokens from ledger
  // Keep cancellation, conditional assignment and session-alignment issues outside automatic identity acceptance
  const validUnresolved = [];
  for (const item of (ledger.unresolved || [])) {
    if (!item.role || !item.raw) continue;
    // Exclude cancellations, conditional assignments, session boundaries, and unlabelled text
    if (
      item.reason === 'conditional-assignment' ||
      item.reason === 'unassigned-session-field' ||
      item.reason === 'session-boundary-needs-review' ||
      item.reason === 'unlabelled-role-text' ||
      item.reason === 'cancellation-or-strikethrough'
    ) {
      continue;
    }
    validUnresolved.push(item);
  }

  // Group by normalized name
  const tokenGroups = new Map(); // normalizedName -> group

  for (const item of validUnresolved) {
    const norm = normalize(item.raw);
    const refKey = `${item.sessionId}|${item.row}|${item.field}|${item.role}|${item.raw}`;
    const occId = 'occ-' + hash(refKey).slice(0, 12);

    if (!tokenGroups.has(norm)) {
      const tokenId = 'tok-' + hash(norm).slice(0, 12);
      tokenGroups.set(norm, {
        tokenId,
        normalizedName: norm,
        rawVariants: new Set(),
        occurrences: [],
        pendingOccurrences: [],
        resolvedOccurrences: [],
        decisions: []
      });
    }

    const group = tokenGroups.get(norm);
    group.rawVariants.add(item.raw);

    const occRecord = {
      occurrenceId: occId,
      recordId: item.recordId,
      sessionId: item.sessionId,
      source: item.source,
      row: item.row,
      field: item.field,
      role: item.role,
      raw: item.raw,
      reason: item.reason,
      candidates: item.candidates || [],
      refKey
    };

    group.occurrences.push(occRecord);

    // Check if this specific occurrence has a decision
    const occDecisions = decisionsByRef.get(refKey) || [];
    const latestOccDecision = occDecisions[occDecisions.length - 1];

    // Check if there is an alias-level acceptance for this token
    const tokenDecisions = decisionsByToken.get(norm) || [];
    const latestAliasAccept = [...tokenDecisions].reverse().find(d => d.scope === 'alias' && d.action === 'accept');

    if (latestOccDecision && latestOccDecision.action === 'accept') {
      group.resolvedOccurrences.push({ ...occRecord, decision: latestOccDecision });
    } else if (latestAliasAccept) {
      group.resolvedOccurrences.push({ ...occRecord, decision: latestAliasAccept });
    } else {
      group.pendingOccurrences.push(occRecord);
    }
  }

  // Attach status, rejected candidates, and ranked suggestions for each group
  for (const group of tokenGroups.values()) {
    const tokenDecs = decisionsByToken.get(group.normalizedName) || [];
    group.decisions = tokenDecs;

    // Collect rejected person IDs across restarts
    const rejectedPersonIds = new Set();
    for (const d of tokenDecs) {
      if (d.action === 'reject' && d.personId) {
        rejectedPersonIds.add(d.personId);
      }
    }
    group.rejectedPersonIds = rejectedPersonIds;

    // Determine overall token status
    const latestDefer = [...tokenDecs].reverse().find(d => d.action === 'defer');
    const latestAliasAccept = [...tokenDecs].reverse().find(d => d.scope === 'alias' && d.action === 'accept');

    if (latestAliasAccept || group.pendingOccurrences.length === 0) {
      group.status = 'resolved';
    } else if (latestDefer) {
      group.status = 'deferred';
    } else {
      group.status = 'pending';
    }

    // Rank candidates using representative raw/normalized name
    const sampleRaw = [...group.rawVariants][0] || group.normalizedName;
    group.rankedCandidates = rankCandidates(sampleRaw, identities, rejectedPersonIds);
  }

  return {
    ledger,
    identities,
    aliasesDoc,
    currentLedgerHash,
    tokenGroups: [...tokenGroups.values()],
    aliasesPath,
    ledgerPath,
    identitiesPath
  };
}

/**
 * Finds a token group or occurrence by token ID, normalized name, or occurrence ID.
 */
function findTarget(queue, idOrToken) {
  const normInput = normalize(idOrToken);
  // 1. Direct tokenId or normalizedName match
  for (const group of queue.tokenGroups) {
    if (group.tokenId === idOrToken || group.normalizedName === normInput) {
      return { type: 'token', group };
    }
  }

  // 2. OccurrenceId or refKey match
  for (const group of queue.tokenGroups) {
    for (const occ of group.occurrences) {
      if (occ.occurrenceId === idOrToken || occ.refKey === idOrToken) {
        return { type: 'occurrence', group, occurrence: occ };
      }
    }
  }

  return null;
}

/**
 * list --limit 25
 */
function listTokens(options = {}) {
  const queue = loadQueue(options);
  const limit = Number(options.limit) || 25;
  const filter = options.filter || 'all'; // 'all', 'pending', 'deferred'

  let filtered = queue.tokenGroups;
  if (filter === 'pending') {
    filtered = filtered.filter(g => g.status === 'pending');
  } else if (filter === 'deferred') {
    filtered = filtered.filter(g => g.status === 'deferred');
  }

  const rows = filtered.slice(0, limit);
  const output = [];

  output.push(`\n=== Unresolved Alias Review Queue (showing ${rows.length} of ${filtered.length} groups) ===\n`);
  output.push(
    ['Token ID', 'Normalized Name', 'Pending/Total', 'Status', 'Top Suggestion'].map(s => s.padEnd(20)).join(' ')
  );
  output.push('-'.repeat(105));

  for (const g of rows) {
    const top = g.rankedCandidates.find(c => !c.rejected);
    const topStr = top ? `${top.name} (${(top.score * 100).toFixed(0)}% sugg)` : '(no suggestions)';
    const counts = `${g.pendingOccurrences.length}/${g.occurrences.length}`;
    output.push(
      [
        g.tokenId.padEnd(20),
        g.normalizedName.slice(0, 19).padEnd(20),
        counts.padEnd(20),
        g.status.padEnd(20),
        topStr.slice(0, 24)
      ].join(' ')
    );
  }

  output.push('\nNote: Scores are deterministic suggestions for human review (Suggestion only), never confidence guarantees.\n');
  return { output: output.join('\n'), groups: rows, total: filtered.length };
}

/**
 * show --token-id <id>
 */
function showToken(tokenId, options = {}) {
  const queue = loadQueue(options);
  const target = findTarget(queue, tokenId);
  if (!target) {
    throw new Error(`Token ID or occurrence not found: "${tokenId}"`);
  }

  const { group } = target;
  const output = [];

  output.push(`\n=== Token Group: ${group.normalizedName} (${group.tokenId}) ===`);
  output.push(`Status: ${group.status}`);
  output.push(`Raw variants: ${[...group.rawVariants].join(', ')}`);
  output.push(`Occurrences: ${group.occurrences.length} total (${group.pendingOccurrences.length} pending, ${group.resolvedOccurrences.length} resolved)`);

  output.push('\n--- Occurrences ---');
  for (const occ of group.occurrences) {
    const status = occ.occurrenceId in group.resolvedOccurrences ? '[RESOLVED]' : '[PENDING]';
    output.push(
      `  - ${occ.occurrenceId} | ${status} | Session: ${occ.sessionId} (Row ${occ.row}) | Field: ${occ.field} | Role: ${occ.role} | Raw: "${occ.raw}"`
    );
  }

  output.push('Rank | Candidate ID               | Candidate Name                 | Status     | Score / Suggestion Label');
  output.push('-'.repeat(100));

  const candidatesToShow = group.rankedCandidates.slice(0, 10);
  candidatesToShow.forEach((c, idx) => {
    const statusTag = c.rejected ? '[REJECTED]' : '[ACTIVE]';
    output.push(
      `${String(idx + 1).padStart(4)} | ${c.personId.padEnd(26)} | ${c.name.slice(0, 30).padEnd(30)} | ${statusTag.padEnd(10)} | ${formatScoreSuggestion(c.score)}`
    );
  });

  if (group.decisions.length > 0) {
    output.push('\n--- Prior Decisions ---');
    for (const d of group.decisions) {
      output.push(`  - Decision: ${d.id} | Action: ${d.action} | Scope: ${d.scope} | Person: ${d.personId || 'none'} | Evidence: "${d.evidence}" | ${d.timestamp}`);
    }
  }

  output.push('\nReminder: A suggestion score is never a confidence guarantee. Human verification of source evidence is required.\n');
  return { output: output.join('\n'), group, target };
}

/**
 * Persist append-only decision to data/member-aliases.json
 */
function appendDecision(decision, aliasesPath, currentDoc) {
  const doc = currentDoc || (fs.existsSync(aliasesPath) ? JSON.parse(fs.readFileSync(aliasesPath, 'utf8')) : { schemaVersion: 1, decisions: [] });
  doc.decisions.push(decision);
  fs.writeFileSync(aliasesPath, JSON.stringify(doc, null, 2) + '\n');
  return decision;
}

/**
 * accept --token-id <id> --person-id <id> [--scope occurrence|alias] --evidence "<reason>"
 * Default acceptance to one occurrence. Global alias requires explicit --scope alias and previews every affected occurrence.
 */
function acceptDecision(params, options = {}) {
  const queue = loadQueue(options);
  const { tokenId, personId, evidence } = params;
  let { scope } = params;

  if (!tokenId) throw new Error('Missing required parameter: --token-id');
  if (!personId) throw new Error('Missing required parameter: --person-id');
  if (!evidence || !String(evidence).trim()) throw new Error('Missing required parameter: --evidence');

  // Default scope to 'occurrence'
  if (!scope) scope = 'occurrence';
  if (scope !== 'occurrence' && scope !== 'alias') {
    throw new Error(`Invalid scope: "${scope}". Must be "occurrence" or "alias".`);
  }

  // Verify canonical person ID exists
  const candidate = queue.identities.find(i => i.id === personId);
  if (!candidate) {
    throw new Error(`Unknown canonical person ID: "${personId}"`);
  }

  // Check if target points to conditional, cancellation, or session boundary issues
  const rawItem = (queue.ledger.unresolved || []).find(
    u => u.raw === tokenId ||
         `${u.sessionId}|${u.row}|${u.field}|${u.role}|${u.raw}` === tokenId ||
         ('occ-' + hash(`${u.sessionId}|${u.row}|${u.field}|${u.role}|${u.raw}`).slice(0, 12)) === tokenId
  );
  if (rawItem && (
    rawItem.reason === 'conditional-assignment' ||
    rawItem.reason === 'unassigned-session-field' ||
    rawItem.reason === 'session-boundary-needs-review' ||
    rawItem.reason === 'cancellation-or-strikethrough'
  )) {
    throw new Error(
      `Cannot accept token "${tokenId}": cancellation, conditional assignment, and session-alignment issues are outside automatic identity acceptance.`
    );
  }

  const target = findTarget(queue, tokenId);
  if (!target) {
    throw new Error(`Stale or unknown ledger reference: token "${tokenId}" not found in current ledger`);
  }

  const { group } = target;
  let affectedOccurrences = [];
  let occurrenceReference = null;

  if (scope === 'alias') {
    // Global alias: preview every affected occurrence
    affectedOccurrences = [...group.occurrences];
  } else {
    // Occurrence scope: affects exactly one occurrence
    let targetOcc = null;
    if (target.type === 'occurrence') {
      targetOcc = target.occurrence;
    } else if (params.occurrenceId) {
      targetOcc = group.occurrences.find(o => o.occurrenceId === params.occurrenceId || o.refKey === params.occurrenceId);
    } else {
      // Default to first pending occurrence, or first occurrence if none pending
      targetOcc = group.pendingOccurrences[0] || group.occurrences[0];
    }

    if (!targetOcc) {
      throw new Error(`No occurrence available to accept for token "${tokenId}"`);
    }

    affectedOccurrences = [targetOcc];
    occurrenceReference = {
      recordId: targetOcc.recordId,
      sessionId: targetOcc.sessionId,
      source: targetOcc.source,
      row: targetOcc.row,
      field: targetOcc.field,
      role: targetOcc.role,
      raw: targetOcc.raw
    };
  }

  const decisionId = 'decision-' + hash(`${group.normalizedName}|${scope}|${personId}|${occurrenceReference ? occurrenceReference.sessionId + occurrenceReference.row + occurrenceReference.role : 'all'}|${Date.now()}`).slice(0, 20);

  const decision = {
    id: decisionId,
    token: group.normalizedName,
    reference: occurrenceReference,
    personId,
    action: 'accept',
    scope,
    evidence: String(evidence).trim(),
    timestamp: new Date().toISOString(),
    ledgerHash: queue.currentLedgerHash
  };

  // Test decision validity before appending
  const testDecisions = [...queue.aliasesDoc.decisions, decision];
  validateDecisions(testDecisions, queue.identities, queue.ledger, queue.currentLedgerHash);

  // Append to member-aliases.json
  appendDecision(decision, queue.aliasesPath, queue.aliasesDoc);

  const preview = affectedOccurrences.map(
    o => `  - [${o.occurrenceId}] Session: ${o.sessionId} (Row ${o.row}) | Field: ${o.field} | Role: ${o.role} | Raw: "${o.raw}"`
  ).join('\n');

  const output = [
    `\nDecision persisted: ${decision.id}`,
    `Action: ACCEPT`,
    `Scope: ${scope.toUpperCase()}`,
    `Token: "${group.normalizedName}" -> Person: "${candidate.name}" (${personId})`,
    `Evidence: "${decision.evidence}"`,
    `Affected Occurrences (${affectedOccurrences.length}):`,
    preview,
    '\n'
  ].join('\n');

  return { decision, affectedOccurrences, output };
}

/**
 * reject --token-id <id> --person-id <id> --evidence "<reason>"
 * Persists rejected candidate suggestion across restarts.
 */
function rejectDecision(params, options = {}) {
  const queue = loadQueue(options);
  const { tokenId, personId, evidence } = params;

  if (!tokenId) throw new Error('Missing required parameter: --token-id');
  if (!personId) throw new Error('Missing required parameter: --person-id');
  if (!evidence || !String(evidence).trim()) throw new Error('Missing required parameter: --evidence');

  const candidate = queue.identities.find(i => i.id === personId);
  if (!candidate) {
    throw new Error(`Unknown canonical person ID: "${personId}"`);
  }

  const target = findTarget(queue, tokenId);
  if (!target) {
    throw new Error(`Stale or unknown ledger reference: token "${tokenId}" not found in current ledger`);
  }

  const { group } = target;
  const decisionId = 'decision-' + hash(`reject|${group.normalizedName}|${personId}|${Date.now()}`).slice(0, 20);

  const decision = {
    id: decisionId,
    token: group.normalizedName,
    reference: target.type === 'occurrence' ? {
      recordId: target.occurrence.recordId,
      sessionId: target.occurrence.sessionId,
      source: target.occurrence.source,
      row: target.occurrence.row,
      field: target.occurrence.field,
      role: target.occurrence.role,
      raw: target.occurrence.raw
    } : null,
    personId,
    action: 'reject',
    scope: 'alias',
    evidence: String(evidence).trim(),
    timestamp: new Date().toISOString(),
    ledgerHash: queue.currentLedgerHash
  };

  appendDecision(decision, queue.aliasesPath, queue.aliasesDoc);

  const output = [
    `\nDecision persisted: ${decision.id}`,
    `Action: REJECT`,
    `Token: "${group.normalizedName}" candidate rejected: "${candidate.name}" (${personId})`,
    `Evidence: "${decision.evidence}"`,
    `This suggestion will remain rejected across restarts.\n`
  ].join('\n');

  return { decision, output };
}

/**
 * defer --token-id <id> --reason "<reason>"
 */
function deferDecision(params, options = {}) {
  const queue = loadQueue(options);
  const { tokenId, reason } = params;

  if (!tokenId) throw new Error('Missing required parameter: --token-id');
  if (!reason || !String(reason).trim()) throw new Error('Missing required parameter: --reason');

  const target = findTarget(queue, tokenId);
  if (!target) {
    throw new Error(`Stale or unknown ledger reference: token "${tokenId}" not found in current ledger`);
  }

  const { group } = target;
  const decisionId = 'decision-' + hash(`defer|${group.normalizedName}|${Date.now()}`).slice(0, 20);

  const decision = {
    id: decisionId,
    token: group.normalizedName,
    reference: target.type === 'occurrence' ? {
      recordId: target.occurrence.recordId,
      sessionId: target.occurrence.sessionId,
      source: target.occurrence.source,
      row: target.occurrence.row,
      field: target.occurrence.field,
      role: target.occurrence.role,
      raw: target.occurrence.raw
    } : null,
    personId: null,
    action: 'defer',
    scope: 'alias',
    evidence: String(reason).trim(),
    timestamp: new Date().toISOString(),
    ledgerHash: queue.currentLedgerHash
  };

  appendDecision(decision, queue.aliasesPath, queue.aliasesDoc);

  const output = [
    `\nDecision persisted: ${decision.id}`,
    `Action: DEFER`,
    `Token: "${group.normalizedName}" review deferred`,
    `Reason: "${decision.evidence}"\n`
  ].join('\n');

  return { decision, output };
}

/**
 * Command line runner
 */
function cli(args) {
  if (args.length === 0 || args[0] === '--help' || args[0] === 'help') {
    console.log(`
Human-Reviewed Alias Queue CLI

Usage:
  node scripts/review-aliases.cjs list [--limit 25]
  node scripts/review-aliases.cjs show --token-id <id>
  node scripts/review-aliases.cjs accept --token-id <id> --person-id <id> [--scope occurrence|alias] --evidence "<reason>"
  node scripts/review-aliases.cjs reject --token-id <id> --person-id <id> --evidence "<reason>"
  node scripts/review-aliases.cjs defer --token-id <id> --reason "<reason>"

Options:
  --limit <n>          Number of tokens to display (default: 25)
  --scope <type>       Scope of acceptance: "occurrence" (default, 1 occurrence) or "alias" (all occurrences)
  --evidence <str>     Required justification or source evidence
  --reason <str>       Reason for deferral
`);
    return;
  }

  const command = args[0];
  const options = {};
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
      options[key] = val;
    }
  }

  const commonOptions = {
    ledgerPath: options.ledger,
    identitiesPath: options.identities,
    aliasesPath: options.aliases
  };

  switch (command) {
    case 'list': {
      const res = listTokens({ limit: options.limit, ...commonOptions });
      console.log(res.output);
      break;
    }
    case 'show': {
      if (!options['token-id']) throw new Error('Missing required option: --token-id');
      const res = showToken(options['token-id'], commonOptions);
      console.log(res.output);
      break;
    }
    case 'accept': {
      const res = acceptDecision({
        tokenId: options['token-id'],
        personId: options['person-id'],
        scope: options['scope'],
        evidence: options['evidence']
      }, commonOptions);
      console.log(res.output);
      break;
    }
    case 'reject': {
      const res = rejectDecision({
        tokenId: options['token-id'],
        personId: options['person-id'],
        evidence: options['evidence']
      }, commonOptions);
      console.log(res.output);
      break;
    }
    case 'defer': {
      const res = deferDecision({
        tokenId: options['token-id'],
        reason: options['reason']
      }, commonOptions);
      console.log(res.output);
      break;
    }
    default:
      throw new Error(`Unknown command: "${command}". Run with --help for usage.`);
  }
}

module.exports = {
  damerauLevenshtein,
  computeSimilarity,
  rankCandidates,
  formatScoreSuggestion,
  validateDecisions,
  loadQueue,
  listTokens,
  showToken,
  acceptDecision,
  rejectDecision,
  deferDecision,
  cli,
  hash,
  normalize,
  peopleTokens
};

if (require.main === module) {
  try {
    cli(process.argv.slice(2));
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
  }
}
