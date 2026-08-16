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
  ['MISDELIVERY_SHORT', 'I recovered a package I misdelivered.', 'ANSWER', 'KNO-DEL-MISDELIVERY-RECOVERY-001', 'Use Code 17 for the recovered misdelivery.'],
  ['COD_MULTI', 'I have three COD packages at one stop', 'ANSWER', 'KNO-DEL-COD-MULTI-001', 'Handle every COD package separately: verify each package amount, review the combined stop total, and complete a separate COD screen for each package.'],
  ['COD_PREFILLED', 'The COD amount was prefilled. Do I still verify it', 'ANSWER', 'KNO-DEL-COD-MULTI-001', 'Yes. Verify the correct COD amount even when the scan prepopulates it.'],
  ['COD_MISMATCH_NATURAL', 'The COD amount on one package does not match what FORGE shows. Should I just use the screen amount?', 'ANSWER', 'KNO-DEL-COD-MULTI-001', 'No. Do not use a mismatched screen amount.'],
  ['COD_REFUSAL_BOUNDARY', 'The customer refuses a COD package', 'ESCALATE', null, null],
  ['CRITICAL_HEALTH', 'I have a Critical Healthcare delivery', 'ANSWER', 'KNO-DEL-CRITICAL-HEALTH-001', 'Treat it as a Time Definite delivery with a SenseAware ID.'],
  ['CRITICAL_TRACKER', 'What do I do with the Critical Healthcare SenseAware ID after delivery', 'ANSWER', 'KNO-DEL-CRITICAL-HEALTH-001', 'Remove it before handing over the delivered package, then return it to station personnel.'],
  ['CRITICAL_TRACKER_NATURAL', 'Can I remove the Critical Healthcare tracker before I deliver the package?', 'ANSWER', 'KNO-DEL-CRITICAL-HEALTH-001', 'No. Keep the SenseAware ID attached until the package is delivered.'],
  ['BULK_BARCODE', 'Does one bulk barcode mean there is only one package', 'ANSWER', 'KNO-FORGE-BULK-001', 'No. One bulk barcode can represent many physical packages.'],
  ['BULK_COUNT', 'Can I accept the displayed bulk pickup count without counting', 'ANSWER', 'KNO-FORGE-BULK-001', 'No. Verify the actual physical-package count before accepting it.'],
  ['BULK_COUNT_NATURAL', 'FORGE shows 18 bulk pieces. Can I accept that count without counting the boxes?', 'ANSWER', 'KNO-FORGE-BULK-001', 'No. Verify the actual physical-package count before accepting it.'],
  ['ORDINARY_REFUSAL', 'The recipient is here and refuses this ordinary delivery', 'ANSWER', 'KNO-DEL-REFUSED-001', 'Use Code 006 for an ordinary delivery package the present recipient explicitly refuses.'],
  ['REFUSAL_NOT_HOME', 'Nobody is home. Is that Code 006 refused', 'ANSWER', 'KNO-DEL-REFUSED-001', 'No. Do not use Code 006 merely because the recipient is absent.'],
  ['ORDINARY_REFUSAL_NATURAL', 'The customer is standing here and refuses this regular delivery. What code do I use?', 'ANSWER', 'KNO-DEL-REFUSED-001', 'Use Code 006 for an ordinary delivery package the present recipient explicitly refuses.'],
  ['REFUSAL_NOT_HOME_NATURAL', 'Nobody is home. Should I use Code 006 because they did not accept the package?', 'ANSWER', 'KNO-DEL-REFUSED-001', 'No. Do not use Code 006 merely because the recipient is absent.'],
  ['ZIP_CORRECTION', 'I typed the wrong ZIP after scanning the package', 'ANSWER', 'KNO-FORGE-EDIT-ADDRESS-001', 'Use Edit Address, then choose ReEnter to correct the ZIP.'],
  ['MOVED_RECIPIENT', 'The recipient moved and is not at the label address', 'ANSWER', 'KNO-FORGE-EDIT-ADDRESS-001', 'Use Code 002 and return the package to the station.'],
  ['MOVED_RECIPIENT_NATURAL', 'The label address looks wrong, but I know where the customer moved. Can I change the delivery address myself?', 'ANSWER', 'KNO-FORGE-EDIT-ADDRESS-001', 'Use Code 002 and return the package to the station.'],
  ['ADDRESS_ESTABLISHED_NATURAL', 'The shipping label supports the corrected address. How do I edit the delivery address in FORGE?', 'ANSWER', 'KNO-FORGE-EDIT-ADDRESS-001', 'Open Stop Details, choose Stop Options and Edit Address, enter the correct address, tap ACCEPT, and verify the update.'],
  ['UNMANIFESTED_AUTHORIZED', 'Station assigned me a package that is not on my manifest and the label has the address', 'ANSWER', 'KNO-FORGE-UNMANIFESTED-DELIVERY-001', 'Scan it, select Delivery, enter the label-supported stop details, and choose the actual business or residential type.'],
  ['UNMANIFESTED_OTHER_ROUTE', 'The unmanifested package belongs to another route', 'ANSWER', 'KNO-FORGE-UNMANIFESTED-DELIVERY-001', 'Do not use the new-stop workflow to self-assign another route\'s package. Contact station or management.'],
  ['UNMANIFESTED_AUTHORIZED_NATURAL', 'Station assigned me a package that is not on my manifest, and the label has the address. How do I add it?', 'ANSWER', 'KNO-FORGE-UNMANIFESTED-DELIVERY-001', 'Scan it, select Delivery, enter the label-supported stop details, and choose the actual business or residential type.'],
  ['UNMANIFESTED_OTHER_ROUTE_NATURAL', 'This unmanifested package belongs to another route. Can I add it as a new stop?', 'ANSWER', 'KNO-FORGE-UNMANIFESTED-DELIVERY-001', 'Do not use the new-stop workflow to self-assign another route\'s package. Contact station or management.'],
  ['VLAD_ALCOHOL_INTOXICATED', "There's a case of wine here but the guy who answered looks pretty drunk. Can I still hand it to him?", 'ANSWER', 'KNO-DEL-ALCOHOL-001', 'No. Do not deliver alcohol to a visibly intoxicated person.'],
  ['VLAD_BUSINESS_CLOSED', "I knocked and nobody answered at this business. It's locked up, what do I do with the package?", 'ANSWER', 'KNO-DEL-BUS-CLOSED-001', 'Use Code 004 when the closed business has no authorized release path.'],
  ['VLAD_CALLTAG_REFUSED', "I picked up a return package but the customer won't give it to me, they're refusing it.", 'ANSWER', 'KNO-PUP-CALLTAG-REFUSED-001', 'Use Code 006 for the refused call tag.'],
  ['VLAD_HAZMAT_LEAK', "This box has a hazard sticker on it and it looks like it's leaking. Should I still take it?", 'ANSWER', 'KNO-HAZ-LEAK-001', 'No. Do not handle, pick up, or deliver the leaking Hazmat package.'],
  ['VLAD_MISDELIVERY', 'I marked a package delivered but then realized I actually dropped it at the wrong house.', 'CLARIFY', null, null],
  ['VLAD_PICKUP_SCANNER', "My scanner just died at this pickup stop and I've got a bunch of boxes to log.", 'ANSWER', 'KNO-PUP-SCANNER-FAIL-001', 'Use Code 26 when scanning technology prevents the pickup scans.'],
  ['VLAD_APARTMENT_OFFICE', "I'm at an apartment building, nobody's answering the buzzer, but the front office said they'd take the package.", 'ANSWER', 'KNO-DEL-APT-001', 'Use the front office only when an authorized employee accepts and signs for the package.'],
  ['VLAD_LOST_BADGE', 'I lost my badge today, can another driver just scan me in?', 'ANSWER', 'KNO-SEC-LOST-BADGE-001', 'No. Never use another person’s badge; report the loss and get a replacement.'],
  ['VLAD_SHIPPER_RELEASE', 'The customer says the shipper told them I can just leave it, no signature needed. Is that true?', 'ANSWER', 'KNO-DEL-SHIPPER-RELEASE-001', 'No. A customer statement is not shipper-release authorization.'],
  ['VLAD_HAL_UNABLE', "I'm supposed to drop this off at a hold location but they're saying they can't take it.", 'ANSWER', 'KNO-DEL-HAL-UNABLE-001', 'Use the branch that matches whether the HAL stop is still open.'],
  ['VLAD_HOS_LONG', "I've been driving a really long time today, am I allowed to keep going?", 'CLARIFY', null, null],
  ['VLAD_THREAT', 'Someone at this stop is threatening me, what should I do right now?', 'ANSWER', 'KNO-SEC-ROUTE-001', 'Protect yourself—leave safely if you can and do not resist for the packages.'],
  ['VLAD_REPORTER', 'A reporter came up and started asking me questions about my job.', 'ANSWER', 'KNO-COMMS-MEDIA-001', 'Direct the reporter to FedEx station staff or management.'],
  ['VLAD_PHOTO', 'Do I need to take a photo of this delivery before I drive off?', 'CLARIFY', null, null],
  ['VLAD_BULK', 'This is a huge bulk shipment, do I handle it different?', 'ANSWER', 'KNO-FORGE-BULK-001', 'Treat the bulk count as physical packages, not as one package per barcode.'],
  ['VLAD_VEHICLE_CHANGE', "I'm switching vehicles in the middle of my route.", 'ANSWER', 'KNO-FORGE-VEHICLE-CHANGE-001', 'Open the FORGE left-side menu and select Change Vehicle.'],
  ['VLAD_CLASSIFICATION', "I can't tell if this address is a house or a business, how do I mark the stop?", 'ANSWER', 'KNO-DEL-CLASSIFICATION-001', 'Classify the actual delivery point; if the definitions still do not resolve it, choose Business/Commercial.'],
  ['VLAD_SAFE_PORCH', 'It looks like I can safely leave this on the porch, is that ok without a signature?', 'ANSWER', 'KNO-DEL-PLACEMENT-HAZARD-001', 'Yes, only if the package is eligible for residential driver release.'],
  ['VLAD_SIGNATURE_CLARIFIER', "I'm at the house with the signature package, but no one's home. What should I do?", 'CLARIFY', null, null],
  ['VLAD_BIZ_CLOSED', 'biz closed', 'ANSWER', 'KNO-DEL-BUS-CLOSED-001', 'Do not leave the package unless an authorized release path applies; use Code 011 for a weekend closure, otherwise use Code 004 when release is not permitted.'],
  ['VLAD_FORGE_WEIGHT', 'The scanner is asking me for the weight of this pickup box.', 'CLARIFY', null, null],
  ['VLAD_FORGE_RECEIPT', 'The customer wants a receipt for the packages I just picked up.', 'ANSWER', 'KNO-PUP-RECEIPT-001', null],
  ['VLAD_FORGE_DEVICE_TIME', "Forge won't let me log in, it says the date on my device is wrong.", 'ANSWER', 'KNO-FORGE-DEVICE-TIME-001', null],
  ['VLAD_STATION_HOLD', 'The customer wants me to hold their package at the station instead of delivering it.', 'ANSWER', 'KNO-DEL-HOLD-STATION-001', 'Use Code 15 when the recipient requests station hold for pickup.'],
  ['VLAD_DOORTAG_ERROR', 'I wrote the wrong thing on the door tag, what do I do now?', 'ANSWER', 'KNO-DEL-DOORTAG-CORRECTION-001', 'Stop before knowingly scanning or leaving the incorrect door tag.'],
  ['VLAD_LATE_MISDELIVERY', "I found a package yesterday that I'd actually left at the wrong address.", 'ANSWER', 'KNO-DEL-MISDELIVERY-LATE-RETRIEVAL-001', 'Use Code 361 when retrieving a misdelivered package after the day it was misdelivered.'],
  ['VLAD_DOG_OWNER_APPROVED', 'A dog is loose in the front yard. What should I do?', 'ANSWER', 'KNO-DEL-ANIMAL-HAZARD-001', 'Use Code 7.'],
  ['VLAD_END_OF_SHIFT_GAP', 'I finished my route. What is the complete end-of-shift close-out procedure?', 'ESCALATE', null, null],
  ['VLAD_TOBACCO_GAP', 'How do I deliver a tobacco package?', 'ESCALATE', null, null]
].map(([caseId, question, expectedMode, expectedKnowledgeId, expectedDirectAnswer]) => ({
  case_id: caseId,
  question,
  expected_mode: expectedMode,
  expected_knowledge_id: expectedKnowledgeId,
  expected_direct_answer: expectedDirectAnswer,
  ai_interpretation_mode: 'OFF'
}));

const AI_PREVIEW_CASES = [
  {
    case_id: 'AI_SIGNATURE_CONTEXT',
    question: 'I have a signature package and nobody is home.',
    expected_mode: 'CLARIFY',
    expected_knowledge_id: null,
    expected_direct_answer: null,
    expected_clarification: 'What signature service does FORGE show',
    ai_interpretation_mode: 'ACTIVE'
  },
  {
    case_id: 'AI_CLOSED_PICKUP_CONTEXT',
    question: 'The pickup location is closed and I got zero packages.',
    expected_mode: 'ANSWER',
    expected_knowledge_id: 'KNO-PUP-CANCELED-001',
    expected_direct_answer: null,
    ai_interpretation_mode: 'ACTIVE'
  },
  {
    case_id: 'AI_DELIVERY_PHOTO_CONTEXT',
    question: 'Do I need to take a picture of this delivery?',
    expected_mode: 'CLARIFY',
    expected_knowledge_id: null,
    expected_direct_answer: null,
    expected_clarification: 'photo',
    ai_interpretation_mode: 'ACTIVE'
  }
];

CASES.push(...AI_PREVIEW_CASES);

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
    || result?.candidates?.[0]?.knowledge_id
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
          body: JSON.stringify({
            question: testCase.question,
            ai_interpretation_mode: testCase.ai_interpretation_mode
          })
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
        } else if (
          testCase.expected_clarification
          && !String(result?.clarification_prompt || '').toLowerCase().includes(
            testCase.expected_clarification.toLowerCase()
          )
        ) {
          failure = `Expected clarification containing ${JSON.stringify(testCase.expected_clarification)}; received ${JSON.stringify(result?.clarification_prompt || null)}`;
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
          direct_answer: testCase.expected_direct_answer,
          clarification_prompt_contains: testCase.expected_clarification || null
        },
        actual: result ? {
          response_mode: result.response_mode || null,
          knowledge_id: selectedKnowledgeId(result),
          direct_answer: result.answer_structure?.direct_answer || result.answer || null,
          clarification_prompt: result.clarification_prompt || null,
          escalation_message: result.escalation_message || null,
          interaction_id: result.interaction_id || null,
          interpretation_mode: result.interpretation_mode || null,
          interpretation_status: result.interpretation_result?.status || null,
          proposed_knowledge_id: result.interpretation_result?.proposed_knowledge_id || null,
          proposed_response_mode: result.interpretation_result?.proposed_response_mode || null,
          proposed_answer_pattern_id: result.interpretation_result?.proposed_answer_pattern_id || null,
          interpreted_facts: result.interpretation_result?.facts || null,
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
