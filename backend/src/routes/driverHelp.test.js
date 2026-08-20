const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');

const { createDriverHelpRouter } = require('./driverHelp');

function createTestApp(service) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.driver = {
      account_id: 'account-1',
      driver_id: 'driver-1',
      role: 'driver'
    };
    next();
  });
  app.use('/driver-help', createDriverHelpRouter({ service }));
  return app;
}

test('POST /driver-help/query passes authenticated account and driver scope to the service', async () => {
  const calls = [];
  const app = createTestApp({
    async answerQuestion(payload) {
      calls.push(payload);
      return {
        session_id: 'session-1',
        interaction_id: 'interaction-1',
        response_mode: 'ANSWER',
        answer: 'Use the approved procedure.',
        more_info: null,
        clarification_options: [],
        trace: [{ knowledge_id: 'KNO-1', version: 3 }]
      };
    }
  });

  const response = await request(app)
    .post('/driver-help/query')
    .send({ question: 'Signature package nobody home.', session_id: 'session-1' });

  assert.equal(response.status, 200);
  assert.equal(response.body.response_mode, 'ANSWER');
  assert.deepEqual(calls, [{
    accountId: 'account-1',
    driverId: 'driver-1',
    actorId: 'driver-1',
    actorType: 'driver',
    question: 'Signature package nobody home.',
    sessionId: 'session-1',
    allowAiProcessing: true
  }]);
});

test('POST /driver-help/query rejects empty and oversized questions', async () => {
  const app = createTestApp({ answerQuestion: async () => ({}) });
  assert.equal((await request(app).post('/driver-help/query').send({ question: ' ' })).status, 400);
  assert.equal((await request(app).post('/driver-help/query').send({ question: 'x'.repeat(501) })).status, 400);
});

test('POST /driver-help/query accepts a one-character vehicle number follow-up', async () => {
  const calls = [];
  const app = createTestApp({
    async answerQuestion(payload) {
      calls.push(payload);
      return { response_mode: 'ANSWER', answer_type: 'VEHICLE_BARCODE' };
    }
  });

  const response = await request(app)
    .post('/driver-help/query')
    .send({ question: '7', session_id: 'vehicle-session' });

  assert.equal(response.status, 200);
  assert.equal(calls[0].question, '7');
  assert.equal(calls[0].sessionId, 'vehicle-session');
});

test('POST /driver-help/interactions/:id/feedback validates and saves driver feedback', async () => {
  const calls = [];
  const app = createTestApp({
    async saveFeedback(payload) {
      calls.push(payload);
      return payload;
    }
  });

  const response = await request(app)
    .post('/driver-help/interactions/interaction-1/feedback')
    .send({ rating: 'down', comment: 'This did not match the package.' });

  assert.equal(response.status, 200);
  assert.equal(response.body.feedback.rating, 'down');
  assert.deepEqual(calls[0], {
    accountId: 'account-1',
    driverId: 'driver-1',
    actorId: 'driver-1',
    actorType: 'driver',
    interactionId: 'interaction-1',
    rating: 'down',
    comment: 'This did not match the package.'
  });
});

test('manager driver-mode activity is identified as a manager preview', async () => {
  const calls = [];
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.driver = {
      account_id: 'account-1',
      driver_id: 'manager-1',
      auth_subject_id: 'manager-1',
      driver_mode_source: 'manager',
      role: 'driver'
    };
    next();
  });
  app.use('/driver-help', createDriverHelpRouter({
    service: {
      async answerQuestion(payload) {
        calls.push(payload);
        return { response_mode: 'ESCALATE', trace: [], clarification_options: [] };
      }
    }
  }));

  const response = await request(app)
    .post('/driver-help/query')
    .send({ question: 'Preview this question' });

  assert.equal(response.status, 200);
  assert.equal(calls[0].actorType, 'manager');
  assert.equal(calls[0].actorId, 'manager-1');
});
