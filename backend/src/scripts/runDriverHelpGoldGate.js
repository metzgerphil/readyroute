#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-service-role-key';

const { buildDeterministicRuntimeDecision } = require('../services/driverHelp');
const { rankKnowledgeRecords } = require('../services/driverHelpRetrieval');
const { loadIndexedRecords } = require('./runDriverHelpStability');
const { expectedRuntimeMode } = require('./validateDriverHelpRetrieval');

const ROOT = path.resolve(__dirname, '../../..');
const CASES_PATH = path.join(ROOT, 'knowledge/evaluations/driver-language-cases.jsonl');
const CONVERSATIONS_PATH = path.join(ROOT, 'knowledge/evaluations/conversation-scenarios.jsonl');
const RECORDS_PATH = path.join(ROOT, 'knowledge/operations/records.jsonl');

function readJsonLines(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function selectedKnowledgeId(decision) {
  return decision.selected_records?.[0]?.knowledge_id
    || decision.candidates?.[0]?.knowledge_id
    || null;
}

function words(value) {
  return String(value || '').match(/[A-Za-z0-9]+/g) || [];
}

function typoVariant(value) {
  const tokens = String(value).split(/(\s+)/);
  let bestIndex = -1;
  let bestLength = 0;
  for (let index = 0; index < tokens.length; index += 1) {
    const clean = tokens[index].replace(/[^A-Za-z]/g, '');
    if (clean.length >= 6 && clean.length > bestLength) {
      bestIndex = index;
      bestLength = clean.length;
    }
  }
  if (bestIndex < 0) return `${value}?`;
  const token = tokens[bestIndex];
  const segments = [...token.matchAll(/[A-Za-z]+/g)].sort((left, right) => right[0].length - left[0].length);
  const segment = segments[0];
  const letters = [...segment[0]];
  const start = Math.max(1, Math.floor(letters.length / 2) - 1);
  [letters[start], letters[start + 1]] = [letters[start + 1], letters[start]];
  tokens[bestIndex] = `${token.slice(0, segment.index)}${letters.join('')}${token.slice(segment.index + segment[0].length)}`;
  return tokens.join('');
}

function shorthandVariant(value) {
  const replacements = [
    [/\bpackages?\b/i, 'pkg'],
    [/\bbusiness\b/i, 'biz'],
    [/\bvehicle\b/i, 'van'],
    [/\bsignature\b/i, 'sig'],
    [/\bpickup\b/i, 'PU'],
    [/\broute\b/i, 'rte'],
    [/\bwork area\b/i, 'WA']
  ];
  let result = String(value);
  for (const [pattern, replacement] of replacements) result = result.replace(pattern, replacement);
  if (result !== value) return result;
  const compact = words(value)
    .filter((word) => !new Set(['a', 'an', 'the', 'is', 'are', 'at', 'to', 'for', 'my', 'i']).has(word.toLowerCase()))
    .join(' ');
  return words(compact).length >= 3 ? compact : value;
}

function caseMap(cases) {
  const result = new Map();
  for (const testCase of cases) {
    for (const knowledgeId of testCase.expected_knowledge_ids || []) {
      result.set(knowledgeId, [...(result.get(knowledgeId) || []), testCase]);
    }
  }
  return result;
}

function directCases(items) {
  return items.filter((item) => (
    !String(item.response_mode || '').startsWith('ESCALATE')
    && !expectedRuntimeMode(item.response_mode).includes('CLARIFY')
  ));
}

function main() {
  const records = loadIndexedRecords().filter((record) => record.is_published);
  const authoredRecords = new Map(readJsonLines(RECORDS_PATH).map((record) => [record.knowledge_id, record]));
  const cases = readJsonLines(CASES_PATH);
  const conversations = readJsonLines(CONVERSATIONS_PATH);
  const byRecord = caseMap(cases);
  const conversationIds = new Set(conversations.flatMap((scenario) => (
    scenario.turns.map((turn) => turn.expected_knowledge_id)
  )));
  const failures = [];
  const coverage = [];
  let runtimeChecks = 0;

  for (const record of records) {
    const authoredRecord = authoredRecords.get(record.knowledge_id) || record;
    const recordCases = byRecord.get(record.knowledge_id) || [];
    const answerCases = directCases(recordCases);
    const allInputs = [
      ...(authoredRecord.driver_question_variants || []),
      ...recordCases.flatMap((item) => [item.utterance, ...(item.semantic_variations || [])])
    ].filter(Boolean);
    const uniqueAnswerInputs = answerCases
      .filter((item) => (item.expected_knowledge_ids || []).length === 1)
      .flatMap((item) => [item.utterance, ...(item.semantic_variations || [])])
      .filter(Boolean);
    const answerInputs = uniqueAnswerInputs.length
      ? uniqueAnswerInputs
      : (authoredRecord.driver_question_variants || []).filter(Boolean);
    const shortest = [...answerInputs].sort((left, right) => words(left).length - words(right).length)[0];
    const natural = [...answerInputs].sort((left, right) => words(right).length - words(left).length)[0];
    const hasClarificationCase = recordCases.some((item) => {
      if (!expectedRuntimeMode(item.response_mode).includes('CLARIFY')) return false;
      const decision = buildDeterministicRuntimeDecision(item.utterance, records, {}).decision;
      return decision.response_mode === 'CLARIFY'
        && selectedKnowledgeId(decision) === record.knowledge_id;
    });
    const structural = {
      curated_case: recordCases.length > 0,
      authored_variants: (authoredRecord.driver_question_variants || []).length >= 3,
      multi_turn_when_applicable: !hasClarificationCase || conversationIds.has(record.knowledge_id)
    };
    for (const [family, passed] of Object.entries(structural)) {
      if (!passed) failures.push({ knowledge_id: record.knowledge_id, family, reason: 'coverage missing' });
    }

    const runtimeInputs = [
      ['NATURAL', natural],
      ['SHORT', shortest],
      ['TYPO', typoVariant(natural)],
      ['SHORTHAND', shorthandVariant(shortest)],
      ['EXTRA_DETAIL', `${natural} I am here now. Please help.`]
    ];
    const familyResults = {};
    for (const [family, input] of runtimeInputs) {
      if (!input) {
        failures.push({ knowledge_id: record.knowledge_id, family, reason: 'no input available' });
        continue;
      }
      const decision = buildDeterministicRuntimeDecision(input, records, {}).decision;
      const actualId = selectedKnowledgeId(decision);
      runtimeChecks += 1;
      familyResults[family] = actualId === record.knowledge_id;
      if (actualId !== record.knowledge_id) {
        failures.push({
          knowledge_id: record.knowledge_id,
          family,
          input,
          expected: record.knowledge_id,
          actual: actualId,
          response_mode: decision.response_mode
        });
      }
      if (decision.response_mode === 'ANSWER') {
        const structure = decision.answer_structure || {};
        const directAnswer = String(structure.direct_answer || '');
        if (directAnswer.length > 180) {
          failures.push({
            knowledge_id: record.knowledge_id,
            family: 'ANSWER_CLARITY',
            input,
            reason: 'direct answer exceeds 180 characters',
            actual_length: directAnswer.length
          });
          familyResults.ANSWER_CLARITY = false;
        }
        const longStep = (structure.steps || []).find((step) => String(step).length > 180);
        if (longStep) {
          failures.push({
            knowledge_id: record.knowledge_id,
            family: 'ANSWER_CLARITY',
            input,
            reason: 'initial action step exceeds 180 characters',
            actual_length: String(longStep).length
          });
          familyResults.ANSWER_CLARITY = false;
        }
        if (familyResults.ANSWER_CLARITY !== false) familyResults.ANSWER_CLARITY = true;
      }
    }

    const ranked = rankKnowledgeRecords(natural, records, {});
    runtimeChecks += 1;
    const top = ranked[0];
    const nearest = ranked.find((candidate) => candidate.record.knowledge_id !== record.knowledge_id);
    const collisionPassed = top?.record.knowledge_id === record.knowledge_id;
    familyResults.COLLISION_ISOLATION = collisionPassed;
    if (!collisionPassed) {
      failures.push({
        knowledge_id: record.knowledge_id,
        family: 'COLLISION_ISOLATION',
        input: natural,
        expected: record.knowledge_id,
        actual: top?.record.knowledge_id || null
      });
    }
    coverage.push({
      knowledge_id: record.knowledge_id,
      curated_cases: recordCases.length,
      authored_variants: (authoredRecord.driver_question_variants || []).length,
      semantic_variations: recordCases.reduce((sum, item) => sum + (item.semantic_variations || []).length, 0),
      clarification_applicable: hasClarificationCase,
      multi_turn_covered: conversationIds.has(record.knowledge_id),
      nearest_competitor: nearest?.record.knowledge_id || null,
      nearest_competitor_score: nearest?.score || 0,
      families: { ...structural, ...familyResults }
    });
  }

  const summary = {
    product: 'Ready Route Answers',
    evaluation: 'record_by_record_gold_gate',
    generated_at: new Date().toISOString(),
    published_records: records.length,
    records_with_complete_gold_coverage: coverage.filter((item) => (
      Object.values(item.families).every(Boolean)
    )).length,
    test_families: [
      'curated case', 'authored variants', 'natural question', 'short question',
      'typo', 'shorthand', 'extra detail', 'multi-turn when applicable',
      'nearest-record collision isolation', 'compact answer clarity'
    ],
    runtime_checks: runtimeChecks,
    failures: failures.length,
    gate: failures.length ? 'FAIL' : 'PASS',
    failure_details: failures.slice(0, 200),
    coverage
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (failures.length) process.exitCode = 2;
  return summary;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { main, shorthandVariant, typoVariant };
