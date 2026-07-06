function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendReadyRouteStaffPasswordResetEmail({
  to,
  fullName,
  resetUrl,
  fetchImpl = fetch
} = {}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    return {
      delivered: false,
      skipped: true,
      reason: 'Email service is not configured',
      provider_id: null
    };
  }

  const safeName = String(fullName || '').trim() || 'there';
  const safeResetUrl = String(resetUrl || '').trim();
  const subject = 'Reset your ReadyRoute staff password';
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#173042;">
      <h2 style="margin-bottom:12px;">Reset your ReadyRoute staff password</h2>
      <p>Hi ${escapeHtml(safeName)},</p>
      <p>We received a request to reset your ReadyRoute internal staff password.</p>
      <p>Use the button below to choose a new password.</p>
      <p style="margin:24px 0;">
        <a href="${escapeHtml(safeResetUrl)}" style="background:#ff7a1a;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:700;display:inline-block;">
          Reset staff password
        </a>
      </p>
      <p>If the button does not work, open this link:</p>
      <p><a href="${escapeHtml(safeResetUrl)}">${escapeHtml(safeResetUrl)}</a></p>
      <p>This reset link expires automatically for safety.</p>
      <p>If you did not request this, you can ignore this email.</p>
    </div>
  `;

  const response = await fetchImpl('https://api.resend.com/emails', {
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
    const error = new Error(`Resend staff password reset email failed: ${response.status} ${bodyText}`);
    error.status = response.status;
    throw error;
  }

  const payload = await response.json();
  const providerId = payload?.id || null;

  return {
    delivered: true,
    skipped: false,
    provider_id: providerId
  };
}

async function sendReadyRouteStaffInviteEmail({
  to,
  fullName,
  inviteUrl,
  inviterName,
  role,
  fetchImpl = fetch
} = {}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    return {
      delivered: false,
      skipped: true,
      reason: 'Email service is not configured',
      provider_id: null
    };
  }

  const safeName = String(fullName || '').trim() || 'there';
  const safeInviterName = String(inviterName || 'A ReadyRoute owner').trim();
  const safeRole = String(role || 'support').replace(/_/g, ' ');
  const safeInviteUrl = String(inviteUrl || '').trim();
  const subject = 'You are invited to ReadyRoute staff';
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#173042;">
      <h2 style="margin-bottom:12px;">You are invited to ReadyRoute staff</h2>
      <p>Hi ${escapeHtml(safeName)},</p>
      <p>${escapeHtml(safeInviterName)} invited you to join the ReadyRoute internal staff console as ${escapeHtml(safeRole)}.</p>
      <p>Use the button below to set your password and activate your staff access.</p>
      <p style="margin:24px 0;">
        <a href="${escapeHtml(safeInviteUrl)}" style="background:#ff7a1a;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:700;display:inline-block;">
          Accept staff invite
        </a>
      </p>
      <p>If the button does not work, open this link:</p>
      <p><a href="${escapeHtml(safeInviteUrl)}">${escapeHtml(safeInviteUrl)}</a></p>
      <p>This invite link expires automatically for safety.</p>
    </div>
  `;

  const response = await fetchImpl('https://api.resend.com/emails', {
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
    const error = new Error(`Resend staff invite email failed: ${response.status} ${bodyText}`);
    error.status = response.status;
    throw error;
  }

  const payload = await response.json();
  const providerId = payload?.id || null;

  return {
    delivered: true,
    skipped: false,
    provider_id: providerId
  };
}

module.exports = {
  sendReadyRouteStaffInviteEmail,
  sendReadyRouteStaffPasswordResetEmail
};
