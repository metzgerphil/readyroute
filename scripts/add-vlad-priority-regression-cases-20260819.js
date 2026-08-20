#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CASES_PATH = path.join(ROOT, 'research/fedex-ground-driver-knowledge/validation/driver_language_cases.jsonl');
const PRIORITY_PATH = path.join(ROOT, 'research/fedex-ground-driver-knowledge/validation/vlad_priority_51_cases.jsonl');
const RECORDS_PATH = path.join(ROOT, 'research/fedex-ground-driver-knowledge/knowledge/records.jsonl');
const CONVERSATIONS_PATH = path.join(ROOT, 'research/fedex-ground-driver-knowledge/validation/conversation_scenarios.jsonl');

const INDEXED_ENTRIES = new Set([
  '3', '8', '12', '13', '15', '17', '18', '19', '23', '25', '26', '29', '31', '32',
  '33', '35', '36', '37', '38', '41', '42', '44', '45', '46', '47', '48', '50'
]);

const INPUT_OVERRIDES = new Map([
  ['12', 'The customer specifically canceled the pickup before any attempt. What should I do?'],
  ['13', 'I attempted the pickup, the business was closed, and I obtained zero packages. What should I do?'],
  ['15', 'The pickup was canceled after I attempted it at a closed location with zero packages. Is that Code 11?'],
  ['19', 'Another driver is helping with a bulk transfer. Whose manifest must start it?'],
  ['42', 'A non-HAL box appeared at my HAL transfer stop, and hold-location personnel confirmed with high confidence that it belongs there. What do I do?'],
  ['47', 'My hazmat return has DOT Special Permit 14691 SF-136 and OP-908 attached. What do I do?']
]);

function readJsonLines(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function writeJsonLines(filePath, rows) {
  fs.writeFileSync(filePath, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
}

const cases = readJsonLines(CASES_PATH);
const priorityCases = readJsonLines(PRIORITY_PATH);
const records = new Map(readJsonLines(RECORDS_PATH).map((record) => [record.knowledge_id, record]));
const conversations = readJsonLines(CONVERSATIONS_PATH);

// Vlad's priority review approved asking whether the HAL stop was already
// closed for this exact wording. Preserve broader two-branch answers for other
// phrasings, but let the later priority determination control this collision.
const earlierHalCase = cases.find((item) => item.case_id === 'HAL-UNABLE-001');
if (earlierHalCase) {
  earlierHalCase.must_clarify = [
    'Was the HAL delivery stop already closed when the location refused the package?'
  ];
  earlierHalCase.must_not_do = [];
  earlierHalCase.information_sufficiency = 'CONDITIONALLY_SUFFICIENT';
  earlierHalCase.response_mode = 'ASK_MINIMUM_CLARIFICATION';
  delete earlierHalCase.answer_override;
}

const code20ContextCase = cases.find((item) => item.case_id === 'CORR40-PICKUP-ZERO-CUSTOMER-001');
if (code20ContextCase?.answer_override) {
  code20ContextCase.answer_override.direct_answer = 'Use Code 20 when you attempted the listed pickup and the customer confirms there are no packages.';
}

const halConversation = conversations.find((item) => item.scenario_id === 'CONV-HAL-REFUSAL-001');
if (halConversation) {
  halConversation.description = 'A HAL refusal asks whether the stop was already closed, then the timing detail selects the approved branch without looping.';
  halConversation.turns[0].expected_mode = 'CLARIFY';
  halConversation.turns[0].clarification_contains = 'already closed';
}

for (const scenarioId of ['CONV-ZERO-PICKUP-001', 'CONV-ROBUST-ZERO-CUSTOMER-001', 'CONV-ROBUST-ZERO-CUSTOMER-SHORT-001']) {
  const scenario = conversations.find((item) => item.scenario_id === scenarioId);
  const finalTurn = scenario?.turns?.at(-1);
  if (finalTurn?.expected_knowledge_id === 'KNO-PUP-CODE20-001') {
    finalTurn.expected_direct_answer = 'Use Code 20 when you attempted the listed pickup and the customer confirms there are no packages.';
  }
}

const isrConversation = conversations.find((item) => item.scenario_id === 'CONV-P51-ISR-DOORTAG-001');
if (isrConversation) {
  isrConversation.turns[0].expected_knowledge_id = 'KNO-DEL-SIG-ASR-001';
}

for (const priority of priorityCases.filter((item) => INDEXED_ENTRIES.has(item.report_entry))) {
  const caseId = `P51-PRIORITY-PHRASING-${String(priority.priority_case_id).slice(-2)}`;
  const record = records.get(priority.expected_knowledge_ids[0]);
  if (!record) throw new Error(`${priority.priority_case_id} has no canonical operational target`);
  const mode = priority.expected_mode === 'CLARIFY'
    ? 'ASK_MINIMUM_CLARIFICATION'
    : 'DIRECT_SOURCE_GROUNDED_ANSWER';
  const nextCase = {
    case_id: caseId,
    utterance: INPUT_OVERRIDES.get(priority.report_entry) || priority.title,
    semantic_variations: [],
    expected_knowledge_ids: priority.expected_knowledge_ids,
    must_clarify: priority.expected_mode === 'CLARIFY'
      ? (record.clarification_requirements || []).slice(0, 1)
      : [],
    must_not_do: [],
    case_type: 'VLAD_PRIORITY_51_APPROVED_PHRASING',
    information_sufficiency: priority.expected_mode === 'CLARIFY'
      ? 'CONDITIONALLY_SUFFICIENT'
      : 'SUFFICIENT',
    response_mode: mode,
    authority_source_ids: priority.authority_source_ids
  };
  const existingIndex = cases.findIndex((item) => item.case_id === caseId);
  if (existingIndex >= 0) cases[existingIndex] = nextCase;
  else cases.push(nextCase);
}

writeJsonLines(CASES_PATH, cases);
writeJsonLines(CONVERSATIONS_PATH, conversations);
process.stdout.write(`${JSON.stringify({
  driver_language_cases: cases.length,
  added_or_updated_vlad_priority_phrasings: INDEXED_ENTRIES.size
}, null, 2)}\n`);
