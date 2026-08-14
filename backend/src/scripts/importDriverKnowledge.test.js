const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  buildImport,
  buildPublicationGateIndex,
  mapReferenceStatus,
  parseCsv,
  readAnswerImageIndex,
  readJsonLines,
  readPngDimensions,
  toCanonicalReferenceRecord,
  validateReferenceRecord,
  validateProductionEligibleRecord
} = require('./importDriverKnowledge');
const {
  buildResearchPublicationGateIndex
} = require('../../../scripts/build-ready-route-knowledge');

function canonicalRecord(overrides = {}) {
  return {
    schema_version: '1.0.0',
    knowledge_id: 'KNO-TEST-001',
    record_version: 3,
    knowledge_status: 'SOURCE_VERIFIED',
    source_research_status: 'VERIFIED',
    canonical_situation: 'Test situation',
    normalized_description: 'A source-verified test situation',
    category_paths: ['TAX-TEST'],
    authoritative_rule: 'Use only canonical source material.',
    concise_driver_answer: 'Follow the canonical step.',
    more_info_answer: 'This is test detail.',
    driver_question_variants: ['what do i do'],
    source_ids: ['SRC-1'],
    source_evidence: [{ source_id: 'SRC-1', locator: 'page 1', evidence_summary: 'Test evidence.' }],
    production_eligibility: {
      status_eligible: true,
      publication_ready: true,
      capture_gate: 'CAPTURE_COMPLETE_OTHER_STATUS_AND_AUTHORITY_GATES_APPLY',
      trace_gate: 'CLAIM_FRAGMENT_TRACE_READY',
      blockers: []
    },
    ...overrides
  };
}

test('production validation requires canonical evidence and a driver-language surface', () => {
  assert.deepEqual(validateProductionEligibleRecord(canonicalRecord()), []);
  assert.deepEqual(
    validateProductionEligibleRecord(canonicalRecord({ source_evidence: [], driver_question_variants: [] })),
    ['source_evidence', 'driver_question_variants']
  );
});

test('published answer images map to canonical knowledge records with private storage metadata', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'readyroute-answer-images-'));
  const imageDir = path.join(fixtureRoot, 'images');
  fs.mkdirSync(imageDir);
  const imageBytes = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(imageBytes);
  imageBytes.writeUInt32BE(1170, 16);
  imageBytes.writeUInt32BE(2532, 20);
  fs.writeFileSync(path.join(imageDir, 'FAQ-FORGE-SETTINGS-P005.png'), imageBytes);
  const bundlePath = path.join(fixtureRoot, 'bundle.json');
  fs.writeFileSync(bundlePath, JSON.stringify({
    bundle_version: '2026-08-13.1',
    records: [{
      trace: { source_record_id: 'KNO-FORGE-CAMERA-SCAN-001' },
      images: [{
        filename: 'FAQ-FORGE-SETTINGS-P005.png',
        caption: 'Use Camera to Scan setting'
      }]
    }]
  }));
  const imageIndex = readAnswerImageIndex(
    bundlePath,
    imageDir
  );
  const cameraImages = imageIndex.imagesByKnowledgeId.get('KNO-FORGE-CAMERA-SCAN-001');

  assert.equal(imageIndex.bundleVersion, '2026-08-13.1');
  assert.equal(imageIndex.imagesByKnowledgeId.size, 1);
  assert.equal(imageIndex.assets.length, 1);
  assert.equal(cameraImages[0].filename, 'FAQ-FORGE-SETTINGS-P005.png');
  assert.equal(cameraImages[0].storage_bucket, 'driver-help-images');
  assert.match(cameraImages[0].storage_path, /^2026-08-13\.1\//);
  assert.ok(cameraImages[0].width > 0);
  assert.ok(cameraImages[0].height > 0);
  assert.match(cameraImages[0].checksum, /^[a-f0-9]{64}$/);

  const payload = buildImport(
    [canonicalRecord({ knowledge_id: 'KNO-FORGE-CAMERA-SCAN-001' })],
    '2026-08-14T00:00:00.000Z',
    [],
    new Map(),
    undefined,
    [],
    [],
    imageIndex.imagesByKnowledgeId
  );
  assert.deepEqual(payload.knowledgeRows[0].images, cameraImages);
});

test('PNG validation rejects non-image bytes', () => {
  assert.throws(() => readPngDimensions(Buffer.from('not a png'), 'bad.png'), /valid PNG/);
});

test('canonical imports preserve stored image mappings when the private bundle is unavailable', () => {
  const payload = buildImport([canonicalRecord()], '2026-08-14T00:00:00.000Z');
  assert.equal(Object.hasOwn(payload.knowledgeRows[0], 'images'), false);
});

test('canonical reference definitions import in a separate namespace with status-aware publication', () => {
  const references = [
    {
      code: '002',
      namespace: 'DELIVERY_STATUS',
      label: 'Incorrect Recipient Address',
      applies_when: 'The label address is incorrect.',
      scope_notes: [],
      source_id: 'SRC-1',
      locator: 'page 36',
      source_version: '2025-12-15',
      knowledge_status: 'VERIFIED'
    },
    {
      code: '15',
      namespace: 'PICKUP_REASON',
      label: 'Residential Pickup, Not Home',
      applies_when: 'A listed residential pickup is attempted and the resident is not home.',
      scope_notes: ['Current OP-321 is required for complete conditions.'],
      source_id: 'SRC-1',
      locator: 'page 52',
      source_version: '2025-12-15',
      knowledge_status: 'HUMAN_REVIEW_REQUIRED'
    }
  ];
  const cases = [{
    utterance: 'what is 002',
    expected_reference_ids: ['DELIVERY_STATUS:002'],
    response_mode: 'ANSWER_REFERENCE_WITH_WORKFLOW_BOUNDARY',
    must_clarify: []
  }];
  const payload = buildImport([], '2026-08-10T00:00:00.000Z', [], new Map(), new Map(), references, cases);

  assert.deepEqual(payload.knowledgeRows.map((row) => row.knowledge_id), [
    'DELIVERY_STATUS:002',
    'PICKUP_REASON:15'
  ]);
  assert.deepEqual(payload.knowledgeRows.map((row) => row.status), ['SOURCE_VERIFIED', 'PENDING_REVIEW']);
  assert.deepEqual(payload.knowledgeRows.map((row) => row.is_published), [true, false]);
  assert.equal(payload.knowledgeRows[0].taxonomy_paths[0], 'REFERENCE/DELIVERY_STATUS');
  assert.match(payload.knowledgeRows[0].prohibited_actions[0], /does not by itself authorize/i);
  assert.equal(payload.knowledgeRows[0].driver_question_patterns[0].utterance, 'what is 002');
  assert.equal(payload.evidenceRows.length, 2);
});

test('the complete canonical reference corpus keeps only verified definitions eligible', () => {
  const root = path.resolve(__dirname, '../../..');
  const references = [
    ...readJsonLines(path.join(root, 'knowledge/reference/delivery-status-codes.jsonl')),
    ...readJsonLines(path.join(root, 'knowledge/reference/pickup-reason-codes.jsonl'))
  ];
  const cases = readJsonLines(path.join(root, 'knowledge/evaluations/reference-language-cases.jsonl'));
  const payload = buildImport([], '2026-08-10T00:00:00.000Z', [], new Map(), new Map(), references, cases);

  assert.equal(payload.knowledgeRows.length, 57);
  assert.equal(payload.knowledgeRows.filter((row) => row.is_published).length, 49);
  assert.equal(mapReferenceStatus('VERIFIED'), 'SOURCE_VERIFIED');
  assert.equal(mapReferenceStatus('HUMAN_REVIEW_REQUIRED'), 'PENDING_REVIEW');
  assert.equal(mapReferenceStatus('POTENTIALLY_OUTDATED'), 'POTENTIALLY_OUTDATED');
  assert.equal(toCanonicalReferenceRecord(references[0]).knowledge_id, 'DELIVERY_STATUS:001');
});

test('malformed and duplicate canonical reference identities fail import closed', () => {
  const malformed = {
    namespace: 'UNKNOWN',
    code: 'x',
    knowledge_status: 'GUESSED'
  };
  assert.deepEqual(validateReferenceRecord(malformed), [
    'namespace',
    'code',
    'label',
    'applies_when',
    'source_id',
    'locator',
    'knowledge_status'
  ]);
  assert.throws(
    () => buildImport([], undefined, [], new Map(), new Map(), [malformed], []),
    /failed validation/
  );
  const valid = {
    code: '002',
    namespace: 'DELIVERY_STATUS',
    label: 'Incorrect Recipient Address',
    applies_when: 'The label address is incorrect.',
    source_id: 'SRC-1',
    locator: 'page 36',
    knowledge_status: 'VERIFIED'
  };
  assert.throws(
    () => buildImport([], undefined, [], new Map(), new Map(), [valid, valid], []),
    /duplicate namespace\/code/
  );
});

test('buildImport publishes both eligible statuses and preserves canonical trace fields', () => {
  const records = [
    canonicalRecord(),
    canonicalRecord({
      knowledge_id: 'KNO-APPROVED-001',
      knowledge_status: 'READY_ROUTE_APPROVED',
      adjudication_id: 'ADJ-001',
      approved_by: 'Ready Route reviewer',
      approval_date: '2026-08-10'
    }),
    canonicalRecord({
      knowledge_id: 'KNO-REVIEW-001',
      knowledge_status: 'PENDING_REVIEW',
      production_eligibility: {
        status_eligible: false,
        publication_ready: false,
        capture_gate: 'CAPTURE_COMPLETE_OTHER_STATUS_AND_AUTHORITY_GATES_APPLY',
        trace_gate: 'CLAIM_FRAGMENT_TRACE_READY',
        blockers: ['KNOWLEDGE_STATUS_PENDING_REVIEW']
      }
    })
  ];
  const payload = buildImport(records, '2026-08-10T00:00:00.000Z');

  assert.deepEqual(payload.knowledgeRows.map((row) => row.is_published), [true, true, false]);
  assert.equal(payload.knowledgeRows[0].version, 3);
  assert.deepEqual(payload.knowledgeRows[0].taxonomy_paths, ['TAX-TEST']);
  assert.deepEqual(payload.knowledgeRows[0].source_ids, ['SRC-1']);
  assert.equal(payload.knowledgeRows[1].adjudication_id, 'ADJ-001');
  assert.equal(payload.sourceRows.length, 1);
  assert.deepEqual(payload.evidenceRows[0], {
    knowledge_id: 'KNO-TEST-001',
    knowledge_version: 3,
    source_id: 'SRC-1',
    locator: 'page 1',
    evidence_note: 'Test evidence.'
  });
});

test('buildImport enriches trace sources from quoted inventory metadata', () => {
  const inventoryRows = parseCsv([
    'source_id,title,source_type,version,local_archive_path',
    'SRC-1,"Guide, Current",PDF,v2,archive/guide.pdf'
  ].join('\n'));
  const headers = inventoryRows.shift();
  const inventory = new Map(inventoryRows.map((values) => {
    const item = Object.fromEntries(headers.map((header, index) => [header, values[index] || '']));
    return [item.source_id, item];
  }));
  const payload = buildImport([canonicalRecord()], '2026-08-10T00:00:00.000Z', [], inventory);

  assert.equal(payload.sourceRows[0].title, 'Guide, Current');
  assert.equal(payload.sourceRows[0].source_type, 'PDF');
  assert.equal(payload.sourceRows[0].source_date_or_version, 'v2');
  assert.equal(payload.sourceRows[0].internal_location, 'archive/guide.pdf');
});

test('canonical publication blockers and status eligibility cannot be bypassed', () => {
  const records = [
    canonicalRecord({ knowledge_id: 'KNO-READY' }),
    canonicalRecord({
      knowledge_id: 'KNO-CAPTURE',
      production_eligibility: {
        status_eligible: true,
        publication_ready: false,
        capture_gate: 'TRANSIENT_SOURCE_RECAPTURE_REQUIRED_FOR_COMPLETE_REPRODUCIBILITY',
        trace_gate: 'CLAIM_FRAGMENT_TRACE_READY',
        blockers: ['TRANSIENT_SOURCE_RECAPTURE_REQUIRED_FOR_COMPLETE_REPRODUCIBILITY']
      }
    }),
    canonicalRecord({
      knowledge_id: 'KNO-OUTDATED',
      knowledge_status: 'POTENTIALLY_OUTDATED',
      production_eligibility: {
        status_eligible: false,
        publication_ready: false,
        capture_gate: 'CAPTURE_COMPLETE_OTHER_STATUS_AND_AUTHORITY_GATES_APPLY',
        trace_gate: 'CLAIM_FRAGMENT_TRACE_READY',
        blockers: []
      }
    })
  ];
  const gates = buildPublicationGateIndex(records);
  const payload = buildImport(records, '2026-08-10T00:00:00.000Z', [], new Map(), gates);

  assert.deepEqual(payload.knowledgeRows.map((row) => row.is_published), [true, false, false]);
  assert.match(payload.knowledgeRows[1].publication_blockers[0], /RECAPTURE/);
  assert.equal(payload.knowledgeRows[2].publication_blockers[0], 'KNOWLEDGE_STATUS_POTENTIALLY_OUTDATED');
});

test('research release generation evaluates research capture and claim gates separately from canonical import', () => {
  const researchRecords = [
    { knowledge_id: 'KNO-READY', knowledge_status: 'VERIFIED' },
    { knowledge_id: 'KNO-CAPTURE', knowledge_status: 'VERIFIED' },
    { knowledge_id: 'KNO-REVIEW', knowledge_status: 'HUMAN_REVIEW_REQUIRED' }
  ];
  const captureRows = [
    { knowledge_id: 'KNO-READY', production_capture_gate: 'CAPTURE_COMPLETE_OTHER_STATUS_AND_AUTHORITY_GATES_APPLY' },
    { knowledge_id: 'KNO-CAPTURE', production_capture_gate: 'ORIGINAL_SOURCE_BYTES_REQUIRED_FOR_BYTE_IDENTITY' },
    { knowledge_id: 'KNO-REVIEW', production_capture_gate: 'CAPTURE_COMPLETE_OTHER_STATUS_AND_AUTHORITY_GATES_APPLY' }
  ];
  const traceClaims = researchRecords.map((record) => ({
    knowledge_id: record.knowledge_id,
    production_trace_gate: 'CLAIM_FRAGMENT_TRACE_READY'
  }));

  const gates = buildResearchPublicationGateIndex(researchRecords, captureRows, traceClaims);

  assert.equal(gates.get('KNO-READY').isPublished, true);
  assert.equal(gates.get('KNO-CAPTURE').isPublished, false);
  assert.deepEqual(gates.get('KNO-CAPTURE').blockers, ['ORIGINAL_SOURCE_BYTES_REQUIRED_FOR_BYTE_IDENTITY']);
  assert.equal(gates.get('KNO-REVIEW').isPublished, false);
  assert.deepEqual(gates.get('KNO-REVIEW').blockers, ['KNOWLEDGE_STATUS_HUMAN_REVIEW_REQUIRED']);
});
