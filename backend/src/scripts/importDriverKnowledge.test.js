const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildImport,
  buildPublicationGateIndex,
  parseCsv,
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
