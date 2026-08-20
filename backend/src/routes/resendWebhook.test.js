const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');

const { createResendWebhookRouter } = require('./resendWebhook');

function createWebhookSupabase() {
  const state = {
    events: [],
    delivery: { id: 'delivery-1', last_event_at: '2026-08-20T12:00:00.000Z' },
    updates: []
  };
  return {
    state,
    from(table) {
      const query = {
        insert(payload) {
          state.events.push({ table, payload });
          return Promise.resolve({ error: null });
        },
        select() { return this; },
        eq() { return this; },
        async maybeSingle() { return { data: state.delivery, error: null }; },
        update(payload) {
          state.updates.push(payload);
          return { async eq() { return { error: null }; } };
        }
      };
      return query;
    }
  };
}

test('POST /webhooks/resend records a verified delivery event and updates its password email', async () => {
  const supabase = createWebhookSupabase();
  const app = express();
  app.use('/webhooks/resend', createResendWebhookRouter({
    supabase,
    webhookSecret: 'whsec_test',
    verifyWebhook: () => ({
      type: 'email.delivered',
      created_at: '2026-08-20T12:01:00.000Z',
      data: { email_id: 'resend-message-1' }
    })
  }));

  const response = await request(app)
    .post('/webhooks/resend')
    .set('Content-Type', 'application/json')
    .set('svix-id', 'event-1')
    .send({ type: 'ignored-by-test-verifier' });

  assert.equal(response.status, 200);
  assert.equal(response.body.received, true);
  assert.equal(supabase.state.events[0].payload.webhook_event_id, 'event-1');
  assert.equal(supabase.state.updates[0].delivery_status, 'delivered');
  assert.equal(supabase.state.updates[0].delivered_at, '2026-08-20T12:01:00.000Z');
});

test('POST /webhooks/resend rejects an invalid signature', async () => {
  const app = express();
  app.use('/webhooks/resend', createResendWebhookRouter({
    supabase: createWebhookSupabase(),
    webhookSecret: 'whsec_test',
    verifyWebhook: () => { throw new Error('invalid'); }
  }));
  const response = await request(app)
    .post('/webhooks/resend')
    .set('Content-Type', 'application/json')
    .send({});
  assert.equal(response.status, 400);
});
