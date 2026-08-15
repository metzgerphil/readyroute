const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  buildAnswerStructure,
  buildDriverHelpDecision,
  normalizeDriverQuestion,
  rankKnowledgeRecords,
  selectCanonicalRecordVersions
} = require('./driverHelpRetrieval');

function record(overrides = {}) {
  return {
    knowledge_id: 'TEST-PROCEDURE-001',
    version: 1,
    status: 'SOURCE_VERIFIED',
    is_published: true,
    canonical_situation: 'Sample indicator appears during a training simulation',
    normalized_description: 'A non-operational fixture used only to test retrieval',
    authoritative_rule: 'Follow the verified sample instruction.',
    concise_answer: 'Follow the verified sample instruction.',
    driver_question_variants: ['sample indicator appeared in training'],
    driver_question_patterns: [],
    clarification_requirements: [],
    required_procedure: [],
    required_documentation: [],
    prohibited_actions: [],
    escalation_requirements: [],
    taxonomy_paths: ['TEST/SAMPLE'],
    ...overrides
  };
}

test('empty corpus always fails closed', () => {
  const decision = buildDriverHelpDecision('What should I do?', []);
  assert.equal(decision.response_mode, 'ESCALATE');
  assert.deepEqual(decision.selected_records, []);
  assert.match(decision.escalation_message, /does not have a verified answer/i);
});

test('branch-specific answer overrides cannot leak a conflicting base procedure or reason wording', () => {
  const structure = buildAnswerStructure(record({
    taxonomy_paths: ['TAX-PICKUP'],
    required_procedure: [{ step: 1, action: 'Apply Code 004.' }],
    required_documentation: ['Status Code 004'],
    prohibited_actions: ['Do not use Code 004 for a residential stop']
  }), {
    direct_answer: 'Use reason 11 because the attempted pickup was closed.',
    steps: ['Select reason 11.', 'Close the stop.'],
    watch_for: 'Do not use reason 11 when the customer confirms no package.'
  });

  assert.equal(structure.direct_answer, 'Use Code 11 because the attempted pickup was closed.');
  assert.deepEqual(structure.procedure_steps, ['Select Code 11.', 'Close the stop.']);
  assert.deepEqual(structure.documentation, []);
  assert.deepEqual(structure.prohibited_actions, [
    'Do not use Code 11 when the customer confirms no package.'
  ]);
  assert.doesNotMatch(JSON.stringify(structure), /Code 004/);
});

test('unmatched distinctive terms fail closed instead of matching generic package words', () => {
  const decision = buildDriverHelpDecision('How do I deliver an alcohol package?', [record({
    canonical_situation: 'A delivery package has possible damage and needs inspection',
    normalized_description: 'A damaged package is returned for inspection',
    driver_question_variants: ['box is crushed before delivery'],
    clarification_requirements: ['Is the package leaking or hazardous?'],
    taxonomy_paths: ['TAX-DELIVERY']
  })]);

  assert.equal(decision.response_mode, 'ESCALATE');
  assert.deepEqual(decision.selected_records, []);
  assert.match(decision.escalation_message, /does not have a verified answer/i);
});

test('an unsupported operational acronym cannot be absorbed by a neighboring refusal workflow', () => {
  const decision = buildDriverHelpDecision('The customer refuses a COD package', [
    record({
      knowledge_id: 'TEST-ASR-001',
      canonical_situation: 'Completing an ASR delivery when a customer refuses ID',
      normalized_description: 'Adult signature recipient refuses to provide identification',
      driver_question_variants: ['ASR customer refuses ID']
    }),
    record({
      knowledge_id: 'TEST-ALCOHOL-001',
      canonical_situation: 'Delivering an alcohol package',
      normalized_description: 'Alcohol customer refuses to provide identification',
      driver_question_variants: ['Alcohol customer refuses ID']
    })
  ]);

  assert.equal(decision.response_mode, 'ESCALATE');
  assert.deepEqual(decision.selected_records, []);
});

test('an explicit signature type can switch a clarification plan to the correct neighboring record', () => {
  const asr = record({
    knowledge_id: 'TEST-ASR-001',
    canonical_situation: 'Completing an ASR delivery',
    normalized_description: 'Adult Signature Required package nobody home',
    driver_question_variants: ['ASR nobody home'],
    clarification_requirements: [
      'What signature service does FORGE show?',
      'If nobody can sign, is the stop residential or non-residential?'
    ]
  });
  const dsr = record({
    knowledge_id: 'TEST-DSR-001',
    canonical_situation: 'Completing a DSR delivery',
    normalized_description: 'Direct Signature Required package nobody home',
    driver_question_variants: ['DSR nobody home at a house'],
    clarification_requirements: [
      'What signature service does FORGE show?',
      'If nobody can sign, is the stop residential or non-residential?'
    ]
  });
  const decision = buildDriverHelpDecision(
    'Signature package nobody home. FORGE shows DSR and this is a house.',
    [asr, dsr],
    {
      clarification_plan_active: true,
      knowledge_ids: ['TEST-ASR-001'],
      answered_clarification_requirements: ['What signature service does FORGE show?'],
      remaining_clarification_requirements: []
    }
  );

  assert.equal(decision.response_mode, 'ANSWER');
  assert.equal(decision.selected_records[0].knowledge_id, 'TEST-DSR-001');
});

test('exact evaluated variant can return the stored published answer', () => {
  const decision = buildDriverHelpDecision('sample indicator appeared in training', [record()]);
  assert.equal(decision.response_mode, 'ANSWER');
  assert.equal(decision.answer, 'Follow the verified sample instruction.');
  assert.equal(decision.selected_records[0].knowledge_id, 'TEST-PROCEDURE-001');
});

test('a lexical follow-up preserves the answered record without making unrelated context sticky', () => {
  const active = record({
    knowledge_id: 'TEST-SCANNER-FAIL-001',
    canonical_situation: 'Scanner failure during a pickup requires station details',
    normalized_description: 'Scanning technology failed and station personnel need the pickup details',
    driver_question_variants: ['What details do I give the station after scanner failure']
  });
  const neighbor = record({
    knowledge_id: 'TEST-STATION-OTHER-001',
    canonical_situation: 'A different station procedure',
    normalized_description: 'Station details for an unrelated procedure',
    driver_question_variants: ['Give the station different details']
  });
  const context = {
    last_response_mode: 'ANSWER',
    knowledge_ids: [active.knowledge_id]
  };

  const followUp = rankKnowledgeRecords('What details do I give the station?', [active, neighbor], context);
  assert.equal(followUp[0].record.knowledge_id, active.knowledge_id);

  const unrelated = rankKnowledgeRecords('A dog is loose in the yard', [active], context);
  assert.deepEqual(unrelated, []);
});

test('an answer pattern may select a compact source-authored branch presentation', () => {
  const decision = buildDriverHelpDecision('pickup canceled before I went there', [record({
    canonical_situation: 'A listed pickup is canceled or has no packages',
    driver_question_variants: ['pickup got canceled'],
    driver_question_patterns: [{
      utterance: 'pickup canceled before I went there',
      response_mode: 'DIRECT_SOURCE_GROUNDED_ANSWER',
      must_clarify: [],
      answer_override: {
        direct_answer: 'Use Code 24.',
        steps: ['Open the correct listed pickup.', 'Select Code 24 and tap DONE.'],
        watch_for: 'Use Code 24 only when no attempt was made.'
      }
    }]
  })]);

  assert.equal(decision.response_mode, 'ANSWER');
  assert.equal(decision.answer, 'Use Code 24.');
  assert.equal(decision.answer_structure.direct_answer, 'Use Code 24.');
  assert.deepEqual(decision.answer_structure.steps, [
    'Open the correct listed pickup.',
    'Select Code 24 and tap DONE.'
  ]);
  assert.equal(decision.answer_structure.watch_for, 'Use Code 24 only when no attempt was made.');
});

test('authored compact answers survive omitted articles and common driver inflections', () => {
  const decision = buildDriverHelpDecision('Can I reconcile a pickup after leaving the customer?', [record({
    canonical_situation: 'Pickup reconciliation at the customer location',
    driver_question_variants: ['reconcile pickup at customer'],
    driver_question_patterns: [{
      utterance: 'Can I reconcile the pickup after I leave the customer?',
      response_mode: 'DIRECT_SOURCE_GROUNDED_ANSWER',
      must_clarify: [],
      answer_override: { direct_answer: 'No. Reconcile before leaving.' }
    }]
  })]);

  assert.equal(decision.response_mode, 'ANSWER');
  assert.equal(decision.answer, 'No. Reconcile before leaving.');
});

test('authored question matching treats written HOS numbers like digits', () => {
  const decision = buildDriverHelpDecision('How many hours after ten hours off?', [record({
    canonical_situation: 'HOS driving limit after required off duty time',
    driver_question_variants: ['hours drive after ten off'],
    driver_question_patterns: [{
      utterance: 'How many hours after 10 hours off?',
      response_mode: 'DIRECT_SOURCE_GROUNDED_ANSWER',
      must_clarify: [],
      answer_override: { direct_answer: 'Up to 11 driving hours.' }
    }]
  })]);

  assert.equal(decision.response_mode, 'ANSWER');
  assert.equal(decision.answer, 'Up to 11 driving hours.');
});

test('ineligible records never produce definitive instructions', () => {
  const decision = buildDriverHelpDecision('sample indicator appeared in training', [record({
    status: 'PENDING_REVIEW',
    is_published: false
  })]);
  assert.equal(decision.response_mode, 'ESCALATE');
  assert.deepEqual(decision.selected_records, []);
});

test('record-authored clarification requirements control ambiguity handling', () => {
  const decision = buildDriverHelpDecision('sample indicator appeared', [record({
    driver_question_variants: [],
    clarification_requirements: ['which training screen is visible']
  })]);
  assert.equal(decision.response_mode, 'CLARIFY');
  assert.match(decision.clarification_prompt, /which training screen is visible/i);
  assert.deepEqual(decision.clarification_options, []);
});

test('data-authored patterns ignore filler words and do not repeat an already supplied business fact', () => {
  const decision = buildDriverHelpDecision('The business is closed and nobody is there.', [record({
    canonical_situation: 'A business recipient is not in and delivery release is not permitted',
    driver_question_variants: ['business closed what code'],
    driver_question_patterns: [{
      utterance: 'business closed nobody there',
      response_mode: 'ASK_MINIMUM_CLARIFICATION',
      must_clarify: [
        'Is any authorized signature or release path available?',
        'Is this a weekend closure?'
      ]
    }],
    clarification_requirements: [
      'Is the stop a business or non-residential address?',
      'Is any authorized signature or release path available?',
      'Is this a weekend closure?'
    ]
  })]);

  assert.equal(decision.response_mode, 'CLARIFY');
  assert.equal(
    decision.clarification_prompt,
    'Ready Route Answers needs one detail: Is any authorized signature or release path available?'
  );
  assert.doesNotMatch(decision.clarification_prompt, /business or non-residential/i);
  assert.deepEqual(decision.clarification_options, []);
});

test('data-authored patterns tolerate harmless wrappers and a one-character driver typo', () => {
  const publishedRecord = record({
    driver_question_patterns: [{
      utterance: 'pickup canceled before I went there',
      response_mode: 'DIRECT_SOURCE_GROUNDED_ANSWER',
      must_clarify: []
    }],
    clarification_requirements: ['Was any attempt made?']
  });
  assert.equal(
    buildDriverHelpDecision('Please help: pickup canceled before I went there', [publishedRecord]).response_mode,
    'ANSWER'
  );
  assert.equal(
    buildDriverHelpDecision('pickup canceld before I went there', [publishedRecord]).response_mode,
    'ANSWER'
  );
});

test('common driver shorthand still retrieves the named signature procedure', () => {
  const decision = buildDriverHelpDecision('sig proceedure for ASR?', [record({
    knowledge_id: 'TEST-ASR-001',
    canonical_situation: 'Completing an Adult Signature Required delivery',
    normalized_description: 'An ASR delivery requires an adult signature',
    driver_question_variants: ['How do I deliver an ASR package'],
    concise_answer: 'Require valid ID and an adult signature.'
  })]);

  assert.equal(decision.response_mode, 'ANSWER');
  assert.equal(decision.selected_records[0].knowledge_id, 'TEST-ASR-001');
});

test('active approved adjudication can outrank a newer raw version', () => {
  const approved = record({ status: 'READY_ROUTE_APPROVED', version: 1 });
  const newer = record({ status: 'SOURCE_VERIFIED', version: 2 });
  assert.equal(selectCanonicalRecordVersions([newer, approved])[0].status, 'READY_ROUTE_APPROVED');
});

test('normalization is mechanical and contains no corpus-specific aliases', () => {
  assert.equal(normalizeDriverQuestion('  Sámple—Indicator! '), 'sample indicator');
});

test('builds the compact driver-answer contract with no more than four steps and one warning', () => {
  const structure = buildAnswerStructure(record({
    concise_answer: 'Use code 004. Complete the remaining procedure carefully.',
    taxonomy_paths: ['TAX-DELIVERY'],
    required_procedure: [
      { step: 1, action: 'Confirm the condition.' },
      { step: 2, action: 'Apply code 004.' },
      { step: 3, action: 'Complete the door tag.' },
      { step: 4, action: 'Mark the package.' },
      { step: 5, action: 'Return the package.' }
    ],
    prohibited_actions: ['Do not leave the package.', 'Do not use a residential code.']
  }));

  assert.equal(structure.direct_answer, 'Use Code 004.');
  assert.equal(structure.steps.length, 4);
  assert.match(structure.steps[1], /Code 004/);
  assert.match(structure.steps[3], /Mark the package.*Return the package/);
  assert.equal(structure.watch_for, 'Do not leave the package.');
  assert.equal(structure.prohibited_actions.length, 2);
});

test('labels pickup reason numbers as Codes in driver-facing structure', () => {
  const structure = buildAnswerStructure(record({
    concise_answer: 'Use reason 11 when the attempted pickup location is closed.',
    taxonomy_paths: ['TAX-PICKUP'],
    required_procedure: [{ step: 1, action: 'Select reason code 11 and tap DONE.' }]
  }));

  assert.equal(
    structure.direct_answer,
    'Use Code 11 when the attempted pickup location is closed.'
  );
  assert.equal(structure.steps[0], 'Select Code 11 and tap DONE.');
});

test('promotes a single applicable status code into the direct answer', () => {
  const structure = buildAnswerStructure(record({
    concise_answer: 'Do not deliver it. Code it 012 and return it to the station.',
    taxonomy_paths: ['TAX-DELIVERY'],
    required_procedure: [
      { step: 1, action: 'Do not deliver the package.' },
      { step: 2, action: 'Apply Code 012.' },
      { step: 3, action: 'Return the package to the station.' }
    ]
  }));

  assert.equal(structure.direct_answer, 'Apply Code 012.');
});

test('all controlled records satisfy the compact initial-answer contract', () => {
  const recordsPath = path.resolve(__dirname, '../../../knowledge/operations/records.jsonl');
  const records = fs.readFileSync(recordsPath, 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse);

  assert.equal(records.length, 71);
  for (const canonical of records) {
    const structure = buildAnswerStructure({
      ...canonical,
      concise_answer: canonical.concise_driver_answer,
      taxonomy_paths: canonical.category_paths
    });
    assert.ok(structure.direct_answer, `${canonical.knowledge_id} needs a direct answer`);
    assert.ok(structure.steps.length > 0, `${canonical.knowledge_id} needs action steps`);
    assert.ok(structure.steps.length <= 4, `${canonical.knowledge_id} exceeds four initial steps`);
    assert.ok(
      !structure.watch_for || typeof structure.watch_for === 'string',
      `${canonical.knowledge_id} has an invalid warning`
    );

    const sourceCodes = String(canonical.concise_driver_answer).match(/\b(?:code|reason)\s+0*\d{1,3}\b/gi) || [];
    const presentedText = [structure.direct_answer, ...structure.steps].join(' ');
    for (const codePhrase of sourceCodes) {
      const number = codePhrase.match(/\d{1,3}/)[0].replace(/^0+(?=\d)/, '');
      assert.match(presentedText, new RegExp(`\\b0*${number}\\b`), `${canonical.knowledge_id} dropped code ${number}`);
    }
  }
});

test('unseen driver abbreviations and minor misspellings still rank the right controlled record first', () => {
  const recordsPath = path.resolve(__dirname, '../../../knowledge/operations/records.jsonl');
  const records = fs.readFileSync(recordsPath, 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse)
    .map((canonical) => ({
      ...canonical,
      version: canonical.record_version,
      status: canonical.knowledge_status,
      is_published: canonical.production_eligibility.publication_ready,
      concise_answer: canonical.concise_driver_answer,
      taxonomy_paths: canonical.category_paths
    }));
  const expectations = [
    ['biz is clsoed no one there', 'KNO-DEL-BUS-CLOSED-001'],
    ['pkg on my truck belongs to other rte', 'KNO-DEL-MISLOAD-AFTERDISPATCH-001'],
    ['pu cancelled before i got there', 'KNO-PUP-CANCELED-001'],
    ['pckup is empty', 'KNO-PUP-ZERO-001'],
    ['move boxes to another wa', 'KNO-FORGE-BULK-TRANSFER-001'],
    ['van barcode gone cant login', 'KNO-FORGE-VEHICLE-BARCODE-WORKAROUND-001'],
    ['hazmat pop up during signin', 'KNO-FORGE-HAZMAT-LOGIN-PROMPT-001'],
    ['box is busted and leaking', 'KNO-DEL-DAMAGE-INSPECTION-001']
  ];

  for (const [question, expectedId] of expectations) {
    assert.equal(
      rankKnowledgeRecords(question, records)[0]?.record.knowledge_id,
      expectedId,
      question
    );
  }
});
