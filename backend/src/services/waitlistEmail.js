const READYROUTE_FROM_EMAIL = 'ReadyRoute <info@readyroute.org>';
const READYROUTE_REPLY_TO_EMAIL = 'info@readyroute.org';
const READYROUTE_FEEDBACK_TO_EMAIL = 'info@readyroute.org';
const WAITLIST_THANK_YOU_SUBJECT = 'Thanks for joining the ReadyRoute early access list';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getFirstName(name) {
  const trimmed = String(name || '').trim();

  if (!trimmed) {
    return null;
  }

  return trimmed.split(/\s+/)[0] || null;
}

function buildWaitlistGreeting(name) {
  const firstName = getFirstName(name);
  return firstName ? `Hi ${firstName},` : 'Hi,';
}

function buildWaitlistThankYouEmail({ name } = {}) {
  const greeting = buildWaitlistGreeting(name);

  const text = `${greeting}

Thanks for joining the ReadyRoute early access list.

We're building ReadyRoute because we understand the daily pressure contractors carry. Routes need to be organized, drivers need clear information, managers need better visibility, and the tools contractors rely on should not add more strain to already tight margins.

ReadyRoute is being built by people who know those realities firsthand. Our goal is simple: create a practical, affordable routing platform that helps contractors stay organized, support their drivers, and run smoother daily operations.

As we continue building the MVP, early access members will receive product updates, preview opportunities, and the chance to help shape the features that matter most to real operators.

We're glad you're here, and we'll keep you posted as ReadyRoute gets closer to launch.

Thanks again,

The ReadyRoute Team
info@readyroute.org`;

  const html = `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${escapeHtml(WAITLIST_THANK_YOU_SUBJECT)}</title>
      </head>
      <body style="margin:0;background:#ffffff;color:#10293d;font-family:Arial,Helvetica,sans-serif;">
        <div style="display:none;max-height:0;overflow:hidden;color:transparent;">
          Thanks for joining the ReadyRoute early access list.
        </div>
        <main style="max-width:640px;margin:0 auto;padding:32px 22px 28px;">
          <header style="border-bottom:3px solid #f97316;padding-bottom:18px;margin-bottom:26px;">
            <p style="margin:0;color:#f97316;font-size:13px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;">ReadyRoute</p>
            <h1 style="margin:8px 0 0;color:#10293d;font-size:26px;line-height:1.2;">Thanks for joining early access</h1>
          </header>

          <section style="font-size:16px;line-height:1.65;color:#173042;">
            <p style="margin:0 0 18px;">${escapeHtml(greeting)}</p>
            <p style="margin:0 0 18px;">Thanks for joining the ReadyRoute early access list.</p>
            <p style="margin:0 0 18px;">We're building ReadyRoute because we understand the daily pressure contractors carry. Routes need to be organized, drivers need clear information, managers need better visibility, and the tools contractors rely on should not add more strain to already tight margins.</p>
            <p style="margin:0 0 18px;">ReadyRoute is being built by people who know those realities firsthand. Our goal is simple: create a practical, affordable routing platform that helps contractors stay organized, support their drivers, and run smoother daily operations.</p>
            <p style="margin:0 0 18px;">As we continue building the MVP, early access members will receive product updates, preview opportunities, and the chance to help shape the features that matter most to real operators.</p>
            <p style="margin:0 0 22px;">We're glad you're here, and we'll keep you posted as ReadyRoute gets closer to launch.</p>
            <p style="margin:0;">Thanks again,</p>
            <p style="margin:0;font-weight:700;">The ReadyRoute Team</p>
          </section>

          <footer style="margin-top:34px;padding-top:18px;border-top:1px solid #e3ebf2;color:#6b7a89;font-size:14px;line-height:1.5;">
            <p style="margin:0;">ReadyRoute</p>
            <p style="margin:4px 0 0;"><a href="mailto:info@readyroute.org" style="color:#f97316;text-decoration:none;">info@readyroute.org</a></p>
          </footer>
        </main>
      </body>
    </html>
  `;

  return {
    subject: WAITLIST_THANK_YOU_SUBJECT,
    text,
    html
  };
}

async function sendWaitlistThankYouEmail({
  to,
  name,
  fetchImpl = fetch
} = {}) {
  const apiKey = process.env.RESEND_API_KEY;
  const email = String(to || '').trim().toLowerCase();

  if (!apiKey) {
    return {
      delivered: false,
      skipped: true,
      reason: 'Resend API key is not configured',
      provider_id: null
    };
  }

  if (!email) {
    throw new Error('Waitlist thank you email recipient is required.');
  }

  const message = buildWaitlistThankYouEmail({ name });
  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: READYROUTE_FROM_EMAIL,
      to: [email],
      reply_to: READYROUTE_REPLY_TO_EMAIL,
      subject: message.subject,
      text: message.text,
      html: message.html
    })
  });

  if (!response.ok) {
    const bodyText = await response.text();
    const error = new Error(`Resend waitlist email failed: ${response.status} ${bodyText}`);
    error.status = response.status;
    throw error;
  }

  const payload = await response.json();
  const providerId = payload?.id || null;

  return {
    delivered: true,
    skipped: false,
    provider_id: providerId,
    resend_email_id: providerId
  };
}

function buildFeedbackEmail({
  name,
  email,
  fedexPosition,
  feedback,
  sourcePage,
  userAgent
} = {}) {
  const subjectName = String(name || '').trim() || 'ReadyRoute visitor';
  const subject = `ReadyRoute MVP feedback from ${subjectName}`;
  const text = `New ReadyRoute MVP feedback

Name: ${String(name || '').trim()}
Email: ${String(email || '').trim()}
Position with FedEx: ${String(fedexPosition || '').trim()}
Source page: ${String(sourcePage || '').trim() || 'Unknown'}
User agent: ${String(userAgent || '').trim() || 'Unknown'}

Feedback:
${String(feedback || '').trim()}`;

  const html = `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${escapeHtml(subject)}</title>
      </head>
      <body style="margin:0;background:#f6f9fc;color:#102536;font-family:Arial,Helvetica,sans-serif;">
        <main style="max-width:680px;margin:0 auto;padding:28px 18px;">
          <section style="background:#ffffff;border:1px solid #dce6ee;border-radius:18px;padding:24px;">
            <p style="margin:0 0 8px;color:#ff6b1a;font-size:12px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;">ReadyRoute MVP Feedback</p>
            <h1 style="margin:0 0 22px;color:#172f42;font-size:26px;line-height:1.2;">${escapeHtml(subject)}</h1>
            <table style="width:100%;border-collapse:collapse;margin-bottom:22px;">
              <tr><td style="padding:8px 0;color:#637586;font-weight:700;width:170px;">Name</td><td style="padding:8px 0;color:#102536;font-weight:700;">${escapeHtml(name)}</td></tr>
              <tr><td style="padding:8px 0;color:#637586;font-weight:700;">Email</td><td style="padding:8px 0;color:#102536;font-weight:700;">${escapeHtml(email)}</td></tr>
              <tr><td style="padding:8px 0;color:#637586;font-weight:700;">Position with FedEx</td><td style="padding:8px 0;color:#102536;font-weight:700;">${escapeHtml(fedexPosition)}</td></tr>
              <tr><td style="padding:8px 0;color:#637586;font-weight:700;">Source page</td><td style="padding:8px 0;color:#102536;">${escapeHtml(sourcePage || 'Unknown')}</td></tr>
            </table>
            <div style="border-top:1px solid #dce6ee;padding-top:18px;">
              <p style="margin:0 0 8px;color:#637586;font-weight:800;">Feedback</p>
              <p style="margin:0;color:#102536;font-size:16px;line-height:1.65;white-space:pre-wrap;">${escapeHtml(feedback)}</p>
            </div>
          </section>
        </main>
      </body>
    </html>
  `;

  return { subject, text, html };
}

async function sendFeedbackEmail({
  name,
  email,
  fedexPosition,
  feedback,
  sourcePage,
  userAgent,
  fetchImpl = fetch
} = {}) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return {
      delivered: false,
      skipped: true,
      reason: 'Resend API key is not configured',
      provider_id: null
    };
  }

  const message = buildFeedbackEmail({ name, email, fedexPosition, feedback, sourcePage, userAgent });
  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL || READYROUTE_FROM_EMAIL,
      to: [READYROUTE_FEEDBACK_TO_EMAIL],
      reply_to: email,
      subject: message.subject,
      text: message.text,
      html: message.html
    })
  });

  if (!response.ok) {
    const bodyText = await response.text();
    const error = new Error(`Resend feedback email failed: ${response.status} ${bodyText}`);
    error.status = response.status;
    throw error;
  }

  const payload = await response.json();
  const providerId = payload?.id || null;

  return {
    delivered: true,
    skipped: false,
    provider_id: providerId,
    resend_email_id: providerId
  };
}

module.exports = {
  READYROUTE_FROM_EMAIL,
  READYROUTE_FEEDBACK_TO_EMAIL,
  READYROUTE_REPLY_TO_EMAIL,
  WAITLIST_THANK_YOU_SUBJECT,
  buildFeedbackEmail,
  buildWaitlistGreeting,
  buildWaitlistThankYouEmail,
  sendFeedbackEmail,
  sendWaitlistThankYouEmail
};
