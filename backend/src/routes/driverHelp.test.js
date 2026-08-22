const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');

const { createDriverHelpRouter } = require('./driverHelp');

function createTestApp(service, options = {}) {
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
  app.use('/driver-help', createDriverHelpRouter({ service, ...options }));
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

test('POST /driver-help/query returns the company CXPC number without AI interpretation', async () => {
  const inserts = [];
  const supabase = {
    from(table) {
      if (table === 'accounts') {
        return {
          select() { return this; },
          eq() { return this; },
          async maybeSingle() {
            return {
              data: {
                rra_cxpc_phone_number: '555-0101',
                rra_csa_phone_number: '555-0102',
                rra_primary_manager_name: 'Taylor Owner',
                rra_primary_manager_phone_number: '555-0100'
              },
              error: null
            };
          }
        };
      }
      if (table === 'driver_help_interactions') {
        return {
          insert(payload) { inserts.push(payload); return this; },
          select() { return this; },
          async single() { return { data: { id: 'interaction-contact-1' }, error: null }; }
        };
      }
      if (table === 'driver_help_ai_consents') {
        return {
          select() { return this; },
          eq() { return this; },
          async maybeSingle() { return { data: null, error: null }; }
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }
  };
  const app = createTestApp({
    async answerQuestion() {
      throw new Error('Operational retrieval should not be called for a local contact lookup.');
    }
  }, { supabase });

  const response = await request(app)
    .post('/driver-help/query')
    .send({ question: 'What is my local CXPC phone number?' });

  assert.equal(response.status, 200);
  assert.equal(response.body.response_mode, 'ANSWER');
  assert.match(response.body.answer, /555-0101/);
  assert.equal(response.body.interpretation_mode, 'DETERMINISTIC');
  assert.equal(inserts[0].response_mode, 'ANSWER');
});

test('GET /driver-help/quick-actions returns the authenticated company contacts', async () => {
  const supabase = {
    from(table) {
      assert.equal(table, 'accounts');
      return {
        select() { return this; },
        eq() { return this; },
        async maybeSingle() {
          return { data: {
            rra_cxpc_phone_number: '8008888888',
            rra_primary_manager_name: 'Vlad Fed',
            rra_primary_manager_phone_number: '6199990000'
          }, error: null };
        }
      };
    }
  };
  const response = await request(createTestApp({}, { supabase })).get('/driver-help/quick-actions');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.quick_actions, {
    cxpc: { phone: '8008888888' },
    manager: { name: 'Vlad Fed', phone: '6199990000' }
  });
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
