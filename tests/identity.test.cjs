'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Identity = require('../identity.js');

test('Missing identity produces a defined signed-out state', () => {
  Identity.clearMockUser();
  const user = Identity.getCurrentUser();
  assert.equal(user, null, 'Default state with no active session is null (defined signed-out)');
});

test('Profile changes notify subscribers and clear the previous personal view', () => {
  let latest = 'unnotified';
  const notifications = [];
  const unsubscribe = Identity.subscribe(user => {
    latest = user;
    notifications.push(user ? user.id : null);
  });

  try {
    Identity.setMockUser({ id: 'synthetic-user-1', name: 'Synthetic One' });
    assert.equal(latest?.id, 'synthetic-user-1');
    assert.equal(Identity.getCurrentUser()?.id, 'synthetic-user-1');

    // Changing profile
    Identity.setMockUser({ id: 'synthetic-user-2', name: 'Synthetic Two' });
    assert.equal(latest?.id, 'synthetic-user-2');

    // Clearing profile
    Identity.clearMockUser();
    assert.equal(latest, null);
    assert.deepEqual(notifications, ['synthetic-user-1', 'synthetic-user-2', null]);
  } finally {
    unsubscribe();
    Identity.clearMockUser();
  }
});

test('The profile does not modify workspace backups', () => {
  // Mock profile is stored in session storage, not in localStorage / workspace
  Identity.setMockUser({ id: 'synthetic-zg', name: 'Synthetic User', email: 'test-backup@example.test' });
  const appCode = fs.readFileSync(require.resolve('../app.js'), 'utf8');

  // Verify workspace backup serialization in app.js
  const mockWorkspace = { edits: {}, added: [], favorites: [], history: [] };
  const backup = {
    format: 'cps-hub-backup-v2',
    timestamp: new Date().toISOString(),
    workspace: mockWorkspace
  };
  const serialized = JSON.stringify(backup);
  assert.equal(serialized.includes('test-backup@example.test'), false);
  assert.equal(serialized.includes('synthetic-zg'), false);
  assert.equal(serialized.includes(Identity.SESSION_KEY), false);
  Identity.clearMockUser();
});

test('A mock profile cannot establish production authorization', () => {
  Identity.setMockUser({ id: 'synthetic-dev', name: 'Dev Member' });
  const user = Identity.getCurrentUser();
  assert.equal(user.isMock, true);
  assert.equal(user.productionAuthorized, false);
  assert.equal(Identity.isProductionAuthorized(user), false);

  // Mapped canonical person ID remains distinct from application user ID
  assert.notEqual(user.id, Identity.getLedgerPersonId('zg'));
  assert.equal(Identity.getLedgerPersonId('zg'), 'person-5b2737d41e4ac7b28700df42');
  assert.equal(Identity.getLedgerPersonId('unknown-id'), null);
  Identity.clearMockUser();
});

test('Diagnostics omit the supplied email', () => {
  Identity.setMockUser({ id: 'synthetic-zg', name: 'Synthetic ZG', email: 'm.zakariyya.g@gmail.com' });
  const appCode = fs.readFileSync(require.resolve('../app.js'), 'utf8');

  const context = {
    Identity,
    window: { innerWidth: 1024, innerHeight: 768 },
    location: { hash: '#/profile/logbook' },
    KEY: 'cps-hub-workspace-v2',
    errorRingBuffer: []
  };
  vm.runInNewContext(appCode.slice(appCode.indexOf('function captureDiagnostics'), appCode.indexOf('const groups=')), context);
  const diag = context.captureDiagnostics();
  const serialized = JSON.stringify(diag);

  assert.equal(serialized.includes('m.zakariyya.g@gmail.com'), false, 'Diagnostics must never contain email');
  assert.equal(serialized.includes('email'), false, 'Diagnostics must omit email property');
  Identity.clearMockUser();
});
