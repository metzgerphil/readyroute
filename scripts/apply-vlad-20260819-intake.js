#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RECORDS_PATH = path.join(ROOT, 'research/fedex-ground-driver-knowledge/knowledge/records.jsonl');
const CASES_PATH = path.join(ROOT, 'research/fedex-ground-driver-knowledge/validation/driver_language_cases.jsonl');
const REFERENCE_CASES_PATH = path.join(ROOT, 'research/fedex-ground-driver-knowledge/validation/reference_language_cases.jsonl');
const CONVERSATIONS_PATH = path.join(ROOT, 'research/fedex-ground-driver-knowledge/validation/conversation_scenarios.jsonl');
const PRIORITY_PATH = path.join(ROOT, 'research/fedex-ground-driver-knowledge/validation/vlad_priority_51_cases.jsonl');
const ADJUDICATIONS_PATH = path.join(ROOT, 'knowledge/adjudications/records.json');
const DETAIL_REPORT_PATH = path.join(
  ROOT,
  'research/fedex-ground-driver-knowledge/sources/v2-intake-2026-08-19/vlad/ReadyRoute_Consolidated_Report_for_Phillip_1_2.md'
);

const VLAD_SOURCES = [
  'SRC-V2-VLAD-CONSOLIDATED-DETAIL-20260818',
  'SRC-V2-VLAD-RESPONSE-20260819',
  'SRC-V2-OWNER-VLAD-APPROVAL-20260819'
];

function readJsonLines(filePath) {
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function writeJsonLines(filePath, rows) {
  fs.writeFileSync(filePath, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
}

function upsertBy(rows, key, value) {
  const index = rows.findIndex((row) => row[key] === value[key]);
  if (index >= 0) rows[index] = value;
  else rows.push(value);
}

function ownerEvidence(locator, summary) {
  return [{
    source_id: 'SRC-V2-VLAD-CONSOLIDATED-DETAIL-20260818',
    locator,
    evidence_summary: summary,
    reviewed_at: '2026-08-19'
  }, {
    source_id: 'SRC-V2-OWNER-VLAD-APPROVAL-20260819',
    locator: 'Decision and interpretation rules',
    evidence_summary: 'Phillip Metzger approved Vlad-supplied procedures and operational information as verified Ready Route knowledge.',
    reviewed_at: '2026-08-19'
  }];
}

function newRecord({
  knowledge_id,
  canonical_situation,
  normalized_description,
  authoritative_rule,
  applicability,
  conditions = [],
  exceptions = [],
  required_procedure,
  required_documentation = [],
  prohibited_actions = [],
  escalation_requirements = [],
  clarification_requirements = [],
  related_knowledge_ids = [],
  taxonomy_paths,
  driver_question_variants,
  concise_ready_route_answer,
  more_info_answer = null,
  locator,
  evidence_summary
}) {
  return {
    knowledge_id,
    version: 1,
    canonical_situation,
    normalized_description,
    authoritative_rule,
    applicability,
    conditions,
    exceptions,
    required_procedure,
    required_documentation,
    prohibited_actions,
    escalation_requirements,
    clarification_requirements,
    related_knowledge_ids,
    taxonomy_paths,
    driver_question_variants,
    concise_ready_route_answer,
    more_info_answer,
    evidence: ownerEvidence(locator, evidence_summary),
    source_date_or_version: 'Vlad owner-approved intake 2026-08-18 to 2026-08-19',
    knowledge_status: 'HUMAN_REVIEW_REQUIRED',
    review_notes: 'Vlad-supplied procedure approved by Phillip Metzger on 2026-08-19; published through a scoped READY_ROUTE_APPROVED adjudication.',
    created_at: '2026-08-19',
    updated_at: '2026-08-19'
  };
}

function approval({ id, knowledgeId, issue, determination, previous, overrides, supersedes = [] }) {
  return {
    adjudication_id: id,
    knowledge_id: knowledgeId,
    status: 'APPROVED',
    issue_reviewed: issue,
    canonical_determination: determination,
    previous_interpretations: previous,
    supporting_source_ids: VLAD_SOURCES,
    conflicting_or_superseded_source_ids: [],
    reasoning: 'Phillip Metzger explicitly approved Vlad-provided procedures and operational information as accurate Ready Route knowledge without requiring separate documentary corroboration. This adjudication preserves the exact supplied scope and later branch corrections.',
    approved_by: 'Phillip Metzger, Ready Route product owner',
    approval_date: '2026-08-19',
    effective_date: '2026-08-19',
    supersedes,
    reopen_conditions: [
      'Phillip or Vlad revises the supplied procedure.',
      'A later operational, policy, or application change materially conflicts with this procedure.',
      'A later Vlad artifact supplies a more specific branch or corrects the summarized intake.'
    ],
    canonical_overrides: overrides
  };
}

const records = readJsonLines(RECORDS_PATH);

const newRecords = [
  newRecord({
    knowledge_id: 'KNO-DEL-FAD-GROUND-001',
    canonical_situation: 'A FAD Ground delivery cannot be completed',
    normalized_description: 'The driver has a FAD Ground package that cannot be delivered and needs management direction before applying the residential or non-residential return branch.',
    authoritative_rule: 'Call the BC or manager first. If the delivery still cannot be completed, use Code 004 for a non-residential recipient-not-in condition or Code 007 for a residential recipient-not-in condition, complete and leave the door tag, cross the package with the code, date, and work area number, remove the SID sticker, and return the package to the station.',
    applicability: ['FORGE or the package identifies FAD Ground', 'Delivery cannot be completed'],
    conditions: ['The BC or manager is contacted before the package is placed into the return branch'],
    required_procedure: [
      { step: 1, action: 'Call the BC or manager and explain why the FAD Ground delivery cannot be completed.' },
      { step: 2, action: 'If delivery remains unsuccessful, use Code 004 for non-residential or Code 007 for residential.' },
      { step: 3, action: 'Complete, scan, and leave the door tag.' },
      { step: 4, action: 'Cross the package with the matching code, date, and work area number.' },
      { step: 5, action: 'Remove the SID sticker and return the package to the station.' }
    ],
    required_documentation: ['BC or manager contact', 'Code 004 or 007', 'Door tag', 'Package crossing'],
    prohibited_actions: ['Do not choose 004 or 007 without matching the actual stop type.', 'Do not omit the management call before this return branch.'],
    escalation_requirements: ['BC or manager before applying the return branch'],
    clarification_requirements: ['Is the stop residential or non-residential?', 'Has the BC or manager been contacted?'],
    related_knowledge_ids: ['KNO-DEL-BUS-CLOSED-001', 'KNO-DEL-SAFEPLACE-001'],
    taxonomy_paths: ['TAX-DELIVERY', 'TAX-DELIVERY/TAX-RECIPIENT-NOT-IN'],
    driver_question_variants: ['FAD Ground cannot deliver', 'What do I do with an undeliverable FAD package', 'FAD Ground return'],
    concise_ready_route_answer: 'Call your BC or manager first. If the FAD Ground delivery still cannot be completed, use Code 004 for non-residential or 007 for residential, complete the door tag, cross the package with the code, date, and work area, remove the SID, and return it to the station.',
    locator: 'Section D, FAD Ground correction',
    evidence_summary: 'Supplies the call-manager-first branch followed by Code 004/007, door tag, crossing, SID removal, and station return.'
  }),
  newRecord({
    knowledge_id: 'KNO-PUP-SCAN-CLASSIFICATION-001',
    canonical_situation: 'A pickup package will not scan and its service type cannot be identified',
    normalized_description: 'The driver cannot determine whether an unscannable pickup package is Express, Ground, Home Delivery, or SmartPost.',
    authoritative_rule: 'At a station that is not Express-certified, accept only a package positively identified as Ground or Home Delivery. If the service type cannot be determined, do not pick up the package and call the manager.',
    applicability: ['Pickup package does not scan', 'Service classification is uncertain'],
    conditions: ['The station is not Express-certified'],
    exceptions: ['An Express-certified station follows its applicable acceptance process'],
    required_procedure: [
      { step: 1, action: 'Determine whether the station is Express-certified.' },
      { step: 2, action: 'Positively identify the package service before acceptance.' },
      { step: 3, action: 'At a non-Express-certified station, accept only Ground or Home Delivery.' },
      { step: 4, action: 'If the service type remains uncertain, do not pick it up and call the manager.' }
    ],
    prohibited_actions: ['Do not guess the service type.', 'Do not accept an unidentified package at a non-Express-certified station.'],
    escalation_requirements: ['Manager when service type cannot be determined'],
    clarification_requirements: [],
    related_knowledge_ids: ['KNO-PUP-SCANNER-FAIL-001', 'KNO-PUP-NO-BARCODE-001'],
    taxonomy_paths: ['TAX-PICKUP', 'TAX-FORGE/TAX-BARCODE-ENTRY'],
    driver_question_variants: ['Pickup box will not scan and I cannot tell what service it is', 'Is this Express Ground Home or SmartPost', 'Unknown pickup package type'],
    concise_ready_route_answer: 'If your station is not Express-certified, pick up only packages you can positively identify as Ground or Home Delivery. If you cannot determine the type, do not pick it up; call your manager.',
    locator: 'Section E, FAQ-PUP-SCAN-CLASSIFICATION-001',
    evidence_summary: 'Supplies the non-Express-certified acceptance limit and no-pickup management branch when classification is uncertain.'
  }),
  newRecord({
    knowledge_id: 'KNO-PUP-EARLY-REQUEST-001',
    canonical_situation: 'A customer asks the driver to perform a pickup before the listed ready time',
    normalized_description: 'The customer says the pickup can happen early, but the pickup hours have not yet been changed through the approved process.',
    authoritative_rule: 'Contact CXPC. CXPC confirms the request directly with the customer and adjusts the pickup hours. Perform the pickup early only after CXPC confirms and changes the hours.',
    applicability: ['Customer requests pickup before the listed ready time'],
    conditions: ['CXPC confirms with the customer', 'CXPC adjusts the pickup hours'],
    required_procedure: [
      { step: 1, action: 'Contact CXPC with the early-pickup request.' },
      { step: 2, action: 'Wait for CXPC to confirm directly with the customer and adjust the pickup hours.' },
      { step: 3, action: 'Perform the pickup early only after both confirmation and the hours adjustment.' }
    ],
    prohibited_actions: ['Do not perform the pickup early based only on the customer statement to the driver.'],
    escalation_requirements: ['CXPC for confirmation and pickup-hours adjustment'],
    related_knowledge_ids: ['KNO-PUP-WINDOW-RISK-001'],
    taxonomy_paths: ['TAX-PICKUP', 'TAX-PICKUP/TAX-WINDOW'],
    driver_question_variants: ['Customer says I can pick up early', 'Can I do this pickup before ready time', 'Customer wants early pickup'],
    concise_ready_route_answer: 'Call CXPC. Pick it up early only after CXPC confirms with the customer and adjusts the pickup hours.',
    locator: 'Section E, FAQ-PUP-EARLY-REQUEST-001',
    evidence_summary: 'Supplies the CXPC confirmation and hours-adjustment requirements for an early pickup.'
  }),
  newRecord({
    knowledge_id: 'KNO-DEL-SIGNED-NOTE-001',
    canonical_situation: 'A customer leaves a handwritten signed note asking the driver to release a package',
    normalized_description: 'A handwritten customer note requests unattended release but is not an approved FedEx release document.',
    authoritative_rule: 'A handwritten signed note does not authorize package release. Only an official approved FedEx document or release path counts. A handwritten note never satisfies ASR or DSR.',
    applicability: ['Customer left a handwritten or informal signed note requesting release'],
    conditions: ['The note is not an official approved FedEx release document'],
    required_procedure: [
      { step: 1, action: 'Identify the package signature or release requirement.' },
      { step: 2, action: 'Disregard the handwritten note as release authorization.' },
      { step: 3, action: 'Use only the official approved FedEx document or release path applicable to the package.' },
      { step: 4, action: 'If no approved path is available, complete the applicable unsuccessful-attempt procedure.' }
    ],
    prohibited_actions: ['Do not use a handwritten note to release ASR or DSR.', 'Do not treat an informal signature as an approved FedEx authorization.'],
    clarification_requirements: [],
    related_knowledge_ids: ['KNO-DEL-SIG-ISR-001', 'KNO-DEL-SIG-DSR-001', 'KNO-DEL-SIG-ASR-001', 'KNO-DEL-SRA-001'],
    taxonomy_paths: ['TAX-DELIVERY', 'TAX-DELIVERY/TAX-SIGNATURE'],
    driver_question_variants: ['Customer left a signed note can I leave it', 'Handwritten release note', 'Does a customer note count for signature'],
    concise_ready_route_answer: 'No. A handwritten signed note does not authorize release. Use only an approved FedEx document or release path, and never use a handwritten note for ASR or DSR.',
    locator: 'Section E, FAQ-DEL-SIGNED-NOTE-001',
    evidence_summary: 'Supplies the official-document-only rule and explicitly excludes handwritten notes for ASR and DSR.'
  }),
  newRecord({
    knowledge_id: 'KNO-DEL-PERISHABLE-001',
    canonical_situation: 'A residential perishable delivery cannot be completed because nobody answers',
    normalized_description: 'A perishable package may spoil, but no recipient answers and no authorized delivery path is available.',
    authoritative_rule: 'Contact CXPC first because it may have another customer contact number. If CXPC cannot establish a delivery path, use Code 007, complete and leave the door tag, cross the package with the code, date, and work area number, remove the SID sticker, and return the package to the station.',
    applicability: ['Residential perishable delivery', 'Nobody answers', 'No authorized release path is available'],
    conditions: ['CXPC callback attempt occurs before the return branch'],
    required_procedure: [
      { step: 1, action: 'Contact CXPC and ask whether another customer contact number is available.' },
      { step: 2, action: 'If delivery still cannot be completed, apply Code 007.' },
      { step: 3, action: 'Complete, scan, and leave the door tag.' },
      { step: 4, action: 'Cross the package with Code 007, the date, and the work area number.' },
      { step: 5, action: 'Remove the SID sticker and return the package to the station.' }
    ],
    required_documentation: ['CXPC contact attempt', 'Code 007', 'Door tag', 'Package crossing'],
    prohibited_actions: ['Do not leave the package through an unauthorized release merely because it is perishable.'],
    escalation_requirements: ['CXPC before the unsuccessful-delivery return branch'],
    related_knowledge_ids: ['KNO-DEL-SAFEPLACE-001'],
    taxonomy_paths: ['TAX-DELIVERY', 'TAX-DELIVERY/TAX-RECIPIENT-NOT-IN'],
    driver_question_variants: ['Perishable package nobody answers', 'This food box will spoil and nobody is home', 'Can I leave a perishable without authorization'],
    concise_ready_route_answer: 'Call CXPC first for another customer contact. If delivery still cannot be completed, use Code 007, complete the door tag, cross the package with the code, date, and work area, remove the SID, and return it to the station.',
    locator: 'Section E, FAQ-DEL-PERISHABLE-001',
    evidence_summary: 'Supplies CXPC-first handling and the complete Code 007 station-return treatment for a residential perishable.'
  }),
  newRecord({
    knowledge_id: 'KNO-DOC-HANDSHEET-GENERAL-001',
    canonical_situation: 'FORGE or the scanner is completely unavailable for a non-HAL delivery',
    normalized_description: 'The driver must use the station-issued general delivery hand sheet because electronic delivery documentation is unavailable.',
    authoritative_rule: 'Use the current station-issued hand sheet. Identify the tracking number from the applicable 96, EPIC, LMO, or Ground Economy barcode, record the tracking number in the required format, use military time and the four-letter street abbreviation, circle the correct status code, obtain the CSA number from the manager, include the FedEx ID, and turn in the completed sheet at check-in or check-out.',
    applicability: ['Non-HAL delivery', 'FORGE or the scanning device is completely inoperable'],
    conditions: ['Use the current station-issued form and manager-supplied CSA number'],
    exceptions: ['HAL outage uses the separate OP-207/OP-207Res record'],
    required_procedure: [
      { step: 1, action: 'Obtain the current station-issued hand sheet and the CSA number from the manager.' },
      { step: 2, action: 'Identify the tracking number from the applicable 96, EPIC, LMO, or Ground Economy barcode and record it in the required format.' },
      { step: 3, action: 'Record the delivery time in military time and use the required four-letter street abbreviation.' },
      { step: 4, action: 'Circle the truthful delivery or status code.' },
      { step: 5, action: 'Include the CSA number and FedEx ID.' },
      { step: 6, action: 'Turn in the completed sheet at check-in or check-out.' }
    ],
    required_documentation: ['Current station-issued hand sheet', 'Tracking number', 'Military time', 'Street abbreviation', 'Status code', 'CSA number', 'FedEx ID'],
    prohibited_actions: ['Do not invent tracking digits or a status code.', 'Do not use this general record as a substitute for the separate HAL outage form procedure.'],
    escalation_requirements: ['Manager for the current form and CSA number'],
    clarification_requirements: ['Is this a HAL package?', 'Which supported barcode type identifies the tracking number?'],
    related_knowledge_ids: ['KNO-DOC-HANDSHEET-001', 'KNO-FORGE-MANUAL-BARCODE-001'],
    taxonomy_paths: ['TAX-DOCUMENTATION', 'TAX-FORGE'],
    driver_question_variants: ['Scanner died how do I fill out the hand sheet', 'General delivery hand sheet instructions', 'Non HAL blue sheet'],
    concise_ready_route_answer: 'Use the current station-issued hand sheet. Record the supported tracking number, military time, four-letter street abbreviation, truthful circled status code, manager-provided CSA number, and FedEx ID, then turn it in at check-in or check-out.',
    locator: 'Section E, FAQ-DOC-HANDSHEET-GENERAL-001',
    evidence_summary: 'Supplies the general non-HAL hand-sheet fields and station handoff procedure.'
  }),
  newRecord({
    knowledge_id: 'KNO-DEL-SIGNATURE-WAIT-001',
    canonical_situation: 'A recipient needs time to answer and provide a required delivery signature',
    normalized_description: 'The driver is at the delivery location waiting for an eligible signer to respond.',
    authoritative_rule: 'Allow two to five minutes for the recipient to answer and provide the required signature. If an eligible signer does not become available, use the applicable signature-service unsuccessful-attempt procedure.',
    applicability: ['A delivery requires an in-person signature', 'The driver is waiting at the delivery location for an eligible signer'],
    required_procedure: [
      { step: 1, action: 'Allow two to five minutes for an eligible signer to answer and sign.' },
      { step: 2, action: 'If no eligible signer becomes available, follow the unsuccessful-attempt branch for the actual signature service and stop type.' }
    ],
    prohibited_actions: ['Do not release the package without satisfying its signature requirement.'],
    clarification_requirements: [],
    related_knowledge_ids: ['KNO-DEL-SIG-ISR-001', 'KNO-DEL-SIG-DSR-001', 'KNO-DEL-SIG-ASR-001'],
    taxonomy_paths: ['TAX-DELIVERY', 'TAX-DELIVERY/TAX-SIGNATURE'],
    driver_question_variants: ['How long should I wait for a signature', 'Nobody is coming to sign how long do I wait', 'Wait time for signer'],
    concise_ready_route_answer: 'Wait two to five minutes for an eligible signer. If nobody eligible becomes available, use the unsuccessful-attempt procedure for the actual signature service and stop type.',
    locator: 'Section E, still-open items, wait time to sign',
    evidence_summary: 'Vlad supplied a two-to-five-minute signature wait time; Phillip approved Vlad-supplied operational information.'
  }),
  newRecord({
    knowledge_id: 'KNO-WEATHER-QUESTIONABLE-001',
    canonical_situation: 'Weather conditions appear unsafe and the driver is considering a weather exception',
    normalized_description: 'The driver believes weather may make continued travel or an attempt unsafe but has not confirmed that a weather code is approved.',
    authoritative_rule: 'Explain the unsafe driving conditions to the BC or manager and confirm that the applicable weather code is approved before using it. Do not compromise safety while waiting for direction.',
    applicability: ['Weather conditions appear unsafe', 'A weather delivery or pickup exception is being considered'],
    conditions: ['BC or manager confirms the applicable weather code is approved'],
    required_procedure: [
      { step: 1, action: 'Move to or remain in a safe condition; do not compromise safety.' },
      { step: 2, action: 'Call the BC or manager and explain the specific unsafe driving conditions.' },
      { step: 3, action: 'Use a weather code only after the applicable code is confirmed as approved.' }
    ],
    prohibited_actions: ['Do not use an unapproved weather code.', 'Do not continue unsafe driving merely to meet service timing.'],
    escalation_requirements: ['BC or manager for weather-code approval'],
    related_knowledge_ids: ['KNO-PUP-WINDOW-RISK-001'],
    taxonomy_paths: ['TAX-SAFETY', 'TAX-DELIVERY'],
    driver_question_variants: ['Weather looks unsafe what do I do', 'Can I use the weather code', 'Road conditions are dangerous'],
    concise_ready_route_answer: 'Do not compromise safety. Call your BC or manager, explain the unsafe conditions, and use the applicable weather code only after they confirm it is approved.',
    locator: 'Section E, still-open items, weather-looks-questionable procedure',
    evidence_summary: 'Vlad supplied the management-confirmation and unsafe-driving explanation procedure; Phillip approved Vlad-supplied operational information.'
  }),
  newRecord({
    knowledge_id: 'KNO-FORGE-PREDISPATCH-PHYSICAL-HANDOFF-001',
    canonical_situation: 'A wrong-work-area package can be physically handed off before dispatch',
    normalized_description: 'Before dispatch, the driver knows the correct work area and is considering a physical handoff instead of the core FORGE Bulk Transfer flow.',
    authoritative_rule: 'Before dispatch, if the correct work area is known and a driver from that work area is available, hand the package directly to that driver and ensure a package handler scans it to the correct work area. If the correct work area is not nearby, give the package to QA or the BC.',
    applicability: ['Before dispatch', 'Package is assigned to the wrong work area', 'Correct work area is known'],
    conditions: ['A package-handler scan corrects the work-area assignment when handed to the correct driver'],
    exceptions: ['After dispatch uses the separate Code 012 procedure', 'FORGE Bulk Transfer remains a separate approved correction path'],
    required_procedure: [
      { step: 1, action: 'Confirm this is before dispatch and identify the correct work area.' },
      { step: 2, action: 'If a driver from that work area is available, hand the package directly to that driver.' },
      { step: 3, action: 'Ensure a package handler scans the package to the correct work area.' },
      { step: 4, action: 'If the work area is not nearby, give the package to QA or the BC.' }
    ],
    prohibited_actions: ['Do not use this predispatch handoff after dispatch.', 'Do not treat physical handoff alone as the required work-area scan.'],
    clarification_requirements: ['Has dispatch occurred?', 'Is the correct work area known and nearby?'],
    related_knowledge_ids: ['KNO-FORGE-MANIFEST-PREVIEW-001', 'KNO-FORGE-BULK-TRANSFER-001', 'KNO-DEL-MISLOAD-AFTERDISPATCH-001'],
    taxonomy_paths: ['TAX-FORGE', 'TAX-FORGE/TAX-MANIFEST'],
    driver_question_variants: ['Can I hand this misload to the correct driver before dispatch', 'Wrong work area package physical handoff', 'Correct route driver is nearby'],
    concise_ready_route_answer: 'Before dispatch, if the correct-work-area driver is available, hand over the package and make sure a package handler scans it to that work area. If that work area is not nearby, give it to QA or your BC.',
    locator: 'Section C-DETAIL, Question 5 notes; Response Issue 7',
    evidence_summary: 'Supplies a separate predispatch physical-handoff/QA/BC alternative and keeps it distinct from core Bulk Transfer.'
  })
];

for (const record of newRecords) upsertBy(records, 'knowledge_id', record);
writeJsonLines(RECORDS_PATH, records);

const adjudications = JSON.parse(fs.readFileSync(ADJUDICATIONS_PATH, 'utf8'));
const oldNoBarcode = adjudications.find((item) => item.adjudication_id === 'ADJ-20260815-OWNER-PICKUP-NO-BARCODE-001');
if (oldNoBarcode) oldNoBarcode.status = 'SUPERSEDED';

const approvals = [
  approval({
    id: 'ADJ-20260819-VLAD-BUS-CLOSED-001', knowledgeId: 'KNO-DEL-BUS-CLOSED-001',
    issue: 'The complete disposition for a closed non-residential delivery, including station return treatment.',
    determination: 'Use Code 011 for the applicable weekend closure or Code 004 for another closed non-residential recipient-not-in condition, complete the door tag, cross and remove the SID, and return the package to the station.',
    previous: ['The v2 source-backed record included Code 004/011, the door tag, and package notation but withheld SID removal and final station return.'],
    overrides: {
      authoritative_rule: 'When a non-residential recipient is unavailable and no authorized release path exists, use Code 011 for the applicable weekend closure or Code 004 for another recipient-not-in condition. Complete, scan, and leave the door tag, cross the package with the matching code, date, and work area number, remove the SID sticker, and return the package to the station.',
      required_procedure: [
        { step: 1, action: 'Confirm the stop is non-residential and no authorized release path is available.' },
        { step: 2, action: 'Use Code 011 for the applicable weekend closure; otherwise use Code 004.' },
        { step: 3, action: 'Complete, scan, and leave the door tag at the main entrance.' },
        { step: 4, action: 'Cross the package with the matching code, date, and work area number.' },
        { step: 5, action: 'Remove the SID sticker and return the package to the station.' }
      ],
      required_documentation: ['Code 004 or 011', 'Scanned door tag', 'Package crossing'],
      prohibited_actions: ['Do not use Code 004 for a residential stop.', 'Do not leave the package without an authorized release path.'],
      concise_driver_answer: 'If no authorized release applies, use Code 011 for the applicable weekend closure or Code 004 for another closed-business condition. Complete the door tag, cross the package with the code, date, and work area, remove the SID, and return it to the station.'
    }
  }),
  approval({
    id: 'ADJ-20260819-VLAD-DAMAGE-RETURN-001', knowledgeId: 'KNO-DEL-DAMAGE-INSPECTION-001',
    issue: 'The complete station-return treatment for an ordinary possible-damage inspection.',
    determination: 'After ruling out a leaking or hazmat emergency, use Code 010, cross the package, remove the SID, and return it for inspection.',
    previous: ['The source-backed record included Code 010, crossing, and station return but withheld SID removal.'],
    overrides: {
      authoritative_rule: 'For an ordinary possibly damaged package being returned for inspection, first rule out a leaking or hazardous-material emergency. Apply Code 010, cross the package with the code, date, and work area number, remove the SID sticker, and return it to the station for inspection.',
      required_procedure: [
        { step: 1, action: 'Determine whether the package is leaking or hazardous; if so, use the separate safety process.' },
        { step: 2, action: 'Apply Code 010.' },
        { step: 3, action: 'Cross the package with Code 010, the date, and the work area number.' },
        { step: 4, action: 'Remove the SID sticker.' },
        { step: 5, action: 'Return the package to the station for inspection.' }
      ],
      prohibited_actions: ['Do not handle a leaking or hazardous package as an ordinary Code 010 return.'],
      concise_driver_answer: 'If it is not leaking or hazardous, use Code 010, cross it with the code, date, and work area, remove the SID, and return it to the station for inspection.'
    }
  }),
  approval({
    id: 'ADJ-20260819-VLAD-CODE001-RETURN-001', knowledgeId: 'KNO-DEL-SECURITY-NODELIVERY-001',
    issue: 'Code 001 handling when security measures or a closed road prevent delivery.',
    determination: 'Use Code 001 when the condition prevents delivery, record the actual reason, cross and remove the SID, and return the package.',
    previous: ['The source-backed record applied Code 001 only to customer security measures and did not include complete crossing or SID treatment.', 'Road closure returned Answer Unavailable before Vlad supplied the approved branch.'],
    overrides: {
      authoritative_rule: 'When customer security measures or a closed road prevent delivery, use Code 001 and add a note stating the actual reason. Cross the package with Code 001, the date, and work area number, remove the SID sticker, and return it to the station. Do not use Code 001 for a delay that still permits delivery.',
      applicability: ['Customer security measures prevent delivery', 'A closed road prevents access and delivery'],
      required_procedure: [
        { step: 1, action: 'Confirm the condition prevents delivery rather than merely delaying access.' },
        { step: 2, action: 'Apply Code 001 and add a note describing the actual reason.' },
        { step: 3, action: 'Cross the package with Code 001, the date, and work area number.' },
        { step: 4, action: 'Remove the SID sticker and return the package to the station.' }
      ],
      required_documentation: ['Code 001', 'Scanner note with the actual reason', 'Package crossing'],
      prohibited_actions: ['Do not use Code 001 for an allowed entry delay that does not prevent delivery.'],
      concise_driver_answer: 'Use Code 001 when security or a closed road prevents delivery. Add a note with the actual reason, cross the package with the code, date, and work area, remove the SID, and return it to the station.'
    }
  }),
  approval({
    id: 'ADJ-20260819-VLAD-ASR-DISPOSITION-001', knowledgeId: 'KNO-DEL-SIG-ASR-001',
    issue: 'Separate ASR ID-refusal station return from the no-eligible-signer reattempt branch.',
    determination: 'ID refusal uses Code 006, crossing, SID removal, and station return. No eligible signer uses Code 007 residential or Code 004 non-residential, door-tag attempt documentation, and retention for reattempt without crossing or SID removal.',
    previous: ['The ASR record did not explicitly separate package treatment for the ID-refusal and no-eligible-signer branches.', 'The report initially described ASR as one disposition before Vlad corrected the split.'],
    overrides: {
      authoritative_rule: 'ASR requires an in-person signature at the labeled address from a person age 21 or older with valid government ID. If ID is refused, use Code 006, complete the delivery notation, cross the package with the code, date, and work area number, remove the SID sticker, and return it to the station. If no eligible signer is available, use Code 007 residential or Code 004 non-residential, complete the door tag and attempt photo, and retain the package for reattempt without crossing it or removing the SID. The door-tag requirement for the Code 006 ID-refusal branch remains unresolved.',
      required_procedure: [
        { step: 1, action: 'Require valid government ID from a signer age 21 or older at the labeled address and attempt the ID scan.' },
        { step: 2, action: 'If valid ID is presented but cannot be scanned after the attempt, use the permitted manual DOB and visual-verification path.' },
        { step: 3, action: 'If ID is refused, use Code 006, complete the notation, cross the package, remove the SID, and return it to the station.' },
        { step: 4, action: 'If no eligible signer is available, use Code 007 residential or Code 004 non-residential, complete the door tag and attempt photo, and retain the package for reattempt.' },
        { step: 5, action: 'Do not cross or remove the SID for the retain-for-reattempt branch.' }
      ],
      required_documentation: ['ID verification and signature when delivered', 'Code 006, notation, and package crossing when ID is refused', 'Code 007 or 004, scanned door tag, and attempt photo when no signer is available'],
      prohibited_actions: ['Do not driver release or indirectly deliver ASR.', 'Do not cross or remove the SID on the retain-for-reattempt branch.', 'Do not claim a door tag is confirmed for the Code 006 ID-refusal branch.'],
      concise_driver_answer: 'ASR has two unsuccessful branches. If ID is refused, use Code 006, cross the package, remove the SID, and return it to the station. If no eligible signer is available, use Code 007 residential or 004 non-residential, complete the door tag and attempt photo, and keep the package for reattempt without crossing it or removing the SID.'
    }
  }),
  approval({
    id: 'ADJ-20260819-VLAD-DSR-REATtempt-001', knowledgeId: 'KNO-DEL-SIG-DSR-001',
    issue: 'The package treatment when no eligible DSR signer is available.',
    determination: 'Use Code 007 residential or Code 004 non-residential, complete the attempt documentation, and retain the package for reattempt without crossing or SID removal.',
    previous: ['The source-backed record said not to leave the package but did not explicitly state the no-cross/no-SID reattempt disposition.'],
    overrides: {
      authoritative_rule: 'DSR requires an in-person signature at the labeled address. If nobody can sign, use Code 007 residential or Code 004 non-residential, complete and scan the door tag, capture the attempt photo, and retain the package for reattempt. Do not cross the package or remove the SID sticker for this reattempt branch.',
      required_procedure: [
        { step: 1, action: 'Confirm FORGE shows DSR and attempt the in-person signature at the labeled address.' },
        { step: 2, action: 'If nobody can sign, use Code 007 residential or Code 004 non-residential.' },
        { step: 3, action: 'Complete and scan the door tag and capture the attempt photo.' },
        { step: 4, action: 'Retain the package for reattempt without crossing it or removing the SID.' }
      ],
      prohibited_actions: ['Do not driver release, indirectly deliver, or use a signed door tag for DSR.', 'Do not cross or remove the SID on the retain-for-reattempt branch.'],
      concise_driver_answer: 'If nobody can sign for DSR, use Code 007 residential or 004 non-residential, complete the door tag and attempt photo, and keep the package for reattempt. Do not cross it or remove the SID.'
    }
  }),
  approval({
    id: 'ADJ-20260819-VLAD-APT-RETURN-001', knowledgeId: 'KNO-DEL-APT-001',
    issue: 'The complete apartment no-signer station-return treatment.',
    determination: 'After allowed recipient and indirect-signer paths fail, use Code 007/004, door tag, crossing, SID removal, and station return.',
    previous: ['The source-backed record included the delivery branches, code, door tag, and return but not SID removal.'],
    overrides: {
      authoritative_rule: 'Attempt the accessible apartment door. If the recipient is unavailable, use an allowed indirect delivery only when an eligible neighbor, office, receiving-area employee, or door attendant accepts and signs. If no signer is available, use Code 007 residential or Code 004 business, complete and leave the door tag, cross the package with the code, date, and work area number, remove the SID sticker, and return it to the station.',
      required_procedure: [
        { step: 1, action: 'Attempt the accessible apartment door.' },
        { step: 2, action: 'Use an allowed indirect delivery only when an eligible person accepts and signs.' },
        { step: 3, action: 'If no signer is available, use Code 007 residential or Code 004 business and complete the door tag.' },
        { step: 4, action: 'Cross the package with the matching code, date, and work area number.' },
        { step: 5, action: 'Remove the SID sticker and return the package to the station.' }
      ],
      prohibited_actions: ['Do not leave a package unattended in a common-entry apartment building.', 'Do not bypass signature restrictions.'],
      concise_driver_answer: 'Attempt the unit, then an allowed indirect signer. If nobody can accept and sign, use Code 007 residential or 004 business, complete the door tag, cross the package, remove the SID, and return it to the station.'
    }
  }),
  approval({
    id: 'ADJ-20260819-VLAD-LOCKER-RETURN-001', knowledgeId: 'KNO-DEL-LOCKER-FAIL-001',
    issue: 'The complete return treatment when an eligible package cannot use the third-party locker.',
    determination: 'After property-management alternatives fail, use Code 007, note the reason, door tag, crossing, SID removal, and station return.',
    previous: ['The source-backed record included Code 007 and station return but not the complete note, door-tag, crossing, and SID sequence.'],
    overrides: {
      authoritative_rule: 'For an eligible locker package that does not fit or cannot be placed because the locker failed, contact property management for an approved alternate. If none is available, use Code 007, add a note describing the locker failure, complete and leave the door tag, cross the package with Code 007, the date, and work area number, remove the SID sticker, and return it to the station.',
      required_procedure: [
        { step: 1, action: 'Confirm the package is eligible for the locker.' },
        { step: 2, action: 'Contact property management for an approved alternate location.' },
        { step: 3, action: 'If none is available, use Code 007 and add a note describing the actual locker failure.' },
        { step: 4, action: 'Complete and leave the door tag and cross the package.' },
        { step: 5, action: 'Remove the SID sticker and return the package to the station.' }
      ],
      required_documentation: ['Code 007', 'Scanner note with actual locker-failure reason', 'Door tag', 'Package crossing'],
      prohibited_actions: ['Do not leave the package on, under, near, or outside the unusable locker.'],
      concise_driver_answer: 'Contact property management for an approved alternate. If none is available, use Code 007, note the locker failure, complete the door tag, cross the package, remove the SID, and return it to the station.'
    }
  }),
  approval({
    id: 'ADJ-20260819-VLAD-SAFEPLACE-RETURN-001', knowledgeId: 'KNO-DEL-SAFEPLACE-001',
    issue: 'The complete no-safe-place sequence, including customer contact and station-return treatment.',
    determination: 'Call the customer first, use an allowed indirect signer if available, and otherwise use Code 007, door tag, crossing, SID removal, and station return.',
    previous: ['The source-backed record began with an indirect-neighbor option and included Code 007 and return but not customer contact or SID removal.'],
    overrides: {
      authoritative_rule: 'Do not leave an eligible residential release package where no safe location exists. Call the customer first. If an allowed indirect delivery is available, obtain the required signature. Otherwise use Code 007, complete the notation and door tag, capture the attempt photo, cross the package with the code, date, and work area number, remove the SID sticker, and return it to the station.',
      required_procedure: [
        { step: 1, action: 'Do not leave the package in an unsafe or exposed location; call the customer first.' },
        { step: 2, action: 'If allowed, attempt an indirect delivery to an eligible signer.' },
        { step: 3, action: 'If no allowed delivery path exists, use Code 007 and complete the notation, door tag, and attempt photo.' },
        { step: 4, action: 'Cross the package with Code 007, the date, and work area number.' },
        { step: 5, action: 'Remove the SID sticker and return the package to the station.' }
      ],
      prohibited_actions: ['Do not leave the package in an unsafe or exposed location.', 'Do not use indirect delivery when restrictions prohibit it.'],
      concise_driver_answer: 'Call the customer first and use an allowed indirect signer if available. Otherwise use Code 007, complete the door tag and attempt photo, cross the package, remove the SID, and return it to the station.'
    }
  }),
  approval({
    id: 'ADJ-20260819-VLAD-HAL-RETURN-001', knowledgeId: 'KNO-DEL-HAL-UNABLE-001',
    issue: 'The complete station-return treatment when a HAL package cannot be tendered.',
    determination: 'Use the correct pre-close or post-close HAL branch, then cross, remove the SID, and return the package to station QA.',
    previous: ['The source-backed record included the Code 250 and post-close pickup/QA paths but not crossing or SID removal.'],
    overrides: {
      authoritative_rule: 'Before stop close, use Code 250 with the actual Unable to HAL reason. After a FedEx Office post-close refusal, use the location-applied Unable to Hold label and pickup scan. For either station-return branch, cross the package with the applicable code or return status, date, and work area number, remove the SID sticker, and return it to station QA.',
      required_procedure: [
        { step: 1, action: 'Determine whether the HAL stop is still open.' },
        { step: 2, action: 'Before close, use Code 250 and the actual Unable to HAL reason.' },
        { step: 3, action: 'After a FedEx Office post-close refusal, have the location apply the Unable to Hold label and scan the package as a pickup.' },
        { step: 4, action: 'Cross the package with the applicable return status, date, and work area number and remove the SID sticker.' },
        { step: 5, action: 'Return the package to station QA.' }
      ],
      prohibited_actions: ['Do not use a reason that does not match the condition.', 'Do not use the pre-close Code 250 path after the stop has closed.'],
      concise_driver_answer: 'Use Code 250 and the actual reason before close, or the Unable to Hold label and pickup path after a FedEx Office post-close refusal. Cross the return package, remove the SID, and return it to station QA.'
    }
  }),
  approval({
    id: 'ADJ-20260819-VLAD-PICKUP-NO-BARCODE-001', knowledgeId: 'KNO-PUP-NO-BARCODE-001',
    issue: 'Who the driver may contact when a pickup package has no barcode and the situation is unclear.',
    determination: 'No barcode means no pickup; call CXPC or the BC/manager if the situation is unclear.',
    previous: ['The prior owner approval named CXPC but did not include the BC/manager alternative.'],
    supersedes: ['ADJ-20260815-OWNER-PICKUP-NO-BARCODE-001'],
    overrides: {
      authoritative_rule: 'No barcode means no pickup. Do not take the package. If the situation is not straightforward, call CXPC or the BC/manager.',
      required_procedure: [
        { step: 1, action: 'Confirm the pickup package has no barcode.' },
        { step: 2, action: 'Do not pick up the package.' },
        { step: 3, action: 'Call CXPC or the BC/manager if the situation is not straightforward.' }
      ],
      prohibited_actions: ['Do not pick up a package with no barcode.'],
      escalation_requirements: ['CXPC or BC/manager when the situation is unclear'],
      concise_driver_answer: 'No barcode means no pickup. Do not take the package. If anything is unclear, call CXPC or your BC/manager.'
    }
  })
];

for (const record of newRecords) {
  approvals.push(approval({
    id: `ADJ-20260819-VLAD-${record.knowledge_id.replace(/^KNO-/, '')}`,
    knowledgeId: record.knowledge_id,
    issue: `Whether Vlad's supplied procedure may be published as Ready Route operational knowledge: ${record.canonical_situation}`,
    determination: record.authoritative_rule,
    previous: ['This procedure was absent, incomplete, or withheld from the active v2 corpus before the August 19 Vlad owner approval.'],
    overrides: {
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
  }));
}

for (const item of approvals) upsertBy(adjudications, 'adjudication_id', item);
fs.writeFileSync(ADJUDICATIONS_PATH, `${JSON.stringify(adjudications, null, 2)}\n`);

const cases = readJsonLines(CASES_PATH);
const appendSemanticVariation = (caseId, variation) => {
  const item = cases.find((candidate) => candidate.case_id === caseId);
  if (!item) throw new Error(`Missing driver-language case ${caseId}`);
  item.semantic_variations = [...new Set([...(item.semantic_variations || []), variation])];
};
appendSemanticVariation('SIG-ASR-002', 'The customer refused to show ID for an ASR package. What do I do?');
appendSemanticVariation('V2-PUP-004', 'The pickup package has no barcode. What do I do?');
const newCases = [
  {
    case_id: 'P51-WRONG-ROUTE-AMBIGUOUS-001',
    utterance: "I have a package that isn't mine, how do I get it to the right route?",
    semantic_variations: ["Found a box that's not mine on the van", 'How do I move this package to the correct route'],
    expected_knowledge_ids: ['KNO-DEL-MISLOAD-AFTERDISPATCH-001'],
    must_clarify: ['Was the package discovered before or after dispatch?'],
    must_not_do: ['escalate when the dispatch timing can select an approved branch', 'assume Bulk Transfer without establishing dispatch timing'],
    case_type: 'VLAD_PRIORITY_51_AMBIGUOUS',
    information_sufficiency: 'CONDITIONALLY_SUFFICIENT',
    response_mode: 'ASK_MINIMUM_CLARIFICATION'
  },
  {
    case_id: 'P51-ROAD-CLOSED-001', utterance: 'Delivery but the road is closed',
    semantic_variations: ['Road closure means I cannot reach the stop', 'The only road to the customer is closed', 'The road is closed. What do I do?'],
    expected_knowledge_ids: ['KNO-DEL-SECURITY-NODELIVERY-001'], must_clarify: [],
    must_not_do: ['return Answer Unavailable', 'omit the actual-reason note', 'omit station-return treatment'],
    case_type: 'VLAD_PRIORITY_51_DIRECT', information_sufficiency: 'SUFFICIENT', response_mode: 'DIRECT_SOURCE_GROUNDED_ANSWER',
    answer_override: { direct_answer: 'Use Code 001 because the closed road prevents delivery.', steps: ['Add a note stating that the road is closed.', 'Cross the package with Code 001, the date, and work area number.', 'Remove the SID sticker and return the package to the station.'], watch_for: 'Use this branch only when the closure prevents delivery, not for a delay that still permits access.' }
  },
  {
    case_id: 'P51-EVENING-DSR-001', utterance: 'Evening delivery package also has DSR — can I leave it at 6pm without a signature?',
    semantic_variations: ['DSR Evening package at six can I leave it', 'It is inside the evening window but nobody can sign', 'Can I leave a DSR package after 6 PM?'],
    expected_knowledge_ids: ['KNO-DEL-PREMIUM-WINDOW-001'], must_clarify: [],
    must_not_do: ['say 6 p.m. is before the Evening window', 'imply the service window overrides DSR'],
    case_type: 'VLAD_PRIORITY_51_COLLISION', information_sufficiency: 'SUFFICIENT', response_mode: 'DIRECT_SOURCE_GROUNDED_ANSWER',
    answer_override: { direct_answer: 'No. Six p.m. is inside the 5–8 p.m. window, but DSR still requires an in-person signature.', steps: ['Do not leave the package without the DSR signature.', 'If nobody can sign, use the applicable DSR unsuccessful-attempt branch.'], watch_for: 'The Evening service window does not override the signature requirement.' }
  },
  {
    case_id: 'P51-HAZMAT-PAPERWORK-001', utterance: 'Hazmat delivered but the paperwork is still with me — what do I do?',
    semantic_variations: ['I delivered one hazmat and still have the manifest', 'What do I do with the hazmat papers after delivery'],
    expected_knowledge_ids: ['KNO-HAZ-MANIFEST-001'], must_clarify: [],
    must_not_do: ['lead with general loading instructions', 'leave the delivered package active on the manifest'],
    case_type: 'VLAD_PRIORITY_51_COLLISION', information_sufficiency: 'SUFFICIENT', response_mode: 'DIRECT_SOURCE_GROUNDED_ANSWER',
    answer_override: { direct_answer: 'Cross the delivered hazmat package off the manifest so it accurately shows what remains aboard.', steps: ['Keep the remaining required paperwork accessible.'], watch_for: 'Use the documented paperwork contingency if the manifest is unavailable or a package transfers.' }
  },
  {
    case_id: 'P51-TIME-DEFINITE-PAST-DUE-001', utterance: 'My handheld shows a Time Definite package is already past due — what do I do?',
    semantic_variations: ['Time definite is late what now', 'The commit time already passed'],
    expected_knowledge_ids: ['KNO-DEL-PREMIUM-WINDOW-001'], must_clarify: [],
    must_not_do: ['tell the driver to compromise safety', 'omit the labeled FO PA PA+ or M&I second-attempt condition'],
    case_type: 'VLAD_PRIORITY_51_DIRECT', information_sufficiency: 'SUFFICIENT', response_mode: 'DIRECT_SOURCE_GROUNDED_ANSWER',
    answer_override: { direct_answer: 'Deliver or make the truthful attempt as soon as safely possible; never compromise safety to recover the due time.', steps: ['Continue safely and follow the Time Definite prompts.', 'If the package is explicitly labeled FO, PA, PA+, or M&I and the first attempt fails, make the required second attempt that day.'], watch_for: 'Do not apply the second-attempt rule to an unlabeled package.' }
  },
  {
    case_id: 'P51-BUS-CLOSED-RETURN-001', utterance: 'Business is closed at delivery',
    semantic_variations: ['Closed business return treatment', 'Shop is closed and no release path exists'],
    expected_knowledge_ids: ['KNO-DEL-BUS-CLOSED-001'], must_clarify: [],
    must_not_do: ['omit SID removal', 'omit station return', 'use Code 004 for a residential stop'],
    case_type: 'VLAD_PRIORITY_51_DIRECT', information_sufficiency: 'SUFFICIENT', response_mode: 'DIRECT_SOURCE_GROUNDED_ANSWER',
    answer_override: { direct_answer: 'Use Code 011 for the applicable weekend closure or Code 004 for another closed non-residential condition.', steps: ['Complete, scan, and leave the door tag.', 'Cross the package with the code, date, and work area number.', 'Remove the SID sticker and return it to the station.'], watch_for: 'Do not leave it unless an authorized release path applies.' }
  },
  {
    case_id: 'P51-DAMAGE-RETURN-001', utterance: 'Package looks damaged before delivery',
    semantic_variations: ['Damaged box needs station inspection', 'Possible damage before I deliver'],
    expected_knowledge_ids: ['KNO-DEL-DAMAGE-INSPECTION-001'], must_clarify: ['Is the package leaking or hazardous?'],
    must_not_do: ['handle leaking hazmat as an ordinary Code 010 return', 'omit SID removal from an ordinary inspection return'],
    case_type: 'VLAD_PRIORITY_51_SAFETY_THEN_CLARIFY', information_sufficiency: 'CONDITIONALLY_SUFFICIENT', response_mode: 'IMMEDIATE_SAFETY_ACTION_THEN_CLARIFY'
  },
  {
    case_id: 'P51-FAD-GROUND-001', utterance: 'My FAD Ground delivery cannot be completed',
    semantic_variations: ['FAD package needs to come back', 'What do I do with an undeliverable FAD Ground package'],
    expected_knowledge_ids: ['KNO-DEL-FAD-GROUND-001'], must_clarify: [],
    must_not_do: ['omit the BC or manager call', 'omit station-return treatment'],
    case_type: 'VLAD_APPROVED_NEW_RECORD', information_sufficiency: 'SUFFICIENT', response_mode: 'DIRECT_SOURCE_GROUNDED_ANSWER'
  },
  {
    case_id: 'P51-PICKUP-SCAN-CLASSIFICATION-001', utterance: "This pickup package won't scan and I can't tell if it is Express, Ground, Home, or SmartPost",
    expected_knowledge_ids: ['KNO-PUP-SCAN-CLASSIFICATION-001'], must_clarify: [],
    must_not_do: ['guess the service type', 'accept an unidentified package at a non-Express-certified station'],
    case_type: 'VLAD_APPROVED_NEW_RECORD', information_sufficiency: 'SUFFICIENT', response_mode: 'DIRECT_SOURCE_GROUNDED_ANSWER',
    answer_override: { direct_answer: 'At a non-Express-certified station, accept only packages positively identified as Ground or Home Delivery.', steps: ['If you cannot determine the service type, do not pick it up.', 'Call your manager.'], watch_for: 'Do not guess whether the package is Express, Ground, Home Delivery, or SmartPost.' }
  },
  {
    case_id: 'P51-EARLY-PICKUP-REQUEST-001', utterance: 'The customer says I can do this pickup early',
    expected_knowledge_ids: ['KNO-PUP-EARLY-REQUEST-001'], must_clarify: [],
    must_not_do: ['perform it early without CXPC confirmation and adjusted hours'],
    case_type: 'VLAD_APPROVED_NEW_RECORD', information_sufficiency: 'SUFFICIENT', response_mode: 'DIRECT_SOURCE_GROUNDED_ANSWER',
    answer_override: { direct_answer: 'Call CXPC.', steps: ['Have CXPC confirm directly with the customer.', 'Pick up early only after CXPC adjusts the pickup hours.'], watch_for: 'The customer statement to the driver alone is not enough.' }
  },
  {
    case_id: 'P51-SIGNED-NOTE-001', utterance: 'The customer left a signed handwritten note asking me to leave the package',
    expected_knowledge_ids: ['KNO-DEL-SIGNED-NOTE-001'], must_clarify: [],
    must_not_do: ['treat the handwritten note as ASR or DSR authorization'],
    case_type: 'VLAD_APPROVED_NEW_RECORD', information_sufficiency: 'SUFFICIENT', response_mode: 'DIRECT_SOURCE_GROUNDED_ANSWER',
    answer_override: { direct_answer: 'No. A handwritten signed note does not authorize release.', steps: ['Use only an approved FedEx document or release path.', 'If no approved path applies, use the unsuccessful-attempt procedure for the actual package.'], watch_for: 'A handwritten note never satisfies ASR or DSR.' }
  },
  {
    case_id: 'P51-PERISHABLE-001', utterance: 'Perishable package, nobody answers, and it may spoil',
    expected_knowledge_ids: ['KNO-DEL-PERISHABLE-001'], must_clarify: [],
    must_not_do: ['authorize an unsupported release because it is perishable', 'omit CXPC contact'],
    case_type: 'VLAD_APPROVED_NEW_RECORD', information_sufficiency: 'SUFFICIENT', response_mode: 'DIRECT_SOURCE_GROUNDED_ANSWER',
    answer_override: { direct_answer: 'Call CXPC first for another customer contact.', steps: ['If delivery still cannot be completed, use Code 007 and complete the door tag.', 'Cross the package with the code, date, and work area.', 'Remove the SID and return it to the station.'], watch_for: 'Perishable contents do not create an unauthorized release path.' }
  },
  {
    case_id: 'P51-HANDSHEET-GENERAL-001', utterance: 'My scanner died completely on a non-HAL delivery. How do I fill out the hand sheet?',
    expected_knowledge_ids: ['KNO-DOC-HANDSHEET-GENERAL-001'], must_clarify: [],
    must_not_do: ['route to the HAL-only hand-sheet limitation', 'invent tracking digits'],
    case_type: 'VLAD_APPROVED_NEW_RECORD', information_sufficiency: 'SUFFICIENT', response_mode: 'DIRECT_SOURCE_GROUNDED_ANSWER'
  },
  {
    case_id: 'P51-SIGNATURE-WAIT-001', utterance: 'How long should I wait for someone to sign?',
    expected_knowledge_ids: ['KNO-DEL-SIGNATURE-WAIT-001'], must_clarify: [],
    must_not_do: ['authorize release without the required signature'],
    case_type: 'VLAD_APPROVED_NEW_RECORD', information_sufficiency: 'SUFFICIENT', response_mode: 'DIRECT_SOURCE_GROUNDED_ANSWER',
    answer_override: { direct_answer: 'Wait two to five minutes for an eligible signer.', steps: ['If nobody eligible becomes available, use the unsuccessful-attempt branch for the actual signature service and stop type.'], watch_for: 'Do not release the package without satisfying its signature requirement.' }
  },
  {
    case_id: 'P51-WEATHER-QUESTIONABLE-001', utterance: 'The weather and road conditions look unsafe. Can I use the weather code?',
    expected_knowledge_ids: ['KNO-WEATHER-QUESTIONABLE-001'], must_clarify: [],
    must_not_do: ['authorize an unapproved weather code', 'tell the driver to continue unsafe driving'],
    case_type: 'VLAD_APPROVED_NEW_RECORD', information_sufficiency: 'SUFFICIENT', response_mode: 'DIRECT_SOURCE_GROUNDED_ANSWER',
    answer_override: { direct_answer: 'Do not compromise safety.', steps: ['Call your BC or manager and explain the unsafe conditions.', 'Use the applicable weather code only after they confirm it is approved.'], watch_for: 'Do not continue unsafe driving to meet service timing.' }
  },
  {
    case_id: 'P51-PREDISPATCH-HANDOFF-001', utterance: 'The correct route driver is nearby. Can I hand over this misload before dispatch?',
    expected_knowledge_ids: ['KNO-FORGE-PREDISPATCH-PHYSICAL-HANDOFF-001'], must_clarify: [],
    must_not_do: ['use the post-dispatch Code 012 branch', 'omit the package-handler scan'],
    case_type: 'VLAD_APPROVED_NEW_RECORD', information_sufficiency: 'SUFFICIENT', response_mode: 'DIRECT_SOURCE_GROUNDED_ANSWER'
  }
];

for (const item of newCases) upsertBy(cases, 'case_id', item);
writeJsonLines(CASES_PATH, cases);

const referenceCases = readJsonLines(REFERENCE_CASES_PATH);
upsertBy(referenceCases, 'case_id', {
  case_id: 'V2-REF-012',
  utterance: "Customer wants future delivery because they're doing inventory, what code?",
  expected_reference_ids: ['DELIVERY_STATUS:034'],
  unknown_reference_tokens: [],
  expected_knowledge_ids: [],
  must_clarify: [],
  must_not_do: ['escalate when Code 034 is in the active reference dictionary', 'invent a procedure beyond the verified code definition'],
  case_type: 'VLAD_PRIORITY_51_DELIVERY_CODE',
  information_sufficiency: 'SUFFICIENT_REFERENCE_DEFINITION',
  response_mode: 'ANSWER_REFERENCE_DEFINITION'
});
writeJsonLines(REFERENCE_CASES_PATH, referenceCases);

const conversations = readJsonLines(CONVERSATIONS_PATH);
upsertBy(conversations, 'scenario_id', {
  scenario_id: 'CONV-P51-ISR-DOORTAG-001',
  description: 'The signed-door-tag question retains ISR context and routes the final handling question to the On File form procedure.',
  turns: [
    { input: 'Signature package but signed door tag on file', expected_mode: 'CLARIFY', expected_knowledge_id: 'KNO-DEL-SIG-DSR-001', clarification_contains: 'signature service' },
    { input: "It's ISR", expected_mode: 'ANSWER', expected_knowledge_id: 'KNO-DEL-SIG-ISR-001' },
    { input: 'What do I do with the door tag itself?', expected_mode: 'ANSWER', expected_knowledge_id: 'KNO-DEL-SRA-001', expected_direct_answer: 'Use the non-barcoded SRA path.' }
  ]
});
upsertBy(conversations, 'scenario_id', {
  scenario_id: 'CONV-P51-WRONG-ROUTE-001',
  description: 'Ambiguous plain language asks dispatch timing and selects the approved post-dispatch Code 012 branch.',
  turns: [
    { input: "I have a package that isn't mine, how do I get it to the right route?", expected_mode: 'CLARIFY', expected_knowledge_id: 'KNO-DEL-MISLOAD-AFTERDISPATCH-001', clarification_contains: 'before or after dispatch' },
    { input: 'After dispatch', expected_mode: 'ANSWER', expected_knowledge_id: 'KNO-DEL-MISLOAD-AFTERDISPATCH-001' }
  ]
});
writeJsonLines(CONVERSATIONS_PATH, conversations);

const report = fs.readFileSync(DETAIL_REPORT_PATH, 'utf8');
const detail = report.split('## C-DETAIL.')[1].split('\n## D.')[0];
const headings = [...detail.matchAll(/^###\s+[^0-9]*([0-9]+b?)\.\s+(.+)$/gm)].map((match) => ({ entry: match[1], title: match[2].replace(/\*\*/g, '') }));
if (headings.length !== 51) throw new Error(`Expected 51 priority headings, found ${headings.length}`);

const targetMap = [
  ['KNO-DEL-MISLOAD-AFTERDISPATCH-001'], ['KNO-PUP-NO-BARCODE-001'], ['KNO-DEL-SECURITY-NODELIVERY-001'],
  ['KNO-FORGE-BULK-TRANSFER-001'], ['KNO-FORGE-MANIFEST-PREVIEW-001', 'KNO-DEL-MISLOAD-AFTERDISPATCH-001'],
  ['KNO-FORGE-WRONG-WORK-AREA-001'], ['KNO-FORGE-VEHICLE-BARCODE-WORKAROUND-001'],
  ['KNO-DEL-SIG-ISR-001', 'KNO-DEL-SIG-DSR-001', 'KNO-DEL-SIG-ASR-001'], ['KNO-DEL-SIG-ISR-001'],
  ['KNO-DEL-SRA-001'], ['KNO-PUP-CANCELED-001'], ['KNO-PUP-CANCELED-001'], ['KNO-PUP-CANCELED-001'],
  ['KNO-PUP-CODE20-001'], ['KNO-PUP-CANCELED-001'], ['KNO-PUP-CANCELED-001', 'KNO-PUP-CODE20-001'],
  ['KNO-PUP-UNLISTED-001'], ['KNO-FORGE-HAZMAT-LOGIN-PROMPT-001'], ['KNO-FORGE-BULK-TRANSFER-001'],
  ['KNO-FORGE-VEHICLE-BARCODE-WORKAROUND-001'], ['KNO-DEL-BUS-CLOSED-001'], ['KNO-DEL-DAMAGE-INSPECTION-001'],
  ['KNO-DEL-SIG-ASR-001'], ['KNO-DEL-SIG-DSR-001'], ['KNO-HAZ-LEAK-001'], ['KNO-DEL-APT-001'],
  ['KNO-PUP-CALLTAG-REFUSED-001'], ['KNO-DEL-SAFEPLACE-001'], ['KNO-SEC-ACTIVE-THREAT-001'],
  ['KNO-INC-ACCIDENT-REPORT-001'], ['KNO-DEL-DOORTAG-001'], ['KNO-DEL-ALCOHOL-001'], ['KNO-DEL-ALCOHOL-001'],
  ['KNO-DEL-PREMIUM-WINDOW-001'], ['KNO-DEL-MISDELIVERY-RECOVERY-001'], ['KNO-DEL-MISDELIVERY-RECOVERY-001'],
  ['KNO-DEL-LOCKER-FAIL-001'], ['KNO-DEL-SECURITY-NODELIVERY-001'], [], ['KNO-DEL-SHIPPER-RELEASE-001'],
  ['KNO-DEL-HAL-UNABLE-001'], ['KNO-DEL-HAL-NONHAL-TRANSFER-001'], ['KNO-PUP-CALLTAG-RESTRICTED-001'],
  ['KNO-PUP-CALLTAG-SUCCESS-001'], ['KNO-FORGE-CALLTAG-SCOPE-001'], ['KNO-SEC-LOST-BADGE-001'],
  ['KNO-HAZ-SF136-001'], ['KNO-HAZ-RADIOACTIVE-WET-001'], ['KNO-HAZ-MANIFEST-001'],
  ['KNO-DEL-SCAN-INTEGRITY-001'], ['KNO-DEL-PREMIUM-WINDOW-001']
];

const modeMap = new Map([
  ['1', 'CLARIFY'], ['5b', 'CLARIFY'], ['6', 'CLARIFY'], ['8', 'CLARIFY'], ['11', 'CLARIFY'],
  ['7', 'CLARIFY'], ['19', 'ANSWER'], ['20', 'CLARIFY'], ['22', 'CLARIFY'], ['30', 'CLARIFY'], ['41', 'CLARIFY']
]);

const priorityRows = headings.map((heading, index) => ({
  priority_case_id: `VLAD-P51-${String(index + 1).padStart(2, '0')}`,
  report_entry: heading.entry,
  title: heading.title,
  expected_mode: heading.entry === '39' ? 'REFERENCE_ANSWER' : (modeMap.get(heading.entry) || 'ANSWER'),
  expected_knowledge_ids: targetMap[index],
  expected_reference_ids: heading.entry === '39' ? ['DELIVERY_STATUS:034'] : [],
  authority_source_ids: VLAD_SOURCES,
  status: 'CANONICALIZED_2026-08-19',
  notes: heading.entry === '10'
    ? 'Evaluate as the contextual ISR/SRA conversation, not as a standalone generic door-tag question.'
    : ['7', '20'].includes(heading.entry)
      ? 'The later 2026-08-19 owner directive requires the in-app workflow to ask for the vehicle number before generating Code 128.'
      : null
}));
writeJsonLines(PRIORITY_PATH, priorityRows);

console.log(JSON.stringify({
  records: records.length,
  added_records: newRecords.length,
  adjudications: adjudications.length,
  added_or_updated_approvals: approvals.length,
  driver_cases: cases.length,
  reference_cases: referenceCases.length,
  conversations: conversations.length,
  priority_cases: priorityRows.length
}, null, 2));
