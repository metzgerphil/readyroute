const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');

const { createManagerDriverHelpRouter } = require('./managerDriverHelp');

class QueryBuilder {
  constructor(table, rows) {
    this.table = table;
    this.rows = rows;
  }
  select() { return this; }
  eq() { return this; }
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
      { id: '3', response_mode: 'CLARIFY', selected_knowledge_ids: [], response_latency_ms: 300, interpretation_mode: 'AI_SHADOW_FALLBACK', interpretation_result: { status: 'ERROR' } }
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
    total_questions: 3,
    active_drivers: 2,
    questions_per_active_driver: 1.5,
    approved_answers: 1,
    clarifications: 1,
    escalations: 1,
    feedback_count: 2,
    helpful_feedback: 1,
    negative_feedback: 1,
    feedback_response_rate: 2 / 3,
    helpful_rate: 1 / 2,
    canonical_match_rate: 1 / 3,
    no_verified_answer_rate: 1 / 3,
    average_response_latency_ms: 200,
    retrieval_failures: 1,
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
    questions_by_category: { 'TAX-DELIVERY': 1, UNMATCHED: 2 }
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
