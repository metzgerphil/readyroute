#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RESEARCH = path.join(ROOT, 'research/fedex-ground-driver-knowledge');
const RECORDS_PATH = path.join(RESEARCH, 'knowledge/records.jsonl');
const CASES_PATH = path.join(RESEARCH, 'validation/driver_language_cases.jsonl');
const CONVERSATIONS_PATH = path.join(RESEARCH, 'validation/conversation_scenarios.jsonl');
const OUT_OF_CORPUS_PATH = path.join(RESEARCH, 'validation/out_of_corpus_cases.jsonl');
const CHANGE_LOG_PATH = path.join(RESEARCH, 'knowledge/change_log.jsonl');
const ADJUDICATIONS_PATH = path.join(ROOT, 'knowledge/adjudications/records.json');
const INVENTORY_PATH = path.join(RESEARCH, 'inventory/source_inventory.csv');
const CAPTURE_PATH = path.join(RESEARCH, 'knowledge/evidence_capture_risk_coverage.csv');

const REPORT_SOURCE = 'SRC-V2-VLAD-POST-UPDATE-FINDINGS-20260903';
const APPROVAL_SOURCE = 'SRC-V2-OWNER-VLAD-POST-UPDATE-APPROVAL-20260903';
const REVIEW_DATE = '2026-09-03';
const OWNER = 'Phillip Metzger, Ready Route product owner';

function readJsonLines(filePath) {
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
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
  return [...new Set((values || []).filter(Boolean))];
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

function reportEvidence(locator, summary) {
  return [
    {
      source_id: REPORT_SOURCE,
      locator,
      evidence_summary: summary,
      reviewed_at: REVIEW_DATE
    },
    {
      source_id: APPROVAL_SOURCE,
      locator: 'Approved scope',
      evidence_summary: 'Phillip Metzger supplied the report under his standing direction to follow Vlad’s field-verified mechanics within their stated scope.',
      reviewed_at: REVIEW_DATE
    }
  ];
}

function ownerRecord(input) {
  return {
    knowledge_id: input.knowledge_id,
    version: input.version || 1,
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
    evidence: reportEvidence(input.locator, input.evidence_summary),
    source_date_or_version: 'Vlad post-update field verification received and owner-authorized 2026-09-03',
    knowledge_status: 'HUMAN_REVIEW_REQUIRED',
    review_notes: 'Published only through the scoped 2026-09-03 post-update READY_ROUTE_APPROVED adjudication.',
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
    adjudication_id: `ADJ-20260903-POST-UPDATE-${record.knowledge_id.replace(/^KNO-/, '')}`,
    knowledge_id: record.knowledge_id,
    status: 'APPROVED',
    issue_reviewed: record.canonical_situation,
    canonical_determination: record.authoritative_rule,
    previous_interpretations: previousInterpretations,
    supporting_source_ids: unique((record.evidence || []).map((item) => item.source_id)),
    conflicting_or_superseded_source_ids: [],
    reasoning: 'Vlad supplied the current field procedure and Phillip Metzger’s standing owner direction authorizes Vlad’s field-verified mechanics within the exact supplied scope. Conflicting older records remain preserved and are explicitly reopened or superseded rather than silently deleted.',
    approved_by: OWNER,
    approval_date: REVIEW_DATE,
    effective_date: REVIEW_DATE,
    supersedes: [],
    reopen_conditions: [
      'Phillip or Vlad revises the supplied procedure.',
      'A current FORGE screen or later applicable operational, company-policy, safety, or regulatory update materially conflicts with it.',
      'A more specific scenario establishes a different approved procedure.'
    ],
    canonical_overrides: canonicalOverrides(record)
  };
}

const records = readJsonLines(RECORDS_PATH);
const originalById = new Map(records.map((record) => [record.knowledge_id, JSON.parse(JSON.stringify(record))]));

const unsafeAccess = ownerRecord({
  knowledge_id: 'KNO-DEL-UNSAFE-ACCESS-001',
  canonical_situation: 'Road or structure conditions make driving to the delivery location unsafe',
  normalized_description: 'A bridge, road, driveway, obstruction, clearance, animal, or turnaround condition makes vehicle access to the delivery location unsafe.',
  authoritative_rule: 'Do not drive into the unsafe access condition. Apply Code 001 and add a comment stating the specific reason the location could not be reached safely.',
  applicability: ['Driving to the delivery location would be unsafe because of the road, structure, access path, obstruction, clearance, animal, or turnaround condition'],
  conditions: ['The driver is unable to reach the delivery location safely'],
  exceptions: ['This owner-approved operational use does not change the preserved source-reference definition for Code 001'],
  required_procedure: [
    { step: 1, action: 'Do not drive into or across the unsafe condition.' },
    { step: 2, action: 'Apply Code 001.' },
    { step: 3, action: 'Add a comment explaining the specific unsafe condition so the station knows what happened.' }
  ],
  required_documentation: ['Code 001', 'Comment stating the specific unsafe-access reason'],
  prohibited_actions: ['Do not drive into an unsafe road or structure condition to complete the delivery.', 'Do not omit the comment explaining the reason.'],
  clarification_requirements: [],
  related_knowledge_ids: ['KNO-WEATHER-QUESTIONABLE-001'],
  taxonomy_paths: ['TAX-DELIVERY', 'TAX-INCIDENT'],
  driver_question_variants: [
    'Wooden bridge feels unsecured', 'Road is washed out and unsafe', 'Driveway is too steep for the truck',
    'Fallen tree blocks the only safe path', 'No safe place to turn around', 'Low clearance prevents safe access',
    'The weather and road conditions look unsafe', 'Unsafe road to the delivery'
  ],
  concise_ready_route_answer: 'Do not drive into the unsafe condition. Apply Code 001 and add a comment explaining the specific reason.',
  more_info_answer: 'Examples include unsafe bridges, flooding, ice or snow, severe road damage, steep or unsuitable driveways, debris or construction, loose animals blocking the only path, low clearance, or no safe turnaround.',
  locator: 'Section D.1 — Unsafe road or structure conditions',
  evidence_summary: 'Vlad supplied Code 001 plus a required explanatory comment for any condition that makes driving to the delivery location unsafe.'
});

const groundCloudRoute = ownerRecord({
  knowledge_id: 'KNO-GROUNDCLOUD-ROUTE-MISMATCH-001',
  canonical_situation: 'GroundCloud shows a different route than the driver expected',
  normalized_description: 'The route displayed in GroundCloud does not match the route the driver expected or was assigned.',
  authoritative_rule: 'Call your BC.',
  applicability: ['GroundCloud displays an unexpected or different route'],
  required_procedure: [{ step: 1, action: 'Call your BC.' }],
  prohibited_actions: ['Do not guess which route should be followed.'],
  escalation_requirements: ['Call the BC'],
  taxonomy_paths: ['TAX-ROUTE', 'TAX-FORGE'],
  driver_question_variants: ['GroundCloud shows the wrong route', 'GroundCloud has a different route than expected', 'My route in GroundCloud is not the one I expected'],
  concise_ready_route_answer: 'Call your BC.',
  locator: 'Section D.2 — GroundCloud route mismatch',
  evidence_summary: 'Vlad supplied the direct BC escalation for an unexpected GroundCloud route.'
});

const routeCompletion = ownerRecord({
  knowledge_id: 'KNO-ROUTE-NOT-COMPLETE-001',
  canonical_situation: 'The driver believes the whole route cannot be completed',
  normalized_description: 'The driver believes they will be unable to finish the complete route, distinct from one pickup-window risk or a request to calculate hours-of-service limits.',
  authoritative_rule: 'Call your BC.',
  applicability: ['The driver believes the whole route cannot be completed'],
  exceptions: ['A question about one pickup window follows the pickup-window procedure', 'A request to calculate a regulatory driving limit follows the hours-of-service record'],
  required_procedure: [{ step: 1, action: 'Call your BC.' }],
  prohibited_actions: ['Do not route this statement into an hours-of-service calculation unless the driver actually asks about driving-hour limits.'],
  escalation_requirements: ['Call the BC'],
  taxonomy_paths: ['TAX-ROUTE'],
  driver_question_variants: ['I cannot finish my whole route', 'I do not think I can complete the route today', 'There is no way I will finish all my stops', 'I will not make it through my entire route'],
  concise_ready_route_answer: 'Call your BC.',
  locator: 'Section D.3 — Whole-route completion risk',
  evidence_summary: 'Vlad supplied the direct BC escalation and distinguished this from a single pickup-window problem.'
});

const nonHazardousLeak = ownerRecord({
  knowledge_id: 'KNO-DEL-LEAK-NONHAZ-001',
  canonical_situation: 'A leaking package is confirmed not to be hazardous material',
  normalized_description: 'The package is leaking but is confirmed not hazardous, so the non-hazmat return procedure applies.',
  authoritative_rule: 'Apply Code 010, cross the package, remove the Vision Label/SID sticker, and bring the package back to the station.',
  applicability: ['The package is leaking', 'The package is confirmed not hazardous'],
  conditions: ['Hazardous status is known to be negative'],
  exceptions: ['A hazardous leaking package follows the hazardous-leak BC procedure'],
  required_procedure: [
    { step: 1, action: 'Apply Code 010.' },
    { step: 2, action: 'Cross the package.' },
    { step: 3, action: 'Remove the Vision Label/SID sticker.' },
    { step: 4, action: 'Bring the package back to the station.' }
  ],
  required_documentation: ['Code 010', 'Package service cross'],
  prohibited_actions: ['Do not use this branch for a hazardous leaking package.', 'Do not deliver the leaking package.'],
  related_knowledge_ids: ['KNO-HAZ-LEAK-001', 'KNO-DEL-NOTATION-001'],
  taxonomy_paths: ['TAX-DELIVERY', 'TAX-INCIDENT'],
  driver_question_variants: ['Non hazardous package is leaking', 'The leaking box is not hazmat', 'What do I do with a leaking non-hazardous package'],
  concise_ready_route_answer: 'Apply Code 010, cross the package, remove the Vision Label/SID sticker, and bring it back to the station.',
  locator: 'Section E — Non-hazardous leaking package correction',
  evidence_summary: 'Vlad supplied the corrected Code 010, crossing, SID-removal, and station-return sequence for a non-hazardous leak.'
});

const sameAddressLeak = ownerRecord({
  knowledge_id: 'KNO-DEL-LEAK-SAME-ADDRESS-001',
  canonical_situation: 'One package is leaking but other packages for the same address look fine',
  normalized_description: 'Only one package for the stop is leaking; the other packages appear unaffected and can be delivered normally.',
  authoritative_rule: 'Deliver every package that looks fine. Apply the applicable hazardous or non-hazardous leak branch only to the leaking package.',
  applicability: ['Multiple packages are for the same address', 'One package is leaking', 'The other packages look fine'],
  conditions: ['Each package that is delivered appears unaffected'],
  required_procedure: [
    { step: 1, action: 'Separate the leaking package from the packages that look fine.' },
    { step: 2, action: 'Deliver the packages that look fine as usual.' },
    { step: 3, action: 'If the leaking package is hazardous, park safely and call your BC.' },
    { step: 4, action: 'If the leaking package is confirmed not hazardous, apply Code 010, cross it, remove the Vision Label/SID sticker, and bring it back to the station.' }
  ],
  prohibited_actions: ['Do not apply the leaking-package disposition to unaffected packages.', 'Do not use the non-hazardous branch for a hazardous leak.'],
  clarification_requirements: [],
  related_knowledge_ids: ['KNO-HAZ-LEAK-001', 'KNO-DEL-LEAK-NONHAZ-001'],
  taxonomy_paths: ['TAX-DELIVERY', 'TAX-INCIDENT'],
  driver_question_variants: ['One box is leaking but the other boxes for the stop are fine', 'Can I deliver the good packages when one package leaks', 'Leaking package and good packages at the same address'],
  concise_ready_route_answer: 'Deliver the packages that look fine. For the leaking package, park safely and call your BC if it is hazardous; if it is confirmed not hazardous, use Code 010, cross it, remove the SID sticker, and return it to the station.',
  locator: 'Section D.4 and Section E — Mixed leaking and unaffected packages',
  evidence_summary: 'Vlad authorized delivery of unaffected packages and supplied separate hazardous and non-hazardous handling for the leaking package.'
});

for (const record of [unsafeAccess, groundCloudRoute, routeCompletion, nonHazardousLeak, sameAddressLeak]) {
  upsert(records, 'knowledge_id', record);
}

function updateExisting(knowledgeId, mutate) {
  const index = records.findIndex((record) => record.knowledge_id === knowledgeId);
  if (index < 0) throw new Error(`Missing record ${knowledgeId}`);
  records[index] = mutate(JSON.parse(JSON.stringify(records[index])));
  return records[index];
}

const hazardousLeak = updateExisting('KNO-HAZ-LEAK-001', (record) => ({
  ...record,
  version: Math.max(Number(record.version || 1), 2),
  canonical_situation: 'A leaking package is hazardous material',
  normalized_description: 'The driver identifies a leaking package as hazardous and needs the current owner-approved safety and BC escalation.',
  authoritative_rule: 'Park in a safe place and call your BC.',
  applicability: ['The package is leaking', 'The package is hazardous material or dangerous goods'],
  conditions: ['Park only when and where it is safe to do so'],
  exceptions: ['A leaking package confirmed not hazardous follows the separate Code 010 return procedure'],
  required_procedure: [
    { step: 1, action: 'Park in a safe place.' },
    { step: 2, action: 'Call your BC.' }
  ],
  required_documentation: [],
  prohibited_actions: ['Do not substitute the non-hazardous Code 010 branch for a hazardous leak.'],
  escalation_requirements: ['Call the BC'],
  clarification_requirements: [],
  related_knowledge_ids: unique([...(record.related_knowledge_ids || []), 'KNO-DEL-LEAK-NONHAZ-001']),
  driver_question_variants: unique([...(record.driver_question_variants || []), 'This leaking package is hazardous', 'Hazmat package is leaking call BC', 'Dangerous goods package is leaking']),
  concise_ready_route_answer: 'Park in a safe place and call your BC.',
  more_info_answer: 'This is the hazardous-leak branch. A package confirmed not hazardous follows the separate Code 010 return procedure.',
  evidence: appendEvidence(record.evidence, reportEvidence('Section E — Hazardous leaking-package correction', 'Vlad replaced the prior station-representative/cleanup wording with the direct safe-parking and BC procedure.')),
  source_date_or_version: `${record.source_date_or_version || ''}; owner-approved field correction 2026-09-03`,
  knowledge_status: 'HUMAN_REVIEW_REQUIRED',
  review_notes: 'Version 2 preserves the prior source history while publishing Vlad’s current owner-authorized hazardous-leak correction.',
  updated_at: REVIEW_DATE
}));

const handSheetGeneral = updateExisting('KNO-DOC-HANDSHEET-GENERAL-001', (record) => ({
  ...record,
  version: Math.max(Number(record.version || 1), 2),
  canonical_situation: 'The driver needs to complete a station-issued hand sheet',
  normalized_description: 'The driver is recording a delivery on the current station-issued hand sheet and needs the field-level mechanics.',
  authoritative_rule: 'Record the delivery date, write the tracking number four digits per cell, write the first four letters of the street name, use military time, use Code 14 for a residential delivery with no signature, and for a signature-required delivery obtain the customer signature and write the customer’s first initial plus full last name.',
  applicability: ['The driver is completing the current station-issued delivery hand sheet'],
  conditions: ['Use the actual delivery information', 'Use the signature branch only when a signature is required'],
  exceptions: [],
  required_procedure: [
    { step: 1, action: 'For Date, enter the day the delivery actually happened.' },
    { step: 2, action: 'For Tracking Number, write four digits per cell.' },
    { step: 3, action: 'For Street, write the first four letters of the street name.' },
    { step: 4, action: 'For Time, use military time; for example, 1:00 p.m. is 13:00.' },
    { step: 5, action: 'Use Code 14 for a residential delivery with no signature.' },
    { step: 6, action: 'If a signature is required, have the customer sign and write the customer’s first initial plus full last name.' }
  ],
  required_documentation: ['Actual delivery date', 'Tracking number in four-digit groups', 'First four street-name letters', 'Military time', 'Applicable Code 14 or signature information'],
  prohibited_actions: ['Do not invent tracking digits.', 'Do not use Code 14 when a signature is required.'],
  escalation_requirements: [],
  clarification_requirements: [],
  related_knowledge_ids: unique((record.related_knowledge_ids || []).filter((id) => id !== 'KNO-DOC-HANDSHEET-001')),
  driver_question_variants: unique([...(record.driver_question_variants || []), 'How do I fill out a hand sheet', 'How do I complete the Blue Sheet', 'What goes in each hand sheet field', 'Scanner is down and I need the hand sheet']),
  concise_ready_route_answer: 'Enter the actual delivery date, tracking number four digits per cell, first four street-name letters, and military time. Use Code 14 for a residential delivery without a signature. If a signature is required, have the customer sign and write their first initial plus full last name.',
  more_info_answer: null,
  evidence: appendEvidence(record.evidence, reportEvidence('Section F — Hand-sheet field mechanics', 'Vlad supplied the exact date, tracking-number, street, time, Code 14, and signature field mechanics and disputed the prior OP-207/OP-207Res identity.')),
  source_date_or_version: `${record.source_date_or_version || ''}; owner-approved field correction 2026-09-03`,
  knowledge_status: 'HUMAN_REVIEW_REQUIRED',
  review_notes: 'Version 2 publishes only the current field mechanics supplied by Vlad and excludes the disputed form-name claims.',
  updated_at: REVIEW_DATE
}));

const crossing = updateExisting('KNO-DEL-NOTATION-001', (record) => ({
  ...record,
  version: Math.max(Number(record.version || 1), 2),
  authoritative_rule: 'Cross an undelivered package in four quadrants: top-left is the status code plus driver name or initials; top-right is the time; bottom-left is the date; bottom-right is the Work Area number. The written status must match the electronic status.',
  required_procedure: [
    { step: 1, action: 'Draw or use the four-quadrant service cross on the package.' },
    { step: 2, action: 'In the top-left, write the status code plus your name or initials.' },
    { step: 3, action: 'In the top-right, write the time.' },
    { step: 4, action: 'In the bottom-left, write the date.' },
    { step: 5, action: 'In the bottom-right, write the Work Area number.' },
    { step: 6, action: 'Confirm the written status code matches the electronic status.' }
  ],
  required_documentation: ['Top-left: status code plus name or initials', 'Top-right: time', 'Bottom-left: date', 'Bottom-right: Work Area number'],
  prohibited_actions: unique([...(record.prohibited_actions || []), 'Do not place the service-cross fields in different quadrants.']),
  driver_question_variants: unique([...(record.driver_question_variants || []), 'How do I do crossing', 'How do I cross a package', 'Where does each item go on the service cross', 'Show me the four quadrants for crossing']),
  concise_ready_route_answer: 'Top-left: status code plus your name or initials. Top-right: time. Bottom-left: date. Bottom-right: Work Area number. Make sure the code matches the electronic status.',
  more_info_answer: 'This is the physical service-cross layout for an undelivered package.',
  evidence: appendEvidence(record.evidence, reportEvidence('Section G — Crossing mechanics', 'Vlad supplied the exact four-quadrant service-cross placement.')),
  source_date_or_version: `${record.source_date_or_version || ''}; owner-approved field mechanics 2026-09-03`,
  knowledge_status: 'HUMAN_REVIEW_REQUIRED',
  review_notes: 'Version 2 retains the source-backed matching-status requirement and adds the owner-approved quadrant placement.',
  updated_at: REVIEW_DATE
}));

const disputedHandSheet = updateExisting('KNO-DOC-HANDSHEET-001', (record) => ({
  ...record,
  version: Math.max(Number(record.version || 1), 2),
  knowledge_status: 'POTENTIALLY_OUTDATED',
  superseded_by: unique([...(record.superseded_by || []), handSheetGeneral.knowledge_id]),
  evidence: appendEvidence(record.evidence, reportEvidence('Section F — Disputed OP-207/OP-207Res identity', 'Vlad did not recognize the form identifiers and supplied different current field mechanics; the prior driver-facing determination is reopened.')),
  review_notes: 'Reopened on 2026-09-03. Preserve the OP-117 source history, but do not publish the OP-207/OP-207Res identity until the documentary and current field evidence are reconciled.',
  updated_at: REVIEW_DATE
}));

const disputedManualBarcode = updateExisting('KNO-FORGE-MANUAL-BARCODE-001', (record) => ({
  ...record,
  version: Math.max(Number(record.version || 1), 2),
  knowledge_status: 'POTENTIALLY_OUTDATED',
  evidence: appendEvidence(record.evidence, reportEvidence('Section H — Key Enter Tracking discrepancy', 'Vlad reported a different current FORGE path and explicitly requested current-screen verification before either path is published.')),
  review_notes: 'Withheld on 2026-09-03 because the preserved FORGE guide and current field report disagree. Reverify the current FORGE screen before republishing either path.',
  updated_at: REVIEW_DATE
}));

const oldWeather = updateExisting('KNO-WEATHER-QUESTIONABLE-001', (record) => ({
  ...record,
  version: Math.max(Number(record.version || 1), 2),
  knowledge_status: 'POTENTIALLY_OUTDATED',
  superseded_by: unique([...(record.superseded_by || []), unsafeAccess.knowledge_id]),
  evidence: appendEvidence(record.evidence, reportEvidence('Section D.1 — Unsafe weather and road access', 'Vlad’s new Code 001 determination supersedes the earlier instruction to wait for code approval.')),
  review_notes: 'Superseded for unsafe route access by the 2026-09-03 owner-approved Code 001 procedure. Preserved for history only.',
  updated_at: REVIEW_DATE
}));

writeJsonLines(RECORDS_PATH, records);

const finalById = new Map(records.map((record) => [record.knowledge_id, record]));
const adjudications = JSON.parse(fs.readFileSync(ADJUDICATIONS_PATH, 'utf8'));
for (const item of adjudications) {
  if (item.knowledge_id === disputedHandSheet.knowledge_id && item.status === 'APPROVED') {
    item.status = 'REOPENED';
    item.reasoning = `${item.reasoning} Reopened 2026-09-03 because Vlad's current field verification disputes the driver-facing form identity.`;
    item.conflicting_or_superseded_source_ids = unique([...(item.conflicting_or_superseded_source_ids || []), REPORT_SOURCE]);
  }
  if ([handSheetGeneral.knowledge_id, oldWeather.knowledge_id].includes(item.knowledge_id) && item.status === 'APPROVED') {
    item.status = 'SUPERSEDED';
    item.reasoning = `${item.reasoning} Superseded by the 2026-09-03 post-update determination.`;
    item.conflicting_or_superseded_source_ids = unique([...(item.conflicting_or_superseded_source_ids || []), REPORT_SOURCE]);
  }
}

const approvedRecords = [unsafeAccess, groundCloudRoute, routeCompletion, nonHazardousLeak, sameAddressLeak, hazardousLeak, handSheetGeneral, crossing];
for (const record of approvedRecords) {
  const previousRecord = originalById.get(record.knowledge_id);
  const previousInterpretation = record.knowledge_id === hazardousLeak.knowledge_id
    ? 'Prior version 1 told the driver not to handle or deliver the package, not to continue the route, to contact the local FedEx station representative, and to wait for the cleanup response.'
    : previousRecord
      ? `Prior version ${previousRecord.version}: ${previousRecord.authoritative_rule}`
      : 'No active Ready Route record previously covered this exact scenario.';
  const approved = approval(record, [previousInterpretation]);
  if (record.knowledge_id === hazardousLeak.knowledge_id) {
    approved.conflicting_or_superseded_source_ids = ['SRC-V2-OP117-20251215'];
  }
  upsert(adjudications, 'adjudication_id', approved);
}
fs.writeFileSync(ADJUDICATIONS_PATH, `${JSON.stringify(adjudications, null, 2)}\n`);

let evaluations = readJsonLines(CASES_PATH);
const movedToOutOfCorpus = [];
evaluations = evaluations.filter((item) => {
  const expected = item.expected_knowledge_ids || [];
  if (expected.includes(disputedManualBarcode.knowledge_id)) {
    movedToOutOfCorpus.push(item);
    return false;
  }
  if (expected.includes(disputedHandSheet.knowledge_id) && /\bop[- ]?207(?:res)?\b/i.test([item.utterance, ...(item.semantic_variations || [])].join(' '))) {
    movedToOutOfCorpus.push(item);
    return false;
  }
  return true;
});

for (const item of evaluations) {
  const expected = item.expected_knowledge_ids || [];
  if (expected.includes(disputedHandSheet.knowledge_id)) {
    item.expected_knowledge_ids = [handSheetGeneral.knowledge_id];
    item.information_sufficiency = 'SUFFICIENT';
    item.response_mode = 'DIRECT_SOURCE_GROUNDED_ANSWER';
    item.must_clarify = [];
    item.must_not_do = unique([...(item.must_not_do || []).filter((value) => !/blue sheet|op-207|hal contingency/i.test(value)), 'cite OP-207 or OP-207Res while the form identity is disputed']);
    delete item.answer_override;
  }
  if (expected.includes(oldWeather.knowledge_id)) {
    item.expected_knowledge_ids = [unsafeAccess.knowledge_id];
    item.must_clarify = [];
    item.must_not_do = ['tell the driver to enter the unsafe condition', 'omit the specific-reason comment'];
    item.information_sufficiency = 'SUFFICIENT';
    item.response_mode = 'DIRECT_SOURCE_GROUNDED_ANSWER';
    delete item.answer_override;
  }
  if (expected.includes(hazardousLeak.knowledge_id)) {
    item.answer_override = {
      direct_answer: 'Park in a safe place and call your BC.',
      steps: ['Park in a safe place.', 'Call your BC.'],
      watch_for: 'Do not substitute the non-hazardous Code 010 branch for a hazardous leak.'
    };
    item.must_not_do = unique([
      ...(item.must_not_do || []).filter((value) => !/station representative|cleanup response|continue the route|handle or deliver/i.test(value)),
      'use the non-hazardous Code 010 branch'
    ]);
  }
  if (item.case_id === 'B13-027') {
    item.answer_override = {
      direct_answer: 'Cross the delivered hazmat package off the manifest so it accurately shows what remains aboard.',
      steps: ['Keep the remaining required paperwork accessible.'],
      watch_for: 'Use the documented paperwork contingency if the manifest is unavailable or a package transfers.'
    };
  }
}

for (const item of [
  {
    case_id: 'POST-UPDATE-UNSAFE-ACCESS-001', utterance: 'This wooden bridge feels unsecured and I cannot safely drive across it. What do I do?',
    semantic_variations: ['Road is washed out and I cannot safely reach the house', 'No safe place to turn the truck around at this delivery', 'Low clearance blocks safe access to the stop'],
    expected_knowledge_ids: [unsafeAccess.knowledge_id], must_clarify: [], must_not_do: ['tell the driver to continue', 'omit the explanatory comment'],
    case_type: 'POST_UPDATE_OWNER_APPROVED', information_sufficiency: 'SUFFICIENT', response_mode: 'DIRECT_SOURCE_GROUNDED_ANSWER'
  },
  {
    case_id: 'POST-UPDATE-GROUNDCLOUD-ROUTE-001', utterance: 'GroundCloud is showing a different route than I expected. What do I do?',
    semantic_variations: ['GroundCloud has the wrong route', 'The route in GroundCloud is not my expected route'],
    expected_knowledge_ids: [groundCloudRoute.knowledge_id], must_clarify: [], must_not_do: ['guess which route to follow'],
    case_type: 'POST_UPDATE_OWNER_APPROVED', information_sufficiency: 'SUFFICIENT', response_mode: 'DIRECT_SOURCE_GROUNDED_ANSWER'
  },
  {
    case_id: 'POST-UPDATE-WHOLE-ROUTE-001', utterance: 'I do not think I can finish my whole route today. What should I do?',
    semantic_variations: ['I cannot complete my entire route', 'There is no way I will finish all my stops today'],
    expected_knowledge_ids: [routeCompletion.knowledge_id], must_clarify: [], must_not_do: ['ask for hours-of-service start time', 'route to one pickup window'],
    case_type: 'POST_UPDATE_OWNER_APPROVED', information_sufficiency: 'SUFFICIENT', response_mode: 'DIRECT_SOURCE_GROUNDED_ANSWER'
  },
  {
    case_id: 'POST-UPDATE-LEAK-SAME-ADDRESS-001', utterance: 'One package is leaking but the other packages for this address look fine. Can I deliver the good ones?',
    semantic_variations: ['One box leaks but the other boxes at this stop are okay', 'Can I deliver unaffected packages when one package is leaking'],
    expected_knowledge_ids: [sameAddressLeak.knowledge_id], must_clarify: [], must_not_do: ['return unaffected packages', 'use the non-hazardous branch for a hazardous leak'],
    case_type: 'POST_UPDATE_OWNER_APPROVED', information_sufficiency: 'SUFFICIENT', response_mode: 'DIRECT_SOURCE_GROUNDED_ANSWER'
  },
  {
    case_id: 'POST-UPDATE-HAZ-LEAK-001', utterance: 'This leaking package is hazardous. What do I do?',
    semantic_variations: ['Hazmat box is leaking in the van', 'A dangerous goods package is leaking'],
    expected_knowledge_ids: [hazardousLeak.knowledge_id], must_clarify: [], must_not_do: ['send the driver to a generic station representative', 'use Code 010'],
    case_type: 'POST_UPDATE_OWNER_APPROVED', information_sufficiency: 'SUFFICIENT', response_mode: 'DIRECT_SOURCE_GROUNDED_ANSWER'
  },
  {
    case_id: 'POST-UPDATE-NONHAZ-LEAK-001', utterance: 'This leaking package is not hazardous. What do I do?',
    semantic_variations: ['Non hazmat box is leaking', 'The leaking package is confirmed non-hazardous'],
    expected_knowledge_ids: [nonHazardousLeak.knowledge_id], must_clarify: [], must_not_do: ['use the hazardous branch', 'deliver the leaking package'],
    case_type: 'POST_UPDATE_OWNER_APPROVED', information_sufficiency: 'SUFFICIENT', response_mode: 'DIRECT_SOURCE_GROUNDED_ANSWER'
  },
  {
    case_id: 'POST-UPDATE-HANDSHEET-001', utterance: 'How do I fill out a hand sheet?',
    semantic_variations: ['How do I complete the Blue Sheet', 'What goes in each hand sheet field'],
    expected_knowledge_ids: [handSheetGeneral.knowledge_id], must_clarify: [], must_not_do: ['cite OP-207 or OP-207Res', 'invent tracking digits'],
    case_type: 'POST_UPDATE_OWNER_APPROVED', information_sufficiency: 'SUFFICIENT', response_mode: 'DIRECT_SOURCE_GROUNDED_ANSWER'
  },
  {
    case_id: 'POST-UPDATE-CROSSING-001', utterance: 'How do I do crossing on a package?',
    semantic_variations: ['How do I cross an undelivered box', 'Where does each field go on the service cross'],
    expected_knowledge_ids: [crossing.knowledge_id], must_clarify: [], must_not_do: ['give only a definition', 'omit quadrant placement'],
    case_type: 'POST_UPDATE_OWNER_APPROVED', information_sufficiency: 'SUFFICIENT', response_mode: 'DIRECT_SOURCE_GROUNDED_ANSWER'
  }
]) upsert(evaluations, 'case_id', item);
writeJsonLines(CASES_PATH, evaluations);

let conversations = readJsonLines(CONVERSATIONS_PATH);
conversations = conversations.filter((item) => item.scenario_id !== 'CONV-GOLD-MANUAL-BARCODE-001');
writeJsonLines(CONVERSATIONS_PATH, conversations);

const outOfCorpus = readJsonLines(OUT_OF_CORPUS_PATH);
for (const item of movedToOutOfCorpus) {
  const utterances = [item.utterance, ...(item.semantic_variations || [])];
  utterances.forEach((utterance, index) => upsert(outOfCorpus, 'case_id', {
    case_id: `OOC-POST-UPDATE-DISPUTED-${item.case_id}-${index + 1}`,
    utterance,
    expected_mode: 'ESCALATE'
  }));
}
for (const item of [
  { case_id: 'OOC-POST-UPDATE-KEY-ENTER-001', utterance: 'How do I use Key Enter Tracking for a visible barcode?', expected_mode: 'ESCALATE' },
  { case_id: 'OOC-POST-UPDATE-KEY-ENTER-002', utterance: 'The scanner will not read the long tracking number. How do I key it in?', expected_mode: 'ESCALATE' },
  { case_id: 'OOC-POST-UPDATE-UNKNOWN-001', utterance: 'My delivery problem is not covered here. What should I do?', expected_mode: 'ESCALATE' }
]) upsert(outOfCorpus, 'case_id', item);
writeJsonLines(OUT_OF_CORPUS_PATH, outOfCorpus);

const inventory = readCsvObjects(INVENTORY_PATH);
for (const item of [
  {
    source_id: REPORT_SOURCE, source_system: 'Ready Route v2 intake', parent_source_id: '', title: 'ReadyRoute Post-Update Verification & New Findings Report',
    source_type: 'MARKDOWN', mime_type: 'text/markdown', url_or_path: 'docs/ReadyRoute_Post_Update_Verification_New_Findings_2026-09-01.md',
    created_at: '2026-09-01', modified_at: REVIEW_DATE, effective_date: REVIEW_DATE, version: 'September 1 report received September 3',
    apparent_subject: 'Post-update RRA verification, current field corrections, and routing gaps', apparent_audience: 'Ready Route product and engineering',
    access_status: 'ACCESSIBLE', review_status: 'INTAKE_REVIEWED', relevance_status: 'HIGH_RELEVANCE', duplicate_of: '', supersedes: '', superseded_by: '',
    cross_references: APPROVAL_SOURCE, local_archive_path: 'docs/ReadyRoute_Post_Update_Verification_New_Findings_2026-09-01.md',
    interpretation_limits: 'Use only the exact supplied procedures. The manual barcode discrepancy remains unapproved pending current-screen verification.',
    review_notes: 'Preserved from the owner-supplied Vlad report.', last_reviewed_at: REVIEW_DATE, metadata_recovery_status: 'OWNER_SUPPLIED',
    metadata_recovery_basis: 'Owner-supplied content in the current workspace session'
  },
  {
    source_id: APPROVAL_SOURCE, source_system: 'Ready Route product-owner decision', parent_source_id: '', title: 'Ready Route owner approval — post-update Vlad findings',
    source_type: 'Policy', mime_type: 'text/markdown', url_or_path: 'docs/ready-route-owner-approval-post-update-findings-2026-09-03.md',
    created_at: REVIEW_DATE, modified_at: REVIEW_DATE, effective_date: REVIEW_DATE, version: 'Standing owner approval applied 2026-09-03',
    apparent_subject: 'Authority for Vlad post-update field procedures', apparent_audience: 'Ready Route knowledge authors',
    access_status: 'ACCESSIBLE', review_status: 'OWNER_APPROVED', relevance_status: 'HIGH_RELEVANCE', duplicate_of: '', supersedes: '', superseded_by: '',
    cross_references: REPORT_SOURCE, local_archive_path: 'docs/ready-route-owner-approval-post-update-findings-2026-09-03.md',
    interpretation_limits: 'Excludes both disputed manual barcode paths and any scope not stated in the preserved report.',
    review_notes: 'Records the owner’s standing instruction to follow Vlad’s field-verified mechanics.', last_reviewed_at: REVIEW_DATE,
    metadata_recovery_status: 'OWNER_DIRECTIVE', metadata_recovery_basis: 'Explicit product-owner direction in the current workspace thread'
  }
]) upsert(inventory.rows, 'source_id', item);
writeCsvObjects(INVENTORY_PATH, inventory.headers, inventory.rows);

const capture = readCsvObjects(CAPTURE_PATH);
for (const record of approvedRecords) {
  const sourceIds = unique((record.evidence || []).map((item) => item.source_id));
  upsert(capture.rows, 'knowledge_id', {
    knowledge_id: record.knowledge_id, knowledge_status: record.knowledge_status,
    evidence_source_ids: sourceIds.join(';'), durable_source_ids: sourceIds.join(';'),
    rendered_full_source_ids: '', rendered_partial_source_ids: '', transient_full_source_ids: '', transient_partial_source_ids: '',
    evidence_capture_class: 'OWNER_APPROVED_DURABLE_MARKDOWN_WITH_PRESERVED_PRIOR_EVIDENCE',
    production_capture_gate: 'CAPTURE_COMPLETE_OWNER_VERIFICATION', authenticated_queue_resource_ids: '',
    required_follow_up: 'Reopen if Phillip, Vlad, current application behavior, or later applicable operational, company-policy, safety, or regulatory guidance changes the approved answer.'
  });
}
for (const record of [disputedHandSheet, disputedManualBarcode, oldWeather]) {
  const sourceIds = unique((record.evidence || []).map((item) => item.source_id));
  upsert(capture.rows, 'knowledge_id', {
    knowledge_id: record.knowledge_id, knowledge_status: record.knowledge_status,
    evidence_source_ids: sourceIds.join(';'), durable_source_ids: sourceIds.join(';'),
    rendered_full_source_ids: '', rendered_partial_source_ids: '', transient_full_source_ids: '', transient_partial_source_ids: '',
    evidence_capture_class: 'DURABLE_CONFLICT_REVIEW', production_capture_gate: 'CAPTURE_COMPLETE_NONPUBLISHABLE_REVIEW_ITEM',
    authenticated_queue_resource_ids: '', required_follow_up: record.knowledge_id === disputedManualBarcode.knowledge_id
      ? 'Verify the current FORGE screen before republishing either manual-entry path.'
      : 'Reconcile the preserved older determination with the 2026-09-03 owner-authorized field correction.'
  });
}
writeCsvObjects(CAPTURE_PATH, capture.headers, capture.rows);

const changes = readJsonLines(CHANGE_LOG_PATH);
const changedRecords = [...approvedRecords, disputedHandSheet, disputedManualBarcode, oldWeather];
for (const record of changedRecords) {
  const previous = originalById.get(record.knowledge_id) || { knowledge_id: record.knowledge_id, state: 'ABSENT_FROM_ACTIVE_CORPUS' };
  const changeId = `CHG-20260903-POST-UPDATE-${record.knowledge_id.replace(/^KNO-/, '')}`;
  const existing = changes.find((change) => change.change_id === changeId);
  upsert(changes, 'change_id', {
    change_id: changeId, knowledge_id: record.knowledge_id, changed_at: REVIEW_DATE, changed_by: OWNER,
    change_reason: 'Applied the owner-authorized Vlad post-update procedure, correction, supersession, or conflict hold.',
    previous_record: existing?.previous_record || previous, previous_checksum: existing?.previous_checksum || sha256(previous),
    new_record: record, new_checksum: sha256(record)
  });
}
writeJsonLines(CHANGE_LOG_PATH, changes);

console.log(JSON.stringify({
  new_records: 5,
  corrected_records: 3,
  withheld_or_superseded_records: 3,
  active_approvals_added: approvedRecords.length,
  driver_cases: evaluations.length,
  moved_disputed_cases_to_fail_closed: movedToOutOfCorpus.length,
  out_of_corpus_cases: outOfCorpus.length
}, null, 2));
