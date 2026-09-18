'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../session-core.js');

const makeRecord = (id, date, pt, et, fields = {}) => ({
  id,
  source: 'Morning Report',
  fields: {
    Date: date,
    'Pacific time (source)': pt,
    'Eastern time (source)': et,
    Type: 'Spontaneous',
    Facilitator: '',
    Presenter: '',
    'Scribe / teaching points sign-ups': '',
    Notes: '',
    ...fields
  },
  flags: []
});

test('milestone ordinals strictly follow 0->1st time, 1->2nd time, 2->3rd time, 3+->normal for all 4 roles', () => {
  const records = [
    makeRecord('mr:1', '2026-01-10', '08:00:00', '11:00:00', {
      Facilitator: 'Alice Walker',
      Presenter: 'Bob Dylan',
      'Scribe / teaching points sign-ups': 'Scribe: Charlie Chaplin\nTeaching Points: David Bowie'
    }),
    makeRecord('mr:2', '2026-02-10', '08:00:00', '11:00:00', {
      Facilitator: 'Alice Walker',
      Presenter: 'Bob Dylan',
      'Scribe / teaching points sign-ups': 'Scribe: Charlie Chaplin\nTeaching Points: David Bowie'
    }),
    makeRecord('mr:3', '2026-03-10', '08:00:00', '11:00:00', {
      Facilitator: 'Alice Walker',
      Presenter: 'Bob Dylan',
      'Scribe / teaching points sign-ups': 'Scribe: Charlie Chaplin\nTeaching Points: David Bowie'
    }),
    makeRecord('mr:4', '2026-04-10', '08:00:00', '11:00:00', {
      Facilitator: 'Alice Walker',
      Presenter: 'Bob Dylan',
      'Scribe / teaching points sign-ups': 'Scribe: Charlie Chaplin\nTeaching Points: David Bowie'
    })
  ];

  const index = core.buildRoleMilestoneIndex(records);

  assert.equal(index.getMilestone('mr:1', 'Facilitator', 'Alice Walker').ordinal, '1st time');
  assert.equal(index.getMilestone('mr:1', 'Presenter', 'Bob Dylan').ordinal, '1st time');
  assert.equal(index.getMilestone('mr:1', 'Scribe', 'Charlie Chaplin').ordinal, '1st time');
  assert.equal(index.getMilestone('mr:1', 'Teaching Points', 'David Bowie').ordinal, '1st time');

  assert.equal(index.getMilestone('mr:2', 'Facilitator', 'Alice Walker').ordinal, '2nd time');
  assert.equal(index.getMilestone('mr:2', 'Presenter', 'Bob Dylan').ordinal, '2nd time');
  assert.equal(index.getMilestone('mr:2', 'Scribe', 'Charlie Chaplin').ordinal, '2nd time');
  assert.equal(index.getMilestone('mr:2', 'Teaching Points', 'David Bowie').ordinal, '2nd time');

  assert.equal(index.getMilestone('mr:3', 'Facilitator', 'Alice Walker').ordinal, '3rd time');
  assert.equal(index.getMilestone('mr:3', 'Presenter', 'Bob Dylan').ordinal, '3rd time');
  assert.equal(index.getMilestone('mr:3', 'Scribe', 'Charlie Chaplin').ordinal, '3rd time');
  assert.equal(index.getMilestone('mr:3', 'Teaching Points', 'David Bowie').ordinal, '3rd time');

  assert.equal(index.getMilestone('mr:4', 'Facilitator', 'Alice Walker').priorCount, 3);
  assert.equal(index.getMilestone('mr:4', 'Facilitator', 'Alice Walker').ordinal, null);
  assert.equal(index.getMilestone('mr:4', 'Presenter', 'Bob Dylan').ordinal, null);
  assert.equal(index.getMilestone('mr:4', 'Scribe', 'Charlie Chaplin').ordinal, null);
  assert.equal(index.getMilestone('mr:4', 'Teaching Points', 'David Bowie').ordinal, null);
});

test('four roles are completely independent for the same person', () => {
  const records = [
    makeRecord('mr:hist1', '2025-01-01', '08:00:00', '11:00:00', {
      Presenter: 'Morgan Freeman',
      'Scribe / teaching points sign-ups': 'Scribe: Morgan Freeman\nTeaching Points: Morgan Freeman'
    }),
    makeRecord('mr:hist2', '2025-02-01', '08:00:00', '11:00:00', {
      Presenter: 'Morgan Freeman',
      'Scribe / teaching points sign-ups': 'Scribe: Morgan Freeman'
    }),
    makeRecord('mr:hist3', '2025-03-01', '08:00:00', '11:00:00', {
      'Scribe / teaching points sign-ups': 'Scribe: Morgan Freeman'
    }),
    makeRecord('mr:hist4', '2025-04-01', '08:00:00', '11:00:00', {
      'Scribe / teaching points sign-ups': 'Scribe: Morgan Freeman'
    }),
    makeRecord('mr:hist5', '2025-05-01', '08:00:00', '11:00:00', {
      'Scribe / teaching points sign-ups': 'Scribe: Morgan Freeman'
    }),
    makeRecord('mr:target', '2026-06-01', '08:00:00', '11:00:00', {
      Facilitator: 'Morgan Freeman',
      Presenter: 'Morgan Freeman',
      'Scribe / teaching points sign-ups': 'Scribe: Morgan Freeman\nTeaching Points: Morgan Freeman'
    })
  ];

  const index = core.buildRoleMilestoneIndex(records);

  const fac = index.getMilestone('mr:target', 'Facilitator', 'Morgan Freeman');
  assert.equal(fac.priorCount, 0);
  assert.equal(fac.ordinal, '1st time');

  const pres = index.getMilestone('mr:target', 'Presenter', 'Morgan Freeman');
  assert.equal(pres.priorCount, 2);
  assert.equal(pres.ordinal, '3rd time');

  const sc = index.getMilestone('mr:target', 'Scribe', 'Morgan Freeman');
  assert.equal(sc.priorCount, 5);
  assert.equal(sc.ordinal, null);

  const tp = index.getMilestone('mr:target', 'Teaching Points', 'Morgan Freeman');
  assert.equal(tp.priorCount, 1);
  assert.equal(tp.ordinal, '2nd time');
});

test('chronology guarantees: later sessions and same session do not count', () => {
  const records = [
    makeRecord('mr:past', '2026-01-01', '08:00:00', '11:00:00', { Facilitator: 'Zara' }),
    makeRecord('mr:current', '2026-02-01', '08:00:00', '11:00:00', { Facilitator: 'Zara' }),
    makeRecord('mr:future', '2026-03-01', '08:00:00', '11:00:00', { Facilitator: 'Zara' })
  ];

  const index = core.buildRoleMilestoneIndex(records);

  assert.equal(index.getMilestone('mr:past', 'Facilitator', 'Zara').priorCount, 0);
  assert.equal(index.getMilestone('mr:past', 'Facilitator', 'Zara').ordinal, '1st time');

  assert.equal(index.getMilestone('mr:current', 'Facilitator', 'Zara').priorCount, 1);
  assert.equal(index.getMilestone('mr:current', 'Facilitator', 'Zara').ordinal, '2nd time');

  assert.equal(index.getMilestone('mr:future', 'Facilitator', 'Zara').priorCount, 2);
  assert.equal(index.getMilestone('mr:future', 'Facilitator', 'Zara').ordinal, '3rd time');
});

test('cancelled, recess, blackout, and unresolved dates are excluded from history', () => {
  const records = [
    makeRecord('mr:valid1', '2026-01-01', '08:00:00', '11:00:00', { Facilitator: 'Elena' }),
    makeRecord('mr:cancelled', '2026-01-05', '08:00:00', '11:00:00', { Facilitator: 'Elena (cancelled)', Notes: 'Cancelled session' }),
    makeRecord('mr:recess', '2026-01-08', '08:00:00', '11:00:00', { Facilitator: 'Elena', Type: 'Recess' }),
    makeRecord('mr:no-date', 'TBD', '08:00:00', '11:00:00', { Facilitator: 'Elena' }),
    makeRecord('mr:valid2', '2026-02-01', '08:00:00', '11:00:00', { Facilitator: 'Elena' })
  ];

  const index = core.buildRoleMilestoneIndex(records);

  assert.equal(index.getMilestone('mr:valid1', 'Facilitator', 'Elena').ordinal, '1st time');

  const valid2 = index.getMilestone('mr:valid2', 'Facilitator', 'Elena');
  assert.equal(valid2.priorCount, 1);
  assert.equal(valid2.ordinal, '2nd time');
});

test('multiple people in the same role are evaluated independently', () => {
  const records = [
    makeRecord('mr:p1', '2026-01-01', '08:00:00', '11:00:00', { Facilitator: 'Veteran Host' }),
    makeRecord('mr:p2', '2026-01-02', '08:00:00', '11:00:00', { Facilitator: 'Veteran Host' }),
    makeRecord('mr:p3', '2026-01-03', '08:00:00', '11:00:00', { Facilitator: 'Veteran Host' }),
    makeRecord('mr:p4', '2026-01-04', '08:00:00', '11:00:00', { Facilitator: 'Veteran Host & Novice Host' })
  ];

  const index = core.buildRoleMilestoneIndex(records);

  const veteran = index.getMilestone('mr:p4', 'Facilitator', 'Veteran Host');
  assert.equal(veteran.priorCount, 3);
  assert.equal(veteran.ordinal, null);

  const novice = index.getMilestone('mr:p4', 'Facilitator', 'Novice Host');
  assert.equal(novice.priorCount, 0);
  assert.equal(novice.ordinal, '1st time');
});
