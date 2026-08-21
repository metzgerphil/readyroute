async function sendResendEmail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    return {
      delivered: false,
      skipped: true,
      reason: 'Email service is not configured'
    };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html
    })
  });

  if (!response.ok) {
    const bodyText = await response.text();
    const error = new Error(`Resend invite email failed: ${response.status} ${bodyText}`);
    error.status = response.status;
    throw error;
  }

  const payload = await response.json();

  return {
    delivered: true,
    skipped: false,
    provider_id: payload?.id || null
  };
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const DEFAULT_IOS_APP_URL = 'https://apps.apple.com/us/app/ready-route/id6762488881';

function getHttpsUrl(value, fallback = '') {
  const candidate = String(value || fallback || '').trim();
  if (!candidate) return '';

  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' ? url.toString() : '';
  } catch (_error) {
    return '';
  }
}

async function sendManagerInviteEmail({
  to,
  fullName,
  inviteUrl,
  companyName,
  inviterName
}) {
  const safeInviteeName = String(fullName || '').trim() || 'there';
  const safeCompanyName = String(companyName || 'ReadyRoute').trim();
  const safeInviterName = String(inviterName || 'A ReadyRoute admin').trim();

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#173042;">
      <h2 style="margin-bottom:12px;">You're invited to ${safeCompanyName} on ReadyRoute</h2>
      <p>Hi ${safeInviteeName},</p>
      <p>${safeInviterName} invited you to join the ReadyRoute manager portal for ${safeCompanyName}.</p>
      <p>Use the button below to set your password and activate your manager access.</p>
      <p style="margin:24px 0;">
        <a href="${inviteUrl}" style="background:#ff7a1a;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:700;display:inline-block;">
          Set your manager password
        </a>
      </p>
      <p>If the button does not work, open this link:</p>
      <p><a href="${inviteUrl}">${inviteUrl}</a></p>
      <p>This invite link expires automatically for safety.</p>
    </div>
  `;

  return sendResendEmail({
    to,
    subject: `You're invited to ${safeCompanyName} on ReadyRoute`,
    html
  });
}

async function sendRraCompanyReadyEmail({
  to,
  fullName,
  companyName,
  accessUrl,
  needsPassword = true
}) {
  const companyLabel = String(companyName || 'your company').trim();
  const safeName = escapeHtml(String(fullName || '').trim() || 'there');
  const safeCompanyName = escapeHtml(companyLabel);
  const safeAccessUrl = String(accessUrl || 'https://readyroute.org/portal').trim();
  const action = needsPassword ? 'Create password and sign in' : 'Sign in to company portal';
  const accessCopy = needsPassword
    ? 'Create your private password, then sign in to your Ready Route Answers company portal.'
    : 'Your existing ReadyRoute password now opens this company in the Ready Route Answers company portal.';

  return sendResendEmail({
    to,
    subject: `Your Ready Route Answers portal is ready for ${companyLabel}`,
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#173042;">
        <div style="color:#ff6200;font-size:14px;font-weight:800;letter-spacing:1px;text-transform:uppercase;">Ready Route Answers</div>
        <h2 style="margin:10px 0 12px;">Your company portal is ready</h2>
        <p>Hi ${safeName},</p>
        <p>Payment information was received securely by Stripe and the Ready Route Answers workspace for <strong>${safeCompanyName}</strong> is ready.</p>
        <p>${accessCopy}</p>
        <p style="margin:24px 0;">
          <a href="${safeAccessUrl}" style="background:#ff6200;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:700;display:inline-block;">${action}</a>
        </p>
        <p>From the company portal, you can add authorized drivers and send each driver their private app invitation.</p>
        <p>If the button does not work, open this link:</p>
        <p><a href="${safeAccessUrl}">${safeAccessUrl}</a></p>
        ${needsPassword ? '<p>This secure setup link expires automatically.</p>' : ''}
        <p>Questions? Email <a href="mailto:info@readyroute.org">info@readyroute.org</a>.</p>
      </div>
    `
  });
}

async function sendManagerPasswordResetEmail({
  to,
  fullName,
  resetUrl,
  companyName
}) {
  const safeManagerName = String(fullName || '').trim() || 'there';
  const safeCompanyName = String(companyName || 'your team').trim();

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#173042;">
      <h2 style="margin-bottom:12px;">Reset your ReadyRoute manager password</h2>
      <p>Hi ${safeManagerName},</p>
      <p>We received a request to reset the manager password for ${safeCompanyName}.</p>
      <p>Use the button below to choose a new password.</p>
      <p style="margin:24px 0;">
        <a href="${resetUrl}" style="background:#ff7a1a;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:700;display:inline-block;">
          Reset manager password
        </a>
      </p>
      <p>If the button does not work, open this link:</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>This reset link expires automatically for safety.</p>
      <p>If you did not request this, you can ignore this email.</p>
    </div>
  `;

  return sendResendEmail({
    to,
    subject: 'Reset your ReadyRoute manager password',
    html
  });
}

async function sendDriverInviteEmail({ to, fullName, inviteUrl, companyName }) {
  const companyLabel = String(companyName || 'your company').trim();
  const inviteLink = getHttpsUrl(inviteUrl);
  if (!inviteLink) {
    throw new Error('A secure HTTPS driver invitation URL is required');
  }
  const safeName = escapeHtml(String(fullName || '').trim() || 'there');
  const safeCompanyName = escapeHtml(companyLabel);
  const safeLoginEmail = escapeHtml(String(to || '').trim().toLowerCase());
  const safeInviteUrl = escapeHtml(inviteLink);
  const iosAppUrl = escapeHtml(getHttpsUrl(process.env.RRA_IOS_APP_URL, DEFAULT_IOS_APP_URL));
  const androidAppUrl = escapeHtml(getHttpsUrl(process.env.RRA_ANDROID_APP_URL));
  const androidDownload = androidAppUrl
    ? `
      <a href="${androidAppUrl}" style="background:#173042;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:700;display:inline-block;margin:0 8px 8px 0;">
        Download for Android
      </a>
    `
    : '<p style="margin:8px 0;color:#5f6f7a;">Android download: coming soon.</p>';
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#173042;">
      <div style="color:#ff6200;font-size:14px;font-weight:800;letter-spacing:1px;text-transform:uppercase;">Ready Route Answers</div>
      <h2 style="margin:10px 0 12px;">Your ReadyRoute driver access is ready</h2>
      <p>Hi ${safeName},</p>
      <p>${safeCompanyName} created a ReadyRoute driver account for you.</p>
      <p><strong>Your login email:</strong> ${safeLoginEmail}</p>
      <p><strong>1. Choose your private sign-in.</strong> Use a quick 4-digit driver PIN or a full password. This secure link is only for you and expires automatically.</p>
      <p style="margin:24px 0;">
        <a href="${safeInviteUrl}" style="background:#ff6200;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:700;display:inline-block;">
          Set up my driver access
        </a>
      </p>
      <p><strong>2. Download ReadyRoute on your phone.</strong></p>
      <p style="margin:16px 0;">
        <a href="${iosAppUrl}" style="background:#173042;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:700;display:inline-block;margin:0 8px 8px 0;">
          Download for iPhone
        </a>
        ${androidDownload}
      </p>
      <p><strong>3. Sign in</strong> with the login email above and the PIN or password you created.</p>
      <p>Only one phone can use this driver account at a time. Signing in on a new phone signs the previous phone out.</p>
      <p>If the setup button does not work, open this link:</p>
      <p><a href="${safeInviteUrl}">${safeInviteUrl}</a></p>
      <p>This single invitation email contains everything you need to get started. Do not forward it or share your PIN or password.</p>
    </div>
  `;
  return sendResendEmail({
    to,
    subject: `${companyLabel} invited you to ReadyRoute`,
    html
  });
}

async function sendDriverPasswordResetEmail({ to, fullName, resetUrl, companyName }) {
  const safeName = String(fullName || '').trim() || 'there';
  const safeCompanyName = String(companyName || 'your company').trim();
  return sendResendEmail({
    to,
    subject: 'Reset your ReadyRoute driver access',
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#173042;">
        <h2>Reset your ReadyRoute driver access</h2>
        <p>Hi ${safeName},</p>
        <p>${safeCompanyName} prepared a secure reset link for your driver account.</p>
        <p><a href="${resetUrl}">Choose a new 4-digit PIN or full password</a></p>
        <p>This single-use link expires in 30 minutes. Ignore it if you did not request the reset.</p>
      </div>
    `
  });
}

module.exports = {
  sendResendEmail,
  sendDriverInviteEmail,
  sendDriverPasswordResetEmail,
  sendManagerInviteEmail,
  sendRraCompanyReadyEmail,
  sendManagerPasswordResetEmail
};
