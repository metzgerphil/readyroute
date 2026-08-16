#!/usr/bin/env node

const fs = require('fs');

const CASES = [
  ['LOCKER_FULL', 'The apartment locker is full. What do I do?', 'ANSWER', 'KNO-DEL-LOCKER-FAIL-001', 'Do not leave the package outside the full locker.'],
  ['LOCKER_FIT', 'This package won’t fit in the third-party locker.', 'ANSWER', 'KNO-DEL-LOCKER-FAIL-001', 'Do not leave the package beside the locker.'],
  ['LOCKER_WRONG', 'I accidentally put the package in the wrong locker.', 'ANSWER', 'KNO-DEL-LOCKER-FAIL-001', 'Contact the locker vendor or property management to recover the package.'],
  ['MISDELIVERY_RECOVERED', 'I recovered a package that I delivered to the wrong house.', 'ANSWER', 'KNO-DEL-MISDELIVERY-RECOVERY-001', 'Use Code 17 for the recovered misdelivery.'],
  ['MISDELIVERY_TODAY', 'I recovered the misdelivery and can deliver it to the correct address today.', 'ANSWER', 'KNO-DEL-MISDELIVERY-RECOVERY-001', 'Use Code 17 for the recovery, then Code 18 only after the correct-address delivery succeeds today.'],
  ['PLACEMENT', 'Where should I place an eligible residential package?', 'ANSWER', 'KNO-DEL-PLACEMENT-HAZARD-001', 'Use a secure, weather-protected location out of public view that follows the customer instructions.'],
  ['MAILBOX', 'Can I put the package next to the customer’s mailbox?', 'ANSWER', 'KNO-DEL-PLACEMENT-HAZARD-001', 'No. Never place a package in, on, or around a mailbox.'],
  ['GARAGE_BOUNDARY', 'Can I leave this package inside the customer’s garage?', 'ESCALATE', null, null],
  ['PRESCAN_ALL', 'Can I scan all my packages in the truck before walking to the doors?', 'ANSWER', 'KNO-DEL-SCAN-INTEGRITY-001', 'No. Scan each package at the customer location when the delivery or attempt occurs.'],
  ['PRESCAN_VAN', 'Can I prescan my deliveries in the van', 'ANSWER', 'KNO-DEL-SCAN-INTEGRITY-001', 'No. Scan each delivery at the customer location when the delivery or attempt occurs.'],
  ['SCAN_ATTEMPT', 'Do I have to scan every delivery attempt?', 'ANSWER', 'KNO-DEL-SCAN-INTEGRITY-001', 'Yes. Scan every delivery attempt at the customer location when it occurs.'],
  ['KEYS', 'Can I leave the keys in the truck while I make a delivery?', 'ANSWER', 'KNO-SEC-ROUTE-001', 'No. Remove the keys or secure them in the vehicle’s key lockbox when the vehicle is not in operation.'],
  ['THREAT', 'Someone is threatening me and trying to take the packages.', 'ANSWER', 'KNO-SEC-ROUTE-001', 'Protect yourself—do not resist for the packages.'],
  ['HAZ_CHECK', 'What do I check before accepting a Hazmat pickup?', 'ANSWER', 'KNO-HAZ-ACCEPTANCE-001', 'Accept Hazmat only after the package, labels, markings, destination, and required paperwork all pass the acceptance check.'],
  ['HAZ_PAPERS_MISSING', 'The Hazmat package is missing required shipping papers.', 'ANSWER', 'KNO-HAZ-ACCEPTANCE-001', 'Do not accept the Hazmat package without the required shipping papers.'],
  ['HAZ_LEAK', 'A Hazmat package is leaking inside my truck.', 'ANSWER', 'KNO-HAZ-LEAK-001', 'Do not handle or deliver it, and do not continue the route.'],
  ['HAZ_DAMAGED', 'Can I continue my route with a damaged dangerous-goods package?', 'ANSWER', 'KNO-HAZ-LEAK-001', 'No. Do not continue the route with a damaged dangerous-goods package.'],
  ['HAZ_LOAD', 'How should I load accepted Hazmat packages?', 'ANSWER', 'KNO-HAZ-LOAD-PAPERS-001', 'Load Hazmat on the floor, arrows up, blocked and braced so it cannot move, with incompatible materials separated.'],
  ['HAZ_PAPERS_LOCATION', 'Where must I keep the Hazmat paperwork while driving?', 'ANSWER', 'KNO-HAZ-LOAD-PAPERS-001', 'Keep the required Hazmat paperwork, manifest, and ERG within arm’s reach while driving.'],
  ['HAZ_MANIFEST', 'What do I do with the Hazmat manifest after each delivery?', 'ANSWER', 'KNO-HAZ-LOAD-PAPERS-001', 'Cross each Hazmat package off the manifest after it is delivered.'],
  ['DANGEROUS_WET', 'The customer has a Dangerous When Wet package for my normal pickup.', 'ANSWER', 'KNO-HAZ-RADIOACTIVE-WET-001', 'Do not take a Dangerous When Wet package through the normal pickup.'],
  ['ACCIDENT', 'I had a minor accident, but nobody appears injured.', 'ANSWER', 'KNO-INC-ACCIDENT-REPORT-001', 'Report the accident even if nobody appears injured.'],
  ['PACKAGE_THEFT', 'Packages were stolen from my truck. Who do I notify?', 'ANSWER', 'KNO-SEC-INCIDENT-REPORT-001', 'Report the package theft to FedEx immediately.'],
  ['STATION_RECORDING', 'Can I record a video inside the FedEx station?', 'ANSWER', 'KNO-COMMS-MEDIA-001', 'No, not without FedEx authorization.'],
  ['BUSINESS_CLOSURE', 'How do I report that a business will be closed every Monday in FORGE?', 'ANSWER', 'KNO-FORGE-BUSINESS-CLOSURE-MSG-001', 'Use a Recurring Day in the FORGE Business Closure message.'],
  ['BLUE_SHEET', 'What is the Blue Sheet?', 'ANSWER', 'KNO-DOC-HANDSHEET-001', '“Blue Sheet” is an informal name; the confirmed forms are OP-207 and OP-207Res for HAL packages when FORGE or scanning is inoperable.'],
  ['BLUE_SHEET_FIELDS', 'What is the Blue Sheet? can you tell me how to complete every field', 'ANSWER', 'KNO-DOC-HANDSHEET-001', 'Ready Route cannot safely provide every field from “Blue Sheet” alone.'],
  ['BADGE', 'Can I start my route without my FedEx badge?', 'ANSWER', 'KNO-CX-APPEARANCE-001', 'No. Complete the temporary or replacement badge process before providing service.'],
  ['MISDELIVERY_SHORT', 'I recovered a package I misdelivered.', 'ANSWER', 'KNO-DEL-MISDELIVERY-RECOVERY-001', 'Use Code 17 for the recovered misdelivery.']
].map(([caseId, question, expectedMode, expectedKnowledgeId, expectedDirectAnswer]) => ({
  case_id: caseId,
  question,
  expected_mode: expectedMode,
  expected_knowledge_id: expectedKnowledgeId,
  expected_direct_answer: expectedDirectAnswer
}));

function requireEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw_response: text.slice(0, 500) };
  }
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${url} returned ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

function selectedKnowledgeId(result) {
  return result?.trace?.[0]?.knowledge_id
    || result?.selected_knowledge_ids?.[0]
    || result?.diagnostics?.trace?.[0]?.knowledge_id
    || null;
}

function usageCost(result) {
  return Number(result?.interpretation_result?.usage?.estimated_cost_usd || 0);
}

async function main() {
  const baseUrl = requireEnv('STAGING_BACKEND_URL').replace(/\/$/, '');
  const email = requireEnv('STAGING_MANAGER_BOOTSTRAP_EMAIL');
  const password = requireEnv('STAGING_MANAGER_BOOTSTRAP_PASSWORD');
  const repeat = Math.max(1, Number(option('--repeat', '3')) || 3);
  const output = option('--output', '/tmp/rra-live-stress-log.json');
  const login = await requestJson(`${baseUrl}/auth/manager/login`, {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  if (!login?.token) throw new Error('Staging manager login returned no token');

  const runs = [];
  for (let run = 1; run <= repeat; run += 1) {
    for (const testCase of CASES) {
      const startedAt = Date.now();
      let result;
      let failure = null;
      try {
        result = await requestJson(`${baseUrl}/manager/driver-help/query`, {
          method: 'POST',
          headers: { authorization: `Bearer ${login.token}` },
          body: JSON.stringify({ question: testCase.question })
        });
        const actualMode = result?.response_mode || null;
        const actualKnowledgeId = selectedKnowledgeId(result);
        const actualDirectAnswer = result?.answer_structure?.direct_answer || result?.answer || null;
        if (actualMode !== testCase.expected_mode) {
          failure = `Expected mode ${testCase.expected_mode}; received ${actualMode}`;
        } else if (testCase.expected_knowledge_id && actualKnowledgeId !== testCase.expected_knowledge_id) {
          failure = `Expected ${testCase.expected_knowledge_id}; received ${actualKnowledgeId || 'no knowledge record'}`;
        } else if (testCase.expected_direct_answer && actualDirectAnswer !== testCase.expected_direct_answer) {
          failure = `Expected direct answer ${JSON.stringify(testCase.expected_direct_answer)}; received ${JSON.stringify(actualDirectAnswer)}`;
        }
      } catch (error) {
        failure = error.message;
      }
      runs.push({
        run,
        case_id: testCase.case_id,
        question: testCase.question,
        expected: {
          response_mode: testCase.expected_mode,
          knowledge_id: testCase.expected_knowledge_id,
          direct_answer: testCase.expected_direct_answer
        },
        actual: result ? {
          response_mode: result.response_mode || null,
          knowledge_id: selectedKnowledgeId(result),
          direct_answer: result.answer_structure?.direct_answer || result.answer || null,
          clarification_prompt: result.clarification_prompt || null,
          escalation_message: result.escalation_message || null,
          interaction_id: result.interaction_id || null,
          interpretation_mode: result.interpretation_mode || null,
          estimated_cost_usd: usageCost(result)
        } : null,
        latency_ms: Date.now() - startedAt,
        status: failure ? 'FAIL' : 'PASS',
        failure
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  const failures = runs.filter((item) => item.status === 'FAIL');
  const cost = Number(runs.reduce((total, item) => (
    total + Number(item.actual?.estimated_cost_usd || 0)
  ), 0).toFixed(6));
  const report = {
    product: 'Ready Route Answers staging',
    evaluation: 'live_manager_api_stress',
    exported_at: new Date().toISOString(),
    release_commit: process.env.EXPECTED_COMMIT || null,
    repeat_runs: repeat,
    cases_per_run: CASES.length,
    total_tests: runs.length,
    passed: runs.length - failures.length,
    failed: failures.length,
    pass_rate: runs.length ? (runs.length - failures.length) / runs.length : 0,
    estimated_ai_cost_usd: cost,
    failures,
    tests: runs
  };
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    total_tests: report.total_tests,
    passed: report.passed,
    failed: report.failed,
    pass_rate: report.pass_rate,
    estimated_ai_cost_usd: report.estimated_ai_cost_usd,
    output
  }, null, 2));
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});

