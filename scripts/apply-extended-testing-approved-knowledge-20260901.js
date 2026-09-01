#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RESEARCH = path.join(ROOT, 'research/fedex-ground-driver-knowledge');
const RECORDS_PATH = path.join(RESEARCH, 'knowledge/records.jsonl');
const CASES_PATH = path.join(RESEARCH, 'validation/driver_language_cases.jsonl');
const OUT_OF_CORPUS_PATH = path.join(RESEARCH, 'validation/out_of_corpus_cases.jsonl');
const CHANGE_LOG_PATH = path.join(RESEARCH, 'knowledge/change_log.jsonl');
const ADJUDICATIONS_PATH = path.join(ROOT, 'knowledge/adjudications/records.json');
const INVENTORY_PATH = path.join(RESEARCH, 'inventory/source_inventory.csv');
const CAPTURE_PATH = path.join(RESEARCH, 'knowledge/evidence_capture_risk_coverage.csv');

const REPORT_SOURCE = 'SRC-V2-VLAD-EXTENDED-TESTING-20260901';
const APPROVAL_SOURCE = 'SRC-V2-OWNER-EXTENDED-TESTING-APPROVAL-20260901';
const REVIEW_DATE = '2026-09-01';
const OWNER = 'Phillip Metzger, Ready Route product owner';

function readJsonLines(filePath) {
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function writeJsonLines(filePath, rows) {
  fs.writeFileSync(filePath, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
}

function upsert(rows, key, value) {
  const index = rows.findIndex((row) => row[key] === value[key]);
  if (index >= 0) rows[index] = value;
  else rows.push(value);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function sha256(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some((value) => value.length)) rows.push(row);
      row = [];
      field = '';
    } else field += character;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function csvCell(value) {
  const string = String(value ?? '');
  return /[",\r\n]/.test(string) ? `"${string.replace(/"/g, '""')}"` : string;
}

function readCsvObjects(filePath) {
  const rows = parseCsv(fs.readFileSync(filePath, 'utf8'));
  const headers = rows.shift();
  return {
    headers,
    rows: rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])))
  };
}

function writeCsvObjects(filePath, headers, rows) {
  const lines = [headers.map(csvCell).join(','), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(','))];
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`);
}

function evidence(locator, evidenceSummary) {
  return [
    {
      source_id: REPORT_SOURCE,
      locator,
      evidence_summary: evidenceSummary,
      reviewed_at: REVIEW_DATE
    },
    {
      source_id: APPROVAL_SOURCE,
      locator: 'Approved scope',
      evidence_summary: 'Phillip Metzger explicitly approved the supplied Vlad procedures as owner-verified Ready Route knowledge within their stated scope.',
      reviewed_at: REVIEW_DATE
    }
  ];
}

function appendEvidence(existing, additions) {
  const result = [...(existing || [])];
  for (const item of additions) {
    const index = result.findIndex((row) => row.source_id === item.source_id && row.locator === item.locator);
    if (index >= 0) result[index] = item;
    else result.push(item);
  }
  return result;
}

function newOwnerApprovedRecord(input) {
  return {
    knowledge_id: input.knowledge_id,
    version: 1,
    canonical_situation: input.canonical_situation,
    normalized_description: input.normalized_description,
    authoritative_rule: input.authoritative_rule,
    applicability: input.applicability,
    conditions: input.conditions || [],
    exceptions: input.exceptions || [],
    required_procedure: input.required_procedure,
    required_documentation: input.required_documentation || [],
    prohibited_actions: input.prohibited_actions || [],
    escalation_requirements: input.escalation_requirements || [],
    clarification_requirements: input.clarification_requirements || [],
    related_knowledge_ids: input.related_knowledge_ids || [],
    taxonomy_paths: input.taxonomy_paths,
    driver_question_variants: input.driver_question_variants,
    concise_ready_route_answer: input.concise_ready_route_answer,
    more_info_answer: input.more_info_answer || null,
    evidence: evidence(input.locator, input.evidence_summary),
    source_date_or_version: 'Extended testing report owner-approved 2026-09-01',
    knowledge_status: 'HUMAN_REVIEW_REQUIRED',
    review_notes: 'Published only through the scoped 2026-09-01 Extended Testing READY_ROUTE_APPROVED adjudication.',
    created_at: REVIEW_DATE,
    updated_at: REVIEW_DATE
  };
}

function canonicalOverrides(record) {
  return {
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
  };
}

function approval(record, previousInterpretations) {
  return {
    adjudication_id: `ADJ-20260901-EXTENDED-${record.knowledge_id.replace(/^KNO-/, '')}`,
    knowledge_id: record.knowledge_id,
    status: 'APPROVED',
    issue_reviewed: record.canonical_situation,
    canonical_determination: record.authoritative_rule,
    previous_interpretations: previousInterpretations,
    supporting_source_ids: unique((record.evidence || []).map((item) => item.source_id)),
    conflicting_or_superseded_source_ids: [],
    reasoning: 'Vlad supplied the field procedure and Phillip Metzger explicitly approved it as owner-verified Ready Route knowledge. This determination preserves the exact supplied scope and does not invent unresolved device, complaint, pickup-transfer, or duplicate-package branches.',
    approved_by: OWNER,
    approval_date: REVIEW_DATE,
    effective_date: REVIEW_DATE,
    supersedes: [],
    reopen_conditions: [
      'Phillip or Vlad revises the supplied procedure.',
      'A later applicable operational, company-policy, scanner-workflow, safety, or regulatory update materially conflicts with it.',
      'A more specific scenario establishes a different approved procedure.'
    ],
    canonical_overrides: canonicalOverrides(record)
  };
}

const records = readJsonLines(RECORDS_PATH);
const originalById = new Map(records.map((record) => [record.knowledge_id, JSON.parse(JSON.stringify(record))]));

const complaintRecord = newOwnerApprovedRecord({
  knowledge_id: 'KNO-CX-GENERAL-COMPLAINT-001',
  canonical_situation: 'A customer wants to make a general complaint',
  normalized_description: 'A customer tells the driver that they want to make a complaint, without facts establishing a more specific approved complaint or Pickup Research Request procedure.',
  authoritative_rule: 'Give the customer your BC’s phone contact. Then call your BC yourself and explain what is happening.',
  applicability: ['A customer wants to make a general complaint', 'No more specific approved complaint procedure is established by the known facts'],
  exceptions: ['If the facts establish a more specific approved complaint or emergency procedure, use that procedure', 'A CXPC Pickup Research Request applies only when CXPC actually sent a request about a reported missed pickup'],
  required_procedure: [
    { step: 1, action: 'Give the customer your BC’s phone contact.' },
    { step: 2, action: 'Call your BC yourself and explain what is happening.' }
  ],
  prohibited_actions: ['Do not treat a generic customer complaint as a CXPC Pickup Research Request unless the facts establish that CXPC sent one.', 'Do not invent a complaint outcome or resolution.'],
  escalation_requirements: ['Driver calls the BC and explains the situation'],
  related_knowledge_ids: ['KNO-PUP-PRR-001'],
  taxonomy_paths: ['TAX-ROUTE'],
  driver_question_variants: ['Customer wants to make a complaint', 'A customer is complaining and wants someone to call', 'Who does a customer contact to complain', 'Customer wants my manager phone number', 'What do I do when the customer wants to complain'],
  concise_ready_route_answer: 'Give the customer your BC’s phone contact. Then call your BC yourself and explain what is happening.',
  more_info_answer: 'This is the general-complaint path. Use a more specific approved procedure when the facts establish one; do not treat the complaint as a Pickup Research Request unless CXPC actually sent one.',
  locator: 'Owner-approved operational additions — General customer complaint',
  evidence_summary: 'Vlad supplied the two-step BC contact procedure and distinguished a generic complaint from a CXPC Pickup Research Request.'
});

const scannerBatteryRecord = newOwnerApprovedRecord({
  knowledge_id: 'KNO-FORGE-SCANNER-LOW-BATTERY-001',
  canonical_situation: 'The scanner battery is low or dying during the route',
  normalized_description: 'The scanner is still operating but is losing battery power, so the driver needs to preserve delivery documentation and obtain power or management help.',
  authoritative_rule: 'If an extra battery is available, swap it; FORGE will not log you out during the battery swap. If there is no extra battery, call the BC. If the driver is far from another driver and no nearby spare battery is available, use a hand sheet (blue sheet) to record deliveries and turn it in at the check-in office.',
  applicability: ['The scanner is still operating but its battery is low or dying'],
  conditions: ['Use the current station-issued hand sheet when the hand-sheet branch is required'],
  exceptions: ['A frozen scanner, app crash, fully unavailable scanner, or pickup scanning failure follows its separately approved procedure'],
  required_procedure: [
    { step: 1, action: 'If you have an extra battery, swap it. FORGE will not log you out during the battery swap.' },
    { step: 2, action: 'If you do not have an extra battery, call your BC.' },
    { step: 3, action: 'If you are far from another driver and no nearby driver can provide a spare battery, use a hand sheet (blue sheet) to record deliveries.' },
    { step: 4, action: 'Turn in the hand sheet at the check-in office.' }
  ],
  required_documentation: ['Current station-issued hand sheet when that branch is used', 'Delivery information required by the applicable hand-sheet procedure'],
  prohibited_actions: ['Do not silently treat low battery as the procedure for a frozen scanner, app crash, fully unavailable scanner, or pickup scanning-technology failure.', 'Do not omit turning in a used hand sheet at the check-in office.'],
  escalation_requirements: ['Call the BC when no extra battery is available'],
  related_knowledge_ids: ['KNO-DOC-HANDSHEET-GENERAL-001', 'KNO-PUP-SCANNER-FAIL-001'],
  taxonomy_paths: ['TAX-FORGE', 'TAX-FORGE/TAX-DOCUMENTATION'],
  driver_question_variants: ['My scanner battery is dying', 'Scanner is low on battery', 'What if the scanner dies soon', 'No spare battery for the scanner', 'Can I swap the scanner battery without losing FORGE'],
  concise_ready_route_answer: 'If you have an extra battery, swap it—FORGE will not log you out. If you do not, call your BC. If no nearby driver can provide a spare battery, use a hand sheet to record deliveries and turn it in at the check-in office.',
  more_info_answer: 'This applies to a low or dying battery while the scanner still operates. A frozen scanner, app crash, fully unavailable scanner, or pickup scan failure follows its separate procedure.',
  locator: 'Owner-approved operational additions — Scanner low battery',
  evidence_summary: 'Vlad supplied the extra-battery, BC, hand-sheet, and check-in sequence and distinguished low battery from other scanner failures.'
});

const pickupIndex = records.findIndex((record) => record.knowledge_id === 'KNO-PUP-WINDOW-RISK-001');
if (pickupIndex < 0) throw new Error('Missing KNO-PUP-WINDOW-RISK-001');
const previousPickup = records[pickupIndex];
const pickupWindowRecord = {
  ...previousPickup,
  version: Math.max(Number(previousPickup.version || 1) + 1, 2),
  authoritative_rule: 'The pickup window is the timeframe in which the customer requested the package be picked up. If the driver may not complete the pickup within that window, check the current ready and close times, contact CXPC so the customer can be alerted, and contact the BC to see whether the pickup can be transferred to another Work Area.',
  required_procedure: [
    { step: 1, action: 'Check the current pickup ready time, close time, and update details.' },
    { step: 2, action: 'Contact CXPC through the approved channel so the customer can be alerted.' },
    { step: 3, action: 'Contact your BC to see whether the pickup can be transferred to another Work Area.' }
  ],
  prohibited_actions: unique([...(previousPickup.prohibited_actions || []), 'Do not assume the pickup has been transferred merely because the BC was contacted.', 'Do not omit the CXPC customer-alert step when the pickup window cannot be met.']),
  escalation_requirements: ['Contact CXPC when the pickup cannot be completed within the window', 'Contact the BC to see whether the pickup can be transferred to another Work Area'],
  driver_question_variants: unique([...(previousPickup.driver_question_variants || []), 'I do not know if I will make it to the pickup during the window', 'Can my BC transfer a pickup to another Work Area', 'Who do I call if I may miss a pickup window']),
  concise_ready_route_answer: 'Check the current ready and close times. If you may miss the pickup window, contact CXPC so the customer can be alerted and contact your BC to see whether the pickup can be transferred to another Work Area.',
  more_info_answer: 'A pickup update can change the ready time, close time, or comments, so review the complete current details. Contacting the BC does not guarantee a transfer.',
  evidence: appendEvidence(previousPickup.evidence, evidence('Owner-approved operational additions — Pickup-window risk', 'Vlad added the BC transfer inquiry to the existing source-verified current-window and CXPC customer-alert procedure.')),
  source_date_or_version: `${previousPickup.source_date_or_version}; owner-approved field addition 2026-09-01`,
  knowledge_status: 'HUMAN_REVIEW_REQUIRED',
  review_notes: 'Version 2 retains the source-verified current-window and CXPC steps and adds only the owner-approved direction to ask the BC whether another Work Area can take the pickup. Published through the scoped 2026-09-01 adjudication.',
  updated_at: REVIEW_DATE
};

for (const record of [complaintRecord, scannerBatteryRecord]) upsert(records, 'knowledge_id', record);
records[pickupIndex] = pickupWindowRecord;
writeJsonLines(RECORDS_PATH, records);

const finalRecords = new Map(records.map((record) => [record.knowledge_id, record]));
const adjudications = JSON.parse(fs.readFileSync(ADJUDICATIONS_PATH, 'utf8'));
const approvals = [
  approval(finalRecords.get(complaintRecord.knowledge_id), ['No published Ready Route record previously covered a generic customer complaint without treating it as a Pickup Research Request.']),
  approval(finalRecords.get(scannerBatteryRecord.knowledge_id), ['Existing records covered a fully unavailable device or pickup scanning failure, not a scanner that was still working but losing battery power.']),
  approval(finalRecords.get(pickupWindowRecord.knowledge_id), ['The source-verified record required checking the current pickup window and contacting CXPC but did not include Vlad’s BC transfer inquiry.'])
];
for (const item of approvals) upsert(adjudications, 'adjudication_id', item);
fs.writeFileSync(ADJUDICATIONS_PATH, `${JSON.stringify(adjudications, null, 2)}\n`);

const evaluations = readJsonLines(CASES_PATH);
for (const item of [
  {
    case_id: 'EXTENDED-COMPLAINT-001',
    utterance: 'Customer wants to make a complaint',
    semantic_variations: ['customer asking for my manager number to complain', 'someone wants to report a complaint', 'what do I do when a customer wants to complain'],
    expected_knowledge_ids: [complaintRecord.knowledge_id],
    must_clarify: [],
    must_not_do: ['route a generic complaint to Pickup Research Request', 'invent a complaint outcome'],
    case_type: 'EXTENDED_TESTING_OWNER_APPROVED',
    information_sufficiency: 'SUFFICIENT',
    response_mode: 'DIRECT_SOURCE_GROUNDED_ANSWER'
  },
  {
    case_id: 'EXTENDED-SCANNER-LOW-BATTERY-001',
    utterance: 'My scanner is dying and the battery is low',
    semantic_variations: ['scanner battery almost dead', 'can I swap the scanner battery without losing FORGE', 'no spare battery and scanner is dying'],
    expected_knowledge_ids: [scannerBatteryRecord.knowledge_id],
    must_clarify: [],
    must_not_do: ['treat low battery as a frozen scanner', 'omit the BC or hand-sheet handoff branches'],
    case_type: 'EXTENDED_TESTING_OWNER_APPROVED',
    information_sufficiency: 'SUFFICIENT',
    response_mode: 'DIRECT_SOURCE_GROUNDED_ANSWER'
  },
  {
    case_id: 'EXTENDED-PICKUP-WINDOW-001',
    utterance: 'I do not know if I will make it to the pickup during the window',
    semantic_variations: ['pickup closes before I can arrive', 'can my BC move this pickup to another Work Area', 'who do I contact if I may miss a pickup window'],
    expected_knowledge_ids: [pickupWindowRecord.knowledge_id],
    must_clarify: [],
    must_not_do: ['omit CXPC customer alert', 'promise that the BC will transfer the pickup'],
    case_type: 'EXTENDED_TESTING_OWNER_APPROVED',
    information_sufficiency: 'SUFFICIENT',
    response_mode: 'DIRECT_SOURCE_GROUNDED_ANSWER'
  }
]) upsert(evaluations, 'case_id', item);
writeJsonLines(CASES_PATH, evaluations);

const outOfCorpus = readJsonLines(OUT_OF_CORPUS_PATH);
for (const item of [
  { case_id: 'OOC-EXTENDED-DNA-001', utterance: 'What does DNA mean in delivery status?', expected_mode: 'ESCALATE' },
  { case_id: 'OOC-EXTENDED-OP201-001', utterance: 'What does OP-201 mean?', expected_mode: 'ESCALATE' },
  { case_id: 'OOC-EXTENDED-LOCKED-KEYS-001', utterance: 'I locked my keys in the van, what do I do?', expected_mode: 'ESCALATE' },
  { case_id: 'OOC-EXTENDED-RECORDING-001', utterance: 'Customer recording me on camera, what do I do?', expected_mode: 'ESCALATE' },
  { case_id: 'OOC-EXTENDED-DUPLICATE-TRACKING-001', utterance: 'Two packages, same tracking number, what do I do?', expected_mode: 'ESCALATE' }
]) upsert(outOfCorpus, 'case_id', item);
writeJsonLines(OUT_OF_CORPUS_PATH, outOfCorpus);

const inventory = readCsvObjects(INVENTORY_PATH);
for (const item of [
  {
    source_id: REPORT_SOURCE,
    source_system: 'Ready Route v2 intake', parent_source_id: '',
    title: 'ReadyRoute Extended Testing Session Report', source_type: 'MARKDOWN', mime_type: 'text/markdown',
    url_or_path: 'Owner-supplied ReadyRoute extended testing report in the 2026-09-01 workspace session',
    created_at: REVIEW_DATE, modified_at: REVIEW_DATE, effective_date: REVIEW_DATE, version: 'August 2026 testing report preserved 2026-09-01',
    apparent_subject: 'RRA routing regressions and Vlad field procedures', apparent_audience: 'Ready Route product and engineering',
    access_status: 'ACCESSIBLE', review_status: 'INTAKE_REVIEWED', relevance_status: 'HIGH_RELEVANCE',
    duplicate_of: '', supersedes: '', superseded_by: '', cross_references: APPROVAL_SOURCE,
    local_archive_path: 'research/fedex-ground-driver-knowledge/sources/v2-intake-2026-09-01/vlad/ReadyRoute_Extended_Testing_Session_Report_2026-09-01.md',
    interpretation_limits: 'Routing observations are engineering evidence. Only the explicitly owner-approved complaint, low-battery, and pickup-window additions authorize operational answers.',
    review_notes: 'Preserved from the supplied report; unresolved duplicate-package and other listed gaps remain outside the approved corpus.',
    last_reviewed_at: REVIEW_DATE, metadata_recovery_status: 'OWNER_SUPPLIED', metadata_recovery_basis: 'Owner-supplied content in the current workspace session'
  },
  {
    source_id: APPROVAL_SOURCE,
    source_system: 'Ready Route product-owner decision', parent_source_id: '',
    title: 'Ready Route owner approval — Extended testing operational additions', source_type: 'Policy', mime_type: 'text/markdown',
    url_or_path: 'docs/ready-route-owner-approval-extended-testing-session-2026-09-01.md',
    created_at: REVIEW_DATE, modified_at: REVIEW_DATE, effective_date: REVIEW_DATE, version: 'Owner approval',
    apparent_subject: 'Authority for three Vlad-supplied operational additions', apparent_audience: 'Ready Route knowledge authors',
    access_status: 'ACCESSIBLE', review_status: 'OWNER_APPROVED', relevance_status: 'HIGH_RELEVANCE',
    duplicate_of: '', supersedes: '', superseded_by: '', cross_references: REPORT_SOURCE,
    local_archive_path: 'docs/ready-route-owner-approval-extended-testing-session-2026-09-01.md',
    interpretation_limits: 'Applies only to the exact complaint, scanner-low-battery, and pickup-window scope; duplicate packages remain unapproved.',
    review_notes: 'Phillip Metzger responded “I approve” after the three procedures were identified for owner verification.',
    last_reviewed_at: REVIEW_DATE, metadata_recovery_status: 'OWNER_DIRECTIVE', metadata_recovery_basis: 'Explicit product-owner approval in the current workspace session'
  }
]) upsert(inventory.rows, 'source_id', item);
writeCsvObjects(INVENTORY_PATH, inventory.headers, inventory.rows);

const capture = readCsvObjects(CAPTURE_PATH);
for (const record of [complaintRecord, scannerBatteryRecord, pickupWindowRecord]) {
  const sourceIds = unique((record.evidence || []).map((item) => item.source_id));
  upsert(capture.rows, 'knowledge_id', {
    knowledge_id: record.knowledge_id,
    knowledge_status: record.knowledge_status,
    evidence_source_ids: sourceIds.join(';'),
    durable_source_ids: sourceIds.join(';'),
    rendered_full_source_ids: '', rendered_partial_source_ids: '', transient_full_source_ids: '', transient_partial_source_ids: '',
    evidence_capture_class: 'OWNER_APPROVED_DURABLE_MARKDOWN_WITH_PRESERVED_PRIOR_EVIDENCE',
    production_capture_gate: 'CAPTURE_COMPLETE_OWNER_VERIFICATION', authenticated_queue_resource_ids: '',
    required_follow_up: 'Reopen if Phillip, Vlad, company policy, scanner behavior, or later applicable operational, regulatory, or safety guidance changes the approved answer.'
  });
}
writeCsvObjects(CAPTURE_PATH, capture.headers, capture.rows);

const changes = readJsonLines(CHANGE_LOG_PATH);
for (const record of [complaintRecord, scannerBatteryRecord, pickupWindowRecord]) {
  const previous = originalById.get(record.knowledge_id) || { knowledge_id: record.knowledge_id, state: 'ABSENT_FROM_ACTIVE_CORPUS' };
  const changeId = `CHG-20260901-EXTENDED-${record.knowledge_id.replace(/^KNO-/, '')}`;
  const existing = changes.find((change) => change.change_id === changeId);
  upsert(changes, 'change_id', {
    change_id: changeId,
    knowledge_id: record.knowledge_id,
    changed_at: REVIEW_DATE,
    changed_by: OWNER,
    change_reason: 'Added or upgraded the owner-approved Extended Testing Session operational answer.',
    previous_record: existing?.previous_record || previous,
    previous_checksum: existing?.previous_checksum || sha256(previous),
    new_record: record,
    new_checksum: sha256(record)
  });
}
writeJsonLines(CHANGE_LOG_PATH, changes);

console.log(JSON.stringify({
  records_added: 2,
  records_upgraded: 1,
  approvals_added_or_updated: approvals.length,
  evaluation_cases_added_or_updated: 3,
  fail_closed_cases_added_or_updated: 5
}, null, 2));
