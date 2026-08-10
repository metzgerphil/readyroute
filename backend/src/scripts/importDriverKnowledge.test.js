const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildImport,
  buildPublicationGateIndex,
  parseCsv,
  validateVerifiedRecord
} = require('./importDriverKnowledge');

function verifiedRecord(overrides = {}) {
  return {
    knowledge_id: 'KNO-TEST-001',
    knowledge_status: 'VERIFIED',
    canonical_situation: 'Test situation',
    normalized_description: 'A verified test situation',
    authoritative_rule: 'Use only verified source material.',
    concise_ready_route_answer: 'Follow the verified step.',
    more_info_answer: 'This is test detail.',
    driver_question_variants: ['what do i do'],
    evidence: [{ source_id: 'SRC-1', locator: 'page 1', evidence_summary: 'Test evidence.' }],
    ...overrides
  };
}

test('publication validation requires traceable evidence and a driver-language surface', () => {
  assert.deepEqual(validateVerifiedRecord(verifiedRecord()), []);
  assert.deepEqual(
    validateVerifiedRecord(verifiedRecord({ evidence: [], driver_question_variants: [] })),
    ['evidence', 'driver_question_variants']
  );
});

test('buildImport includes only verified records and preserves evidence mapping', () => {
  const records = [
    verifiedRecord(),
    verifiedRecord({ knowledge_id: 'KNO-REVIEW-001', knowledge_status: 'HUMAN_REVIEW_REQUIRED' })
  ];
  const gates = buildPublicationGateIndex(records, records.map((record) => ({
    knowledge_id: record.knowledge_id,
    production_capture_gate: 'CAPTURE_COMPLETE_OTHER_STATUS_AND_AUTHORITY_GATES_APPLY'
  })), []);
  const payload = buildImport(records, '2026-08-09T00:00:00.000Z', [], new Map(), gates);

  assert.equal(payload.knowledgeRows.length, 2);
  assert.equal(payload.knowledgeRows[0].is_published, true);
  assert.equal(payload.knowledgeRows[0].status, 'VERIFIED');
  assert.equal(payload.knowledgeRows[1].is_published, false);
  assert.equal(payload.sourceRows.length, 1);
  assert.deepEqual(payload.evidenceRows[0], {
    knowledge_id: 'KNO-TEST-001',
    knowledge_version: 1,
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
  const records = [verifiedRecord()];
  const gates = buildPublicationGateIndex(records, [{
    knowledge_id: 'KNO-TEST-001',
    production_capture_gate: 'CAPTURE_COMPLETE_OTHER_STATUS_AND_AUTHORITY_GATES_APPLY'
  }], []);
  const payload = buildImport(records, '2026-08-09T00:00:00.000Z', [], inventory, gates);

  assert.equal(payload.sourceRows[0].title, 'Guide, Current');
  assert.equal(payload.sourceRows[0].source_type, 'PDF');
  assert.equal(payload.sourceRows[0].source_date_or_version, 'v2');
  assert.equal(payload.sourceRows[0].internal_location, 'archive/guide.pdf');
});

test('publication gates withhold verified records with capture or claim trace blockers', () => {
  const records = [
    verifiedRecord({ knowledge_id: 'KNO-READY' }),
    verifiedRecord({ knowledge_id: 'KNO-CAPTURE' }),
    verifiedRecord({ knowledge_id: 'KNO-TRACE' })
  ];
  const gates = buildPublicationGateIndex(records, [
    { knowledge_id: 'KNO-READY', production_capture_gate: 'CAPTURE_COMPLETE_OTHER_STATUS_AND_AUTHORITY_GATES_APPLY' },
    { knowledge_id: 'KNO-CAPTURE', production_capture_gate: 'TRANSIENT_SOURCE_RECAPTURE_REQUIRED_FOR_COMPLETE_REPRODUCIBILITY' },
    { knowledge_id: 'KNO-TRACE', production_capture_gate: 'CAPTURE_COMPLETE_OTHER_STATUS_AND_AUTHORITY_GATES_APPLY' }
  ], [{
    knowledge_id: 'KNO-TRACE',
    production_trace_gate: 'WITHHOLD_EXACT_CLAIM_FRAGMENT_ASSERTION_UNTIL_ALLOCATED'
  }]);

  const payload = buildImport(records, '2026-08-09T00:00:00.000Z', [], new Map(), gates);
  assert.deepEqual(payload.knowledgeRows.map((row) => row.is_published), [true, false, false]);
  assert.match(payload.knowledgeRows[1].publication_blockers[0], /RECAPTURE/);
  assert.match(payload.knowledgeRows[2].publication_blockers[0], /CLAIMS_REQUIRE/);
});
