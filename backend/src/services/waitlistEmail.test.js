const test = require('node:test');
const assert = require('node:assert/strict');

const {
  READYROUTE_FROM_EMAIL,
  READYROUTE_FEEDBACK_TO_EMAIL,
  READYROUTE_REPLY_TO_EMAIL,
  WAITLIST_THANK_YOU_SUBJECT,
  buildFeedbackEmail,
  buildWaitlistGreeting,
  buildWaitlistThankYouEmail,
  sendFeedbackEmail,
  sendWaitlistThankYouEmail
} = require('./waitlistEmail');

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

test('buildWaitlistThankYouEmail personalizes the plain text greeting', () => {
  const message = buildWaitlistThankYouEmail({ name: 'Phillip Metzger' });

  assert.equal(message.subject, WAITLIST_THANK_YOU_SUBJECT);
  assert.match(message.text, /^Hi Phillip,/);
  assert.match(message.text, /Thanks for joining the ReadyRoute early access list\./);
  assert.match(message.html, /ReadyRoute/);
  assert.match(message.html, /info@readyroute\.org/);
});

test('buildWaitlistGreeting falls back to a generic greeting', () => {
  assert.equal(buildWaitlistGreeting(''), 'Hi,');
  assert.match(buildWaitlistThankYouEmail({}).text, /^Hi,/);
});

test('sendWaitlistThankYouEmail sends through Resend without exposing browser credentials', async () => {
  const originalApiKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = 'resend-test-key';

  let request;
  const response = await sendWaitlistThankYouEmail({
    to: 'PHIL@example.com',
    name: 'Phillip Metzger',
    fetchImpl: async (url, options) => {
      request = {
        url,
        options,
        payload: JSON.parse(options.body)
      };

      return {
        ok: true,
        async json() {
          return { id: 'email_123' };
        }
      };
    }
  });

  restoreEnv('RESEND_API_KEY', originalApiKey);

  assert.equal(request.url, 'https://api.resend.com/emails');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers.Authorization, 'Bearer resend-test-key');
  assert.equal(request.payload.from, READYROUTE_FROM_EMAIL);
  assert.deepEqual(request.payload.to, ['phil@example.com']);
  assert.equal(request.payload.reply_to, READYROUTE_REPLY_TO_EMAIL);
  assert.equal(request.payload.subject, WAITLIST_THANK_YOU_SUBJECT);
  assert.match(request.payload.text, /^Hi Phillip,/);
  assert.match(request.payload.html, /ReadyRoute/);
  assert.equal(response.delivered, true);
  assert.equal(response.provider_id, 'email_123');
  assert.equal(response.resend_email_id, 'email_123');
});

test('sendWaitlistThankYouEmail skips safely when Resend is not configured', async () => {
  const originalApiKey = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;

  const response = await sendWaitlistThankYouEmail({
    to: 'phil@example.com',
    fetchImpl: async () => {
      throw new Error('Fetch should not be called without RESEND_API_KEY');
    }
  });

  restoreEnv('RESEND_API_KEY', originalApiKey);

  assert.equal(response.delivered, false);
  assert.equal(response.skipped, true);
  assert.equal(response.provider_id, null);
});

test('buildFeedbackEmail formats ReadyRoute MVP feedback for the team', () => {
  const message = buildFeedbackEmail({
    name: 'Taylor Driver',
    email: 'taylor@example.com',
    fedexPosition: 'FedEx BC',
    feedback: 'Apartment sorting would help our morning dispatch.',
    sourcePage: 'https://www.readyroute.org/mvp',
    userAgent: 'test-agent'
  });

  assert.equal(message.subject, 'ReadyRoute MVP feedback from Taylor Driver');
  assert.match(message.text, /Position with FedEx: FedEx BC/);
  assert.match(message.text, /Apartment sorting/);
  assert.match(message.html, /ReadyRoute MVP Feedback/);
});

test('sendFeedbackEmail sends feedback to ReadyRoute with the submitter as reply-to', async () => {
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalFromEmail = process.env.RESEND_FROM_EMAIL;
  process.env.RESEND_API_KEY = 'resend-test-key';
  process.env.RESEND_FROM_EMAIL = 'ReadyRoute <info@readyroute.org>';

  let request;
  const response = await sendFeedbackEmail({
    name: 'Taylor Driver',
    email: 'TAYLOR@example.com',
    fedexPosition: 'FedEx BC',
    feedback: 'Apartment sorting would help our morning dispatch.',
    fetchImpl: async (url, options) => {
      request = {
        url,
        options,
        payload: JSON.parse(options.body)
      };

      return {
        ok: true,
        async json() {
          return { id: 'email_feedback_123' };
        }
      };
    }
  });

  restoreEnv('RESEND_API_KEY', originalApiKey);
  restoreEnv('RESEND_FROM_EMAIL', originalFromEmail);

  assert.equal(request.url, 'https://api.resend.com/emails');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers.Authorization, 'Bearer resend-test-key');
  assert.deepEqual(request.payload.to, [READYROUTE_FEEDBACK_TO_EMAIL]);
  assert.equal(request.payload.reply_to, 'TAYLOR@example.com');
  assert.match(request.payload.subject, /Taylor Driver/);
  assert.match(request.payload.text, /Apartment sorting/);
  assert.equal(response.delivered, true);
  assert.equal(response.provider_id, 'email_feedback_123');
});
