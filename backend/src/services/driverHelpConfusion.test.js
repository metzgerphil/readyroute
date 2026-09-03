const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-service-role-key';

const {
  buildDeterministicRuntimeDecision,
  buildNextSessionContext
} = require('./driverHelp');
const { loadIndexedRecords } = require('../scripts/runDriverHelpStability');

const records = loadIndexedRecords().filter((record) => record.is_published);

function decide(question) {
  return buildDeterministicRuntimeDecision(question, records, {}).decision;
}

function selectedId(decision) {
  return decision.selected_records?.[0]?.knowledge_id
    || decision.candidates?.[0]?.knowledge_id
    || null;
}

const highRiskBoundaries = [
  {
    name: 'wrong package scan is not a wrong work-area login',
    question: 'I scanned the wrong package into this stop but did not deliver it',
    expected: 'KNO-FORGE-DELETE-SCAN-001',
    forbidden: ['KNO-FORGE-WRONG-WORK-AREA-001', 'KNO-DEL-MISDELIVERY-RECOVERY-001']
  },
  {
    name: 'completed misdelivery is not a deletable scan',
    question: 'I delivered the package to the wrong house and need to recover it today',
    expected: 'KNO-DEL-MISDELIVERY-RECOVERY-001',
    forbidden: ['KNO-FORGE-DELETE-SCAN-001']
  },
  {
    name: 'wrong work-area login is not a wrong pickup assignment',
    question: 'I logged into the wrong work area and have not scanned anything yet',
    expected: 'KNO-FORGE-WRONG-WORK-AREA-001',
    forbidden: ['KNO-PUP-WRONG-WA-001', 'KNO-FORGE-DELETE-SCAN-001']
  },
  {
    name: 'canceled before attempt is not attempted zero-package pickup',
    question: 'Dispatch canceled my listed pickup before I went there',
    expected: 'KNO-PUP-CANCELED-001',
    forbidden: ['KNO-PUP-CODE20-001', 'KNO-PUP-ZERO-001']
  },
  {
    name: 'attempted zero-package pickup is not cancellation before attempt',
    question: 'I arrived and attempted the listed pickup but the customer confirmed there are no packages',
    expected: 'KNO-PUP-CODE20-001',
    forbidden: ['KNO-PUP-CANCELED-001']
  },
  {
    name: 'ordinary nonhazardous damage return is not a Hazmat emergency',
    question: 'The box is crushed, not leaking or hazardous, and I am returning it for inspection',
    expected: 'KNO-DEL-DAMAGE-INSPECTION-001',
    forbidden: ['KNO-HAZ-LEAK-001']
  },
  {
    name: 'leaking Hazmat is not an ordinary Code 010 damage return',
    question: 'The package is leaking and the label says hazardous material',
    expected: 'KNO-HAZ-LEAK-001',
    forbidden: ['KNO-DEL-DAMAGE-INSPECTION-001']
  },
  {
    name: 'ISR neighbor permission does not become DSR handling',
    question: 'Can a neighbor sign for ISR?',
    expected: 'KNO-DEL-SIG-ISR-001',
    forbidden: ['KNO-DEL-SIG-DSR-001', 'KNO-DEL-SIG-ASR-001']
  },
  {
    name: 'DSR neighbor prohibition does not become ISR handling',
    question: 'Can the neighbor sign for DSR?',
    expected: 'KNO-DEL-SIG-DSR-001',
    forbidden: ['KNO-DEL-SIG-ISR-001', 'KNO-DEL-SIG-ASR-001']
  }
];

test('high-risk neighboring procedures remain isolated', () => {
  for (const boundary of highRiskBoundaries) {
    const decision = decide(boundary.question);
    const actual = selectedId(decision);
    assert.equal(actual, boundary.expected, boundary.name);
    assert.ok(!boundary.forbidden.includes(actual), boundary.name);
  }
});

test('ambiguous high-risk wording asks for the decision-changing fact', () => {
  const cases = [
    ['I logged into the wrong work area', 'KNO-FORGE-WRONG-WORK-AREA-001', /anything (?:has )?already been scanned/i],
    ['I scanned the wrong package', 'KNO-FORGE-DELETE-SCAN-001', /only scanned|already delivered/i],
    ['My pickup was canceled', 'KNO-PUP-CANCELED-001', /attempt made/i],
    ['Package looks damaged before delivery', 'KNO-DEL-DAMAGE-INSPECTION-001', /leaking or hazardous/i],
    [
      'Signature package but signed door tag on file',
      ['KNO-DEL-SIG-ASR-001', 'KNO-DEL-SIG-DSR-001', 'KNO-DEL-SIG-ISR-001'],
      /signature service/i
    ]
  ];

  for (const [question, expected, prompt] of cases) {
    const decision = decide(question);
    if (Array.isArray(expected)) {
      assert.ok(expected.includes(selectedId(decision)), question);
    } else {
      assert.equal(selectedId(decision), expected, question);
    }
    assert.equal(decision.response_mode, 'CLARIFY', question);
    assert.match(decision.clarification_prompt, prompt, question);
  }
});

test('reviewed unsupported boundaries fail closed instead of using neighboring procedures', () => {
  const questions = [
    "Can I open a customer's package to inspect what is inside?",
    'A customer wants me to accept cash for shipping charges',
    'What does OSA mean?',
    'How do I manually enter the visible tracking number?',
    'How do I fill out OP-207?'
  ];

  for (const question of questions) {
    const decision = decide(question);
    assert.equal(decision.response_mode, 'ESCALATE', question);
    assert.equal(selectedId(decision), null, question);
    assert.equal(decision.escalation_message, 'Call your BC.', question);
  }
});

test('post-update field findings use only the approved operational record', () => {
  const cases = [
    ['This wooden bridge feels unsecured and I cannot safely drive across it', 'KNO-DEL-UNSAFE-ACCESS-001', /Code 001/i],
    ['GroundCloud shows a different route than I expected', 'KNO-GROUNDCLOUD-ROUTE-MISMATCH-001', /Call your BC/i],
    ['I do not think I can finish my whole route today', 'KNO-ROUTE-NOT-COMPLETE-001', /Call your BC/i],
    ['One package is leaking but the other packages for the same address are fine', 'KNO-DEL-LEAK-SAME-ADDRESS-001', /Deliver the packages that look fine/i],
    ['The leaking package is hazardous', 'KNO-HAZ-LEAK-001', /Call your BC/i],
    ['The leaking package is not hazardous', 'KNO-DEL-LEAK-NONHAZ-001', /Code 010/i],
    ['How do I fill out a hand sheet?', 'KNO-DOC-HANDSHEET-GENERAL-001', /four digits per cell/i],
    ['How do I do crossing?', 'KNO-DEL-NOTATION-001', /top-left/i]
  ];

  for (const [question, expected, expectedText] of cases) {
    const runtime = buildDeterministicRuntimeDecision(question, records, {});
    const decision = runtime.decision;
    const visibleText = [
      decision.answer_structure?.direct_answer,
      ...(decision.answer_structure?.procedure_steps || [])
    ].filter(Boolean).join(' ');
    assert.equal(runtime.lockedDecision, true, question);
    assert.equal(decision.response_mode, 'ANSWER', question);
    assert.equal(decision.selected_records[0].knowledge_id, expected, question);
    assert.match(visibleText, expectedText, question);
  }
});

test('a generic leak asks only whether it is hazardous and follows the selected branch', () => {
  const question = 'A package is leaking. What do I do?';
  const initial = buildDeterministicRuntimeDecision(question, records, {});
  assert.equal(initial.lockedDecision, true);
  assert.equal(initial.decision.response_mode, 'CLARIFY');
  assert.match(initial.decision.clarification_prompt, /leaking package hazardous/i);
  assert.deepEqual(
    initial.decision.clarification_options.map((option) => option.label),
    ['Hazardous', 'Not hazardous']
  );

  const uncertain = buildDeterministicRuntimeDecision(
    'The package is leaking and I do not know if it is hazardous',
    records,
    {}
  );
  assert.equal(uncertain.decision.response_mode, 'CLARIFY');
  assert.match(uncertain.decision.clarification_prompt, /leaking package hazardous/i);

  const context = buildNextSessionContext({}, question, initial.decision);
  const nonHazardous = buildDeterministicRuntimeDecision(
    'No, the leaking package is not hazardous',
    records,
    context
  );
  assert.equal(nonHazardous.decision.response_mode, 'ANSWER');
  assert.equal(
    nonHazardous.decision.selected_records[0].knowledge_id,
    'KNO-DEL-LEAK-NONHAZ-001'
  );
});

test('unknown questions use the owner-approved short fallback', () => {
  const decision = decide('How do I bake sourdough bread?');
  assert.equal(decision.response_mode, 'ESCALATE');
  assert.equal(decision.escalation_message, 'Call your BC.');
});

test('crossing mechanics do not absorb a question about crossing an unsafe bridge', () => {
  const decision = decide('How do I cross this unsafe bridge to reach the delivery?');
  assert.equal(decision.response_mode, 'ANSWER');
  assert.equal(selectedId(decision), 'KNO-DEL-UNSAFE-ACCESS-001');
});
