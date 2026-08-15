const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-service-role-key';

const {
  createDriverHelpService,
  filterActionableClarificationOptions,
  isRepeatedClarification,
  resolveClarificationFollowUp,
  resolveClarificationSelection
} = require('./driverHelp');

function filterChain(result) {
  const chain = {
    eq() { return chain; },
    maybeSingle() { return Promise.resolve(result); },
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); }
  };
  return chain;
}

function fakeSupabase(records = []) {
  const writes = [];
  return {
    writes,
    storage: {
      from() {
        return { async createSignedUrl() { return { data: null, error: null }; } };
      }
    },
    from(table) {
      if (table === 'driver_help_knowledge_records') {
        return { select() { return Promise.resolve({ data: records, error: null }); } };
      }
      if (table === 'driver_help_sessions') {
        return {
          insert(row) { writes.push({ table, row }); return Promise.resolve({ error: null }); },
          select() { return filterChain({ data: null, error: null }); },
          update(row) { writes.push({ table, row }); return filterChain({ error: null }); }
        };
      }
      return {
        insert(row) { writes.push({ table, row }); return Promise.resolve({ error: null }); },
        upsert(row) { writes.push({ table, row }); return Promise.resolve({ error: null }); }
      };
    }
  };
}

test('short replies resolve only against pending data-authored choices', () => {
  const context = {
    pending_clarification_options: [
      { label: 'Choice one', query: 'sample query one' },
      { label: 'Choice two', query: 'sample query two' }
    ],
    pending_clarification_not_sure_query: 'sample uncertainty query'
  };
  assert.equal(resolveClarificationFollowUp('Choice one', context), 'sample query one');
  assert.equal(resolveClarificationFollowUp('not sure', context), 'sample uncertainty query');
  assert.equal(resolveClarificationFollowUp('new information', context), 'new information');
});

test('clarification selection preserves the offered record identity', () => {
  const option = {
    knowledge_id: 'TEST-PROCEDURE-001',
    version: 1,
    label: 'Sample situation',
    query: 'sample situation details'
  };
  assert.deepEqual(resolveClarificationSelection('Sample situation', {
    pending_clarification_options: [option]
  }), option);
});

test('empty corpus returns and records a fail-closed escalation', async () => {
  const supabase = fakeSupabase([]);
  const service = createDriverHelpService({ supabase, now: () => new Date(0) });
  const response = await service.answerQuestion({
    accountId: '00000000-0000-0000-0000-000000000001',
    driverId: '00000000-0000-0000-0000-000000000002',
    question: 'What should I do?'
  });
  assert.equal(response.response_mode, 'ESCALATE');
  assert.deepEqual(response.trace, []);
  assert.match(response.escalation_message, /does not have a verified answer/i);
  assert.ok(supabase.writes.some((write) => write.table === 'driver_help_unanswered_questions'));
});

test('actionable choices exclude missing and unpublished records', () => {
  const records = [{
    knowledge_id: 'TEST-PROCEDURE-001',
    version: 1,
    status: 'SOURCE_VERIFIED',
    is_published: true,
    canonical_situation: 'Sample situation'
  }];
  const options = [
    { knowledge_id: 'TEST-PROCEDURE-001', version: 1, label: 'Valid' },
    { knowledge_id: 'TEST-MISSING-001', version: 1, label: 'Missing' }
  ];
  assert.deepEqual(filterActionableClarificationOptions(options, records), [options[0]]);
});

test('repeated identical clarification is detected', () => {
  const option = { knowledge_id: 'TEST-PROCEDURE-001', version: 1, label: 'Sample' };
  assert.equal(isRepeatedClarification({
    response_mode: 'CLARIFY',
    clarification_prompt: 'Which sample?',
    clarification_options: [option]
  }, {
    pending_clarification_prompt: 'Which sample?',
    pending_clarification_options: [option]
  }, option), true);
});
