'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { reconcileWorkbooks } = require('../scripts/reconcile-workbooks.cjs');

test('reconcileWorkbooks: detects 0 differences on identical datasets', () => {
  const local = {
    'Morning Report': {
      records: [
        { id: 'mr:1', stableId: 'mr-1', fields: { Date: '2026-10-01', Presenter: 'Dr. A' } }
      ]
    }
  };
  const remote = JSON.parse(JSON.stringify(local));

  const result = reconcileWorkbooks(local, remote);
  assert.equal(result.summary.totalDiscrepancies, 0);
  assert.equal(result.summary.totalMissingInRemote, 0);
  assert.equal(result.summary.totalNewInRemote, 0);
});

test('reconcileWorkbooks: detects field value discrepancy', () => {
  const local = {
    'Morning Report': {
      records: [
        { id: 'mr:1', stableId: 'mr-1', fields: { Date: '2026-10-01', Presenter: 'Dr. A' } }
      ]
    }
  };
  const remote = {
    'Morning Report': {
      records: [
        { id: 'mr:1', stableId: 'mr-1', fields: { Date: '2026-10-01', Presenter: 'Dr. B' } }
      ]
    }
  };

  const result = reconcileWorkbooks(local, remote);
  assert.equal(result.summary.totalDiscrepancies, 1);
  assert.equal(result.datasets['Morning Report'].discrepanciesCount, 1);
  assert.deepEqual(result.datasets['Morning Report'].discrepancies[0].differences.Presenter, {
    local: 'Dr. A',
    remote: 'Dr. B'
  });
});

test('reconcileWorkbooks: detects missing and new records', () => {
  const local = {
    'Morning Report': {
      records: [
        { id: 'mr:1', stableId: 'mr-1', fields: { Date: '2026-10-01' } }
      ]
    }
  };
  const remote = {
    'Morning Report': {
      records: [
        { id: 'mr:2', stableId: 'mr-2', fields: { Date: '2026-10-02' } }
      ]
    }
  };

  const result = reconcileWorkbooks(local, remote);
  assert.equal(result.summary.totalMissingInRemote, 1);
  assert.equal(result.summary.totalNewInRemote, 1);
  assert.equal(result.datasets['Morning Report'].missingInRemote[0].stableId, 'mr-1');
  assert.equal(result.datasets['Morning Report'].newInRemote[0].stableId, 'mr-2');
});
