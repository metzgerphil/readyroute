#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PACK = path.join(
  ROOT,
  'candidate-evaluations/2026-08-10-driver-bot-pack'
);
const PROFILE = path.join(PACK, 'candidate_eval_pack_profile.json');
const QUEUE = path.join(PACK, 'candidate_canonical_mapping_queue.jsonl');
const MANIFEST = path.join(PACK, 'manifest.sha256');

function fail(message) {
  process.stderr.write(`candidate eval validation failed: ${message}\n`);
  process.exit(1);
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function readJsonLines(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

const manifestRows = fs.readFileSync(MANIFEST, 'utf8')
  .split(/\r?\n/)
  .filter((line) => line.trim());
if (manifestRows.length !== 4) fail(`expected 4 manifest rows, found ${manifestRows.length}`);
for (const row of manifestRows) {
  const match = row.match(/^([0-9a-f]{64})  ([^/]+)$/);
  if (!match) fail(`malformed checksum row: ${row}`);
  const [, expected, filename] = match;
  const filePath = path.join(PACK, filename);
  if (!fs.existsSync(filePath)) fail(`missing preserved file: ${filename}`);
  if (sha256(filePath) !== expected) fail(`checksum mismatch: ${filename}`);
}

const profile = JSON.parse(fs.readFileSync(PROFILE, 'utf8'));
const queue = readJsonLines(QUEUE);
const expectedProfile = {
  rows: 155,
  uniqueJson: 130,
  duplicates: 25,
  messy: 140,
  union: 145,
  shared: 125,
  jsonOnly: 5,
  messyOnly: 15,
  formalMatches: 0
};
const observedProfile = {
  rows: profile.structural_profile.row_count,
  uniqueJson: profile.structural_profile.unique_normalized_prompt_count,
  duplicates: profile.structural_profile.duplicate_row_count,
  messy: profile.candidate_union_profile.unique_messy_prompt_count,
  union: profile.candidate_union_profile.unique_union_prompt_count,
  shared: profile.candidate_union_profile.shared_json_and_messy_prompt_count,
  jsonOnly: profile.candidate_union_profile.json_only_prompt_count,
  messyOnly: profile.candidate_union_profile.messy_only_prompt_count,
  formalMatches: profile.baseline_overlap.exact_normalized_prompt_matches
};
if (JSON.stringify(observedProfile) !== JSON.stringify(expectedProfile)) {
  fail(`profile drift: ${JSON.stringify(observedProfile)}`);
}
if (queue.length !== expectedProfile.union) fail(`expected 145 queue rows, found ${queue.length}`);
if (new Set(queue.map((row) => row.candidate_case_id)).size !== queue.length) {
  fail('duplicate candidate_case_id');
}
if (new Set(queue.map((row) => row.normalized_prompt)).size !== queue.length) {
  fail('duplicate normalized prompt');
}
for (const row of queue) {
  if (!['NEEDS_CANONICAL_MAPPING', 'MAPPED_TO_REFERENCE_EVALUATION', 'MAPPED_TO_OPERATIONAL_EVALUATION'].includes(row.canonical_mapping_status)) {
    fail(`${row.candidate_case_id} has invalid mapping status`);
  }
  if (row.canonical_mapping_status === 'NEEDS_CANONICAL_MAPPING') {
    if (row.gold_reference_case_id !== null || row.gold_operational_case_id !== null || row.gold_reference_ids.length || row.gold_expected_knowledge_ids.length || row.gold_response_mode !== null) {
      fail(`${row.candidate_case_id} contains unreviewed gold expectations`);
    }
  } else if (!row.gold_response_mode || !row.gold_information_sufficiency || !row.gold_must_not_do.length) {
    fail(`${row.candidate_case_id} has an incomplete reviewed mapping`);
  } else if (row.canonical_mapping_status === 'MAPPED_TO_REFERENCE_EVALUATION' && (!row.gold_reference_case_id || row.gold_operational_case_id !== null)) {
    fail(`${row.candidate_case_id} has inconsistent reference mapping fields`);
  } else if (row.canonical_mapping_status === 'MAPPED_TO_OPERATIONAL_EVALUATION' && (!row.gold_operational_case_id || row.gold_reference_case_id !== null || !row.gold_expected_knowledge_ids.length)) {
    fail(`${row.candidate_case_id} has inconsistent operational mapping fields`);
  }
  if (!['INDEPENDENT_HOLDOUT', 'DEVELOPMENT_REVIEW'].includes(row.holdout_partition)) {
    fail(`${row.candidate_case_id} has invalid holdout partition`);
  }
}

const mappedRows = queue.filter(
  (row) => row.canonical_mapping_status === 'MAPPED_TO_REFERENCE_EVALUATION'
);
if (mappedRows.length !== 17) fail(`expected 17 reviewed reference mappings, found ${mappedRows.length}`);
const mappedOperationalRows = queue.filter(
  (row) => row.canonical_mapping_status === 'MAPPED_TO_OPERATIONAL_EVALUATION'
);
if (mappedOperationalRows.length !== 33) fail(`expected 33 reviewed operational mappings, found ${mappedOperationalRows.length}`);
if ([...mappedRows, ...mappedOperationalRows].some((row) => row.holdout_partition !== 'DEVELOPMENT_REVIEW')) {
  fail('reviewed mapping contaminated the independent holdout');
}
if (profile.candidate_union_profile.mapped_to_reference_evaluation_count !== mappedRows.length) {
  fail('profile reference mapping count differs from queue');
}
if (profile.candidate_union_profile.mapped_to_operational_evaluation_count !== mappedOperationalRows.length) {
  fail('profile operational mapping count differs from queue');
}
if (profile.candidate_union_profile.needs_canonical_mapping_count !== queue.length - mappedRows.length - mappedOperationalRows.length) {
  fail('profile unmapped count differs from all reviewed mappings');
}

process.stdout.write(
  `candidate eval pack valid: 4 preserved files, ${queue.length} mapping rows, ` +
  `${mappedRows.length} reference-mapped rows, ` +
  `${mappedOperationalRows.length} operational-mapped rows, ` +
  `${profile.candidate_union_profile.independent_holdout_count} untouched holdout rows\n`
);
