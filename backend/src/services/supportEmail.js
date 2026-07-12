const SUPPORT_NOTIFY_EMAIL =
  process.env.READYROUTE_SUPPORT_NOTIFY_EMAIL ||
  process.env.SUPPORT_NOTIFY_EMAIL ||
  'info@readyroute.org';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatField(label, value) {
  const safeValue = String(value || '').trim() || 'Not provided';
  return `<tr><td style="padding:7px 0;color:#637586;font-weight:700;width:150px;">${escapeHtml(label)}</td><td style="padding:7px 0;color:#102536;">${escapeHtml(safeValue)}</td></tr>`;
}

function buildSupportTicketNotificationEmail({ ticket = {} } = {}) {
  const reference = ticket.ticket_reference || ticket.id || 'new ticket';
  const requester = ticket.requester_name || ticket.requester_email || 'ReadyRoute user';
  const subject = `ReadyRoute support ticket ${reference}: ${ticket.subject || ticket.category || 'New request'}`;
  const contextText = ticket.context ? JSON.stringify(ticket.context, null, 2) : '';
  const text = `New ReadyRoute support ticket

Reference: ${reference}
Requester: ${requester}
Email: ${ticket.requester_email || 'Not provided'}
Phone: ${ticket.requester_phone || 'Not provided'}
Company: ${ticket.company_name || 'Not provided'}
Role: ${ticket.requester_role || ticket.requester_type || 'Not provided'}
Category: ${ticket.category || 'other'}
Urgency: ${ticket.urgency || 'normal'}
Request call: ${ticket.request_call ? 'Yes' : 'No'}
Surface: ${ticket.app_surface || ticket.source || 'Unknown'}
Page/screen: ${ticket.page_url || 'Unknown'}

Description:
${String(ticket.description || '').trim()}

Context:
${contextText || 'None'}`;

  const html = `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${escapeHtml(subject)}</title>
      </head>
      <body style="margin:0;background:#f6f9fc;color:#102536;font-family:Arial,Helvetica,sans-serif;">
        <main style="max-width:720px;margin:0 auto;padding:28px 18px;">
          <section style="background:#ffffff;border:1px solid #dce6ee;border-radius:18px;padding:24px;">
            <p style="margin:0 0 8px;color:#ff6b1a;font-size:12px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;">ReadyRoute Support</p>
            <h1 style="margin:0 0 22px;color:#172f42;font-size:25px;line-height:1.25;">${escapeHtml(ticket.subject || 'New support request')}</h1>
            <table style="width:100%;border-collapse:collapse;margin-bottom:22px;">
              ${formatField('Reference', reference)}
              ${formatField('Requester', requester)}
              ${formatField('Email', ticket.requester_email)}
              ${formatField('Phone', ticket.requester_phone)}
              ${formatField('Company', ticket.company_name)}
              ${formatField('Role', ticket.requester_role || ticket.requester_type)}
              ${formatField('Category', ticket.category)}
              ${formatField('Urgency', ticket.urgency)}
              ${formatField('Request call', ticket.request_call ? 'Yes' : 'No')}
              ${formatField('Surface', ticket.app_surface || ticket.source)}
              ${formatField('Page/screen', ticket.page_url)}
            </table>
            <div style="border-top:1px solid #dce6ee;padding-top:18px;">
              <p style="margin:0 0 8px;color:#637586;font-weight:800;">Description</p>
              <p style="margin:0;color:#102536;font-size:16px;line-height:1.65;white-space:pre-wrap;">${escapeHtml(ticket.description)}</p>
            </div>
            ${contextText ? `
              <div style="border-top:1px solid #dce6ee;margin-top:18px;padding-top:18px;">
                <p style="margin:0 0 8px;color:#637586;font-weight:800;">Context</p>
                <pre style="margin:0;background:#f6f9fc;border:1px solid #e2ebf3;border-radius:12px;color:#102536;font-size:13px;line-height:1.5;overflow:auto;padding:14px;white-space:pre-wrap;">${escapeHtml(contextText)}</pre>
              </div>
            ` : ''}
          </section>
        </main>
      </body>
    </html>
  `;

  return { subject, text, html };
}

async function sendSupportTicketNotification({
  ticket,
  fetchImpl = fetch
} = {}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || 'ReadyRoute <info@readyroute.org>';

  if (!apiKey) {
    return {
      delivered: false,
      skipped: true,
      reason: 'Resend API key is not configured',
      provider_id: null
    };
  }

  const message = buildSupportTicketNotificationEmail({ ticket });
  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: [SUPPORT_NOTIFY_EMAIL],
      reply_to: ticket?.requester_email || undefined,
      subject: message.subject,
      text: message.text,
      html: message.html
    })
  });

  if (!response.ok) {
    const bodyText = await response.text();
    const error = new Error(`Resend support ticket notification failed: ${response.status} ${bodyText}`);
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

async function sendSupportReplyNotification({
  ticket,
  message,
  staffName,
  fetchImpl = fetch
} = {}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || 'ReadyRoute <info@readyroute.org>';
  const recipient = String(ticket?.requester_email || '').trim();

  if (!apiKey || !recipient) {
    return {
      delivered: false,
      skipped: true,
      reason: !apiKey ? 'Resend API key is not configured' : 'Requester email is unavailable',
      provider_id: null
    };
  }

  const reference = ticket.ticket_reference || ticket.id || 'support ticket';
  const replyBody = String(message?.body || '').trim();
  const subject = `ReadyRoute support reply: ${reference}`;
  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: [recipient],
      reply_to: SUPPORT_NOTIFY_EMAIL,
      subject,
      text: `ReadyRoute replied to ${reference}\n\n${replyBody}\n\nOpen ReadyRoute support if you still need help.`,
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#173042;">
          <p style="color:#ff6b1a;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">ReadyRoute Support</p>
          <h2 style="margin:0 0 16px;">Reply to ${escapeHtml(reference)}</h2>
          <p>Hi ${escapeHtml(ticket.requester_name || 'there')},</p>
          <div style="background:#f6f9fc;border:1px solid #dce6ee;border-radius:12px;padding:16px;white-space:pre-wrap;">${escapeHtml(replyBody)}</div>
          <p style="color:#637586;">${escapeHtml(staffName || 'ReadyRoute Support')}</p>
          <p>Open ReadyRoute support if you still need help.</p>
        </div>
      `
    })
  });

  if (!response.ok) {
    const bodyText = await response.text();
    const error = new Error(`Resend support reply notification failed: ${response.status} ${bodyText}`);
    error.status = response.status;
    throw error;
  }

  const payload = await response.json();
  return { delivered: true, skipped: false, provider_id: payload?.id || null };
}

async function sendSupportAssignmentNotification({
  ticket,
  staffUser,
  fetchImpl = fetch
} = {}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || 'ReadyRoute <info@readyroute.org>';
  const recipient = String(staffUser?.email || '').trim();

  if (!apiKey || !recipient) {
    return { delivered: false, skipped: true, provider_id: null };
  }

  const reference = ticket.ticket_reference || ticket.id || 'support ticket';
  const staffPortalUrl = `${String(process.env.MANAGER_PORTAL_URL || 'https://portal.readyroute.org').replace(/\/$/, '')}/readyroute/support`;
  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [recipient],
      subject: `ReadyRoute ticket assigned: ${reference}`,
      text: `You were assigned ${reference}: ${ticket.subject || ticket.description || 'Support request'}\n\n${staffPortalUrl}`,
      html: `<p>You were assigned <strong>${escapeHtml(reference)}</strong>.</p><p>${escapeHtml(ticket.subject || ticket.description || 'Support request')}</p><p><a href="${escapeHtml(staffPortalUrl)}">Open Support Desk</a></p>`
    })
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`Resend support assignment notification failed: ${response.status} ${bodyText}`);
  }

  const payload = await response.json();
  return { delivered: true, skipped: false, provider_id: payload?.id || null };
}

module.exports = {
  SUPPORT_NOTIFY_EMAIL,
  buildSupportTicketNotificationEmail,
  sendSupportAssignmentNotification,
  sendSupportReplyNotification,
  sendSupportTicketNotification
};
