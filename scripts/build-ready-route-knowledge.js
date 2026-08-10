#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const {
  buildImport,
  buildPublicationGateIndex,
  parseCsv,
  readJsonLines,
  readSourceInventory
} = require('../backend/src/scripts/importDriverKnowledge');

const ROOT = path.resolve(__dirname, '..');
const RESEARCH = path.join(ROOT, 'research/fedex-ground-driver-knowledge');
const RELEASE = path.join(ROOT, 'knowledge');
const RECORDS_PATH = path.join(RESEARCH, 'knowledge/records.jsonl');
const CASES_PATH = path.join(RESEARCH, 'validation/driver_language_cases.jsonl');
const INVENTORY_PATH = path.join(RESEARCH, 'inventory/source_inventory.csv');
const CAPTURE_PATH = path.join(RESEARCH, 'knowledge/evidence_capture_risk_coverage.csv');
const TRACE_PATH = path.join(RESEARCH, 'knowledge/claim_evidence_allocation_coverage.jsonl');
const CHANGE_LOG_PATH = path.join(RESEARCH, 'knowledge/change_log.jsonl');
const ADJUDICATIONS_PATH = path.join(RELEASE, 'adjudications/records.json');

const STATUS_MAP = {
  VERIFIED: 'SOURCE_VERIFIED',
  CONFLICT: 'PENDING_REVIEW',
  HUMAN_REVIEW_REQUIRED: 'PENDING_REVIEW',
  POTENTIALLY_OUTDATED: 'POTENTIALLY_OUTDATED',
  UNRESOLVED: 'INSUFFICIENT_EVIDENCE'
};

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function parseCsvObjects(filePath) {
  const rows = parseCsv(fs.readFileSync(filePath, 'utf8'));
  const headers = rows.shift() || [];
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])));
}

function writeJsonLines(filePath, rows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${rows.map((row) => JSON.stringify(row)).join('\n')}${rows.length ? '\n' : ''}`);
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function validateAdjudication(adjudication, knownKnowledgeIds) {
  const required = [
    'adjudication_id',
    'knowledge_id',
    'status',
    'issue_reviewed',
    'canonical_determination',
    'previous_interpretations',
    'supporting_source_ids',
    'reasoning',
    'approved_by',
    'approval_date',
    'reopen_conditions'
  ];
  const missing = required.filter((field) => (
    adjudication[field] === undefined
      || adjudication[field] === null
      || adjudication[field] === ''
      || (Array.isArray(adjudication[field]) && !adjudication[field].length)
  ));
  if (missing.length) throw new Error(`${adjudication.adjudication_id || 'Unknown adjudication'} missing: ${missing.join(', ')}`);
  if (!knownKnowledgeIds.has(adjudication.knowledge_id)) throw new Error(`${adjudication.adjudication_id} references unknown knowledge ${adjudication.knowledge_id}`);
  if (!['APPROVED', 'SUPERSEDED', 'REOPENED'].includes(adjudication.status)) throw new Error(`${adjudication.adjudication_id} has invalid status`);
  if (adjudication.status === 'APPROVED' && !adjudication.canonical_overrides) {
    throw new Error(`${adjudication.adjudication_id} must include canonical_overrides for an approved production determination`);
  }
}

function applyCanonicalOverrides(record, adjudication) {
  const overrides = adjudication?.canonical_overrides || {};
  const allowed = new Set([
    'authoritative_rule',
    'applicability',
    'conditions',
    'exceptions',
    'required_procedure',
    'required_documentation',
    'prohibited_actions',
    'escalation_requirements',
    'clarification_requirements',
    'concise_driver_answer',
    'more_info_answer'
  ]);
  return Object.fromEntries(Object.entries(overrides).filter(([key]) => allowed.has(key)));
}

function main() {
  const generatedAt = new Date().toISOString();
  const records = readJsonLines(RECORDS_PATH);
  const cases = readJsonLines(CASES_PATH);
  const sourceInventory = readSourceInventory(INVENTORY_PATH);
  const captureRows = parseCsvObjects(CAPTURE_PATH);
  const captureByKnowledgeId = new Map(captureRows.map((row) => [row.knowledge_id, row]));
  const traceClaims = readJsonLines(TRACE_PATH);
  const changeLog = fs.existsSync(CHANGE_LOG_PATH) ? readJsonLines(CHANGE_LOG_PATH) : [];
  const publicationGateIndex = buildPublicationGateIndex(records, captureRows, traceClaims);
  const importPayload = buildImport(records, generatedAt, cases, sourceInventory, publicationGateIndex);
  const importById = new Map(importPayload.knowledgeRows.map((row) => [row.knowledge_id, row]));
  const knownKnowledgeIds = new Set(records.map((record) => record.knowledge_id));
  const adjudications = JSON.parse(fs.readFileSync(ADJUDICATIONS_PATH, 'utf8'));
  if (!Array.isArray(adjudications)) throw new Error('knowledge/adjudications/records.json must contain an array');
  adjudications.forEach((item) => validateAdjudication(item, knownKnowledgeIds));

  const activeApprovals = new Map();
  for (const adjudication of adjudications) {
    if (adjudication.status !== 'APPROVED') continue;
    if (activeApprovals.has(adjudication.knowledge_id)) throw new Error(`Multiple active approvals for ${adjudication.knowledge_id}`);
    activeApprovals.set(adjudication.knowledge_id, adjudication);
  }

  const canonicalRecords = records.map((record) => {
    const approval = activeApprovals.get(record.knowledge_id) || null;
    const importRow = importById.get(record.knowledge_id);
    const mappedStatus = approval ? 'READY_ROUTE_APPROVED' : STATUS_MAP[record.knowledge_status];
    if (!mappedStatus) throw new Error(`No canonical status mapping for ${record.knowledge_status}`);
    const overrides = applyCanonicalOverrides(record, approval);
    const statusEligible = mappedStatus === 'SOURCE_VERIFIED' || mappedStatus === 'READY_ROUTE_APPROVED';
    const publicationReady = approval ? true : importRow.is_published === true;
    const sourceIds = [...new Set((record.evidence || []).map((item) => item.source_id).filter(Boolean))];
    const canonical = {
      schema_version: '1.0.0',
      knowledge_id: record.knowledge_id,
      record_version: Number(record.version || 1),
      canonical_situation: record.canonical_situation,
      normalized_description: record.normalized_description || null,
      category_paths: record.taxonomy_paths || [],
      knowledge_status: mappedStatus,
      source_research_status: record.knowledge_status,
      authoritative_rule: overrides.authoritative_rule || record.authoritative_rule,
      applicability: overrides.applicability || record.applicability || [],
      conditions: overrides.conditions || record.conditions || [],
      exceptions: overrides.exceptions || record.exceptions || [],
      required_procedure: overrides.required_procedure || record.required_procedure || [],
      required_documentation: overrides.required_documentation || record.required_documentation || [],
      prohibited_actions: overrides.prohibited_actions || record.prohibited_actions || [],
      escalation_requirements: overrides.escalation_requirements || record.escalation_requirements || [],
      clarification_requirements: overrides.clarification_requirements || record.clarification_requirements || [],
      related_knowledge_ids: record.related_knowledge_ids || [],
      driver_question_variants: importRow.driver_question_variants || [],
      driver_question_patterns: importRow.driver_question_patterns || [],
      concise_driver_answer: overrides.concise_driver_answer || record.concise_ready_route_answer,
      more_info_answer: overrides.more_info_answer !== undefined ? overrides.more_info_answer : record.more_info_answer || null,
      source_ids: sourceIds,
      source_evidence: record.evidence || [],
      source_date_or_version: record.source_date_or_version || null,
      effective_date: record.effective_date || null,
      supersedes: record.supersedes || [],
      superseded_by: record.superseded_by || [],
      adjudication_id: approval?.adjudication_id || null,
      approved_by: approval?.approved_by || null,
      approval_date: approval?.approval_date || null,
      adjudication: approval || null,
      production_eligibility: {
        status_eligible: statusEligible,
        publication_ready: statusEligible && publicationReady,
        capture_gate: importRow.production_capture_gate,
        trace_gate: importRow.production_trace_gate,
        blockers: statusEligible && publicationReady ? [] : importRow.publication_blockers
      },
      review_notes: record.review_notes || null,
      created_at: record.created_at || null,
      updated_at: record.updated_at || null
    };
    if (approval) canonical.source_authoritative_rule = record.authoritative_rule;
    return canonical;
  });

  const sources = [...sourceInventory.values()].map((source) => ({
    schema_version: '1.0.0',
    source_id: source.source_id,
    title: source.title || source.source_id,
    source_type: source.source_type || null,
    source_system: source.source_system || null,
    parent_source_id: source.parent_source_id || null,
    original_location: source.url_or_path || null,
    local_archive_path: source.local_archive_path || null,
    section_or_page: null,
    created_at: source.created_at || null,
    modified_at: source.modified_at || null,
    effective_date: source.effective_date || null,
    version: source.version || null,
    retrieval_or_review_date: source.last_reviewed_at || null,
    authority_level: 'AUTHORIZED_PROJECT_CORPUS',
    access_status: source.access_status || null,
    review_status: source.review_status || null,
    relevance_status: source.relevance_status || null,
    duplicate_of: source.duplicate_of || null,
    supersedes: source.supersedes || null,
    superseded_by: source.superseded_by || null,
    cross_references: source.cross_references || null,
    interpretation_limits: source.interpretation_limits || null,
    review_notes: source.review_notes || null
  }));

  const byStatus = (status) => canonicalRecords.filter((record) => record.knowledge_status === status);
  const publicationReady = canonicalRecords.filter((record) => record.production_eligibility.publication_ready);
  const publicationGaps = canonicalRecords
    .filter((record) => record.production_eligibility.status_eligible && !record.production_eligibility.publication_ready)
    .map((record) => {
      const capture = captureByKnowledgeId.get(record.knowledge_id) || {};
      const captureBlocked = !String(record.production_eligibility.capture_gate || '').startsWith('CAPTURE_COMPLETE');
      const traceBlocked = record.production_eligibility.trace_gate !== 'CLAIM_FRAGMENT_TRACE_READY';
      return {
        schema_version: '1.0.0',
        knowledge_id: record.knowledge_id,
        canonical_situation: record.canonical_situation,
        knowledge_status: record.knowledge_status,
        remediation_type: captureBlocked && traceBlocked
          ? 'SOURCE_CAPTURE_AND_CLAIM_ALLOCATION'
          : captureBlocked
            ? 'SOURCE_CAPTURE'
            : 'CLAIM_EVIDENCE_ALLOCATION',
        capture_gate: record.production_eligibility.capture_gate,
        trace_gate: record.production_eligibility.trace_gate,
        blockers: record.production_eligibility.blockers,
        evidence_source_ids: record.source_ids,
        authenticated_queue_resource_ids: String(capture.authenticated_queue_resource_ids || '')
          .split(';').map((value) => value.trim()).filter(Boolean),
        required_follow_up: capture.required_follow_up || 'Complete the named publication blockers and regenerate the release.'
      };
    });
  const pendingReviewItems = byStatus('PENDING_REVIEW').map((record) => ({
    schema_version: '1.0.0',
    knowledge_id: record.knowledge_id,
    source_research_status: record.source_research_status,
    issue_being_reviewed: record.canonical_situation,
    competing_interpretations: record.source_research_status === 'CONFLICT'
      ? [record.authoritative_rule]
      : [],
    supporting_source_ids: record.source_ids,
    source_evidence: record.source_evidence,
    relevant_dates_and_versions: record.source_date_or_version ? [record.source_date_or_version] : [],
    applicability_differences: {
      applicability: record.applicability,
      conditions: record.conditions,
      exceptions: record.exceptions
    },
    analysis_of_conflict_or_ambiguity: record.review_notes,
    could_be_context_dependent: Boolean(record.conditions.length || record.exceptions.length),
    what_remains_uncertain: record.clarification_requirements,
    decision_needed: `Determine whether Ready Route can approve a complete canonical procedure for: ${record.canonical_situation}`,
    current_production_behavior: 'WITHHOLD_DEFINITIVE_INSTRUCTIONS_AND_ESCALATE'
  }));
  const statusSummary = {
    schema_version: '1.0.0',
    generated_at: generatedAt,
    total_records: canonicalRecords.length,
    by_status: Object.fromEntries([
      'SOURCE_VERIFIED',
      'READY_ROUTE_APPROVED',
      'PENDING_REVIEW',
      'POTENTIALLY_OUTDATED',
      'INSUFFICIENT_EVIDENCE'
    ].map((status) => [status, byStatus(status).length])),
    status_eligible_records: canonicalRecords.filter((record) => record.production_eligibility.status_eligible).length,
    publication_ready_records: publicationReady.length,
    status_eligible_but_evidence_gated: canonicalRecords.filter((record) => (
      record.production_eligibility.status_eligible && !record.production_eligibility.publication_ready
    )).length,
    source_records: sources.length,
    driver_language_cases: cases.length,
    active_adjudications: activeApprovals.size
  };

  writeJsonLines(path.join(RELEASE, 'operations/records.jsonl'), canonicalRecords);
  writeJsonLines(path.join(RELEASE, 'operations/publication-ready.jsonl'), publicationReady);
  writeJsonLines(path.join(RELEASE, 'operations/publication-gaps.jsonl'), publicationGaps);
  writeJsonLines(path.join(RELEASE, 'pending-review/records.jsonl'), byStatus('PENDING_REVIEW'));
  writeJsonLines(path.join(RELEASE, 'pending-review/review-items.jsonl'), pendingReviewItems);
  writeJsonLines(path.join(RELEASE, 'outdated/records.jsonl'), byStatus('POTENTIALLY_OUTDATED'));
  writeJsonLines(path.join(RELEASE, 'insufficient-evidence/records.jsonl'), byStatus('INSUFFICIENT_EVIDENCE'));
  writeJsonLines(path.join(RELEASE, 'sources/registry.jsonl'), sources);
  writeJsonLines(path.join(RELEASE, 'evaluations/driver-language-cases.jsonl'), cases);
  writeJsonLines(path.join(RELEASE, 'history/change-log.jsonl'), changeLog);
  writeJson(path.join(RELEASE, 'operations/status-summary.json'), statusSummary);
  fs.mkdirSync(path.join(RELEASE, 'reference'), { recursive: true });
  fs.copyFileSync(path.join(RESEARCH, 'knowledge/taxonomy.json'), path.join(RELEASE, 'reference/taxonomy.json'));

  const generatedFiles = [
    'operations/records.jsonl',
    'operations/publication-ready.jsonl',
    'operations/publication-gaps.jsonl',
    'operations/status-summary.json',
    'pending-review/records.jsonl',
    'pending-review/review-items.jsonl',
    'outdated/records.jsonl',
    'insufficient-evidence/records.jsonl',
    'sources/registry.jsonl',
    'evaluations/driver-language-cases.jsonl',
    'history/change-log.jsonl',
    'reference/taxonomy.json'
  ];
  const checksums = Object.fromEntries(generatedFiles.map((relativePath) => {
    const bytes = fs.readFileSync(path.join(RELEASE, relativePath));
    return [relativePath, sha256(bytes)];
  }));
  writeJson(path.join(RELEASE, 'manifest.json'), {
    schema_version: '1.0.0',
    generated_at: generatedAt,
    generator: 'scripts/build-ready-route-knowledge.js',
    authoring_corpus: path.relative(ROOT, RECORDS_PATH),
    adjudication_input: path.relative(ROOT, ADJUDICATIONS_PATH),
    counts: statusSummary,
    checksums
  });

  process.stdout.write(`${JSON.stringify(statusSummary, null, 2)}\n`);
}

main();
