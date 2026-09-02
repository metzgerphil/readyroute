#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RESEARCH = path.join(ROOT, 'research/fedex-ground-driver-knowledge');
const RECORDS_PATH = path.join(RESEARCH, 'knowledge/records.jsonl');
const CASES_PATH = path.join(RESEARCH, 'validation/driver_language_cases.jsonl');
const CHANGE_LOG_PATH = path.join(RESEARCH, 'knowledge/change_log.jsonl');
const ADJUDICATIONS_PATH = path.join(ROOT, 'knowledge/adjudications/records.json');
const INVENTORY_PATH = path.join(RESEARCH, 'inventory/source_inventory.csv');
const CAPTURE_PATH = path.join(RESEARCH, 'knowledge/evidence_capture_risk_coverage.csv');

const REPORT_SOURCE = 'SRC-V2-VLAD-NEW-DRIVER-TERMS-MECHANICS-20260828';
const APPROVAL_SOURCE = 'SRC-V2-OWNER-NEW-DRIVER-TERMS-MECHANICS-APPROVAL-20260828';
const TIRE_RULE_SOURCE = 'SRC-ECFR-49CFR39375-20260828';
const PENNY_TEST_SOURCE = 'SRC-NHTSA-TIREWISE-20260828';
const HAZMAT_LABEL_SOURCE = 'SRC-PHMSA-CHART17-20220315';
const REVIEW_DATE = '2026-08-28';
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

function sha256(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function appendOnce(base, addition, separator = '; ') {
  if (String(base || '').includes(addition)) return base;
  return base ? `${base}${separator}${addition}` : addition;
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

function sourceEvidence(source_id, locator, evidence_summary) {
  return { source_id, locator, evidence_summary, reviewed_at: REVIEW_DATE };
}

function batchEvidence(locator, evidenceSummary, extra = []) {
  return [
    sourceEvidence(REPORT_SOURCE, locator, evidenceSummary),
    sourceEvidence(
      APPROVAL_SOURCE,
      'Approved scope',
      'Phillip Metzger completely approved the supplied procedures as owner-verified Ready Route knowledge and directed Ready Route to follow Vlad’s direction.'
    ),
    ...extra
  ];
}

function appendEvidence(existing, additions) {
  const rows = [...(existing || [])];
  for (const item of additions) {
    const index = rows.findIndex((row) => row.source_id === item.source_id && row.locator === item.locator);
    if (index >= 0) rows[index] = item;
    else rows.push(item);
  }
  return rows;
}

function newRecord(input) {
  return {
    knowledge_id: input.knowledge_id,
    version: 1,
    canonical_situation: input.canonical_situation,
    normalized_description: input.normalized_description,
    authoritative_rule: input.authoritative_rule,
    applicability: input.applicability || [],
    conditions: input.conditions || [],
    exceptions: input.exceptions || [],
    required_procedure: input.required_procedure || [],
    required_documentation: input.required_documentation || [],
    prohibited_actions: input.prohibited_actions || [],
    escalation_requirements: input.escalation_requirements || [],
    clarification_requirements: input.clarification_requirements || [],
    related_knowledge_ids: input.related_knowledge_ids || [],
    taxonomy_paths: input.taxonomy_paths || [],
    driver_question_variants: input.driver_question_variants || [],
    concise_ready_route_answer: input.concise_ready_route_answer,
    more_info_answer: input.more_info_answer || null,
    evidence: batchEvidence(input.locator, input.evidence_summary, input.extra_evidence || []),
    source_date_or_version: 'New-Driver Terminology & Mechanics Addendum dated and owner-approved 2026-08-28',
    knowledge_status: 'HUMAN_REVIEW_REQUIRED',
    review_notes: 'Published only through the scoped 2026-08-28 New-Driver Terminology & Mechanics READY_ROUTE_APPROVED adjudication.',
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
    adjudication_id: `ADJ-20260828-NEW-DRIVER-${record.knowledge_id.replace(/^KNO-/, '')}`,
    knowledge_id: record.knowledge_id,
    status: 'APPROVED',
    issue_reviewed: record.canonical_situation,
    canonical_determination: record.authoritative_rule,
    previous_interpretations: previousInterpretations,
    supporting_source_ids: unique((record.evidence || []).map((item) => item.source_id)),
    conflicting_or_superseded_source_ids: [],
    reasoning: 'Vlad supplied the field mechanics and Phillip Metzger completely approved them as Ready Route owner-verified knowledge within the stated scope. The determination preserves the supplied branch boundaries and does not invent missing company policy or scanner behavior.',
    approved_by: OWNER,
    approval_date: REVIEW_DATE,
    effective_date: REVIEW_DATE,
    supersedes: [],
    reopen_conditions: [
      'Phillip or Vlad revises the supplied answer.',
      'A later applicable operational, regulatory, company-policy, safety, or scanner-workflow update materially conflicts with it.'
    ],
    canonical_overrides: canonicalOverrides(record)
  };
}

function replaceSidTerminology(value) {
  if (typeof value !== 'string') return value;
  const marker = '__READY_ROUTE_VISION_SID__';
  return value
    .replace(/Vision Label \(Vision Label \(SID sticker\)\)(?: sticker)?/g, 'Vision Label (SID sticker)')
    .replace(/Vision Label \(SID sticker\)/gi, marker)
    .replace(/\bSID sticker\b/g, 'Vision Label (SID sticker)')
    .replace(/\bstale SID\b/g, 'stale Vision Label (SID sticker)')
    .replace(/\bthe SID\b/g, 'the Vision Label (SID sticker)')
    .replace(/\ba SID\b/g, 'a Vision Label (SID sticker)')
    .replaceAll(marker, 'Vision Label (SID sticker)');
}

function mapText(value) {
  if (typeof value === 'string') return replaceSidTerminology(value);
  if (Array.isArray(value)) return value.map(mapText);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapText(item)]));
  }
  return value;
}

function applyDriverFacingTerminology(record) {
  const fields = [
    'normalized_description',
    'authoritative_rule',
    'applicability',
    'conditions',
    'exceptions',
    'required_procedure',
    'required_documentation',
    'prohibited_actions',
    'escalation_requirements',
    'clarification_requirements',
    'driver_question_variants',
    'concise_ready_route_answer',
    'more_info_answer'
  ];
  const next = { ...record };
  for (const field of fields) next[field] = mapText(record[field]);
  return next;
}

const records = readJsonLines(RECORDS_PATH);
const originalById = new Map(records.map((item) => [item.knowledge_id, JSON.parse(JSON.stringify(item))]));
const byId = new Map(records.map((item) => [item.knowledge_id, item]));

const existingTire = byId.get('KNO-VEH-DOT-INSPECTION-001');
const tireRecord = {
  ...existingTire,
  version: Math.max(Number(existingTire.version || 1), 2),
  authoritative_rule: 'Complete the unified vehicle inspection. For tire tread, front/steering tires on a truck require at least 4/32 inch and all other tires require at least 2/32 inch in a major tread groove. Use a tread-depth gauge for the actual threshold. The penny test is only a rough 2/32-inch screen and cannot prove a steering tire meets 4/32 inch. If any tire or other inspected item is unsafe or not working correctly, notify the BC immediately and pull over or park safely.',
  required_procedure: [
    { step: 1, action: 'Check brakes; all lights and signals; mirrors; windshield and wipers; horn; and steering.' },
    { step: 2, action: 'Check every tire for tread, pressure, cuts, exposed material, separation, leaks, and other damage.' },
    { step: 3, action: 'Use a tread-depth gauge in a major tread groove: front/steering tires require at least 4/32 inch and other tires require at least 2/32 inch. Do not measure on tie bars, humps, or fillets.' },
    { step: 4, action: 'For a rough 2/32-inch screen only, place a penny into the groove with Lincoln’s head upside down. If the top of his head is visible, the tire is at or below the replacement threshold. Do not use this test to approve a steering tire; verify 4/32 inch with a gauge.' },
    { step: 5, action: 'Check fluid levels, fuel, seatbelt, emergency equipment including the fire extinguisher and warning triangles, cargo securement, and general body condition or leaks.' },
    { step: 6, action: 'If anything is unsafe or not working correctly, notify your BC immediately and pull over or park in a safe area.' }
  ],
  prohibited_actions: unique([
    ...(existingTire.prohibited_actions || []),
    'Do not approve a front/steering tire with less than 4/32 inch in a major tread groove.',
    'Do not approve another tire with less than 2/32 inch in a major tread groove.',
    'Do not use the penny test as proof that a front/steering tire meets the 4/32-inch requirement.'
  ]),
  driver_question_variants: unique([
    ...(existingTire.driver_question_variants || []),
    'What is the minimum tire tread depth',
    'How much tread do steer tires need',
    'Can I use the penny test on my delivery truck',
    'Front tire is at three thirty-seconds',
    'Drive tire tread is two thirty-seconds'
  ]),
  concise_ready_route_answer: 'Use a tread-depth gauge. Front/steering tires require at least 4/32 inch; other tires require at least 2/32 inch in a major groove. The penny test only screens for about 2/32 and cannot approve a steering tire. If a tire is below the applicable limit or damaged, do not continue without notifying your BC and parking safely.',
  more_info_answer: 'Insert a penny with Lincoln’s head upside down; seeing the top of his head means the tread is at or below about 2/32 inch. Federal truck rules require 4/32 inch on front tires, so use a gauge for that threshold.',
  evidence: appendEvidence(existingTire.evidence, batchEvidence(
    'Part A — Tire tread depth',
    'Directs Ready Route to add the 4/32-inch steer, 2/32-inch other-tire, and penny-test explanation.',
    [
      sourceEvidence(TIRE_RULE_SOURCE, '49 CFR 393.75(b)-(c)', 'Requires at least 4/32 inch on front wheels of a bus, truck, or truck tractor and at least 2/32 inch on other tires, measured in a major tread groove.'),
      sourceEvidence(PENNY_TEST_SOURCE, 'Tire Tread', 'Explains the Lincoln-head-down penny test as a screen for the 2/32-inch replacement threshold.')
    ]
  )),
  source_date_or_version: appendOnce(existingTire.source_date_or_version, '49 CFR 393.75 and NHTSA TireWise reviewed 2026-08-28; owner-approved addendum 2026-08-28'),
  review_notes: appendOnce(existingTire.review_notes, 'Tire-depth mechanics were expanded under the 2026-08-28 owner-approved addendum; the penny test is explicitly limited to the 2/32-inch screen.', ' '),
  updated_at: REVIEW_DATE
};

const existingMisdelivery = byId.get('KNO-DEL-MISDELIVERY-RECOVERY-001');
const misdeliveryRecord = {
  ...existingMisdelivery,
  version: Math.max(Number(existingMisdelivery.version || 1), 2),
  authoritative_rule: 'After physically recovering a misdelivered package, scan it again in the misdelivery recovery workflow and apply Code 17. Go to the correct address, scan it for delivery, verify and confirm the address when prompted, and process the delivery normally. If the same-day redelivery succeeds, the stop closes as Code 18.',
  required_procedure: [
    { step: 1, action: 'Physically recover the misdelivered package.' },
    { step: 2, action: 'Scan the package again in the misdelivery recovery workflow and apply Code 17. Code 18 applies only after a successful same-day redelivery.' },
    { step: 3, action: 'Go to the correct address.' },
    { step: 4, action: 'Scan the package again for delivery.' },
    { step: 5, action: 'When the scanner asks you to verify the address, check it and tap Confirm.' },
    { step: 6, action: 'Process the delivery as usual.' },
    { step: 7, action: 'If the same-day redelivery succeeds, confirm the stop closes as Code 18.' }
  ],
  driver_question_variants: unique([
    ...(existingMisdelivery.driver_question_variants || []),
    'I did a misdelivery but came back for the package',
    'How do I scan a recovered misdelivery',
    'What do I tap after Code 17',
    'Scanner asks me to verify the correct address'
  ]),
  concise_ready_route_answer: 'Recover and scan the package in the misdelivery workflow, then apply Code 17. At the correct address, scan it again, verify the address, tap Confirm, and deliver normally. A successful same-day redelivery closes as Code 18.',
  more_info_answer: 'Code 18 applies only when the same-day redelivery succeeds. Handle each recovered package by its actual result.',
  evidence: appendEvidence(existingMisdelivery.evidence, batchEvidence(
    'Part B — Misdelivery recovery mechanics',
    'Supplies the scan, Code 17, correct-address verification, confirmation, normal delivery, and successful Code 18 screen flow.'
  )),
  source_date_or_version: appendOnce(existingMisdelivery.source_date_or_version, 'Vlad field mechanics and owner approval 2026-08-28'),
  review_notes: appendOnce(existingMisdelivery.review_notes, 'Tap-level recovery mechanics were added through the 2026-08-28 owner-approved adjudication.', ' '),
  updated_at: REVIEW_DATE
};

const additions = [
  newRecord({
    knowledge_id: 'KNO-GLOSSARY-VISION-LABEL-SID-001',
    canonical_situation: 'A driver asks whether a Vision Label and SID sticker are the same thing',
    normalized_description: 'The driver needs a direct definition of the two interchangeable names for the same physical package label.',
    authoritative_rule: 'Yes. Vision Label and SID sticker refer to the same physical label on a package. Ready Route treats the terms as interchangeable.',
    applicability: ['A driver asks what a Vision Label or SID sticker is', 'A driver asks whether Vision Label and SID sticker refer to the same label'],
    exceptions: ['This definition does not by itself supply a procedure for scanning, removing, replacing, or correcting the label'],
    required_procedure: [],
    prohibited_actions: ['Do not treat Vision Label and SID sticker as different physical package labels.', 'Do not infer an unstated label-handling procedure from this definition alone.'],
    related_knowledge_ids: ['KNO-FORGE-WORK-AREA-TERM-001'],
    taxonomy_paths: ['TAX-FORGE', 'TAX-DELIVERY'],
    driver_question_variants: [
      'Is a Vision Label the same thing as an SID sticker',
      'Are a Vision Label and SID sticker the same',
      'Is the SID sticker the Vision Label',
      'What is a Vision Label',
      'What is an SID sticker',
      'Vision Label versus SID sticker'
    ],
    concise_ready_route_answer: 'Yes. Vision Label and SID sticker refer to the same physical label on a package. Ready Route treats the terms as interchangeable.',
    more_info_answer: 'This definition does not by itself change the approved procedure for scanning, removing, replacing, or correcting the label.',
    locator: 'Standing principle — Terminology note',
    evidence_summary: 'Explicitly states that Vision Label and SID sticker refer to the same physical label and are used interchangeably by drivers.'
  }),
  newRecord({
    knowledge_id: 'KNO-FORGE-WORK-AREA-TERM-001',
    canonical_situation: 'A driver asks what WA means or where to find the work-area number',
    normalized_description: 'The driver needs the meaning and package-label location of the WA route identifier.',
    authoritative_rule: 'WA means Work Area, another word for the route. The work-area number is the first three or four numbers on the Vision Label (SID sticker).',
    applicability: ['A driver asks what WA or Work Area means', 'A driver needs to locate the work-area number on a package'],
    required_procedure: [
      { step: 1, action: 'Find the Vision Label (SID sticker) on the package.' },
      { step: 2, action: 'Read the first three or four numbers; that is the Work Area or route number.' }
    ],
    prohibited_actions: ['Do not treat Vision Label and SID sticker as different package labels.'],
    taxonomy_paths: ['TAX-FORGE', 'TAX-ROUTE'],
    driver_question_variants: ['What does WA mean', 'What is my work area', 'Where is the work area number', 'First numbers on the SID sticker', 'Vision Label route number'],
    concise_ready_route_answer: 'WA means Work Area—another word for your route. It is the first three or four numbers on the Vision Label (SID sticker).',
    more_info_answer: 'Vision Label and SID sticker are two names for the same physical package label.',
    locator: 'Part C, item 1 — What does WA mean?',
    evidence_summary: 'Defines WA, equates it to the route, locates it on the label, and establishes the Vision Label/SID sticker equivalence.'
  }),
  newRecord({
    knowledge_id: 'KNO-FORGE-SIGNATURE-CAPTURE-001',
    canonical_situation: 'Capturing a customer signature on the delivery screen',
    normalized_description: 'The driver needs the tap-level signature-box and customer-name entry mechanics.',
    authoritative_rule: 'After tapping the delivery check mark, the signature box appears automatically when a signature is required or Met Customer is selected. Have the customer sign in the box, then enter the customer’s first initial and full last name.',
    applicability: ['The delivery requires a signature', 'The driver selected Met Customer and the signature box appears'],
    conditions: ['The signature-service requirements for the package still control who may sign'],
    required_procedure: [
      { step: 1, action: 'Complete the delivery selections and tap the check mark.' },
      { step: 2, action: 'When the signature box appears, have the customer sign inside the box.' },
      { step: 3, action: 'Enter the customer’s first initial and full last name.' }
    ],
    prohibited_actions: ['Do not bypass a required signature.', 'Do not use these mechanics to change who is eligible to sign for DSR, ISR, ASR, alcohol, or another restricted service.'],
    related_knowledge_ids: ['KNO-DEL-SIG-DSR-001', 'KNO-DEL-SIG-ISR-001', 'KNO-DEL-SIG-ASR-001'],
    taxonomy_paths: ['TAX-FORGE', 'TAX-DELIVERY/TAX-SIGNATURE'],
    driver_question_variants: ['How do I scan a signature on the screen', 'Where does the customer sign', 'Signature box did not show until check mark', 'What name do I type after signature', 'Met Customer signature'],
    concise_ready_route_answer: 'Tap the delivery check mark. When the signature box appears, have the customer sign in it, then enter the customer’s first initial and full last name.',
    more_info_answer: 'The signature box appears when a signature is required or when Met Customer is selected. Package-specific signer eligibility still controls.',
    locator: 'Part C, item 2 — Signature screen mechanics',
    evidence_summary: 'Supplies the check-mark, signature-box, customer-signature, and name-entry mechanics.'
  }),
  newRecord({
    knowledge_id: 'KNO-DEL-COD-GENERAL-001',
    canonical_situation: 'A customer asks to pay cash on delivery',
    normalized_description: 'The driver needs the approved response to a general cash-on-delivery request when no fuller COD procedure has been established.',
    authoritative_rule: 'Have the customer call your BC. This record does not establish a fuller cash-on-delivery collection procedure.',
    applicability: ['A customer asks to pay cash on delivery', 'The driver does not have an established approved COD procedure for the situation'],
    exceptions: ['A documented package-specific COD workflow controls when it directly applies'],
    required_procedure: [{ step: 1, action: 'Have the customer call your BC.' }],
    prohibited_actions: ['Do not invent a cash-collection procedure.', 'Do not accept or process cash based only on this record.'],
    escalation_requirements: ['The customer calls the BC for direction'],
    related_knowledge_ids: ['KNO-DEL-COD-MULTI-001'],
    taxonomy_paths: ['TAX-DELIVERY', 'TAX-POLICY'],
    driver_question_variants: ['Customer wants to pay cash on delivery', 'What do I do for COD', 'Can I take cash for this package', 'Customer says this is cash on delivery'],
    concise_ready_route_answer: 'Have the customer call your BC. Ready Route does not have a fuller approved COD procedure for this general situation.',
    more_info_answer: 'Do not collect or process cash by guessing. A directly applicable documented COD workflow remains controlling.',
    locator: 'Part C, item 3 — Cash on delivery',
    evidence_summary: 'Supplies the BC referral and explicitly notes that no fuller general COD procedure is established.'
  }),
  newRecord({
    knowledge_id: 'KNO-DEL-SIG-DSR-VS-ISR-001',
    canonical_situation: 'Explaining the conceptual difference between DSR and ISR',
    normalized_description: 'A new driver wants a plain-language comparison rather than the operational signature-service selector.',
    authoritative_rule: 'DSR requires an in-person signature from someone at the labeled delivery address, so a neighbor at another address cannot sign. ISR can allow an eligible neighbor’s signature when the required indirect-delivery scan, address, signature, and door-tag documentation are completed.',
    applicability: ['The driver asks what DSR means', 'The driver asks how DSR differs from ISR or an ordinary signature'],
    exceptions: ['ASR, alcohol, controlled-substance, appointment, and other stricter services have separate requirements'],
    required_procedure: [
      { step: 1, action: 'For DSR, obtain an in-person signature from someone at the labeled address; do not use a neighbor at another address.' },
      { step: 2, action: 'For ISR, an eligible neighbor can be used only through the documented indirect-delivery path, including the indirect address, signature, and scanned door tag left at the labeled address.' }
    ],
    prohibited_actions: ['Do not treat DSR and ISR as interchangeable.', 'Do not tell a driver that any neighbor can sign for ISR without the required indirect-delivery documentation.'],
    related_knowledge_ids: ['KNO-DEL-SIG-DSR-001', 'KNO-DEL-SIG-ISR-001', 'KNO-DEL-SIG-ASR-001'],
    taxonomy_paths: ['TAX-DELIVERY', 'TAX-DELIVERY/TAX-SIGNATURE'],
    driver_question_variants: ['What is the difference between DSR and just needs a signature', 'DSR versus ISR', 'How is direct signature different from indirect signature', 'What does direct signature mean', 'What does indirect signature mean'],
    concise_ready_route_answer: 'DSR needs an in-person signature at the labeled address; a neighbor at another address cannot sign. ISR can allow an eligible neighbor only through the documented indirect-delivery and door-tag process.',
    more_info_answer: 'This is the conceptual distinction. For an actual package, follow the specific DSR, ISR, ASR, alcohol, or other service procedure shown in FORGE.',
    locator: 'Part C, item 5 — DSR compared with ISR',
    evidence_summary: 'Supplies the conceptual distinction and directs conceptual questions away from the operational selector.',
    extra_evidence: [
      sourceEvidence('SRC-V2-OP117-20251215', 'pages 12 and 19-25', 'Defines DSR signer location and the documented ISR indirect-delivery path.')
    ]
  }),
  newRecord({
    knowledge_id: 'KNO-DEL-LABEL-TORN-BARCODE-SCANS-001',
    canonical_situation: 'A package label is torn but the barcode still scans',
    normalized_description: 'The driver must check package condition and decide whether the scannable package can be delivered normally.',
    authoritative_rule: 'If the barcode still scans and the package itself is not damaged, deliver it normally. Check the package condition first. If the package is damaged, use the damaged-package procedure instead.',
    applicability: ['The package label is torn or partly missing', 'The barcode still scans'],
    conditions: ['The package itself is not damaged'],
    exceptions: ['Damage, leakage, hazmat, unreadable delivery information, or another package-specific restriction requires its own procedure'],
    required_procedure: [
      { step: 1, action: 'Check the package itself for damage.' },
      { step: 2, action: 'If the package is undamaged and the barcode scans, deliver it normally.' },
      { step: 3, action: 'If the package is damaged, stop the normal-delivery path and use the damaged-package procedure.' }
    ],
    prohibited_actions: ['Do not treat a damaged or leaking package as an ordinary delivery merely because its barcode scans.'],
    related_knowledge_ids: ['KNO-HAZ-LEAK-001'],
    taxonomy_paths: ['TAX-DELIVERY', 'TAX-PACKAGE-HANDLING'],
    driver_question_variants: ['The label is torn off but the barcode still scans', 'Can I deliver a box with a ripped label', 'Barcode works but label is damaged', 'Shipping label partly missing'],
    concise_ready_route_answer: 'Check the package condition first. If the package is undamaged and the barcode scans, deliver it normally. If the package is damaged or leaking, use the applicable damaged-package procedure.',
    more_info_answer: 'A working barcode does not override package damage, leakage, hazmat, or another stricter requirement.',
    locator: 'Part C, item 6 — Torn label with scannable barcode',
    evidence_summary: 'Supplies the undamaged-and-scannable normal-delivery branch and the damaged-package exception.'
  }),
  newRecord({
    knowledge_id: 'KNO-POLICY-LUNCH-BREAK-001',
    canonical_situation: 'A driver asks about an informal lunch break or how to log lunch',
    normalized_description: 'Company break policy and the practical logging process may vary and must not be confused with a federal HOS-limit question.',
    authoritative_rule: 'Ask your BC because lunch-break policy and the practical logging process can vary by company. This record does not answer a federal HOS break-limit question.',
    applicability: ['The driver asks whether they get lunch', 'The driver asks how to log an ordinary lunch break'],
    exceptions: ['A question specifically about the federal hours-of-service break requirement belongs to the HOS record and current compliance guidance'],
    required_procedure: [{ step: 1, action: 'Ask your BC for the company lunch-break policy and the correct logging process.' }],
    prohibited_actions: ['Do not assume all companies use the same lunch policy or logging steps.', 'Do not substitute the federal HOS record for an informal company lunch-policy question.'],
    escalation_requirements: ['Ask the BC for company policy and logging mechanics'],
    related_knowledge_ids: ['KNO-HOS-DUTY-LIMITS-001'],
    taxonomy_paths: ['TAX-POLICY', 'TAX-ROUTE'],
    driver_question_variants: ['Do I get a lunch break and how do I log it', 'When can I take lunch', 'How do I clock out for lunch', 'What is my company lunch policy', 'Is lunch the same as my HOS break'],
    concise_ready_route_answer: 'Ask your BC. Lunch policy and the way your company logs it can vary.',
    more_info_answer: 'If you are specifically asking about a federal HOS break limit, use the HOS/compliance answer instead.',
    locator: 'Part C, item 7 — Lunch break and logging',
    evidence_summary: 'Supplies the company-policy BC referral and requires separation from the federal HOS break concept.'
  }),
  newRecord({
    knowledge_id: 'KNO-HAZ-PACKAGE-LABEL-001',
    canonical_situation: 'A driver asks what a diamond-shaped hazmat label on a package means',
    normalized_description: 'The driver recognizes a hazardous-material diamond but needs its meaning and the immediate paperwork/procedure boundary.',
    authoritative_rule: 'Drivers may call it a hazmat placard, but on an individual package it is generally a hazardous-material label or marking. The diamond communicates the hazard class or type, such as flammable, corrosive, or toxic, and some markings include an identification number. Treat the package as hazmat: verify the applicable manifest and package paperwork, including SF-136 when required, and follow the relevant hazmat procedure rather than ordinary-package handling.',
    applicability: ['A diamond-shaped hazardous-material label or marking appears on an individual package', 'The driver calls the package symbol a hazmat placard'],
    conditions: ['The exact paperwork and procedure depend on the package and hazard class'],
    exceptions: ['This definition alone does not establish acceptance, loading, delivery, leakage, incompatibility, placarding-weight, or emergency procedure'],
    required_procedure: [
      { step: 1, action: 'Recognize the diamond as a hazardous-material package label or marking and identify the displayed hazard class or type.' },
      { step: 2, action: 'Verify that the applicable manifest and package paperwork match, including SF-136 when required.' },
      { step: 3, action: 'Use the relevant hazmat procedure for the package; do not treat it as an ordinary package.' }
    ],
    required_documentation: ['Applicable hazmat manifest', 'Applicable package paperwork, including SF-136 when required'],
    prohibited_actions: ['Do not ignore the diamond label or marking.', 'Do not infer a complete hazmat procedure from the symbol alone.', 'Do not treat package labels and vehicle placards as technically identical.'],
    escalation_requirements: ['Use a FedEx Safety/Hazmat specialist or station compliance owner when the label, paperwork, or applicable procedure is uncertain'],
    related_knowledge_ids: ['KNO-HAZ-MANIFEST-001', 'KNO-HAZ-SF136-001', 'KNO-HAZ-LOAD-PAPERS-001', 'KNO-HAZ-LEAK-001'],
    taxonomy_paths: ['TAX-DOT/TAX-HAZMAT'],
    driver_question_variants: ['Hazmat placard on the package what does that mean', 'What is the diamond label on this box', 'Flammable diamond on package', 'Corrosive label on package', 'UN number on hazmat package'],
    concise_ready_route_answer: 'On an individual package, the diamond is generally a hazmat label or marking—not a vehicle placard. It identifies the hazard class or type. Verify the applicable manifest and package paperwork, including SF-136 when required, and follow the matching hazmat procedure.',
    more_info_answer: 'Placards are generally used on vehicles, freight containers, and bulk packaging. The symbol alone does not supply the complete acceptance, loading, delivery, damage, or emergency procedure.',
    locator: 'Part C, item 8 — Hazmat placard on the package',
    evidence_summary: 'Supplies the plain-language meaning, paperwork check, and hazmat-procedure boundary.',
    extra_evidence: [
      sourceEvidence(HAZMAT_LABEL_SOURCE, 'DOT Chart 17 — Labels and Placards', 'Distinguishes package hazard labels from placards and shows hazard-class labels and identification-number display formats.')
    ]
  }),
  newRecord({
    knowledge_id: 'KNO-FORGE-CANCEL-DELIVERED-SCAN-001',
    canonical_situation: 'Canceling an accidental delivered scan before it finalizes',
    normalized_description: 'The driver catches the wrong delivered scan immediately, before it commits, and needs the pre-finalization recovery steps.',
    authoritative_rule: 'If you catch the accidental delivered scan immediately before it finalizes, tap Cancel, return to the main menu, and scan the correct package. This is separate from Delete Scan for a wrong scan already committed to Stop Details and from recovery after a completed misdelivery.',
    applicability: ['The driver accidentally starts a delivered scan', 'The scan has not finalized or committed'],
    conditions: ['The Cancel option is still available before finalization'],
    exceptions: ['Use Delete Scan when the wrong package scan is already committed to Stop Details but delivery is not completed', 'Use misdelivery recovery when the wrong delivery has already completed'],
    required_procedure: [
      { step: 1, action: 'Tap Cancel before the accidental delivered scan finalizes.' },
      { step: 2, action: 'Return to the main menu.' },
      { step: 3, action: 'Scan the correct package.' }
    ],
    prohibited_actions: ['Do not use this pre-finalization branch for an already-committed scan or completed delivery.', 'Do not continue finalizing the wrong delivered scan.'],
    clarification_requirements: ['Is Cancel still available, is the scan committed to Stop Details, or is the delivery already completed?'],
    related_knowledge_ids: ['KNO-FORGE-DELETE-SCAN-001', 'KNO-DEL-MISDELIVERY-RECOVERY-001'],
    taxonomy_paths: ['TAX-FORGE', 'TAX-FORGE/TAX-STATUS'],
    driver_question_variants: ['I scanned delivered by accident before actually delivering', 'Cancel wrong delivered scan', 'Caught the wrong scan before it finalized', 'What do I do before the delivered scan commits', 'Difference between cancel and delete scan'],
    concise_ready_route_answer: 'If it has not finalized, tap Cancel, return to the main menu, and scan the correct package. If the scan already committed, use Delete Scan; if the wrong delivery completed, use misdelivery recovery.',
    more_info_answer: 'These are three different moments: cancel before finalization, Delete Scan after the scan commits but before delivery, and misdelivery recovery after a completed wrong delivery.',
    locator: 'Part C, item 9 — Accidental delivered scan before finalization',
    evidence_summary: 'Supplies the Cancel, main-menu, and correct-package steps and distinguishes them from committed-scan deletion.'
  })
];

const targetRecords = [tireRecord, misdeliveryRecord, ...additions];
for (const item of targetRecords) upsert(records, 'knowledge_id', item);

const targetIds = new Set(targetRecords.map((item) => item.knowledge_id));
const aliasChangedIds = new Set();
for (let index = 0; index < records.length; index += 1) {
  const before = records[index];
  // This standalone definition intentionally names both terms separately.
  // Rewriting "SID sticker" inside it would make the definition circular.
  if (before.knowledge_id === 'KNO-GLOSSARY-VISION-LABEL-SID-001') continue;
  const after = applyDriverFacingTerminology(before);
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    aliasChangedIds.add(after.knowledge_id);
    if (!targetIds.has(after.knowledge_id)) {
      const alreadyUpdated = after.updated_at === REVIEW_DATE
        && String(after.review_notes || '').includes('Driver-facing SID terminology now also identifies');
      after.version = alreadyUpdated ? Number(after.version || 1) : Number(after.version || 1) + 1;
      after.updated_at = REVIEW_DATE;
      after.review_notes = appendOnce(
        after.review_notes,
        'Driver-facing SID terminology now also identifies the same label as the Vision Label under the 2026-08-28 owner approval.',
        ' '
      );
    }
    records[index] = after;
  }
}
writeJsonLines(RECORDS_PATH, records);

const finalById = new Map(records.map((item) => [item.knowledge_id, item]));
const adjudications = JSON.parse(fs.readFileSync(ADJUDICATIONS_PATH, 'utf8'));
for (let index = 0; index < adjudications.length; index += 1) {
  const item = adjudications[index];
  if (item.status !== 'APPROVED' || !aliasChangedIds.has(item.knowledge_id)) continue;
  const transformed = { ...item, canonical_overrides: mapText(item.canonical_overrides) };
  if (JSON.stringify(item.canonical_overrides) !== JSON.stringify(transformed.canonical_overrides)) {
    transformed.supporting_source_ids = unique([...(item.supporting_source_ids || []), REPORT_SOURCE, APPROVAL_SOURCE]);
    transformed.reasoning = `${item.reasoning} The 2026-08-28 owner approval also establishes Vision Label and SID sticker as equivalent driver terminology without changing the procedure.`;
    transformed.terminology_updated_at = REVIEW_DATE;
    adjudications[index] = transformed;
  }
}

const existingTireApprovalIndex = adjudications.findIndex((item) => item.knowledge_id === tireRecord.knowledge_id && item.status === 'APPROVED');
if (existingTireApprovalIndex < 0) throw new Error('Missing active vehicle-inspection approval');
const oldTireApproval = adjudications[existingTireApprovalIndex];
adjudications[existingTireApprovalIndex] = {
  ...oldTireApproval,
  issue_reviewed: 'The unified vehicle inspection checklist, including minimum tire tread depth and the limited penny-test screen.',
  canonical_determination: finalById.get(tireRecord.knowledge_id).authoritative_rule,
  supporting_source_ids: unique((finalById.get(tireRecord.knowledge_id).evidence || []).map((item) => item.source_id)),
  reasoning: 'Phillip Metzger approved Vlad’s tire-tread addendum and directed Ready Route to follow it. 49 CFR 393.75 supports the 4/32-inch front and 2/32-inch other-tire thresholds; NHTSA supports the penny test only as a 2/32-inch screen.',
  approval_date: REVIEW_DATE,
  effective_date: REVIEW_DATE,
  reopen_conditions: unique([
    ...(oldTireApproval.reopen_conditions || []),
    'The applicable tire rule, NHTSA screening guidance, or company out-of-service policy changes.'
  ]),
  canonical_overrides: canonicalOverrides(finalById.get(tireRecord.knowledge_id))
};

const approvals = [
  approval(finalById.get(misdeliveryRecord.knowledge_id), ['The source-verified record contained the Code 17 and Code 18 result but lacked Vlad’s tap-level screen sequence.']),
  ...additions.map((item) => approval(
    finalById.get(item.knowledge_id),
    ['Ready Route did not have a published answer with this exact new-driver terminology or mechanic-level scope.']
  ))
];
for (const item of approvals) upsert(adjudications, 'adjudication_id', item);
fs.writeFileSync(ADJUDICATIONS_PATH, `${JSON.stringify(adjudications, null, 2)}\n`);

const cases = [
  ['NEWDRV-TIRE-TREAD-001', 'What is the minimum tire tread depth?', ['Can I use the penny test on the steer tires', 'front tire is only three thirty-seconds'], 'KNO-VEH-DOT-INSPECTION-001', ['say 2/32 is enough for a front steering tire', 'use the penny test to approve 4/32']],
  ['NEWDRV-MISDELIVERY-MECHANICS-001', 'I did a misdelivery but came back for the package. What do I tap?', ['how do I scan the recovered box', 'scanner asks me to verify the correct address'], 'KNO-DEL-MISDELIVERY-RECOVERY-001', ['omit Code 17', 'apply Code 18 before successful redelivery']],
  ['NEWDRV-WA-001', 'What does WA mean?', ['where is work area on the SID sticker', 'first numbers on the Vision Label'], 'KNO-FORGE-WORK-AREA-TERM-001', ['offer unrelated clarification options', 'treat Vision Label and SID sticker as different']],
  ['NEWDRV-SIGNATURE-CAPTURE-001', 'How do I actually scan a signature on the screen?', ['where does customer sign after check mark', 'what customer name do I type'], 'KNO-FORGE-SIGNATURE-CAPTURE-001', ['route to HAL', 'omit first initial and full last name']],
  ['NEWDRV-COD-GENERAL-001', 'Customer wants to pay cash on delivery. What do I do?', ['can I take cash for this COD', 'customer says this package is cash on delivery'], 'KNO-DEL-COD-GENERAL-001', ['invent a cash collection procedure', 'route to customer tip policy']],
  ['NEWDRV-DSR-VS-ISR-001', 'What is the difference between DSR and just needs a signature?', ['DSR versus ISR in plain English', 'how is direct signature different from indirect signature'], 'KNO-DEL-SIG-DSR-VS-ISR-001', ['force the question into the operational selector', 'say a neighbor at another address can sign DSR']],
  ['NEWDRV-TORN-LABEL-001', 'The label is torn off but the barcode still scans. Is that OK?', ['ripped label barcode works', 'can I deliver an undamaged box with torn label'], 'KNO-DEL-LABEL-TORN-BARCODE-SCANS-001', ['ignore package damage', 'route to no-barcode Key Enter']],
  ['NEWDRV-LUNCH-001', 'Do I get a lunch break and how do I log it?', ['how do I clock out for lunch', 'when can I take my company lunch'], 'KNO-POLICY-LUNCH-BREAK-001', ['answer only with the federal HOS rule', 'invent one company-wide lunch policy']],
  ['NEWDRV-HAZMAT-LABEL-001', 'Hazmat placard on the package—what does that mean?', ['what is the diamond on this box', 'flammable label and UN number on package'], 'KNO-HAZ-PACKAGE-LABEL-001', ['treat it as an ordinary package', 'claim the symbol alone supplies the complete hazmat procedure']],
  ['NEWDRV-CANCEL-SCAN-001', 'I scanned delivered by accident before actually delivering it. What do I do?', ['caught wrong delivered scan before finalizing', 'cancel before the scan commits'], 'KNO-FORGE-CANCEL-DELIVERED-SCAN-001', ['tell the driver to use Delete Scan before finalization', 'route directly to completed misdelivery recovery']]
].map(([case_id, utterance, semantic_variations, knowledgeId, must_not_do]) => ({
  case_id,
  utterance,
  semantic_variations,
  expected_knowledge_ids: [knowledgeId],
  must_clarify: [],
  must_not_do,
  case_type: 'NEW_DRIVER_TERMINOLOGY_MECHANICS_OWNER_APPROVED',
  information_sufficiency: 'SUFFICIENT',
  response_mode: 'DIRECT_SOURCE_GROUNDED_ANSWER'
}));

cases.push({
  case_id: 'NEWDRV-VISION-LABEL-SID-EQUIVALENCE-001',
  utterance: 'Is a vision label the same thing as an SID sticker',
  semantic_variations: [
    'Are a Vision Label and SID sticker the same',
    'Is the SID sticker the Vision Label',
    'Vision Label versus SID sticker'
  ],
  expected_knowledge_ids: ['KNO-GLOSSARY-VISION-LABEL-SID-001'],
  must_clarify: [],
  must_not_do: ['say the terms identify different labels', 'offer an unrelated operational procedure', 'say no verified answer exists'],
  case_type: 'NEW_DRIVER_TERMINOLOGY_MECHANICS_OWNER_APPROVED',
  information_sufficiency: 'SUFFICIENT',
  response_mode: 'DIRECT_SOURCE_GROUNDED_ANSWER',
  answer_override: {
    direct_answer: 'Yes. Vision Label and SID sticker refer to the same physical label on a package. Ready Route treats the terms as interchangeable.',
    steps: ['Treat either term as referring to that same physical package label.'],
    watch_for: 'This definition does not change any approved procedure for scanning, removing, replacing, or correcting the label.'
  }
});

const evaluations = readJsonLines(CASES_PATH);
for (const item of cases) upsert(evaluations, 'case_id', item);
writeJsonLines(CASES_PATH, evaluations);

const inventory = readCsvObjects(INVENTORY_PATH);
const inventoryRows = [
  {
    source_id: REPORT_SOURCE,
    source_system: 'Ready Route v2 intake',
    parent_source_id: '',
    title: 'ReadyRoute New-Driver Terminology & Mechanics Addendum',
    source_type: 'MARKDOWN',
    mime_type: 'text/markdown',
    url_or_path: 'Owner-supplied ReadyRoute addendum in the 2026-08-28 workspace session',
    created_at: REVIEW_DATE,
    modified_at: REVIEW_DATE,
    effective_date: REVIEW_DATE,
    version: '2026-08-28 addendum',
    apparent_subject: 'New-driver terminology, tap-level mechanics, and ten tested question outcomes',
    apparent_audience: 'Ready Route product and engineering',
    access_status: 'ACCESSIBLE',
    review_status: 'INTAKE_REVIEWED',
    relevance_status: 'HIGH_RELEVANCE',
    duplicate_of: '', supersedes: '', superseded_by: '', cross_references: APPROVAL_SOURCE,
    local_archive_path: 'research/fedex-ground-driver-knowledge/sources/v2-intake-2026-08-28/vlad/ReadyRoute_New_Driver_Terminology_Mechanics_Addendum_2026-08-28.md',
    interpretation_limits: 'Use only the explicit supplied mechanics and branch boundaries. Confirmed-working examples are style references and do not create broader procedures.',
    review_notes: 'Preserved from the owner-supplied report and approved in full within its stated scope.',
    last_reviewed_at: REVIEW_DATE,
    metadata_recovery_status: 'OWNER_SUPPLIED',
    metadata_recovery_basis: 'Owner-supplied content in the current workspace session'
  },
  {
    source_id: APPROVAL_SOURCE,
    source_system: 'Ready Route product-owner decision',
    parent_source_id: '',
    title: 'Ready Route owner approval — New-driver terminology and mechanics',
    source_type: 'Policy',
    mime_type: 'text/markdown',
    url_or_path: 'docs/ready-route-owner-approval-new-driver-terminology-mechanics-2026-08-28.md',
    created_at: REVIEW_DATE,
    modified_at: REVIEW_DATE,
    effective_date: REVIEW_DATE,
    version: 'Owner approval',
    apparent_subject: 'Authority for the New-Driver Terminology & Mechanics Addendum',
    apparent_audience: 'Ready Route knowledge authors',
    access_status: 'ACCESSIBLE',
    review_status: 'OWNER_APPROVED',
    relevance_status: 'HIGH_RELEVANCE',
    duplicate_of: '', supersedes: '', superseded_by: '', cross_references: REPORT_SOURCE,
    local_archive_path: 'docs/ready-route-owner-approval-new-driver-terminology-mechanics-2026-08-28.md',
    interpretation_limits: 'Applies only within the exact supplied procedures and stated scope limits.',
    review_notes: 'Phillip Metzger completely approved the supplied procedures and directed Ready Route to follow Vlad’s direction.',
    last_reviewed_at: REVIEW_DATE,
    metadata_recovery_status: 'OWNER_DIRECTIVE',
    metadata_recovery_basis: 'Explicit product-owner approval in the current workspace session'
  },
  {
    source_id: TIRE_RULE_SOURCE,
    source_system: 'Electronic Code of Federal Regulations', parent_source_id: '',
    title: '49 CFR 393.75 — Tires', source_type: 'WEB', mime_type: 'text/html',
    url_or_path: 'https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-393/subpart-G/section-393.75',
    created_at: '', modified_at: REVIEW_DATE, effective_date: REVIEW_DATE, version: 'Current eCFR reviewed 2026-08-28',
    apparent_subject: 'Commercial-motor-vehicle tire condition and minimum tread depth', apparent_audience: 'Motor carriers and drivers',
    access_status: 'ACCESSIBLE', review_status: 'REVIEWED_RELEVANT_SECTION', relevance_status: 'HIGH_RELEVANCE',
    duplicate_of: '', supersedes: '', superseded_by: '', cross_references: PENNY_TEST_SOURCE, local_archive_path: '',
    interpretation_limits: 'Supports the regulatory 4/32-inch front and 2/32-inch other-tire thresholds and measurement location; does not supply the penny test.',
    review_notes: 'Section 393.75(b)-(c) reviewed for the tire-depth claim.', last_reviewed_at: REVIEW_DATE,
    metadata_recovery_status: 'NATIVE_WEB', metadata_recovery_basis: 'Official current eCFR URL'
  },
  {
    source_id: PENNY_TEST_SOURCE,
    source_system: 'National Highway Traffic Safety Administration', parent_source_id: '',
    title: 'Tire Safety Ratings and Awareness — TireWise', source_type: 'WEB', mime_type: 'text/html',
    url_or_path: 'https://www.nhtsa.gov/vehicle-safety/tires', created_at: '', modified_at: REVIEW_DATE,
    effective_date: REVIEW_DATE, version: 'Current page reviewed 2026-08-28', apparent_subject: 'Tire safety and the penny tread test',
    apparent_audience: 'Drivers and vehicle owners', access_status: 'ACCESSIBLE', review_status: 'REVIEWED_RELEVANT_SECTION', relevance_status: 'HIGH_RELEVANCE',
    duplicate_of: '', supersedes: '', superseded_by: '', cross_references: TIRE_RULE_SOURCE, local_archive_path: '',
    interpretation_limits: 'Supports the penny test only as a 2/32-inch replacement screen; it does not establish or verify the 4/32-inch front-tire threshold.',
    review_notes: 'Tire Tread section reviewed for the Lincoln-head-down test.', last_reviewed_at: REVIEW_DATE,
    metadata_recovery_status: 'NATIVE_WEB', metadata_recovery_basis: 'Official NHTSA URL'
  },
  {
    source_id: HAZMAT_LABEL_SOURCE,
    source_system: 'Pipeline and Hazardous Materials Safety Administration', parent_source_id: '',
    title: 'DOT Chart 17 — Hazardous Materials Markings, Labeling and Placarding Guide', source_type: 'PDF', mime_type: 'application/pdf',
    url_or_path: 'https://www.phmsa.dot.gov/sites/phmsa.dot.gov/files/2022-06/Chart17-03-15-2022-1216-508-compliant.pdf',
    created_at: '2022-03-15', modified_at: REVIEW_DATE, effective_date: '2022-03-15', version: 'DOT Chart 17, 2022',
    apparent_subject: 'Hazardous-material package labels, markings, placards, and identification-number displays', apparent_audience: 'Hazmat transportation personnel',
    access_status: 'ACCESSIBLE', review_status: 'REVIEWED_RELEVANT_SECTION', relevance_status: 'HIGH_RELEVANCE', duplicate_of: '', supersedes: '', superseded_by: '',
    cross_references: '', local_archive_path: '',
    interpretation_limits: 'Supports the distinction between package labels/markings and placards and the general hazard-communication meaning; does not replace package-specific FedEx procedures.',
    review_notes: 'Relevant labels, placards, and identification-number portions reviewed.', last_reviewed_at: REVIEW_DATE,
    metadata_recovery_status: 'NATIVE_PDF_WEB', metadata_recovery_basis: 'Official PHMSA PDF URL'
  }
];
for (const item of inventoryRows) upsert(inventory.rows, 'source_id', item);
writeCsvObjects(INVENTORY_PATH, inventory.headers, inventory.rows);

const capture = readCsvObjects(CAPTURE_PATH);
for (const item of targetRecords.map((record) => finalById.get(record.knowledge_id))) {
  const evidenceSourceIds = unique((item.evidence || []).map((row) => row.source_id));
  upsert(capture.rows, 'knowledge_id', {
    knowledge_id: item.knowledge_id,
    knowledge_status: item.knowledge_status,
    evidence_source_ids: evidenceSourceIds.join(';'),
    durable_source_ids: `${REPORT_SOURCE};${APPROVAL_SOURCE}`,
    rendered_full_source_ids: '',
    rendered_partial_source_ids: '',
    transient_full_source_ids: evidenceSourceIds.filter((id) => ![REPORT_SOURCE, APPROVAL_SOURCE].includes(id)).join(';'),
    transient_partial_source_ids: '',
    evidence_capture_class: 'OWNER_APPROVED_DURABLE_MARKDOWN_WITH_SUPPLEMENTAL_AUTHORITY',
    production_capture_gate: 'CAPTURE_COMPLETE_OWNER_VERIFICATION',
    authenticated_queue_resource_ids: '',
    required_follow_up: 'Reopen if Phillip, Vlad, company policy, scanner behavior, or later applicable operational, regulatory, or safety guidance changes the approved answer.'
  });
}
writeCsvObjects(CAPTURE_PATH, capture.headers, capture.rows);

const changes = readJsonLines(CHANGE_LOG_PATH);
for (const item of records) {
  const previous = originalById.get(item.knowledge_id) || { knowledge_id: item.knowledge_id, state: 'ABSENT_FROM_ACTIVE_CORPUS' };
  if (JSON.stringify(previous) === JSON.stringify(item)) continue;
  const change_id = `CHG-20260828-${item.knowledge_id.replace(/^KNO-/, '')}`;
  const existingChange = changes.find((change) => change.change_id === change_id);
  upsert(changes, 'change_id', {
    change_id,
    knowledge_id: item.knowledge_id,
    changed_at: REVIEW_DATE,
    changed_by: OWNER,
    change_reason: targetIds.has(item.knowledge_id)
      ? 'Added or upgraded the owner-approved New-Driver Terminology & Mechanics answer.'
      : 'Applied the owner-approved Vision Label and SID sticker terminology equivalence to driver-facing knowledge.',
    previous_record: existingChange?.previous_record || previous,
    previous_checksum: existingChange?.previous_checksum || sha256(previous),
    new_record: item,
    new_checksum: sha256(item)
  });
}
writeJsonLines(CHANGE_LOG_PATH, changes);

console.log(JSON.stringify({
  records_added_or_upgraded: targetRecords.length,
  records_with_sid_vision_equivalence: aliasChangedIds.size,
  evaluations_added_or_updated: cases.length,
  approvals_added_or_updated: approvals.length + 1
}, null, 2));
