#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RELEASE = path.join(ROOT, 'knowledge');
const ALLOWED_STATUSES = new Set([
  'SOURCE_VERIFIED',
  'READY_ROUTE_APPROVED',
  'PENDING_REVIEW',
  'POTENTIALLY_OUTDATED',
  'INSUFFICIENT_EVIDENCE'
]);

function readJsonLines(relativePath) {
  const filePath = path.join(RELEASE, relativePath);
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`${relativePath}:${index + 1} invalid JSON: ${error.message}`);
    }
  });
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function main() {
  const errors = [];
  const records = readJsonLines('operations/records.jsonl');
  const publicationReady = readJsonLines('operations/publication-ready.jsonl');
  const publicationGaps = readJsonLines('operations/publication-gaps.jsonl');
  const sources = readJsonLines('sources/registry.jsonl');
  const cases = readJsonLines('evaluations/driver-language-cases.jsonl');
  const referenceCases = readJsonLines('evaluations/reference-language-cases.jsonl');
  const candidateOperationalCases = readJsonLines('evaluations/candidate-operational-language-cases.jsonl');
  const candidateGapCases = readJsonLines('evaluations/candidate-gap-language-cases.jsonl');
  const deliveryStatuses = readJsonLines('reference/delivery-status-codes.jsonl');
  const pickupReasons = readJsonLines('reference/pickup-reason-codes.jsonl');
  const pendingReviewItems = readJsonLines('pending-review/review-items.jsonl');
  const changeLog = readJsonLines('history/change-log.jsonl');
  const manifest = JSON.parse(fs.readFileSync(path.join(RELEASE, 'manifest.json'), 'utf8'));
  const recordIds = new Set();
  const sourceIds = new Set(sources.map((source) => source.source_id));
  const referenceIds = new Set([
    ...deliveryStatuses.map((row) => `DELIVERY_STATUS:${row.code}`),
    ...pickupReasons.map((row) => `PICKUP_REASON:${row.code}`)
  ]);

  for (const record of records) {
    if (recordIds.has(record.knowledge_id)) errors.push(`Duplicate knowledge_id ${record.knowledge_id}`);
    recordIds.add(record.knowledge_id);
    if (!ALLOWED_STATUSES.has(record.knowledge_status)) errors.push(`${record.knowledge_id} invalid status ${record.knowledge_status}`);
    if (!record.canonical_situation || !record.authoritative_rule || !record.concise_driver_answer) errors.push(`${record.knowledge_id} missing canonical content`);
    if (!Array.isArray(record.source_evidence) || !record.source_evidence.length) errors.push(`${record.knowledge_id} has no source evidence`);
    for (const evidence of record.source_evidence || []) {
      if (!sourceIds.has(evidence.source_id)) errors.push(`${record.knowledge_id} references unknown source ${evidence.source_id}`);
      if (!evidence.locator) errors.push(`${record.knowledge_id} has evidence without locator`);
    }
    for (const relatedId of record.related_knowledge_ids || []) {
      if (!records.some((candidate) => candidate.knowledge_id === relatedId)) errors.push(`${record.knowledge_id} references unknown related record ${relatedId}`);
    }
    const eligibleStatus = ['SOURCE_VERIFIED', 'READY_ROUTE_APPROVED'].includes(record.knowledge_status);
    if (record.production_eligibility.status_eligible !== eligibleStatus) errors.push(`${record.knowledge_id} has inconsistent status eligibility`);
    if (record.production_eligibility.publication_ready && !eligibleStatus) errors.push(`${record.knowledge_id} is publication-ready with ineligible status`);
    if (record.knowledge_status === 'READY_ROUTE_APPROVED' && !record.adjudication_id) errors.push(`${record.knowledge_id} approved without adjudication`);
  }

  const publishedIds = new Set(publicationReady.map((record) => record.knowledge_id));
  const expectedPublishedIds = new Set(records.filter((record) => record.production_eligibility.publication_ready).map((record) => record.knowledge_id));
  if (publishedIds.size !== expectedPublishedIds.size || [...publishedIds].some((id) => !expectedPublishedIds.has(id))) {
    errors.push('publication-ready.jsonl does not match record publication gates');
  }
  const expectedGapIds = new Set(records.filter((record) => (
    record.production_eligibility.status_eligible && !record.production_eligibility.publication_ready
  )).map((record) => record.knowledge_id));
  const gapIds = new Set(publicationGaps.map((record) => record.knowledge_id));
  if (gapIds.size !== expectedGapIds.size || [...gapIds].some((id) => !expectedGapIds.has(id))) {
    errors.push('operations/publication-gaps.jsonl does not cover every status-eligible publication gap');
  }

  for (const testCase of cases) {
    for (const knowledgeId of testCase.expected_knowledge_ids || []) {
      if (!recordIds.has(knowledgeId)) errors.push(`${testCase.case_id} references unknown knowledge ${knowledgeId}`);
    }
  }
  const referenceCaseIds = new Set();
  for (const testCase of referenceCases) {
    if (!testCase.case_id || referenceCaseIds.has(testCase.case_id)) {
      errors.push(`Invalid or duplicate reference case ${testCase.case_id || '(missing)'}`);
    }
    referenceCaseIds.add(testCase.case_id);
    for (const referenceId of testCase.expected_reference_ids || []) {
      if (!referenceIds.has(referenceId)) errors.push(`${testCase.case_id} references unknown reference ${referenceId}`);
    }
    for (const knowledgeId of testCase.expected_knowledge_ids || []) {
      if (!recordIds.has(knowledgeId)) errors.push(`${testCase.case_id} references unknown knowledge ${knowledgeId}`);
    }
  }
  const candidateOperationalCaseIds = new Set();
  for (const testCase of candidateOperationalCases) {
    if (!testCase.case_id || candidateOperationalCaseIds.has(testCase.case_id)) {
      errors.push(`Invalid or duplicate candidate operational case ${testCase.case_id || '(missing)'}`);
    }
    candidateOperationalCaseIds.add(testCase.case_id);
    for (const knowledgeId of testCase.expected_knowledge_ids || []) {
      if (!recordIds.has(knowledgeId)) errors.push(`${testCase.case_id} references unknown knowledge ${knowledgeId}`);
    }
  }
  const candidateGapCaseIds = new Set();
  for (const testCase of candidateGapCases) {
    if (!testCase.case_id || candidateGapCaseIds.has(testCase.case_id)) {
      errors.push(`Invalid or duplicate candidate gap case ${testCase.case_id || '(missing)'}`);
    }
    candidateGapCaseIds.add(testCase.case_id);
    if (!testCase.gap_type || !testCase.safe_boundary || !testCase.required_follow_up) {
      errors.push(`${testCase.case_id} has an incomplete knowledge-gap boundary`);
    }
    for (const knowledgeId of testCase.related_knowledge_ids || []) {
      if (!recordIds.has(knowledgeId)) errors.push(`${testCase.case_id} references unknown related knowledge ${knowledgeId}`);
    }
    for (const referenceId of testCase.related_reference_ids || []) {
      if (!referenceIds.has(referenceId)) errors.push(`${testCase.case_id} references unknown related reference ${referenceId}`);
    }
  }

  const changeIds = new Set();
  for (const change of changeLog) {
    if (!change.change_id || changeIds.has(change.change_id)) errors.push(`Invalid or duplicate change_id ${change.change_id || '(missing)'}`);
    changeIds.add(change.change_id);
    if (!recordIds.has(change.knowledge_id)) errors.push(`${change.change_id} references unknown knowledge ${change.knowledge_id}`);
    if (!change.previous_record || !change.new_record) errors.push(`${change.change_id} is missing before/after snapshots`);
    if (change.previous_record && sha256(JSON.stringify(change.previous_record)) !== change.previous_checksum) {
      errors.push(`${change.change_id} previous snapshot checksum differs`);
    }
    if (change.new_record && sha256(JSON.stringify(change.new_record)) !== change.new_checksum) {
      errors.push(`${change.change_id} new snapshot checksum differs`);
    }
  }

  for (const [relativePath, expectedHash] of Object.entries(manifest.checksums || {})) {
    const actualHash = sha256(fs.readFileSync(path.join(RELEASE, relativePath)));
    if (actualHash !== expectedHash) errors.push(`${relativePath} checksum differs from manifest`);
  }

  const queueExpectations = {
    'pending-review/records.jsonl': 'PENDING_REVIEW',
    'outdated/records.jsonl': 'POTENTIALLY_OUTDATED',
    'insufficient-evidence/records.jsonl': 'INSUFFICIENT_EVIDENCE'
  };
  for (const [relativePath, status] of Object.entries(queueExpectations)) {
    const queueIds = new Set(readJsonLines(relativePath).map((record) => record.knowledge_id));
    const expectedIds = new Set(records.filter((record) => record.knowledge_status === status).map((record) => record.knowledge_id));
    if (queueIds.size !== expectedIds.size || [...queueIds].some((id) => !expectedIds.has(id))) errors.push(`${relativePath} is incomplete or stale`);
  }

  const pendingIds = new Set(records.filter((record) => record.knowledge_status === 'PENDING_REVIEW').map((record) => record.knowledge_id));
  const reviewItemIds = new Set(pendingReviewItems.map((item) => item.knowledge_id));
  if (pendingIds.size !== reviewItemIds.size || [...pendingIds].some((id) => !reviewItemIds.has(id))) {
    errors.push('pending-review/review-items.jsonl does not cover every pending record');
  }
  for (const item of pendingReviewItems) {
    if (!item.issue_being_reviewed || !item.decision_needed || !item.current_production_behavior) {
      errors.push(`${item.knowledge_id} has an incomplete human review item`);
    }
  }

  if (errors.length) {
    process.stderr.write(`${errors.join('\n')}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`${JSON.stringify({
    valid: true,
    records: records.length,
    publication_ready: publicationReady.length,
    sources: sources.length,
    driver_language_cases: cases.length,
    reference_language_cases: referenceCases.length,
    candidate_operational_language_cases: candidateOperationalCases.length,
    candidate_gap_language_cases: candidateGapCases.length,
    delivery_status_references: deliveryStatuses.length,
    pickup_reason_references: pickupReasons.length,
    change_log_entries: changeLog.length,
    manifest_files_verified: Object.keys(manifest.checksums || {}).length
  }, null, 2)}\n`);
}

main();
