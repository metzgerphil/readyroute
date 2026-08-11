const fs = require('fs');
const path = require('path');

const { buildDriverHelpDecision } = require('../services/driverHelpRetrieval');
const { buildPublicationGateIndex } = require('./importDriverKnowledge');
const { expectedRuntimeMode, toPublishedRecord } = require('./validateDriverHelpRetrieval');

const ROOT = path.resolve(__dirname, '../../..');
const RECORDS_PATH = path.join(ROOT, 'knowledge/operations/records.jsonl');
const INDEX_CASES_PATH = path.join(ROOT, 'knowledge/evaluations/driver-language-cases.jsonl');
const CANDIDATE_CASES_PATH = path.join(
  ROOT,
  'research/fedex-ground-driver-knowledge/validation/candidate_operational_language_cases.jsonl'
);
const OUTPUT_PATH = path.join(
  ROOT,
  'research/fedex-ground-driver-knowledge/validation/candidate_operational_retrieval_results.json'
);

function readJsonLines(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function main() {
  const records = readJsonLines(RECORDS_PATH);
  const indexCases = readJsonLines(INDEX_CASES_PATH);
  const candidateCases = readJsonLines(CANDIDATE_CASES_PATH);
  const publicationGates = buildPublicationGateIndex(records);
  const variants = new Map();
  const patterns = new Map();
  for (const testCase of indexCases) {
    for (const knowledgeId of testCase.expected_knowledge_ids || []) {
      variants.set(knowledgeId, [...(variants.get(knowledgeId) || []), testCase.utterance]);
      patterns.set(knowledgeId, [...(patterns.get(knowledgeId) || []), {
        utterance: testCase.utterance,
        response_mode: testCase.response_mode,
        information_sufficiency: testCase.information_sufficiency,
        must_clarify: testCase.must_clarify || []
      }]);
    }
  }
  const indexedRecords = records.map((record) => toPublishedRecord(
    record,
    variants.get(record.knowledge_id) || [],
    patterns.get(record.knowledge_id) || [],
    publicationGates.get(record.knowledge_id)?.isPublished === true
  ));

  const results = candidateCases.map((testCase) => {
    const decision = buildDriverHelpDecision(testCase.utterance, indexedRecords);
    const expectedIds = new Set(testCase.expected_knowledge_ids || []);
    const candidateIds = decision.candidates.map((candidate) => candidate.knowledge_id);
    const allExpectedPublished = expectedIds.size > 0 && [...expectedIds].every(
      (knowledgeId) => publicationGates.get(knowledgeId)?.isPublished === true
    );
    const operationalExpectedMode = expectedRuntimeMode(testCase.response_mode);
    const productionExpectedMode = allExpectedPublished
      ? operationalExpectedMode
      : (testCase.must_clarify || []).length
        ? ['CLARIFY', 'ESCALATE']
        : ['ESCALATE'];
    return {
      case_id: testCase.case_id,
      source_candidate_case_ids: testCase.source_candidate_case_ids,
      utterance: testCase.utterance,
      expected_knowledge_ids: [...expectedIds],
      expected_mode: productionExpectedMode,
      publication_withheld: !allExpectedPublished,
      actual_mode: decision.response_mode,
      top_candidate_knowledge_id: candidateIds[0] || null,
      top_candidate_score: decision.candidates[0]?.score || 0,
      top_1_hit: expectedIds.has(candidateIds[0]),
      top_5_hit: candidateIds.some((id) => expectedIds.has(id)),
      mode_match: productionExpectedMode.includes(decision.response_mode),
      unsafe_answer_gating_failure: productionExpectedMode.includes('ESCALATE')
        && decision.response_mode === 'ANSWER'
    };
  });
  const summary = {
    schema_version: '1.0.0',
    evaluated_at: '2026-08-10',
    evaluation_design: {
      indexed_case_count: indexCases.length,
      indexed_candidate_prompts: false,
      candidate_case_count: candidateCases.length,
      independent_holdout_used: false,
      interpretation: 'Measures generalization to reviewed development prompts without adding them as retrieval synonyms.'
    },
    metrics: {
      top_1_hits: results.filter((row) => row.top_1_hit).length,
      top_5_hits: results.filter((row) => row.top_5_hit).length,
      mode_matches: results.filter((row) => row.mode_match).length,
      publication_withheld_escalations: results.filter(
        (row) => row.publication_withheld && row.actual_mode === 'ESCALATE'
      ).length,
      unsafe_answer_gating_failures: results.filter(
        (row) => row.unsafe_answer_gating_failure
      ).length
    },
    retrieval_failures: results.filter((row) => !row.top_5_hit),
    mode_failures: results.filter((row) => !row.mode_match),
    results
  };
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({
    cases: results.length,
    ...summary.metrics,
    retrieval_failures: summary.retrieval_failures.length,
    mode_failures: summary.mode_failures.length,
    output: OUTPUT_PATH
  }, null, 2)}\n`);
  if (summary.metrics.unsafe_answer_gating_failures > 0) process.exitCode = 2;
}

if (require.main === module) main();

module.exports = { main };
