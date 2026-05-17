import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deriveSelectedCsa,
  deriveSelectedCsaName,
  getAuthorizedCsaId,
  getSelectedCsaInitialization,
  resolveSelectedCsaId
} from './selectedCsa.js';

const csaA = {
  id: 'csa-a-id',
  company_name: 'CSA A Test'
};

const csaB = {
  id: 'csa-b-id',
  company_name: 'CSA B Test'
};

test('CSA selection validates stored ids against the authorized linked CSA list', () => {
  assert.equal(getAuthorizedCsaId([csaA, csaB], 'csa-a-id'), 'csa-a-id');
  assert.equal(getAuthorizedCsaId([csaA, csaB], 'invalid-csa-id'), null);
});

test('CSA selection prefers stored id, then token id, then first authorized CSA', () => {
  assert.equal(
    resolveSelectedCsaId({
      csas: [csaA, csaB],
      storedCsaId: 'csa-b-id',
      tokenCsaId: 'csa-a-id'
    }),
    'csa-b-id'
  );

  assert.equal(
    resolveSelectedCsaId({
      csas: [csaA, csaB],
      storedCsaId: 'invalid-csa-id',
      tokenCsaId: 'csa-a-id'
    }),
    'csa-a-id'
  );

  assert.equal(
    resolveSelectedCsaId({
      csas: [csaA, csaB],
      storedCsaId: 'invalid-csa-id',
      tokenCsaId: 'also-invalid'
    }),
    'csa-a-id'
  );
});

test('CSA display name is derived by id, not by matching visible names', () => {
  const sameNameA = {
    id: 'duplicate-name-a',
    company_name: 'Duplicate CSA Name'
  };
  const sameNameB = {
    id: 'duplicate-name-b',
    company_name: 'Duplicate CSA Name'
  };

  const selected = deriveSelectedCsa({
    csas: [sameNameA, sameNameB],
    selectedCsaId: 'duplicate-name-b'
  });

  assert.equal(selected.id, 'duplicate-name-b');
  assert.equal(deriveSelectedCsaName(selected), 'Duplicate CSA Name');
});

test('CSA selection keeps A and B identities separate for route data scoping', () => {
  const selectedA = deriveSelectedCsa({
    csas: [csaA, csaB],
    selectedCsaId: 'csa-a-id'
  });
  const selectedB = deriveSelectedCsa({
    csas: [csaA, csaB],
    selectedCsaId: 'csa-b-id'
  });

  assert.equal(selectedA.company_name, 'CSA A Test');
  assert.equal(selectedB.company_name, 'CSA B Test');
  assert.notEqual(selectedA.id, selectedB.id);
});

test('CSA initialization clears unauthorized stored CSA ids', () => {
  const init = getSelectedCsaInitialization({
    csas: [csaA],
    selectedCsaId: 'csa-a-id',
    storedCsaId: 'unknown-csa',
    tokenCsaId: 'csa-a-id'
  });

  assert.equal(init.shouldClearStoredCsaId, true);
  assert.equal(init.selectedStateId, null);
  assert.equal(init.storedSwitchId, null);
});

test('CSA initialization requests one stored CSA token switch when authorized', () => {
  const init = getSelectedCsaInitialization({
    csas: [csaA, csaB],
    selectedCsaId: 'csa-a-id',
    storedCsaId: 'csa-b-id',
    tokenCsaId: 'csa-a-id'
  });

  assert.equal(init.shouldClearStoredCsaId, false);
  assert.equal(init.selectedStateId, 'csa-a-id');
  assert.equal(init.storedSwitchId, 'csa-b-id');
});

test('CSA initialization does not repeat stored CSA token switch attempts', () => {
  const init = getSelectedCsaInitialization({
    csas: [csaA, csaB],
    selectedCsaId: 'csa-a-id',
    storedCsaId: 'csa-b-id',
    tokenCsaId: 'csa-a-id',
    hasAttemptedStoredSwitch: true
  });

  assert.equal(init.storedSwitchId, null);
});
