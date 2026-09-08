'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { exportPersonalLogbook } = require('../scripts/export-personal-logbook.cjs');
const Logbook = require('../logbook.js');
const Identity = require('../identity.js');

test('A personal export contains no other person’s entries', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cps-personal-log-'));
  const outputFile = path.join(tmpDir, 'personal-logbook.json');

  try {
    const targetId = 'person-5b2737d41e4ac7b28700df42'; // Zakariyya Gardee
    const { slice } = exportPersonalLogbook({
      personId: targetId,
      output: outputFile
    });

    assert.equal(slice.schemaVersion, 1);
    assert.equal(slice.personId, targetId);
    assert.equal(slice.canonicalName, 'Zakariyya Gardee');
    assert.ok(slice.entries.length > 0, 'Should have entries for Zakariyya');

    // Read full ledger to ensure no other person's entries or records leak
    const ledger = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'historical-contributions.json'), 'utf8'));
    const otherPersonIds = Object.keys(ledger.people).filter(id => id !== targetId);

    const exportedJson = fs.readFileSync(outputFile, 'utf8');
    for (const otherId of otherPersonIds.slice(0, 50)) {
      assert.equal(exportedJson.includes(otherId), false, `Must not contain entries or ID of other person: ${otherId}`);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Unknown or mismatched identities cannot display a slice', () => {
  const slice = {
    schemaVersion: 1,
    personId: 'person-5b2737d41e4ac7b28700df42',
    canonicalName: 'Zakariyya Gardee',
    entries: [{ id: 'a1', sessionId: 's1', role: 'Presenter', date: '2026-05-01' }]
  };

  // Mismatched expected ID
  const mismatched = Logbook.validateSlice(slice, 'person-different-person-1234');
  assert.equal(mismatched.valid, false);
  assert.match(mismatched.error, /mismatch/i);

  // Unknown or missing expected ID
  const unknown = Logbook.validateSlice(slice, null);
  assert.equal(unknown.valid, false);
  assert.match(unknown.error, /unknown|unmapped/i);

  // Correct expected ID matches
  const valid = Logbook.validateSlice(slice, 'person-5b2737d41e4ac7b28700df42');
  assert.equal(valid.valid, true);
});

test('Two roles in one session yield two assignments and one distinct session', () => {
  const slice = {
    schemaVersion: 1,
    personId: 'person-test-1',
    canonicalName: 'Dual Role Person',
    entries: [
      { id: 'entry-1', sessionId: 'session-shared-101', role: 'Scribe', date: '2026-01-15' },
      { id: 'entry-2', sessionId: 'session-shared-101', role: 'Teaching Points', date: '2026-01-15' }
    ]
  };

  const processed = Logbook.processLogbook(slice, { referenceDate: '2026-09-08' });
  assert.equal(processed.metrics.recordedAssignments, 2, 'Two roles must count as two assignments');
  assert.equal(processed.metrics.distinctSessions, 1, 'Sharing one sessionId must count as one distinct session');
  assert.equal(processed.metrics.roleBreakdown['Scribe'], 1);
  assert.equal(processed.metrics.roleBreakdown['Teaching Points'], 1);
});

test('Future assignments are excluded from past-assignment totals', () => {
  const slice = {
    schemaVersion: 1,
    personId: 'person-test-2',
    canonicalName: 'Future Assignment Person',
    entries: [
      { id: 'entry-past-1', sessionId: 's-past-1', role: 'Facilitator', date: '2026-05-10', temporalState: 'past' },
      { id: 'entry-past-2', sessionId: 's-past-2', role: 'Presenter', date: '2026-06-12', temporalState: 'past' },
      { id: 'entry-future-1', sessionId: 's-future-1', role: 'Facilitator', date: '2026-10-15', temporalState: 'scheduled' },
      { id: 'entry-future-2', sessionId: 's-future-2', role: 'Scribe', date: '2026-11-20', temporalState: 'scheduled' }
    ]
  };

  const processed = Logbook.processLogbook(slice, { referenceDate: '2026-09-08' });
  assert.equal(processed.metrics.recordedAssignments, 2, 'Recorded assignments total must exclude future assignments');
  assert.equal(processed.metrics.distinctSessions, 2);
  assert.equal(processed.scheduledEntries.length, 2);
  assert.equal(processed.pastEntries.length, 2);
});

test('Invalid dates are not silently sorted as valid historical dates', () => {
  const slice = {
    schemaVersion: 1,
    personId: 'person-test-3',
    canonicalName: 'Invalid Dates Person',
    entries: [
      { id: 'entry-valid-1', sessionId: 's-1', role: 'Facilitator', date: '2026-04-01' },
      { id: 'entry-leap-fail', sessionId: 's-2', role: 'Presenter', date: '2026-02-30' },
      { id: 'entry-null-date', sessionId: 's-3', role: 'Scribe', date: null },
      { id: 'entry-text-date', sessionId: 's-4', role: 'Teaching Points', date: 'TBD Date' }
    ]
  };

  const processed = Logbook.processLogbook(slice, { referenceDate: '2026-09-08' });
  assert.equal(processed.metrics.recordedAssignments, 1, 'Only genuine valid dates count towards past assignments');
  assert.equal(processed.unresolvedEntries.length, 3, 'Invalid or non-calendar dates must be sequestered in unresolvedEntries');
  assert.ok(processed.unresolvedEntries.some(e => e.id === 'entry-leap-fail'));
  assert.ok(processed.unresolvedEntries.some(e => e.id === 'entry-null-date'));
  assert.ok(processed.unresolvedEntries.some(e => e.id === 'entry-text-date'));
});

test('Clearing identity removes the previous person’s rendered data', () => {
  Logbook.clearPersonalSlice();
  assert.equal(Logbook.getPersonalSlice(), null);

  const slice = {
    schemaVersion: 1,
    personId: 'person-test-4',
    canonicalName: 'Sample Person',
    entries: [{ id: 'e1', sessionId: 's1', role: 'Facilitator', date: '2026-01-01' }]
  };

  Logbook.setPersonalSlice(slice);
  assert.equal(Logbook.getPersonalSlice()?.personId, 'person-test-4');

  // Clearing identity
  Logbook.clearPersonalSlice();
  assert.equal(Logbook.getPersonalSlice(), null, 'Clearing identity removes the previous person’s slice');
});
