const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-service-role-key';

const { createManagerDriverHelpRouter } = require('./managerDriverHelp');

class QueryBuilder {
  constructor(table, rows) {
    this.table = table;
    this.rows = rows;
  }
  select() { return this; }
  eq() { return this; }
  gte() { return this; }
  order() { return this; }
  limit() { return Promise.resolve({ data: this.rows[this.table] || [], error: null }); }
  then(resolve, reject) {
    return Promise.resolve({ data: this.rows[this.table] || [], error: null }).then(resolve, reject);
  }
}

test('GET /manager/driver-help/overview returns scoped operational-help metrics', async () => {
  const rows = {
    driver_help_interactions: [
      { id: '1', response_mode: 'ANSWER', selected_knowledge_ids: ['KNO-1'], response_latency_ms: 100, canonical_trace: [{ category_paths: ['TAX-DELIVERY'] }], interpretation_mode: 'AI_SHADOW', interpretation_result: { status: 'VALID', record_agreement: true, response_mode_agreement: true, usage: { input_tokens: 100, cached_input_tokens: 20, output_tokens: 10, reasoning_tokens: 5, total_tokens: 110, estimated_cost_usd: 0.001 } } },
      { id: '2', response_mode: 'ESCALATE', selected_knowledge_ids: [], response_latency_ms: 200, interpretation_mode: 'AI_SHADOW', interpretation_result: { status: 'VALID', record_agreement: false, response_mode_agreement: false, usage: { input_tokens: 200, cached_input_tokens: 40, output_tokens: 20, reasoning_tokens: 10, total_tokens: 220, estimated_cost_usd: 0.002 } } },
      { id: '3', response_mode: 'CLARIFY', selected_knowledge_ids: [], response_latency_ms: 300, interpretation_mode: 'AI_SHADOW_FALLBACK', interpretation_result: { status: 'ERROR' } },
      { id: '4', response_mode: 'ANSWER', selected_knowledge_ids: ['KNO-2'], response_latency_ms: 400, canonical_trace: [{ category_paths: ['TAX-PICKUP'] }], interpretation_mode: 'GROUNDED_AI', interpretation_result: { status: 'VALID', ai: { status: 'GROUNDED', retried: true, call_count: 2 } } }
    ],
    driver_help_unanswered_questions: [{ id: 'u1', status: 'open' }],
    driver_help_feedback: [{ id: 'f1', rating: 'down' }, { id: 'f2', rating: 'up' }],
    drivers: [{ id: 'driver-1' }, { id: 'driver-2' }]
  };
  const supabase = { from: (table) => new QueryBuilder(table, rows) };
  const app = express();
  app.use((req, _res, next) => {
    req.account = { account_id: 'account-1', role: 'manager' };
    next();
  });
  app.use('/manager/driver-help', createManagerDriverHelpRouter({ supabase }));

  const response = await request(app).get('/manager/driver-help/overview');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.metrics, {
    total_questions: 4,
    active_drivers: 2,
    questions_per_active_driver: 2,
    approved_answers: 2,
    clarifications: 1,
    escalations: 1,
    feedback_count: 2,
    helpful_feedback: 1,
    negative_feedback: 1,
    feedback_response_rate: 1 / 2,
    helpful_rate: 1 / 2,
    canonical_match_rate: 1 / 2,
    no_verified_answer_rate: 1 / 4,
    average_response_latency_ms: 250,
    p95_response_latency_ms: 400,
    retrieval_failures: 1,
    ai_interpretation_runs: 1,
    ai_interpretation_grounded: 1,
    ai_interpretation_failures: 0,
    ai_interpretation_retries: 1,
    ai_interpretation_calls: 2,
    ai_interpretation_success_rate: 1,
    ai_shadow_runs: 3,
    ai_shadow_valid_results: 2,
    ai_shadow_errors: 1,
    ai_shadow_usage: {
      input_tokens: 300,
      cached_input_tokens: 60,
      output_tokens: 30,
      reasoning_tokens: 15,
      total_tokens: 330,
      estimated_cost_usd: 0.003
    },
    ai_shadow_record_agreement_rate: 1 / 2,
    ai_shadow_response_mode_agreement_rate: 1 / 2,
    questions_by_category: { 'TAX-DELIVERY': 1, UNMATCHED: 2, 'TAX-PICKUP': 1 }
  });
  assert.equal(response.body.unanswered_questions.length, 1);
});

test('POST /manager/driver-help/query uses manager identity and returns diagnostics for the test console', async () => {
  const calls = [];
  const service = {
    async answerQuestion(input) {
      calls.push(input);
      return {
        interaction_id: 'interaction-1',
        response_mode: 'ANSWER',
        answer: 'Use Code 24.',
        interpretation_mode: 'AI_SHADOW',
        interpretation_result: { proposed_knowledge_id: 'KNO-PUP-CANCELED-001' }
      };
    }
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.account = {
      account_id: '00000000-0000-0000-0000-000000000001',
      manager_user_id: '00000000-0000-0000-0000-000000000002',
      role: 'manager'
    };
    next();
  });
  app.use('/manager/driver-help', createManagerDriverHelpRouter({
    supabase: { from: () => new QueryBuilder('unused', {}) },
    service
  }));

  const response = await request(app)
    .post('/manager/driver-help/query')
    .send({ question: 'pickup canceled before I went' });

  assert.equal(response.status, 200);
  assert.equal(response.body.interpretation_mode, 'AI_SHADOW');
  assert.deepEqual(calls[0], {
    accountId: '00000000-0000-0000-0000-000000000001',
    driverId: null,
    actorType: 'manager',
    actorId: '00000000-0000-0000-0000-000000000002',
    question: 'pickup canceled before I went',
    sessionId: null,
    includeDiagnostics: true,
    aiInterpretationModeOverride: 'ACTIVE'
  });

  const deterministicResponse = await request(app)
    .post('/manager/driver-help/query')
    .send({
      question: 'pickup canceled before I went',
      ai_interpretation_mode: 'OFF'
    });

  assert.equal(deterministicResponse.status, 200);
  assert.equal(calls[1].aiInterpretationModeOverride, 'OFF');
});

test('GET staff answer memory includes retained company usage and hides no review context', async () => {
  const routeKey = 'remembered-route-1';
  const rows = {
    driver_help_answer_memory: [{
      route_key: routeKey,
      normalized_question: `route:${routeKey}`,
      knowledge_id: 'KNO-DEL-BUS-CLOSED-001',
      knowledge_version: 1,
      response_mode: 'ANSWER',
      risk_tier: 'STANDARD',
      status: 'SUSPENDED',
      agreement_count: 4,
      disagreement_count: 1,
      negative_feedback_count: 0,
      audit_disagreement_count: 1
    }],
    driver_help_interactions: [{
      id: 'interaction-1',
      account_id: 'account-1',
      question: 'The business is locked. What should I do?',
      normalized_question: 'the business is locked what should i do',
      interpretation_mode: 'LEARNED_ROUTE',
      interpretation_result: { memory_route_key: routeKey },
      created_at: '2026-08-28T17:00:00.000Z'
    }],
    accounts: [{ id: 'account-1', company_name: 'Bridge Transportation' }]
  };
  const supabase = { from: (table) => new QueryBuilder(table, rows) };
  const service = { loadKnowledgeRecords: async () => [] };
  const app = express();
  app.use('/staff/driver-help', createManagerDriverHelpRouter({
    supabase,
    service,
    globalOverview: true,
    now: () => new Date('2026-08-28T18:00:00.000Z')
  }));

  const response = await request(app).get('/staff/driver-help/answer-memory');

  assert.equal(response.status, 200);
  assert.equal(response.body.routes[0].company_count, 1);
  assert.equal(response.body.routes[0].latest_company_name, 'Bridge Transportation');
  assert.equal(response.body.routes[0].latest_question, 'The business is locked. What should I do?');
  assert.match(response.body.routes[0].review_reason, /production AI audit disagreed/);
});

test('POST /manager/driver-help/query accepts a one-character vehicle number follow-up', async () => {
  const calls = [];
  const service = {
    async answerQuestion(input) {
      calls.push(input);
      return { response_mode: 'ANSWER', answer_type: 'VEHICLE_BARCODE' };
    }
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.account = { account_id: 'account-1', manager_user_id: 'manager-1' };
    next();
  });
  app.use('/manager/driver-help', createManagerDriverHelpRouter({
    supabase: { from: () => new QueryBuilder('unused', {}) },
    service
  }));

  const response = await request(app)
    .post('/manager/driver-help/query')
    .send({ question: '7', session_id: 'session-1' });

  assert.equal(response.status, 200);
  assert.equal(calls[0].question, '7');
  assert.equal(calls[0].sessionId, 'session-1');
});

test('POST staff driver-help query uses the shared answer service without customer persistence', async () => {
  const calls = [];
  const service = {
    async answerQuestion(input) {
      calls.push(input);
      return {
        interaction_id: null,
        session_id: 'staff-test-session',
        session_context: { situation_question: input.question },
        test_mode: true,
        response_mode: 'ANSWER',
        answer: 'Use the published Ready Route answer.'
      };
    }
  };
  const app = express();
  app.use(express.json());
  app.use('/staff/driver-help', createManagerDriverHelpRouter({
    supabase: { from: () => new QueryBuilder('unused', {}) },
    service,
    globalOverview: true,
    getRequestContext: () => ({
      accountId: null,
      actorType: 'manager',
      actorId: '00000000-0000-0000-0000-000000000099',
      persist: false
    })
  }));

  const response = await request(app)
    .post('/staff/driver-help/query')
    .send({
      question: 'What should a driver do?',
      session_context: { previous_question: 'Earlier test wording' }
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.test_mode, true);
  assert.deepEqual(calls[0], {
    accountId: null,
    driverId: null,
    actorType: 'manager',
    actorId: '00000000-0000-0000-0000-000000000099',
    question: 'What should a driver do?',
    sessionId: null,
    persist: false,
    sessionContext: { previous_question: 'Earlier test wording' },
    includeDiagnostics: true,
    aiInterpretationModeOverride: 'ACTIVE'
  });
});
