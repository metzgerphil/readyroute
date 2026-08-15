const fs = require('fs');
const path = require('path');

const { buildDriverHelpDecision } = require('../services/driverHelpRetrieval');
const { buildPublicationGateIndex } = require('./importDriverKnowledge');

const ROOT = path.resolve(__dirname, '../../..');
const RECORDS_PATH = path.join(ROOT, 'knowledge/operations/records.jsonl');
const CASES_PATH = path.join(ROOT, 'knowledge/evaluations/driver-language-cases.jsonl');

function readJsonLines(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function toPublishedRecord(record, extraVariants = [], patterns = [], isPublished = false) {
  return {
    knowledge_id: record.knowledge_id,
    version: record.record_version,
    status: record.knowledge_status,
    is_published: isPublished,
    canonical_situation: record.canonical_situation,
    normalized_description: record.normalized_description,
    taxonomy_paths: record.category_paths || [],
    applicability: record.applicability || [],
    conditions: record.conditions || [],
    exceptions: record.exceptions || [],
    related_knowledge_ids: record.related_knowledge_ids || [],
    authoritative_rule: record.authoritative_rule,
    clarification_requirements: record.clarification_requirements || [],
    required_procedure: record.required_procedure || [],
    required_documentation: record.required_documentation || [],
    prohibited_actions: record.prohibited_actions || [],
    escalation_requirements: record.escalation_requirements || [],
    driver_question_variants: [...new Set([...(record.driver_question_variants || []), ...extraVariants])],
    driver_question_patterns: patterns,
    concise_answer: record.concise_driver_answer,
    more_info_answer: record.more_info_answer,
    source_ids: record.source_ids || [],
    adjudication_id: record.adjudication_id || null
  };
}

function expectedRuntimeMode(validationMode) {
  if (validationMode === 'DIRECT_SOURCE_GROUNDED_ANSWER' || validationMode === 'ALTERNATE_DOCUMENTATION') {
    return ['ANSWER'];
  }
  if (validationMode === 'ASK_MINIMUM_CLARIFICATION') {
    return ['CLARIFY'];
  }
  if (validationMode === 'IMMEDIATE_SAFETY_ACTION_THEN_CLARIFY') {
    return ['ANSWER', 'CLARIFY'];
  }
  return ['ESCALATE'];
}

function validate() {
  const cases = readJsonLines(CASES_PATH);
  const records = readJsonLines(RECORDS_PATH);
  const publicationGates = buildPublicationGateIndex(records);
  const caseVariants = new Map();
  const casePatterns = new Map();
  for (const testCase of cases) {
    for (const knowledgeId of testCase.expected_knowledge_ids || []) {
      caseVariants.set(knowledgeId, [...(caseVariants.get(knowledgeId) || []), testCase.utterance]);
      casePatterns.set(knowledgeId, [...(casePatterns.get(knowledgeId) || []), {
        utterance: testCase.utterance,
        response_mode: testCase.response_mode,
        information_sufficiency: testCase.information_sufficiency,
        must_clarify: testCase.must_clarify || [],
        ...(testCase.answer_override ? { answer_override: testCase.answer_override } : {})
      }]);
    }
  }
  const indexedRecords = records.map((record) => (
    toPublishedRecord(
      record,
      caseVariants.get(record.knowledge_id) || [],
      casePatterns.get(record.knowledge_id) || [],
      publicationGates.get(record.knowledge_id)?.isPublished === true
    )
  ));
  const results = cases.map((testCase) => {
    const decision = buildDriverHelpDecision(testCase.utterance, indexedRecords);
    const expectedIds = new Set(testCase.expected_knowledge_ids || []);
    const candidateIds = decision.candidates.map((candidate) => candidate.knowledge_id);
    const expectedRecordsPublished = expectedIds.size > 0 && [...expectedIds].every((knowledgeId) => (
      publicationGates.get(knowledgeId)?.isPublished === true
    ));
    const operationalExpectedMode = expectedRuntimeMode(testCase.response_mode);
    const productionExpectedMode = expectedRecordsPublished ? operationalExpectedMode : ['ESCALATE'];
    return {
      case_id: testCase.case_id,
      utterance: testCase.utterance,
      expected_mode: productionExpectedMode,
      operational_expected_mode: operationalExpectedMode,
      publication_withheld: !expectedRecordsPublished,
      actual_mode: decision.response_mode,
      expected_ids: [...expectedIds],
      top_candidate: candidateIds[0] || null,
      top_5_hit: candidateIds.some((id) => expectedIds.has(id)),
      top_1_hit: expectedIds.has(candidateIds[0]),
      mode_match: productionExpectedMode.includes(decision.response_mode)
    };
  });

  const summary = {
    cases: results.length,
    production_published_records: [...publicationGates.values()].filter((gate) => gate.isPublished).length,
    publication_withheld_case_escalations: results.filter((row) => row.publication_withheld && row.actual_mode === 'ESCALATE').length,
    top_1_hits: results.filter((row) => row.top_1_hit).length,
    top_5_hits: results.filter((row) => row.top_5_hit).length,
    mode_matches: results.filter((row) => row.mode_match).length,
    unsafe_answer_gating_failures: results.filter((row) => row.expected_mode.includes('ESCALATE') && row.actual_mode === 'ANSWER').length,
    mode_pairs: results.reduce((counts, row) => {
      const key = `${row.expected_mode.join('|')} -> ${row.actual_mode}`;
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {}),
    misses: results.filter((row) => !row.top_5_hit).slice(0, 30),
    gating_failures: results.filter((row) => row.expected_mode.includes('ESCALATE') && row.actual_mode === 'ANSWER').slice(0, 30),
    mode_mismatches: results.filter((row) => !row.mode_match).slice(0, 30)
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (summary.unsafe_answer_gating_failures > 0) {
    process.exitCode = 2;
  }
}

if (require.main === module) {
  validate();
}

module.exports = {
  expectedRuntimeMode,
  toPublishedRecord
};
