const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { buildDriverHelpDecision } = require('./driverHelpRetrieval');
const { buildPublicationGateIndex } = require('../scripts/importDriverKnowledge');
const { toPublishedRecord } = require('../scripts/validateDriverHelpRetrieval');

const ROOT = path.resolve(__dirname, '../../..');

function readJsonLines(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function questions(expectedKnowledgeId, utterances, expectedMode = 'ANSWER') {
  return utterances.map((utterance) => ({ expectedKnowledgeId, expectedMode, utterance }));
}

const CASES = [
  ...questions('KNO-INC-ACCIDENT-SCENE-001', [
    'I was just in a crash. What should I do first?',
    'Just got in a wreck what now',
    'I was involved in a collision',
    'Another car just hit me',
    'I backed into a vehicle what do I do',
    'Accident scene first steps',
    'I hit another truck on route',
    'Crash is blocking the road',
    'Someone hit my truck and nobody looks hurt. What should I do?'
  ]),
  ...questions('KNO-ETH-FALSIFICATION-001', [
    'Can I sign the scanner for the customer?',
    'Customer asked me to sign for them',
    'The recipient said I could sign their name',
    'Can the driver sign for the customer',
    'Could I enter a customer signature myself?',
    'Can I fake the customer signature',
    'Should I forge the recipient signature',
    'Can I save time and sign for the customer?'
  ]),
  ...questions('KNO-DEL-SCAN-INTEGRITY-001', [
    'Can I prescan my route?',
    'Can I pre scan all the packages?',
    'Scan everything at the terminal before leaving?',
    'Can I scan my stops before dispatch',
    'Can I scan the boxes in the van before the stops',
    'Is it okay to scan deliveries ahead of time',
    'Can I scan at the station then deliver them',
    'I already prescanned half my route what now'
  ]),
  ...questions('KNO-HAZ-LEAK-001', [
    'Hazmat package is leaking in my truck',
    'Dangerous goods are spilling in the van',
    'I found a hazmat leak on route',
    'Hazmat box started leaking what do I do',
    'There is a dangerous goods spill in my vehicle',
    'Leaking hazmat package at my stop',
    'The hazmat shipment is spilling',
    'What do I do with a hazmat package that leaks'
  ]),
  ...questions('KNO-SEC-ACTIVE-THREAT-001', [
    'There is an active shooter at the stop',
    'Customer has a gun and is threatening me',
    'Someone is attacking people with a weapon',
    'Armed attacker at the station',
    'Person has a weapon and is attacking',
    'There is a gun threat on my route'
  ]),
  ...questions('KNO-SAF-DOG-ENCOUNTER-001', [
    'Dog bit me',
    'I was bitten by a dog at the stop',
    'Customer dog attacked and wounded me',
    'A dog bite broke my skin',
    'The dog attacked me what now',
    'Bitten by a dog while delivering'
  ]),
  ...questions('KNO-HOS-DUTY-LIMITS-001', [
    'Can I keep driving after 11 hours?',
    'What is my 14 hour driving limit',
    'I am over my hours can I keep driving',
    'What are the hours of service driving limits',
    'HOS says 70 hours can I drive',
    'Can I drive beyond the eleven hour limit',
    'How many hours am I allowed to drive today?'
  ]),
  ...questions(null, [
    'sig pkg nobody home',
    'signature box no one there',
    'signature required and nobody answered',
    'nobody home for a sig package',
    'recipient unavailable for signature package'
  ], 'CLARIFY'),
  ...questions('KNO-DEL-SIG-DSR-001', [
    'DSR package nobody home',
    'Direct signature and nobody answered',
    'No one there for my direct signature package'
  ]),
  ...questions('KNO-DEL-ALCOHOL-001', [
    "Who can sign for this package I think it's alcohol",
    'Alcohol package has no eligible signer at this residential stop',
    'Alcohol package has no eligible signer at this non-residential stop',
    'Alcohol recipient refuses to provide ID',
    'Alcohol valid ID barcode will not scan'
  ]),
  ...questions(null, [
    'Alcohol package has no eligible signer what code'
  ], 'CLARIFY'),
  ...questions('KNO-DEL-SIG-ASR-001', [
    'ASR nobody eligible at residential stop',
    'ASR nobody eligible at business stop'
  ]),
  ...questions('KNO-DEL-SIG-ISR-001', [
    'ISR no approved release path at residential stop',
    'ISR no approved release path at business stop'
  ]),
  ...questions('KNO-DEL-HAZMAT-SIGNATURE-001', [
    'Hazmat business is closed on the weekend'
  ]),
  ...questions('KNO-FORGE-CAMERA-SCAN-001', [
    'Camera scan made the side button stop working',
    'How do I use camera scanning in FORGE',
    'Turned camera scan on and hardware trigger is disabled'
  ]),
  ...questions('KNO-PUP-VEHICLE-CAPACITY-001', [
    'Pickup has more boxes than fit in my truck',
    'All pickup packages will not fit in the van',
    'What if the pickup is too large for my vehicle',
    'My truck is full and I still have a pickup. What should I do?'
  ]),
  ...questions('KNO-COMMS-MEDIA-001', [
    'A reporter is asking me about an accident. Can I talk to them?'
  ])
];

test('critical driver-language reliability gate routes every supported variant correctly', () => {
  assert.equal(CASES.length, 79);
  const canonical = readJsonLines(path.join(ROOT, 'knowledge/operations/records.jsonl'));
  const gates = buildPublicationGateIndex(canonical);
  const records = canonical.map((record) => toPublishedRecord(
    record,
    [],
    [],
    gates.get(record.knowledge_id)?.isPublished === true
  ));

  const failures = [];
  for (const item of CASES) {
    const decision = buildDriverHelpDecision(item.utterance, records);
    const selectedKnowledgeIds = (decision.selected_records || []).map((record) => record.knowledge_id);
    const passed = decision.response_mode === item.expectedMode
      && (!item.expectedKnowledgeId || selectedKnowledgeIds.includes(item.expectedKnowledgeId));
    if (!passed) {
      failures.push({
        utterance: item.utterance,
        expected_mode: item.expectedMode,
        actual_mode: decision.response_mode,
        expected_knowledge_id: item.expectedKnowledgeId,
        selected_knowledge_ids: selectedKnowledgeIds,
        candidates: (decision.candidates || []).slice(0, 3)
      });
    }
  }

  assert.deepEqual(failures, []);
});
