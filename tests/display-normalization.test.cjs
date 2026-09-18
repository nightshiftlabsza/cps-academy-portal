'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../session-core.js');

test('normalizeSessionTypeName maps Spontaneous variants to Virtual Morning Report', () => {
  assert.equal(core.normalizeSessionTypeName('Spontaneous'), 'Virtual Morning Report');
  assert.equal(core.normalizeSessionTypeName('spontaneous'), 'Virtual Morning Report');
  assert.equal(core.normalizeSessionTypeName('SPONTANEOUS'), 'Virtual Morning Report');
  assert.equal(core.normalizeSessionTypeName('Spontaneous & NO Academy'), 'Virtual Morning Report (No Academy)');
  assert.equal(core.normalizeSessionTypeName('spontaneous & no academy'), 'Virtual Morning Report (No Academy)');
});

test('normalizeSessionTypeName falls back cleanly on blanks, empty or placeholders', () => {
  assert.equal(core.normalizeSessionTypeName(''), 'Virtual Morning Report');
  assert.equal(core.normalizeSessionTypeName(null), 'Virtual Morning Report');
  assert.equal(core.normalizeSessionTypeName('TBD'), 'Virtual Morning Report');
  assert.equal(core.normalizeSessionTypeName('-'), 'Virtual Morning Report');
});

test('normalizeSessionTypeName preserves distinct non-spontaneous types', () => {
  assert.equal(core.normalizeSessionTypeName('Grand Rounds'), 'Grand Rounds');
  assert.equal(core.normalizeSessionTypeName('Recess'), 'Recess');
  assert.equal(core.normalizeSessionTypeName('Special Session'), 'Special Session');
});

test('getSessionDisplayTitle deduplicates when session type matches title', () => {
  const recordSpontaneous = {
    fields: {
      Type: 'Spontaneous',
      'Topic / Case': '',
      Details: ''
    }
  };
  const titleInfo = core.getSessionDisplayTitle(recordSpontaneous);
  assert.equal(titleInfo.mainTitle, 'Virtual Morning Report');
  assert.equal(titleInfo.hasDistinctTag, false);
  assert.equal(titleInfo.sessionTypeTag, '');
});

test('getSessionDisplayTitle shows distinct topic and type tag when topic is provided', () => {
  const recordWithTopic = {
    fields: {
      Type: 'Spontaneous',
      'Topic / Case': 'Hypercalcemia with altered mental status',
      Details: ''
    }
  };
  const titleInfo = core.getSessionDisplayTitle(recordWithTopic);
  assert.equal(titleInfo.mainTitle, 'Hypercalcemia with altered mental status');
  assert.equal(titleInfo.hasDistinctTag, true);
  assert.equal(titleInfo.sessionTypeTag, 'Virtual Morning Report');
});

test('getSessionDisplayTitle does not duplicate if Topic is identical to normalized type', () => {
  const recordRedundant = {
    fields: {
      Type: 'Spontaneous',
      'Topic / Case': 'Virtual Morning Report',
      Details: ''
    }
  };
  const titleInfo = core.getSessionDisplayTitle(recordRedundant);
  assert.equal(titleInfo.mainTitle, 'Virtual Morning Report');
  assert.equal(titleInfo.hasDistinctTag, false);
});
