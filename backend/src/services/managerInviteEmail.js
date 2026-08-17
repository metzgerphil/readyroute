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
  const safeName = String(fullName || '').trim() || 'there';
  const safeCompanyName = String(companyName || 'your company').trim();
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#173042;">
      <h2>You're invited to ReadyRoute</h2>
      <p>Hi ${safeName},</p>
      <p>${safeCompanyName} created a ReadyRoute driver account for you.</p>
      <p>Open the secure link below to establish your own password. Do not share the link.</p>
      <p><a href="${inviteUrl}">Set your ReadyRoute driver password</a></p>
      <p>This single-use link expires automatically.</p>
    </div>
  `;
  return sendResendEmail({
    to,
    subject: `${safeCompanyName} invited you to ReadyRoute`,
    html
  });
}

async function sendDriverPasswordResetEmail({ to, fullName, resetUrl, companyName }) {
  const safeName = String(fullName || '').trim() || 'there';
  const safeCompanyName = String(companyName || 'your company').trim();
  return sendResendEmail({
    to,
    subject: 'Reset your ReadyRoute driver password',
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#173042;">
        <h2>Reset your ReadyRoute driver password</h2>
        <p>Hi ${safeName},</p>
        <p>${safeCompanyName} prepared a secure password-reset link for your driver account.</p>
        <p><a href="${resetUrl}">Choose a new ReadyRoute password</a></p>
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
