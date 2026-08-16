#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const {
  createDriverHelpAiInterpreter,
  resolveDriverHelpAiInterpretationMode,
  validateInterpretation
} = require('../services/driverHelpAiInterpreter');
const { estimateUsageCost } = require('../services/openAiUsageCost');

const root = path.resolve(__dirname, '../../..');

function readJsonl(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function expectedDecision(testCase) {
  if ([
    'ASK_MINIMUM_CLARIFICATION',
    'CLARIFY',
    'IMMEDIATE_SAFETY_ACTION_THEN_CLARIFY'
  ].includes(testCase.response_mode)) return 'CLARIFY';
  if ([
    'DIRECT_SOURCE_GROUNDED_ANSWER',
    'ALTERNATE_DOCUMENTATION',
    'ANSWER'
  ].includes(testCase.response_mode)) return 'ANSWER';
  return null;
}

function candidateRecord(record) {
  return {
    knowledge_id: record.knowledge_id,
    version: record.record_version,
    canonical_situation: record.canonical_situation,
    normalized_description: record.normalized_description || '',
    applicability: record.applicability || [],
    conditions: record.conditions || [],
    exceptions: record.exceptions || [],
    clarification_requirements: record.clarification_requirements || [],
    driver_question_variants: record.driver_question_variants || [],
    driver_question_patterns: (record.driver_question_patterns || []).map((pattern) => ({
      utterance: pattern?.utterance || '',
      response_mode: pattern?.response_mode || null,
      information_sufficiency: pattern?.information_sufficiency || null,
      must_clarify: pattern?.must_clarify || []
    }))
  };
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function main() {
  const runStartedAt = new Date();
  const configuredMode = resolveDriverHelpAiInterpretationMode();
  const interpreter = createDriverHelpAiInterpreter();
  if (!interpreter) {
    throw new Error('AI interpretation is not configured with shadow or active mode, a model, and an API key.');
  }

  const candidates = readJsonl('knowledge/operations/records.jsonl')
    .filter((record) => record.production_eligibility?.publication_ready === true)
    .map(candidateRecord);
  const cases = readJsonl('knowledge/evaluations/driver-language-cases.jsonl');
  const outOfCorpusCases = readJsonl('knowledge/evaluations/out-of-corpus-cases.jsonl');
  const allEvaluationCases = [
    ...cases.map((testCase) => ({ ...testCase, evaluation_type: 'CURATED_LANGUAGE' })),
    ...outOfCorpusCases.map((testCase) => ({ ...testCase, evaluation_type: 'OUT_OF_CORPUS' }))
  ];
  const configuredCaseIds = String(process.env.READYROUTE_AI_EVALUATION_CASE_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const caseIdFilter = new Set(configuredCaseIds);
  const filteredEvaluationCases = caseIdFilter.size
    ? allEvaluationCases.filter((testCase) => caseIdFilter.has(testCase.case_id))
    : allEvaluationCases;
  if (caseIdFilter.size && filteredEvaluationCases.length !== caseIdFilter.size) {
    const found = new Set(filteredEvaluationCases.map((testCase) => testCase.case_id));
    const missing = [...caseIdFilter].filter((caseId) => !found.has(caseId));
    throw new Error(`Unknown AI evaluation case IDs: ${missing.join(', ')}`);
  }
  const configuredMaxCases = Number(process.env.READYROUTE_AI_EVALUATION_MAX_CASES || 0);
  let evaluationCases = Number.isInteger(configuredMaxCases) && configuredMaxCases > 0
    ? filteredEvaluationCases.slice(0, configuredMaxCases)
    : filteredEvaluationCases;
  const retryReportPath = String(process.env.READYROUTE_AI_EVALUATION_RETRY_REPORT || '').trim();
  if (retryReportPath) {
    const previousReport = JSON.parse(fs.readFileSync(path.resolve(root, retryReportPath), 'utf8'));
    const failedCaseIds = new Set((previousReport.case_results || [])
      .filter((result) => result.error)
      .map((result) => result.case_id));
    evaluationCases = evaluationCases.filter((testCase) => failedCaseIds.has(testCase.case_id));
  }
  const results = new Array(evaluationCases.length);
  let nextIndex = 0;
  let nextRequestAt = 0;
  const configuredMinimumInterval = Number(process.env.READYROUTE_AI_EVALUATION_MIN_INTERVAL_MS || 0);
  const minimumIntervalMs = Number.isFinite(configuredMinimumInterval) && configuredMinimumInterval > 0
    ? configuredMinimumInterval
    : 0;

  async function waitForRequestSlot() {
    if (!minimumIntervalMs) return;
    const waitMs = Math.max(0, nextRequestAt - Date.now());
    nextRequestAt = Math.max(nextRequestAt, Date.now()) + minimumIntervalMs;
    if (waitMs) await sleep(waitMs);
  }

  async function worker() {
    while (nextIndex < evaluationCases.length) {
      const index = nextIndex;
      nextIndex += 1;
      const testCase = evaluationCases[index];
      let requestStartedAt = null;
      try {
        await waitForRequestSlot();
        requestStartedAt = Date.now();
        const raw = await interpreter({
          safety_identifier: 'rr_shadow_evaluation',
          driver_question: testCase.utterance,
          conversation_context: {},
          candidate_records: candidates
        });
        const interpretation = validateInterpretation(raw, candidates, undefined, testCase.utterance);
        const usage = estimateUsageCost(
          process.env.READYROUTE_DRIVER_HELP_MODEL,
          raw?.provider_metadata?.usage || {}
        );
        const expectedKnowledgeIds = testCase.expected_knowledge_ids || [];
        const isOutOfCorpus = testCase.evaluation_type === 'OUT_OF_CORPUS';
        const expectedResponseMode = isOutOfCorpus ? null : expectedDecision(testCase);
        const expectsNoSelection = isOutOfCorpus || expectedResponseMode === null;
        results[index] = {
          case_id: testCase.case_id,
          evaluation_type: testCase.evaluation_type,
          expected_knowledge_ids: expectedKnowledgeIds,
          actual_knowledge_id: interpretation?.knowledge_id || null,
          expected_response_mode: expectedResponseMode,
          actual_response_mode: interpretation?.decision || null,
          record_match: expectsNoSelection
            ? interpretation === null
            : Boolean(interpretation && expectedKnowledgeIds.includes(interpretation.knowledge_id)),
          response_mode_match: expectsNoSelection
            ? interpretation === null
            : interpretation?.decision === expectedResponseMode,
          valid_result: expectsNoSelection ? interpretation === null : Boolean(interpretation),
          latency_ms: Date.now() - requestStartedAt,
          provider_response_id: raw?.provider_metadata?.response_id || null,
          provider_request_id: raw?.provider_metadata?.request_id || null,
          usage,
          error: null
        };
      } catch (error) {
        results[index] = {
          case_id: testCase.case_id,
          evaluation_type: testCase.evaluation_type,
          expected_knowledge_ids: testCase.expected_knowledge_ids || [],
          actual_knowledge_id: null,
          expected_response_mode: expectedDecision(testCase),
          actual_response_mode: null,
          record_match: false,
          response_mode_match: false,
          valid_result: false,
          latency_ms: requestStartedAt ? Date.now() - requestStartedAt : null,
          usage: null,
          error: error.message || error.name || 'Error',
          provider_error: {
            status: error.status || null,
            code: error.provider_code || null,
            type: error.provider_type || null,
            request_id: error.request_id || null,
            retry_after: error.retry_after || null,
            rate_limit: error.rate_limit || null
          }
        };
      }
    }
  }

  const configuredConcurrency = Number(process.env.READYROUTE_AI_EVALUATION_CONCURRENCY || 1);
  const concurrency = Number.isInteger(configuredConcurrency) && configuredConcurrency > 0
    ? Math.min(configuredConcurrency, 4, evaluationCases.length)
    : 1;
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const validResults = results.filter((result) => result.valid_result);
  const recordMatches = results.filter((result) => result.record_match);
  const responseModeMatches = results.filter((result) => result.response_mode_match);
  const errors = results.filter((result) => result.error);
  const unsafeOutOfCorpusSelections = results.filter((result) => (
    result.evaluation_type === 'OUT_OF_CORPUS' && result.actual_knowledge_id
  ));
  const mismatches = results.filter((result) => !result.record_match || !result.response_mode_match);
  const latencies = results
    .map((result) => result.latency_ms)
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  const percentile95Index = Math.max(0, Math.ceil(latencies.length * 0.95) - 1);
  const completedUsage = results.map((result) => result.usage).filter(Boolean);
  const usageTotals = completedUsage.reduce((totals, usage) => ({
    input_tokens: totals.input_tokens + usage.input_tokens,
    cached_input_tokens: totals.cached_input_tokens + usage.cached_input_tokens,
    uncached_input_tokens: totals.uncached_input_tokens + (usage.uncached_input_tokens || 0),
    output_tokens: totals.output_tokens + usage.output_tokens,
    reasoning_tokens: totals.reasoning_tokens + usage.reasoning_tokens,
    total_tokens: totals.total_tokens + usage.total_tokens,
    estimated_cost_usd: totals.estimated_cost_usd + (usage.estimated_cost_usd || 0)
  }), {
    input_tokens: 0,
    cached_input_tokens: 0,
    uncached_input_tokens: 0,
    output_tokens: 0,
    reasoning_tokens: 0,
    total_tokens: 0,
    estimated_cost_usd: 0
  });
  usageTotals.estimated_cost_usd = Number(usageTotals.estimated_cost_usd.toFixed(6));

  const runReport = {
    run_id: `ai-shadow-${runStartedAt.toISOString().replace(/[:.]/g, '-')}`,
    started_at: runStartedAt.toISOString(),
    completed_at: new Date().toISOString(),
    configured_mode: configuredMode,
    model: process.env.READYROUTE_DRIVER_HELP_MODEL,
    pricing_as_of: completedUsage[0]?.pricing_as_of || null,
    pricing_source: completedUsage[0]?.pricing_source || null,
    pricing_per_million_tokens: completedUsage[0]?.pricing || null,
    usage: usageTotals,
    balance_before_usd: Number(process.env.READYROUTE_AI_BALANCE_BEFORE_USD) || null,
    retry_of_report: retryReportPath || null,
    case_id_filter: configuredCaseIds,
    minimum_request_interval_ms: minimumIntervalMs,
    total_cases: results.length,
    successful_api_responses: completedUsage.length,
    failed_api_requests: errors.length,
    curated_language_cases: cases.length,
    out_of_corpus_cases: outOfCorpusCases.length,
    valid_results: validResults.length,
    record_matches: recordMatches.length,
    response_mode_matches: responseModeMatches.length,
    errors: errors.length,
    provider_errors: errors.slice(0, 3).map((result) => result.provider_error),
    unsafe_out_of_corpus_selections: unsafeOutOfCorpusSelections.length,
    average_latency_ms: latencies.length
      ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
      : null,
    p95_latency_ms: latencies.length ? latencies[percentile95Index] : null,
    ready_for_active: mismatches.length === 0 && errors.length === 0,
    mismatches: mismatches.map((result) => ({
      case_id: result.case_id,
      evaluation_type: result.evaluation_type,
      expected_knowledge_ids: result.expected_knowledge_ids,
      actual_knowledge_id: result.actual_knowledge_id,
      expected_response_mode: result.expected_response_mode,
      actual_response_mode: result.actual_response_mode,
      valid_result: result.valid_result,
      error: result.error
    })),
    case_results: results
  };

  const reportDirectory = path.join(root, 'research/fedex-ground-driver-knowledge/validation/ai-runs');
  fs.mkdirSync(reportDirectory, { recursive: true });
  const reportPath = path.join(reportDirectory, `${runReport.run_id}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(runReport, null, 2)}\n`);

  const consoleReport = { ...runReport };
  delete consoleReport.case_results;
  consoleReport.report_path = path.relative(root, reportPath);
  console.log(JSON.stringify(consoleReport, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
