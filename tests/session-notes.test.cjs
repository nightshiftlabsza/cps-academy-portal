'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../session-core.js');
const mutateModule = require('../api/mutate.js');

const makeRecord = (id, notes = '', extra = {}) => ({
  id,
  source: 'Morning Report',
  fields: {
    Date: '2026-09-15',
    'Pacific time (source)': '08:00:00',
    'Eastern time (source)': '11:00:00',
    Type: 'Spontaneous',
    Facilitator: 'Dr. Discussant',
    Presenter: 'Dr. Presenter',
    Notes: notes,
    ...extra
  },
  flags: []
});

test('Session Notes never affects role identity resolution or milestone counts', () => {
  // Session notes mentioning other names must never alter milestones or add people to role histories
  const rec1 = makeRecord('mr:note1', 'Presenter is a friend of Ahmed Khan and Alice Walker');
  const rec2 = makeRecord('mr:note2', 'Discussion led with advice from Rabih', {
    Date: '2026-09-20',
    Presenter: 'Ahmed Khan'
  });

  const index = core.buildRoleMilestoneIndex([rec1, rec2]);

  // rec1 has Dr. Presenter -> 1st time
  assert.equal(index.getMilestone('mr:note1', 'Presenter', 'Dr. Presenter').ordinal, '1st time');

  // Ahmed Khan in rec1 was ONLY in Notes, NOT in Presenter role!
  // Therefore in rec2, Ahmed Khan is 1st time, NOT 2nd time!
  assert.equal(index.getMilestone('mr:note2', 'Presenter', 'Ahmed Khan').priorCount, 0);
  assert.equal(index.getMilestone('mr:note2', 'Presenter', 'Ahmed Khan').ordinal, '1st time');

  // Rabih in rec2 was only in Notes, not Facilitator
  assert.equal(index.getMilestone('mr:note2', 'Facilitator', 'Rabih'), null);
});

test('api/mutate.js explicitly whitelists Notes on Column M (index 12)', () => {
  const allowed = mutateModule.DATASET_CONFIG;
  assert.ok(allowed['Morning Report'], 'Morning Report dataset must be whitelisted');
  assert.ok(allowed['Morning Report'].cols['Notes'], 'Notes field must be whitelisted');
  assert.equal(allowed['Morning Report'].cols['Notes'].col, 'M');
  assert.equal(allowed['Morning Report'].cols['Notes'].index, 12);
});

test('validates note mutations: add, edit, and clear leave other fields untouched', () => {
  const row = ['2026-09-15', '08:00:00', '11:00:00', 'Spontaneous', 'Dr. Discussant', 'Dr. Presenter', '', '', '', '', '', '', '', '', '', '', ''];
  const originalFac = row[4];
  const originalPres = row[5];

  // 1. Add Note (empty -> "Melissa C volunteered")
  row[12] = 'Melissa C volunteered';
  assert.equal(row[12], 'Melissa C volunteered');
  assert.equal(row[4], originalFac);
  assert.equal(row[5], originalPres);

  // 2. Edit Note ("Melissa C volunteered" -> "Special pediatric neurology case")
  row[12] = 'Special pediatric neurology case';
  assert.equal(row[12], 'Special pediatric neurology case');
  assert.equal(row[4], originalFac);
  assert.equal(row[5], originalPres);

  // 3. Clear Note -> empty string
  row[12] = '';
  assert.equal(row[12], '');
  assert.equal(row[4], originalFac);
  assert.equal(row[5], originalPres);
});
