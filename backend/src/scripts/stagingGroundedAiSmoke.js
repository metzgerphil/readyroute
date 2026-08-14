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
      company_name: `Grounded AI staging smoke ${runId}`,
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
      name: 'Grounded AI Smoke Driver',
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
        compositionMode: 'GROUNDED_AI',
        knowledgeId: 'KNO-FORGE-CAMERA-SCAN-001'
      },
      {
        name: 'recorded-media-answer',
        question: 'reporter wants a recorded interview',
        responseMode: 'ANSWER',
        compositionMode: 'GROUNDED_AI',
        knowledgeId: 'KNO-COMMS-MEDIA-001'
      },
      {
        name: 'signature-clarification',
        question: 'sig pkg nobody home',
        responseMode: 'CLARIFY',
        compositionMode: 'DETERMINISTIC'
      },
      {
        name: 'incomplete-refusal-escalation',
        question: "Customer won't take delivery",
        responseMode: 'ESCALATE',
        compositionMode: 'DETERMINISTIC'
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
        assert.ok(
          (answer.trace || []).some((record) => record.knowledge_id === scenario.knowledgeId),
          `${scenario.name} selected record`
        );
        assert.ok(
          (answer.trace || []).some((record) => (
            record.knowledge_id === scenario.knowledgeId
              && Array.isArray(record.composition_source_paths)
              && record.composition_source_paths.length > 0
          )),
          `${scenario.name} composition grounding trace`
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

    const evaluationScenarios = [
      {
        name: 'direct-signature-nobody-home',
        question: 'I have a direct signature package and nobody is home. What do I do?'
      },
      {
        name: 'ambiguous-signature-nobody-home',
        question: 'sig pkg nobody home'
      },
      {
        name: 'camera-scanning-side-button',
        question: 'I turned on camera scanning and now the side scan button does nothing. How do I fix it?'
      },
      {
        name: 'hazmat-leak-in-truck',
        question: 'A hazmat package is leaking in my truck. What should I do?'
      },
      {
        name: 'vehicle-accident-first-actions',
        question: 'I was just in a crash. What should I do first?'
      },
      {
        name: 'sign-for-customer',
        question: 'Can I sign the scanner for the customer to save time?'
      },
      {
        name: 'pickup-exceeds-vehicle-capacity',
        question: 'My pickup has more packages than will fit in my truck. What do I do?'
      },
      {
        name: 'prescan-before-leaving-station',
        question: 'Can I prescan all my stops before I leave the station?'
      },
      {
        name: 'customer-refuses-delivery',
        question: "The customer won't take the delivery. What should I do?"
      },
      {
        name: 'international-pickup-missing-documents',
        question: "An international pickup says documents are attached, but there aren't any. What should I do?"
      }
    ];
    const evaluation = [];

    for (const scenario of evaluationScenarios) {
      const before = Date.now();
      const answer = await requestJson(`${backendUrl}/driver-help/query`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ question: scenario.question })
      });
      evaluation.push({
        name: scenario.name,
        question: scenario.question,
        response_mode: answer.response_mode,
        composition_mode: answer.composition_mode,
        answer: answer.answer,
        more_info: answer.more_info,
        answer_structure: answer.answer_structure,
        clarification_prompt: answer.clarification_prompt,
        clarification_options: answer.clarification_options,
        escalation_message: answer.escalation_message,
        trace: answer.trace,
        latency_ms: Date.now() - before
      });
    }

    console.log(JSON.stringify({
      staging_grounded_ai: 'passed',
      duration_ms: Date.now() - startedAt,
      scenarios: summary,
      ten_question_evaluation: evaluation
    }, null, 2));
  } finally {
    const cleanup = await supabase.from('accounts').delete().eq('id', accountId);
    if (cleanup.error) throw cleanup.error;
  }
}

main().catch((error) => {
  console.error(`Staging grounded AI smoke failed: ${error.message}`);
  process.exitCode = 1;
});
