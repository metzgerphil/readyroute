const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AI_CONSENT_POLICY_VERSION,
  createDriverHelpPrivacyService,
  redactConversationContextForAi,
  redactTextForAi
} = require('./driverHelpPrivacy');

function createPrivacySupabase({ authorized = true, noticeSeen = false } = {}) {
  const account = {
    rra_ai_processing_authorized: authorized,
    rra_ai_processing_policy_version: AI_CONSENT_POLICY_VERSION,
    rra_ai_processing_authorized_at: authorized ? '2026-08-20T12:00:00.000Z' : null,
    rra_ai_processing_withdrawn_at: null
  };
  let notice = noticeSeen ? { policy_version: AI_CONSENT_POLICY_VERSION, seen_at: '2026-08-20T12:05:00.000Z', updated_at: '2026-08-20T12:05:00.000Z' } : null;
  return {
    account,
    from(table) {
      const query = {
        payload: null,
        select() { return this; },
        eq() { return this; },
        update(payload) { this.payload = payload; Object.assign(account, payload); return this; },
        async maybeSingle() {
          return { data: table === 'accounts' ? { ...account } : notice ? { ...notice } : null, error: null };
        },
        async upsert(payload) {
          notice = { policy_version: payload.policy_version, seen_at: payload.seen_at, updated_at: payload.updated_at };
          return { error: null };
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

test('company authorization enables AI while a driver notice remains required only once', async () => {
  const supabase = createPrivacySupabase({ authorized: true, noticeSeen: false });
  const service = createDriverHelpPrivacyService({ supabase, now: () => new Date('2026-08-20T13:00:00.000Z') });
  const before = await service.getPreference({ accountId: 'account-1', actorType: 'driver', actorId: 'driver-1' });
  assert.equal(before.ai_processing_consent, true);
  assert.equal(before.notice_required, true);

  const after = await service.acknowledgeNotice({
    accountId: 'account-1',
    actorType: 'driver',
    actorId: 'driver-1',
    policyVersion: AI_CONSENT_POLICY_VERSION
  });
  assert.equal(after.ai_processing_consent, true);
  assert.equal(after.notice_required, false);
});

test('withdrawing company authorization disables future AI processing', async () => {
  const supabase = createPrivacySupabase({ authorized: true, noticeSeen: true });
  const service = createDriverHelpPrivacyService({ supabase, now: () => new Date('2026-08-20T14:00:00.000Z') });
  const result = await service.setCompanyAuthorization({
    accountId: 'account-1',
    managerUserId: 'manager-1',
    authorized: false,
    policyVersion: AI_CONSENT_POLICY_VERSION
  });
  assert.equal(result.company_ai_processing_authorized, false);
  const preference = await service.getPreference({ accountId: 'account-1', actorType: 'driver', actorId: 'driver-1' });
  assert.equal(preference.ai_processing_consent, false);
});
