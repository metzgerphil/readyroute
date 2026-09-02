#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const jwt = require(path.join(ROOT, 'backend/node_modules/jsonwebtoken'));
const {
  buildCredentialSessionClaims,
  SESSION_SUBJECT_TYPES
} = require('../backend/src/services/credentialSession');

const CASES_PATH = path.join(
  ROOT,
  'research/fedex-ground-driver-knowledge/validation/driver_language_cases.jsonl'
);
const RECORDS_PATH = path.join(ROOT, 'knowledge/operations/publication-ready.jsonl');
const BASE_URL = String(process.env.RRA_AUDIT_BASE_URL || 'https://api.readyroute.org').replace(/\/$/, '');
const OUTPUT_PREFIX = process.env.RRA_AUDIT_OUTPUT_PREFIX
  || `/tmp/readyroute-production-driver-audit-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const DRIVER_IDS = String(process.env.RRA_AUDIT_DRIVER_IDS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const CONCURRENCY = Math.max(1, Math.min(6, Number(process.env.RRA_AUDIT_CONCURRENCY || 4)));

if (process.env.RRA_PRODUCTION_AUDIT_CONFIRMED !== 'yes') {
  throw new Error('Set RRA_PRODUCTION_AUDIT_CONFIRMED=yes to run authenticated production questions.');
}
for (const name of ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'JWT_SECRET']) {
  if (!process.env[name]) throw new Error(`Missing ${name}`);
}
if (DRIVER_IDS.length < 1) throw new Error('RRA_AUDIT_DRIVER_IDS must contain at least one driver id.');

function readJsonLines(filePath) {
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
}

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function expectedApiMode(value) {
  const mode = String(value || '').toUpperCase();
  if (mode.includes('CLARIF') || mode.includes('ASK_MINIMUM')) return 'CLARIFY';
  if (mode.includes('ESCALAT') || mode.includes('UNAVAILABLE')) return 'ESCALATE';
  return 'ANSWER';
}

const selectedType = /^(VLAD_PRIORITY_51|VLAD_APPROVED|OWNER_APPROVED_IN_APP|ROUND3|NEW_DRIVER|EXTENDED_TESTING|VLAD_FINAL)/;
const sourceCases = readJsonLines(CASES_PATH).filter((item) => selectedType.test(item.case_type || ''));
const records = new Map(readJsonLines(RECORDS_PATH).map((item) => [item.knowledge_id, item]));

const novelCases = [
  ['NOVEL-DOG-BLOCK-001', "There's a dog between me and the porch", 'CLARIFY', ['KNO-DEL-ANIMAL-HAZARD-001']],
  ['NOVEL-DOG-BITE-001', 'A dog got me on the leg', 'ANSWER', ['KNO-INCIDENT-DOG-BITE-001']],
  ['NOVEL-VAN-SMOKE-001', 'My van just started smoking', 'ANSWER', ['KNO-VEH-SMOKE-001']],
  ['NOVEL-DIZZY-001', "I'm lightheaded behind the wheel", 'ANSWER', ['KNO-INCIDENT-DRIVER-SICK-DIZZY-001']],
  ['NOVEL-FLAT-001', 'My tire blew out on route', 'ANSWER', ['KNO-VEH-BREAKDOWN-001']],
  ['NOVEL-KEYS-001', 'Truck is locked and the keys are on the seat', 'ANSWER', ['KNO-VEH-KEYS-LOCKED-001']],
  ['NOVEL-SCANNER-FROZEN-001', 'My scanner screen is frozen solid', 'ANSWER', ['KNO-FORGE-SCANNER-FROZEN-001']],
  ['NOVEL-APP-CRASH-001', 'FORGE kicked me out in the middle of the stop', 'ANSWER', ['KNO-FORGE-APP-CRASH-001']],
  ['NOVEL-DUPLICATE-TRACKING-001', 'Two boxes have identical tracking numbers', 'ANSWER', ['KNO-DEL-DUPLICATE-TRACKING-001']],
  ['NOVEL-ADDRESS-CHANGE-001', 'Recipient says to bring the box to a different address', 'CLARIFY', ['KNO-DEL-CUSTOMER-ADDRESS-CHANGE-001']],
  ['NOVEL-MINOR-001', 'A kid is the only person home', 'CLARIFY', ['KNO-DEL-MINOR-AT-DOOR-001']],
  ['NOVEL-DNA-001', 'What the heck is DNA on my delivery screen', 'ANSWER', ['KNO-GLOSSARY-DNA-001']],
  ['NOVEL-OP201-001', 'Define OP 201 for me', 'ANSWER', ['KNO-DEL-OP201-DEFINITION-001']],
  ['NOVEL-HAZMAT-DIAMOND-001', "What's this diamond hazmat sticker on the box", 'ANSWER', ['KNO-HAZ-PACKAGE-LABEL-001']],
  ['NOVEL-TORN-LABEL-001', 'Can I deliver the box if its label is ripped but still scans', 'ANSWER', ['KNO-DEL-LABEL-TORN-BARCODE-SCANS-001']],
  ['NOVEL-CANCEL-SCAN-001', 'How do I undo delivered before I finished the delivery', 'CLARIFY', ['KNO-FORGE-CANCEL-DELIVERED-SCAN-001']],
  ['NOVEL-LOW-BATTERY-001', 'My scanner battery is at two percent', 'ANSWER', ['KNO-FORGE-SCANNER-LOW-BATTERY-001']],
  ['NOVEL-PICKUP-WINDOW-001', "I won't reach the pickup before it closes", 'ANSWER', ['KNO-PUP-WINDOW-RISK-001']],
  ['NOVEL-DISPUTE-001', 'Customer says the box is missing but I already delivered it', 'ANSWER', ['KNO-DEL-CUSTOMER-NOT-RECEIVED-001']],
  ['NOVEL-RECORDING-001', 'The camera on the porch is filming me', 'ANSWER', ['KNO-CX-CUSTOMER-RECORDING-001']],
  ['NOVEL-SID-001', 'Does SID sticker mean Vision Label', 'ANSWER', ['KNO-GLOSSARY-VISION-LABEL-SID-001']],
  ['NOVEL-WA-001', 'What are the first digits on the SID sticker', 'ANSWER', ['KNO-FORGE-WORK-AREA-TERM-001']],
  ['NOVEL-COD-001', 'The customer is asking to pay me cash for the delivery', 'ANSWER', ['KNO-DEL-COD-GENERAL-001']],
  ['NOVEL-MISDELIVERY-001', 'The package went to the wrong house and I got it back', 'ANSWER', ['KNO-DEL-MISDELIVERY-RECOVERY-001']],
  ['NOVEL-MISSED-DELIVERY-001', 'I missed the delivery, what now', 'CLARIFY', []],
  ['NOVEL-COMPLAINT-001', 'A customer wants to complain about me', 'ANSWER', ['KNO-CX-GENERAL-COMPLAINT-001']],
  ['NOVEL-CALLTAG-001', 'Driver question: what exactly is a call tag', 'ANSWER', ['KNO-PUP-CALLTAG-DEFINITION-001']],
  ['NOVEL-FORGE-001', 'New driver here, what is FORGE', 'ANSWER', ['KNO-GLOSSARY-FORGE-001']],
  ['NOVEL-SERVICE-CROSS-001', 'Can you explain what the service cross is', 'ANSWER', ['KNO-GLOSSARY-SERVICE-CROSS-001']],
  ['NOVEL-MANIFEST-001', 'In plain English what is my manifest', 'ANSWER', ['KNO-GLOSSARY-MANIFEST-001']]
].map(([case_id, question, mode, expected_knowledge_ids]) => ({
  case_id,
  question,
  expected_modes: [mode],
  expected_knowledge_ids,
  source: 'novel_driver_wording'
}));

const testMap = new Map();
for (const item of sourceCases) {
  const phrasings = [item.utterance, ...(item.semantic_variations || [])].filter(Boolean);
  for (let index = 0; index < phrasings.length; index += 1) {
    const question = phrasings[index];
    const key = normalize(question);
    const existing = testMap.get(key) || {
      case_id: item.case_id,
      question,
      expected_modes: [],
      expected_knowledge_ids: [],
      source: index === 0 ? 'approved_report_question' : 'approved_semantic_variation'
    };
    existing.expected_modes = [...new Set([...existing.expected_modes, expectedApiMode(item.response_mode)])];
    existing.expected_knowledge_ids = [...new Set([
      ...existing.expected_knowledge_ids,
      ...(item.expected_knowledge_ids || [])
    ])];
    testMap.set(key, existing);
  }
}
for (const item of novelCases) {
  if (!testMap.has(normalize(item.question))) testMap.set(normalize(item.question), item);
}
const tests = [...testMap.values()];

async function supabaseRows(table, params) {
  const url = new URL(`${process.env.SUPABASE_URL}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
    }
  });
  if (!response.ok) throw new Error(`${table} lookup failed: ${response.status} ${await response.text()}`);
  return response.json();
}

function makeToken(driver) {
  const credentialHash = driver.password_hash || driver.pin;
  return jwt.sign({
    driver_id: driver.id,
    account_id: driver.account_id,
    name: driver.name,
    full_name: driver.name,
    email: driver.email,
    primary_role: 'driver',
    role: 'driver',
    ...buildCredentialSessionClaims({
      subjectType: SESSION_SUBJECT_TYPES.DRIVER,
      subjectId: driver.id,
      credentialHash
    })
  }, process.env.JWT_SECRET, { expiresIn: '2h' });
}

async function askDriver(test, driver, attempt = 1) {
  const startedAt = Date.now();
  const response = await fetch(`${BASE_URL}/driver-help/query`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${driver.token}`
    },
    body: JSON.stringify({ question: test.question })
  });
  let body = {};
  try { body = await response.json(); } catch (_error) { body = {}; }
  if ((response.status === 429 || response.status >= 500) && attempt < 3) {
    await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    return askDriver(test, driver, attempt + 1);
  }
  return {
    ...test,
    driver_email: driver.email,
    http_status: response.status,
    elapsed_ms: Date.now() - startedAt,
    interaction_id: body.interaction_id || null,
    actual_mode: body.response_mode || null,
    answer: body.answer || null,
    answer_structure: body.answer_structure || null,
    clarification_prompt: body.clarification_prompt || null,
    clarification_options: (body.clarification_options || []).map((item) => item.label),
    escalation_message: body.escalation_message || null,
    trace: (body.trace || []).map((item) => item.knowledge_id),
    interpretation_mode: body.interpretation_mode || null,
    composition_mode: body.composition_mode || null,
    request_error: body.error || null
  };
}

async function runPool(items, drivers) {
  const output = new Array(items.length);
  let cursor = 0;
  let completed = 0;
  async function worker(workerIndex) {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      output[index] = await askDriver(items[index], drivers[(index + workerIndex) % drivers.length]);
      completed += 1;
      if (completed % 20 === 0 || completed === items.length) {
        process.stderr.write(`Completed ${completed}/${items.length}\n`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, (_, index) => worker(index)));
  return output;
}

async function loadInteractionDiagnostics(ids) {
  const rows = [];
  for (let index = 0; index < ids.length; index += 40) {
    const chunk = ids.slice(index, index + 40);
    rows.push(...await supabaseRows('driver_help_interactions', {
      select: 'id,response_mode,selected_knowledge_ids,retrieval_candidates,interpretation_mode,interpretation_result,response_latency_ms',
      id: `in.(${chunk.join(',')})`
    }));
  }
  return new Map(rows.map((row) => [row.id, row]));
}

function assess(result, diagnostic) {
  const expectedIds = result.expected_knowledge_ids || [];
  const diagnosticIds = [
    ...(diagnostic?.selected_knowledge_ids || []),
    ...(diagnostic?.retrieval_candidates || []).map((item) => item.knowledge_id),
    diagnostic?.interpretation_result?.proposed_knowledge_id,
    diagnostic?.interpretation_result?.deterministic_knowledge_id
  ].filter(Boolean);
  const routedIds = [...new Set([...(result.trace || []), ...diagnosticIds])];
  const decisionIds = result.actual_mode === 'ANSWER'
    ? [...new Set(result.trace || [])]
    : routedIds;
  const modePass = result.expected_modes.includes(result.actual_mode);
  const requiresRecord = expectedIds.length > 0;
  const recordPass = !requiresRecord || expectedIds.some((id) => decisionIds.includes(id));
  const usablePass = result.actual_mode === 'ANSWER'
    ? Boolean(result.answer)
    : result.actual_mode === 'CLARIFY'
      ? Boolean(result.clarification_prompt)
      : Boolean(result.escalation_message);
  const genericClarification = result.actual_mode === 'CLARIFY'
    && result.clarification_options.length === 1
    && normalize(result.clarification_options[0]) === 'not sure';
  const pass = result.http_status === 200 && modePass && recordPass && usablePass && !genericClarification;
  const reasons = [];
  if (result.http_status !== 200) reasons.push(`HTTP ${result.http_status}`);
  if (!modePass) reasons.push(`expected ${result.expected_modes.join('/')} but received ${result.actual_mode}`);
  if (!recordPass) reasons.push(`expected ${expectedIds.join('/')} but answered through ${decisionIds.join('/') || 'no record'}`);
  if (!usablePass) reasons.push('response had no usable answer, clarification, or escalation text');
  if (genericClarification) reasons.push('clarification offered only Not sure');
  return {
    ...result,
    response_latency_ms: diagnostic?.response_latency_ms ?? result.elapsed_ms,
    routed_knowledge_ids: routedIds,
    decision_knowledge_ids: decisionIds,
    diagnostic_interpretation_mode: diagnostic?.interpretation_mode || null,
    ai_status: diagnostic?.interpretation_result?.ai?.status || diagnostic?.interpretation_result?.status || null,
    pass,
    failure_reasons: reasons
  };
}

function markdown(report) {
  const lines = [
    '# ReadyRoute production driver-answer audit',
    '',
    `Generated: ${report.generated_at}`,
    '',
    `- Questions: ${report.summary.total}`,
    `- Passed: ${report.summary.passed}`,
    `- Failed: ${report.summary.failed}`,
    `- Answer unavailable when an approved response was expected: ${report.summary.unexpected_escalations}`,
    `- Wrong-record answers: ${report.summary.wrong_record_answers}`,
    `- P95 latency: ${report.summary.p95_latency_ms} ms`,
    '',
    '## Failures',
    ''
  ];
  if (!report.failures.length) lines.push('None.');
  for (const item of report.failures) {
    lines.push(
      `### ${item.case_id}`,
      '',
      `Question: ${item.question}`,
      '',
      `Expected: ${item.expected_modes.join('/')} via ${item.expected_knowledge_ids.join('/') || 'protected flow'}`,
      '',
      `Received: ${item.actual_mode || `HTTP ${item.http_status}`} via ${item.routed_knowledge_ids.join('/') || 'no record'}`,
      '',
      `Reason: ${item.failure_reasons.join('; ')}`,
      '',
      item.answer ? `Answer: ${item.answer}` : `Prompt: ${item.clarification_prompt || item.escalation_message || 'none'}`,
      ''
    );
  }
  return `${lines.join('\n')}\n`;
}

(async () => {
  const drivers = await supabaseRows('drivers', {
    select: 'id,account_id,name,email,pin,password_hash,is_active',
    id: `in.(${DRIVER_IDS.join(',')})`
  });
  if (drivers.length !== DRIVER_IDS.length || drivers.some((driver) => driver.is_active === false)) {
    throw new Error('Every audit driver must exist and be active.');
  }
  const authenticatedDrivers = drivers.map((driver) => ({ ...driver, token: makeToken(driver) }));
  const rawResults = await runPool(tests, authenticatedDrivers);
  const interactionIds = rawResults.map((item) => item.interaction_id).filter(Boolean);
  const diagnostics = await loadInteractionDiagnostics(interactionIds);
  const results = rawResults.map((item) => assess(item, diagnostics.get(item.interaction_id)));
  const failures = results.filter((item) => !item.pass);
  const latencies = results.map((item) => Number(item.response_latency_ms || 0)).sort((a, b) => a - b);
  const wrongRecordAnswers = failures.filter((item) => (
    item.actual_mode === 'ANSWER'
    && item.expected_knowledge_ids.length > 0
    && !item.expected_knowledge_ids.some((id) => item.decision_knowledge_ids.includes(id))
  )).length;
  const report = {
    generated_at: new Date().toISOString(),
    base_url: BASE_URL,
    driver_emails: authenticatedDrivers.map((driver) => driver.email),
    selected_case_types: [...new Set(sourceCases.map((item) => item.case_type))].sort(),
    summary: {
      total: results.length,
      passed: results.length - failures.length,
      failed: failures.length,
      unexpected_escalations: failures.filter((item) => item.actual_mode === 'ESCALATE').length,
      wrong_record_answers: wrongRecordAnswers,
      average_latency_ms: Math.round(latencies.reduce((sum, value) => sum + value, 0) / Math.max(1, latencies.length)),
      p95_latency_ms: latencies[Math.max(0, Math.ceil(latencies.length * 0.95) - 1)] || 0
    },
    failures,
    results
  };
  fs.writeFileSync(`${OUTPUT_PREFIX}.json`, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(`${OUTPUT_PREFIX}.md`, markdown(report));
  console.log(JSON.stringify({
    ...report.summary,
    json_report: `${OUTPUT_PREFIX}.json`,
    markdown_report: `${OUTPUT_PREFIX}.md`
  }, null, 2));
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
