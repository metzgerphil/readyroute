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
}

test('GET /manager/driver-help/overview returns scoped operational-help metrics', async () => {
  const rows = {
    driver_help_interactions: [
      { id: '1', response_mode: 'ANSWER' },
      { id: '2', response_mode: 'ESCALATE' },
      { id: '3', response_mode: 'CLARIFY' }
    ],
    driver_help_unanswered_questions: [{ id: 'u1', status: 'open' }],
    driver_help_feedback: [{ id: 'f1', rating: 'down' }, { id: 'f2', rating: 'up' }]
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
    approved_answers: 1,
    clarifications: 1,
    escalations: 1,
    negative_feedback: 1
  });
  assert.equal(response.body.unanswered_questions.length, 1);
});
