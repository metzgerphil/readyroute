const fs = require('fs');
const path = require('path');

const { buildDriverHelpDecision } = require('../services/driverHelpRetrieval');
const {
  buildDriverHelpReferenceDecision,
  isReferenceRecord
} = require('../services/driverHelpReference');
const { buildPublicationGateIndex } = require('./importDriverKnowledge');
const { toPublishedRecord } = require('./validateDriverHelpRetrieval');

const ROOT = path.resolve(__dirname, '../../..');
const RECORDS_PATH = path.join(ROOT, 'knowledge/operations/records.jsonl');
const CASES_PATH = path.join(ROOT, 'knowledge/evaluations/driver-language-cases.jsonl');
const PACK_PATH = path.join(
  ROOT,
  'research/fedex-ground-driver-knowledge/candidate-evaluations/2026-08-10-driver-bot-pack/driver_bot_eval_pack.json'
);

function readJsonLines(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
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
        must_clarify: testCase.must_clarify || []
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

function main() {
  const records = loadIndexedRecords();
  const operationalRecords = records.filter((record) => !isReferenceRecord(record));
  const pack = JSON.parse(fs.readFileSync(PACK_PATH, 'utf8'));
  const failures = [];
  const modeCounts = {};
  let longestPrimaryAnswer = 0;

  for (const testCase of pack) {
    const decision = buildDriverHelpReferenceDecision(testCase.driver_prompt, records)
      || buildDriverHelpDecision(testCase.driver_prompt, operationalRecords);
    modeCounts[decision.response_mode] = (modeCounts[decision.response_mode] || 0) + 1;

    if (decision.response_mode === 'ANSWER') {
      longestPrimaryAnswer = Math.max(longestPrimaryAnswer, String(decision.answer || '').length);
      if (!decision.answer || !decision.selected_records.length) {
        failures.push({ id: testCase.id, failure: 'ANSWER_WITHOUT_CANONICAL_TRACE' });
      } else if (decision.selected_records.some((record) => !record.is_published
        || !['SOURCE_VERIFIED', 'READY_ROUTE_APPROVED'].includes(record.status))) {
        failures.push({ id: testCase.id, failure: 'ANSWER_FROM_NONELIGIBLE_KNOWLEDGE' });
      } else if (String(decision.answer).length > 600) {
        failures.push({ id: testCase.id, failure: 'PRIMARY_ANSWER_TOO_LONG' });
      }
    } else if (decision.response_mode === 'CLARIFY') {
      const options = decision.clarification_options || [];
      if (!decision.clarification_prompt || !options.length) {
        failures.push({ id: testCase.id, failure: 'CLARIFICATION_WITHOUT_CHOICES' });
      } else if (options.some((option) => !option.label || !option.query)) {
        failures.push({ id: testCase.id, failure: 'CLARIFICATION_CHOICE_WITHOUT_QUERY' });
      }
    } else if (decision.response_mode === 'ESCALATE') {
      if (!decision.escalation_message) {
        failures.push({ id: testCase.id, failure: 'ESCALATION_WITHOUT_DIRECTION' });
      }
    } else {
      failures.push({ id: testCase.id, failure: 'UNKNOWN_RESPONSE_MODE' });
    }
  }

  const summary = {
    cases: pack.length,
    mode_counts: modeCounts,
    longest_primary_answer_characters: longestPrimaryAnswer,
    interaction_contract_failures: failures.length,
    failures
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (failures.length) process.exitCode = 2;
}

if (require.main === module) main();

module.exports = { loadIndexedRecords, main };
