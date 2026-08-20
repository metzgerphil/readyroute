#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RECORDS_PATH = path.join(ROOT, 'research/fedex-ground-driver-knowledge/knowledge/records.jsonl');
const CASES_PATH = path.join(ROOT, 'research/fedex-ground-driver-knowledge/validation/driver_language_cases.jsonl');
const CONVERSATIONS_PATH = path.join(ROOT, 'research/fedex-ground-driver-knowledge/validation/conversation_scenarios.jsonl');
const PRIORITY_PATH = path.join(ROOT, 'research/fedex-ground-driver-knowledge/validation/vlad_priority_51_cases.jsonl');
const ADJUDICATIONS_PATH = path.join(ROOT, 'knowledge/adjudications/records.json');

const KNOWLEDGE_ID = 'KNO-FORGE-VEHICLE-BARCODE-WORKAROUND-001';
const OLD_ADJUDICATION_ID = 'ADJ-20260815-OWNER-VEHICLE-BARCODE-001';
const NEW_ADJUDICATION_ID = 'ADJ-20260819-OWNER-INAPP-VEHICLE-BARCODE-001';
const NEW_SOURCE_ID = 'SRC-V2-OWNER-INAPP-VEHICLE-BARCODE-20260819';

function readJsonLines(filePath) {
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
}

function writeJsonLines(filePath, rows) {
  fs.writeFileSync(filePath, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
}

function upsertBy(rows, key, value) {
  const index = rows.findIndex((row) => row[key] === value[key]);
  if (index >= 0) rows[index] = value;
  else rows.push(value);
}

const records = readJsonLines(RECORDS_PATH);
const record = records.find((item) => item.knowledge_id === KNOWLEDGE_ID);
if (!record) throw new Error(`Missing ${KNOWLEDGE_ID}`);

Object.assign(record, {
  version: 2,
  normalized_description: 'Ready Route asks for the vehicle number, constructs an uppercase V-prefixed value, and displays a scannable Code 128 vehicle barcode inside the application.',
  authoritative_rule: 'When a driver requests Code 128, cannot find the vehicle-scan barcode, or asks Ready Route to create or generate a barcode, ask exactly “What is the vehicle number?” Treat the next message in that conversation as the vehicle number, prefix it immediately with uppercase V, and display an in-app Code 128 barcode encoding the complete value with the human-readable value beneath it.',
  applicability: [
    'The driver asks about Code 128',
    'The required vehicle-scan barcode is missing or unscannable',
    'The driver asks Ready Route to create, make, or generate a barcode'
  ],
  conditions: [
    'Use Code 128',
    'Prefix the supplied vehicle number immediately with uppercase V',
    'Keep the pending vehicle-number step scoped to the authenticated conversation'
  ],
  exceptions: [
    'Ordinary package, pickup, delivery, SRA, and tracking-barcode questions retain their separate procedures unless the driver explicitly asks Ready Route to create or generate a barcode'
  ],
  required_procedure: [
    { step: 1, action: 'Ask exactly: “What is the vehicle number?”' },
    { step: 2, action: 'Treat the next driver message in that conversation as the vehicle number.' },
    { step: 3, action: 'Construct the encoded value by placing uppercase V immediately before the supplied vehicle number.' },
    { step: 4, action: 'Generate a Code 128 barcode for the complete V-prefixed value inside Ready Route.' },
    { step: 5, action: 'Display the barcode clearly with the encoded value beneath it so the driver can scan and verify it.' }
  ],
  required_documentation: ['The V-prefixed encoded vehicle value displayed beneath the barcode'],
  prohibited_actions: [
    'Do not omit the uppercase V prefix',
    'Do not use a barcode format other than Code 128',
    'Do not redirect the driver to an external barcode generator',
    'Do not add a Code 128 confirmation or unnecessary vehicle-number confirmation step'
  ],
  escalation_requirements: [],
  clarification_requirements: ['What is the vehicle number?'],
  driver_question_variants: [
    'Vehicle barcode missing',
    'Truck barcode will not scan',
    'I cannot find the barcode for the vehicle scan',
    'How do I make a vehicle barcode',
    'Can you create a barcode for me',
    'Generate a barcode for me',
    'Make me a barcode',
    'I need a Code 128',
    'Vehicle barcode is missing',
    'Van barcode is gone'
  ],
  concise_ready_route_answer: 'Ready Route generates the vehicle barcode in app. Supply the vehicle number; Ready Route prefixes it with uppercase V and displays a Code 128 barcode with the encoded value beneath it.',
  more_info_answer: 'The barcode always uses Code 128 and encodes the complete uppercase V-prefixed vehicle value.',
  evidence: [
    ...(record.evidence || []).filter((item) => item.source_id !== NEW_SOURCE_ID),
    {
      source_id: NEW_SOURCE_ID,
      locator: 'Decision, examples, and scope and safeguards',
      evidence_summary: 'Approves the exact two-turn in-app workflow, uppercase V prefix, Code 128 symbology, conversation-scoped pending state, and in-app barcode display.',
      reviewed_at: '2026-08-19'
    }
  ],
  source_date_or_version: 'Owner-approved in-app workflow 2026-08-19; earlier partner workaround retained in superseded adjudication history',
  review_notes: 'The 2026-08-19 product-owner directive moves the approved workaround inside Ready Route and supersedes the external-generator presentation while preserving the original approval record.',
  updated_at: '2026-08-19'
});
writeJsonLines(RECORDS_PATH, records);

const cases = readJsonLines(CASES_PATH);
for (const item of cases.filter((candidate) => (candidate.expected_knowledge_ids || []).includes(KNOWLEDGE_ID))) {
  item.information_sufficiency = 'CONDITIONALLY_SUFFICIENT';
  item.response_mode = 'ASK_MINIMUM_CLARIFICATION';
  item.must_clarify = ['What is the vehicle number?'];
  item.must_not_do = [...new Set([
    ...(item.must_not_do || []),
    'redirect to an external barcode generator',
    'ask whether Code 128 is selected'
  ])];
  delete item.answer_override;
}
upsertBy(cases, 'case_id', {
  case_id: 'INAPP-VEHICLE-BARCODE-001',
  utterance: 'Can you create a barcode for me?',
  semantic_variations: [
    'I need a Code 128',
    'Please generate a barcode',
    "I can't find the barcode for the vehicle scan. What do I do?",
    'The truck barcode is missing',
    'My van barcode will not scan'
  ],
  expected_knowledge_ids: [KNOWLEDGE_ID],
  must_clarify: ['What is the vehicle number?'],
  must_not_do: [
    'generate before requesting the vehicle number',
    'redirect to an external barcode generator',
    'ask whether Code 128 is selected'
  ],
  case_type: 'OWNER_APPROVED_IN_APP_VEHICLE_BARCODE',
  information_sufficiency: 'CONDITIONALLY_SUFFICIENT',
  response_mode: 'ASK_MINIMUM_CLARIFICATION'
});
writeJsonLines(CASES_PATH, cases);

const conversations = readJsonLines(CONVERSATIONS_PATH)
  .filter((scenario) => scenario.scenario_id !== 'CONV-MISSING-DETAIL-001');
upsertBy(conversations, 'scenario_id', {
  scenario_id: 'CONV-VEHICLE-BARCODE-001',
  description: 'Ready Route asks only for the vehicle number and then returns the exact in-app Code 128 payload.',
  turns: [
    {
      input: 'The vehicle barcode is missing',
      expected_mode: 'CLARIFY',
      expected_knowledge_id: KNOWLEDGE_ID,
      clarification_contains: 'What is the vehicle number?'
    },
    {
      input: '400770',
      expected_mode: 'ANSWER',
      expected_knowledge_id: KNOWLEDGE_ID,
      expected_direct_answer: 'Scan this vehicle barcode.',
      expected_barcode_symbology: 'CODE128',
      expected_barcode_value: 'V400770'
    }
  ]
});
writeJsonLines(CONVERSATIONS_PATH, conversations);

const priorityCases = readJsonLines(PRIORITY_PATH);
for (const item of priorityCases.filter((candidate) => (
  (candidate.expected_knowledge_ids || []).includes(KNOWLEDGE_ID)
))) {
  item.expected_mode = 'CLARIFY';
  item.notes = 'The later 2026-08-19 owner directive requires the in-app workflow to ask for the vehicle number before generating Code 128.';
}
writeJsonLines(PRIORITY_PATH, priorityCases);

const adjudications = JSON.parse(fs.readFileSync(ADJUDICATIONS_PATH, 'utf8'));
const oldAdjudication = adjudications.find((item) => item.adjudication_id === OLD_ADJUDICATION_ID);
if (!oldAdjudication) throw new Error(`Missing ${OLD_ADJUDICATION_ID}`);
oldAdjudication.status = 'SUPERSEDED';
oldAdjudication.superseded_by = [NEW_ADJUDICATION_ID];

upsertBy(adjudications, 'adjudication_id', {
  adjudication_id: NEW_ADJUDICATION_ID,
  knowledge_id: KNOWLEDGE_ID,
  status: 'APPROVED',
  issue_reviewed: 'Whether the approved vehicle Code 128 workaround should be generated and displayed directly inside Ready Route.',
  canonical_determination: 'Ready Route asks exactly “What is the vehicle number?”, treats the next message in that authenticated conversation as the vehicle number, prefixes it with uppercase V, and displays an in-app Code 128 barcode encoding the complete value with the value beneath it.',
  previous_interpretations: [
    'The 2026-08-15 approved workaround directed the driver to a reputable external Code 128 generator and asked for separate Code 128 confirmation.'
  ],
  supporting_source_ids: [
    'SRC-V2-PARTNER-REPORT-20260814',
    'SRC-V2-OWNER-DIRECTIVE-20260815',
    NEW_SOURCE_ID
  ],
  conflicting_or_superseded_source_ids: [],
  reasoning: 'The product owner explicitly approved the in-app implementation, exact two-turn interaction, Code 128 symbology, and uppercase V-prefixed value. This is more specific and later than the external-generator presentation.',
  approved_by: 'Phillip Metzger, Ready Route product owner',
  approval_date: '2026-08-19',
  effective_date: '2026-08-19',
  supersedes: [OLD_ADJUDICATION_ID],
  reopen_conditions: [
    'Phillip revises the in-app workflow.',
    'The accepted vehicle barcode prefix or symbology changes.',
    'A later application or operational requirement materially conflicts with this workflow.'
  ],
  canonical_overrides: {
    authoritative_rule: record.authoritative_rule,
    applicability: record.applicability,
    conditions: record.conditions,
    exceptions: record.exceptions,
    required_procedure: record.required_procedure,
    required_documentation: record.required_documentation,
    prohibited_actions: record.prohibited_actions,
    escalation_requirements: record.escalation_requirements,
    clarification_requirements: record.clarification_requirements,
    concise_driver_answer: record.concise_ready_route_answer,
    more_info_answer: record.more_info_answer
  }
});
fs.writeFileSync(ADJUDICATIONS_PATH, `${JSON.stringify(adjudications, null, 2)}\n`);

console.log(JSON.stringify({
  knowledge_id: KNOWLEDGE_ID,
  record_version: record.version,
  driver_cases: cases.filter((item) => (item.expected_knowledge_ids || []).includes(KNOWLEDGE_ID)).length,
  priority_cases_updated: priorityCases.filter((item) => (item.expected_knowledge_ids || []).includes(KNOWLEDGE_ID)).length,
  conversation_turns: conversations.find((item) => item.scenario_id === 'CONV-VEHICLE-BARCODE-001').turns.length,
  active_adjudication: NEW_ADJUDICATION_ID
}, null, 2));
