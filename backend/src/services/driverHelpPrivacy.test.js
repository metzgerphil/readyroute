const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AI_CONSENT_POLICY_VERSION,
  createDriverHelpPrivacyService,
  redactConversationContextForAi,
  redactTextForAi
} = require('./driverHelpPrivacy');

function createAccountSupabase(initialAccount) {
  let account = initialAccount ? { ...initialAccount } : null;
  const calls = [];
  return {
    calls,
    from(table) {
      assert.equal(table, 'accounts');
      const query = {
        operation: 'select',
        payload: null,
        update(payload) {
          this.operation = 'update';
          this.payload = payload;
          calls.push({ operation: 'update', payload });
          return this;
        },
        select() { return this; },
        eq() { return this; },
        async maybeSingle() {
          if (this.operation === 'update' && account) account = { ...account, ...this.payload };
          return { data: account, error: null };
        }
      };
      return query;
    }
  };
}

test('redactTextForAi removes common personal and package identifiers', () => {
  const result = redactTextForAi('Call 415-555-1212, email driver@example.com, package 123456789012 at 42 Main Street.');
  assert.equal(result.includes('415-555-1212'), false);
  assert.equal(result.includes('driver@example.com'), false);
  assert.equal(result.includes('123456789012'), false);
  assert.equal(result.includes('42 Main Street'), false);
});

test('redactConversationContextForAi redacts the active question history', () => {
  const result = redactConversationContextForAi({
    original_situation: 'Deliver to 900 Market Ave',
    previous_question: 'Tracking 123456789012',
    clarification_history: [{ prompt: 'Where?', answer: '900 Market Ave' }]
  });
  assert.match(result.original_situation, /address removed/);
  assert.match(result.previous_question, /identifier removed/);
  assert.match(result.clarification_history[0].answer, /address removed/);
});

test('company AI authorization is read from the account-wide authorization fields', async () => {
  const supabase = createAccountSupabase({
    rra_ai_processing_authorized: true,
    rra_ai_processing_policy_version: AI_CONSENT_POLICY_VERSION,
    rra_ai_processing_authorized_at: '2026-08-28T20:00:00.000Z'
  });
  const service = createDriverHelpPrivacyService({ supabase });

  const result = await service.getCompanyAuthorization({ accountId: 'account-1' });

  assert.equal(result.company_ai_processing_authorized, true);
  assert.equal(result.company_authorized_at, '2026-08-28T20:00:00.000Z');
});

test('company AI authorization records the authorizing manager and current policy', async () => {
  const supabase = createAccountSupabase({ rra_ai_processing_authorized: false });
  const service = createDriverHelpPrivacyService({
    supabase,
    now: () => new Date('2026-08-29T04:00:00.000Z')
  });

  const result = await service.setCompanyAuthorization({
    accountId: 'account-1',
    managerUserId: 'manager-1',
    authorized: true,
    policyVersion: AI_CONSENT_POLICY_VERSION
  });

  assert.equal(result.company_ai_processing_authorized, true);
  assert.equal(result.company_authorized_at, '2026-08-29T04:00:00.000Z');
  assert.deepEqual(supabase.calls[0].payload, {
    rra_ai_processing_authorized: true,
    rra_ai_processing_policy_version: AI_CONSENT_POLICY_VERSION,
    rra_ai_processing_authorized_at: '2026-08-29T04:00:00.000Z',
    rra_ai_processing_authorized_by: 'manager-1',
    rra_ai_processing_withdrawn_at: null,
    rra_ai_processing_withdrawn_by: null
  });
});

test('company AI authorization rejects a stale policy version before writing', async () => {
  const supabase = createAccountSupabase({ rra_ai_processing_authorized: false });
  const service = createDriverHelpPrivacyService({ supabase });

  await assert.rejects(
    service.setCompanyAuthorization({
      accountId: 'account-1',
      managerUserId: 'manager-1',
      authorized: true,
      policyVersion: 'old-policy'
    }),
    (error) => error.code === 'POLICY_VERSION_MISMATCH'
  );
  assert.equal(supabase.calls.length, 0);
});
