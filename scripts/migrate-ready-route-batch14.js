#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const RECORDS = path.join(ROOT, 'research/fedex-ground-driver-knowledge/knowledge/records.jsonl');
const CASES = path.join(ROOT, 'research/fedex-ground-driver-knowledge/validation/driver_language_cases.jsonl');
const CONVERSATIONS = path.join(ROOT, 'research/fedex-ground-driver-knowledge/validation/conversation_scenarios.jsonl');
const CAPTURE = path.join(ROOT, 'research/fedex-ground-driver-knowledge/knowledge/evidence_capture_risk_coverage.csv');
const ARCHIVE = 'readyroute-answers-dataset-v1-archive-2026-08-15';

const sourceMap = new Map([
  ['SRC-GDRIVE-FILE-0014', 'SRC-V2-OP117-20251215'],
  ['SRC-GDRIVE-FILE-0008', 'SRC-V2-FORGE-PD300-20250401']
]);

const configs = {
  'KNO-DEL-COD-MULTI-001': {
    sources: ['SRC-GDRIVE-FILE-0008'],
    status: 'VERIFIED',
    authoritative_rule: 'FORGE handles multiple COD packages separately: verify the amount for each package, review the stop total, and complete the separate COD screen for each package, including its check number when the current approved payment method requires one. The reviewed guide does not establish accepted payment types, payee, change, custody, reconciliation, or refusal rules.',
    required_procedure: [
      { step: 1, action: 'Scan each COD package and verify or enter the correct amount for that package.' },
      { step: 2, action: 'Review the combined stop total before continuing.' },
      { step: 3, action: 'Complete the separate COD screen for each package, including its check number when the approved payment method requires one.' },
      { step: 4, action: 'Stop and obtain the current approved COD procedure for an amount mismatch, payment question, or refusal.' }
    ],
    required_documentation: ['Per-package COD amount', 'Stop total', 'Per-package check number when applicable'],
    prohibited_actions: ['Do not assume a prepopulated amount is correct', 'Do not apply one package\'s amount or check number to another package', 'Do not invent accepted payment, payee, change, custody, reconciliation, or refusal rules'],
    escalation_requirements: ['Contact management or station personnel for an amount mismatch, unsupported payment question, or refusal.'],
    clarification_requirements: [],
    concise_ready_route_answer: 'Handle every COD package separately: verify each package amount, review the combined stop total, and complete a separate COD screen for each package. Do not guess payment or refusal rules that are not shown.',
    more_info_answer: 'A 2D scan may prepopulate an amount, but the FORGE guide still requires the correct amount to be verified or entered. Current COD policy is still required for accepted payment, payee, change, custody, reconciliation, and refusal.',
    variants: ['How do I deliver multiple COD packages', 'I have two COD packages at one stop', 'Does each COD package get its own screen', 'Can I use one check number for every COD package'],
    cases: [
      ['I have three COD packages at one stop', 'Handle every COD package separately: verify each package amount, review the combined stop total, and complete a separate COD screen for each package.'],
      ['Does every COD package get a separate screen', 'Yes. Complete a separate COD screen for each package.'],
      ['The COD amount was prefilled. Do I still verify it', 'Yes. Verify the correct COD amount even when the scan prepopulates it.'],
      ['Can I enter one check number for all the COD packages', 'No. Do not apply one package\'s check number to another package.']
    ]
  },
  'KNO-DEL-CRITICAL-HEALTH-001': {
    sources: ['SRC-GDRIVE-FILE-0008'],
    status: 'VERIFIED',
    authoritative_rule: 'A Critical Healthcare delivery is presented with Critical Healthcare, SenseAware, and Time Definite prompts. Scan and acknowledge those prompts, follow the package\'s delivery and signature requirements, keep the SenseAware ID attached until delivery, remove it before recipient handoff, and return it to station personnel.',
    required_procedure: [
      { step: 1, action: 'Identify the Critical Healthcare delivery and its Time Definite commitment.' },
      { step: 2, action: 'Scan the package and acknowledge the Critical Healthcare, SenseAware, and Time Definite prompts.' },
      { step: 3, action: 'Complete the applicable delivery and signature requirements with the SenseAware ID attached.' },
      { step: 4, action: 'After delivery, remove the ID before recipient handoff and return it to station personnel.' }
    ],
    required_documentation: ['Critical Healthcare package scan and prompt acknowledgments', 'Applicable signature and stop close', 'SenseAware ID return'],
    prohibited_actions: ['Do not ignore the Time Definite commitment', 'Do not remove the SenseAware ID before delivery', 'Do not leave the SenseAware ID with the recipient'],
    escalation_requirements: ['Contact station or management when the delivery commitment, package condition, signature, or SenseAware ID procedure cannot be completed.'],
    clarification_requirements: [],
    concise_ready_route_answer: 'Treat it as a Time Definite delivery with a SenseAware ID. Acknowledge the prompts, follow the required signature procedure, keep the ID attached until delivery, then remove it before handoff and return it to station personnel.',
    more_info_answer: 'The FORGE guide identifies Critical Healthcare packages with Critical Healthcare, SenseAware, and Time Definite prompts. The exact delivery window and any signature service shown on the package still control.',
    variants: ['I have a Critical Healthcare delivery', 'How do I deliver critical healthcare', 'Critical Healthcare package has a SenseAware tag', 'When do I remove the Critical Healthcare tracker'],
    cases: [
      ['I have a Critical Healthcare delivery', 'Treat it as a Time Definite delivery with a SenseAware ID.'],
      ['Do I remove the tracker before delivering a Critical Healthcare package', 'No. Keep the SenseAware ID attached until the package is delivered.'],
      ['Do Critical Healthcare packages use SenseAware', 'Yes. The documented Critical Healthcare workflow uses a SenseAware ID and Time Definite prompts.'],
      ['What do I do with the Critical Healthcare SenseAware ID after delivery', 'Remove it before handing over the delivered package, then return it to station personnel.']
    ]
  },
  'KNO-FORGE-BULK-001': {
    sources: ['SRC-GDRIVE-FILE-0008'],
    status: 'VERIFIED',
    authoritative_rule: 'A bulk-manifest barcode may represent multiple physical packages. For a bulk delivery, use Package Information to verify the represented package count. For a bulk pickup, verify the actual physical count before accepting the displayed bulk count. Feature availability depends on the FORGE vehicle type.',
    required_procedure: [
      { step: 1, action: 'Confirm whether this is a bulk delivery or bulk pickup and verify the FORGE vehicle type.' },
      { step: 2, action: 'For bulk delivery, scan the bulk barcode and verify the represented physical-package count in Package Information.' },
      { step: 3, action: 'For bulk pickup, verify the actual physical count before accepting or editing the displayed bulk count.' },
      { step: 4, action: 'Stop before close if the count, manifest, address, date, or vehicle classification does not match.' }
    ],
    required_documentation: ['Bulk barcode or pickup record', 'Represented physical-package count', 'Applicable stop close'],
    prohibited_actions: ['Do not treat one bulk barcode as one physical package', 'Do not accept or edit a bulk count without verifying the physical count', 'Do not force a bulk workflow under the wrong vehicle classification'],
    escalation_requirements: ['Contact management or station personnel for a count, manifest, address, date, or vehicle-classification mismatch.'],
    clarification_requirements: [],
    related_knowledge_ids: [],
    concise_ready_route_answer: 'One bulk barcode can represent many physical packages. Verify the represented count in Package Information for delivery or verify the actual count before accepting a bulk pickup count. Do not treat one scan as one package.',
    more_info_answer: 'FORGE bulk-pickup availability depends on the selected vehicle type. Stop before close when the count, manifest, address, date, or vehicle classification does not match.',
    variants: ['What is a bulk barcode', 'One barcode represents a whole bulk delivery', 'How do I verify a bulk pickup count', 'FORGE shows one scan for many packages'],
    cases: [
      ['Does one bulk barcode mean there is only one package', 'No. One bulk barcode can represent many physical packages.'],
      ['Where do I see how many packages a bulk delivery barcode represents', 'Open Package Information and verify the represented physical-package count.'],
      ['Can I accept the displayed bulk pickup count without counting', 'No. Verify the actual physical-package count before accepting it.'],
      ['Why is Bulk Pickup not available in FORGE', 'Bulk Pickup availability depends on the vehicle type selected in FORGE.']
    ]
  },
  'KNO-DEL-REFUSED-001': {
    sources: ['SRC-GDRIVE-FILE-0014'],
    status: 'VERIFIED',
    authoritative_rule: 'Use Code 006 when a present recipient explicitly refuses an ordinary delivery package. This does not apply merely because the recipient is absent. ASR ID refusal, call-tag refusal, and COD payment refusal follow separate procedures. The reviewed source does not establish the complete ordinary post-code disposition.',
    required_procedure: [
      { step: 1, action: 'Confirm the recipient is present and explicitly refuses an ordinary delivery package.' },
      { step: 2, action: 'Use Code 006.' },
      { step: 3, action: 'Obtain current station or management direction for the ordinary post-code documentation and final disposition.' }
    ],
    required_documentation: ['Code 006'],
    prohibited_actions: ['Do not use Code 006 merely because the recipient is absent', 'Do not substitute the call-tag Code 081 branch', 'Do not generalize ASR, call-tag, or COD refusal handling to an ordinary refusal'],
    escalation_requirements: ['Obtain current station or management direction for the post-code documentation and final disposition.'],
    clarification_requirements: ['Is this an ordinary delivery, ASR or ID refusal, call tag, or COD payment refusal?'],
    concise_ready_route_answer: 'Use Code 006 when a present recipient explicitly refuses an ordinary delivery package. Get current station or management direction for the remaining documentation and final disposition.',
    more_info_answer: 'Not-in is not refusal. ASR ID refusal, call-tag refusal, and COD payment refusal have separate procedures and must not be treated as the ordinary Code 006 branch.',
    variants: ['Customer refused an ordinary delivery', 'What code when recipient refuses package', 'Recipient says they will not accept the package', 'Is nobody home a refused package'],
    cases: [
      ['The recipient is here and refuses this ordinary delivery', 'Use Code 006 for an ordinary delivery package the present recipient explicitly refuses.'],
      ['What code is an ordinary package refused by the recipient', 'Use Code 006.'],
      ['Nobody is home. Is that Code 006 refused', 'No. Do not use Code 006 merely because the recipient is absent.'],
      ['The customer refuses to accept this regular package', 'Use Code 006 for the ordinary recipient refusal.']
    ]
  },
  'KNO-FORGE-EDIT-ADDRESS-001': {
    sources: ['SRC-GDRIVE-FILE-0008', 'SRC-GDRIVE-FILE-0014'],
    status: 'VERIFIED',
    authoritative_rule: 'Use the branch that matches the problem. For a ZIP entered incorrectly after scanning, use Edit Address and ReEnter. When the label address is wrong but the correct recipient address has already been established, FORGE provides Stop Details, Stop Options, Edit Address, enter the correct address, ACCEPT, and verify the update. If the recipient is not at the label address, including a moved recipient, use Code 002 and return the package to the station.',
    required_procedure: [
      { step: 1, action: 'Determine whether this is an entered-ZIP mistake, an incorrect label with the correct recipient address already established, or a recipient not at the label address.' },
      { step: 2, action: 'For an entered-ZIP mistake, open Edit Address and choose ReEnter.' },
      { step: 3, action: 'For an established correct address, use Stop Details, Stop Options, Edit Address, enter the correct address, tap ACCEPT, and verify the updated Stop Details.' },
      { step: 4, action: 'If the recipient is not at the label address, use Code 002 and return the package to the station.' }
    ],
    required_documentation: ['For an undelivered package, the required package notation matching the scan'],
    prohibited_actions: ['Do not invent or guess a different recipient address', 'Do not treat an entered-ZIP correction and a moved recipient as the same branch'],
    escalation_requirements: ['If the correct recipient address has not already been established, stop and obtain current station or management direction before changing the delivery point.'],
    clarification_requirements: ['Was the ZIP entered incorrectly, is the correct recipient address already established, or is the recipient not at the label address?'],
    concise_ready_route_answer: 'Use Edit Address > ReEnter for a ZIP entered incorrectly after scanning. If the correct recipient address is already established, edit it through Stop Details and verify the update. If the recipient is not at the label address, use Code 002 and return the package to the station.',
    more_info_answer: 'Do not guess a new address. The FORGE example begins after the correct recipient address has already been established; the reviewed source does not define how to establish it.',
    variants: ['I entered the wrong ZIP after scanning', 'How do I edit an established correct address in FORGE', 'The recipient moved from the label address', 'Can I guess a corrected delivery address'],
    cases: [
      ['I typed the wrong ZIP after scanning the package', 'Use Edit Address, then choose ReEnter to correct the ZIP.'],
      ['The correct recipient address is already established. How do I edit it in FORGE', 'Open Stop Details, choose Stop Options and Edit Address, enter the correct address, tap ACCEPT, and verify the update.'],
      ['The recipient moved and is not at the label address', 'Use Code 002 and return the package to the station.'],
      ['The label address looks wrong but I do not know the correct address', 'Do not guess or change the delivery point. Contact station or management for direction.']
    ]
  },
  'KNO-FORGE-UNMANIFESTED-DELIVERY-001': {
    sources: ['SRC-GDRIVE-FILE-0008'],
    status: 'VERIFIED',
    authoritative_rule: 'When station or management has established that an unmanifested package belongs in the driver\'s work and the shipping label establishes the address, FORGE allows the package to be scanned, classified as Delivery, and entered as a new stop with the actual business or residential type. The screen does not itself authorize reassignment or a different address.',
    applicability: ['Package is not on the current electronic manifest', 'Station or management has established the delivery assignment', 'The shipping label establishes the delivery address'],
    conditions: ['The package does not belong to another route or work area', 'The actual business or residential stop type is known'],
    exceptions: ['A wrong label address or another-route package follows its separate procedure.'],
    required_procedure: [
      { step: 1, action: 'Confirm station or management has assigned the package and the shipping label establishes the delivery address.' },
      { step: 2, action: 'Scan the package and select Delivery.' },
      { step: 3, action: 'Enter the label-supported stop details and choose the actual business or residential type.' },
      { step: 4, action: 'Follow the package\'s applicable delivery procedure.' }
    ],
    required_documentation: ['Package scan', 'Assigned delivery stop', 'Label-supported address', 'Actual stop type', 'Final delivery or exception outcome'],
    prohibited_actions: ['Do not invent or substitute an address', 'Do not treat Enter Stop Details as permission to self-assign a package', 'Do not use this workflow for a package belonging to another route or work area'],
    escalation_requirements: ['Contact management or station personnel when assignment, address, or work area is uncertain.'],
    clarification_requirements: ['Has station or management assigned the package, and does its label establish the address?'],
    related_knowledge_ids: ['KNO-FORGE-EDIT-ADDRESS-001', 'KNO-PUP-WRONG-WA-001'],
    concise_ready_route_answer: 'If station or management assigned the unmanifested package and its label establishes the address, scan it, select Delivery, enter the label-supported stop details, and choose the actual business or residential type. Do not self-assign it or invent an address.',
    more_info_answer: 'The FORGE guide demonstrates adding a station-found package. The Enter Stop Details screen is a workflow, not authorization to reassign a package or change its destination.',
    variants: ['How do I add an authorized unmanifested delivery', 'Station gave me a package not on my manifest', 'Can I self-assign an unmanifested package', 'Package not on route but manager assigned it'],
    cases: [
      ['Station assigned me a package that is not on my manifest and the label has the address', 'Scan it, select Delivery, enter the label-supported stop details, and choose the actual business or residential type.'],
      ['Does the Enter Stop Details screen authorize me to take an unmanifested package', 'No. The screen does not authorize you to self-assign the package.'],
      ['Can I make up an address for a package not on my manifest', 'No. Never invent or substitute a delivery address.'],
      ['The unmanifested package belongs to another route', 'Do not use the new-stop workflow to self-assign another route\'s package. Contact station or management.']
    ]
  }
};

function readJsonLines(file) {
  return fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
}

function writeJsonLines(file, rows) {
  fs.writeFileSync(file, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
}

function archiveJsonLines(file) {
  return execFileSync('git', ['show', `${ARCHIVE}:${file}`], { cwd: ROOT, encoding: 'utf8' })
    .trim().split('\n').filter(Boolean).map(JSON.parse);
}

function mappedEvidence(record, allowed) {
  return (record.evidence || []).filter((item) => allowed.includes(item.source_id)).map((item) => ({
    ...item,
    source_id: sourceMap.get(item.source_id),
    locator: item.locator.replace(/^OP-117(?: v2)? /, 'OP-117 v2 '),
    reviewed_at: '2026-08-15'
  }));
}

function migrateRecords() {
  const current = readJsonLines(RECORDS);
  const replacing = new Set(Object.keys(configs));
  const retained = current.filter((item) => !replacing.has(item.knowledge_id));
  const archived = new Map(archiveJsonLines('research/fedex-ground-driver-knowledge/knowledge/records.jsonl').map((item) => [item.knowledge_id, item]));
  const additions = [];
  for (const [knowledgeId, config] of Object.entries(configs)) {
    const source = archived.get(knowledgeId);
    if (!source) throw new Error(`Missing archived record ${knowledgeId}`);
    const { sources, status, variants, cases, ...overrides } = config;
    const evidence = mappedEvidence(source, sources);
    if (!evidence.length) throw new Error(`No current evidence remains for ${knowledgeId}`);
    additions.push({
      ...source,
      ...overrides,
      version: 1,
      knowledge_status: status,
      driver_question_variants: variants,
      evidence,
      source_date_or_version: [...new Set(evidence.map((item) => item.source_id === 'SRC-V2-FORGE-PD300-20250401'
        ? 'FORGE P&D Application Guide 3.00 / FORGE 2.8.0, 2025-04-01'
        : 'OP-117 v2, 2025-12-15'))].join('; '),
      review_notes: `Batch 14 exact review narrowed this record to only the reintroduced evidence listed here. Unsupported authority, payment, custody, and final-disposition claims remain excluded.`,
      created_at: '2026-08-15',
      updated_at: '2026-08-15'
    });
  }
  writeJsonLines(RECORDS, [...retained, ...additions]);
  return additions;
}

function migrateCases() {
  const current = readJsonLines(CASES);
  const retained = current.filter((item) => item.case_type !== 'BATCH14_CONTROLLED_RECOVERY');
  const additions = [];
  let index = 1;
  for (const [knowledgeId, config] of Object.entries(configs)) {
    for (const [utterance, directAnswer] of config.cases) {
      additions.push({
        case_id: `B14-${String(index).padStart(3, '0')}`,
        utterance,
        semantic_variations: [`Please help: ${utterance}`, utterance.toLowerCase().replace(/[?.]/g, '')],
        expected_knowledge_ids: [knowledgeId],
        must_clarify: [],
        must_not_do: ['select an unrelated operational record'],
        case_type: 'BATCH14_CONTROLLED_RECOVERY',
        information_sufficiency: 'SUFFICIENT',
        response_mode: 'DIRECT_SOURCE_GROUNDED_ANSWER',
        answer_override: {
          direct_answer: directAnswer,
          steps: config.required_procedure.slice(0, 4).map((item) => item.action),
          watch_for: config.prohibited_actions[0]
        }
      });
      index += 1;
    }
  }
  additions.push({
    case_id: `B14-${String(index).padStart(3, '0')}`,
    utterance: 'The customer refuses a COD package',
    semantic_variations: ['The recipient will not accept this COD delivery', 'COD customer refuses payment or package'],
    expected_knowledge_ids: ['KNO-DEL-REFUSED-001'],
    must_clarify: [],
    must_not_do: ['apply the ordinary-refusal procedure', 'invent a COD refusal procedure'],
    case_type: 'BATCH14_CONTROLLED_RECOVERY',
    information_sufficiency: 'INSUFFICIENT',
    response_mode: 'ESCALATE_NO_ANSWER'
  });
  writeJsonLines(CASES, [...retained, ...additions]);
  return additions;
}

function migrateConversations() {
  const current = readJsonLines(CONVERSATIONS);
  const retained = current.filter((item) => !item.scenario_id.startsWith('CONV-B14-'));
  const additions = [
    { scenario_id: 'CONV-B14-COD-001', description: 'A COD follow-up remains package-specific.', turns: [{ input: 'I have three COD packages at one stop', expected_mode: 'ANSWER', expected_knowledge_id: 'KNO-DEL-COD-MULTI-001' }, { input: 'One amount was prefilled', expected_mode: 'ANSWER', expected_knowledge_id: 'KNO-DEL-COD-MULTI-001' }] },
    { scenario_id: 'CONV-B14-CRITICAL-001', description: 'Critical Healthcare retains the SenseAware handoff sequence.', turns: [{ input: 'I have a Critical Healthcare delivery', expected_mode: 'ANSWER', expected_knowledge_id: 'KNO-DEL-CRITICAL-HEALTH-001' }, { input: 'It is delivered now what do I do with the tracker', expected_mode: 'ANSWER', expected_knowledge_id: 'KNO-DEL-CRITICAL-HEALTH-001' }] },
    { scenario_id: 'CONV-B14-BULK-001', description: 'A bulk count follow-up retains the represented-package distinction.', turns: [{ input: 'One barcode represents my bulk delivery', expected_mode: 'ANSWER', expected_knowledge_id: 'KNO-FORGE-BULK-001' }, { input: 'Where do I see the physical count', expected_mode: 'ANSWER', expected_knowledge_id: 'KNO-FORGE-BULK-001' }] },
    { scenario_id: 'CONV-B14-REFUSED-001', description: 'Ordinary refusal resolves to Code 006 without drifting to call tags.', turns: [{ input: 'The customer refuses this package', expected_mode: 'CLARIFY', expected_knowledge_id: 'KNO-DEL-REFUSED-001' }, { input: 'It is an ordinary delivery', expected_mode: 'ANSWER', expected_knowledge_id: 'KNO-DEL-REFUSED-001' }] },
    { scenario_id: 'CONV-B14-ADDRESS-001', description: 'Address editing distinguishes an unknown address from an established correction.', turns: [{ input: 'The label address looks wrong', expected_mode: 'CLARIFY', expected_knowledge_id: 'KNO-FORGE-EDIT-ADDRESS-001' }, { input: 'I do not know the correct address', expected_mode: 'ANSWER', expected_knowledge_id: 'KNO-FORGE-EDIT-ADDRESS-001' }] },
    { scenario_id: 'CONV-B14-UNMANIFESTED-001', description: 'An authorized unmanifested package retains assignment and label facts.', turns: [{ input: 'Station assigned me a package that is not on my manifest', expected_mode: 'CLARIFY', expected_knowledge_id: 'KNO-FORGE-UNMANIFESTED-DELIVERY-001' }, { input: 'The shipping label establishes the address', expected_mode: 'ANSWER', expected_knowledge_id: 'KNO-FORGE-UNMANIFESTED-DELIVERY-001' }] }
  ];
  writeJsonLines(CONVERSATIONS, [...retained, ...additions]);
  return additions;
}

function migrateCapture(additions) {
  const text = fs.readFileSync(CAPTURE, 'utf8').trimEnd();
  const replacing = new Set(additions.map((item) => item.knowledge_id));
  const rows = text.split('\n').filter((line, index) => index === 0 || !replacing.has(line.split(',')[0]));
  for (const record of additions) {
    const ids = [...new Set(record.evidence.map((item) => item.source_id))].join(';');
    rows.push(`${record.knowledge_id},VERIFIED,${ids},${ids},,${ids},,,DURABLE_ORIGINALS_WITH_VISUAL_PAGE_REVIEW,CAPTURE_COMPLETE_LOCAL_ORIGINALS,,Reopen if later applicable source material changes this procedure.`);
  }
  fs.writeFileSync(CAPTURE, `${rows.join('\n')}\n`);
}

const records = migrateRecords();
const cases = migrateCases();
const conversations = migrateConversations();
migrateCapture(records);
console.log(JSON.stringify({ records_added: records.length, cases_added: cases.length, conversations_added: conversations.length }, null, 2));
