#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CASES_PATH = path.join(
  ROOT,
  'research/fedex-ground-driver-knowledge/validation/driver_language_cases.jsonl'
);

function readJsonLines(filePath) {
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
}

function writeJsonLines(filePath, rows) {
  fs.writeFileSync(filePath, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
}

function upsert(rows, item) {
  const index = rows.findIndex((row) => row.case_id === item.case_id);
  if (index >= 0) rows[index] = item;
  else rows.push(item);
}

const cases = readJsonLines(CASES_PATH);

const pickupAnswer = {
  direct_answer: 'Check current pickup times. If you may miss the window, contact CXPC to alert the customer and ask your BC whether another Work Area can take the pickup.',
  steps: [
    'Check the current pickup ready time, close time, and update details.',
    'Contact CXPC through the approved channel so the customer can be alerted.',
    'Contact your BC to see whether the pickup can be transferred to another Work Area.'
  ],
  watch_for: 'Contacting the BC does not guarantee that the pickup has been transferred.'
};

const pickupCase = cases.find((row) => row.case_id === 'PUP-WINDOW-001');
if (!pickupCase) throw new Error('Missing PUP-WINDOW-001');
pickupCase.answer_override = pickupAnswer;

const pickupDefinitionCase = cases.find((row) => row.case_id === 'PUP-WINDOW-003');
if (!pickupDefinitionCase) throw new Error('Missing PUP-WINDOW-003');
pickupDefinitionCase.answer_override = {
  ...pickupAnswer,
  direct_answer: 'The pickup window is the customer’s requested pickup timeframe. If you may miss it, contact CXPC and ask your BC whether another Work Area can take it.'
};

const recoveredMisdeliveryAnswer = {
  direct_answer: 'Scan the recovered package in the misdelivery workflow and apply Code 17. Code 18 applies only after a successful same-day redelivery.',
  steps: [
    'Physically recover the package, scan it again in the misdelivery recovery workflow, and apply Code 17.',
    'Go to the correct address.',
    'Scan the package again for delivery. When the scanner asks you to verify the address, check it and tap Confirm.',
    'Process the delivery as usual. If the same-day redelivery succeeds, confirm the stop closes as Code 18.'
  ],
  watch_for: 'Do not use Code 18 unless the same-day delivery to the correct address succeeds.'
};

for (const caseId of [
  'MANUAL40-MISDELIVERY-RECOVERED-001',
  'MANUAL40-MISDELIVERY-SHORT-001'
]) {
  const item = cases.find((row) => row.case_id === caseId);
  if (!item) throw new Error(`Missing ${caseId}`);
  item.answer_override = recoveredMisdeliveryAnswer;
}

for (const item of [
  {
    case_id: 'PROD-AUDIT-MISSED-DELIVERY-ARTICLE-001',
    utterance: 'I missed the delivery, what now',
    semantic_variations: ['I missed a delivery what should I do'],
    expected_knowledge_ids: ['KNO-DEL-MISDELIVERY-RECOVERY-001'],
    must_clarify: ['Did you deliver the package to the wrong address, or were you unable to complete the delivery?'],
    must_not_do: ['assume missed delivery means misdelivery', 'select an unrelated pickup procedure'],
    case_type: 'PRODUCTION_DRIVER_AUDIT_REGRESSION',
    information_sufficiency: 'CONDITIONALLY_SUFFICIENT',
    response_mode: 'ASK_MINIMUM_CLARIFICATION'
  },
  {
    case_id: 'PROD-AUDIT-GLOSSARY-FILLER-001',
    utterance: 'New driver here, what is FORGE',
    semantic_variations: [],
    expected_knowledge_ids: ['KNO-GLOSSARY-FORGE-001'],
    must_clarify: [],
    must_not_do: ['reject a definition because of introductory filler', 'select an unrelated operational procedure'],
    case_type: 'PRODUCTION_DRIVER_AUDIT_REGRESSION',
    information_sufficiency: 'SUFFICIENT',
    response_mode: 'DIRECT_SOURCE_GROUNDED_ANSWER'
  },
  {
    case_id: 'PROD-AUDIT-SERVICE-CROSS-FILLER-001',
    utterance: 'Can you explain what a service cross is',
    semantic_variations: [],
    expected_knowledge_ids: ['KNO-GLOSSARY-SERVICE-CROSS-001'],
    must_clarify: [],
    must_not_do: ['reject a definition because of introductory filler', 'select an unrelated operational procedure'],
    case_type: 'PRODUCTION_DRIVER_AUDIT_REGRESSION',
    information_sufficiency: 'SUFFICIENT',
    response_mode: 'DIRECT_SOURCE_GROUNDED_ANSWER'
  },
  {
    case_id: 'PROD-AUDIT-MANIFEST-FILLER-001',
    utterance: 'In plain English what is my manifest',
    semantic_variations: [],
    expected_knowledge_ids: ['KNO-GLOSSARY-MANIFEST-001'],
    must_clarify: [],
    must_not_do: ['reject a definition because of introductory filler', 'select an unrelated operational procedure'],
    case_type: 'PRODUCTION_DRIVER_AUDIT_REGRESSION',
    information_sufficiency: 'SUFFICIENT',
    response_mode: 'DIRECT_SOURCE_GROUNDED_ANSWER'
  }
]) upsert(cases, item);

writeJsonLines(CASES_PATH, cases);
console.log('Applied production driver audit quality corrections and regression cases.');
