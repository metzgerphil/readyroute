const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const bcrypt = require('bcrypt');
const { createClient } = require('@supabase/supabase-js');

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (_error) {
    throw new Error(`${url} returned non-JSON status ${response.status}`);
  }
  if (!response.ok) {
    throw new Error(`${url} returned status ${response.status}: ${body?.error || 'request failed'}`);
  }
  return body;
}

async function main() {
  const backendUrl = requiredEnv('STAGING_BACKEND_URL').replace(/\/$/, '');
  const supabaseUrl = requiredEnv('SUPABASE_URL');
  const serviceKey = requiredEnv('SUPABASE_SERVICE_KEY');
  assert.match(backendUrl, /^https:\/\/readyroute-api-staging-[a-z0-9-]+\.us-west1\.run\.app$/);
  assert.equal(new URL(supabaseUrl).hostname, 'xtzbjlmizmdfqelvhhwx.supabase.co');

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const runId = crypto.randomUUID();
  const accountId = crypto.randomUUID();
  const driverId = crypto.randomUUID();
  const email = `grounded-ai-smoke-${runId}@readyroute.test`;
  const password = `Staging-${crypto.randomBytes(18).toString('base64url')}!`;
  const passwordHash = await bcrypt.hash(password, 10);
  const startedAt = Date.now();

  try {
    let result = await supabase.from('accounts').insert({
      id: accountId,
      company_name: `Canonical answer staging smoke ${runId}`,
      plan: 'starter',
      subscription_status: 'smoke_test',
      account_status: 'active',
      driver_starter_pin: '1234',
      operations_timezone: 'America/Los_Angeles'
    });
    if (result.error) throw result.error;

    result = await supabase.from('drivers').insert({
      id: driverId,
      account_id: accountId,
      name: 'Canonical Answer Smoke Driver',
      email,
      pin: passwordHash,
      password_hash: passwordHash,
      invited_at: new Date().toISOString(),
      invite_accepted_at: new Date().toISOString(),
      is_active: true
    });
    if (result.error) throw result.error;

    const login = await requestJson(`${backendUrl}/auth/driver/login`, {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        device_id: `staging-grounded-ai-${runId}`,
        device_name: 'GitHub staging smoke'
      })
    });
    assert.ok(login.token, 'Staging driver login did not return a token');
    const headers = { Authorization: `Bearer ${login.token}` };

    const scenarios = [
      {
        name: 'camera-scan-answer',
        question: 'turned camera scan on now side button dead',
        responseMode: 'ANSWER',
        compositionMode: 'DETERMINISTIC',
        knowledgeId: 'KNO-FORGE-CAMERA-SCAN-001'
      },
      {
        name: 'recorded-media-answer',
        question: 'reporter wants a recorded interview',
        responseMode: 'ANSWER',
        compositionMode: 'DETERMINISTIC',
        knowledgeId: 'KNO-COMMS-MEDIA-001'
      },
      {
        name: 'signature-clarification',
        question: 'sig pkg nobody home',
        responseMode: 'CLARIFY',
        compositionMode: 'DETERMINISTIC'
      },
      {
        name: 'alcohol-signing-answer',
        question: "Who can sign for this package I think it's alcohol",
        responseMode: 'ANSWER',
        compositionMode: 'DETERMINISTIC',
        knowledgeId: 'KNO-DEL-ALCOHOL-001',
        answerPatterns: [/21\+|21 or older/i, /photo ID/i],
        optionLabels: [
          'Cannot deliver — residential',
          'Cannot deliver — non-residential',
          'Recipient refuses to provide ID',
          'Valid ID will not scan'
        ]
      },
      {
        name: 'alcohol-residential-code-answer',
        question: 'Alcohol package has no eligible signer at this residential stop',
        responseMode: 'ANSWER',
        compositionMode: 'DETERMINISTIC',
        knowledgeId: 'KNO-DEL-ALCOHOL-001',
        answerPatterns: [/Status Code 007/i]
      },
      {
        name: 'alcohol-nonresidential-code-answer',
        question: 'Alcohol package has no eligible signer at this non-residential stop',
        responseMode: 'ANSWER',
        compositionMode: 'DETERMINISTIC',
        knowledgeId: 'KNO-DEL-ALCOHOL-001',
        answerPatterns: [/Status Code 004/i]
      },
      {
        name: 'alcohol-id-refusal-code-answer',
        question: 'Alcohol recipient refuses to provide ID',
        responseMode: 'ANSWER',
        compositionMode: 'DETERMINISTIC',
        knowledgeId: 'KNO-DEL-ALCOHOL-001',
        answerPatterns: [/Status Code 006/i]
      },
      {
        name: 'alcohol-id-scan-contingency-answer',
        question: 'Alcohol valid ID barcode will not scan',
        responseMode: 'ANSWER',
        compositionMode: 'DETERMINISTIC',
        knowledgeId: 'KNO-DEL-ALCOHOL-001',
        answerPatterns: [/Do not use a non-delivery code/i, /manual DOB entry/i]
      },
      {
        name: 'alcohol-missing-stop-type-clarification',
        question: 'Alcohol package has no eligible signer what code',
        responseMode: 'CLARIFY',
        compositionMode: 'DETERMINISTIC'
      },
      {
        name: 'isr-residential-code-answer',
        question: 'ISR no approved release path at residential stop',
        responseMode: 'ANSWER',
        compositionMode: 'DETERMINISTIC',
        knowledgeId: 'KNO-DEL-SIG-ISR-001',
        answerPatterns: [/Status Code 007/i]
      },
      {
        name: 'hazmat-weekend-code-answer',
        question: 'Hazmat business is closed on the weekend',
        responseMode: 'ANSWER',
        compositionMode: 'DETERMINISTIC',
        knowledgeId: 'KNO-DEL-HAZMAT-SIGNATURE-001',
        answerPatterns: [/Status Code 011/i]
      },
      {
        name: 'incomplete-refusal-escalation',
        question: "Customer won't take delivery",
        responseMode: 'ESCALATE',
        compositionMode: 'DETERMINISTIC'
      },
      {
        name: 'accident-scene-critical-answer',
        question: 'I was just in a crash. What should I do first?',
        responseMode: 'ANSWER',
        compositionMode: 'DETERMINISTIC',
        knowledgeId: 'KNO-INC-ACCIDENT-SCENE-001',
        answerPatterns: [/(?:9-1-1|911)/i, /(?:safe|safety)/i]
      },
      {
        name: 'signature-falsification-critical-answer',
        question: 'Can I sign the scanner for the customer to save time?',
        responseMode: 'ANSWER',
        compositionMode: 'DETERMINISTIC',
        knowledgeId: 'KNO-ETH-FALSIFICATION-001',
        answerPatterns: [/(?:do not|never)/i, /(?:sign|signature|forge)/i]
      },
      {
        name: 'prescan-critical-answer',
        question: 'Can I prescan all my stops before I leave the station?',
        responseMode: 'ANSWER',
        compositionMode: 'DETERMINISTIC',
        knowledgeId: 'KNO-DEL-SCAN-INTEGRITY-001',
        answerPatterns: [/(?:do not|don't|never)/i, /(?:pre-?scan|customer location|actually happens)/i]
      },
      {
        name: 'accident-driver-wording-answer',
        question: 'Someone hit my truck and nobody looks hurt. What should I do?',
        responseMode: 'ANSWER',
        compositionMode: 'DETERMINISTIC',
        knowledgeId: 'KNO-INC-ACCIDENT-SCENE-001'
      },
      {
        name: 'accident-media-boundary-answer',
        question: 'A reporter is asking me about an accident. Can I talk to them?',
        responseMode: 'ANSWER',
        compositionMode: 'DETERMINISTIC',
        knowledgeId: 'KNO-COMMS-MEDIA-001'
      },
      {
        name: 'plain-language-hos-answer',
        question: 'How many hours am I allowed to drive today?',
        responseMode: 'ANSWER',
        compositionMode: 'DETERMINISTIC',
        knowledgeId: 'KNO-HOS-DUTY-LIMITS-001'
      },
      {
        name: 'plain-language-pickup-capacity-answer',
        question: 'My truck is full and I still have a pickup. What should I do?',
        responseMode: 'ANSWER',
        compositionMode: 'DETERMINISTIC',
        knowledgeId: 'KNO-PUP-VEHICLE-CAPACITY-001'
      }
    ];
    const summary = [];

    for (const scenario of scenarios) {
      const before = Date.now();
      const answer = await requestJson(`${backendUrl}/driver-help/query`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ question: scenario.question })
      });
      assert.equal(answer.response_mode, scenario.responseMode, `${scenario.name} response mode`);
      assert.equal(answer.composition_mode, scenario.compositionMode, `${scenario.name} composition mode`);
      if (scenario.knowledgeId) {
        const trace = (answer.trace || []).find((record) => (
          record.knowledge_id === scenario.knowledgeId
        ));
        assert.ok(trace, `${scenario.name} selected record`);
        assert.deepEqual(
          trace.composition_source_paths || [],
          [],
          `${scenario.name} returned the canonical record without a rewrite`
        );
      }
      for (const pattern of scenario.answerPatterns || []) {
        assert.match(answer.answer || '', pattern, `${scenario.name} required answer instruction`);
      }
      for (const label of scenario.optionLabels || []) {
        assert.ok(
          (answer.answer_structure?.options || []).some((option) => option.label === label),
          `${scenario.name} answer option ${label}`
        );
      }
      summary.push({
        name: scenario.name,
        response_mode: answer.response_mode,
        composition_mode: answer.composition_mode,
        selected_knowledge_ids: (answer.trace || []).map((record) => record.knowledge_id),
        latency_ms: Date.now() - before
      });
    }

    const closedBusinessClarification = await requestJson(`${backendUrl}/driver-help/query`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ question: 'What do I do when a business is closed?' })
    });
    assert.equal(closedBusinessClarification.response_mode, 'CLARIFY', 'closed-business question response mode');
    const closedBusinessOption = (closedBusinessClarification.clarification_options || []).find((option) => (
      option.knowledge_id === 'KNO-DEL-BUS-CLOSED-001'
    ));
    assert.ok(closedBusinessOption, 'closed-business question offers the assigned-delivery procedure');

    const closedBusinessAnswer = await requestJson(`${backendUrl}/driver-help/query`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        question: closedBusinessOption.query || closedBusinessOption.label,
        session_id: closedBusinessClarification.session_id
      })
    });
    assert.equal(closedBusinessAnswer.response_mode, 'ANSWER', 'selected closed-business option response mode');
    assert.ok(
      (closedBusinessAnswer.trace || []).some((record) => record.knowledge_id === 'KNO-DEL-BUS-CLOSED-001'),
      'selected closed-business option returns its offered verified record'
    );
    summary.push({
      name: 'closed-business-clarification-selection',
      response_mode: closedBusinessAnswer.response_mode,
      composition_mode: closedBusinessAnswer.composition_mode,
      selected_knowledge_ids: (closedBusinessAnswer.trace || []).map((record) => record.knowledge_id)
    });

    console.log(JSON.stringify({
      staging_canonical_answers: 'passed',
      duration_ms: Date.now() - startedAt,
      scenarios: summary
    }, null, 2));
  } finally {
    const cleanup = await supabase.from('accounts').delete().eq('id', accountId);
    if (cleanup.error) throw cleanup.error;
  }
}

main().catch((error) => {
  console.error(`Staging canonical-answer smoke failed: ${error.message}`);
  process.exitCode = 1;
});
