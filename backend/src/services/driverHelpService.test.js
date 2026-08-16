const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-service-role-key';

const {
  answerMemoryRiskTier,
  answerMemoryRouteKey,
  buildContextualQuestion,
  buildDeterministicRuntimeDecision,
  buildNextSessionContext,
  isClarificationAnswerSufficient,
  createDriverHelpService,
  filterActionableClarificationOptions,
  isRepeatedClarification,
  resolveClarificationFollowUp,
  resolveClarificationSelection
} = require('./driverHelp');

test('answer memory normalizes equivalent repeated wording and protects high-risk routes', () => {
  assert.equal(
    answerMemoryRouteKey('“The business is closed.”'),
    answerMemoryRouteKey('the business is closed')
  );
  assert.equal(answerMemoryRiskTier('KNO-DEL-BUS-CLOSED-001'), 'STANDARD');
  assert.equal(answerMemoryRiskTier('KNO-DEL-SIG-ASR-001'), 'HIGH');
  assert.equal(answerMemoryRiskTier('KNO-SEC-ROUTE-001'), 'HIGH');
});

test('clarification answer validation recognizes common fact types', () => {
  assert.equal(isClarificationAnswerSufficient('actual vehicle number', '2387'), true);
  assert.equal(isClarificationAnswerSufficient('actual vehicle number', 'yes'), false);
  assert.equal(isClarificationAnswerSufficient('whether the generator is set to Code 128', 'yes'), true);
  assert.equal(isClarificationAnswerSufficient('why no packages were obtained', 'the shipper had none ready'), true);
  assert.equal(isClarificationAnswerSufficient('why no packages were obtained', 'no'), false);
  assert.equal(isClarificationAnswerSufficient('whether anything was scanned', 'I am not sure'), false);
  assert.equal(
    isClarificationAnswerSufficient(
      'Is this an ordinary delivery, ASR or ID refusal, call tag, or COD payment refusal?',
      'It is an ordinary delivery'
    ),
    true
  );
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

test('structured AI facts are retained for the next turn', () => {
  const context = buildNextSessionContext({}, 'The business is closed and I got zero packages', {
    response_mode: 'ANSWER',
    selected_records: [],
    candidates: [],
    interpretation_result: {
      facts: {
        operational_area: 'PICKUP',
        attempt_made: 'YES',
        location_closed: 'YES',
        packages_obtained: 'ZERO'
      }
    }
  });

  assert.equal(context.interpretation_facts.attempt_made, 'YES');
  assert.equal(context.interpretation_facts.location_closed, 'YES');
  assert.equal(context.interpretation_facts.packages_obtained, 'ZERO');
});

test('obvious follow-ups retain the answered situation without carrying unrelated questions', () => {
  const context = {
    last_response_mode: 'ANSWER',
    last_question: 'The scanner technology failed during my pickup'
  };

  assert.equal(
    buildContextualQuestion('What details do I give the station', context),
    'The scanner technology failed during my pickup. Driver follow-up: What details do I give the station'
  );
  assert.equal(
    buildContextualQuestion('It is a business', context),
    'The scanner technology failed during my pickup. Driver follow-up: It is a business'
  );
  assert.equal(
    buildContextualQuestion('Where is that in FORGE', context),
    'The scanner technology failed during my pickup. Driver follow-up: Where is that in FORGE'
  );
  assert.equal(
    buildContextualQuestion('I lost it', context),
    'The scanner technology failed during my pickup. Driver follow-up: I lost it'
  );
  assert.equal(
    buildContextualQuestion('One amount was prefilled', {
      last_response_mode: 'ANSWER',
      last_question: 'I have three COD packages at one stop'
    }),
    'I have three COD packages at one stop. Driver follow-up: One amount was prefilled'
  );
  assert.equal(
    buildContextualQuestion('The HAL stop was already closed when FedEx Office refused it', context),
    'The HAL stop was already closed when FedEx Office refused it'
  );
  assert.equal(
    buildContextualQuestion('A dog is loose in the yard', context),
    'A dog is loose in the yard'
  );
});

test('a short badge-state reply satisfies the pending badge clarification', () => {
  assert.equal(
    isClarificationAnswerSufficient('Was the badge forgotten, lost, or found after replacement?', 'I lost it'),
    true
  );
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
  const selects = [];
  return {
    writes,
    selects,
    storage: {
      from() {
        return { async createSignedUrl() { return { data: null, error: null }; } };
      }
    },
    from(table) {
      if (table === 'driver_help_knowledge_records') {
        return {
          select(columns) {
            selects.push({ table, columns });
            return Promise.resolve({ data: records, error: null });
          }
        };
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

function memorySupabase(records, memoryRoute) {
  const base = fakeSupabase(records);
  const originalFrom = base.from.bind(base);
  base.rpc = async (name, args) => {
    base.writes.push({ table: 'rpc', name, args });
    return { data: null, error: null };
  };
  base.from = (table) => {
    if (table === 'driver_help_answer_memory') {
      return {
        select() {
          return filterChain({ data: memoryRoute, error: null });
        }
      };
    }
    return originalFrom(table);
  };
  return base;
}

test('database retrieval includes related record links used by clarification branch switching', async () => {
  const supabase = fakeSupabase([]);
  const service = createDriverHelpService({ supabase, now: () => new Date(0) });

  await service.loadKnowledgeRecords();

  const selection = supabase.selects.find((item) => item.table === 'driver_help_knowledge_records');
  assert.match(selection.columns, /related_knowledge_ids/);
});

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

test('an active exact answer-memory route bypasses AI and still renders published record content', async () => {
  const record = knowledgeRecord({
    knowledge_id: 'KNO-DEL-BUS-CLOSED-001',
    canonical_situation: 'A business is closed and no recipient is available',
    concise_answer: 'Use Code 004 when the closed business has no authorized release path.'
  });
  const question = 'The business is locked and nobody is there';
  const supabase = memorySupabase([record], {
    route_key: answerMemoryRouteKey(question),
    knowledge_id: record.knowledge_id,
    knowledge_version: record.version,
    response_mode: 'ANSWER',
    answer_pattern_id: null,
    clarification_requirement: null,
    interpreted_facts: { operational_area: 'DELIVERY', stop_type: 'NON_RESIDENTIAL' },
    risk_tier: 'STANDARD',
    status: 'ACTIVE',
    agreement_count: 2
  });
  let aiCalls = 0;
  const service = createDriverHelpService({
    supabase,
    aiInterpretationMode: 'ACTIVE',
    aiInterpreter: async () => { aiCalls += 1; return null; }
  });

  const response = await service.answerQuestion({
    accountId: '00000000-0000-0000-0000-000000000001',
    driverId: null,
    actorType: 'manager',
    actorId: '00000000-0000-0000-0000-000000000002',
    question,
    includeDiagnostics: true
  });

  assert.equal(aiCalls, 0);
  assert.equal(response.interpretation_mode, 'LEARNED_ROUTE');
  assert.equal(response.interpretation_result.ai_bypassed, true);
  assert.equal(response.interpretation_result.usage.estimated_cost_usd, 0);
  assert.equal(response.trace[0].knowledge_id, record.knowledge_id);
  assert.match(response.answer, /Code 004/);
  assert.ok(supabase.writes.some((write) => (
    write.name === 'record_driver_help_answer_memory_reuse'
  )));
});

test('a sampled answer-memory audit keeps an agreeing route active and records the audit', async () => {
  const record = knowledgeRecord({
    knowledge_id: 'KNO-DEL-BUS-CLOSED-001',
    canonical_situation: 'A business is closed and no recipient is available',
    driver_question_variants: ['The business is locked and nobody is there'],
    clarification_requirements: [],
    concise_answer: 'Use Code 004 when the closed business has no authorized release path.'
  });
  const question = 'The business is locked and nobody is there';
  const supabase = memorySupabase([record], {
    route_key: answerMemoryRouteKey(question),
    knowledge_id: record.knowledge_id,
    knowledge_version: record.version,
    response_mode: 'ANSWER',
    answer_pattern_id: null,
    clarification_requirement: null,
    interpreted_facts: {},
    risk_tier: 'STANDARD',
    status: 'ACTIVE',
    agreement_count: 3
  });
  const service = createDriverHelpService({
    supabase,
    aiInterpretationMode: 'ACTIVE',
    answerMemoryAuditRate: 0.05,
    random: () => 0,
    aiInterpreter: async () => ({
      selection: 'SELECT',
      knowledge_id: record.knowledge_id,
      decision: 'ANSWER',
      clarification_requirement: null,
      confidence: 0.99
    })
  });

  const response = await service.answerQuestion({
    accountId: '00000000-0000-0000-0000-000000000001',
    driverId: null,
    actorType: 'manager',
    actorId: '00000000-0000-0000-0000-000000000002',
    question,
    includeDiagnostics: true
  });

  assert.equal(response.interpretation_mode, 'LEARNED_ROUTE');
  assert.equal(response.interpretation_result.ai_bypassed, false);
  assert.equal(response.interpretation_result.memory_audit.outcome, 'AGREE');
  assert.ok(supabase.writes.some((write) => (
    write.name === 'record_driver_help_answer_memory_audit'
    && write.args.p_outcome === 'AGREE'
  )));
  assert.ok(supabase.writes.some((write) => write.name === 'record_driver_help_answer_memory_reuse'));
});

test('a sampled answer-memory disagreement suspends memory and serves the AI-selected published record', async () => {
  const rememberedRecord = knowledgeRecord({
    knowledge_id: 'KNO-DEL-BUS-CLOSED-001',
    canonical_situation: 'A business is closed and no recipient is available',
    driver_question_variants: ['The stop is closed'],
    clarification_requirements: [],
    concise_answer: 'Use Code 004.'
  });
  const correctedRecord = knowledgeRecord({
    knowledge_id: 'KNO-PUP-CANCELED-001',
    canonical_situation: 'A pickup was canceled before an attempt',
    driver_question_variants: ['The stop is closed'],
    clarification_requirements: [],
    concise_answer: 'Use Code 24.'
  });
  const question = 'The stop is closed';
  const supabase = memorySupabase([rememberedRecord, correctedRecord], {
    route_key: answerMemoryRouteKey(question),
    knowledge_id: rememberedRecord.knowledge_id,
    knowledge_version: rememberedRecord.version,
    response_mode: 'ANSWER',
    answer_pattern_id: null,
    clarification_requirement: null,
    interpreted_facts: {},
    risk_tier: 'STANDARD',
    status: 'ACTIVE',
    agreement_count: 3
  });
  const service = createDriverHelpService({
    supabase,
    aiInterpretationMode: 'ACTIVE',
    answerMemoryAuditRate: 0.05,
    random: () => 0,
    aiInterpreter: async () => ({
      selection: 'SELECT',
      knowledge_id: correctedRecord.knowledge_id,
      decision: 'ANSWER',
      clarification_requirement: null,
      confidence: 0.97
    })
  });

  const response = await service.answerQuestion({
    accountId: '00000000-0000-0000-0000-000000000001',
    driverId: null,
    actorType: 'manager',
    actorId: '00000000-0000-0000-0000-000000000002',
    question,
    includeDiagnostics: true
  });

  assert.equal(response.interpretation_mode, 'GROUNDED_AI');
  assert.equal(response.trace[0].knowledge_id, correctedRecord.knowledge_id);
  assert.equal(response.interpretation_result.memory_audit.outcome, 'DISAGREE');
  assert.ok(supabase.writes.some((write) => (
    write.name === 'record_driver_help_answer_memory_audit'
    && write.args.p_outcome === 'DISAGREE'
  )));
  assert.equal(supabase.writes.some((write) => write.name === 'record_driver_help_answer_memory_reuse'), false);
  assert.equal(supabase.writes.some((write) => write.name === 'observe_driver_help_answer_memory'), false);
});

function referenceRecord(knowledgeId, conciseAnswer, canonicalSituation) {
  return {
    knowledge_id: knowledgeId,
    version: 1,
    status: 'SOURCE_VERIFIED',
    is_published: true,
    source_ids: ['SRC-REFERENCE'],
    taxonomy_paths: ['REFERENCE'],
    canonical_situation: canonicalSituation,
    concise_answer: conciseAnswer,
    images: []
  };
}

test('ordinary record clarifications retain the selected record and resolve a yes or no reply', () => {
  const record = knowledgeRecord({
    driver_question_variants: ['Pickup canceled at the customer location']
  });
  const first = buildDeterministicRuntimeDecision(
    'My pickup was canceled at the customer location',
    [record],
    {}
  );
  assert.equal(first.decision.response_mode, 'CLARIFY');
  assert.deepEqual(first.decision.clarification_plan, [
    'Was any attempt made at the pickup location?'
  ]);

  const context = buildNextSessionContext(
    {},
    'My pickup was canceled at the customer location',
    first.decision
  );
  assert.equal(context.clarification_plan_active, true);
  assert.deepEqual(context.knowledge_ids, [record.knowledge_id]);

  const second = buildDeterministicRuntimeDecision('yes', [record], context);
  assert.equal(second.decision.response_mode, 'ANSWER');
  assert.equal(second.decision.selected_records[0].knowledge_id, record.knowledge_id);
});

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
  assert.equal('driver_question_patterns' in interpretationRequest.candidate_records[0], true);
  assert.equal('answer_override' in interpretationRequest.candidate_records[0].driver_question_patterns[0], false);
  assert.match(interpretationRequest.safety_identifier, /^rr_[a-f0-9]+$/);
  assert.equal(interpretationRequest.safety_identifier.length, 64);
  assert.equal(response.response_mode, 'ANSWER');
  assert.equal(response.answer, record.concise_answer);
  assert.equal(response.answer_structure.direct_answer, record.concise_answer);
  assert.equal(response.interpretation_mode, 'GROUNDED_AI');
  assert.equal(response.interpretation_confidence, 0.93);
  assert.equal(response.trace[0].interpretation_mode, 'GROUNDED_AI');
});

test('AI may select an approved authored answer branch but cannot supply answer prose', async () => {
  const record = knowledgeRecord({
    driver_question_patterns: [{
      utterance: 'Pickup location is closed and zero packages were obtained',
      response_mode: 'DIRECT_SOURCE_GROUNDED_ANSWER',
      must_clarify: [],
      answer_override: {
        direct_answer: 'Use Code 11.',
        steps: ['Open the listed pickup.', 'Choose Close (Zero Pkg).', 'Select Code 11 and tap DONE.'],
        watch_for: 'Use this only for an attempted pickup at a closed location with zero packages.'
      }
    }]
  });
  const supabase = fakeSupabase([record]);
  const service = createDriverHelpService({
    supabase,
    now: () => new Date(0),
    aiInterpretationMode: 'ACTIVE',
    aiInterpreter: async (request) => ({
      selection: 'SELECT',
      knowledge_id: record.knowledge_id,
      decision: 'ANSWER',
      answer_pattern_id: request.candidate_records[0].driver_question_patterns[0].pattern_id,
      clarification_requirement: null,
      confidence: 0.99
    })
  });

  const response = await service.answerQuestion({
    accountId: '00000000-0000-0000-0000-000000000001',
    driverId: '00000000-0000-0000-0000-000000000002',
    question: 'The place is locked and I came away with no boxes',
    includeDiagnostics: true
  });

  assert.equal(response.answer, 'Use Code 11.');
  assert.equal(response.answer_structure.direct_answer, 'Use Code 11.');
  assert.deepEqual(response.answer_structure.steps, [
    'Open the listed pickup.',
    'Choose Close (Zero Pkg).',
    'Select Code 11 and tap DONE.'
  ]);
  assert.equal(response.interpretation_result.proposed_answer_pattern_id, `${record.knowledge_id}::0`);
});

test('AI-selected signature clarification presents ASR DSR and ISR buttons', async () => {
  const signatureRequirement = 'What signature service does FORGE show?';
  const records = [
    ['KNO-DEL-SIG-ASR-001', 'Adult Signature Required'],
    ['KNO-DEL-SIG-DSR-001', 'Direct Signature Required'],
    ['KNO-DEL-SIG-ISR-001', 'Indirect Signature Required']
  ].map(([knowledgeId, label]) => knowledgeRecord({
    knowledge_id: knowledgeId,
    canonical_situation: `Delivering an ${label} package`,
    taxonomy_paths: ['TAX-DELIVERY', 'TAX-DELIVERY/TAX-SIGNATURE'],
    clarification_requirements: [signatureRequirement]
  }));
  const supabase = fakeSupabase(records);
  const service = createDriverHelpService({
    supabase,
    now: () => new Date(0),
    aiInterpretationMode: 'ACTIVE',
    aiInterpreter: async () => ({
      selection: 'SELECT',
      knowledge_id: 'KNO-DEL-SIG-DSR-001',
      decision: 'CLARIFY',
      clarification_requirement: signatureRequirement,
      confidence: 0.98
    })
  });

  const response = await service.answerQuestion({
    accountId: '00000000-0000-0000-0000-000000000001',
    driverId: '00000000-0000-0000-0000-000000000002',
    question: 'I have a signature package and nobody is home'
  });

  assert.equal(response.response_mode, 'CLARIFY');
  assert.match(response.clarification_prompt, /What signature service/);
  assert.deepEqual(response.clarification_options.map((option) => option.query), ['ASR', 'DSR', 'ISR']);
});

test('grounded AI receives a relevant bounded shortlist instead of the full corpus', async () => {
  const records = Array.from({ length: 55 }, (_, index) => knowledgeRecord({
    knowledge_id: `KNO-TEST-${String(index + 1).padStart(3, '0')}`,
    canonical_situation: `Test situation ${index + 1}`,
    normalized_description: `Distinct operational condition ${index + 1}`,
    driver_question_variants: [`Authored wording ${index + 1}`],
    clarification_requirements: []
  }));
  const target = records.at(-1);
  target.driver_question_variants = ['A completely natural paraphrase that needs semantic interpretation'];
  const supabase = fakeSupabase(records);
  let candidateIds = [];
  const service = createDriverHelpService({
    supabase,
    now: () => new Date(0),
    aiInterpretationMode: 'ACTIVE',
    aiInterpreter: async (request) => {
      candidateIds = request.candidate_records.map((candidate) => candidate.knowledge_id);
      return {
        selection: 'SELECT',
        knowledge_id: target.knowledge_id,
        decision: 'ANSWER',
        clarification_requirement: null,
        confidence: 0.95
      };
    }
  });

  const response = await service.answerQuestion({
    accountId: '00000000-0000-0000-0000-000000000001',
    driverId: '00000000-0000-0000-0000-000000000002',
    question: 'A completely natural paraphrase that needs semantic interpretation'
  });

  assert.ok(candidateIds.length <= 16);
  assert.ok(candidateIds.length < records.length);
  assert.equal(candidateIds.includes(target.knowledge_id), true);
  assert.equal(response.trace[0].knowledge_id, target.knowledge_id);
});

test('before or after dispatch clarification uses meaningful options and understands a natural reply', () => {
  const context = {
    pending_clarification_requirement: 'Was the package discovered before or after dispatch?',
    pending_clarification_options: [
      {
        knowledge_id: 'KNO-FORGE-MANIFEST-PREVIEW-001',
        label: 'Before dispatch',
        query: 'before dispatch package is on the wrong route'
      },
      {
        knowledge_id: 'KNO-DEL-MISLOAD-AFTERDISPATCH-001',
        label: 'After dispatch',
        query: 'found another route package after dispatch'
      }
    ]
  };

  assert.equal(
    resolveClarificationSelection('It was before dispatch', context).knowledge_id,
    'KNO-FORGE-MANIFEST-PREVIEW-001'
  );
  assert.equal(
    resolveClarificationSelection('after', context).knowledge_id,
    'KNO-DEL-MISLOAD-AFTERDISPATCH-001'
  );
});

test('completed-photo clarification maps to the approved completed-delivery branch', () => {
  const ppod = knowledgeRecord({
    knowledge_id: 'KNO-DEL-PPOD-001',
    canonical_situation: 'Photographic proof of delivery and unsuccessful-attempt photos',
    clarification_requirements: ['Is this a completed delivery photo or an unsuccessful-attempt photo?'],
    driver_question_patterns: [{
      utterance: 'What should my delivery photo show?',
      response_mode: 'DIRECT_SOURCE_GROUNDED_ANSWER',
      must_clarify: [],
      answer_override: {
        direct_answer: 'Show the package in its release location.',
        steps: ['Capture the package at the actual release location.'],
        watch_for: 'Do not use a blurry image.'
      }
    }]
  });
  const context = {
    pending_clarification_requirement: 'Is this a completed delivery photo or an unsuccessful-attempt photo?',
    pending_clarification_options: [{
      knowledge_id: ppod.knowledge_id,
      version: 1,
      label: 'Completed delivery photo',
      query: 'What should my delivery photo show?'
    }]
  };
  const result = buildDeterministicRuntimeDecision('completed delivery photo', [ppod], context);

  assert.equal(result.decision.response_mode, 'ANSWER');
  assert.equal(result.decision.answer_structure.direct_answer, 'Show the package in its release location.');
  assert.deepEqual(result.decision.answer_structure.steps, [
    'Capture the package at the actual release location.'
  ]);
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

test('provider timeout cannot turn a signature-required package into shipper release', async () => {
  const record = knowledgeRecord({
    knowledge_id: 'KNO-DEL-SHIPPER-RELEASE-001',
    canonical_situation: 'Shipper-authorized release shown in FORGE',
    normalized_description: 'Verbal permission is not authorization and signature services cannot use shipper release.',
    taxonomy_paths: ['TAX-DELIVERY'],
    clarification_requirements: [],
    driver_question_variants: ['Customer says the shipper told them I can leave it'],
    driver_question_patterns: [{
      utterance: 'The customer says the shipper told them I can just leave it, no signature needed. Is that true?',
      response_mode: 'DIRECT_SOURCE_GROUNDED_ANSWER',
      must_clarify: [],
      answer_override: {
        direct_answer: 'No. A customer statement is not shipper-release authorization.',
        steps: ['Follow the package’s signature requirement.'],
        watch_for: 'Do not substitute verbal permission for FORGE authorization.'
      }
    }],
    concise_answer: 'Release only when FORGE explicitly authorizes a no-signature-service package.'
  });
  const service = createDriverHelpService({
    supabase: fakeSupabase([record]),
    now: () => new Date(0),
    aiInterpretationMode: 'ACTIVE',
    aiInterpreter: async () => { throw new Error('provider timeout'); }
  });

  const response = await service.answerQuestion({
    accountId: '00000000-0000-0000-0000-000000000001',
    driverId: '00000000-0000-0000-0000-000000000002',
    question: 'The package says signature required, but the customer says the shipper told me to leave it.'
  });

  assert.equal(response.response_mode, 'ANSWER');
  assert.equal(response.answer_structure.direct_answer, 'No. A customer statement is not shipper-release authorization.');
  assert.equal(response.interpretation_mode, 'CONTROLLED_FALLBACK');
});

test('controlled delivery-photo clarification survives an AI provider failure', async () => {
  const photoRecord = knowledgeRecord({
    knowledge_id: 'KNO-DEL-PPOD-001',
    canonical_situation: 'Taking a delivery photo',
    normalized_description: 'A driver asks about proof-of-delivery or unsuccessful-attempt photos.',
    driver_question_variants: ['Do I need a delivery photo'],
    clarification_requirements: [
      'Is this a completed delivery photo or an unsuccessful-attempt photo?'
    ]
  });
  const service = createDriverHelpService({
    supabase: fakeSupabase([photoRecord]),
    now: () => new Date(0),
    aiInterpretationMode: 'ACTIVE',
    aiInterpreter: async () => {
      throw new Error('temporary provider failure');
    }
  });

  const response = await service.answerQuestion({
    accountId: '00000000-0000-0000-0000-000000000001',
    driverId: '00000000-0000-0000-0000-000000000002',
    question: 'Do I need to take a picture of this delivery?',
    includeDiagnostics: true
  });

  assert.equal(response.response_mode, 'CLARIFY');
  assert.match(response.clarification_prompt, /completed delivery photo/i);
  assert.equal(response.interpretation_mode, 'CONTROLLED_FALLBACK');
  assert.equal(response.interpretation_result.status, 'ERROR');
});

test('active AI interprets exact data-authored wording instead of accepting a keyword match blindly', async () => {
  const record = knowledgeRecord({ clarification_requirements: [] });
  const supabase = fakeSupabase([record]);
  let calls = 0;
  const service = createDriverHelpService({
    supabase,
    now: () => new Date(0),
    aiInterpretationMode: 'ACTIVE',
    aiInterpreter: async () => {
      calls += 1;
      return {
        selection: 'SELECT',
        knowledge_id: record.knowledge_id,
        decision: 'ANSWER',
        clarification_requirement: null,
        confidence: 0.98
      };
    }
  });

  const response = await service.answerQuestion({
    accountId: '00000000-0000-0000-0000-000000000001',
    driverId: '00000000-0000-0000-0000-000000000002',
    question: 'Pickup got canceled'
  });

  assert.equal(response.response_mode, 'ANSWER');
  assert.equal(response.interpretation_mode, 'GROUNDED_AI');
  assert.equal(calls, 1);
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
      confidence: 0.94,
      provider_metadata: {
        response_id: 'resp_shadow_test',
        request_id: 'req_shadow_test',
        usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 }
      }
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
  assert.equal(interaction.interpretation_result.provider_response_id, 'resp_shadow_test');
  assert.equal(interaction.interpretation_result.usage.input_tokens, 100);
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

test('active AI can select the approved clarification branch for exact authored wording', async () => {
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
    aiInterpretationMode: 'ACTIVE',
    aiInterpreter: async () => {
      calls += 1;
      return {
        selection: 'SELECT',
        knowledge_id: record.knowledge_id,
        decision: 'CLARIFY',
        clarification_requirement: 'Was any attempt made at the pickup location?',
        confidence: 0.98
      };
    }
  });

  const response = await service.answerQuestion({
    accountId: '00000000-0000-0000-0000-000000000001',
    driverId: '00000000-0000-0000-0000-000000000002',
    question: 'Pickup is canceled'
  });

  assert.equal(response.response_mode, 'CLARIFY');
  assert.match(response.clarification_prompt, /Was any attempt made/);
  assert.equal(response.interpretation_mode, 'GROUNDED_AI');
  assert.equal(calls, 1);
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

test('actionable choices preserve published delivery and pickup reference options', () => {
  const records = [{
    knowledge_id: 'DELIVERY_STATUS:024',
    version: 1,
    status: 'SOURCE_VERIFIED',
    is_published: true,
    canonical_situation: 'Delivery Code 024'
  }, {
    knowledge_id: 'PICKUP_REASON:24',
    version: 1,
    status: 'SOURCE_VERIFIED',
    is_published: true,
    canonical_situation: 'Pickup Code 24'
  }];
  const options = records.map((record) => ({
    knowledge_id: record.knowledge_id,
    version: record.version,
    label: record.canonical_situation
  }));
  assert.deepEqual(filterActionableClarificationOptions(options, records), options);
});

test('full service path resolves a trailing code category without unnecessary clarification', async () => {
  const records = [
    referenceRecord('DELIVERY_STATUS:024', 'Code 024: Call tag package not ready.', 'Call tag package not ready'),
    referenceRecord('PICKUP_REASON:24', 'Code 24: Canceled before an attempt.', 'Pickup canceled before an attempt')
  ];
  const service = createDriverHelpService({ supabase: fakeSupabase(records), now: () => new Date(0) });
  const response = await service.answerQuestion({
    accountId: '00000000-0000-0000-0000-000000000001',
    driverId: '00000000-0000-0000-0000-000000000002',
    question: 'code 24 pickup?'
  });

  assert.equal(response.response_mode, 'ANSWER');
  assert.equal(response.answer, 'Code 24: Canceled before an attempt.');
  assert.equal(response.trace[0].knowledge_id, 'PICKUP_REASON:24');
});

test('full service path returns actionable category choices and each choice resolves', async () => {
  const records = [
    referenceRecord('DELIVERY_STATUS:024', 'Code 024: Call tag package not ready.', 'Call tag package not ready'),
    referenceRecord('PICKUP_REASON:24', 'Code 24: Canceled before an attempt.', 'Pickup canceled before an attempt')
  ];
  const service = createDriverHelpService({ supabase: fakeSupabase(records), now: () => new Date(0) });
  const clarification = await service.answerQuestion({
    accountId: '00000000-0000-0000-0000-000000000001',
    driverId: '00000000-0000-0000-0000-000000000002',
    question: 'what is code 24'
  });

  assert.equal(clarification.response_mode, 'CLARIFY');
  assert.match(clarification.clarification_prompt, /delivery code or the pickup code/i);
  assert.deepEqual(
    clarification.clarification_options.map((option) => option.knowledge_id).sort(),
    ['DELIVERY_STATUS:024', 'PICKUP_REASON:24']
  );

  for (const option of clarification.clarification_options) {
    const resolved = await service.answerQuestion({
      accountId: '00000000-0000-0000-0000-000000000001',
      driverId: '00000000-0000-0000-0000-000000000002',
      question: option.query
    });
    assert.equal(resolved.response_mode, 'ANSWER');
    assert.equal(resolved.trace[0].knowledge_id, option.knowledge_id);
  }
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

  assert.equal(isRepeatedClarification({
    response_mode: 'CLARIFY',
    clarification_prompt: 'Was it already delivered?',
    clarification_options: []
  }, {
    pending_clarification_prompt: 'Was it already delivered?',
    pending_clarification_options: []
  }), true);
});

test('production-equivalent routing keeps operational code questions and later reference categories separate', () => {
  const operational = knowledgeRecord({
    knowledge_id: 'KNO-DEL-SECURITY-NODELIVERY-001',
    taxonomy_paths: ['TAX-DELIVERY'],
    canonical_situation: 'Security inspection or restriction at a delivery location',
    driver_question_variants: ['Security has to inspect my vehicle before they let me deliver'],
    driver_question_patterns: [{
      utterance: 'Security has to inspect my vehicle before they let me deliver. Should I use Code 001?',
      response_mode: 'DIRECT_SOURCE_GROUNDED_ANSWER',
      must_clarify: [],
      answer_override: {
        direct_answer: 'Do not use Code 001 just because an allowed security inspection is required.',
        steps: ['Follow the permitted inspection process.'],
        watch_for: 'Use Code 001 only if security prevents delivery.'
      }
    }],
    clarification_requirements: []
  });
  const delivery = referenceRecord(
    'DELIVERY_STATUS:001',
    'Code 001: Increased Security - No Delivery.',
    'delivery status 001'
  );
  const pickup = referenceRecord(
    'PICKUP_REASON:01',
    'Code 01: Missed Pickup - DNA.',
    'pickup reason 01'
  );
  const records = [operational, delivery, pickup];

  const first = buildDeterministicRuntimeDecision(
    'Security has to inspect my vehicle before they let me deliver. Should I use Code 001?',
    records,
    {}
  );
  assert.equal(first.decision.selected_records[0].knowledge_id, operational.knowledge_id);

  const context = buildNextSessionContext({}, 'Security inspection question', first.decision);
  const second = buildDeterministicRuntimeDecision(
    'what is delivery status code 001',
    records,
    context
  );
  assert.equal(second.decision.response_mode, 'ANSWER');
  assert.equal(second.decision.selected_records[0].knowledge_id, 'DELIVERY_STATUS:001');
});
