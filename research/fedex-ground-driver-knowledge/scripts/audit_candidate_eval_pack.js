#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const {
  buildDriverHelpDecision,
  normalizeDriverQuestion
} = require('../../../backend/src/services/driverHelpRetrieval');
const {
  buildPublicationGateIndex
} = require('../../../backend/src/scripts/importDriverKnowledge');
const {
  toPublishedRecord
} = require('../../../backend/src/scripts/validateDriverHelpRetrieval');

const ROOT = path.resolve(__dirname, '..');
const WORKSPACE_ROOT = path.resolve(ROOT, '../..');
const DEFAULT_INPUT = path.join(
  ROOT,
  'candidate-evaluations/2026-08-10-driver-bot-pack/driver_bot_eval_pack.json'
);
const DEFAULT_OUTPUT = path.join(
  ROOT,
  'candidate-evaluations/2026-08-10-driver-bot-pack/candidate_eval_pack_profile.json'
);
const DEFAULT_MESSY_INPUT = path.join(
  ROOT,
  'candidate-evaluations/2026-08-10-driver-bot-pack/messy_question_test_set.md'
);
const DEFAULT_QUEUE_OUTPUT = path.join(
  ROOT,
  'candidate-evaluations/2026-08-10-driver-bot-pack/candidate_canonical_mapping_queue.jsonl'
);
const REQUIRED_FIELDS = [
  'id',
  'driver_prompt',
  'category',
  'priority',
  'expected_first_response',
  'expected_follow_up_options',
  'expected_final_behavior',
  'pass_criteria',
  'failure_modes'
];

function readJsonLines(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function increment(counts, key) {
  const normalized = String(key ?? 'null');
  counts[normalized] = (counts[normalized] || 0) + 1;
}

function stableWithoutId(row) {
  const clone = { ...row };
  delete clone.id;
  return JSON.stringify(clone);
}

function extractMessyPrompts(markdown) {
  return markdown.split(/\r?\n/)
    .map((line) => line.match(/^\d+\.\s+`([^`]+)`\s*$/))
    .filter(Boolean)
    .map((match) => match[1]);
}

function stableBucket(value, buckets) {
  const digest = crypto.createHash('sha256').update(value).digest();
  return digest.readUInt32BE(0) % buckets;
}

function buildRuntimeIndex(records, formalCases, publicationGates) {
  const variants = new Map();
  const patterns = new Map();
  for (const testCase of formalCases) {
    for (const knowledgeId of testCase.expected_knowledge_ids || []) {
      variants.set(knowledgeId, [
        ...(variants.get(knowledgeId) || []),
        testCase.utterance
      ]);
      patterns.set(knowledgeId, [
        ...(patterns.get(knowledgeId) || []),
        {
          utterance: testCase.utterance,
          response_mode: testCase.response_mode,
          information_sufficiency: testCase.information_sufficiency,
          must_clarify: testCase.must_clarify || []
        }
      ]);
    }
  }
  return records.map((record) => toPublishedRecord(
    record,
    variants.get(record.knowledge_id) || [],
    patterns.get(record.knowledge_id) || [],
    publicationGates.get(record.knowledge_id)?.isPublished === true
  ));
}

function main() {
  const inputPath = path.resolve(process.argv[2] || DEFAULT_INPUT);
  const outputPath = path.resolve(process.argv[3] || DEFAULT_OUTPUT);
  const messyInputPath = path.resolve(process.argv[4] || DEFAULT_MESSY_INPUT);
  const queueOutputPath = path.resolve(process.argv[5] || DEFAULT_QUEUE_OUTPUT);
  const candidateCases = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  if (!Array.isArray(candidateCases)) {
    throw new Error('candidate eval pack must be a JSON array');
  }

  const records = readJsonLines(
    path.join(WORKSPACE_ROOT, 'knowledge/operations/records.jsonl')
  );
  const formalCases = readJsonLines(
    path.join(WORKSPACE_ROOT, 'knowledge/evaluations/driver-language-cases.jsonl')
  );
  const recordsById = new Map(records.map((record) => [record.knowledge_id, record]));
  const publicationGates = buildPublicationGateIndex(records);
  const runtimeRecords = buildRuntimeIndex(records, formalCases, publicationGates);
  const messyPrompts = extractMessyPrompts(
    fs.readFileSync(messyInputPath, 'utf8')
  );
  const formalByNormalizedUtterance = new Map(
    formalCases.map((testCase) => [
      normalizeDriverQuestion(testCase.utterance),
      testCase
    ])
  );

  const invalidRows = [];
  const prompts = new Map();
  const categoryCounts = {};
  const priorityCounts = {};
  const emptyOptionsByCategory = {};
  for (const row of candidateCases) {
    const fields = Object.keys(row).sort();
    if (JSON.stringify(fields) !== JSON.stringify([...REQUIRED_FIELDS].sort())) {
      invalidRows.push({ id: row.id ?? null, reason: 'unexpected field set', fields });
    }
    if (!Number.isInteger(row.id) || row.id < 1) {
      invalidRows.push({ id: row.id ?? null, reason: 'invalid integer id' });
    }
    for (const field of ['driver_prompt', 'category', 'priority', 'expected_first_response', 'expected_final_behavior']) {
      if (typeof row[field] !== 'string' || !row[field].trim()) {
        invalidRows.push({ id: row.id ?? null, reason: `missing ${field}` });
      }
    }
    for (const field of ['expected_follow_up_options', 'pass_criteria', 'failure_modes']) {
      if (!Array.isArray(row[field])) {
        invalidRows.push({ id: row.id ?? null, reason: `${field} is not an array` });
      }
    }
    const normalized = normalizeDriverQuestion(row.driver_prompt || '');
    prompts.set(normalized, [...(prompts.get(normalized) || []), row]);
    increment(categoryCounts, row.category);
    increment(priorityCounts, row.priority);
    if (Array.isArray(row.expected_follow_up_options) && row.expected_follow_up_options.length === 0) {
      increment(emptyOptionsByCategory, row.category);
    }
  }

  const ids = candidateCases.map((row) => row.id);
  const contiguousIds = ids.every((id, index) => id === index + 1);
  const duplicatePromptGroups = [...prompts.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([normalizedPrompt, rows]) => ({
      normalized_prompt: normalizedPrompt,
      ids: rows.map((row) => row.id),
      categories: [...new Set(rows.map((row) => row.category))],
      identical_except_id: rows.every(
        (row) => stableWithoutId(row) === stableWithoutId(rows[0])
      )
    }));

  const messyByNormalizedPrompt = new Map(
    messyPrompts.map((prompt) => [normalizeDriverQuestion(prompt), prompt])
  );

  const retrievalRows = candidateCases.map((row) => {
    const normalizedPrompt = normalizeDriverQuestion(row.driver_prompt);
    const decision = buildDriverHelpDecision(row.driver_prompt, runtimeRecords);
    const top = decision.candidates[0] || null;
    const topRecord = top ? recordsById.get(top.knowledge_id) : null;
    const formalMatch = formalByNormalizedUtterance.get(normalizedPrompt) || null;
    return {
      id: row.id,
      driver_prompt: row.driver_prompt,
      category: row.category,
      priority: row.priority,
      exact_formal_case_id: formalMatch?.case_id || null,
      current_response_mode: decision.response_mode,
      top_candidate_knowledge_id: top?.knowledge_id || null,
      top_candidate_status: topRecord?.knowledge_status || null,
      top_candidate_published: top
        ? publicationGates.get(top.knowledge_id)?.isPublished === true
        : false,
      top_candidate_score: top?.score || 0,
      expected_first_response: row.expected_first_response
    };
  });

  const byMode = {};
  const byTopStatus = {};
  const byPublished = {};
  for (const row of retrievalRows) {
    increment(byMode, row.current_response_mode);
    increment(byTopStatus, row.top_candidate_status);
    increment(byPublished, row.top_candidate_published);
  }

  const candidateUnion = new Map();
  for (const [normalizedPrompt, rows] of prompts.entries()) {
    candidateUnion.set(normalizedPrompt, {
      normalizedPrompt,
      representativePrompt: rows[0].driver_prompt,
      jsonRows: rows,
      messyPrompt: messyByNormalizedPrompt.get(normalizedPrompt) || null
    });
  }
  for (const [normalizedPrompt, prompt] of messyByNormalizedPrompt.entries()) {
    if (!candidateUnion.has(normalizedPrompt)) {
      candidateUnion.set(normalizedPrompt, {
        normalizedPrompt,
        representativePrompt: prompt,
        jsonRows: [],
        messyPrompt: prompt
      });
    }
  }

  const mappingQueue = [...candidateUnion.values()]
    .sort((left, right) => left.normalizedPrompt.localeCompare(right.normalizedPrompt))
    .map((entry, index) => {
      const decision = buildDriverHelpDecision(entry.representativePrompt, runtimeRecords);
      const top = decision.candidates[0] || null;
      const topRecord = top ? recordsById.get(top.knowledge_id) : null;
      const topPublished = top
        ? publicationGates.get(top.knowledge_id)?.isPublished === true
        : false;
      let reviewPriority = 'STANDARD';
      if (!top || (topRecord && !topPublished)) {
        reviewPriority = 'FIRST';
      } else if ((top?.score || 0) < 42) {
        reviewPriority = 'NEXT';
      }
      return {
        candidate_case_id: `CAND-EVAL-${String(index + 1).padStart(4, '0')}`,
        representative_prompt: entry.representativePrompt,
        normalized_prompt: entry.normalizedPrompt,
        source_files: [
          ...(entry.jsonRows.length ? ['driver_bot_eval_pack.json'] : []),
          ...(entry.messyPrompt ? ['messy_question_test_set.md'] : [])
        ],
        source_json_ids: entry.jsonRows.map((row) => row.id),
        candidate_categories: [...new Set(entry.jsonRows.map((row) => row.category))].sort(),
        candidate_priorities: [...new Set(entry.jsonRows.map((row) => row.priority))].sort(),
        conflicting_candidate_expectations: entry.jsonRows.length > 1 && !entry.jsonRows.every(
          (row) => stableWithoutId(row) === stableWithoutId(entry.jsonRows[0])
        ),
        canonical_mapping_status: 'NEEDS_CANONICAL_MAPPING',
        review_priority: reviewPriority,
        holdout_partition: stableBucket(entry.normalizedPrompt, 5) === 0
          ? 'INDEPENDENT_HOLDOUT'
          : 'DEVELOPMENT_REVIEW',
        diagnostic_retrieval_only: {
          response_mode: decision.response_mode,
          top_candidate_knowledge_id: top?.knowledge_id || null,
          top_candidate_status: topRecord?.knowledge_status || null,
          top_candidate_published: topPublished,
          top_candidate_score: top?.score || 0
        },
        gold_expected_knowledge_ids: [],
        gold_response_mode: null,
        gold_information_sufficiency: null,
        gold_must_clarify: [],
        gold_must_not_do: [],
        adjudication_ids: [],
        reviewer_notes: ''
      };
    });

  const result = {
    schema_version: '1.0.0',
    generated_at: '2026-08-10',
    input: {
      path: path.relative(WORKSPACE_ROOT, inputPath),
      sha256: sha256File(inputPath)
    },
    baseline: {
      canonical_record_count: records.length,
      formal_case_count: formalCases.length,
      publication_ready_record_count: [...publicationGates.values()]
        .filter((gate) => gate.isPublished).length
    },
    structural_profile: {
      row_count: candidateCases.length,
      unique_normalized_prompt_count: prompts.size,
      duplicate_row_count: candidateCases.length - prompts.size,
      duplicate_prompt_group_count: duplicatePromptGroups.length,
      contiguous_ids: contiguousIds,
      unique_id_count: new Set(ids).size,
      invalid_rows: invalidRows,
      category_counts: categoryCounts,
      priority_counts: priorityCounts,
      empty_follow_up_options_count: candidateCases.filter(
        (row) => Array.isArray(row.expected_follow_up_options)
          && row.expected_follow_up_options.length === 0
      ).length,
      empty_follow_up_options_by_category: emptyOptionsByCategory
    },
    baseline_overlap: {
      exact_normalized_prompt_matches: retrievalRows.filter(
        (row) => row.exact_formal_case_id
      ).length,
      novel_rows: retrievalRows.filter((row) => !row.exact_formal_case_id).length
    },
    candidate_union_profile: {
      messy_prompt_count: messyPrompts.length,
      unique_messy_prompt_count: messyByNormalizedPrompt.size,
      unique_union_prompt_count: candidateUnion.size,
      shared_json_and_messy_prompt_count: [...prompts.keys()].filter(
        (prompt) => messyByNormalizedPrompt.has(prompt)
      ).length,
      json_only_prompt_count: [...prompts.keys()].filter(
        (prompt) => !messyByNormalizedPrompt.has(prompt)
      ).length,
      messy_only_prompt_count: [...messyByNormalizedPrompt.keys()].filter(
        (prompt) => !prompts.has(prompt)
      ).length,
      mapping_queue_path: path.relative(WORKSPACE_ROOT, queueOutputPath),
      independent_holdout_count: mappingQueue.filter(
        (row) => row.holdout_partition === 'INDEPENDENT_HOLDOUT'
      ).length,
      development_review_count: mappingQueue.filter(
        (row) => row.holdout_partition === 'DEVELOPMENT_REVIEW'
      ).length
    },
    current_retrieval_profile: {
      response_mode_counts: byMode,
      top_candidate_status_counts: byTopStatus,
      top_candidate_publication_counts: byPublished,
      no_candidate_count: retrievalRows.filter(
        (row) => !row.top_candidate_knowledge_id
      ).length,
      score_below_42_count: retrievalRows.filter(
        (row) => row.top_candidate_score < 42
      ).length,
      nonpublished_top_candidate_count: retrievalRows.filter(
        (row) => row.top_candidate_knowledge_id && !row.top_candidate_published
      ).length
    },
    duplicate_prompt_groups: duplicatePromptGroups,
    retrieval_rows: retrievalRows,
    interpretation_limits: [
      'A top retrieval candidate is diagnostic output, not a human-reviewed gold mapping.',
      'Candidate expected responses have no canonical knowledge_id, status, source_id, version, or adjudication trace.',
      'No candidate expected response may be promoted without record-level canonical review.'
    ]
  };

  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  fs.writeFileSync(
    queueOutputPath,
    `${mappingQueue.map((row) => JSON.stringify(row)).join('\n')}\n`
  );
  process.stdout.write(`${JSON.stringify({
    output: outputPath,
    rows: candidateCases.length,
    unique_prompts: prompts.size,
    duplicate_rows: candidateCases.length - prompts.size,
    exact_formal_matches: result.baseline_overlap.exact_normalized_prompt_matches,
    low_score_rows: result.current_retrieval_profile.score_below_42_count,
    no_candidate_rows: result.current_retrieval_profile.no_candidate_count,
    nonpublished_top_rows: result.current_retrieval_profile.nonpublished_top_candidate_count,
    candidate_union_prompts: candidateUnion.size,
    mapping_queue: queueOutputPath
  }, null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = { main };
