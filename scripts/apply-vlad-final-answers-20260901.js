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

const VLAD_SOURCE = 'SRC-V2-VLAD-FINAL-ANSWERS-20260901';
const APPROVAL_SOURCE = 'SRC-V2-OWNER-VLAD-FINAL-APPROVAL-20260901';
const REVIEW_DATE = '2026-09-01';
const OWNER = 'Phillip Metzger, Ready Route product owner';

function readJsonLines(filePath) {
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function writeJsonLines(filePath, rows) {
  fs.writeFileSync(filePath, rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
}

function upsert(rows, key, value) {
  const index = rows.findIndex((row) => row[key] === value[key]);
  if (index >= 0) rows[index] = value;
  else rows.push(value);
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function appendUnique(existing, additions) {
  return unique([...(existing || []), ...(additions || [])]);
}

function appendTextOnce(existing, addition, delimiter = ' ') {
  const current = String(existing || '');
  if (current.includes(addition)) return current;
  return [current, addition].filter(Boolean).join(delimiter);
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
  const string = String(value == null ? '' : value);
  return /[",\r\n]/.test(string) ? '"' + string.replace(/"/g, '""') + '"' : string;
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
  fs.writeFileSync(filePath, lines.join('\n') + '\n');
}

function vladEvidence(locator, summary, supplemental = []) {
  return [
    {
      source_id: VLAD_SOURCE,
      locator,
      evidence_summary: summary,
      reviewed_at: REVIEW_DATE
    },
    {
      source_id: APPROVAL_SOURCE,
      locator: 'Approved scope',
      evidence_summary: 'Phillip Metzger instructed Ready Route to process and deploy Vlad’s completed field-verified answers within their stated conditions and exceptions.',
      reviewed_at: REVIEW_DATE
    },
    ...supplemental
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
    taxonomy_paths: input.taxonomy_paths,
    driver_question_variants: input.driver_question_variants,
    concise_ready_route_answer: input.concise_ready_route_answer,
    more_info_answer: input.more_info_answer || null,
    evidence: vladEvidence(input.locator, input.evidence_summary, input.supplemental_evidence || []),
    source_date_or_version: 'Vlad final answers owner-approved 2026-09-01',
    knowledge_status: 'HUMAN_REVIEW_REQUIRED',
    review_notes: 'Published only through the scoped 2026-09-01 Vlad Final Answers READY_ROUTE_APPROVED adjudication.',
    created_at: REVIEW_DATE,
    updated_at: REVIEW_DATE
  };
}

function pendingRecord(input) {
  return {
    knowledge_id: input.knowledge_id,
    version: 1,
    canonical_situation: input.canonical_situation,
    normalized_description: input.normalized_description,
    authoritative_rule: input.authoritative_rule,
    applicability: input.applicability,
    conditions: input.conditions || [],
    exceptions: input.exceptions || [],
    required_procedure: input.required_procedure || [],
    required_documentation: [],
    prohibited_actions: input.prohibited_actions || [],
    escalation_requirements: input.escalation_requirements || [],
    clarification_requirements: input.clarification_requirements || [],
    related_knowledge_ids: input.related_knowledge_ids || [],
    taxonomy_paths: input.taxonomy_paths,
    driver_question_variants: input.driver_question_variants,
    concise_ready_route_answer: input.concise_ready_route_answer,
    more_info_answer: input.more_info_answer || null,
    evidence: [{
      source_id: VLAD_SOURCE,
      locator: input.locator,
      evidence_summary: input.evidence_summary,
      reviewed_at: REVIEW_DATE
    }, ...(input.supplemental_evidence || [])],
    source_date_or_version: 'Vlad final answers pending follow-up 2026-09-01',
    knowledge_status: 'HUMAN_REVIEW_REQUIRED',
    review_notes: 'Not owner-approved as a final answer. Vlad explicitly marked this point UNKNOWN / NEEDS ANOTHER REVIEW.',
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
    adjudication_id: 'ADJ-20260901-VLAD-FINAL-' + record.knowledge_id.replace(/^KNO-/, ''),
    knowledge_id: record.knowledge_id,
    status: 'APPROVED',
    issue_reviewed: record.canonical_situation,
    canonical_determination: record.authoritative_rule,
    previous_interpretations: previousInterpretations,
    supporting_source_ids: unique((record.evidence || []).map((item) => item.source_id)),
    conflicting_or_superseded_source_ids: [],
    reasoning: 'Vlad supplied the field-verified procedure or definition and Phillip Metzger directed Ready Route to process and deploy the completed answers. The determination preserves the supplied conditions, exceptions, and unresolved boundaries without model inference.',
    approved_by: OWNER,
    approval_date: REVIEW_DATE,
    effective_date: REVIEW_DATE,
    supersedes: [],
    reopen_conditions: [
      'Phillip or Vlad revises the supplied procedure or definition.',
      'Later applicable operational, company-policy, scanner-workflow, safety, or regulatory guidance materially conflicts with it.',
      'A more specific scenario establishes a different approved procedure.'
    ],
    canonical_overrides: canonicalOverrides(record)
  };
}

const records = readJsonLines(RECORDS_PATH);
const originalById = new Map(records.map((record) => [record.knowledge_id, JSON.parse(JSON.stringify(record))]));

const approvedRecords = [
  ownerRecord({
    knowledge_id: 'KNO-VEH-SMOKE-001',
    canonical_situation: 'Smoke is coming from the delivery vehicle',
    normalized_description: 'The driver notices smoke coming from the van and needs the approved emergency and management contacts.',
    authoritative_rule: 'If the situation feels dangerous, call 911 first. Either way, call the BC and explain what happened.',
    applicability: ['Smoke is noticed coming from the delivery vehicle, regardless of the apparent source'],
    required_procedure: [
      { step: 1, action: 'Assess whether the smoke situation feels dangerous.' },
      { step: 2, action: 'If it feels dangerous, call 911 first.' },
      { step: 3, action: 'Call your BC and explain what happened in every case.' }
    ],
    prohibited_actions: ['Do not omit the BC notification.', 'Do not delay calling 911 when the situation feels dangerous.'],
    escalation_requirements: ['Call 911 first when the situation feels dangerous', 'Call the BC in every case'],
    taxonomy_paths: ['TAX-VEHICLE', 'TAX-INCIDENT'],
    driver_question_variants: ['Smoke is coming from the van', 'My truck is smoking', 'I see smoke from my delivery vehicle', 'Van smoking what do I do'],
    concise_ready_route_answer: 'If it feels dangerous, call 911 first. Either way, call your BC and explain what happened.',
    more_info_answer: 'This answer applies whenever smoke is noticed, regardless of the apparent source.',
    locator: 'Priority 1, item 1 — Smoke is coming from the van',
    evidence_summary: 'Vlad supplied the danger-based 911 branch and mandatory BC notification.'
  }),
  ownerRecord({
    knowledge_id: 'KNO-INCIDENT-DRIVER-SICK-DIZZY-001',
    canonical_situation: 'The driver feels sick or dizzy while driving',
    normalized_description: 'Illness or dizziness makes the driver feel unsafe to continue driving.',
    authoritative_rule: 'Stop in a safe location, then call the BC.',
    applicability: ['The driver feels unsafe to continue driving because of illness or dizziness'],
    required_procedure: [
      { step: 1, action: 'Pull over and stop in a safe location.' },
      { step: 2, action: 'Call your BC.' }
    ],
    prohibited_actions: ['Do not continue driving when illness or dizziness makes it feel unsafe.'],
    escalation_requirements: ['Call the BC after stopping safely'],
    taxonomy_paths: ['TAX-INCIDENT', 'TAX-VEHICLE'],
    driver_question_variants: ['I feel sick while driving', 'I am dizzy on route', 'Feeling faint behind the wheel', 'Too sick to keep driving'],
    concise_ready_route_answer: 'Pull over and stop in a safe location, then call your BC.',
    locator: 'Priority 1, item 2 — Driver feels sick or dizzy while driving',
    evidence_summary: 'Vlad supplied the safe-stop and BC sequence.'
  }),
  ownerRecord({
    knowledge_id: 'KNO-DEL-POWER-LINES-001',
    canonical_situation: 'Downed power lines are found near a delivery',
    normalized_description: 'The driver encounters downed power lines near the delivery location and needs the approved notification sequence.',
    authoritative_rule: 'Find and notify the customer, then call the BC, explain what happened, and provide the customer’s contact information.',
    applicability: ['Downed power lines are found near a delivery location'],
    required_procedure: [
      { step: 1, action: 'Locate the customer and tell them about the downed power lines.' },
      { step: 2, action: 'Call your BC and explain what happened.' },
      { step: 3, action: 'Provide the customer’s contact information to the BC.' }
    ],
    exceptions: ['This procedure does not determine whether the delivery is completed.'],
    required_documentation: ['Customer contact information provided to the BC'],
    prohibited_actions: ['Do not infer from this record whether the delivery should be completed.'],
    escalation_requirements: ['Notify the customer, then call the BC'],
    taxonomy_paths: ['TAX-DELIVERY', 'TAX-INCIDENT'],
    driver_question_variants: ['Power lines are down near the delivery', 'Downed wire at the customer address', 'Power line near the stop', 'Electrical line is down by the house'],
    concise_ready_route_answer: 'Notify the customer, then call your BC, explain what happened, and provide the customer’s contact information.',
    more_info_answer: 'This record does not decide whether the delivery is completed.',
    locator: 'Priority 1, item 3 — Downed power lines near a delivery',
    evidence_summary: 'Vlad supplied the customer notification, BC notification, and contact-information sequence.'
  }),
  ownerRecord({
    knowledge_id: 'KNO-VEH-KEYS-LOCKED-001',
    canonical_situation: 'The driver locked the keys inside the van',
    normalized_description: 'The driver is locked out of the delivery vehicle and needs management help locating a spare key.',
    authoritative_rule: 'Call the BC; the BC may know where a spare key is. Do not force entry.',
    applicability: ['The driver is locked out of the van because the keys are inside'],
    required_procedure: [{ step: 1, action: 'Call your BC.' }],
    exceptions: ['No self-help entry method is approved by this record.'],
    prohibited_actions: ['Do not attempt to force entry into the vehicle.'],
    escalation_requirements: ['Call the BC'],
    taxonomy_paths: ['TAX-VEHICLE'],
    driver_question_variants: ['I locked my keys in the van', 'Keys are inside the truck', 'Locked out of delivery vehicle', 'How do I get into the van when keys are locked in'],
    concise_ready_route_answer: 'Call your BC—they may know where a spare key is. Do not force entry.',
    locator: 'Priority 2, item 5 — Keys locked in the van',
    evidence_summary: 'Vlad supplied the BC/spare-key response and prohibited forced entry.'
  }),
  ownerRecord({
    knowledge_id: 'KNO-FORGE-SCANNER-FROZEN-001',
    canonical_situation: 'The scanner is powered on but frozen',
    normalized_description: 'The scanner is unresponsive even though it is powered on, distinct from low battery or a completely unavailable device.',
    authoritative_rule: 'Restart the scanner. If that fails, remove and reinsert the battery. If it still does not work, notify the BC for a replacement scanner and use hand sheets (blue sheets) while waiting.',
    applicability: ['The scanner is powered on but unresponsive'],
    exceptions: ['Low battery and a completely unavailable scanner use their separate procedures'],
    required_procedure: [
      { step: 1, action: 'Restart the scanner.' },
      { step: 2, action: 'If it is still frozen, remove and reinsert the battery.' },
      { step: 3, action: 'If it still does not work, notify the BC so a replacement scanner can be brought.' },
      { step: 4, action: 'Use hand sheets (blue sheets) to record deliveries while waiting.' }
    ],
    required_documentation: ['Hand sheet (blue sheet) delivery records when the replacement branch is used'],
    prohibited_actions: ['Do not treat a frozen scanner as the low-battery procedure.', 'Do not omit delivery documentation while waiting for a replacement.'],
    escalation_requirements: ['Call the BC if restarting and reseating the battery do not resolve the freeze'],
    related_knowledge_ids: ['KNO-FORGE-SCANNER-LOW-BATTERY-001', 'KNO-DOC-HANDSHEET-GENERAL-001', 'KNO-PUP-SCANNER-FAIL-001'],
    taxonomy_paths: ['TAX-FORGE', 'TAX-FORGE/TAX-DOCUMENTATION'],
    driver_question_variants: ['My scanner froze', 'Scanner is powered on but stuck', 'Scanner screen is frozen', 'Restart did not fix the frozen scanner'],
    concise_ready_route_answer: 'Restart the scanner. If that fails, remove and reinsert the battery. If it still does not work, call your BC for a replacement and use hand sheets while waiting.',
    more_info_answer: 'This is for a powered-on but frozen scanner, not low battery or a completely unavailable device.',
    locator: 'Priority 2, item 6 — Scanner freezes',
    evidence_summary: 'Vlad supplied the restart, battery reseat, BC replacement, and hand-sheet sequence.'
  }),
  ownerRecord({
    knowledge_id: 'KNO-FORGE-APP-CRASH-001',
    canonical_situation: 'The FORGE app crashes during a delivery',
    normalized_description: 'FORGE crashes or becomes unusable during a delivery and the driver needs recovery and temporary documentation steps.',
    authoritative_rule: 'Restart the scanner. If that does not help, call the BC because maintenance may be underway. Continue deliveries with hand sheets (blue sheets) and turn them in at the station office at the end of the day.',
    applicability: ['The FORGE app crashes or becomes unusable during a delivery'],
    required_procedure: [
      { step: 1, action: 'Restart the scanner.' },
      { step: 2, action: 'If that does not resolve it, contact your BC; maintenance may be underway.' },
      { step: 3, action: 'Continue deliveries using hand sheets (blue sheets).' },
      { step: 4, action: 'Turn the hand sheets in at the station office at the end of the day.' }
    ],
    required_documentation: ['Hand sheet (blue sheet) delivery records', 'Hand sheets turned in at the station office'],
    prohibited_actions: ['Do not leave hand-sheet deliveries undocumented.', 'Do not omit turning in used hand sheets.'],
    escalation_requirements: ['Contact the BC if restarting the scanner does not restore FORGE'],
    related_knowledge_ids: ['KNO-FORGE-SCANNER-FROZEN-001', 'KNO-DOC-HANDSHEET-GENERAL-001'],
    taxonomy_paths: ['TAX-FORGE', 'TAX-FORGE/TAX-DOCUMENTATION'],
    driver_question_variants: ['FORGE app crashed', 'The app crashed during delivery', 'FORGE stopped working mid stop', 'FORGE unusable on route'],
    concise_ready_route_answer: 'Restart the scanner. If FORGE still does not work, call your BC, keep delivering with hand sheets, and turn the hand sheets in at the station office at day’s end.',
    locator: 'Priority 2, item 7 — FORGE app crashes during a delivery',
    evidence_summary: 'Vlad supplied the restart, BC, hand-sheet, and station-office handoff sequence.'
  }),
  ownerRecord({
    knowledge_id: 'KNO-DEL-MINOR-AT-DOOR-001',
    canonical_situation: 'Only a minor answers the door and no adult is present',
    normalized_description: 'The driver must determine whether the package requires a signature when only a person under 18 is present.',
    authoritative_rule: 'A minor cannot sign for a signature-required package. If no signature is required, the package may be driver-released and documented with a PPOD photo. If a signature is required, use the standard no-eligible-signer outcome for that signature type.',
    applicability: ['Only a person under 18 is present and no adult is available'],
    conditions: ['The package’s signature type controls the unsuccessful-attempt branch'],
    exceptions: ['No special handling is added beyond the standard no-eligible-signer procedure for the applicable signature type'],
    required_procedure: [
      { step: 1, action: 'Confirm whether the package requires a signature and which signature type applies.' },
      { step: 2, action: 'If a signature is required, do not accept the minor’s signature; use the standard no-eligible-signer outcome for that signature type.' },
      { step: 3, action: 'If no signature is required, driver-release the package and take the required PPOD photo.' }
    ],
    required_documentation: ['Applicable unsuccessful-attempt documentation for a signature-required package', 'PPOD photo for an eligible driver release'],
    prohibited_actions: ['Do not accept a minor’s signature for a signature-required package.'],
    clarification_requirements: ['Does the package require a signature, and if so, which type?'],
    related_knowledge_ids: ['KNO-DEL-SIG-ISR-001', 'KNO-DEL-SIG-DSR-001', 'KNO-DEL-SIG-ASR-001', 'KNO-DEL-ALCOHOL-001', 'KNO-DEL-PPOD-001'],
    taxonomy_paths: ['TAX-DELIVERY', 'TAX-DELIVERY/TAX-SIGNATURE'],
    driver_question_variants: ['Kids answered the door and no adult is home', 'Can a minor sign for this package', 'Only a child is at the door', 'Under 18 recipient at delivery'],
    concise_ready_route_answer: 'A minor cannot sign for a signature-required package. If no signature is required, driver-release it and take the PPOD photo. If a signature is required, use the no-eligible-signer procedure for that signature type.',
    locator: 'Priority 3, item 9 — Children answer the door without an adult',
    evidence_summary: 'Vlad supplied the minor/signature boundary and the ordinary driver-release branch.'
  }),
  ownerRecord({
    knowledge_id: 'KNO-DEL-CUSTOMER-NOT-RECEIVED-001',
    canonical_situation: 'A customer disputes a completed delivery',
    normalized_description: 'A customer says they did not receive a package that the driver marked delivered.',
    authoritative_rule: 'Notify the BC; the BC can track the package using internal systems. Do not independently investigate or return to the address without direction.',
    applicability: ['The customer says a package marked delivered was not received'],
    required_procedure: [{ step: 1, action: 'Contact your BC and explain the delivery dispute.' }],
    prohibited_actions: ['Do not independently investigate the dispute.', 'Do not return to the address without direction.'],
    escalation_requirements: ['Contact the BC'],
    related_knowledge_ids: ['KNO-DEL-DISPUTE-PREVENTION-001', 'KNO-DEL-MISDELIVERY-RECOVERY-001'],
    taxonomy_paths: ['TAX-DELIVERY'],
    driver_question_variants: ['Customer says they never got the package', 'I delivered it but customer says missing', 'Customer disputes my delivery', 'Package marked delivered not received'],
    concise_ready_route_answer: 'Notify your BC. Do not independently investigate or return to the address without direction.',
    locator: 'Priority 3, item 10 — Customer disputes a completed delivery',
    evidence_summary: 'Vlad supplied the BC-only post-delivery dispute response and prohibited independent investigation or return.'
  }),
  ownerRecord({
    knowledge_id: 'KNO-DEL-NEIGHBOR-PERMISSION-001',
    canonical_situation: 'A customer asks the driver to leave a package with a nearby person',
    normalized_description: 'The customer requests release to someone other than themselves and the driver must determine whether the person is an eligible neighbor with confirmed permission.',
    authoritative_rule: 'Release is permitted only when the person is a genuine neighbor and the customer confirms permission by phone. Otherwise apply Code 007, complete the service cross, remove the Vision Label (SID sticker), and return the package to the station.',
    applicability: ['A customer asks the driver to leave a package with another nearby person'],
    conditions: ['The person must be a genuine neighbor', 'The customer must confirm permission by phone'],
    exceptions: ['A stranger with no relationship to the customer is never eligible', 'Existing stricter signature-service rules remain controlling'],
    required_procedure: [
      { step: 1, action: 'Confirm whether the requested person is a genuine neighbor.' },
      { step: 2, action: 'Call the customer and confirm permission.' },
      { step: 3, action: 'If both conditions are met and no stricter signature rule prevents it, complete the indirect delivery.' },
      { step: 4, action: 'If either condition is not met, apply Code 007, complete the service cross, remove the Vision Label (SID sticker), and return the package to the station.' }
    ],
    required_documentation: ['Confirmed customer permission for the eligible-neighbor branch', 'Code 007 and service cross for the non-delivery branch'],
    prohibited_actions: ['Do not release to a stranger.', 'Do not treat proximity alone as proof that the person is a neighbor.'],
    clarification_requirements: ['Is the requested person a genuine neighbor, and did the customer confirm permission by phone?'],
    related_knowledge_ids: ['KNO-DEL-SIG-ISR-001', 'KNO-DEL-NOTATION-001'],
    taxonomy_paths: ['TAX-DELIVERY', 'TAX-DELIVERY/TAX-SIGNATURE'],
    driver_question_variants: ['Customer wants me to leave package with a stranger nearby', 'Can I give it to the neighbor if customer says yes', 'Customer texted to leave it with someone nearby', 'Release package to another person'],
    concise_ready_route_answer: 'Only release it to a genuine neighbor after the customer confirms permission by phone. Otherwise use Code 007, complete the service cross, remove the Vision Label (SID sticker), and return the package.',
    locator: 'Priority 3, item 11 — Customer asks for release to a nearby stranger',
    evidence_summary: 'Vlad supplied the genuine-neighbor and phone-permission conditions and the Code 007 return branch.'
  }),
  ownerRecord({
    knowledge_id: 'KNO-CX-CUSTOMER-RECORDING-001',
    canonical_situation: 'A customer records the driver on camera',
    normalized_description: 'The driver is being recorded by an ordinary doorbell, security, or customer camera and needs to distinguish recording from confrontation.',
    authoritative_rule: 'Ordinary recording requires no action; it is the customer’s property and right. If it becomes confrontation or harassment, protect yourself, do not escalate, leave if needed, and report it to the BC.',
    applicability: ['A customer or customer-owned camera records the driver'],
    conditions: ['The hostile-customer branch applies only when recording escalates into confrontation or harassment'],
    required_procedure: [
      { step: 1, action: 'If it is ordinary recording, take no special action.' },
      { step: 2, action: 'If it becomes confrontation or harassment, protect yourself, do not escalate, and leave if needed.' },
      { step: 3, action: 'Report the escalated situation to your BC.' }
    ],
    prohibited_actions: ['Do not treat ordinary recording as an accident or injury.', 'Do not escalate a confrontation.'],
    escalation_requirements: ['Call the BC only if the situation becomes confrontational or harassing'],
    taxonomy_paths: ['TAX-ROUTE', 'TAX-INCIDENT'],
    driver_question_variants: ['Customer is recording me', 'Doorbell camera is filming me', 'Can the customer video me', 'Customer holding phone camera on me'],
    concise_ready_route_answer: 'Ordinary recording is fine and needs no action. If it becomes confrontation or harassment, do not escalate, leave if needed, and report it to your BC.',
    locator: 'Priority 3, item 12 — Customer records the driver on camera',
    evidence_summary: 'Vlad distinguished ordinary recording from an escalated hostile-customer situation.'
  }),
  ownerRecord({
    knowledge_id: 'KNO-DEL-CUSTOMER-ADDRESS-CHANGE-001',
    canonical_situation: 'A customer calls or texts the driver to change the delivery address',
    normalized_description: 'The customer directly asks the driver to redirect a package away from the shipping-label address.',
    authoritative_rule: 'Follow the shipping label. A customer cannot authorize an address change by contacting the driver directly and must call FedEx. If the customer says they moved from the label address, apply Code 002.',
    applicability: ['The customer directly calls or texts the driver asking for a different delivery address'],
    exceptions: ['This record does not replace an authorized FedEx address-correction workflow'],
    required_procedure: [
      { step: 1, action: 'Do not change the delivery address based on the customer’s direct call or text.' },
      { step: 2, action: 'Continue to use the shipping-label address.' },
      { step: 3, action: 'Tell the customer they must contact FedEx for an address change.' },
      { step: 4, action: 'If the customer states that they moved from the label address, apply Code 002.' }
    ],
    required_documentation: ['Code 002 when the customer states they moved'],
    prohibited_actions: ['Do not self-authorize an address change from a direct customer request.'],
    clarification_requirements: ['Has the customer moved, or are they only requesting delivery somewhere else?'],
    related_knowledge_ids: ['KNO-FORGE-EDIT-ADDRESS-001'],
    taxonomy_paths: ['TAX-DELIVERY', 'TAX-FORGE/TAX-STATUS'],
    driver_question_variants: ['Customer called to change delivery address', 'Customer texted me a new address', 'Can I redirect package because customer asked', 'Customer moved from label address'],
    concise_ready_route_answer: 'Use the shipping-label address. The customer must call FedEx to change it. If the customer says they moved from that address, apply Code 002.',
    locator: 'Priority 3, item 13 — Customer requests a changed delivery address',
    evidence_summary: 'Vlad supplied the label-only rule, FedEx referral, and moved-customer Code 002 branch.'
  }),
  ownerRecord({
    knowledge_id: 'KNO-DEL-DUPLICATE-TRACKING-001',
    canonical_situation: 'Two physical packages have the same tracking number',
    normalized_description: 'Two or more physical packages share an identical tracking number and barcode.',
    authoritative_rule: 'Confirm that the tracking numbers are identical, scan one package, deliver all physical duplicate packages, and add a comment stating how many duplicate packages were delivered under that tracking number.',
    applicability: ['Two or more physical packages share the identical tracking number and barcode'],
    conditions: ['The tracking numbers must be confirmed identical'],
    exceptions: ['Packages with different tracking numbers are separate orders and are delivered normally'],
    required_procedure: [
      { step: 1, action: 'Confirm the physical packages have the identical tracking number and barcode.' },
      { step: 2, action: 'Scan one package; the shared barcode allows only one scan.' },
      { step: 3, action: 'Deliver all physical duplicate packages.' },
      { step: 4, action: 'Add a comment stating that two or more duplicate packages were delivered under that tracking number.' }
    ],
    required_documentation: ['Comment recording the number of duplicate physical packages delivered'],
    prohibited_actions: ['Do not use this procedure for packages with different tracking numbers.'],
    clarification_requirements: ['Do the physical packages have the identical tracking number?'],
    taxonomy_paths: ['TAX-DELIVERY', 'TAX-DELIVERY/TAX-SCAN-INTEGRITY'],
    driver_question_variants: ['Two packages have the same tracking number', 'Duplicate package barcode', 'I have duplicate packages for one customer', 'Same tracking number on two boxes'],
    concise_ready_route_answer: 'If the tracking numbers are identical, scan one, deliver both physical packages, and add a comment that duplicate packages were delivered. Different tracking numbers are delivered normally.',
    locator: 'Priority 4, items 14–15 — Duplicate packages and tracking numbers',
    evidence_summary: 'Vlad confirmed one procedure for physical packages with an identical tracking number and distinguished separate orders.'
  }),
  ownerRecord({
    knowledge_id: 'KNO-GLOSSARY-DNA-001',
    canonical_situation: 'A driver asks what DNA means in delivery status',
    normalized_description: 'The driver needs a direct definition of the DNA delivery-status abbreviation.',
    authoritative_rule: 'DNA means Did Not Attempt and corresponds to Code 027, Package Not Delivered - No Attempt. It is a system status label and is not an action trigger by itself.',
    applicability: ['The driver asks for the meaning of DNA in a delivery-status context'],
    exceptions: ['The definition does not authorize skipping a delivery attempt'],
    required_procedure: [],
    prohibited_actions: ['Do not treat the definition as authorization to skip an attempt.'],
    related_knowledge_ids: [],
    taxonomy_paths: ['TAX-FORGE', 'TAX-FORGE/TAX-STATUS'],
    driver_question_variants: ['What does DNA mean', 'DNA delivery status', 'What is did not attempt', 'DNA code meaning'],
    concise_ready_route_answer: 'DNA means Did Not Attempt and corresponds to Code 027, Package Not Delivered - No Attempt. It is a status label, not an action instruction by itself.',
    locator: 'Priority 6, item 17 — DNA',
    evidence_summary: 'Vlad supplied the acronym expansion and Code 027 relationship.',
    supplemental_evidence: [{
      source_id: 'SRC-V2-OP117-20251215',
      locator: 'page 37, Delivery Status Codes, Code 27',
      evidence_summary: 'Defines Code 027 as Package Not Delivered - No Attempt.',
      reviewed_at: REVIEW_DATE
    }]
  }),
  ownerRecord({
    knowledge_id: 'KNO-DEL-OP201-DEFINITION-001',
    canonical_situation: 'A driver asks what OP-201 means',
    normalized_description: 'The driver needs the business-release meaning and immediate confirmation boundary for an OP-201 authorization on file.',
    authoritative_rule: 'OP-201 is a signed authorization on file at a business that allows driver release of non-signature-required packages without a new signature each time. Even with OP-201 on file, confirm with the customer and call CXPC before releasing; it is not automatic.',
    applicability: ['The driver asks what OP-201 means or encounters an OP-201 business-release authorization'],
    conditions: ['The package must not require a signature', 'Customer confirmation and a CXPC call are still required'],
    exceptions: ['OP-201 does not override a signature-required package'],
    required_procedure: [
      { step: 1, action: 'Confirm the package does not require a signature.' },
      { step: 2, action: 'Confirm with the customer.' },
      { step: 3, action: 'Call CXPC before releasing the package.' }
    ],
    prohibited_actions: ['Do not treat OP-201 as automatic release.', 'Do not use OP-201 to override a signature-required package.'],
    escalation_requirements: ['Call CXPC before release'],
    related_knowledge_ids: ['KNO-DEL-SHIPPER-RELEASE-001'],
    taxonomy_paths: ['TAX-DELIVERY', 'TAX-DELIVERY/TAX-DRIVER-RELEASE'],
    driver_question_variants: ['What does OP-201 mean', 'What is OP 201', 'Business has OP201 on file', 'Can I automatically release with OP-201'],
    concise_ready_route_answer: 'OP-201 is a signed business authorization for release of non-signature-required packages. It is not automatic: confirm with the customer and call CXPC before releasing.',
    locator: 'Priority 6, item 18 — OP-201',
    evidence_summary: 'Vlad supplied the signed-authorization definition and the customer-confirmation/CXPC boundary.'
  }),
  ownerRecord({
    knowledge_id: 'KNO-PUP-CALLTAG-DEFINITION-001',
    canonical_situation: 'A driver asks what a call tag is',
    normalized_description: 'The driver needs a direct definition of a call-tag return pickup.',
    authoritative_rule: 'A call tag is a pickup request for a package the customer is returning. At pickup, place the call-tag label on the package, scan it, and follow the call-tag picked-up procedure.',
    applicability: ['The driver asks what a call tag means'],
    conditions: ['The package must meet the applicable call-tag pickup requirements'],
    exceptions: ['Not-ready, not-home, refusal, restricted, and hazmat call tags use their separate procedures'],
    required_procedure: [
      { step: 1, action: 'Place the call-tag label on the returned package.' },
      { step: 2, action: 'Scan the package.' },
      { step: 3, action: 'Follow the approved call-tag picked-up procedure.' }
    ],
    related_knowledge_ids: ['KNO-PUP-CALLTAG-SUCCESS-001', 'KNO-PUP-CALLTAG-NOTREADY-001', 'KNO-PUP-CALLTAG-NOTHOME-001', 'KNO-PUP-CALLTAG-REFUSED-001', 'KNO-PUP-CALLTAG-RESTRICTED-001'],
    taxonomy_paths: ['TAX-PICKUP', 'TAX-PICKUP/TAX-CALLTAG'],
    driver_question_variants: ['What is a call tag', 'What does call tag mean', 'Customer return pickup label', 'Call tag definition'],
    concise_ready_route_answer: 'A call tag is a pickup request for a package the customer is returning. Put the call-tag label on the package, scan it, and follow the call-tag picked-up procedure.',
    locator: 'Priority 6, item 19 — Call tag',
    evidence_summary: 'Vlad supplied the return-pickup definition and basic label/scan mechanic.',
    supplemental_evidence: [{
      source_id: 'SRC-V2-OP117-20251215',
      locator: 'page 53, Picking up a Call Tag',
      evidence_summary: 'Defines the approved successful call-tag pickup workflow.',
      reviewed_at: REVIEW_DATE
    }]
  }),
  ownerRecord({
    knowledge_id: 'KNO-GLOSSARY-BC-001',
    canonical_situation: 'A driver asks what BC means',
    normalized_description: 'The driver needs the Ready Route definition of BC.',
    authoritative_rule: 'BC means Business Contact: the driver’s manager or operational contact for reporting issues, getting direction, and escalating field situations.',
    applicability: ['The driver asks what BC means or stands for'],
    required_procedure: [],
    taxonomy_paths: ['TAX-ROUTE'],
    driver_question_variants: ['What does BC stand for', 'What is a BC', 'Who is my business contact', 'BC meaning'],
    concise_ready_route_answer: 'BC means Business Contact—your manager or operational contact for reporting issues, getting direction, and escalating field situations.',
    locator: 'Priority 6, item 21 — BC',
    evidence_summary: 'Vlad supplied the Business Contact expansion and functional definition.'
  }),
  ownerRecord({
    knowledge_id: 'KNO-GLOSSARY-FORGE-001',
    canonical_situation: 'A driver asks what FORGE is',
    normalized_description: 'The driver needs a direct functional definition of FORGE.',
    authoritative_rule: 'FORGE is FedEx’s internal delivery and pickup system. It runs on the scanner and drives the day-to-day route workflow.',
    applicability: ['The driver asks what FORGE means or what it does'],
    required_procedure: [],
    taxonomy_paths: ['TAX-FORGE'],
    driver_question_variants: ['What is FORGE', 'What does FORGE mean', 'Is FORGE the scanner app', 'FORGE definition'],
    concise_ready_route_answer: 'FORGE is FedEx’s internal delivery and pickup system. It runs on the scanner and drives the day-to-day route workflow.',
    locator: 'Priority 6, item 22 — FORGE',
    evidence_summary: 'Vlad supplied the functional FORGE definition.'
  }),
  ownerRecord({
    knowledge_id: 'KNO-GLOSSARY-SERVICE-CROSS-001',
    canonical_situation: 'A driver asks what a service cross is',
    normalized_description: 'The driver needs the definition and quadrant layout of the cross-shaped notation written on an undelivered package.',
    authoritative_rule: 'A service cross is written directly on an undelivered package: top-left is the status code with name or initial, top-right is the time, bottom-left is the date, and bottom-right is the Work Area number.',
    applicability: ['The driver asks what a service cross is or how its quadrants are arranged'],
    required_procedure: [
      { step: 1, action: 'Write the status code with name or initial in the top-left quadrant.' },
      { step: 2, action: 'Write the time in the top-right quadrant.' },
      { step: 3, action: 'Write the date in the bottom-left quadrant.' },
      { step: 4, action: 'Write the Work Area number in the bottom-right quadrant.' }
    ],
    required_documentation: ['Complete service cross written directly on the undelivered package'],
    related_knowledge_ids: ['KNO-DEL-NOTATION-001'],
    taxonomy_paths: ['TAX-DELIVERY', 'TAX-FORGE/TAX-DOCUMENTATION'],
    driver_question_variants: ['What is a service cross', 'How do I fill out the cross on a package', 'Service cross quadrants', 'Where do code time date and work area go'],
    concise_ready_route_answer: 'A service cross is the cross-shaped notation on an undelivered package: code and initial top-left, time top-right, date bottom-left, and Work Area number bottom-right.',
    locator: 'Priority 6, item 23 — Service cross',
    evidence_summary: 'Vlad supplied the definition, package location, and four-quadrant layout.'
  }),
  ownerRecord({
    knowledge_id: 'KNO-GLOSSARY-MANIFEST-001',
    canonical_situation: 'A driver asks what a manifest is',
    normalized_description: 'The driver needs a direct definition of the FORGE route manifest and its possible mismatch with the physical van.',
    authoritative_rule: 'A manifest is the digital list of packages assigned to the driver’s route in FORGE. It may not match the physical van because a package can be scanned to the wrong Work Area.',
    applicability: ['The driver asks what a manifest means'],
    exceptions: ['A manifest/physical mismatch uses its own separate approved procedure'],
    required_procedure: [],
    related_knowledge_ids: ['KNO-FORGE-MANIFEST-PREVIEW-001', 'KNO-FORGE-UNMANIFESTED-DELIVERY-001', 'KNO-DEL-PACKAGE-NOT-FOUND-VAN-001'],
    taxonomy_paths: ['TAX-FORGE', 'TAX-FORGE/TAX-MANIFEST'],
    driver_question_variants: ['What is a manifest', 'What does manifest mean in FORGE', 'Is manifest the packages on my route', 'Manifest does not match the van'],
    concise_ready_route_answer: 'A manifest is the digital list of packages assigned to your route in FORGE. It can differ from the physical van if a package was scanned to the wrong Work Area.',
    more_info_answer: 'A package may appear on the manifest but not be physically present, or be physically present without appearing on that manifest. A mismatch uses its separate procedure.',
    locator: 'Priority 6, item 24 — Manifest',
    evidence_summary: 'Vlad supplied the digital-route-list definition and the possible physical-van mismatch.'
  }),
  ownerRecord({
    knowledge_id: 'KNO-GLOSSARY-CXPC-001',
    canonical_situation: 'A driver asks what CXPC is or when to call it',
    normalized_description: 'The driver needs the functional customer-coordination role of CXPC, distinct from the BC.',
    authoritative_rule: 'CXPC is the customer-facing coordination contact. Use CXPC when the customer cannot be reached for a delivery, when an incomplete or missing address needs customer coordination, or for pickup issues such as transfer, reaching a business customer, or extending a pickup window. The exact letter-by-letter expansion is not verified.',
    applicability: ['The driver asks what CXPC is or when it is used'],
    conditions: ['Use the specific approved procedure for the driver’s situation'],
    exceptions: ['BC remains the internal or operational management contact', 'This record does not verify a letter-by-letter expansion of CXPC'],
    required_procedure: [],
    prohibited_actions: ['Do not invent the letter-by-letter expansion of CXPC.', 'Do not replace a situation-specific approved procedure with this general definition.'],
    related_knowledge_ids: ['KNO-PUP-WINDOW-RISK-001', 'KNO-PUP-WRONG-WA-001', 'KNO-PUP-PRR-001'],
    taxonomy_paths: ['TAX-ROUTE', 'TAX-PICKUP'],
    driver_question_variants: ['What is CXPC', 'What does CXPC do', 'When do I call CXPC', 'Difference between CXPC and BC'],
    concise_ready_route_answer: 'CXPC is the customer-facing coordination contact; BC is your internal operational contact. Call CXPC when an approved procedure requires customer coordination, especially for delivery contact/address help or pickup issues.',
    more_info_answer: 'The exact letter-by-letter expansion of CXPC is not verified. Use the situation-specific approved procedure for the actual call.',
    locator: 'Priority 6, item 25 — CXPC',
    evidence_summary: 'Vlad supplied the functional CXPC definition, common uses, and the explicit boundary that its letter-by-letter expansion is unconfirmed.'
  })
];

const breakdownIndex = records.findIndex((record) => record.knowledge_id === 'KNO-VEH-BREAKDOWN-001');
if (breakdownIndex < 0) throw new Error('Missing KNO-VEH-BREAKDOWN-001');
const priorBreakdown = records[breakdownIndex];
const breakdownAlreadyApplied = (priorBreakdown.evidence || []).some((item) => item.source_id === VLAD_SOURCE && item.locator === 'Priority 1, item 4 — Flat tire on route');
const breakdownRecord = {
  ...priorBreakdown,
  version: Number(priorBreakdown.version || 1) + (breakdownAlreadyApplied ? 0 : 1),
  applicability: appendUnique(priorBreakdown.applicability, ['A flat tire disables the vehicle on route']),
  driver_question_variants: appendUnique(priorBreakdown.driver_question_variants, ['Flat tire on route', 'My truck has a flat tire', 'Van tire went flat']),
  evidence: appendEvidence(priorBreakdown.evidence, vladEvidence('Priority 1, item 4 — Flat tire on route', 'Vlad confirmed that a flat tire uses the existing vehicle-breakdown procedure without a separate workflow.')),
  source_date_or_version: appendTextOnce(priorBreakdown.source_date_or_version, 'flat-tire scope owner-approved 2026-09-01', '; '),
  knowledge_status: 'HUMAN_REVIEW_REQUIRED',
  review_notes: appendTextOnce(priorBreakdown.review_notes, 'Vlad confirmed on 2026-09-01 that the same procedure applies to a flat tire.'),
  updated_at: REVIEW_DATE
};

const barcodeIndex = records.findIndex((record) => record.knowledge_id === 'KNO-FORGE-VEHICLE-BARCODE-WORKAROUND-001');
if (barcodeIndex < 0) throw new Error('Missing KNO-FORGE-VEHICLE-BARCODE-WORKAROUND-001');
const priorBarcode = records[barcodeIndex];
const barcodeAlreadyApplied = (priorBarcode.evidence || []).some((item) => item.source_id === VLAD_SOURCE && item.locator === 'Priority 2, item 8 — Missing vehicle barcode, vehicle number already known');
const barcodeRecord = {
  ...priorBarcode,
  version: Number(priorBarcode.version || 1) + (barcodeAlreadyApplied ? 0 : 1),
  authoritative_rule: 'If the driver already supplied the vehicle number in the current request, do not ask for it again: prefix the supplied value with uppercase V and immediately display the in-app Code 128 barcode. If the vehicle number was not supplied, ask exactly “What is the vehicle number?”, then generate the in-app Code 128 barcode from the response.',
  applicability: appendUnique(priorBarcode.applicability, ['The driver supplies the vehicle number in the same request as the vehicle-barcode request']),
  required_procedure: [
    { step: 1, action: 'Check whether the current request already supplies the actual vehicle number.' },
    { step: 2, action: 'If it is supplied, do not ask again; prefix it immediately with uppercase V.' },
    { step: 3, action: 'If it is not supplied, ask exactly: “What is the vehicle number?” and prefix the response with uppercase V.' },
    { step: 4, action: 'Generate and display an in-app Code 128 barcode for the complete V-prefixed value.' },
    { step: 5, action: 'Display the encoded value beneath the barcode so the driver can verify and scan it.' }
  ],
  prohibited_actions: appendUnique(priorBarcode.prohibited_actions, ['Do not re-ask for a vehicle number already supplied in the current request.']),
  clarification_requirements: ['What is the vehicle number? — only when it was not already supplied in the current request'],
  driver_question_variants: appendUnique(priorBarcode.driver_question_variants, ['Vehicle barcode missing for vehicle 538765', 'Generate the vehicle barcode for 538765', 'I need Code 128 for vehicle V538765']),
  concise_ready_route_answer: 'If you already supplied the vehicle number, Ready Route uses it immediately, prefixes uppercase V, and displays the in-app Code 128 barcode. Otherwise it asks only for the vehicle number.',
  evidence: appendEvidence(priorBarcode.evidence, vladEvidence('Priority 2, item 8 — Missing vehicle barcode, vehicle number already known', 'Vlad confirmed that Ready Route must not ask again when the current request already supplies the vehicle number.')),
  source_date_or_version: appendTextOnce(priorBarcode.source_date_or_version, 'no-reask scope owner-approved 2026-09-01', '; '),
  knowledge_status: 'HUMAN_REVIEW_REQUIRED',
  review_notes: appendTextOnce(priorBarcode.review_notes, 'The 2026-09-01 approval removes only a redundant vehicle-number question when that value is already present.'),
  updated_at: REVIEW_DATE
};

approvedRecords.push(breakdownRecord, barcodeRecord);

const pendingRecords = [
  pendingRecord({
    knowledge_id: 'KNO-DEL-CASH-NONCOD-001',
    canonical_situation: 'A customer offers cash that is not clearly an established COD package',
    normalized_description: 'The driver needs the still-unconfirmed distinction between an approved COD workflow and other requests for cash, including shipping charges.',
    authoritative_rule: 'The complete distinction remains unverified. Vlad supplied “call your BC” only as an interim response.',
    applicability: ['A customer offers cash and the package is not clearly an established COD package'],
    exceptions: ['A clearly established COD package uses its approved COD procedure'],
    required_procedure: [{ step: 1, action: 'Call your BC for direction while the complete distinction remains under review.' }],
    prohibited_actions: ['Do not invent a cash-collection procedure.', 'Do not treat this pending record as authorization to accept cash.'],
    escalation_requirements: ['Call the BC'],
    clarification_requirements: ['Is this a documented COD package or a different cash request?'],
    related_knowledge_ids: ['KNO-DEL-COD-GENERAL-001', 'KNO-DEL-COD-MULTI-001'],
    taxonomy_paths: ['TAX-DELIVERY', 'TAX-POLICY'],
    driver_question_variants: ['Customer wants to pay shipping charges in cash', 'Cash request but not COD', 'Can I accept cash for this delivery'],
    concise_ready_route_answer: 'Ready Route does not yet have a verified answer for non-COD cash requests. Call your BC.',
    locator: 'Priority 5, item 16 — Cash for shipping charges vs. COD',
    evidence_summary: 'Vlad marked the full COD/non-COD cash distinction UNKNOWN / NEEDS ANOTHER REVIEW and supplied BC contact only as an interim response.'
  }),
  pendingRecord({
    knowledge_id: 'KNO-GLOSSARY-OSA-001',
    canonical_situation: 'A driver asks what OSA stands for',
    normalized_description: 'The exact expansion of OSA in the Code 030 label has not been verified.',
    authoritative_rule: 'The reviewed code card lists Code 030 as Retail Refusal/O.S.A., but the exact expansion of OSA and its complete operating condition remain unverified.',
    applicability: ['The driver asks what OSA means in the Code 030 context'],
    exceptions: ['The Code 030 label does not authorize selecting the code'],
    prohibited_actions: ['Do not invent the expansion of OSA.', 'Do not select Code 030 from this incomplete definition.'],
    related_knowledge_ids: [],
    taxonomy_paths: ['TAX-FORGE', 'TAX-FORGE/TAX-STATUS'],
    driver_question_variants: ['What does OSA mean', 'What is O.S.A.', 'OSA Code 030 meaning'],
    concise_ready_route_answer: 'Ready Route has not yet verified what OSA stands for. Code 030 is listed as Retail Refusal/O.S.A., but its exact OSA expansion and operating condition still require review.',
    locator: 'Priority 6, item 20 — OSA',
    evidence_summary: 'Vlad explicitly marked the OSA expansion UNKNOWN / NEEDS ANOTHER REVIEW.',
    supplemental_evidence: [{
      source_id: 'SRC-V2-MGB119-20251106',
      locator: 'page 2, Delivery Attempted but Not Completed, Code 030',
      evidence_summary: 'Lists the label Retail Refusal/O.S.A. but does not define the acronym or full operating condition.',
      reviewed_at: REVIEW_DATE
    }]
  })
];

for (const record of [...approvedRecords.filter((record) => !['KNO-VEH-BREAKDOWN-001', 'KNO-FORGE-VEHICLE-BARCODE-WORKAROUND-001'].includes(record.knowledge_id)), ...pendingRecords]) {
  upsert(records, 'knowledge_id', record);
}
records[breakdownIndex] = breakdownRecord;
records[barcodeIndex] = barcodeRecord;
writeJsonLines(RECORDS_PATH, records);

const finalById = new Map(records.map((record) => [record.knowledge_id, record]));
const adjudications = JSON.parse(fs.readFileSync(ADJUDICATIONS_PATH, 'utf8'));
const approvals = approvedRecords.map((record) => approval(finalById.get(record.knowledge_id), [
  originalById.has(record.knowledge_id)
    ? 'The previous active record did not include this newly verified branch or no-reask behavior.'
    : 'No publication-ready Ready Route record previously supplied this complete procedure or direct definition.'
]));
for (const item of approvals) {
  const priorActive = adjudications.filter((candidate) => (
    candidate.knowledge_id === item.knowledge_id
    && candidate.status === 'APPROVED'
    && candidate.adjudication_id !== item.adjudication_id
  ));
  item.supersedes = appendUnique(item.supersedes, priorActive.map((candidate) => candidate.adjudication_id));
  for (const previous of priorActive) {
    previous.status = 'SUPERSEDED';
    previous.superseded_by = appendUnique(previous.superseded_by, [item.adjudication_id]);
  }
  upsert(adjudications, 'adjudication_id', item);
}
fs.writeFileSync(ADJUDICATIONS_PATH, JSON.stringify(adjudications, null, 2) + '\n');

function directCase(caseId, utterance, knowledgeId, variations, mustNotDo = []) {
  return {
    case_id: caseId,
    utterance,
    semantic_variations: variations,
    expected_knowledge_ids: [knowledgeId],
    must_clarify: [],
    must_not_do: mustNotDo,
    case_type: 'VLAD_FINAL_OWNER_APPROVED',
    information_sufficiency: 'SUFFICIENT',
    response_mode: 'DIRECT_SOURCE_GROUNDED_ANSWER'
  };
}

const evaluations = readJsonLines(CASES_PATH);
const newCases = [
  {
    ...directCase(
      'V2-NL-012',
      'van 538765 barcode is gone and my generator is on code 128',
      'KNO-FORGE-VEHICLE-BARCODE-WORKAROUND-001',
      [],
      ['ask for the vehicle number', 'omit the V prefix', 'use a different vehicle number', 'redirect to an external barcode generator', 'ask whether Code 128 is selected']
    ),
    case_type: 'COMPLETE_VEHICLE_BARCODE_CONDITION'
  },
  {
    ...directCase(
      'V2-NL-015',
      "Van 538765's barcode is missing, and my barcode generator is set to Code 128.",
      'KNO-FORGE-VEHICLE-BARCODE-WORKAROUND-001',
      [],
      ['ask for the vehicle number', 'omit the V prefix', 'use a different vehicle number', 'redirect to an external barcode generator', 'ask whether Code 128 is selected']
    ),
    case_type: 'COMPLETE_VEHICLE_BARCODE_CONDITION_NATURAL_WORDING'
  },
  {
    ...directCase(
      'HARDEN-005',
      'The van barcode sticker is gone. Vehicle number 2387 and my generator is set to Code 128.',
      'KNO-FORGE-VEHICLE-BARCODE-WORKAROUND-001',
      [
        'Truck 2387 barcode is missing and the generator uses Code 128',
        'My vehicle number is 2387 and Code 128 is selected but the sticker is gone'
      ],
      [
        'ask for the vehicle number',
        'ask whether Code 128 is selected',
        'omit the V prefix',
        'redirect to an external barcode generator'
      ]
    ),
    case_type: 'QUALITY_HARDENING_DIRECT'
  },
  directCase('VLAD-FINAL-SMOKE-001', 'Smoke is coming from the van', 'KNO-VEH-SMOKE-001', ['my truck is smoking', 'van smoke what do I do'], ['omit 911 when it feels dangerous', 'omit BC notification']),
  directCase('VLAD-FINAL-DIZZY-001', 'I feel sick and dizzy while driving', 'KNO-INCIDENT-DRIVER-SICK-DIZZY-001', ['feeling faint behind the wheel', 'too sick to keep driving'], ['tell the driver to keep driving']),
  directCase('VLAD-FINAL-POWER-LINES-001', 'Power lines are down near the delivery', 'KNO-DEL-POWER-LINES-001', ['downed wire at customer address'], ['invent a delivery-completion decision']),
  directCase('VLAD-FINAL-FLAT-TIRE-001', 'I have a flat tire on route', 'KNO-VEH-BREAKDOWN-001', ['my truck has a flat tire'], ['invent a separate flat-tire workflow']),
  directCase('VLAD-FINAL-LOCKED-KEYS-001', 'I locked my keys in the van', 'KNO-VEH-KEYS-LOCKED-001', ['locked out of delivery truck'], ['tell the driver to force entry']),
  directCase('VLAD-FINAL-SCANNER-FROZEN-001', 'My scanner froze during the route', 'KNO-FORGE-SCANNER-FROZEN-001', ['scanner powered on but stuck'], ['route to low battery']),
  directCase('VLAD-FINAL-APP-CRASH-001', 'The FORGE app crashed in the middle of a delivery', 'KNO-FORGE-APP-CRASH-001', ['app crashed mid delivery'], ['omit hand-sheet handoff']),
  directCase('VLAD-FINAL-BARCODE-KNOWN-001', 'The vehicle barcode is missing for vehicle 538765', 'KNO-FORGE-VEHICLE-BARCODE-WORKAROUND-001', ['generate Code 128 for vehicle V538765'], ['ask for the vehicle number again', 'omit uppercase V']),
  {
    case_id: 'VLAD-FINAL-MINOR-001',
    utterance: 'Kids answered the door alone and there is no adult present',
    semantic_variations: ['only a minor is at the door'],
    expected_knowledge_ids: ['KNO-DEL-MINOR-AT-DOOR-001'],
    must_clarify: ['whether a signature is required and which type'],
    must_not_do: ['accept a minor signature for a signature-required package'],
    case_type: 'VLAD_FINAL_OWNER_APPROVED',
    information_sufficiency: 'CONDITIONALLY_SUFFICIENT',
    response_mode: 'ASK_MINIMUM_CLARIFICATION'
  },
  directCase('VLAD-FINAL-DISPUTE-001', 'I delivered the package but the customer says they never got it', 'KNO-DEL-CUSTOMER-NOT-RECEIVED-001', ['customer disputes completed delivery'], ['tell driver to investigate alone', 'tell driver to return without direction']),
  directCase('VLAD-FINAL-STRANGER-001', 'The customer wants me to leave the package with a stranger nearby', 'KNO-DEL-NEIGHBOR-PERMISSION-001', ['leave it with someone nearby who is not a neighbor'], ['authorize release to a stranger']),
  directCase('VLAD-FINAL-RECORDING-001', 'Customer is recording me on camera', 'KNO-CX-CUSTOMER-RECORDING-001', ['doorbell camera filming me'], ['route ordinary recording to accident injury']),
  {
    ...directCase('VLAD-FINAL-ADDRESS-001', 'Customer called and told me to change the delivery address', 'KNO-DEL-CUSTOMER-ADDRESS-CHANGE-001', ['customer texted a new address'], ['authorize a driver-created address change']),
    answer_override: {
      direct_answer: 'Use the shipping-label address. The customer must call FedEx to change it.',
      steps: [
        'Do not change the delivery address based on the customer’s direct call or text.',
        'Continue to use the shipping-label address.',
        'Tell the customer they must contact FedEx for an address change.'
      ],
      watch_for: 'Do not self-authorize an address change from a direct customer request.'
    }
  },
  directCase('VLAD-FINAL-DUPLICATE-TRACKING-001', 'Two packages have the same tracking number', 'KNO-DEL-DUPLICATE-TRACKING-001', ['same barcode on two physical boxes'], ['use duplicate-address Code 002']),
  {
    case_id: 'VLAD-FINAL-DUPLICATE-UNKNOWN-001',
    utterance: 'I have two duplicate packages for one customer',
    semantic_variations: ['two packages look duplicated'],
    expected_knowledge_ids: ['KNO-DEL-DUPLICATE-TRACKING-001'],
    must_clarify: ['whether the tracking numbers are identical'],
    must_not_do: ['assume identical tracking numbers', 'use duplicate-address Code 002'],
    case_type: 'VLAD_FINAL_OWNER_APPROVED',
    information_sufficiency: 'CONDITIONALLY_SUFFICIENT',
    response_mode: 'ASK_MINIMUM_CLARIFICATION'
  },
  directCase('VLAD-FINAL-DNA-001', 'What does DNA mean in delivery status', 'KNO-GLOSSARY-DNA-001', ['DNA code meaning'], ['return shipper-release procedure', 'authorize skipping an attempt']),
  directCase('VLAD-FINAL-OP201-001', 'What does OP-201 mean', 'KNO-DEL-OP201-DEFINITION-001', ['what is OP 201'], ['return shipper-release procedure', 'say release is automatic']),
  directCase('VLAD-FINAL-CALLTAG-001', 'What is a call tag', 'KNO-PUP-CALLTAG-DEFINITION-001', ['call tag meaning'], ['route to pickup-not-ready clarification']),
  directCase('VLAD-FINAL-BC-001', 'What does BC stand for', 'KNO-GLOSSARY-BC-001', ['what is my BC'], ['offer unrelated operational clarifiers']),
  directCase('VLAD-FINAL-FORGE-001', 'What is FORGE', 'KNO-GLOSSARY-FORGE-001', ['FORGE meaning'], ['route to accident report']),
  directCase('VLAD-FINAL-SERVICE-CROSS-001', 'What is a service cross', 'KNO-GLOSSARY-SERVICE-CROSS-001', ['service cross quadrants'], ['route to hazmat manifest']),
  directCase('VLAD-FINAL-MANIFEST-001', 'What is a manifest', 'KNO-GLOSSARY-MANIFEST-001', ['manifest meaning in FORGE'], ['route to hazmat manifest']),
  directCase('VLAD-FINAL-CXPC-001', 'What is CXPC', 'KNO-GLOSSARY-CXPC-001', ['difference between CXPC and BC'], ['invent the letter-by-letter expansion'])
];
for (const item of newCases) upsert(evaluations, 'case_id', item);
writeJsonLines(CASES_PATH, evaluations);

const conversations = readJsonLines(CONVERSATIONS_PATH);
for (const item of [
  {
    scenario_id: 'CONV-VLAD-FINAL-MINOR-SIGNATURE-001',
    description: 'A minor-at-door question asks for the signature requirement and retains the approved record after the driver answers.',
    turns: [
      {
        input: 'Kids answered the door alone and there is no adult present',
        expected_mode: 'CLARIFY',
        expected_knowledge_id: 'KNO-DEL-MINOR-AT-DOOR-001',
        clarification_contains: 'signature'
      },
      {
        input: 'It does not require a signature',
        expected_mode: 'ANSWER',
        expected_knowledge_id: 'KNO-DEL-MINOR-AT-DOOR-001'
      }
    ]
  },
  {
    scenario_id: 'CONV-VLAD-FINAL-DUPLICATE-TRACKING-001',
    description: 'An apparent duplicate-package question confirms identical tracking numbers before applying the duplicate-tracking procedure.',
    turns: [
      {
        input: 'I have two duplicate packages for one customer',
        expected_mode: 'CLARIFY',
        expected_knowledge_id: 'KNO-DEL-DUPLICATE-TRACKING-001',
        clarification_contains: 'tracking numbers'
      },
      {
        input: 'Yes, they have the same tracking number',
        expected_mode: 'ANSWER',
        expected_knowledge_id: 'KNO-DEL-DUPLICATE-TRACKING-001'
      }
    ]
  }
]) upsert(conversations, 'scenario_id', item);
writeJsonLines(CONVERSATIONS_PATH, conversations);

const resolvedOutOfCorpusIds = new Set([
  'OOC-002',
  'OOC-017',
  'OOC-EXTENDED-DNA-001',
  'OOC-EXTENDED-OP201-001',
  'OOC-EXTENDED-LOCKED-KEYS-001',
  'OOC-EXTENDED-RECORDING-001',
  'OOC-EXTENDED-DUPLICATE-TRACKING-001',
  'OOC-EXTENDED-SMOKE-VAN-001',
  'OOC-EXTENDED-DIZZY-DRIVING-001',
  'OOC-EXTENDED-POWER-LINES-001',
  'OOC-EXTENDED-SCANNER-FROZE-001',
  'OOC-EXTENDED-APP-CRASHED-001',
  'OOC-EXTENDED-KIDS-AT-DOOR-001',
  'OOC-EXTENDED-FLAT-TIRE-001',
  'OOC-EXTENDED-DELIVERED-NOT-RECEIVED-001',
  'OOC-EXTENDED-STRANGER-RELEASE-001',
  'OOC-EXTENDED-DUPLICATE-PACKAGES-001'
]);
const outOfCorpus = readJsonLines(OUT_OF_CORPUS_PATH).filter((item) => !resolvedOutOfCorpusIds.has(item.case_id));
writeJsonLines(OUT_OF_CORPUS_PATH, outOfCorpus);

const inventory = readCsvObjects(INVENTORY_PATH);
for (const item of [
  {
    source_id: VLAD_SOURCE,
    source_system: 'Ready Route v2 intake',
    parent_source_id: '',
    title: 'ReadyRoute Vlad Final Answers',
    source_type: 'MARKDOWN',
    mime_type: 'text/markdown',
    url_or_path: 'Owner-supplied Vlad field-verification file in the 2026-09-01 workspace session',
    created_at: REVIEW_DATE,
    modified_at: REVIEW_DATE,
    effective_date: REVIEW_DATE,
    version: '2026-09-01 final answers',
    apparent_subject: 'Field-verified procedures and direct terminology definitions',
    apparent_audience: 'Ready Route product and engineering',
    access_status: 'ACCESSIBLE',
    review_status: 'INTAKE_REVIEWED',
    relevance_status: 'HIGH_RELEVANCE',
    duplicate_of: '',
    supersedes: '',
    superseded_by: '',
    cross_references: APPROVAL_SOURCE,
    local_archive_path: 'docs/ReadyRoute_Vlad_Final_Answers_2026-09-01.md',
    interpretation_limits: 'Use only the exact supplied procedures, conditions, exceptions, and functional definitions. Cash/non-COD and OSA remain unresolved; the CXPC letter expansion remains unverified.',
    review_notes: 'Preserved byte-for-byte with SHA-256 8648566af3ea1f3f10e06a3554a798f1d4b316d7228964b58153094ca5904ffc.',
    last_reviewed_at: REVIEW_DATE,
    metadata_recovery_status: 'OWNER_SUPPLIED',
    metadata_recovery_basis: 'Owner supplied Vlad’s completed field-verification file'
  },
  {
    source_id: APPROVAL_SOURCE,
    source_system: 'Ready Route product-owner decision',
    parent_source_id: '',
    title: 'Ready Route owner approval — Vlad final answers',
    source_type: 'Policy',
    mime_type: 'text/markdown',
    url_or_path: 'docs/ready-route-owner-approval-vlad-final-answers-2026-09-01.md',
    created_at: REVIEW_DATE,
    modified_at: REVIEW_DATE,
    effective_date: REVIEW_DATE,
    version: 'Owner approval',
    apparent_subject: 'Authority for completed Vlad final answers',
    apparent_audience: 'Ready Route knowledge authors',
    access_status: 'ACCESSIBLE',
    review_status: 'OWNER_APPROVED',
    relevance_status: 'HIGH_RELEVANCE',
    duplicate_of: '',
    supersedes: '',
    superseded_by: '',
    cross_references: VLAD_SOURCE,
    local_archive_path: 'docs/ready-route-owner-approval-vlad-final-answers-2026-09-01.md',
    interpretation_limits: 'Excludes the unresolved cash/non-COD distinction, OSA expansion, and CXPC letter-by-letter expansion.',
    review_notes: 'Phillip Metzger instructed Ready Route to process and deploy the completed field-verified answers.',
    last_reviewed_at: REVIEW_DATE,
    metadata_recovery_status: 'OWNER_DIRECTIVE',
    metadata_recovery_basis: 'Explicit product-owner instruction in the current workspace session'
  }
]) upsert(inventory.rows, 'source_id', item);
writeCsvObjects(INVENTORY_PATH, inventory.headers, inventory.rows);

const capture = readCsvObjects(CAPTURE_PATH);
for (const record of approvedRecords) {
  const sourceIds = unique((record.evidence || []).map((item) => item.source_id));
  upsert(capture.rows, 'knowledge_id', {
    knowledge_id: record.knowledge_id,
    knowledge_status: record.knowledge_status,
    evidence_source_ids: sourceIds.join(';'),
    durable_source_ids: sourceIds.join(';'),
    rendered_full_source_ids: '',
    rendered_partial_source_ids: '',
    transient_full_source_ids: '',
    transient_partial_source_ids: '',
    evidence_capture_class: 'OWNER_APPROVED_DURABLE_MARKDOWN_WITH_PRESERVED_PRIOR_EVIDENCE',
    production_capture_gate: 'CAPTURE_COMPLETE_OWNER_VERIFICATION',
    authenticated_queue_resource_ids: '',
    required_follow_up: 'Reopen if Phillip, Vlad, company policy, scanner behavior, or later applicable operational, regulatory, or safety guidance changes the approved answer.'
  });
}
for (const record of pendingRecords) {
  const sourceIds = unique((record.evidence || []).map((item) => item.source_id));
  upsert(capture.rows, 'knowledge_id', {
    knowledge_id: record.knowledge_id,
    knowledge_status: record.knowledge_status,
    evidence_source_ids: sourceIds.join(';'),
    durable_source_ids: sourceIds.join(';'),
    rendered_full_source_ids: '',
    rendered_partial_source_ids: '',
    transient_full_source_ids: '',
    transient_partial_source_ids: '',
    evidence_capture_class: 'DURABLE_MARKDOWN_PENDING_FINAL_VERIFICATION',
    production_capture_gate: 'CAPTURE_COMPLETE_NONPUBLISHABLE_REVIEW_ITEM',
    authenticated_queue_resource_ids: '',
    required_follow_up: record.knowledge_id === 'KNO-GLOSSARY-OSA-001'
      ? 'Vlad or Phillip must verify the exact OSA expansion and operating condition.'
      : 'Vlad or Phillip must verify the distinction between COD and other cash requests.'
  });
}
writeCsvObjects(CAPTURE_PATH, capture.headers, capture.rows);

const changes = readJsonLines(CHANGE_LOG_PATH);
for (const record of [...approvedRecords, ...pendingRecords]) {
  const previous = originalById.get(record.knowledge_id) || { knowledge_id: record.knowledge_id, state: 'ABSENT_FROM_ACTIVE_CORPUS' };
  const changeId = 'CHG-20260901-VLAD-FINAL-' + record.knowledge_id.replace(/^KNO-/, '');
  const existing = changes.find((change) => change.change_id === changeId);
  upsert(changes, 'change_id', {
    change_id: changeId,
    knowledge_id: record.knowledge_id,
    changed_at: REVIEW_DATE,
    changed_by: OWNER,
    change_reason: pendingRecords.some((item) => item.knowledge_id === record.knowledge_id)
      ? 'Preserved Vlad’s explicitly unresolved item as non-publishable review work.'
      : 'Added or upgraded the owner-approved Vlad Final Answers procedure or definition.',
    previous_record: existing ? existing.previous_record : previous,
    previous_checksum: existing ? existing.previous_checksum : sha256(previous),
    new_record: record,
    new_checksum: sha256(record)
  });
}
writeJsonLines(CHANGE_LOG_PATH, changes);

console.log(JSON.stringify({
  approved_records_added: approvedRecords.filter((record) => !originalById.has(record.knowledge_id)).length,
  approved_records_upgraded: approvedRecords.filter((record) => originalById.has(record.knowledge_id)).length,
  pending_records_added: pendingRecords.length,
  approvals_added_or_updated: approvals.length,
  evaluation_cases_added_or_updated: newCases.length,
  conversation_scenarios_added_or_updated: 2,
  out_of_corpus_cases_resolved: resolvedOutOfCorpusIds.size
}, null, 2));
