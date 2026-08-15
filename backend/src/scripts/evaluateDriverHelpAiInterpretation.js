#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const {
  createDriverHelpAiInterpreter,
  resolveDriverHelpAiInterpretationMode,
  validateInterpretation
} = require('../services/driverHelpAiInterpreter');

const root = path.resolve(__dirname, '../../..');

function readJsonl(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function expectedDecision(testCase) {
  return [
    'ASK_MINIMUM_CLARIFICATION',
    'CLARIFY',
    'IMMEDIATE_SAFETY_ACTION_THEN_CLARIFY'
  ].includes(testCase.response_mode) ? 'CLARIFY' : 'ANSWER';
}

function candidateRecord(record) {
  return {
    knowledge_id: record.knowledge_id,
    version: record.record_version,
    canonical_situation: record.canonical_situation,
    normalized_description: record.normalized_description || '',
    applicability: record.applicability || [],
    conditions: record.conditions || [],
    exceptions: record.exceptions || [],
    clarification_requirements: record.clarification_requirements || [],
    driver_question_variants: record.driver_question_variants || [],
    driver_question_patterns: record.driver_question_patterns || []
  };
}

async function main() {
  const configuredMode = resolveDriverHelpAiInterpretationMode();
  const interpreter = createDriverHelpAiInterpreter();
  if (!interpreter) {
    throw new Error('AI interpretation is not configured with shadow or active mode, a model, and an API key.');
  }

  const candidates = readJsonl('knowledge/operations/records.jsonl')
    .filter((record) => record.production_eligibility?.publication_ready === true)
    .map(candidateRecord);
  const cases = readJsonl('knowledge/evaluations/driver-language-cases.jsonl');
  const outOfCorpusCases = readJsonl('knowledge/evaluations/out-of-corpus-cases.jsonl');
  const evaluationCases = [
    ...cases.map((testCase) => ({ ...testCase, evaluation_type: 'CURATED_LANGUAGE' })),
    ...outOfCorpusCases.map((testCase) => ({ ...testCase, evaluation_type: 'OUT_OF_CORPUS' }))
  ];
  const results = new Array(evaluationCases.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < evaluationCases.length) {
      const index = nextIndex;
      nextIndex += 1;
      const testCase = evaluationCases[index];
      const startedAt = Date.now();
      try {
        const raw = await interpreter({
          safety_identifier: 'rr_shadow_evaluation',
          driver_question: testCase.utterance,
          conversation_context: {},
          candidate_records: candidates
        });
        const interpretation = validateInterpretation(raw, candidates);
        const expectedKnowledgeIds = testCase.expected_knowledge_ids || [];
        const isOutOfCorpus = testCase.evaluation_type === 'OUT_OF_CORPUS';
        const expectedResponseMode = isOutOfCorpus ? null : expectedDecision(testCase);
        results[index] = {
          case_id: testCase.case_id,
          evaluation_type: testCase.evaluation_type,
          expected_knowledge_ids: expectedKnowledgeIds,
          actual_knowledge_id: interpretation?.knowledge_id || null,
          expected_response_mode: expectedResponseMode,
          actual_response_mode: interpretation?.decision || null,
          record_match: isOutOfCorpus
            ? interpretation === null
            : Boolean(interpretation && expectedKnowledgeIds.includes(interpretation.knowledge_id)),
          response_mode_match: isOutOfCorpus
            ? interpretation === null
            : interpretation?.decision === expectedResponseMode,
          valid_result: isOutOfCorpus ? interpretation === null : Boolean(interpretation),
          latency_ms: Date.now() - startedAt,
          error: null
        };
      } catch (error) {
        results[index] = {
          case_id: testCase.case_id,
          evaluation_type: testCase.evaluation_type,
          expected_knowledge_ids: testCase.expected_knowledge_ids || [],
          actual_knowledge_id: null,
          expected_response_mode: expectedDecision(testCase),
          actual_response_mode: null,
          record_match: false,
          response_mode_match: false,
          valid_result: false,
          latency_ms: Date.now() - startedAt,
          error: error.name || 'Error'
        };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(4, evaluationCases.length) }, () => worker()));

  const validResults = results.filter((result) => result.valid_result);
  const recordMatches = results.filter((result) => result.record_match);
  const responseModeMatches = results.filter((result) => result.response_mode_match);
  const errors = results.filter((result) => result.error);
  const unsafeOutOfCorpusSelections = results.filter((result) => (
    result.evaluation_type === 'OUT_OF_CORPUS' && result.actual_knowledge_id
  ));
  const mismatches = results.filter((result) => !result.record_match || !result.response_mode_match);
  const latencies = results.map((result) => result.latency_ms).sort((left, right) => left - right);
  const percentile95Index = Math.max(0, Math.ceil(latencies.length * 0.95) - 1);

  console.log(JSON.stringify({
    configured_mode: configuredMode,
    model: process.env.READYROUTE_DRIVER_HELP_MODEL,
    total_cases: results.length,
    curated_language_cases: cases.length,
    out_of_corpus_cases: outOfCorpusCases.length,
    valid_results: validResults.length,
    record_matches: recordMatches.length,
    response_mode_matches: responseModeMatches.length,
    errors: errors.length,
    unsafe_out_of_corpus_selections: unsafeOutOfCorpusSelections.length,
    average_latency_ms: Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length),
    p95_latency_ms: latencies[percentile95Index],
    ready_for_active: mismatches.length === 0 && errors.length === 0,
    mismatches: mismatches.map((result) => ({
      case_id: result.case_id,
      evaluation_type: result.evaluation_type,
      expected_knowledge_ids: result.expected_knowledge_ids,
      actual_knowledge_id: result.actual_knowledge_id,
      expected_response_mode: result.expected_response_mode,
      actual_response_mode: result.actual_response_mode,
      valid_result: result.valid_result,
      error: result.error
    }))
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
