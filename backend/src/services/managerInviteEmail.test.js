const test = require('node:test');
const assert = require('node:assert/strict');

const { sendDriverInviteEmail } = require('./managerInviteEmail');

test('driver invitation sends one complete onboarding email', async (t) => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.RESEND_FROM_EMAIL;
  const originalIosUrl = process.env.RRA_IOS_APP_URL;
  const originalAndroidUrl = process.env.RRA_ANDROID_APP_URL;
  const requests = [];

  process.env.RESEND_API_KEY = 'test-api-key';
  process.env.RESEND_FROM_EMAIL = 'ReadyRoute <info@readyroute.org>';
  delete process.env.RRA_IOS_APP_URL;
  delete process.env.RRA_ANDROID_APP_URL;
  global.fetch = async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      async json() {
        return { id: 'email-1' };
      }
    };
  };

  t.after(() => {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalApiKey;
    if (originalFrom === undefined) delete process.env.RESEND_FROM_EMAIL;
    else process.env.RESEND_FROM_EMAIL = originalFrom;
    if (originalIosUrl === undefined) delete process.env.RRA_IOS_APP_URL;
    else process.env.RRA_IOS_APP_URL = originalIosUrl;
    if (originalAndroidUrl === undefined) delete process.env.RRA_ANDROID_APP_URL;
    else process.env.RRA_ANDROID_APP_URL = originalAndroidUrl;
  });

  const result = await sendDriverInviteEmail({
    to: 'Driver.One@Example.com',
    fullName: 'Driver One',
    companyName: 'Bridge & Transit',
    inviteUrl: 'https://portal.readyroute.org/driver-invite?token=secure-token'
  });

  assert.equal(result.delivered, true);
  assert.equal(requests.length, 1);
  const body = JSON.parse(requests[0].options.body);
  assert.equal(body.to[0], 'Driver.One@Example.com');
  assert.equal(body.subject, 'Bridge & Transit invited you to ReadyRoute');
  assert.match(body.html, /Your login email:<\/strong> driver\.one@example\.com/);
  assert.match(body.html, /Create my password/);
  assert.match(body.html, /https:\/\/apps\.apple\.com\/us\/app\/ready-route\/id6762488881/);
  assert.match(body.html, /Android download: coming soon/);
  assert.match(body.html, /Signing in on a new phone signs the previous phone out/);
});

test('driver invitation includes Android only when a secure public link is configured', async (t) => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.RESEND_FROM_EMAIL;
  const originalAndroidUrl = process.env.RRA_ANDROID_APP_URL;
  let emailBody;

  process.env.RESEND_API_KEY = 'test-api-key';
  process.env.RESEND_FROM_EMAIL = 'info@readyroute.org';
  process.env.RRA_ANDROID_APP_URL = 'https://play.google.com/store/apps/details?id=com.readyroute.driverapp';
  global.fetch = async (_url, options) => {
    emailBody = JSON.parse(options.body);
    return { ok: true, async json() { return { id: 'email-2' }; } };
  };

  t.after(() => {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalApiKey;
    if (originalFrom === undefined) delete process.env.RESEND_FROM_EMAIL;
    else process.env.RESEND_FROM_EMAIL = originalFrom;
    if (originalAndroidUrl === undefined) delete process.env.RRA_ANDROID_APP_URL;
    else process.env.RRA_ANDROID_APP_URL = originalAndroidUrl;
  });

  await sendDriverInviteEmail({
    to: 'driver@example.com',
    fullName: 'Driver',
    companyName: 'PV Delivery',
    inviteUrl: 'https://portal.readyroute.org/driver-invite?token=secure-token'
  });

  assert.match(emailBody.html, /Download for Android/);
  assert.match(emailBody.html, /play\.google\.com\/store\/apps\/details\?id=com\.readyroute\.driverapp/);
  assert.doesNotMatch(emailBody.html, /Android download: coming soon/);
});
