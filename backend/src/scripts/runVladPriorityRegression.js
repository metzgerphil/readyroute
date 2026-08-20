#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-service-role-key';

const {
  buildDeterministicRuntimeDecision,
  buildNextSessionContext
} = require('../services/driverHelp');
const {
  loadIndexedRecords,
  loadIndexedReferenceRecords,
  wordingVariations
} = require('./runDriverHelpStability');
const { shorthandVariant, typoVariant } = require('./runDriverHelpGoldGate');

const ROOT = path.resolve(__dirname, '../../..');
const CASES_PATH = path.join(ROOT, 'knowledge/evaluations/vlad-priority-51-cases.jsonl');

const INPUT_OVERRIDES = new Map([
  ['5b', "I have a package that isn't mine, how do I get it to the right route?"],
  ['12', 'The customer specifically canceled the pickup before any attempt. What should I do?'],
  ['13', 'I attempted the pickup, the business was closed, and I obtained zero packages. What should I do?'],
  ['14', 'I went to the pickup, the business was open, but the person there confirmed zero packages. What code do I use?'],
  ['15', 'The pickup was canceled after I attempted it at a closed location with zero packages. Is that Code 11?'],
  ['16', 'The pickup was open and the customer confirmed zero packages. What code do I use?'],
  ['19', 'Another driver is helping with a bulk transfer. Whose manifest must start it?'],
  ['20', 'Is Code 128 trustworthy for a vehicle scan barcode?'],
  ['42', 'A non-HAL box appeared at my HAL transfer stop, and hold-location personnel confirmed with high confidence that it belongs there. What do I do?'],
  ['47', 'My hazmat return has DOT Special Permit 14691 SF-136 and OP-908 attached. What do I do?']
]);

function readJsonLines(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function canonicalInput(testCase) {
  if (INPUT_OVERRIDES.has(testCase.report_entry)) {
    return INPUT_OVERRIDES.get(testCase.report_entry);
  }
  return String(testCase.title)
    .replace(/^\(follow-up\)\s*/i, '')
    .trim();
}

function selectedId(decision) {
  return decision.selected_records?.[0]?.knowledge_id
    || decision.candidates?.[0]?.knowledge_id
    || null;
}

function expectedMode(testCase) {
  return testCase.expected_mode === 'REFERENCE_ANSWER' ? 'ANSWER' : testCase.expected_mode;
}

function setupContext(reportEntry, records) {
  if (!['9', '10'].includes(reportEntry)) return {};
  let context = {};
  const first = buildDeterministicRuntimeDecision(
    'Signature package but signed door tag on file',
    records,
    context
  ).decision;
  context = buildNextSessionContext(context, 'Signature package but signed door tag on file', first);
  if (reportEntry === '9') return context;
  const second = buildDeterministicRuntimeDecision("It's ISR", records, context).decision;
  return buildNextSessionContext(context, "It's ISR", second);
}

function evaluateInput(testCase, input, variation, records) {
  const context = setupContext(testCase.report_entry, records);
  const decision = buildDeterministicRuntimeDecision(input, records, context).decision;
  const expectedIds = [
    ...(testCase.expected_knowledge_ids || []),
    ...(testCase.expected_reference_ids || [])
  ];
  const actualId = selectedId(decision);
  const failures = [];

  if (decision.response_mode !== expectedMode(testCase)) {
    failures.push({ category: 'RESPONSE_MODE', expected: expectedMode(testCase), actual: decision.response_mode });
  }
  if (!expectedIds.includes(actualId)) {
    failures.push({ category: 'CANONICAL_TARGET', expected: expectedIds, actual: actualId });
  }
  if (decision.response_mode === 'ANSWER' && !decision.selected_records?.length) {
    failures.push({ category: 'AUTHORITY_TRACE', expected: 'published canonical record', actual: null });
  }
  if (decision.response_mode === 'ANSWER' && decision.answer_type !== 'REFERENCE') {
    const directAnswer = String(decision.answer_structure?.direct_answer || decision.answer || '').trim();
    if (!directAnswer) {
      failures.push({ category: 'ANSWER_STRUCTURE', expected: 'concise direct answer', actual: null });
    }
  }
  if (decision.response_mode === 'CLARIFY' && !String(decision.clarification_prompt || '').trim()) {
    failures.push({ category: 'CLARIFICATION', expected: 'minimum clarification prompt', actual: null });
  }

  return {
    priority_case_id: testCase.priority_case_id,
    report_entry: testCase.report_entry,
    variation,
    input,
    expected_mode: expectedMode(testCase),
    actual_mode: decision.response_mode,
    expected_ids: expectedIds,
    actual_id: actualId,
    answer: decision.answer_structure?.direct_answer || decision.answer || decision.clarification_prompt || null,
    failures
  };
}

function main() {
  const testCases = readJsonLines(CASES_PATH);
  const records = [...loadIndexedRecords(), ...loadIndexedReferenceRecords()];
  const results = testCases.flatMap((testCase) => {
    const input = canonicalInput(testCase);
    const variants = [
      input,
      ...wordingVariations(input),
      typoVariant(input),
      shorthandVariant(input)
    ];
    return [...new Set(variants)].map((variant, index) => (
      evaluateInput(testCase, variant, index === 0 ? 'CANONICAL' : `PARAPHRASE_${index}`, records)
    ));
  });
  const failures = results.flatMap((result) => result.failures.map((failure) => ({
    priority_case_id: result.priority_case_id,
    report_entry: result.report_entry,
    variation: result.variation,
    input: result.input,
    ...failure
  })));
  const summary = {
    product: 'Ready Route Answers',
    evaluation: 'vlad_priority_51_regression',
    generated_at: new Date().toISOString(),
    canonical_cases: testCases.length,
    paraphrase_families: ['uppercase/punctuation', 'polite framing', 'quoted framing', 'typo', 'driver shorthand'],
    total_responses: results.length,
    passing_responses: results.filter((result) => result.failures.length === 0).length,
    failures: failures.length,
    pass_rate: Number(((results.length - results.filter((result) => result.failures.length > 0).length) / results.length).toFixed(6)),
    gate: failures.length ? 'FAIL' : 'PASS',
    failure_details: failures,
    results
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (failures.length) process.exitCode = 2;
  return summary;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { canonicalInput, evaluateInput, main, setupContext };
