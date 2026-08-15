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

test('exact evaluated variant can return the stored published answer', () => {
  const decision = buildDriverHelpDecision('sample indicator appeared in training', [record()]);
  assert.equal(decision.response_mode, 'ANSWER');
  assert.equal(decision.answer, 'Follow the verified sample instruction.');
  assert.equal(decision.selected_records[0].knowledge_id, 'TEST-PROCEDURE-001');
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

test('all 14 controlled records satisfy the compact initial-answer contract', () => {
  const recordsPath = path.resolve(__dirname, '../../../knowledge/operations/records.jsonl');
  const records = fs.readFileSync(recordsPath, 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse);

  assert.equal(records.length, 14);
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
