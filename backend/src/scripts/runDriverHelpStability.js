#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-service-role-key';

const {
  applyClarificationAnswerToContext,
  buildContextualQuestion,
  buildNextSessionContext
} = require('../services/driverHelp');
const { buildDriverHelpDecision } = require('../services/driverHelpRetrieval');
const { buildPublicationGateIndex } = require('./importDriverKnowledge');
const {
  expectedRuntimeMode,
  toPublishedRecord
} = require('./validateDriverHelpRetrieval');

const ROOT = path.resolve(__dirname, '../../..');
const RECORDS_PATH = path.join(ROOT, 'knowledge/operations/records.jsonl');
const CASES_PATH = path.join(ROOT, 'knowledge/evaluations/driver-language-cases.jsonl');
const CONVERSATIONS_PATH = path.join(ROOT, 'knowledge/evaluations/conversation-scenarios.jsonl');
const OUT_OF_CORPUS_PATH = path.join(ROOT, 'knowledge/evaluations/out-of-corpus-cases.jsonl');

function readJsonLines(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function parseArguments(argv = process.argv.slice(2)) {
  const args = { repeat: 3, report: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--repeat') args.repeat = Number(argv[index += 1]);
    else if (argv[index] === '--report') args.report = path.resolve(argv[index += 1]);
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (!Number.isInteger(args.repeat) || args.repeat < 1 || args.repeat > 20) {
    throw new Error('--repeat must be an integer from 1 to 20');
  }
  return args;
}

function loadIndexedRecords() {
  const records = readJsonLines(RECORDS_PATH);
  const cases = readJsonLines(CASES_PATH);
  const gates = buildPublicationGateIndex(records);
  const variants = new Map();
  const patterns = new Map();
  for (const testCase of cases) {
    for (const knowledgeId of testCase.expected_knowledge_ids || []) {
      variants.set(knowledgeId, [...(variants.get(knowledgeId) || []), testCase.utterance]);
      patterns.set(knowledgeId, [...(patterns.get(knowledgeId) || []), {
        utterance: testCase.utterance,
        response_mode: testCase.response_mode,
        information_sufficiency: testCase.information_sufficiency,
        must_clarify: testCase.must_clarify || [],
        ...(testCase.answer_override ? { answer_override: testCase.answer_override } : {})
      }]);
    }
  }
  return records.map((record) => toPublishedRecord(
    record,
    variants.get(record.knowledge_id) || [],
    patterns.get(record.knowledge_id) || [],
    gates.get(record.knowledge_id)?.isPublished === true
  ));
}

function selectedKnowledgeId(decision) {
  return decision.selected_records?.[0]?.knowledge_id
    || decision.candidates?.[0]?.knowledge_id
    || null;
}

function failure({ suite, caseId, run, category, expected, actual, input, severity = 'CRITICAL' }) {
  return { suite, case_id: caseId, run, category, severity, input, expected, actual };
}

function validateAnswerContract(decision, metadata) {
  const failures = [];
  if (decision.response_mode !== 'ANSWER') return failures;
  const structure = decision.answer_structure || {};
  if (!String(structure.direct_answer || '').trim()) {
    failures.push(failure({ ...metadata, category: 'ANSWER_FORMAT', expected: 'direct answer', actual: null }));
  }
  if (!Array.isArray(structure.steps) || structure.steps.length < 1 || structure.steps.length > 4) {
    failures.push(failure({ ...metadata, category: 'ANSWER_FORMAT', expected: '1-4 steps', actual: structure.steps?.length ?? null }));
  }
  const driverFacingText = [structure.direct_answer, ...(structure.steps || []), structure.watch_for]
    .filter(Boolean).join(' ');
  if (/\b(?:pickup|delivery) (?:reason|status )?code\b/i.test(driverFacingText)) {
    failures.push(failure({ ...metadata, category: 'TERMINOLOGY', expected: 'Code N', actual: driverFacingText }));
  }
  if (!decision.selected_records?.length) {
    failures.push(failure({ ...metadata, category: 'SAFETY_TRACE', expected: 'published canonical record', actual: null }));
  }
  return failures;
}

function wordingVariations(utterance) {
  return [
    `  ${String(utterance).toUpperCase()}!!!  `,
    `Please help — ${utterance}`,
    `I asked the question: “${utterance}”`
  ];
}

function runOnce({ run, records, cases, conversations, outOfCorpus }) {
  const failures = [];
  let assertions = 0;

  for (const testCase of cases) {
    const expectedIds = testCase.expected_knowledge_ids || [];
    const expectedModes = expectedRuntimeMode(testCase.response_mode);
    const inputs = [testCase.utterance, ...wordingVariations(testCase.utterance)];
    for (const [variationIndex, input] of inputs.entries()) {
      const decision = buildDriverHelpDecision(input, records);
      const actualId = selectedKnowledgeId(decision);
      const caseId = variationIndex === 0 ? testCase.case_id : `${testCase.case_id}:VAR-${variationIndex}`;
      assertions += 2;
      if (!expectedIds.includes(actualId)) {
        failures.push(failure({
          suite: variationIndex ? 'WORDING_VARIATION' : 'CURATED_LANGUAGE',
          caseId,
          run,
          category: 'RETRIEVAL',
          input,
          expected: expectedIds,
          actual: actualId
        }));
      }
      if (!expectedModes.includes(decision.response_mode)) {
        failures.push(failure({
          suite: variationIndex ? 'WORDING_VARIATION' : 'CURATED_LANGUAGE',
          caseId,
          run,
          category: 'RESPONSE_MODE',
          input,
          expected: expectedModes,
          actual: decision.response_mode
        }));
      }
      failures.push(...validateAnswerContract(decision, {
        suite: variationIndex ? 'WORDING_VARIATION' : 'CURATED_LANGUAGE',
        caseId,
        run,
        input
      }));
      assertions += decision.response_mode === 'ANSWER' ? 3 : 0;
    }
  }

  for (const scenario of conversations) {
    let context = {};
    for (const [turnIndex, turn] of scenario.turns.entries()) {
      const contextualQuestion = buildContextualQuestion(turn.input, context);
      const decisionContext = applyClarificationAnswerToContext(context, turn.input);
      const decision = buildDriverHelpDecision(contextualQuestion, records, decisionContext);
      const actualId = selectedKnowledgeId(decision);
      const caseId = `${scenario.scenario_id}:TURN-${turnIndex + 1}`;
      assertions += 2;
      if (turn.expected_knowledge_id !== actualId) {
        failures.push(failure({
          suite: 'MULTI_TURN', caseId, run, category: 'CONTEXT_RETRIEVAL', input: turn.input,
          expected: turn.expected_knowledge_id, actual: actualId
        }));
      }
      if (turn.expected_mode !== decision.response_mode) {
        failures.push(failure({
          suite: 'MULTI_TURN', caseId, run, category: 'CONTEXT_RESPONSE_MODE', input: turn.input,
          expected: turn.expected_mode, actual: decision.response_mode
        }));
      }
      if (turn.clarification_contains) {
        assertions += 1;
        if (!String(decision.clarification_prompt || '').toLowerCase()
          .includes(String(turn.clarification_contains).toLowerCase())) {
          failures.push(failure({
            suite: 'MULTI_TURN', caseId, run, category: 'CLARIFICATION', input: turn.input,
            expected: turn.clarification_contains, actual: decision.clarification_prompt || null
          }));
        }
      }
      failures.push(...validateAnswerContract(decision, {
        suite: 'MULTI_TURN', caseId, run, input: turn.input
      }));
      assertions += decision.response_mode === 'ANSWER' ? 3 : 0;
      context = buildNextSessionContext(decisionContext, turn.input, decision);
    }
  }

  for (const testCase of outOfCorpus) {
    const decision = buildDriverHelpDecision(testCase.utterance, records);
    assertions += 2;
    if (decision.response_mode !== testCase.expected_mode) {
      failures.push(failure({
        suite: 'OUT_OF_CORPUS', caseId: testCase.case_id, run, category: 'UNSUPPORTED_ANSWER',
        input: testCase.utterance, expected: testCase.expected_mode, actual: decision.response_mode
      }));
    }
    if (decision.response_mode === 'ANSWER') {
      failures.push(failure({
        suite: 'OUT_OF_CORPUS', caseId: testCase.case_id, run, category: 'UNSUPPORTED_ANSWER',
        input: testCase.utterance, expected: 'no operational answer', actual: decision.answer
      }));
    }
  }

  return { assertions, failures };
}

function buildSummary({ args, records, cases, conversations, outOfCorpus, runs }) {
  const failures = runs.flatMap((result) => result.failures);
  const assertions = runs.reduce((sum, result) => sum + result.assertions, 0);
  const byCategory = failures.reduce((counts, item) => {
    counts[item.category] = (counts[item.category] || 0) + 1;
    return counts;
  }, {});
  return {
    product: 'Ready Route Answers',
    evaluation: 'closed_loop_stability_gate',
    generated_at: new Date().toISOString(),
    repeat_runs: args.repeat,
    published_records: records.filter((record) => record.is_published).length,
    curated_language_cases: cases.length,
    generated_wording_variations: cases.length * 3,
    conversation_scenarios: conversations.length,
    conversation_turns: conversations.reduce((sum, item) => sum + item.turns.length, 0),
    out_of_corpus_cases: outOfCorpus.length,
    assertions,
    passed_assertions: assertions - failures.length,
    pass_rate: assertions ? Number(((assertions - failures.length) / assertions).toFixed(6)) : 0,
    critical_failures: failures.filter((item) => item.severity === 'CRITICAL').length,
    failures_by_category: byCategory,
    consecutive_clean_runs: runs.filter((result) => result.failures.length === 0).length,
    stability_gate: failures.length === 0 ? 'PASS' : 'FAIL',
    expansion_gate: failures.length === 0 ? 'OPEN' : 'BLOCKED',
    failures: failures.slice(0, 100)
  };
}

function main(argv) {
  const args = parseArguments(argv);
  const records = loadIndexedRecords();
  const cases = readJsonLines(CASES_PATH);
  const conversations = readJsonLines(CONVERSATIONS_PATH);
  const outOfCorpus = readJsonLines(OUT_OF_CORPUS_PATH);
  const runs = Array.from({ length: args.repeat }, (_, index) => runOnce({
    run: index + 1,
    records,
    cases,
    conversations,
    outOfCorpus
  }));
  const summary = buildSummary({ args, records, cases, conversations, outOfCorpus, runs });
  const output = `${JSON.stringify(summary, null, 2)}\n`;
  if (args.report) {
    fs.mkdirSync(path.dirname(args.report), { recursive: true });
    fs.writeFileSync(args.report, output);
  }
  process.stdout.write(output);
  if (summary.stability_gate !== 'PASS') process.exitCode = 2;
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

module.exports = {
  buildSummary,
  loadIndexedRecords,
  main,
  parseArguments,
  runOnce,
  validateAnswerContract,
  wordingVariations
};
