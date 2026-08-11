const assert = require('node:assert/strict');
const test = require('node:test');

const { maskEmail, safeRecord } = require('./auditInvitationDelivery');

test('invitation audit masks email addresses in operational output', () => {
  assert.equal(maskEmail('Vladyslav@example.com'), 'vl***@example.com');
});

test('invitation audit identifies provider-accepted pending staff email', () => {
  assert.deepEqual(safeRecord('staff_invite', {
    id: 'invite-1',
    email: 'vladyslav@example.com',
    full_name: 'Vladyslav',
    status: 'pending',
    email_provider_id: 'provider-1',
    updated_at: '2026-08-11T19:00:00.000Z'
  }), {
    type: 'staff_invite',
    id: 'invite-1',
    name: 'Vladyslav',
    email: 'vl***@example.com',
    status: 'pending',
    invited_at: null,
    accepted_at: null,
    updated_at: '2026-08-11T19:00:00.000Z',
    email_provider_accepted: true
  });
});
