const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-service-role-key';

const {
  answerMemoryRiskTier,
  answerMemoryRouteKey,
  buildAiFacingQuestion,
  buildContextualQuestion,
  buildDeterministicRuntimeDecision,
  buildNextSessionContext,
  extractDriverUtterance,
  isClarificationAnswerSufficient,
  createDriverHelpService,
  filterActionableClarificationOptions,
  isGlossaryQuestion,
  matchesKnownUnapprovedQuestion,
  isRepeatedClarification,
  resolveClarificationFollowUp,
  resolveClarificationSelection
} = require('./driverHelp');

test('only Vlad questions still marked unresolved are forced to fail closed before AI selection', () => {
  for (const question of [
    'A customer wants me to accept cash for shipping charges.',
    'What does OSA mean?',
    "Can I open a customer's package to inspect what is inside?"
  ]) assert.equal(matchesKnownUnapprovedQuestion(question), true, question);

  for (const question of [
    'Smoke is coming from the van. What do I do?',
    'My scanner froze during the route.',
    'What does DNA mean?',
    'What does OP-201 mean?',
    'What is a service cross?'
  ]) assert.equal(matchesKnownUnapprovedQuestion(question), false, question);
});

test('reply framing is removed before a short follow-up is interpreted', () => {
  assert.equal(extractDriverUtterance('My answer is: Yes'), 'Yes');
  assert.equal(extractDriverUtterance('Driver answered: it was closed'), 'it was closed');
  assert.equal(
    extractDriverUtterance('I asked the question: “Where is that in FORGE?”'),
    'Where is that in FORGE?'
  );

  const context = buildNextSessionContext({
    last_response_mode: 'CLARIFY',
    last_question: 'My pickup was canceled',
    situation_question: 'My pickup was canceled',
    pending_clarification_prompt: 'Ready Route Answers needs one detail: Was any attempt made?',
    pending_clarification_requirement: 'Was any attempt made?',
    clarification_plan_active: true,
    remaining_clarification_requirements: ['Was any attempt made?'],
    answered_clarification_requirements: []
  }, 'My answer is: No', {
    response_mode: 'ANSWER',
    selected_records: [],
    candidates: []
  });

  assert.equal(context.last_question, 'No');
  assert.deepEqual(context.answered_clarification_requirements, ['Was any attempt made?']);
});

test('answer memory normalizes equivalent repeated wording and protects high-risk routes', () => {
  assert.equal(
    answerMemoryRouteKey('“The business is closed.”'),
    answerMemoryRouteKey('the business is closed')
  );
  assert.equal(answerMemoryRiskTier('KNO-DEL-BUS-CLOSED-001'), 'STANDARD');
  assert.equal(answerMemoryRiskTier('KNO-DEL-SIG-ASR-001'), 'HIGH');
  assert.equal(answerMemoryRiskTier('KNO-SEC-ROUTE-001'), 'HIGH');
});

test('AI-facing wording treats a terse incident as an implicit request but preserves follow-up answers', () => {
  assert.equal(buildAiFacingQuestion('Dog bit me'), 'Dog bit me. What should I do?');
  assert.equal(buildAiFacingQuestion('What does WA mean?'), 'What does WA mean?');
  assert.equal(buildAiFacingQuestion('Yes', {
    pending_clarification_prompt: 'Was the package recovered?'
  }), 'Yes');
  assert.equal(isGlossaryQuestion('What does DNA mean?'), true);
  assert.equal(isGlossaryQuestion('What should I do with this package?'), false);
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
  const firstContext = buildNextSessionContext({}, 'The listed pickup is closed', {
    response_mode: 'CLARIFY',
    selected_records: [],
    candidates: [{ knowledge_id: 'KNO-PICKUP', version: 1 }],
    clarification_prompt: 'Ready Route Answers needs one detail: Was an attempt made?',
    clarification_options: []
  });
  const secondQuestion = buildContextualQuestion('yes', firstContext);

  assert.match(secondQuestion, /listed pickup is closed/i);
  assert.match(secondQuestion, /attempt made/i);
  assert.match(secondQuestion, /yes/i);

  const secondContext = buildNextSessionContext(firstContext, 'yes', {
    response_mode: 'CLARIFY',
    selected_records: [],
    candidates: [{ knowledge_id: 'KNO-PICKUP', version: 1 }],
    clarification_prompt: 'Ready Route Answers needs one detail: Were any packages obtained?',
    clarification_options: []
  });
  const thirdQuestion = buildContextualQuestion('none', secondContext);

  assert.match(thirdQuestion, /listed pickup is closed/i);
  assert.match(thirdQuestion, /attempt made/i);
  assert.match(thirdQuestion, /packages obtained/i);
  assert.match(thirdQuestion, /Driver answered: none/i);
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
    buildContextualQuestion('What do I do with the door tag?', {
      last_response_mode: 'ANSWER',
      last_question: 'ISR',
      situation_question: 'I have an ISR package with a signed door tag on file'
    }),
    'I have an ISR package with a signed door tag on file. Driver follow-up: What do I do with the door tag?'
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

test('answered clarification details remain available to later follow-ups', () => {
  const context = {
    last_response_mode: 'ANSWER',
    last_question: 'DSR',
    situation_question: 'I have a signature package, but nobody is home',
    clarification_history: [{
      prompt: 'What signature service does FORGE show?',
      answer: 'DSR'
    }]
  };

  const signatureFollowUp = buildContextualQuestion(
    'Can I use the signed door tag they left?',
    context
  );
  assert.match(signatureFollowUp, /nobody is home/i);
  assert.match(signatureFollowUp, /Driver answered: DSR/i);

  const codeFollowUp = buildContextualQuestion('What code should I use?', {
    ...context,
    situation_question: 'I found another-route freight',
    clarification_history: [{ prompt: 'Before or after dispatch?', answer: 'After dispatch' }]
  });
  assert.match(codeFollowUp, /After dispatch/i);
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
  base.memoryReads = 0;
  const originalFrom = base.from.bind(base);
  base.rpc = async (name, args) => {
    base.writes.push({ table: 'rpc', name, args });
    return { data: null, error: null };
  };
  base.from = (table) => {
    if (table === 'driver_help_answer_memory') {
      return {
        select() {
          base.memoryReads += 1;
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

test('active AI ignores answer memory and requires a fresh grounded interpretation', async () => {
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
  let aiQuestion = null;
  const service = createDriverHelpService({
    supabase,
    aiInterpretationMode: 'ACTIVE',
    aiInterpreter: async (request) => {
      aiCalls += 1;
      aiQuestion = request.driver_question;
      return {
        selection: 'SELECT',
        knowledge_id: record.knowledge_id,
        decision: 'ANSWER',
        clarification_requirement: null,
        confidence: 0.99
      };
    }
  });

  const response = await service.answerQuestion({
    accountId: '00000000-0000-0000-0000-000000000001',
    driverId: null,
    actorType: 'manager',
    actorId: '00000000-0000-0000-0000-000000000002',
    question,
    includeDiagnostics: true
  });

  assert.equal(aiCalls, 1);
  assert.match(aiQuestion, /What should I do\?/);
  assert.equal(response.interpretation_mode, 'GROUNDED_AI');
  assert.equal(response.interpretation_result.ai.status, 'GROUNDED');
  assert.equal(response.interpretation_result.ai.call_count, 1);
  assert.equal(response.trace[0].knowledge_id, record.knowledge_id);
  assert.match(response.answer, /Code 004/);
  assert.equal(supabase.memoryReads, 0);
  assert.equal(supabase.writes.some((write) => write.name === 'record_driver_help_answer_memory_reuse'), false);
});

test('an active AI refusal fails closed instead of serving an unrelated fuzzy record', async () => {
  const shipperRelease = knowledgeRecord({
    knowledge_id: 'KNO-DEL-SHIPPER-RELEASE-001',
    canonical_situation: 'FORGE explicitly identifies shipper-authorized release without an OP-201',
    normalized_description: 'A shipper-authorized release appears in FORGE.',
    driver_question_variants: ['FORGE says no OP-201 is required for shipper release'],
    clarification_requirements: [],
    concise_answer: 'Use the shipper-authorized release path only when FORGE explicitly authorizes it.'
  });
  const duplicateAddress = knowledgeRecord({
    knowledge_id: 'KNO-DEL-DUPLICATE-ADDRESS-001',
    canonical_situation: 'Two houses display the same address number',
    normalized_description: 'The correct delivery address cannot be identified between two houses.',
    driver_question_variants: ['Two houses have the same address number'],
    clarification_requirements: [],
    concise_answer: 'Use Code 002 for the unresolved duplicate-address condition.'
  });
  const service = createDriverHelpService({
    supabase: fakeSupabase([shipperRelease, duplicateAddress]),
    aiInterpretationMode: 'ACTIVE',
    aiInterpreter: async () => ({
      selection: 'NONE',
      knowledge_id: null,
      decision: 'NONE',
      answer_pattern_id: null,
      clarification_requirement: null,
      confidence: 0.99
    })
  });

  for (const question of [
    'What does release gamma mean in delivery status?',
    'What does OP-999 mean?'
  ]) {
    const response = await service.answerQuestion({
      accountId: '00000000-0000-0000-0000-000000000001',
      driverId: null,
      actorType: 'manager',
      actorId: '00000000-0000-0000-0000-000000000002',
      question,
      includeDiagnostics: true
    });

    assert.equal(response.response_mode, 'ESCALATE', question);
    assert.equal(response.answer, null, question);
    assert.equal(response.interpretation_mode, 'AI_FAIL_CLOSED', question);
    assert.deepEqual(response.trace, [], question);
  }

});

test('the remaining unresolved cash boundary bypasses adjacent AI candidates and fails closed', async () => {
  const codRecord = knowledgeRecord({
    knowledge_id: 'KNO-DEL-COD-MULTI-001',
    canonical_situation: 'Multiple COD packages at one stop',
    normalized_description: 'Collect on Delivery payment for established COD packages.',
    driver_question_variants: ['Customer pays an established COD package'],
    clarification_requirements: []
  });
  let aiCalls = 0;
  const service = createDriverHelpService({
    supabase: fakeSupabase([codRecord]),
    aiInterpretationMode: 'ACTIVE',
    aiInterpreter: async () => {
      aiCalls += 1;
      return {
        selection: 'SELECT',
        knowledge_id: codRecord.knowledge_id,
        decision: 'CLARIFY',
        clarification_requirement: null,
        confidence: 0.99
      };
    }
  });

  const response = await service.answerQuestion({
    accountId: '00000000-0000-0000-0000-000000000001',
    driverId: '00000000-0000-0000-0000-000000000002',
    question: 'A customer wants me to accept cash for shipping charges',
    includeDiagnostics: true
  });

  assert.equal(aiCalls, 0);
  assert.equal(response.response_mode, 'ESCALATE');
  assert.equal(response.interpretation_mode, 'AI_FAIL_CLOSED');
  assert.equal(response.interpretation_result.ai.status, 'KNOWN_UNAPPROVED');
  assert.deepEqual(response.trace, []);
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

test('natural yes and no clarification replies select the authored branch', () => {
  const yes = { knowledge_id: 'KNO-YES', label: 'Yes', query: 'authored yes branch' };
  const no = { knowledge_id: 'KNO-NO', label: 'No', query: 'authored no branch' };
  const context = { pending_clarification_options: [yes, no] };

  assert.deepEqual(resolveClarificationSelection('Yes, I already scanned packages.', context), yes);
  assert.deepEqual(resolveClarificationSelection('No, I have not scanned anything.', context), no);
});

test('missed delivery wording asks whether the driver means a misdelivery or an incomplete attempt', () => {
  const misdelivery = knowledgeRecord({
    knowledge_id: 'KNO-DEL-MISDELIVERY-RECOVERY-001',
    canonical_situation: 'Recovering and redelivering a misdelivered package on the same day',
    clarification_requirements: [
      'Has the package been physically recovered?',
      'Is the correct address known?',
      'Can it be redelivered today?'
    ],
    concise_answer: 'Recover and scan the package, then apply Code 17.'
  });
  const initialQuestion = "I did a missed delivery what's my next step";
  const initial = buildDeterministicRuntimeDecision(initialQuestion, [misdelivery], {});

  assert.equal(initial.decision.response_mode, 'CLARIFY');
  assert.equal(initial.lockedDecision, true);
  assert.match(initial.decision.clarification_prompt, /wrong address.*unable to complete/i);
  assert.deepEqual(
    initial.decision.clarification_options.map((option) => option.label),
    ['Delivered to wrong address', 'Could not complete delivery']
  );

  const context = buildNextSessionContext({}, initialQuestion, initial.decision);
  const wrongAddress = buildDeterministicRuntimeDecision(
    'Delivered to wrong address',
    [misdelivery],
    context
  );
  assert.equal(wrongAddress.decision.response_mode, 'CLARIFY');
  assert.equal(wrongAddress.lockedDecision, true);
  assert.match(wrongAddress.decision.clarification_prompt, /physically recovered/i);
  assert.equal(
    wrongAddress.decision.candidates[0].knowledge_id,
    'KNO-DEL-MISDELIVERY-RECOVERY-001'
  );

  const incomplete = buildDeterministicRuntimeDecision(
    'Could not complete delivery',
    [misdelivery],
    context
  );
  assert.equal(incomplete.decision.response_mode, 'CLARIFY');
  assert.equal(incomplete.lockedDecision, true);
  assert.match(incomplete.decision.clarification_prompt, /what prevented/i);
});

test('active AI does not override the missed delivery disambiguation', async () => {
  const misdelivery = knowledgeRecord({
    knowledge_id: 'KNO-DEL-MISDELIVERY-RECOVERY-001',
    canonical_situation: 'Recovering and redelivering a misdelivered package on the same day',
    clarification_requirements: ['Has the package been physically recovered?']
  });
  let aiCalls = 0;
  const service = createDriverHelpService({
    supabase: fakeSupabase([misdelivery]),
    aiInterpretationMode: 'ACTIVE',
    aiInterpreter: async () => {
      aiCalls += 1;
      throw new Error('AI should not be called for this protected clarification');
    }
  });

  const response = await service.answerQuestion({
    accountId: '00000000-0000-0000-0000-000000000001',
    driverId: '00000000-0000-0000-0000-000000000002',
    question: "I did a missed delivery what's my next step"
  });

  assert.equal(response.response_mode, 'CLARIFY');
  assert.match(response.clarification_prompt, /wrong address.*unable to complete/i);
  assert.equal(response.interpretation_mode, 'DETERMINISTIC');
  assert.equal(aiCalls, 0);
});

test('protected runtime branches fail closed and preserve high-risk distinctions', () => {
  const damageRecord = knowledgeRecord({
    knowledge_id: 'KNO-DEL-DAMAGE-INSPECTION-001',
    canonical_situation: 'Ordinary damaged package return',
    concise_answer: 'If it is not leaking or hazardous, use Code 010.'
  });
  const leakRecord = knowledgeRecord({
    knowledge_id: 'KNO-HAZ-LEAK-001',
    canonical_situation: 'Leaking hazardous-material package on route',
    concise_answer: 'Do not deliver or handle it. Park safely and contact the station immediately.'
  });
  const leaking = buildDeterministicRuntimeDecision(
    'Yes, it is leaking and might be hazardous.',
    [damageRecord, leakRecord],
    {
      pending_clarification_prompt: 'Is the package leaking or hazardous?',
      pending_clarification_requirement: 'Is the package leaking or hazardous?',
      knowledge_ids: [damageRecord.knowledge_id]
    }
  );
  assert.equal(leaking.decision.response_mode, 'ANSWER');
  assert.equal(leaking.decision.selected_records[0].knowledge_id, leakRecord.knowledge_id);
  assert.doesNotMatch(leaking.decision.answer, /Code 010/i);
  assert.equal(leaking.lockedDecision, true);

  const vacation = buildDeterministicRuntimeDecision(
    'How do I request vacation time?',
    [knowledgeRecord({
      knowledge_id: 'KNO-PUP-EARLY-REQUEST-001',
      concise_answer: 'Call CXPC before an early pickup.'
    })],
    {}
  );
  assert.equal(vacation.decision.response_mode, 'ESCALATE');
  assert.deepEqual(vacation.decision.selected_records, []);
  assert.equal(vacation.lockedDecision, true);

  const codRefusal = buildDeterministicRuntimeDecision(
    'The customer refuses a COD package. What code should I use?',
    [],
    {}
  );
  assert.equal(codRefusal.decision.response_mode, 'ESCALATE');
  assert.match(codRefusal.decision.escalation_message, /verified COD-refusal/i);

  const codRecord = knowledgeRecord({
    knowledge_id: 'KNO-DEL-REFUSED-001',
    driver_question_variants: ['The customer refuses a COD package'],
    concise_answer: 'Follow the verified refused-package procedure.'
  });
  const genericCodRefusal = buildDeterministicRuntimeDecision(
    'The customer refuses a COD package',
    [codRecord],
    {}
  );
  assert.equal(genericCodRefusal.decision.response_mode, 'ANSWER');
  assert.equal(genericCodRefusal.decision.selected_records[0].knowledge_id, codRecord.knowledge_id);
});

test('Code 030 remains definition-only and Code 128 safety wording does not launch a workflow', () => {
  const code030 = referenceRecord(
    'DELIVERY_STATUS:030',
    'Code 030: Retail Refusal/O.S.A. The reviewed source does not define the exact operating condition.',
    'Delivery status Code 030'
  );
  const reference = buildDeterministicRuntimeDecision(
    'What does Code 030 mean, and when am I authorized to use it?',
    [code030],
    {}
  );
  assert.equal(reference.decision.response_mode, 'ANSWER');
  assert.equal(reference.decision.selected_records[0].knowledge_id, 'DELIVERY_STATUS:030');
  assert.match(reference.decision.answer, /Retail Refusal/i);
  assert.doesNotMatch(reference.decision.answer, /shipper release/i);

  const barcodeRecord = knowledgeRecord({
    knowledge_id: 'KNO-FORGE-VEHICLE-BARCODE-WORKAROUND-001',
    canonical_situation: 'Vehicle barcode workaround'
  });
  const barcodeSafety = buildDeterministicRuntimeDecision(
    'Is a Code 128 vehicle barcode safe to use?',
    [barcodeRecord],
    {}
  );
  assert.equal(barcodeSafety.decision.response_mode, 'ANSWER');
  assert.equal(barcodeSafety.workflowDecision, false);
  assert.match(barcodeSafety.decision.answer, /approved format/i);
});

test('answered DSR and after-dispatch branches cannot be forgotten on the next turn', () => {
  const dsr = knowledgeRecord({
    knowledge_id: 'KNO-DEL-SIG-DSR-001',
    concise_answer: 'DSR requires an in-person signature.'
  });
  const dsrFollowUp = buildDeterministicRuntimeDecision(
    'Can I use the signed door tag they left?',
    [dsr],
    { knowledge_ids: [dsr.knowledge_id], last_response_mode: 'ANSWER' }
  );
  assert.equal(dsrFollowUp.decision.selected_records[0].knowledge_id, dsr.knowledge_id);
  assert.match(dsrFollowUp.decision.answer, /cannot satisfy DSR/i);

  const misload = knowledgeRecord({
    knowledge_id: 'KNO-DEL-MISLOAD-AFTERDISPATCH-001',
    concise_answer: 'Use Code 012 and return the package to the station.'
  });
  const codeFollowUp = buildDeterministicRuntimeDecision(
    'What code should I use?',
    [misload],
    { knowledge_ids: [misload.knowledge_id], last_response_mode: 'ANSWER' }
  );
  assert.equal(codeFollowUp.decision.selected_records[0].knowledge_id, misload.knowledge_id);
  assert.match(codeFollowUp.decision.answer, /Code 012/i);
});

test('live-test regression phrases route to the complete approved procedure', () => {
  const bulkRecord = knowledgeRecord({
    knowledge_id: 'KNO-FORGE-BULK-TRANSFER-001',
    canonical_situation: 'Bulk Transfer between work areas',
    concise_answer: 'The current manifest holder starts the bulk transfer.',
    driver_question_patterns: [{
      utterance: 'How do I bulk transfer packages?',
      answer_override: {
        direct_answer: 'The person whose manifest currently holds the package must start the bulk transfer.',
        steps: ['Open Bulk Transfer and scan the packages.'],
        watch_for: 'Use the confirmed destination work area.'
      }
    }]
  });
  const bulk = buildDeterministicRuntimeDecision(
    'how do i xfer bulk pkgs to other driver',
    [bulkRecord],
    {}
  );
  assert.equal(bulk.decision.selected_records[0].knowledge_id, bulkRecord.knowledge_id);
  assert.match(bulk.decision.answer, /manifest currently holds/i);

  const canceled = knowledgeRecord({ knowledge_id: 'KNO-PUP-CANCELED-001' });
  const code20 = knowledgeRecord({
    knowledge_id: 'KNO-PUP-CODE20-001',
    concise_answer: 'Use Code 20 after the customer confirms zero packages.'
  });
  const comparison = buildDeterministicRuntimeDecision(
    'What is the difference between pickup Codes 11, 20, and 24?',
    [canceled, code20],
    {}
  );
  assert.match(comparison.decision.answer, /Code 11/i);
  assert.match(comparison.decision.answer, /Code 20/i);
  assert.match(comparison.decision.answer, /Code 24/i);
  assert.deepEqual(
    comparison.decision.selected_records.map((record) => record.knowledge_id),
    ['KNO-PUP-CANCELED-001', 'KNO-PUP-CODE20-001']
  );
});

test('unknown misdelivery address and customer-directed address changes stay grounded', () => {
  const misdelivery = knowledgeRecord({
    knowledge_id: 'KNO-DEL-MISDELIVERY-RECOVERY-001',
    prohibited_actions: ['Do not redeliver until the correct address is established'],
    escalation_requirements: ['Contact management when the correct address cannot be established']
  });
  const unknown = buildDeterministicRuntimeDecision(
    'I don’t know the correct address.',
    [misdelivery],
    { knowledge_ids: [misdelivery.knowledge_id], last_response_mode: 'ANSWER' }
  );
  assert.equal(unknown.decision.selected_records[0].knowledge_id, misdelivery.knowledge_id);
  assert.match(unknown.decision.answer, /Do not redeliver/i);
  assert.match(unknown.decision.answer, /station or management/i);

  const customerAddressChange = knowledgeRecord({
    knowledge_id: 'KNO-DEL-CUSTOMER-ADDRESS-CHANGE-001',
    concise_answer: 'Use the shipping-label address. The customer must call FedEx to change it. If the customer says they moved from that address, apply Code 002.'
  });
  const directedChange = buildDeterministicRuntimeDecision(
    'The customer moved and texted me a new address. Can I deliver there?',
    [customerAddressChange, knowledgeRecord({ knowledge_id: 'KNO-FORGE-EDIT-ADDRESS-001' })],
    {}
  );
  assert.equal(directedChange.decision.response_mode, 'ANSWER');
  assert.equal(directedChange.decision.selected_records[0].knowledge_id, 'KNO-FORGE-EDIT-ADDRESS-001');
  assert.equal(
    directedChange.decision.answer_structure.direct_answer,
    'No. Use Code 002 and return the package to the station.'
  );

  const directRequest = buildDeterministicRuntimeDecision(
    'The customer called and told me to change the delivery address myself.',
    [customerAddressChange],
    {}
  );
  assert.equal(directRequest.decision.response_mode, 'ANSWER');
  assert.equal(directRequest.decision.selected_records[0].knowledge_id, 'KNO-DEL-CUSTOMER-ADDRESS-CHANGE-001');
  assert.equal(
    directRequest.decision.answer_structure.direct_answer,
    'Use the shipping-label address. The customer must call FedEx to change it.'
  );
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

test('staff test mode answers without creating customer sessions or interactions', async () => {
  const supabase = fakeSupabase([]);
  const service = createDriverHelpService({ supabase, now: () => new Date(0) });
  const response = await service.answerQuestion({
    accountId: null,
    driverId: null,
    actorType: 'manager',
    actorId: '00000000-0000-0000-0000-000000000099',
    question: 'What should I do?',
    persist: false,
    sessionContext: { previous_question: 'Earlier staff test' }
  });

  assert.equal(response.response_mode, 'ESCALATE');
  assert.equal(response.test_mode, true);
  assert.equal(response.session_id, null);
  assert.equal(response.interaction_id, null);
  assert.equal(response.session_context.last_question, 'What should I do?');
  assert.deepEqual(supabase.writes, []);
});

test('negative field feedback is preserved and immediately suspends answer-memory reuse', async () => {
  const writes = [];
  const rpcCalls = [];
  const interaction = {
    id: 'interaction-1',
    normalized_question: 'pickup got canceled',
    selected_knowledge_ids: ['KNO-PUP-CANCELED-001'],
    interpretation_result: null
  };
  const supabase = {
    from(table) {
      if (table === 'driver_help_interactions') {
        return { select() { return filterChain({ data: interaction, error: null }); } };
      }
      if (table === 'driver_help_feedback') {
        return {
          upsert(row) {
            writes.push(row);
            return Promise.resolve({ error: null });
          }
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
    rpc(name, parameters) {
      rpcCalls.push({ name, parameters });
      return Promise.resolve({ error: null });
    }
  };
  const service = createDriverHelpService({ supabase, now: () => new Date('2026-08-19T12:00:00Z') });

  const result = await service.saveFeedback({
    accountId: 'account-1',
    driverId: 'driver-1',
    interactionId: interaction.id,
    rating: 'down',
    comment: 'The attempt branch did not match what happened.'
  });

  assert.equal(result.rating, 'down');
  assert.equal(writes[0].comment, 'The attempt branch did not match what happened.');
  assert.deepEqual(rpcCalls, [{
    name: 'suspend_driver_help_answer_memory',
    parameters: {
      p_route_key: answerMemoryRouteKey(interaction.normalized_question),
      p_knowledge_id: 'KNO-PUP-CANCELED-001'
    }
  }]);
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

test('grounded AI selection renders canonical content without a second AI composition call', async () => {
  const record = knowledgeRecord({
    clarification_requirements: [],
    required_procedure: [
      { step: 1, action: 'Confirm no pickup attempt occurred.' },
      { step: 2, action: 'Apply Code 24.' }
    ]
  });
  const supabase = fakeSupabase([record]);
  let interpretationCalls = 0;
  const service = createDriverHelpService({
    supabase,
    now: () => new Date(0),
    aiInterpretationMode: 'ACTIVE',
    aiInterpreter: async () => {
      interpretationCalls += 1;
      return {
        selection: 'SELECT',
        knowledge_id: record.knowledge_id,
        decision: 'ANSWER',
        answer_pattern_id: null,
        clarification_requirement: null,
        facts: {},
        confidence: 0.96
      };
    }
  });

  const response = await service.answerQuestion({
    accountId: '00000000-0000-0000-0000-000000000001',
    driverId: '00000000-0000-0000-0000-000000000002',
    question: 'The shipper canceled before I headed to the pickup',
    includeDiagnostics: true
  });

  assert.equal(interpretationCalls, 1);
  assert.equal(response.composition_mode, 'DETERMINISTIC');
  assert.equal(response.answer, record.concise_answer);
  assert.equal(response.answer_structure.direct_answer, record.concise_answer);
  assert.deepEqual(response.answer_structure.steps, [
    'Confirm no pickup attempt occurred.',
    'Apply Code 24.'
  ]);
  assert.equal(response.composition_validation, null);
});

test('exact approved answer patterns remain locked and bypass AI interpretation', async () => {
  const record = knowledgeRecord({
    driver_question_patterns: [{
      utterance: 'Pickup canceled before attempt',
      response_mode: 'DIRECT_SOURCE_GROUNDED_ANSWER',
      must_clarify: [],
      answer_override: { direct_answer: 'Use Code 24.' }
    }]
  });
  const supabase = fakeSupabase([record]);
  const service = createDriverHelpService({
    supabase,
    now: () => new Date(0),
    aiInterpretationMode: 'ACTIVE',
    aiInterpreter: async () => {
      throw new Error('Locked answer should not call the interpreter');
    }
  });

  const response = await service.answerQuestion({
    accountId: '00000000-0000-0000-0000-000000000001',
    driverId: '00000000-0000-0000-0000-000000000002',
    question: 'Pickup canceled before attempt'
  });

  assert.equal(response.answer_structure.direct_answer, 'Use Code 24.');
  assert.equal(response.composition_mode, 'DETERMINISTIC');
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

test('AI-selected clarification options retain the selected record identity', async () => {
  const requirement = 'Has anything already been scanned in the wrong work area?';
  const records = [
    knowledgeRecord({
      knowledge_id: 'KNO-DEL-SIG-ASR-001',
      canonical_situation: 'Adult Signature Required'
    }),
    knowledgeRecord({
      knowledge_id: 'KNO-FORGE-WRONG-WORK-AREA-001',
      canonical_situation: 'Wrong work area login',
      clarification_requirements: [requirement]
    })
  ];
  const service = createDriverHelpService({
    supabase: fakeSupabase(records),
    now: () => new Date(0),
    aiInterpretationMode: 'ACTIVE',
    aiInterpreter: async () => ({
      selection: 'SELECT',
      knowledge_id: 'KNO-FORGE-WRONG-WORK-AREA-001',
      decision: 'CLARIFY',
      clarification_requirement: requirement,
      confidence: 0.99
    })
  });

  const response = await service.answerQuestion({
    accountId: '00000000-0000-0000-0000-000000000001',
    driverId: '00000000-0000-0000-0000-000000000002',
    question: 'I selected the wrong work area in FORGE. What should I do?'
  });

  assert.equal(response.response_mode, 'CLARIFY');
  assert.deepEqual(
    response.clarification_options.map((option) => option.knowledge_id),
    ['KNO-FORGE-WRONG-WORK-AREA-001', 'KNO-FORGE-WRONG-WORK-AREA-001']
  );
});

test('generic package-with-signature wording asks for ASR DSR or ISR after grounded interpretation', async () => {
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
      knowledge_id: 'KNO-DEL-SIG-ASR-001',
      decision: 'CLARIFY',
      clarification_requirement: signatureRequirement,
      confidence: 0.99,
      facts: {}
    })
  });

  const response = await service.answerQuestion({
    accountId: '00000000-0000-0000-0000-000000000001',
    driverId: '00000000-0000-0000-0000-000000000002',
    question: 'I have a package with the signature, but there is a signed door tag, what should I do?'
  });

  assert.equal(response.response_mode, 'CLARIFY');
  assert.match(response.clarification_prompt, /What signature service/);
  assert.deepEqual(response.clarification_options.map((option) => option.query), ['ASR', 'DSR', 'ISR']);
  assert.equal(response.interpretation_mode, 'GROUNDED_AI');
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

test('invalid or unavailable AI interpretation always fails closed', async () => {
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

  assert.equal(response.response_mode, 'ESCALATE');
  assert.equal(response.answer, null);
  assert.equal(response.interpretation_mode, 'AI_FAIL_CLOSED');
});

test('provider timeout escalates instead of using a controlled shipper-release fallback', async () => {
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

  assert.equal(response.response_mode, 'ESCALATE');
  assert.equal(response.answer, null);
  assert.equal(response.interpretation_mode, 'AI_FAIL_CLOSED');
});

test('delivery-photo wording escalates when AI interpretation is unavailable', async () => {
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

  assert.equal(response.response_mode, 'ESCALATE');
  assert.equal(response.answer, null);
  assert.equal(response.interpretation_mode, 'AI_FAIL_CLOSED');
  assert.equal(response.interpretation_result.ai.status, 'ERROR');
  assert.equal(response.interpretation_result.ai.call_count, 2);
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

test('shadow mode cannot serve a free-form deterministic fallback', async () => {
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

  assert.equal(response.response_mode, 'ESCALATE');
  assert.equal(response.answer, null);
  assert.deepEqual(response.trace, []);
  assert.equal(response.interpretation_mode, 'AI_FAIL_CLOSED');
  assert.equal(interaction.interpretation_mode, 'AI_FAIL_CLOSED');
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

test('an exact approved answer override bypasses AI reinterpretation', async () => {
  const record = knowledgeRecord({
    driver_question_variants: ['How do I do a bulk transfer?'],
    driver_question_patterns: [{
      utterance: 'How do I do a bulk transfer?',
      response_mode: 'DIRECT_SOURCE_GROUNDED_ANSWER',
      must_clarify: [],
      answer_override: {
        direct_answer: 'The current manifest holder starts the bulk transfer.',
        steps: ['Open Bulk Transfer and scan the packages.'],
        watch_for: 'Use the confirmed destination work area.'
      }
    }],
    clarification_requirements: ['Whose manifest currently holds the package?']
  });
  const supabase = fakeSupabase([record]);
  let aiCalls = 0;
  const service = createDriverHelpService({
    supabase,
    now: () => new Date(0),
    aiInterpretationMode: 'ACTIVE',
    aiInterpreter: async () => {
      aiCalls += 1;
      throw new Error('AI should not reinterpret an exact approved answer override');
    }
  });

  const response = await service.answerQuestion({
    accountId: '00000000-0000-0000-0000-000000000001',
    driverId: '00000000-0000-0000-0000-000000000002',
    question: 'How do I do a bulk transfer?'
  });

  assert.equal(response.response_mode, 'ANSWER');
  assert.equal(response.answer_structure.direct_answer, 'The current manifest holder starts the bulk transfer.');
  assert.equal(response.interpretation_mode, 'DETERMINISTIC');
  assert.equal(aiCalls, 0);
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
