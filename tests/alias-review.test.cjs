'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  damerauLevenshtein,
  computeSimilarity,
  rankCandidates,
  validateDecisions,
  loadQueue,
  listTokens,
  showToken,
  acceptDecision,
  rejectDecision,
  deferDecision,
  peopleTokens,
  normalize,
  hash
} = require('../scripts/review-aliases.cjs');

// Helper to create isolated temporary directory with test fixtures
function createTestEnv() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cps-alias-test-'));
  const ledgerPath = path.join(dir, 'historical-contributions.json');
  const identitiesPath = path.join(dir, 'logbook-identities.json');
  const aliasesPath = path.join(dir, 'member-aliases.json');

  const identities = [
    {
      id: 'person-5555e7036f4c91a84c1e746d',
      name: 'Julia Zanco',
      aliases: ['Julia Z'],
      source: { recordId: 'Members:98', row: 98, rawName: 'Julia Zanco' }
    },
    {
      id: 'person-7024f448f8a847506d8fa1de',
      name: 'Julia Schlender',
      aliases: ['Julia S'],
      source: { recordId: 'Members:193', row: 193, rawName: 'Julia Schlender' }
    },
    {
      id: 'person-b99bf0492f97e5c6eb4b92aa',
      name: 'Dan Restrepo',
      aliases: ['Dan R'],
      source: { recordId: 'Members:10', row: 10, rawName: 'Dan Restrepo' }
    }
  ];

  const ledger = {
    schemaVersion: 1,
    asOf: '2026-09-07',
    sourceHash: 'test-source-hash-12345',
    unresolved: [
      {
        recordId: 'Morning Report:177',
        sessionId: 'Morning Report:177',
        source: 'Morning Report',
        row: 177,
        field: 'Scribe / teaching points sign-ups',
        role: 'teaching_points',
        raw: 'Julia',
        reason: 'unverified-short-name',
        candidates: [
          'person-5555e7036f4c91a84c1e746d',
          'person-7024f448f8a847506d8fa1de'
        ]
      },
      {
        recordId: 'Morning Report:204',
        sessionId: 'Morning Report:204',
        source: 'Morning Report',
        row: 204,
        field: 'Facilitator',
        role: 'facilitator',
        raw: 'Julia',
        reason: 'unverified-short-name',
        candidates: [
          'person-5555e7036f4c91a84c1e746d',
          'person-7024f448f8a847506d8fa1de'
        ]
      },
      {
        recordId: 'Morning Report:300',
        sessionId: 'Morning Report:300',
        source: 'Morning Report',
        row: 300,
        field: 'Facilitator',
        role: 'facilitator',
        raw: 'Dan (backup)',
        reason: 'conditional-assignment',
        candidates: []
      },
      {
        recordId: 'Morning Report:400',
        sessionId: 'Morning Report:400',
        source: 'Morning Report',
        row: 400,
        field: 'Facilitator',
        role: 'facilitator',
        raw: 'Cancelled Speaker',
        reason: 'cancellation-or-strikethrough',
        candidates: []
      }
    ]
  };

  const initialAliases = {
    schemaVersion: 1,
    description: 'Test member aliases',
    decisions: []
  };

  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
  fs.writeFileSync(identitiesPath, JSON.stringify({ schemaVersion: 1, identities }, null, 2));
  fs.writeFileSync(aliasesPath, JSON.stringify(initialAliases, null, 2));

  return {
    dir,
    ledgerPath,
    identitiesPath,
    aliasesPath,
    ledger,
    identities,
    cleanup() {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

test('Bare Julia with multiple candidates never auto-resolves', () => {
  const env = createTestEnv();
  try {
    const queue = loadQueue({
      ledgerPath: env.ledgerPath,
      identitiesPath: env.identitiesPath,
      aliasesPath: env.aliasesPath
    });

    const juliaGroup = queue.tokenGroups.find(g => g.normalizedName === 'julia');
    assert.ok(juliaGroup, 'Julia token group should exist in queue');
    assert.equal(juliaGroup.status, 'pending', 'Bare Julia group status must remain pending');
    assert.equal(juliaGroup.occurrences.length, 2, 'Julia has 2 occurrences');
    assert.equal(juliaGroup.pendingOccurrences.length, 2, 'All occurrences remain unresolved');
    assert.equal(juliaGroup.resolvedOccurrences.length, 0, 'No occurrences automatically resolved');

    // Ranked candidates must include both Julias
    const candidateIds = juliaGroup.rankedCandidates.map(c => c.personId);
    assert.ok(candidateIds.includes('person-5555e7036f4c91a84c1e746d'), 'Must suggest Julia Zanco');
    assert.ok(candidateIds.includes('person-7024f448f8a847506d8fa1de'), 'Must suggest Julia Schlender');

    // Both top candidates have identical suggestion scores for bare 'Julia'
    const topScores = juliaGroup.rankedCandidates.slice(0, 2).map(c => c.score);
    assert.equal(topScores[0], topScores[1], 'Identical first-name candidates receive equal suggestion scores');

    // Confirm that compiler identityIndex also marks it unverified-short-name with candidates
    const { identityIndex } = require('../scripts/compile-logbooks.cjs');
    const index = identityIndex({ schemaVersion: 1, identities: env.identities });
    const resolved = index.resolve('Julia');
    assert.equal(resolved.reason, 'unverified-short-name');
    assert.equal(resolved.candidates.length, 2);
  } finally {
    env.cleanup();
  }
});

test('An occurrence decision affects exactly one occurrence', () => {
  const env = createTestEnv();
  try {
    // 1. Initial state has 2 pending occurrences of Julia
    let queue = loadQueue({
      ledgerPath: env.ledgerPath,
      identitiesPath: env.identitiesPath,
      aliasesPath: env.aliasesPath
    });
    let juliaGroup = queue.tokenGroups.find(g => g.normalizedName === 'julia');
    assert.equal(juliaGroup.pendingOccurrences.length, 2);

    // 2. Accept only ONE occurrence (using default occurrence scope)
    const firstOcc = juliaGroup.pendingOccurrences[0];
    const acceptRes = acceptDecision(
      {
        tokenId: firstOcc.occurrenceId,
        personId: 'person-5555e7036f4c91a84c1e746d',
        evidence: 'Verified via 2026-09-08 email with session chair'
      },
      {
        ledgerPath: env.ledgerPath,
        identitiesPath: env.identitiesPath,
        aliasesPath: env.aliasesPath
      }
    );

    assert.equal(acceptRes.affectedOccurrences.length, 1, 'Decision must affect exactly one occurrence');
    assert.equal(acceptRes.affectedOccurrences[0].occurrenceId, firstOcc.occurrenceId);
    assert.equal(acceptRes.decision.scope, 'occurrence');

    // 3. Reload queue and assert exactly one occurrence resolved, one remains pending
    queue = loadQueue({
      ledgerPath: env.ledgerPath,
      identitiesPath: env.identitiesPath,
      aliasesPath: env.aliasesPath
    });
    juliaGroup = queue.tokenGroups.find(g => g.normalizedName === 'julia');

    assert.equal(juliaGroup.resolvedOccurrences.length, 1, 'Exactly one occurrence must be resolved');
    assert.equal(juliaGroup.pendingOccurrences.length, 1, 'The other occurrence must remain pending');
    assert.equal(juliaGroup.status, 'pending', 'Group status must remain pending while occurrences remain');
    assert.equal(juliaGroup.resolvedOccurrences[0].occurrenceId, firstOcc.occurrenceId);
  } finally {
    env.cleanup();
  }
});

test('A rejected suggestion stays rejected across restarts', () => {
  const env = createTestEnv();
  try {
    // 1. Reject Julia Schlender for token "julia"
    const rejectRes = rejectDecision(
      {
        tokenId: 'julia',
        personId: 'person-7024f448f8a847506d8fa1de',
        evidence: 'Confirmed not Julia Schlender; she was on clinical rotation'
      },
      {
        ledgerPath: env.ledgerPath,
        identitiesPath: env.identitiesPath,
        aliasesPath: env.aliasesPath
      }
    );

    assert.equal(rejectRes.decision.action, 'reject');
    assert.equal(rejectRes.decision.personId, 'person-7024f448f8a847506d8fa1de');

    // 2. Restart/reload from disk
    const reloadedQueue = loadQueue({
      ledgerPath: env.ledgerPath,
      identitiesPath: env.identitiesPath,
      aliasesPath: env.aliasesPath
    });

    const juliaGroup = reloadedQueue.tokenGroups.find(g => g.normalizedName === 'julia');
    assert.ok(juliaGroup.rejectedPersonIds.has('person-7024f448f8a847506d8fa1de'));

    const candidate = juliaGroup.rankedCandidates.find(c => c.personId === 'person-7024f448f8a847506d8fa1de');
    assert.ok(candidate, 'Candidate exists in list');
    assert.equal(candidate.rejected, true, 'Candidate must be marked rejected after restart');

    // The non-rejected candidate (Julia Zanco) must rank higher than the rejected one
    const activeTop = juliaGroup.rankedCandidates.find(c => !c.rejected);
    assert.equal(activeTop.personId, 'person-5555e7036f4c91a84c1e746d');
  } finally {
    env.cleanup();
  }
});

test('Commas inside parentheses do not split names', () => {
  // Verifies that parenthesized annotations with commas are preserved as single tokens
  const sample1 = 'Julia Z & Chris Conway (friend, with mentor)';
  assert.deepEqual(peopleTokens(sample1), [
    'Julia Z',
    'Chris Conway (friend, with mentor)'
  ]);

  const sample2 = 'Dr. Smith (Cardiology, Chief) / Dr. Patel';
  assert.deepEqual(peopleTokens(sample2), [
    'Dr. Smith (Cardiology, Chief)',
    'Dr. Patel'
  ]);

  const sample3 = 'Julia (backup, not confirmed)';
  assert.deepEqual(peopleTokens(sample3), [
    'Julia (backup, not confirmed)'
  ]);
});

test('Conflicting accepted aliases fail validation', () => {
  const env = createTestEnv();
  try {
    // 1. Conflict with existing identity in logbook-identities.json
    // "Julia S" is already an alias for Julia Schlender (person-7024f448f8a847506d8fa1de).
    // Attempting to accept "Julia S" as an alias for Julia Zanco (person-5555e7036f4c91a84c1e746d) must fail!
    const conflictingWithRegistry = [
      {
        id: 'decision-conflict-1',
        token: 'Julia S',
        reference: null,
        personId: 'person-5555e7036f4c91a84c1e746d', // Wrong person!
        action: 'accept',
        scope: 'alias',
        evidence: 'Invalid mapping test',
        timestamp: new Date().toISOString(),
        ledgerHash: 'test-source-hash-12345'
      }
    ];

    assert.throws(
      () => validateDecisions(conflictingWithRegistry, env.identities, env.ledger, 'test-source-hash-12345'),
      /Conflicting accepted alias/
    );

    // 2. Conflict between two decisions mapping the same token to different identities
    const conflictingDecisions = [
      {
        id: 'decision-1',
        token: 'jules',
        reference: null,
        personId: 'person-5555e7036f4c91a84c1e746d',
        action: 'accept',
        scope: 'alias',
        evidence: 'First assignment',
        timestamp: '2026-09-08T00:00:00.000Z',
        ledgerHash: 'test-source-hash-12345'
      },
      {
        id: 'decision-2',
        token: 'jules',
        reference: null,
        personId: 'person-7024f448f8a847506d8fa1de', // Different person, not superseding
        action: 'accept',
        scope: 'alias',
        evidence: 'Conflicting second assignment',
        timestamp: '2026-09-08T00:01:00.000Z',
        ledgerHash: 'test-source-hash-12345'
      }
    ];

    assert.throws(
      () => validateDecisions(conflictingDecisions, env.identities, env.ledger, 'test-source-hash-12345'),
      /Conflicting accepted alias/
    );
  } finally {
    env.cleanup();
  }
});

test('Unknown canonical IDs and stale ledger references are rejected', () => {
  const env = createTestEnv();
  try {
    // 1. Unknown canonical ID rejection
    assert.throws(
      () => acceptDecision(
        {
          tokenId: 'julia',
          personId: 'person-non-existent-999999999',
          scope: 'alias',
          evidence: 'test'
        },
        {
          ledgerPath: env.ledgerPath,
          identitiesPath: env.identitiesPath,
          aliasesPath: env.aliasesPath
        }
      ),
      /Unknown canonical person ID/
    );

    assert.throws(
      () => rejectDecision(
        {
          tokenId: 'julia',
          personId: 'person-non-existent-999999999',
          evidence: 'test'
        },
        {
          ledgerPath: env.ledgerPath,
          identitiesPath: env.identitiesPath,
          aliasesPath: env.aliasesPath
        }
      ),
      /Unknown canonical person ID/
    );

    // 2. Unknown / stale ledger token reference
    assert.throws(
      () => acceptDecision(
        {
          tokenId: 'occ-nonexistent-token',
          personId: 'person-5555e7036f4c91a84c1e746d',
          scope: 'occurrence',
          evidence: 'test'
        },
        {
          ledgerPath: env.ledgerPath,
          identitiesPath: env.identitiesPath,
          aliasesPath: env.aliasesPath
        }
      ),
      /Stale or unknown ledger reference/
    );

    // 3. Stale ledger hash in decision validation
    const staleHashDecision = [
      {
        id: 'decision-stale',
        token: 'julia',
        reference: {
          recordId: 'Morning Report:177',
          sessionId: 'Morning Report:177',
          source: 'Morning Report',
          row: 177,
          field: 'Scribe / teaching points sign-ups',
          role: 'teaching_points',
          raw: 'Julia'
        },
        personId: 'person-5555e7036f4c91a84c1e746d',
        action: 'accept',
        scope: 'occurrence',
        evidence: 'Stale hash test',
        timestamp: new Date().toISOString(),
        ledgerHash: 'outdated-hash-9999'
      }
    ];

    assert.throws(
      () => validateDecisions(staleHashDecision, env.identities, env.ledger, 'current-hash-0000'),
      /Stale ledger reference/
    );
  } finally {
    env.cleanup();
  }
});

test('Cancellations and conditional assignments are blocked from automatic identity acceptance', () => {
  const env = createTestEnv();
  try {
    // Attempting to accept "Dan (backup)" which is flagged as conditional-assignment
    assert.throws(
      () => acceptDecision(
        {
          tokenId: 'Dan (backup)',
          personId: 'person-b99bf0492f97e5c6eb4b92aa',
          scope: 'occurrence',
          evidence: 'Should fail'
        },
        {
          ledgerPath: env.ledgerPath,
          identitiesPath: env.identitiesPath,
          aliasesPath: env.aliasesPath
        }
      ),
      /cancellation, conditional assignment, and session-alignment issues are outside automatic identity acceptance/
    );

    // Attempting to accept "Cancelled Speaker" which is flagged as cancellation-or-strikethrough
    assert.throws(
      () => acceptDecision(
        {
          tokenId: 'Cancelled Speaker',
          personId: 'person-5555e7036f4c91a84c1e746d',
          scope: 'occurrence',
          evidence: 'Should fail'
        },
        {
          ledgerPath: env.ledgerPath,
          identitiesPath: env.identitiesPath,
          aliasesPath: env.aliasesPath
        }
      ),
      /cancellation, conditional assignment, and session-alignment issues are outside automatic identity acceptance/
    );
  } finally {
    env.cleanup();
  }
});

test('CLI show and list output formats display suggestions and previews properly', () => {
  const env = createTestEnv();
  try {
    // List command
    const listRes = listTokens({
      limit: 5,
      ledgerPath: env.ledgerPath,
      identitiesPath: env.identitiesPath,
      aliasesPath: env.aliasesPath
    });
    assert.ok(listRes.output.includes('Unresolved Alias Review Queue'));
    assert.ok(listRes.output.includes('Suggestion only'));

    // Show command
    const showRes = showToken('julia', {
      ledgerPath: env.ledgerPath,
      identitiesPath: env.identitiesPath,
      aliasesPath: env.aliasesPath
    });
    assert.ok(showRes.output.includes('Token Group: julia'));
    assert.ok(showRes.output.includes('Occurrences: 2 total'));
    assert.ok(showRes.output.includes('Suggestion only - human review required'));

    // Global alias preview
    const aliasRes = acceptDecision(
      {
        tokenId: 'julia',
        personId: 'person-5555e7036f4c91a84c1e746d',
        scope: 'alias',
        evidence: 'Coordinator approved global alias'
      },
      {
        ledgerPath: env.ledgerPath,
        identitiesPath: env.identitiesPath,
        aliasesPath: env.aliasesPath
      }
    );
    assert.equal(aliasRes.decision.scope, 'alias');
    assert.equal(aliasRes.affectedOccurrences.length, 2);
    assert.ok(aliasRes.output.includes('Affected Occurrences (2):'));
  } finally {
    env.cleanup();
  }
});

test('CLI executable commands list, show, accept, reject, defer work via process execution', () => {
  const env = createTestEnv();
  const cp = require('node:child_process');
  const script = path.join(__dirname, '../scripts/review-aliases.cjs');
  try {
    // 1. list
    const listOut = cp.execFileSync(process.execPath, [script, 'list', '--limit', '10', '--ledger', env.ledgerPath, '--identities', env.identitiesPath, '--aliases', env.aliasesPath], { encoding: 'utf8' });
    assert.ok(listOut.includes('Unresolved Alias Review Queue'));

    // 2. defer
    const deferOut = cp.execFileSync(process.execPath, [script, 'defer', '--token-id', 'julia', '--reason', 'Needs check', '--ledger', env.ledgerPath, '--identities', env.identitiesPath, '--aliases', env.aliasesPath], { encoding: 'utf8' });
    assert.ok(deferOut.includes('Action: DEFER'));

    // 3. reject
    const rejectOut = cp.execFileSync(process.execPath, [script, 'reject', '--token-id', 'julia', '--person-id', 'person-7024f448f8a847506d8fa1de', '--evidence', 'Not Schlender', '--ledger', env.ledgerPath, '--identities', env.identitiesPath, '--aliases', env.aliasesPath], { encoding: 'utf8' });
    assert.ok(rejectOut.includes('Action: REJECT'));

    // 4. accept (default scope occurrence)
    const acceptOut = cp.execFileSync(process.execPath, [script, 'accept', '--token-id', 'julia', '--person-id', 'person-5555e7036f4c91a84c1e746d', '--evidence', 'Verified', '--ledger', env.ledgerPath, '--identities', env.identitiesPath, '--aliases', env.aliasesPath], { encoding: 'utf8' });
    assert.ok(acceptOut.includes('Action: ACCEPT'));
    assert.ok(acceptOut.includes('Scope: OCCURRENCE'));
    assert.ok(acceptOut.includes('Affected Occurrences (1)'));

    // 5. show
    const showOut = cp.execFileSync(process.execPath, [script, 'show', '--token-id', 'julia', '--ledger', env.ledgerPath, '--identities', env.identitiesPath, '--aliases', env.aliasesPath], { encoding: 'utf8' });
    assert.ok(showOut.includes('Token Group: julia'));
    assert.ok(showOut.includes('[REJECTED]'));
  } finally {
    env.cleanup();
  }
});

