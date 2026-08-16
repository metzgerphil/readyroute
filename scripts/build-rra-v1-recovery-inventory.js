#!/usr/bin/env node

const { execFileSync } = require('node:child_process');
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { dirname, resolve } = require('node:path');

const workspaceRoot = resolve(__dirname, '..');
const archiveRef = 'readyroute-answers-dataset-v1-archive-2026-08-15';
const archivePath = 'knowledge/operations/records.jsonl';
const activePath = resolve(workspaceRoot, 'knowledge/operations/records.jsonl');
const outputPath = resolve(
  workspaceRoot,
  'research/fedex-ground-driver-knowledge/inventory/v1_selective_recovery_inventory.csv',
);

const firstBatchIds = new Set([
  'KNO-DEL-SIG-ISR-001',
  'KNO-DEL-SIG-DSR-001',
  'KNO-DEL-SIG-ASR-001',
  'KNO-DEL-ALCOHOL-001',
  'KNO-DEL-DOORTAG-001',
  'KNO-DEL-SRA-001',
  'KNO-DEL-PPOD-001',
  'KNO-DEL-ATTEMPT-LIMIT-001',
]);

const preservedSourceIds = new Set([
  'SRC-GDRIVE-FILE-0001', // MGB-119
  'SRC-GDRIVE-FILE-0008', // FORGE P&D Application Guide 3.00
  'SRC-GDRIVE-FILE-0014', // OP-117 v2
]);

function parseJsonl(value) {
  return value
    .trim()
    .split(/\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function recoveryDisposition(record, activeIds) {
  if (activeIds.has(record.knowledge_id)) return 'ALREADY_ACTIVE_V2';
  if (firstBatchIds.has(record.knowledge_id)) return 'BATCH_1_CANDIDATE';
  if (record.knowledge_status === 'PENDING_REVIEW') return 'HOLD_PENDING_REVIEW';
  if (record.knowledge_status === 'POTENTIALLY_OUTDATED') return 'HOLD_POTENTIALLY_OUTDATED';
  return 'FUTURE_SELECTIVE_REVIEW';
}

function sourceAvailability(record) {
  const sourceIds = record.source_ids || [];
  if (sourceIds.length === 0) return 'NO_ARCHIVE_SOURCE_IDS';
  const preservedCount = sourceIds.filter((id) => preservedSourceIds.has(id)).length;
  if (preservedCount === sourceIds.length) return 'ALL_REFERENCED_SOURCES_REINTRODUCED';
  if (preservedCount > 0) return 'SOME_REFERENCED_SOURCES_REINTRODUCED';
  return 'ARCHIVE_ONLY_OR_NOT_REINTRODUCED';
}

const archiveText = execFileSync(
  'git',
  ['show', `${archiveRef}:${archivePath}`],
  { cwd: workspaceRoot, encoding: 'utf8', maxBuffer: 100 * 1024 * 1024 },
);
const archiveRecords = parseJsonl(archiveText);
const activeRecords = parseJsonl(readFileSync(activePath, 'utf8'));
const activeIds = new Set(activeRecords.map((record) => record.knowledge_id));

const header = [
  'knowledge_id',
  'canonical_situation',
  'archive_status',
  'primary_category',
  'recovery_disposition',
  'source_availability',
  'archive_source_ids',
  'related_knowledge_ids',
];

const rows = archiveRecords
  .sort((a, b) => a.knowledge_id.localeCompare(b.knowledge_id))
  .map((record) => [
    record.knowledge_id,
    record.canonical_situation,
    record.knowledge_status,
    record.category_paths?.[0]?.split('/')[0] || 'UNCATEGORIZED',
    recoveryDisposition(record, activeIds),
    sourceAvailability(record),
    (record.source_ids || []).join(';'),
    (record.related_knowledge_ids || []).join(';'),
  ]);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(
  outputPath,
  `${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')}\n`,
);

console.log(`Wrote ${rows.length} archived records to ${outputPath}`);
