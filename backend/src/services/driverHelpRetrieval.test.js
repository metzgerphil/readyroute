const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildDriverHelpDecision,
  normalizeDriverQuestion,
  rankKnowledgeRecords
} = require('./driverHelpRetrieval');

const records = [
  {
    knowledge_id: 'KNO-DEL-SIG-DSR-001',
    version: 2,
    status: 'VERIFIED',
    is_published: true,
    canonical_situation: 'Delivering a Direct Signature Required package',
    normalized_description: 'Direct signature package and nobody is available to sign',
    taxonomy_paths: ['TAX-DELIVERY/TAX-SIGNATURE'],
    authoritative_rule: 'A DSR package requires an in-person signature at the labeled address.',
    driver_question_variants: ['signature package nobody home', 'dsr nobody there'],
    driver_question_patterns: [],
    required_procedure: [{ step: 1, action: 'Confirm DSR.' }, { step: 2, action: 'Collect the signature.' }],
    required_documentation: ['In-person signature'],
    prohibited_actions: ['Do not driver release.'],
    escalation_requirements: ['Contact management if the service type is unclear.'],
    concise_answer: 'Do not leave the DSR package without an in-person signature.',
    more_info_answer: 'Use the approved unsuccessful-attempt procedure.'
  },
  {
    knowledge_id: 'KNO-PUP-ZERO-001',
    version: 1,
    status: 'VERIFIED',
    is_published: true,
    canonical_situation: 'Listed pickup has zero packages',
    normalized_description: 'Scheduled pickup but the customer has nothing to ship',
    taxonomy_paths: ['TAX-PICKUP/TAX-ZERO'],
    authoritative_rule: 'Close the correct listed pickup with zero packages and the applicable reason.',
    driver_question_variants: ["im at the pickup but theres nothing here", 'empty pickup'],
    driver_question_patterns: [],
    concise_answer: 'Open the correct pickup and use Close (Zero Pkg).',
    more_info_answer: null
  },
  {
    knowledge_id: 'KNO-UNSAFE-GUESS-001',
    version: 1,
    status: 'HUMAN_REVIEW_REQUIRED',
    is_published: false,
    canonical_situation: 'Unverified procedure',
    taxonomy_paths: ['TAX-OTHER'],
    authoritative_rule: 'This must never be returned.',
    driver_question_variants: ['scanner exploded'],
    driver_question_patterns: [],
    concise_answer: 'Invented answer.'
  }
];

test('normalizes shorthand punctuation and casing', () => {
  assert.equal(normalizeDriverQuestion("I'm at Pickup—Nothing HERE!"), 'i m at pickup nothing here');
});

test('ranks an exact driver-language variant above unrelated records', () => {
  const ranked = rankKnowledgeRecords("I'm at the pickup but there's nothing here", records);
  assert.equal(ranked[0].record.knowledge_id, 'KNO-PUP-ZERO-001');
  assert.ok(ranked[0].score > 0);
});

test('returns only a published verified answer and preserves record version traceability', () => {
  const decision = buildDriverHelpDecision('DSR nobody there', records);
  assert.equal(decision.response_mode, 'ANSWER');
  assert.equal(decision.selected_records[0].knowledge_id, 'KNO-DEL-SIG-DSR-001');
  assert.equal(decision.selected_records[0].version, 2);
  assert.match(decision.answer, /Do not leave/);
  assert.deepEqual(decision.answer_structure.steps, ['Do not leave the DSR package without an in-person signature.']);
  assert.deepEqual(decision.answer_structure.procedure_steps, ['Confirm DSR.', 'Collect the signature.']);
  assert.deepEqual(decision.answer_structure.prohibited_actions, ['Do not driver release.']);
});

test('asks for the signature type instead of guessing one signature procedure', () => {
  const signatureRecords = [
    records[0],
    {
      ...records[0],
      knowledge_id: 'KNO-DEL-SIG-ISR-001',
      canonical_situation: 'Delivering an Indirect Signature Required package',
      driver_question_variants: ['indirect signature package'],
      concise_answer: 'Use an approved ISR path.'
    },
    {
      ...records[0],
      knowledge_id: 'KNO-DEL-SIG-ASR-001',
      canonical_situation: 'Completing an Adult Signature Required delivery',
      driver_question_variants: ['adult signature package'],
      concise_answer: 'Verify the adult recipient and ID.'
    }
  ];
  const decision = buildDriverHelpDecision('How do I handle a signature package?', signatureRecords);
  assert.equal(decision.response_mode, 'CLARIFY');
  assert.match(decision.clarification_prompt, /signature type/i);
  assert.deepEqual(decision.clarification_options.map((option) => option.label).sort(), [
    'ASR — Adult Signature',
    'DSR — Direct Signature',
    'ISR — Indirect Signature'
  ].sort());
});

test('answers the neighbor ISR question directly and exposes each approved path separately', () => {
  const isrRecord = {
    ...records[0],
    knowledge_id: 'KNO-DEL-SIG-ISR-001',
    canonical_situation: 'Delivering an Indirect Signature Required package',
    normalized_description: 'ISR package with alternate signature or recipient authorization',
    driver_question_variants: ['Can the neighbor sign for this signature package'],
    concise_answer: 'Use an approved ISR signature or recipient-authorization path.'
  };
  const decision = buildDriverHelpDecision('Can the neighbor sign for this signature package?', [isrRecord]);

  assert.equal(decision.response_mode, 'ANSWER');
  assert.match(decision.answer_structure.steps[0], /^Yes/i);
  assert.equal(decision.answer_structure.options[0].id, 'isr-neighbor');
  assert.match(decision.answer_structure.options[0].summary, /eligible ISR/i);
  assert.ok(decision.answer_structure.options.some((option) => option.id === 'isr-signed-door-tag'));
  assert.ok(decision.answer_structure.options.some((option) => option.id === 'isr-electronic-signature'));
});

test('clarifies delivery confirmation intent and never invents package damage', () => {
  const damageRecord = {
    ...records[0],
    knowledge_id: 'KNO-DEL-DAMAGE-INSPECTION-001',
    canonical_situation: 'Delivery package has possible damage and must return for inspection',
    normalized_description: 'Ordinary delivery package with possible damage',
    driver_question_variants: ['damaged delivery package'],
    concise_answer: 'Do not deliver a damaged package.'
  };
  const decision = buildDriverHelpDecision('How do I confirm a package delivery?', [damageRecord, ...records]);

  assert.equal(decision.response_mode, 'CLARIFY');
  assert.match(decision.clarification_prompt, /what do you mean/i);
  assert.equal(decision.clarification_options.length, 4);
  assert.ok(decision.clarification_options.every((option) => option.query));
  assert.ok(!decision.candidates.some((candidate) => candidate.knowledge_id === damageRecord.knowledge_id));
});

test('withholds an answer when only a nonverified record matches', () => {
  const decision = buildDriverHelpDecision('scanner exploded', records);
  assert.equal(decision.response_mode, 'ESCALATE');
  assert.deepEqual(decision.selected_records, []);
  assert.match(decision.escalation_message, /do not establish a complete approved answer/i);
});

test('uses session context only as a ranking boost and never as a verification bypass', () => {
  const ranked = rankKnowledgeRecords('package help', records, {
    knowledge_ids: ['KNO-DEL-SIG-DSR-001', 'KNO-UNSAFE-GUESS-001']
  });
  assert.ok(ranked.some((candidate) => candidate.record.knowledge_id === 'KNO-UNSAFE-GUESS-001'));
  const decision = buildDriverHelpDecision('scanner exploded', records, {
    knowledge_ids: ['KNO-UNSAFE-GUESS-001']
  });
  assert.equal(decision.response_mode, 'ESCALATE');
});

test('uses a validated language pattern to ask for required clarification', () => {
  const patternedRecords = records.map((record) => record.knowledge_id === 'KNO-DEL-SIG-DSR-001'
    ? {
        ...record,
        driver_question_patterns: [{
          utterance: 'signature package nobody home',
          response_mode: 'ASK_MINIMUM_CLARIFICATION',
          must_clarify: ['whether FORGE identifies the package as DSR']
        }]
      }
    : record);
  const decision = buildDriverHelpDecision('signature package nobody home', patternedRecords);
  assert.equal(decision.response_mode, 'CLARIFY');
  assert.match(decision.clarification_prompt, /whether FORGE identifies the package as DSR/i);
});
