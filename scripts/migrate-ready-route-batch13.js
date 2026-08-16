#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const RECORDS = path.join(ROOT, 'research/fedex-ground-driver-knowledge/knowledge/records.jsonl');
const CASES = path.join(ROOT, 'research/fedex-ground-driver-knowledge/validation/driver_language_cases.jsonl');
const CAPTURE = path.join(ROOT, 'research/fedex-ground-driver-knowledge/knowledge/evidence_capture_risk_coverage.csv');
const ADJUDICATIONS = path.join(ROOT, 'knowledge/adjudications/records.json');
const ARCHIVE = 'readyroute-answers-dataset-v1-archive-2026-08-15';

const sourceMap = new Map([
  ['SRC-GDRIVE-FILE-0014', 'SRC-V2-OP117-20251215'],
  ['SRC-GDRIVE-FILE-0001', 'SRC-V2-MGB119-20251106'],
  ['SRC-GDRIVE-FILE-0008', 'SRC-V2-FORGE-PD300-20250401']
]);

const configs = {
  'KNO-DEL-LOCKER-FAIL-001': {
    sources: ['SRC-GDRIVE-FILE-0014'],
    variants: ['Locker is full what do I do', 'Package does not fit in the locker', 'I put the package in the wrong locker', 'Can I leave it beside a broken locker'],
    cases: ['The apartment locker is full', 'The package will not fit in the third-party locker', 'I accidentally put the package in the wrong locker']
  },
  'KNO-DEL-MISDELIVERY-RECOVERY-001': {
    sources: ['SRC-GDRIVE-FILE-0008'],
    authoritative_rule: 'Use the FORGE misdelivery-pickup workflow to record a recovered package with Code 17. If the recovered package is successfully delivered to the correct address on the same day, complete the redelivery with Code 18. Handle each recovered package according to its actual result.',
    required_procedure: [
      { step: 1, action: 'Confirm the package was misdelivered and has been physically recovered.' },
      { step: 2, action: 'Use the misdelivery-pickup workflow and apply Code 17 to the recovered package.' },
      { step: 3, action: 'Establish the correct address before attempting redelivery.' },
      { step: 4, action: 'If delivery to the correct address succeeds the same day, complete the redelivery with Code 18.' }
    ],
    required_documentation: ['Code 17 for the recovered package', 'Correct delivery address', 'Code 18 for a successful same-day redelivery'],
    prohibited_actions: ['Do not redeliver until the correct address is established', 'Do not apply Code 18 unless the same-day redelivery succeeds', 'Do not give every recovered package the same outcome when their results differ'],
    escalation_requirements: ['Contact station or service-provider management when the correct address or final disposition cannot be established.'],
    concise_ready_route_answer: 'Use Code 17 when you recover a misdelivered package. If you successfully deliver it to the correct address the same day, use Code 18. Confirm the correct address first and handle each package by its actual result.',
    more_info_answer: 'The preserved FORGE guide verifies the recovery and successful same-day-redelivery sequence. This record does not guess the final status when redelivery is unsuccessful.',
    variants: ['I recovered a package I misdelivered', 'What code for a recovered misdelivery', 'I can redeliver the misdelivered package today', 'Some recovered packages were redelivered'],
    cases: ['I recovered a package from the wrong house', 'What code do I use when I pick up my misdelivery', 'I recovered it and can deliver it to the correct address today']
  },
  'KNO-DEL-PLACEMENT-HAZARD-001': {
    sources: ['SRC-GDRIVE-FILE-0001', 'SRC-GDRIVE-FILE-0014'],
    canonical_situation: 'Selecting a secure residential driver-release location',
    normalized_description: 'An otherwise releasable residential package needs a secure, weather-protected placement that follows customer instructions and does not create a mailbox violation.',
    authoritative_rule: 'For an eligible residential driver release, follow reasonable customer instructions and place the package in a secure location protected from weather and out of public view. Do not place a package in, on, or around a mailbox. Use the separate no-safe-place record when no qualifying release location exists.',
    applicability: ['Residential package is otherwise eligible for driver release', 'A secure delivery location must be selected'],
    conditions: ['The package service and customer instructions permit driver release', 'The selected location is secure and weather-protected'],
    exceptions: ['Signature-required, Hazmat, and other non-release packages follow their separate procedure.', '[OUT_OF_CORPUS] package inside customer garage'],
    required_procedure: [
      { step: 1, action: 'Confirm the package is eligible for residential driver release and review the customer instructions.' },
      { step: 2, action: 'Select a secure location protected from weather and out of public view.' },
      { step: 3, action: 'Record the actual placement and complete the required proof-of-delivery photo.' },
      { step: 4, action: 'If no qualifying location exists, stop and use the separate no-safe-place procedure.' }
    ],
    required_documentation: ['Actual release location and required delivery photo'],
    prohibited_actions: ['Do not place a package in, on, or around a mailbox', 'Do not treat this record as permission to enter a customer\'s garage', 'Do not force driver release when no safe location exists', 'Do not ignore a reasonable customer delivery instruction'],
    escalation_requirements: [],
    clarification_requirements: ['Is the package eligible for driver release?'],
    related_knowledge_ids: ['KNO-DEL-SAFEPLACE-001', 'KNO-DEL-PPOD-001', 'KNO-DEL-DOORTAG-001'],
    concise_ready_route_answer: 'For an eligible residential release, follow the customer instructions and use a secure, weather-protected location out of public view. Never place a package in, on, or around a mailbox. If no qualifying location exists, use the separate no-safe-place procedure.',
    more_info_answer: 'The preserved sources support general secure placement. Specific garage-door, ramp, driveway, and large-package rules remain outside this narrowed record until their original sources are reintroduced.',
    variants: ['Where should I place an eligible residential package', 'How do I choose a secure release location', 'Can I put the package by the mailbox', 'Should I protect the package from weather'],
    cases: ['Where should I place an eligible residential package', 'How do I choose a secure weather-protected delivery location', 'Can I place the package next to the mailbox']
  },
  'KNO-DEL-SCAN-INTEGRITY-001': {
    sources: ['SRC-GDRIVE-FILE-0014', 'SRC-GDRIVE-FILE-0001'],
    variants: ['Can I prescan my deliveries in the van', 'Where should I scan a delivery', 'Do I scan every delivery attempt', 'No attempt happened what should I scan'],
    cases: ['Can I scan the packages in my truck before walking to the door', 'Do I have to scan every delivery attempt', 'Where should I scan a completed delivery']
  },
  'KNO-SEC-ROUTE-001': {
    sources: ['SRC-GDRIVE-FILE-0014', 'SRC-GDRIVE-FILE-0001'],
    related_knowledge_ids: ['KNO-SEC-ACTIVE-THREAT-001', 'KNO-SEC-INCIDENT-REPORT-001'],
    variants: ['Do I lock the truck between stops', 'Can I leave the keys in the delivery vehicle', 'How do I secure packages on route', 'Someone is threatening me at my truck'],
    cases: ['Do I need to lock the bulkhead door between stops', 'Can I leave my keys in the vehicle while I make a delivery', 'Someone is threatening me and trying to take packages']
  },
  'KNO-HAZ-ACCEPTANCE-001': {
    sources: ['SRC-GDRIVE-FILE-0014'],
    variants: ['Can I pick up this Hazmat package', 'Hazmat package is missing paperwork', 'What do I check before accepting dangerous goods', 'The shipper has a damaged Hazmat box'],
    cases: ['What do I check before accepting a Hazmat pickup', 'The Hazmat package is missing required shipping papers', 'The shipper asks me to take an improperly prepared Hazmat package']
  },
  'KNO-HAZ-LEAK-001': {
    sources: ['SRC-GDRIVE-FILE-0014'],
    variants: ['Hazmat is leaking in my truck', 'Damaged dangerous goods package on route', 'Can I keep driving with a leaking chemical package', 'A hazardous package is unsafe to handle'],
    cases: ['A Hazmat package is leaking in my truck', 'Can I continue my route with a damaged dangerous-goods package', 'Should I deliver a leaking hazardous package']
  },
  'KNO-HAZ-LOAD-PAPERS-001': {
    sources: ['SRC-GDRIVE-FILE-0014'],
    variants: ['Where do I load Hazmat packages', 'Where must I keep the Hazmat paperwork', 'How do I secure dangerous goods in the truck', 'What do I do with OP-900 after delivery'],
    cases: ['How should I load accepted Hazmat packages', 'Where do I keep the Hazmat papers while driving', 'What do I do with the Hazmat paperwork as packages leave the vehicle']
  },
  'KNO-HAZ-MANIFEST-001': {
    sources: ['SRC-GDRIVE-FILE-0014'],
    variants: ['What do I do with the Hazmat manifest', 'Hazmat manifest is missing', 'Do I cross off delivered Hazmat packages', 'Transferred Hazmat package paperwork'],
    cases: ['What do I do with my Hazmat manifest during deliveries', 'The Hazmat manifest is unavailable', 'Do I cross a Hazmat package off the manifest after delivery']
  },
  'KNO-HAZ-RADIOACTIVE-WET-001': {
    sources: ['SRC-GDRIVE-FILE-0014'],
    variants: ['Can I pick up Radioactive Yellow III', 'Dangerous When Wet pickup', 'Normal pickup for Division 4.3', 'Radioactive package needs special pickup'],
    cases: ['Can I accept a Radioactive Yellow III package on my normal pickup', 'The customer has a Dangerous When Wet package', 'How do I arrange pickup for a placard-required Radioactive package']
  },
  'KNO-INC-ACCIDENT-REPORT-001': {
    sources: ['SRC-GDRIVE-FILE-0014'],
    related_knowledge_ids: [],
    concise_ready_route_answer: 'Handle immediate safety first and call emergency personnel or law enforcement when necessary. Notify management and report the accident or covered incident to FedEx as soon as possible, complete OP-130, and preserve all related video and electronic evidence.',
    more_info_answer: 'Pedestrian or vehicle-occupant incidents must be reported regardless of apparent injury or fault. Provide preserved information through the required channel when requested.',
    variants: ['I had an accident on route', 'Minor crash nobody looks hurt', 'I hit property with the truck', 'Do I save camera footage after an accident'],
    cases: ['I had a minor accident and nobody appears injured', 'I hit a customer property with the delivery vehicle', 'Do I need to preserve camera footage after an accident']
  },
  'KNO-SEC-INCIDENT-REPORT-001': {
    sources: ['SRC-GDRIVE-FILE-0014'],
    related_knowledge_ids: ['KNO-SEC-ROUTE-001', 'KNO-SEC-ACTIVE-THREAT-001'],
    variants: ['How do I report a robbery', 'Packages were stolen from my truck', 'Customer threatened me with violence', 'What is the security incident reporting process'],
    cases: ['Packages were stolen during a vehicle burglary', 'A customer threatened me with violence', 'How do I report a robbery on route']
  },
  'KNO-COMMS-MEDIA-001': {
    sources: ['SRC-GDRIVE-FILE-0014'],
    canonical_situation: 'Making an unauthorized photo, video, or audio recording on FedEx premises',
    normalized_description: 'A driver or other person wants to record on FedEx premises without authorization.',
    authoritative_rule: 'Unauthorized photography, video recording, and audio recording are prohibited on FedEx premises.',
    applicability: ['A photo, video, or audio recording would be made on FedEx premises'],
    conditions: ['Authorization must be established before recording.'],
    exceptions: ['An authorized recording follows the applicable FedEx authorization.'],
    required_procedure: [{ step: 1, action: 'Do not make a photo, video, or audio recording on FedEx premises without authorization.' }, { step: 2, action: 'Ask FedEx station staff or management if authorization or a response is required.' }],
    required_documentation: [],
    prohibited_actions: ['Do not make unauthorized photos, video, or audio recordings on FedEx premises', 'Do not assume that a public or personal purpose creates authorization'],
    escalation_requirements: ['FedEx station staff or management for authorization or media-response questions.'],
    clarification_requirements: ['Is the recording on FedEx premises?', 'Has FedEx authorized it?'],
    related_knowledge_ids: [],
    concise_ready_route_answer: 'Do not take unauthorized photos, video, or audio recordings on FedEx premises. If someone requests a recording or public response, direct the request to FedEx station staff or management.',
    more_info_answer: 'The preserved OP-117 page verifies the recording prohibition. Broader public-comment and brand-use rules remain outside this narrowed record until their original source is reintroduced.',
    variants: ['Can I record video inside the FedEx station', 'Can I take pictures in the FedEx yard', 'Reporter wants me to record at the station', 'Are audio recordings allowed on FedEx property'],
    cases: ['Can I record a video inside the FedEx station', 'Can I take photos in the secured FedEx yard', 'A reporter asked me to record something on FedEx property']
  },
  'KNO-DOC-HANDSHEET-001': {
    sources: ['SRC-GDRIVE-FILE-0014'],
    related_knowledge_ids: ['KNO-DEL-HAL-DELIVERY-001', 'KNO-PUP-SCANNER-FAIL-001', 'KNO-HAZ-MANIFEST-001'],
    variants: ['What is the Blue Sheet', 'Which hand sheet do I use for HAL when scanner is down', 'What are OP-207 and OP-207Res', 'How do I complete a hand sheet'],
    cases: ['What is the Blue Sheet', 'My scanner is down and I have a HAL package', 'Can you give me every field for completing OP-207']
  },
  'KNO-FORGE-BUSINESS-CLOSURE-MSG-001': {
    sources: ['SRC-GDRIVE-FILE-0008'],
    authoritative_rule: 'The FORGE Business Closure message records a recurring day, single date, or date range for delivery, pickup, or both at a selected business address. It reports closure information; it does not by itself determine the status or disposition of an already assigned stop.',
    required_procedure: [{ step: 1, action: 'Open the Business Closure message and select the business address.' }, { step: 2, action: 'Choose Recurring Day, Single Date, or Date Range and enter the applicable closure information.' }, { step: 3, action: 'Select Delivery, Pickup, or both as applicable.' }, { step: 4, action: 'Send the closure message through the supported FORGE workflow.' }],
    required_documentation: ['Business address', 'Closure day/date or range', 'Delivery, pickup, or both'],
    prohibited_actions: ['Do not use a closure message as a substitute for the truthful status and disposition of an already assigned stop', 'Do not guess the closure dates or service scope'],
    escalation_requirements: [],
    concise_ready_route_answer: 'Use the FORGE Business Closure message: select the business address, enter a recurring day, single date, or date range, choose Delivery, Pickup, or both, and send it. This reports the closure; it does not replace the correct status for an assigned stop.',
    more_info_answer: 'Use the separate delivery or pickup record to determine the truthful code and stop disposition.',
    variants: ['How do I report a business closure in FORGE', 'Business will be closed next week', 'Where is the Business Closure message', 'Does a closure message code my assigned stop'],
    cases: ['How do I report a business closure in FORGE', 'The business will be closed every Monday', 'Does sending a Business Closure message close my assigned delivery stop']
  },
  'KNO-CX-APPEARANCE-001': {
    sources: ['SRC-GDRIVE-FILE-0014'],
    canonical_situation: 'Beginning service without required FedEx identification',
    normalized_description: 'A driver is preparing to enter a facility or provide service without a valid, visibly displayed FedEx ID badge.',
    authoritative_rule: 'Service-provider personnel must visibly display a valid FedEx ID badge while providing service and need a valid badge for facility entry. Never use another person\'s badge. A forgotten, lost, or replaced badge follows the separate badge procedure.',
    applicability: ['Preparing to enter a FedEx facility', 'Providing service without a valid visibly displayed FedEx ID badge'],
    conditions: ['The badge must be valid and belong to the person using it.'],
    exceptions: [],
    required_procedure: [{ step: 1, action: 'Wear and visibly display your valid FedEx ID badge while providing service.' }, { step: 2, action: 'Use only your own badge for facility entry.' }, { step: 3, action: 'If the badge is forgotten, lost, or replaced, follow the temporary or replacement badge procedure before continuing.' }],
    required_documentation: ['Valid FedEx ID badge or approved temporary/replacement badge'],
    prohibited_actions: ['Do not use another person\'s badge', 'Do not enter or provide service without the required valid identification'],
    escalation_requirements: ['Station or service-provider management for the temporary or replacement badge process.'],
    clarification_requirements: ['Is the badge forgotten, lost, or found after a replacement was issued?'],
    related_knowledge_ids: ['KNO-SEC-LOST-BADGE-001'],
    concise_ready_route_answer: 'Wear and visibly display your own valid FedEx ID badge while providing service. Never use someone else\'s badge. If yours is forgotten or lost, complete the temporary or replacement badge process before continuing.',
    more_info_answer: 'This narrowed record covers the current OP-117 identification requirement. Apparel and Alternative Vehicle vest requirements remain outside it until their original source is reintroduced.',
    variants: ['Can I start my route without my FedEx badge', 'Do I have to display my FedEx ID', 'Can I use another driver badge', 'I do not have valid identification for the station'],
    cases: ['Can I begin my route without displaying my FedEx badge', 'Can I use another driver\'s badge to enter the station', 'Do I have to visibly display my FedEx ID while providing service']
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
  return record.evidence.filter((item) => allowed.includes(item.source_id)).map((item) => ({
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
    const { sources, variants, cases, ...overrides } = config;
    const record = {
      ...source,
      ...overrides,
      version: 1,
      driver_question_variants: variants,
      evidence: mappedEvidence(source, sources),
      source_date_or_version: [...new Set(mappedEvidence(source, sources).map((item) => item.source_id === 'SRC-V2-FORGE-PD300-20250401' ? 'FORGE P&D Application Guide 3.00 / FORGE 2.8.0, 2025-04-01' : item.source_id === 'SRC-V2-MGB119-20251106' ? 'MGB-119 Rev. 11.6.25' : 'OP-117 v2, 2025-12-15'))].join('; '),
      review_notes: `${source.review_notes || ''} Selectively rebuilt for RRA v2 from only the reintroduced source evidence listed on this record.`.trim(),
      created_at: '2026-08-15',
      updated_at: '2026-08-15'
    };
    if (!record.evidence.length) throw new Error(`No current evidence remains for ${knowledgeId}`);
    additions.push(record);
  }
  writeJsonLines(RECORDS, [...retained, ...additions]);
  return additions;
}

function migrateCases() {
  const current = readJsonLines(CASES);
  const retained = current.filter((item) => item.case_type !== 'BATCH13_CONTROLLED_RECOVERY');
  const existing = new Set(retained.map((item) => item.case_id));
  const additions = [];
  let index = 1;
  for (const [knowledgeId, config] of Object.entries(configs)) {
    for (const utterance of config.cases) {
      const caseId = `B13-${String(index).padStart(3, '0')}`;
      index += 1;
      if (existing.has(caseId)) continue;
      additions.push({
        case_id: caseId,
        utterance,
        expected_knowledge_ids: knowledgeId === 'KNO-DEL-SCAN-INTEGRITY-001' && utterance.includes('truck before')
          ? [knowledgeId, 'KNO-DEL-DISPUTE-PREVENTION-001']
          : [knowledgeId],
        must_clarify: [],
        must_not_do: ['select an unrelated operational record'],
        case_type: 'BATCH13_CONTROLLED_RECOVERY',
        information_sufficiency: 'SUFFICIENT',
        response_mode: 'DIRECT_SOURCE_GROUNDED_ANSWER'
      });
    }
  }
  writeJsonLines(CASES, [...retained, ...additions]);
  return additions;
}

function migrateCapture(additions) {
  const text = fs.readFileSync(CAPTURE, 'utf8').trimEnd();
  const existing = new Set(text.split('\n').slice(1).map((line) => line.split(',')[0]));
  const lines = [];
  for (const record of additions) {
    if (existing.has(record.knowledge_id)) continue;
    const ids = [...new Set(record.evidence.map((item) => item.source_id))].join(';');
    lines.push(`${record.knowledge_id},${record.knowledge_status},${ids},${ids},,${ids},,,DURABLE_ORIGINALS_WITH_VISUAL_PAGE_REVIEW,CAPTURE_COMPLETE_LOCAL_ORIGINALS,,Reopen if later applicable source material changes this procedure.`);
  }
  fs.writeFileSync(CAPTURE, `${text}${lines.length ? `\n${lines.join('\n')}` : ''}\n`);
}

function migrateAdjudications() {
  const current = JSON.parse(fs.readFileSync(ADJUDICATIONS, 'utf8'));
  const existing = new Set(current.map((item) => item.knowledge_id));
  const archived = JSON.parse(execFileSync('git', ['show', `${ARCHIVE}:knowledge/adjudications/records.json`], { cwd: ROOT, encoding: 'utf8' }));
  const wanted = new Set(['KNO-HAZ-ACCEPTANCE-001', 'KNO-HAZ-LOAD-PAPERS-001', 'KNO-DOC-HANDSHEET-001']);
  const additions = archived.filter((item) => wanted.has(item.knowledge_id) && !existing.has(item.knowledge_id)).map((item) => ({
    ...item,
    supporting_source_ids: item.supporting_source_ids.map((id) => sourceMap.get(id)).filter(Boolean),
    conflicting_or_superseded_source_ids: (item.conflicting_or_superseded_source_ids || []).map((id) => sourceMap.get(id)).filter(Boolean)
  }));
  fs.writeFileSync(ADJUDICATIONS, `${JSON.stringify([...current, ...additions], null, 2)}\n`);
  return additions;
}

const records = migrateRecords();
const cases = migrateCases();
migrateCapture(records);
const adjudications = migrateAdjudications();
console.log(JSON.stringify({ records_added: records.length, cases_added: cases.length, adjudications_added: adjudications.length }, null, 2));
