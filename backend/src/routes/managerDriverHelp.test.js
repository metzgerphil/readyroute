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
      { id: '1', response_mode: 'ANSWER', selected_knowledge_ids: ['KNO-1'], response_latency_ms: 100, canonical_trace: [{ category_paths: ['TAX-DELIVERY'] }] },
      { id: '2', response_mode: 'ESCALATE', selected_knowledge_ids: [], response_latency_ms: 200 },
      { id: '3', response_mode: 'CLARIFY', selected_knowledge_ids: [], response_latency_ms: 300 }
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
    questions_by_category: { 'TAX-DELIVERY': 1, UNMATCHED: 2 }
  });
  assert.equal(response.body.unanswered_questions.length, 1);
});
