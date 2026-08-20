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
  loadIndexedReferenceRecords
} = require('./runDriverHelpStability');
const { shorthandVariant, typoVariant } = require('./runDriverHelpGoldGate');

const ROOT = path.resolve(__dirname, '../../..');
const SCENARIOS_PATH = path.join(ROOT, 'knowledge/evaluations/conversation-scenarios.jsonl');

function readJsonLines(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

const VARIATION_FAMILIES = [
  { name: 'CANONICAL', transform: (input) => input },
  { name: 'CASE_AND_PUNCTUATION', transform: (input) => `  ${String(input).toUpperCase()}!!!  ` },
  {
    name: 'CONVERSATIONAL_FRAMING',
    transform: (input, turnIndex) => turnIndex === 0
      ? `Please help — ${input}`
      : `My answer is: ${input}`
  },
  {
    name: 'EXPLICIT_REPLY_FRAMING',
    transform: (input, turnIndex) => turnIndex === 0
      ? `I asked the question: “${input}”`
      : `Driver answered: ${input}`
  },
  { name: 'TYPO', transform: (input) => typoVariant(input) },
  { name: 'DRIVER_SHORTHAND', transform: (input) => shorthandVariant(input) }
];

function selectedId(decision) {
  return decision.selected_records?.[0]?.knowledge_id
    || decision.candidates?.[0]?.knowledge_id
    || null;
}

function runScenario(scenario, family, records) {
  let context = {};
  return scenario.turns.map((turn, turnIndex) => {
    const input = family.transform(turn.input, turnIndex);
    const runtime = buildDeterministicRuntimeDecision(input, records, context);
    const decision = runtime.decision;
    const actualId = selectedId(decision);
    const failures = [];

    if (actualId !== turn.expected_knowledge_id) {
      failures.push({
        category: 'CONTEXT_RETRIEVAL',
        expected: turn.expected_knowledge_id,
        actual: actualId
      });
    }
    if (decision.response_mode !== turn.expected_mode) {
      failures.push({
        category: 'CONTEXT_RESPONSE_MODE',
        expected: turn.expected_mode,
        actual: decision.response_mode
      });
    }
    if (turn.clarification_contains && !String(decision.clarification_prompt || '')
      .toLowerCase().includes(String(turn.clarification_contains).toLowerCase())) {
      failures.push({
        category: 'CLARIFICATION_RELEVANCE',
        expected: turn.clarification_contains,
        actual: decision.clarification_prompt || null
      });
    }
    for (const forbidden of turn.clarification_not_contains || []) {
      if (String(decision.clarification_prompt || '').toLowerCase().includes(String(forbidden).toLowerCase())) {
        failures.push({
          category: 'REDUNDANT_CLARIFICATION',
          expected: `prompt without ${forbidden}`,
          actual: decision.clarification_prompt
        });
      }
    }
    if (turn.expected_direct_answer) {
      const actual = decision.answer_structure?.direct_answer || decision.answer || null;
      if (actual !== turn.expected_direct_answer) {
        failures.push({
          category: 'ANSWER_SPECIFICITY',
          expected: turn.expected_direct_answer,
          actual
        });
      }
    }
    if (turn.expected_barcode_symbology && decision.barcode?.symbology !== turn.expected_barcode_symbology) {
      failures.push({
        category: 'BARCODE_SYMBOLOGY',
        expected: turn.expected_barcode_symbology,
        actual: decision.barcode?.symbology || null
      });
    }
    if (turn.expected_barcode_value && decision.barcode?.value !== turn.expected_barcode_value) {
      failures.push({
        category: 'BARCODE_VALUE',
        expected: turn.expected_barcode_value,
        actual: decision.barcode?.value || null
      });
    }
    if (decision.response_mode === 'ANSWER' && !decision.selected_records?.length) {
      failures.push({ category: 'AUTHORITY_TRACE', expected: 'published canonical record', actual: null });
    }
    if (decision.response_mode === 'CLARIFY' && !String(decision.clarification_prompt || '').trim()) {
      failures.push({ category: 'CLARIFICATION_PROMPT', expected: 'one minimum question', actual: null });
    }

    const result = {
      scenario_id: scenario.scenario_id,
      variation_family: family.name,
      turn: turnIndex + 1,
      input,
      expected_mode: turn.expected_mode,
      actual_mode: decision.response_mode,
      expected_knowledge_id: turn.expected_knowledge_id,
      actual_knowledge_id: actualId,
      response: decision.answer_structure?.direct_answer
        || decision.answer
        || decision.clarification_prompt
        || decision.escalation_message
        || null,
      failures
    };
    context = buildNextSessionContext(runtime.decisionContext, input, decision);
    return result;
  });
}

function main() {
  const scenarios = readJsonLines(SCENARIOS_PATH);
  const records = [...loadIndexedRecords(), ...loadIndexedReferenceRecords()];
  const results = scenarios.flatMap((scenario) => (
    VARIATION_FAMILIES.flatMap((family) => runScenario(scenario, family, records))
  ));
  const failures = results.flatMap((result) => result.failures.map((failure) => ({
    scenario_id: result.scenario_id,
    variation_family: result.variation_family,
    turn: result.turn,
    input: result.input,
    ...failure
  })));
  const failedResponses = results.filter((result) => result.failures.length > 0).length;
  const summary = {
    product: 'Ready Route Answers',
    evaluation: 'clarification_and_followup_regression',
    generated_at: new Date().toISOString(),
    scenarios: scenarios.length,
    canonical_turns: scenarios.reduce((total, scenario) => total + scenario.turns.length, 0),
    variation_families: VARIATION_FAMILIES.map((family) => family.name),
    total_responses: results.length,
    passing_responses: results.length - failedResponses,
    failed_responses: failedResponses,
    failures: failures.length,
    pass_rate: Number(((results.length - failedResponses) / results.length).toFixed(6)),
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

module.exports = { VARIATION_FAMILIES, main, runScenario };
