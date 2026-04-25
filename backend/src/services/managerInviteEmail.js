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

module.exports = {
  sendManagerInviteEmail,
  sendManagerPasswordResetEmail
};
