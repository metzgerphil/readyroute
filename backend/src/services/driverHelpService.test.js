const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-service-role-key';

const {
  buildContextualQuestion,
  buildNextSessionContext,
  isClarificationAnswerSufficient,
  createDriverHelpService,
  filterActionableClarificationOptions,
  isRepeatedClarification,
  resolveClarificationFollowUp,
  resolveClarificationSelection
} = require('./driverHelp');

test('clarification answer validation recognizes common fact types', () => {
  assert.equal(isClarificationAnswerSufficient('actual vehicle number', '2387'), true);
  assert.equal(isClarificationAnswerSufficient('actual vehicle number', 'yes'), false);
  assert.equal(isClarificationAnswerSufficient('whether the generator is set to Code 128', 'yes'), true);
  assert.equal(isClarificationAnswerSufficient('why no packages were obtained', 'the shipper had none ready'), true);
  assert.equal(isClarificationAnswerSufficient('why no packages were obtained', 'no'), false);
  assert.equal(isClarificationAnswerSufficient('whether anything was scanned', 'I am not sure'), false);
});

test('clarification replies keep the original situation and accumulated answers', () => {
  const firstContext = buildNextSessionContext({}, 'The vehicle barcode is missing', {
    response_mode: 'CLARIFY',
    selected_records: [],
    candidates: [{ knowledge_id: 'KNO-VEHICLE', version: 1 }],
    clarification_prompt: 'Ready Route Answers needs one detail: actual vehicle number.',
    clarification_options: []
  });
  const secondQuestion = buildContextualQuestion('2387', firstContext);

  assert.match(secondQuestion, /vehicle barcode is missing/i);
  assert.match(secondQuestion, /actual vehicle number/i);
  assert.match(secondQuestion, /2387/);

  const secondContext = buildNextSessionContext(firstContext, '2387', {
    response_mode: 'CLARIFY',
    selected_records: [],
    candidates: [{ knowledge_id: 'KNO-VEHICLE', version: 1 }],
    clarification_prompt: 'Ready Route Answers needs one detail: Is the generator set to Code 128?',
    clarification_options: []
  });
  const thirdQuestion = buildContextualQuestion('yes', secondContext);

  assert.match(thirdQuestion, /vehicle barcode is missing/i);
  assert.match(thirdQuestion, /2387/);
  assert.match(thirdQuestion, /generator set to Code 128/i);
  assert.match(thirdQuestion, /Driver answered: yes/i);
});

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

function knowledgeRecord(overrides = {}) {
  return {
    knowledge_id: 'KNO-PUP-CANCELED-001',
    version: 1,
    status: 'READY_ROUTE_APPROVED',
    is_published: true,
    source_ids: ['SRC-OWNER'],
    canonical_situation: 'A listed pickup is canceled or has no packages',
    normalized_description: 'A driver must distinguish cancellation before an attempt from a closed attempted pickup.',
    taxonomy_paths: ['TAX-PICKUP'],
    applicability: ['A listed pickup was canceled'],
    conditions: ['The selected reason must match whether an attempt occurred'],
    exceptions: [],
    authoritative_rule: 'Use the matching code for what occurred.',
    required_procedure: [{ step: 1, action: 'Confirm whether an attempt occurred.' }],
    required_documentation: [],
    prohibited_actions: ['Do not guess a code.'],
    escalation_requirements: [],
    clarification_requirements: ['Was any attempt made at the pickup location?'],
    driver_question_variants: ['Pickup got canceled'],
    driver_question_patterns: [],
    images: [],
    concise_answer: 'If it was canceled before any attempt, use Code 24.',
    more_info_answer: 'The code depends on whether an attempt occurred.',
    ...overrides
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

test('grounded AI interpretation may select a record but the answer remains canonical record content', async () => {
  const record = knowledgeRecord({
    driver_question_patterns: [{
      utterance: 'Pickup canceled before attempt',
      response_mode: 'DIRECT_SOURCE_GROUNDED_ANSWER',
      must_clarify: [],
      answer_override: { direct_answer: 'Use Code 24.' }
    }]
  });
  const supabase = fakeSupabase([record]);
  let interpretationRequest = null;
  const service = createDriverHelpService({
    supabase,
    now: () => new Date(0),
    aiInterpretationMode: 'ACTIVE',
    aiInterpreter: async (request) => {
      interpretationRequest = request;
      return {
        selection: 'SELECT',
        knowledge_id: record.knowledge_id,
        decision: 'ANSWER',
        clarification_requirement: null,
        confidence: 0.93
      };
    }
  });

  const response = await service.answerQuestion({
    accountId: '00000000-0000-0000-0000-000000000001',
    driverId: '00000000-0000-0000-0000-000000000002',
    question: 'shipper waved me off before i headed over'
  });

  assert.equal(interpretationRequest.candidate_records[0].knowledge_id, record.knowledge_id);
  assert.deepEqual(interpretationRequest.candidate_records[0].driver_question_patterns, [{
    utterance: 'Pickup canceled before attempt',
    response_mode: 'DIRECT_SOURCE_GROUNDED_ANSWER',
    information_sufficiency: null,
    must_clarify: []
  }]);
  assert.match(interpretationRequest.safety_identifier, /^rr_[a-f0-9]+$/);
  assert.equal(interpretationRequest.safety_identifier.length, 64);
  assert.equal(response.response_mode, 'ANSWER');
  assert.equal(response.answer, record.concise_answer);
  assert.equal(response.answer_structure.direct_answer, record.concise_answer);
  assert.equal(response.interpretation_mode, 'GROUNDED_AI');
  assert.equal(response.interpretation_confidence, 0.93);
  assert.equal(response.trace[0].interpretation_mode, 'GROUNDED_AI');
});

test('invalid or unavailable AI interpretation falls back to deterministic retrieval', async () => {
  const record = knowledgeRecord({ clarification_requirements: [] });
  const supabase = fakeSupabase([record]);
  const service = createDriverHelpService({
    supabase,
    now: () => new Date(0),
    aiInterpretationMode: 'ACTIVE',
    aiInterpreter: async () => { throw new Error('provider unavailable'); }
  });

  const response = await service.answerQuestion({
    accountId: '00000000-0000-0000-0000-000000000001',
    driverId: '00000000-0000-0000-0000-000000000002',
    question: 'cancelled before i went to the pickup'
  });

  assert.equal(response.response_mode, 'ANSWER');
  assert.equal(response.answer, record.concise_answer);
  assert.equal(response.interpretation_mode, 'DETERMINISTIC_FALLBACK');
});

test('exact data-authored driver wording bypasses AI interpretation', async () => {
  const record = knowledgeRecord({ clarification_requirements: [] });
  const supabase = fakeSupabase([record]);
  let calls = 0;
  const service = createDriverHelpService({
    supabase,
    now: () => new Date(0),
    aiInterpreter: async () => { calls += 1; return null; }
  });

  const response = await service.answerQuestion({
    accountId: '00000000-0000-0000-0000-000000000001',
    driverId: '00000000-0000-0000-0000-000000000002',
    question: 'Pickup got canceled'
  });

  assert.equal(response.response_mode, 'ANSWER');
  assert.equal(response.interpretation_mode, 'DETERMINISTIC');
  assert.equal(calls, 0);
});

test('shadow mode records the AI proposal without changing the deterministic driver answer', async () => {
  const deterministicRecord = knowledgeRecord({
    knowledge_id: 'KNO-PUP-CANCELED-001',
    clarification_requirements: [],
    concise_answer: 'Deterministic published answer.'
  });
  const proposedRecord = knowledgeRecord({
    knowledge_id: 'KNO-PUP-ZERO-001',
    canonical_situation: 'A listed pickup has zero packages',
    normalized_description: 'The shipper has no packages at an attempted listed pickup.',
    driver_question_variants: ['Empty pickup'],
    clarification_requirements: [],
    concise_answer: 'AI-selected record answer that must stay hidden in shadow mode.'
  });
  const supabase = fakeSupabase([deterministicRecord, proposedRecord]);
  const service = createDriverHelpService({
    supabase,
    now: () => new Date(0),
    aiInterpretationMode: 'SHADOW',
    aiInterpreter: async () => ({
      selection: 'SELECT',
      knowledge_id: proposedRecord.knowledge_id,
      decision: 'ANSWER',
      clarification_requirement: null,
      confidence: 0.94
    })
  });

  const response = await service.answerQuestion({
    accountId: '00000000-0000-0000-0000-000000000001',
    driverId: '00000000-0000-0000-0000-000000000002',
    question: 'cancelled before i went to the pickup'
  });
  const interaction = supabase.writes.find((write) => write.table === 'driver_help_interactions').row;

  assert.equal(response.answer, deterministicRecord.concise_answer);
  assert.equal(response.trace[0].knowledge_id, deterministicRecord.knowledge_id);
  assert.equal(response.interpretation_mode, 'AI_SHADOW');
  assert.equal(interaction.interpretation_mode, 'AI_SHADOW');
  assert.equal(interaction.interpretation_result.status, 'VALID');
  assert.equal(interaction.interpretation_result.proposed_knowledge_id, proposedRecord.knowledge_id);
  assert.equal(interaction.interpretation_result.deterministic_knowledge_id, deterministicRecord.knowledge_id);
  assert.equal(interaction.interpretation_result.record_agreement, false);
});

test('manager test console may activate grounded interpretation without changing the service default', async () => {
  const record = knowledgeRecord({
    clarification_requirements: ['Was any attempt made at the pickup location?'],
    concise_answer: 'Use the controlled published answer.'
  });
  const supabase = fakeSupabase([record]);
  const service = createDriverHelpService({
    supabase,
    now: () => new Date(0),
    aiInterpretationMode: 'SHADOW',
    aiInterpreter: async () => ({
      selection: 'SELECT',
      knowledge_id: record.knowledge_id,
      decision: 'ANSWER',
      clarification_requirement: null,
      confidence: 0.97
    })
  });

  const response = await service.answerQuestion({
    accountId: '00000000-0000-0000-0000-000000000001',
    driverId: null,
    actorType: 'manager',
    actorId: '00000000-0000-0000-0000-000000000003',
    question: 'shipper waved me off before I headed over',
    aiInterpretationModeOverride: 'ACTIVE'
  });

  assert.equal(response.response_mode, 'ANSWER');
  assert.equal(response.answer, record.concise_answer);
  assert.equal(response.interpretation_mode, 'GROUNDED_AI');
});

test('an exact data-authored clarification cannot be overridden by AI', async () => {
  const record = knowledgeRecord({
    driver_question_patterns: [{
      utterance: 'Pickup is canceled',
      response_mode: 'ASK_MINIMUM_CLARIFICATION',
      must_clarify: ['Was any attempt made at the pickup location?']
    }]
  });
  const supabase = fakeSupabase([record]);
  let calls = 0;
  const service = createDriverHelpService({
    supabase,
    now: () => new Date(0),
    aiInterpreter: async () => { calls += 1; return null; }
  });

  const response = await service.answerQuestion({
    accountId: '00000000-0000-0000-0000-000000000001',
    driverId: '00000000-0000-0000-0000-000000000002',
    question: 'Pickup is canceled'
  });

  assert.equal(response.response_mode, 'CLARIFY');
  assert.match(response.clarification_prompt, /Was any attempt made/);
  assert.equal(response.interpretation_mode, 'DETERMINISTIC');
  assert.equal(calls, 0);
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
